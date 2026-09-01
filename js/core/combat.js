/* ============================================================
   combat.js — batailles, déroutes et occupation
   ------------------------------------------------------------
   Une bataille s'engage dès que deux puissances en guerre ont
   des troupes dans la même province. Elle se résout jour après
   jour : les pertes dépendent du rapport des puissances, et la
   MOTIVATION du camp qui souffre s'effrite jusqu'à la déroute.
   ============================================================ */

import { controleur, journaliser, alerter } from './etat.js';
import { sontEnGuerre } from './diplomatie.js';
import {
  armeesDans,
  dissoudre,
  ordonnerMarche,
  recompenserVictoire,
  majEffectif,
  SEUIL_DEROUTE,
} from './armees.js';
import { puissanceComposition, appliquerPertes, compositionVide, totalUnites } from '../data/unites.js';
import { avecArticle, genitif, prepositionDe } from '../data/langue.js';

/** Part de l'effectif perdue par jour à puissances égales. */
const TAUX_PERTES = 0.06;
/** Plafond de pertes quotidiennes, pour éviter les anéantissements instantanés. */
const PERTES_MAX = 0.28;
/** Jours de présence nécessaires pour occuper une province vidée de défenseurs. */
const DUREE_OCCUPATION = 12;
/** Jours sans garnison à portée avant qu'une province occupée ne se soulève. */
const DUREE_INSURRECTION = 30;

/** Bonus défensif du terrain. */
const DEFENSE_TERRAIN = {
  montagne: 1.35,
  foret: 1.2,
  jungle: 1.2,
  colline: 1.15,
  cote: 1.05,
  toundra: 1.1,
  plaine: 1.0,
  steppe: 1.0,
  desert: 1.05,
};

/**
 * Puissance d'un corps sur un champ de bataille donné, face à une
 * composition adverse : c'est là que joue le triangle des armes.
 * L'élan de doctrine agit ici sans jamais être affiché : c'est au joueur
 * de deviner, aux résultats, ce que valent ses troupes.
 */
export function puissance(etat, armee, territoire, defenseur, unitesAdverses = null) {
  const doctrine = etat.empires[armee.empire].doctrine;
  const motivation = 0.55 + (armee.motivation / 100) * 0.9;
  const terrain = defenseur && armee.domaine === 'terre' ? DEFENSE_TERRAIN[territoire.terrain] ?? 1 : 1;
  const discipline = defenseur ? doctrine.disciplineDefensive ?? 1 : 1;
  const face = unitesAdverses ?? compositionEquilibree(armee.domaine);
  return puissanceComposition(armee.unites, face) * (doctrine.elan ?? 1) * motivation * terrain * discipline;
}

/** Adversaire théorique, quand on évalue une force hors de tout combat. */
function compositionEquilibree(domaine) {
  const vide = compositionVide(domaine);
  for (const type of Object.keys(vide)) vide[type] = 1;
  return vide;
}

/** Somme des compositions d'un groupe de corps. */
function compositionCumulee(armees, domaine) {
  const total = compositionVide(domaine);
  for (const armee of armees) {
    for (const [type, nombre] of Object.entries(armee.unites)) total[type] = (total[type] ?? 0) + nombre;
  }
  return total;
}

/* ------------------------------------------------------------
   Résolution quotidienne
   ------------------------------------------------------------ */

export function appliquerJourCombat(etat) {
  etat.batailles = {};
  for (const armee of Object.values(etat.armees)) armee.enBataille = false;

  for (const id of etat.carte.ordre) {
    resoudreProvince(etat, etat.carte.territoires[id]);
  }
  for (const id of etat.carte.ordre) {
    avancerInsurrection(etat, etat.carte.territoires[id]);
  }
}

/**
 * Une occupation ne tient que par la force. Sans garnison sur place ni
 * corps à portée immédiate, la province finit par chasser l'occupant —
 * faute de quoi une puissance exsangue conserverait un empire fantôme.
 */
function avancerInsurrection(etat, territoire) {
  if (!territoire.occupant || territoire.occupant === territoire.maitre) {
    territoire.insurrection = 0;
    return;
  }
  const souverain = etat.empires[territoire.maitre];
  if (!souverain || souverain.souverainete === 0) {
    territoire.insurrection = 0;
    return;
  }

  const occupant = territoire.occupant;
  const tenue =
    armeesDans(etat, territoire.id).some((a) => a.empire === occupant) ||
    territoire.voisins.some((v) => armeesDans(etat, v).some((a) => a.empire === occupant));
  if (tenue) {
    territoire.insurrection = 0;
    return;
  }

  territoire.insurrection = (territoire.insurrection ?? 0) + 1;
  if (territoire.insurrection < DUREE_INSURRECTION) return;

  territoire.insurrection = 0;
  territoire.occupant = null;
  journaliser(
    etat,
    `<strong>${territoire.nom}</strong> se soulève et chasse la garnison ${genitif(etat.empires[occupant])}.`,
  );
  etat.economieARecalculer = true;
}

function resoudreProvince(etat, territoire) {
  const presentes = armeesDans(etat, territoire.id);
  if (presentes.length === 0) {
    territoire.occupationEnCours = null;
    return;
  }

  // Terre et mer se battent séparément : une escadre ne prend pas une province.
  let bataille = false;
  for (const domaine of ['terre', 'mer']) {
    const engagees = presentes.filter((a) => a.domaine === domaine);
    if (engagees.length < 2) continue;
    const camps = repartirEnCamps(etat, territoire, engagees, domaine);
    if (!camps) continue;
    bataille = true;
    livrerBataille(etat, territoire, camps, domaine);
  }

  if (bataille) {
    territoire.occupationEnCours = null;
    return;
  }
  avancerOccupation(etat, territoire, presentes.filter((a) => a.domaine === 'terre'));
}

/**
 * Sépare les armées présentes en deux camps.
 * Le défenseur est la puissance qui tient la province si elle est
 * là, sinon la plus nombreuse. Le camp adverse rassemble toutes
 * les puissances en guerre avec elle.
 * @returns {{defenseur: string, attaquants: string[], armeesD: object[], armeesA: object[]}|null}
 */
function repartirEnCamps(etat, territoire, presentes, domaine = 'terre') {
  const parEmpire = new Map();
  for (const armee of presentes) {
    if (!parEmpire.has(armee.empire)) parEmpire.set(armee.empire, []);
    parEmpire.get(armee.empire).push(armee);
  }
  if (parEmpire.size < 2) return null;

  // À la mer, nul ne « défend son sol » : le plus nombreux tient la position.
  const maitreDuSol = domaine === 'terre' ? controleur(territoire) : null;
  let defenseur = maitreDuSol && parEmpire.has(maitreDuSol) ? maitreDuSol : null;
  if (!defenseur) {
    let meilleur = -1;
    for (const [empire, armees] of parEmpire) {
      const total = armees.reduce((s, a) => s + a.effectif, 0);
      if (total > meilleur) {
        meilleur = total;
        defenseur = empire;
      }
    }
  }

  const attaquants = [...parEmpire.keys()].filter(
    (e) => e !== defenseur && sontEnGuerre(etat, e, defenseur),
  );
  if (attaquants.length === 0) return null;

  return {
    defenseur,
    attaquants,
    armeesD: parEmpire.get(defenseur),
    armeesA: attaquants.flatMap((e) => parEmpire.get(e)),
  };
}

function livrerBataille(etat, territoire, camps, domaine = 'terre') {
  const { armeesD, armeesA } = camps;
  for (const armee of [...armeesD, ...armeesA]) armee.enBataille = true;

  // Chaque camp évalue sa force au vu de ce que l'autre aligne.
  const compositionD = compositionCumulee(armeesD, domaine);
  const compositionA = compositionCumulee(armeesA, domaine);
  if (totalUnites(compositionD) <= 0 || totalUnites(compositionA) <= 0) return;

  const puissanceD = armeesD.reduce((s, a) => s + puissance(etat, a, territoire, true, compositionA), 0);
  const puissanceA = armeesA.reduce((s, a) => s + puissance(etat, a, territoire, false, compositionD), 0);
  if (puissanceD <= 0 || puissanceA <= 0) return;

  const partD = Math.min(PERTES_MAX, (TAUX_PERTES * puissanceA) / puissanceD);
  const partA = Math.min(PERTES_MAX, (TAUX_PERTES * puissanceD) / puissanceA);

  const effectifD = armeesD.reduce((s, a) => s + a.effectif, 0);
  const effectifA = armeesA.reduce((s, a) => s + a.effectif, 0);

  // Les pertes frappent d'abord les armes mal appariées à celles d'en face.
  for (const armee of armeesD) {
    appliquerPertes(armee.unites, partD, compositionA);
    majEffectif(armee);
  }
  for (const armee of armeesA) {
    appliquerPertes(armee.unites, partA, compositionD);
    majEffectif(armee);
  }

  // Le camp qui souffre le moins voit sa motivation monter, l'autre s'effrite.
  const total = partD + partA;
  const avantageD = total > 0 ? partA / total : 0.5;
  ajusterMotivation(etat, armeesD, (avantageD - 0.5) * 8);
  ajusterMotivation(etat, armeesA, (0.5 - avantageD) * 8);

  etat.batailles[territoire.id] = {
    domaine,
    defenseur: camps.defenseur,
    attaquants: camps.attaquants,
    effectifD,
    effectifA,
  };

  const rompusD = faireRompre(etat, territoire, armeesD);
  const rompusA = faireRompre(etat, territoire, armeesA);

  const resteD = armeesD.filter((a) => etat.armees[a.id] && a.lieu === territoire.id && !a.route);
  const resteA = armeesA.filter((a) => etat.armees[a.id] && a.lieu === territoire.id && !a.route);

  if (resteD.length === 0 && resteA.length > 0) {
    conclure(etat, territoire, resteA, camps.defenseur, effectifD - resteD.length, rompusD);
  } else if (resteA.length === 0 && resteD.length > 0) {
    conclure(etat, territoire, resteD, camps.attaquants[0], effectifA, rompusA);
  }
}

function ajusterMotivation(etat, armees, delta) {
  for (const armee of armees) {
    const doctrine = etat.empires[armee.empire].doctrine;
    const ajuste = delta >= 0 ? delta * (doctrine.gainMoralVictoire ?? 1) : delta / (doctrine.tenacite ?? 1);
    armee.motivation = Math.max(0, Math.min(100, armee.motivation + ajuste));
  }
}

/** Les corps démoralisés décrochent ; les corps anéantis disparaissent. */
function faireRompre(etat, territoire, armees) {
  let rompus = 0;
  for (const armee of armees) {
    majEffectif(armee);
    if (armee.effectif < 0.6) {
      dissoudre(etat, armee);
      continue;
    }
    if (armee.motivation > SEUIL_DEROUTE) continue;

    const refuge = trouverRefuge(etat, territoire, armee);
    if (refuge && ordonnerMarche(etat, armee, refuge)) {
      for (const type of Object.keys(armee.unites)) armee.unites[type] *= 0.9;
      majEffectif(armee);
      armee.motivation = Math.max(0, armee.motivation - 8);
      armee.enBataille = false;
      rompus += 1;
    } else {
      // Encerclé et sans courage : le corps se rend.
      dissoudre(etat, armee);
      rompus += 1;
    }
  }
  return rompus;
}

/** Province voisine où se replier : la sienne de préférence, sinon la moins hostile. */
function trouverRefuge(etat, territoire, armee) {
  // Une escadre ne se replie que par la mer.
  const sorties =
    armee.domaine === 'mer' ? territoire.voisinsMaritimes : territoire.voisins;
  const candidats = sorties
    .map((id) => etat.carte.territoires[id])
    .filter((t) => {
      const occupants = armeesDans(etat, t.id);
      return !occupants.some((a) => sontEnGuerre(etat, a.empire, armee.empire));
    });
  if (candidats.length === 0) return null;
  const amies = candidats.filter((t) => controleur(t) === armee.empire);
  const choix = amies.length ? amies : candidats;
  return choix[0].id;
}

function conclure(etat, territoire, vainqueurs, idVaincu, pertesAdverses, rompus) {
  const empireVainqueur = etat.empires[vainqueurs[0].empire];
  const empireVaincu = etat.empires[idVaincu];
  const ampleur = rompus > 0 ? 1 : 1.3; // anéantir vaut mieux que voir fuir

  for (const armee of vainqueurs) recompenserVictoire(etat, armee, ampleur);

  journaliser(
    etat,
    `Bataille ${prepositionDe(territoire.nom)}<strong>${territoire.nom}</strong> : les troupes ${genitif(empireVainqueur)} ` +
      `l'emportent sur celles ${genitif(empireVaincu)}.`,
  );

  signalerElanFrancais(etat, empireVainqueur, empireVaincu, territoire);
}

/**
 * L'avantage napoléonien ne s'affiche nulle part : il se devine.
 * Après une victoire française, les chancelleries s'interrogent.
 */
function signalerElanFrancais(etat, vainqueur, vaincu, territoire) {
  if ((vainqueur.doctrine.elan ?? 1) < 1.2) return;
  const cle = `elan-${vainqueur.id}`;
  if (vainqueur.estJoueur) {
    alerter(
      etat,
      cle,
      180,
      `Vos officiers rapportent de <strong>${territoire.nom}</strong> que vos colonnes ont enfoncé la ligne ennemie avec une vigueur qui les étonne eux-mêmes.`,
    );
  } else if (vaincu.estJoueur) {
    alerter(
      etat,
      cle,
      180,
      `Nos généraux ne s'expliquent pas l'allant des troupes ${genitif(vainqueur)} à <strong>${territoire.nom}</strong>.`,
    );
  }
}

/* ------------------------------------------------------------
   Occupation
   ------------------------------------------------------------ */

/** Une province tenue sans opposition finit par changer de mains. */
function avancerOccupation(etat, territoire, presentes) {
  const maitreDuSol = controleur(territoire);
  const occupantes = presentes.filter((a) => a.empire !== maitreDuSol);
  if (occupantes.length === 0) {
    territoire.occupationEnCours = null;
    return;
  }

  // La guerre doit opposer le prétendant à celui qui TIENT la province,
  // faute de quoi deux alliés se la reprennent indéfiniment l'un à l'autre.
  const pretendant = occupantes[0].empire;
  if (!sontEnGuerre(etat, pretendant, maitreDuSol)) {
    territoire.occupationEnCours = null;
    return;
  }

  if (territoire.occupationEnCours?.empire !== pretendant) {
    territoire.occupationEnCours = { empire: pretendant, restant: DUREE_OCCUPATION };
  }
  territoire.occupationEnCours.restant -= 1;
  if (territoire.occupationEnCours.restant > 0) return;

  territoire.occupationEnCours = null;
  const empire = etat.empires[pretendant];
  // L'envahisseur n'hérite ni des travaux ni des recrues du souverain.
  territoire.chantier = null;
  territoire.levee = null;

  if (pretendant === territoire.maitre) {
    territoire.occupant = null;
    journaliser(etat, `<strong>${territoire.nom}</strong> est libérée.`);
  } else {
    territoire.occupant = pretendant;
    journaliser(
      etat,
      `<strong>${territoire.nom}</strong> passe sous occupation militaire ${genitif(empire)}. ` +
        `L'annexion demandera un traité.`,
    );
  }
  etat.economieARecalculer = true;
}

export { avecArticle, genitif };
