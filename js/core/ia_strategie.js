/* ============================================================
   ia_strategie.js — les cabinets rivaux jouent pour gagner
   ------------------------------------------------------------
   Chaque puissance non jouée évalue périodiquement le rapport de
   forces, se fait une opinion de ses voisines, puis décide de
   s'allier, de déclarer la guerre ou de demander un armistice.

   Le ressort principal est l'équilibre européen : plus une
   puissance domine, plus les autres la détestent et se liguent.
   C'est ce qui fait naître les coalitions contre le joueur qui
   l'emporte — et contre la France, si elle l'emporte.
   ============================================================ */

import { controleur, journaliser, alerter } from './etat.js';
import {
  sontEnGuerre,
  sontAllies,
  sontVoisines,
  allies,
  ennemis,
  ennemisCommuns,
  opinion,
  ajusterOpinion,
  declarerGuerre,
  conclureAlliance,
  rompreAlliance,
  conclureArmistice,
  verserSubside,
  attenteSubside,
} from './diplomatie.js';
import { puissance as puissanceAuCombat } from './combat.js';
import {
  provincesNegociables,
  traiteVierge,
  valeurProvince,
  coutTermes,
  toleranceCession,
  evaluerTraite,
  appliquerTraite,
  lassitude,
} from './traites.js';
import { avecArticle } from '../data/langue.js';
import { revendicationsDe, revendicationsContre } from './revolte.js';

/** Une délibération tous les quinze jours par puissance. */
const PERIODE = 15;

/**
 * Une puissance fait figure d'hégémon lorsqu'elle dépasse la deuxième
 * de moitié. Un seuil en part du total ne marcherait pas : avec vingt-six
 * puissances, celle qui domine l'Europe ne pèse jamais qu'un sixième du monde.
 */
const RAPPORT_HEGEMONIE = 1.45;

/** Opinion en deçà de laquelle on envisage la guerre. */
const SEUIL_HOSTILITE = -20;
/** Opinion au-delà de laquelle on envisage l'alliance. */
const SEUIL_CONFIANCE = 22;

/** Rapport de forces minimal pour oser attaquer. */
const AUDACE = 1.3;

/** L'option « ardeur » du menu module l'agressivité des cabinets rivaux. */
const ARDEURS = {
  prudente: { audace: 1.6, proie: 0.45, repit: 400 },
  normale: { audace: AUDACE, proie: 0.6, repit: 270 },
  implacable: { audace: 1.05, proie: 0.8, repit: 150 },
};

function ardeur(etat) {
  return ARDEURS[etat.options?.agressivite] ?? ARDEURS.normale;
}

/** Jours de guerre avant qu'une paix de lassitude devienne envisageable. */
const GUERRE_MINIMALE = 200;
/**
 * Mais une campagne décisive se conclut sans attendre : quand l'adversaire
 * est déjà brisé, on signe. Sans ce raccourci, une guerre gagnée en trois
 * mois reste ouverte assez longtemps pour qu'une coalition se reforme, et
 * les victoires nettes ne rapportent rien.
 */
const GUERRE_MINIMALE_DECISIVE = 60;
const LASSITUDE_DECISIVE = 0.55;

/* ------------------------------------------------------------
   Évaluation du rapport de forces
   ------------------------------------------------------------ */

/**
 * Puissance stratégique d'un empire : terres, hommes, industrie, trésor.
 * @returns {Object<string, number>} score par empire
 */
export function evaluerPuissances(etat) {
  const scores = {};
  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant) continue;
    let score = 0;
    for (const id of empire.territoires) {
      const t = etat.carte.territoires[id];
      score += 3 + t.population * 2 + t.developpement * 1.5;
    }
    score += effectifTotal(etat, empire.id) * 0.35;
    score += empire.stocks.or / 150;
    scores[empire.id] = score;
  }
  return scores;
}

/** Part de chaque puissance dans le total, et identité de l'hégémon. */
function analyserEquilibre(etat) {
  const scores = evaluerPuissances(etat);
  const total = Object.values(scores).reduce((s, v) => s + v, 0) || 1;
  const parts = Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, v / total]));

  const classement = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [premier, second] = classement;
  const hegemon = premier && (!second || premier[1] > second[1] * RAPPORT_HEGEMONIE) ? premier[0] : null;

  return {
    scores,
    parts,
    hegemon,
    partHegemon: hegemon ? parts[hegemon] : 0,
    avance: premier && second ? premier[1] / Math.max(1, second[1]) : 1,
  };
}

function effectifTotal(etat, idEmpire) {
  return Object.values(etat.armees)
    .filter((a) => a.empire === idEmpire)
    .reduce((s, a) => s + a.effectif, 0);
}


/* ------------------------------------------------------------
   Délibération
   ------------------------------------------------------------ */

export function conduireDiplomatieBots(etat) {
  if (etat.jourEcoule % PERIODE !== 0) return;

  const equilibre = analyserEquilibre(etat);
  etat.equilibre = equilibre; // exposé à l'interface

  const puissances = Object.values(etat.empires).filter((e) => e.vivant);
  for (const empire of puissances) {
    majOpinions(etat, empire, puissances, equilibre);
  }
  // Les opinions de tout le monde sont à jour avant que quiconque décide.
  for (const empire of puissances) {
    if (empire.estJoueur) continue;
    deliberer(etat, empire, equilibre);
  }

  signalerCoalition(etat, equilibre);
}

/** Chaque puissance révise son jugement sur toutes les autres. */
function majOpinions(etat, empire, puissances, equilibre) {
  for (const autre of puissances) {
    if (autre.id === empire.id) continue;

    let cible = 0;

    // On se méfie de qui domine, d'autant plus qu'on est son voisin.
    if (equilibre.hegemon && autre.id === equilibre.hegemon) {
      cible -= 45 * Math.min(2, equilibre.avance / RAPPORT_HEGEMONIE);
      if (sontVoisines(etat, empire.id, autre.id)) cible -= 20;
    } else if (
      equilibre.hegemon &&
      empire.id !== equilibre.hegemon &&
      exposeA(etat, empire.id, equilibre.hegemon) &&
      exposeA(etat, autre.id, equilibre.hegemon)
    ) {
      // Ceux que le même voisin menace se rapprochent : c'est ainsi que
      // naissent les coalitions. Encore faut-il qu'ils soient menacés.
      cible += 14;
    }

    // Un ennemi de mon ennemi mérite considération.
    cible += 22 * ennemisCommuns(etat, empire.id, autre.id).length;

    // L'état des relations pèse de tout son poids.
    if (sontEnGuerre(etat, empire.id, autre.id)) cible -= 60;
    else if (sontAllies(etat, empire.id, autre.id)) cible += 45;

    // Un voisin plus fort inquiète ; un voisin plus faible tente.
    if (sontVoisines(etat, empire.id, autre.id)) {
      const rapport = (equilibre.scores[autre.id] ?? 1) / (equilibre.scores[empire.id] ?? 1);
      cible -= Math.max(-15, Math.min(25, (rapport - 1) * 25));
    }

    // Qui occupe nos provinces ne s'en fait pas pardonner.
    const occupees = etat.carte.ordre.filter(
      (id) =>
        etat.carte.territoires[id].maitre === empire.id &&
        etat.carte.territoires[id].occupant === autre.id,
    ).length;
    cible -= occupees * 18;

    // Ni qui tient des provinces qui se réclament de nous.
    cible -= revendicationsDe(etat, empire.id, autre.id).length * 16;

    cible = Math.max(-100, Math.min(100, cible));
    const courante = opinion(etat, empire.id, autre.id);
    ajusterOpinion(etat, empire.id, autre.id, Math.sign(cible - courante) * Math.min(Math.abs(cible - courante), 12));
  }
}

/** Une puissance décide de sa politique pour les quinze jours à venir. */
function deliberer(etat, empire, equilibre) {
  distribuerSubsides(etat, empire, equilibre);
  if (chercherPaix(etat, empire, equilibre)) return;
  if (chercherAlliance(etat, empire, equilibre)) return;
  chercherGuerre(etat, empire, equilibre);
}

/**
 * Un cabinet riche achète des amitiés : il paie ceux qui combattent déjà son
 * ennemi, ou ceux qu'il craint de voir se retourner. C'est ainsi que l'or
 * anglais a financé les coalitions.
 */
function distribuerSubsides(etat, empire, equilibre) {
  if (empire.stocks.or < empire.capacite * 0.45) return;
  const mesEnnemis = ennemis(etat, empire.id);

  const candidats = Object.values(etat.empires)
    .filter(
      (autre) =>
        autre.vivant &&
        autre.id !== empire.id &&
        !sontEnGuerre(etat, empire.id, autre.id) &&
        attenteSubside(etat, empire.id, autre.id) === 0 &&
        // Soit il combat déjà notre ennemi, soit c'est un voisin qu'il faut ménager.
        (mesEnnemis.some((e) => sontEnGuerre(etat, autre.id, e)) ||
          (autre.id === equilibre.hegemon && sontVoisines(etat, empire.id, autre.id))),
    )
    .sort((a, b) => opinion(etat, a.id, empire.id) - opinion(etat, b.id, empire.id));

  if (candidats.length) verserSubside(etat, empire.id, candidats[0].id);
}

/* ------------------------------------------------------------
   Armistice — savoir s'arrêter
   ------------------------------------------------------------ */

/**
 * Une guerre longue et perdue finit par lasser. Le camp qui a l'avantage
 * dicte ses conditions ; l'autre accepte s'il est à bout. Les provinces
 * cédées changent alors de souverain pour de bon.
 */
function chercherPaix(etat, empire, equilibre) {
  for (const idEnnemi of ennemis(etat, empire.id)) {
    const adversaire = etat.empires[idEnnemi];
    const mienne = lassitude(etat, empire, equilibre);
    const sienne = lassitude(etat, adversaire, equilibre);

    const decisive = Math.max(mienne, sienne) > LASSITUDE_DECISIVE;
    const attente = decisive ? GUERRE_MINIMALE_DECISIVE : GUERRE_MINIMALE;
    const debut = etat.debutsDeGuerre?.[cleGuerre(empire.id, idEnnemi)] ?? 0;
    if (etat.jourEcoule - debut < attente) continue;

    // Nul ne négocie tant que les deux camps se croient frais.
    if (mienne < 0.4 && sienne < 0.4) continue;

    // Celui qui souffre le moins et occupe le plus tient la plume.
    const mesGains = provincesOccupeesPar(etat, empire.id, idEnnemi);
    const sesGains = provincesOccupeesPar(etat, idEnnemi, empire.id);
    const jeDicte = mesGains > sesGains || (mesGains === sesGains && mienne < sienne);
    const demandeur = jeDicte ? empire.id : idEnnemi;
    const cible = jeDicte ? idEnnemi : empire.id;

    const traite = construireTraite(etat, demandeur, cible);

    if (etat.empires[cible].estJoueur || etat.empires[demandeur].estJoueur) {
      proposerPaixAuJoueur(etat, traite);
      continue;
    }
    const verdict = evaluerTraite(etat, traite);
    if (!verdict.accepte) continue;
    appliquerTraite(etat, traite);
    return true;
  }
  return false;
}

/**
 * Conditions les plus dures que le vaincu puisse encore avaler : on ajoute
 * les provinces occupées par ordre de valeur tant qu'il reste dans ses
 * limites, plutôt que de tout exiger et d'essuyer un refus.
 */
function construireTraite(etat, demandeur, cible) {
  const traite = traiteVierge(demandeur, cible);
  const { annexables, restituables } = provincesNegociables(etat, demandeur, cible);
  traite.restitutions = restituables;

  const tolerance = toleranceCession(etat, cible, demandeur);
  const candidates = annexables
    .map((id) => ({ id, valeur: valeurProvince(etat.carte.territoires[id]) }))
    .sort((a, b) => b.valeur - a.valeur);

  for (const { id } of candidates) {
    traite.annexions.push(id);
    if (coutTermes(etat, traite) > tolerance) traite.annexions.pop();
  }
  // Ce qui reste de marge se prend en or.
  const marge = tolerance - coutTermes(etat, traite);
  if (marge > 1) {
    traite.tribut = Math.min(
      Math.round(marge * 90),
      Math.round(etat.empires[cible].stocks.or * 0.4),
    );
  }
  return traite;
}

function provincesOccupeesPar(etat, occupant, victime) {
  return etat.carte.ordre.filter(
    (id) =>
      etat.carte.territoires[id].occupant === occupant &&
      etat.carte.territoires[id].maitre === victime,
  ).length;
}

const cleGuerre = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Le joueur reçoit les conditions dans son cabinet ; elles restent ouvertes un temps. */
function proposerPaixAuJoueur(etat, traite) {
  const cle = cleGuerre(traite.demandeur, traite.cible);
  if (etat.offresPaix[cle]) return;
  etat.offresPaix[cle] = { traite, expire: etat.jourEcoule + 120 };
  const autre = etat.empires[traite.cible].estJoueur ? traite.demandeur : traite.cible;
  journaliser(
    etat,
    `<strong>${etat.empires[autre].nom}</strong> fait porter des conditions de paix. ` +
      `Elles vous attendent dans le cabinet diplomatique.`,
  );
}

/* ------------------------------------------------------------
   Alliances — se liguer
   ------------------------------------------------------------ */

/** Une puissance est exposée à une autre si elle la touche ou la combat. */
function exposeA(etat, id, autre) {
  return sontVoisines(etat, id, autre) || sontEnGuerre(etat, id, autre);
}

function chercherAlliance(etat, empire, equilibre) {
  if (allies(etat, empire.id).length >= 2) return false;

  const candidats = Object.values(etat.empires)
    .filter(
      (autre) =>
        autre.vivant &&
        autre.id !== empire.id &&
        !sontAllies(etat, empire.id, autre.id) &&
        !sontEnGuerre(etat, empire.id, autre.id) &&
        opinion(etat, empire.id, autre.id) > SEUIL_CONFIANCE &&
        opinion(etat, autre.id, empire.id) > SEUIL_CONFIANCE &&
        allies(etat, autre.id).length < 2 &&
        // On ne s'allie qu'à un voisin ou à qui combat déjà notre ennemi :
        // une alliance entre puissances sans affaire commune n'a pas de sens.
        (sontVoisines(etat, empire.id, autre.id) ||
          ennemisCommuns(etat, empire.id, autre.id).length > 0) &&
        // Ni à qui traîne déjà plus de guerres que nous n'en pouvons porter.
        ennemis(etat, autre.id).length <= 1,
    )
    .sort(
      (a, b) =>
        opinion(etat, empire.id, b.id) + (equilibre.scores[b.id] ?? 0) / 40 -
        (opinion(etat, empire.id, a.id) + (equilibre.scores[a.id] ?? 0) / 40),
    );

  for (const candidat of candidats) {
    if (candidat.estJoueur) {
      proposerAllianceAuJoueur(etat, empire.id, candidat.id);
      return true;
    }
    // On ne s'allie pas à qui nous entraînerait dans une guerre perdue d'avance.
    const guerresApportees = ennemis(etat, candidat.id).filter(
      (e) => !sontEnGuerre(etat, empire.id, e),
    );
    const fardeau = guerresApportees.reduce((s, e) => s + (equilibre.scores[e] ?? 0), 0);
    if (fardeau > (equilibre.scores[empire.id] ?? 0) * 1.5) continue;

    return conclureAlliance(etat, empire.id, candidat.id);
  }

  // Une alliance devenue insupportable se rompt.
  for (const idAllie of allies(etat, empire.id)) {
    if (opinion(etat, empire.id, idAllie) < -25 && !etat.empires[idAllie].estJoueur) {
      return rompreAlliance(etat, empire.id, idAllie);
    }
  }
  return false;
}

function proposerAllianceAuJoueur(etat, demandeur, joueur) {
  const cle = cleGuerre(demandeur, joueur);
  if (etat.offresAlliance[cle]) return;
  etat.offresAlliance[cle] = { demandeur, expire: etat.jourEcoule + 90 };
  journaliser(
    etat,
    `<strong>${etat.empires[demandeur].nom}</strong> vous propose une alliance. ` +
      `Sa lettre vous attend dans le cabinet diplomatique.`,
  );
}

/* ------------------------------------------------------------
   Guerre — saisir l'occasion
   ------------------------------------------------------------ */

function chercherGuerre(etat, empire, equilibre) {
  // Une principauté d'une seule province a d'autres soucis que de conquérir.
  if (empire.territoires.length < 2) return false;
  const regle = ardeur(etat);
  if (etat.jourEcoule - (etat.dernieresGuerres[empire.id] ?? -regle.repit) < regle.repit) return false;
  const guerresEnCours = ennemis(etat, empire.id).length;

  const maPuissance =
    puissanceDisponible(etat, empire.id) +
    allies(etat, empire.id).reduce((s, a) => s + puissanceDisponible(etat, a) * 0.6, 0);
  const monScore = equilibre.scores[empire.id] ?? 1;

  const cibles = Object.values(etat.empires)
    .filter(
      (autre) =>
        autre.vivant &&
        autre.id !== empire.id &&
        !sontAllies(etat, empire.id, autre.id) &&
        !sontEnGuerre(etat, empire.id, autre.id) &&
        sontVoisines(etat, empire.id, autre.id),
    )
    .map((autre) => {
      const defense =
        puissanceDisponible(etat, autre.id) +
        allies(etat, autre.id).reduce((s, a) => s + puissanceDisponible(etat, a) * 0.6, 0);
      const score = equilibre.scores[autre.id] ?? 0;

      // Ceux qui combattent déjà la cible fixent une part de ses forces :
      // c'est ce qui rend une coalition possible là où nul n'ose seul.
      const renforts = Object.values(etat.empires)
        .filter((e) => e.vivant && e.id !== empire.id && sontEnGuerre(etat, e.id, autre.id))
        .reduce((s, e) => s + puissanceDisponible(etat, e.id) * 0.7, 0);

      // Contre celui qui menace de dominer l'Europe, on accepte un risque
      // qu'on ne prendrait pas ailleurs : c'est la raison d'être des coalitions.
      const contreHegemon =
        autre.id === equilibre.hegemon && opinion(etat, empire.id, autre.id) < -50;

      // Une province qui gronde et se réclame de nous vaut un casus belli.
      const revendiquees = revendicationsDe(etat, empire.id, autre.id).length;
      return {
        empire: autre,
        defense,
        revendiquees,
        contreHegemon,
        exigence: contreHegemon ? 0.7 : regle.audace,
        force: maPuissance + renforts,
        proie: score < monScore * regle.proie || revendiquees > 0,
        rancune: opinion(etat, empire.id, autre.id) < SEUIL_HOSTILITE,
        appat: (score / (defense + 1)) * (1 + revendiquees * 0.5),
      };
    })
    .filter(
      ({ defense, proie, rancune, exigence, force }) =>
        (proie || rancune) && force > defense * exigence,
    )
    .sort(
      (a, b) =>
        Number(b.contreHegemon) - Number(a.contreHegemon) ||
        b.revendiquees - a.revendiquees ||
        b.appat - a.appat,
    );

  if (cibles.length === 0) return false;
  const choix = cibles[0];

  // On ne mène pas deux guerres de front — sauf pour abattre l'hégémon,
  // qui vaut bien un troisième théâtre.
  const plafond = choix.contreHegemon ? 3 : 2;
  if (guerresEnCours >= plafond) return false;

  if (!declarerGuerre(etat, empire.id, choix.empire.id)) return false;
  etat.dernieresGuerres[empire.id] = etat.jourEcoule;
  return true;
}

/** Force militaire mobilisable, à sa valeur de combat. */
function puissanceDisponible(etat, idEmpire) {
  let total = 0;
  for (const armee of Object.values(etat.armees)) {
    if (armee.empire !== idEmpire || armee.domaine !== 'terre') continue;
    const lieu = etat.carte.territoires[armee.lieu];
    total += puissanceAuCombat(etat, armee, lieu, false);
  }
  return total;
}

/* ------------------------------------------------------------
   Signalement au joueur
   ------------------------------------------------------------ */

/** Quand la moitié de l'Europe se ligue contre une puissance, on le dit. */
function signalerCoalition(etat, equilibre) {
  const hegemon = equilibre.hegemon;
  if (!hegemon) return;
  const coalises = ennemis(etat, hegemon).filter((id) => etat.empires[id].vivant);
  if (coalises.length < 3) return;

  const nom = etat.empires[hegemon].estJoueur ? 'vous' : avecArticle(etat.empires[hegemon]);
  alerter(
    etat,
    `coalition-${hegemon}-${coalises.length}`,
    120,
    `Une coalition de ${coalises.length} puissances s'est formée contre ${nom}.`,
  );
}

/* ------------------------------------------------------------
   Réponses aux propositions du joueur
   ------------------------------------------------------------ */

/**
 * Une puissance répond à une offre d'alliance du joueur.
 * @returns {{accepte: boolean, motif: string}}
 */
export function repondreAlliance(etat, idBot, idJoueur) {
  const bot = etat.empires[idBot];
  if (sontEnGuerre(etat, idBot, idJoueur)) {
    return { accepte: false, motif: 'On ne s\'allie pas à qui l\'on combat.' };
  }
  if (sontAllies(etat, idBot, idJoueur)) {
    return { accepte: false, motif: 'Nous sommes déjà alliés.' };
  }
  if (allies(etat, idBot).length >= 2) {
    return { accepte: false, motif: 'Nos engagements sont déjà pris.' };
  }
  const estime = opinion(etat, idBot, idJoueur);
  if (estime < 10) {
    return { accepte: false, motif: 'La confiance n\'y est pas.' };
  }
  const equilibre = etat.equilibre ?? { hegemon: null, scores: {} };
  if (idJoueur === equilibre.hegemon && estime < 30) {
    return {
      accepte: false,
      motif: 'Nul ne veut servir de marchepied à une hégémonie — il y faudrait plus d\'égards.',
    };
  }
  // On soupèse les guerres que cette alliance nous apporterait.
  const fardeau = ennemis(etat, idJoueur)
    .filter((e) => !sontEnGuerre(etat, idBot, e))
    .reduce((s, e) => s + (equilibre.scores[e] ?? 0), 0);
  if (fardeau > (equilibre.scores[idBot] ?? 1) * 1.6) {
    return { accepte: false, motif: 'Vos guerres nous coûteraient trop cher.' };
  }
  conclureAlliance(etat, idBot, idJoueur);
  return { accepte: true, motif: `${bot.nom} accepte l'alliance.` };
}


/* ------------------------------------------------------------
   Suivi des dates de guerre
   ------------------------------------------------------------ */

/** Mémorise le premier jour de chaque guerre, pour mesurer la lassitude. */
export function suivreGuerres(etat) {
  if (!etat.debutsDeGuerre) etat.debutsDeGuerre = {};
  const enCours = new Set();
  for (const [paire, valeur] of Object.entries(etat.relations)) {
    if (valeur !== 'guerre') continue;
    enCours.add(paire);
    if (etat.debutsDeGuerre[paire] === undefined) etat.debutsDeGuerre[paire] = etat.jourEcoule;
  }
  for (const paire of Object.keys(etat.debutsDeGuerre)) {
    if (!enCours.has(paire)) delete etat.debutsDeGuerre[paire];
  }
}

/** Retire les offres restées sans réponse. */
export function expirerOffres(etat) {
  for (const registre of [etat.offresAlliance, etat.offresPaix]) {
    for (const [cle, offre] of Object.entries(registre)) {
      if (etat.jourEcoule > offre.expire) delete registre[cle];
    }
  }
}
