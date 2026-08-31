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
} from './diplomatie.js';
import { puissance as puissanceAuCombat } from './combat.js';
import { avecArticle } from '../data/langue.js';

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
/** En deçà de cette part de notre puissance, un voisin devient une proie. */
const PROIE = 0.6;
/** Jours de répit qu'une puissance s'accorde entre deux guerres qu'elle ouvre. */
const REPIT = 270;

/** Jours de guerre avant qu'un armistice devienne envisageable. */
const GUERRE_MINIMALE = 200;

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

    cible = Math.max(-100, Math.min(100, cible));
    const courante = opinion(etat, empire.id, autre.id);
    ajusterOpinion(etat, empire.id, autre.id, Math.sign(cible - courante) * Math.min(Math.abs(cible - courante), 12));
  }
}

/** Une puissance décide de sa politique pour les quinze jours à venir. */
function deliberer(etat, empire, equilibre) {
  if (chercherArmistice(etat, empire, equilibre)) return;
  if (chercherAlliance(etat, empire, equilibre)) return;
  chercherGuerre(etat, empire, equilibre);
}

/* ------------------------------------------------------------
   Armistice — savoir s'arrêter
   ------------------------------------------------------------ */

/**
 * Une guerre longue et perdue finit par lasser. On ne signe que si
 * l'adversaire est lui aussi épuisé, ou s'il a déjà obtenu gain de cause.
 */
function chercherArmistice(etat, empire, equilibre) {
  for (const idEnnemi of ennemis(etat, empire.id)) {
    const debut = etat.debutsDeGuerre?.[cleGuerre(empire.id, idEnnemi)] ?? 0;
    if (etat.jourEcoule - debut < GUERRE_MINIMALE) continue;

    const mienne = lassitude(etat, empire, equilibre);
    const sienne = lassitude(etat, etat.empires[idEnnemi], equilibre);
    if (mienne < 0.5) continue;

    // L'adversaire accepte s'il est lui aussi à bout, ou s'il a déjà gagné.
    const adversaireSatisfait = sienne > 0.4 || provincesOccupeesPar(etat, idEnnemi, empire.id) > 0;
    if (!adversaireSatisfait) continue;

    if (etat.empires[idEnnemi].estJoueur) {
      // On ne signe pas à la place du joueur : on lui propose.
      proposerArmisticeAuJoueur(etat, empire.id, idEnnemi);
      continue;
    }
    conclureArmistice(etat, empire.id, idEnnemi);
    return true;
  }
  return false;
}

/** De 0 (frais) à 1 (exsangue). */
function lassitude(etat, empire, equilibre) {
  const hommes = effectifTotal(etat, empire.id);
  const potentiel = Math.max(10, empire.reservesMax);
  let score = 0;
  score += Math.max(0, 1 - hommes / potentiel) * 0.5;
  score += empire.penuries.or ? 0.25 : 0;
  const perdues = etat.carte.ordre.filter(
    (id) => etat.carte.territoires[id].maitre === empire.id && etat.carte.territoires[id].occupant,
  ).length;
  score += Math.min(0.4, perdues * 0.12);
  if ((equilibre.parts[empire.id] ?? 0) < 0.03) score += 0.2;
  return Math.min(1, score);
}

function provincesOccupeesPar(etat, occupant, victime) {
  return etat.carte.ordre.filter(
    (id) =>
      etat.carte.territoires[id].occupant === occupant &&
      etat.carte.territoires[id].maitre === victime,
  ).length;
}

const cleGuerre = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Le joueur reçoit l'offre dans son journal ; elle reste ouverte un temps. */
function proposerArmisticeAuJoueur(etat, demandeur, joueur) {
  const cle = cleGuerre(demandeur, joueur);
  if (etat.offresArmistice[cle]) return;
  etat.offresArmistice[cle] = { demandeur, expire: etat.jourEcoule + 90 };
  journaliser(
    etat,
    `<strong>${etat.empires[demandeur].nom}</strong> propose un armistice. ` +
      `Sa réponse vous attend dans le cabinet diplomatique.`,
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
  if (etat.jourEcoule - (etat.dernieresGuerres[empire.id] ?? -REPIT) < REPIT) return false;
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

      return {
        empire: autre,
        defense,
        contreHegemon,
        exigence: contreHegemon ? 0.7 : AUDACE,
        force: maPuissance + renforts,
        proie: score < monScore * PROIE,
        rancune: opinion(etat, empire.id, autre.id) < SEUIL_HOSTILITE,
        appat: score / (defense + 1),
      };
    })
    .filter(
      ({ defense, proie, rancune, exigence, force }) =>
        (proie || rancune) && force > defense * exigence,
    )
    .sort((a, b) => Number(b.contreHegemon) - Number(a.contreHegemon) || b.appat - a.appat);

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
    if (armee.empire !== idEmpire) continue;
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
  if (idJoueur === equilibre.hegemon && estime < 45) {
    return { accepte: false, motif: 'Nul ne veut servir de marchepied à une hégémonie.' };
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

/** Une puissance répond à une offre d'armistice du joueur. */
export function repondreArmistice(etat, idBot, idJoueur) {
  if (!sontEnGuerre(etat, idBot, idJoueur)) {
    return { accepte: false, motif: 'Nous ne sommes pas en guerre.' };
  }
  const debut = etat.debutsDeGuerre?.[cleGuerre(idBot, idJoueur)] ?? 0;
  if (etat.jourEcoule - debut < 60) {
    return { accepte: false, motif: 'La guerre vient à peine de commencer.' };
  }
  const equilibre = etat.equilibre ?? { parts: {}, scores: {} };
  const bot = etat.empires[idBot];
  const usure = lassitude(etat, bot, equilibre);
  const gains = provincesOccupeesPar(etat, idBot, idJoueur);
  const pertes = provincesOccupeesPar(etat, idJoueur, idBot);

  if (usure > 0.45 || pertes > gains) {
    conclureArmistice(etat, idBot, idJoueur);
    return { accepte: true, motif: `${bot.nom} accepte l'armistice.` };
  }
  if (gains > 0 && usure > 0.25) {
    conclureArmistice(etat, idBot, idJoueur);
    return { accepte: true, motif: `${bot.nom} se satisfait de ses gains et accepte.` };
  }
  return { accepte: false, motif: 'L\'ennemi se croit encore en mesure de vaincre.' };
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
  for (const registre of [etat.offresAlliance, etat.offresArmistice]) {
    for (const [cle, offre] of Object.entries(registre)) {
      if (etat.jourEcoule > offre.expire) delete registre[cle];
    }
  }
}
