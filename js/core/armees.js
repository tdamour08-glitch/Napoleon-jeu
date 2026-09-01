/* ============================================================
   armees.js — levée, marche, entretien et motivation des corps
   ------------------------------------------------------------
   Un corps n'est plus un bloc d'hommes : c'est une COMPOSITION
   d'armes — infanterie, cavalerie, artillerie à terre ;
   vaisseaux de ligne et frégates à la mer. Sa vitesse est celle
   de son élément le plus lent, sa force dépend de ce qu'il a en
   face (cf. data/unites.js), et son entretien de ce qu'il aligne.

   Sa MOTIVATION monte avec les victoires et tombe avec les
   défaites, les longues marches en pays ennemi et les pénuries.
   ============================================================ */

import { controleur, journaliser } from './etat.js';
import { avecArticle } from '../data/langue.js';
import { effetsPolitiques } from './politiques.js';
import {
  UNITES,
  TAILLE_REGIMENT,
  RESERVES_REGIMENT,
  compositionVide,
  totalUnites,
  vitesseComposition,
  entretienComposition,
  typesDuDomaine,
} from '../data/unites.js';

/** Au-delà de ce total, deux corps ne fusionnent plus d'eux-mêmes. */
export const TAILLE_MAX_CORPS = 60;

/** Effectif en deçà duquel un corps est dissous. */
const EFFECTIF_MINIMAL = 0.6;

/** Motivation sous laquelle un corps engagé rompt le combat. */
export const SEUIL_DEROUTE = 22;

const MOTIVATION_MAX = 100;

/* ------------------------------------------------------------
   Création et comptage
   ------------------------------------------------------------ */

/** Recalcule l'effectif total d'un corps depuis sa composition. */
export function majEffectif(armee) {
  armee.effectif = totalUnites(armee.unites);
  return armee.effectif;
}

/**
 * Crée un corps, ou renforce un corps ami déjà sur place s'il reste
 * sous le plafond de concentration.
 */
export function creerArmee(etat, idEmpire, idTerritoire, unites, domaine = 'terre') {
  const empire = etat.empires[idEmpire];
  const apport = totalUnites(unites);

  const accueillant = armeesDans(etat, idTerritoire).find(
    (a) => a.empire === idEmpire && a.domaine === domaine && a.effectif + apport <= TAILLE_MAX_CORPS,
  );
  if (accueillant) {
    fusionnerDans(accueillant, { unites, motivation: empire.doctrine.moralInitial, effectif: apport });
    return accueillant;
  }

  const armee = {
    id: `a${etat.prochainIdArmee++}`,
    empire: idEmpire,
    domaine,
    unites: { ...compositionVide(domaine), ...unites },
    effectif: 0,
    motivation: empire.doctrine.moralInitial,
    lieu: idTerritoire,
    route: null,
    enBataille: false,
    joursImmobile: 0,
  };
  majEffectif(armee);
  etat.armees[armee.id] = armee;
  return armee;
}

export function dissoudre(etat, armee) {
  delete etat.armees[armee.id];
  if (etat.selectionArmee === armee.id) etat.selectionArmee = null;
}

/** Corps à l'arrêt présents dans une province. */
export function armeesDans(etat, idTerritoire) {
  return Object.values(etat.armees).filter((a) => a.lieu === idTerritoire && !a.route);
}

/** Corps d'une puissance donnée dans une province. */
export function armeesDe(etat, idEmpire, idTerritoire) {
  return armeesDans(etat, idTerritoire).filter((a) => a.empire === idEmpire);
}

/** Verse un apport dans un corps ; la motivation suit les effectifs. */
function fusionnerDans(cible, apport) {
  const total = cible.effectif + apport.effectif;
  if (total > 0) {
    cible.motivation = (cible.motivation * cible.effectif + apport.motivation * apport.effectif) / total;
  }
  for (const [type, nombre] of Object.entries(apport.unites)) {
    cible.unites[type] = (cible.unites[type] ?? 0) + nombre;
  }
  majEffectif(cible);
}

/* ------------------------------------------------------------
   Fusion et division, à la main
   ------------------------------------------------------------ */

/** Corps avec lesquels celui-ci peut fusionner ici et maintenant. */
export function fusionsPossibles(etat, armee) {
  if (armee.route) return [];
  return armeesDans(etat, armee.lieu).filter(
    (autre) =>
      autre.id !== armee.id &&
      autre.empire === armee.empire &&
      autre.domaine === armee.domaine &&
      !autre.enBataille &&
      !armee.enBataille,
  );
}

/** Réunit deux corps en un seul. */
export function fusionner(etat, armee, autre) {
  if (!fusionsPossibles(etat, armee).some((a) => a.id === autre.id)) return false;
  fusionnerDans(armee, autre);
  dissoudre(etat, autre);
  return true;
}

/** Sépare un corps en deux moitiés, sur place. */
export function diviser(etat, armee) {
  if (armee.enBataille || armee.route) return null;
  if (armee.effectif < 2 * EFFECTIF_MINIMAL) return null;

  const moitie = compositionVide(armee.domaine);
  for (const type of Object.keys(armee.unites)) {
    const part = Math.round((armee.unites[type] / 2) * 10) / 10;
    moitie[type] = part;
    armee.unites[type] -= part;
  }
  majEffectif(armee);
  if (totalUnites(moitie) < EFFECTIF_MINIMAL) {
    fusionnerDans(armee, { unites: moitie, motivation: armee.motivation, effectif: totalUnites(moitie) });
    return null;
  }

  const detachement = {
    id: `a${etat.prochainIdArmee++}`,
    empire: armee.empire,
    domaine: armee.domaine,
    unites: moitie,
    effectif: 0,
    motivation: armee.motivation,
    lieu: armee.lieu,
    route: null,
    enBataille: false,
    joursImmobile: 0,
  };
  majEffectif(detachement);
  etat.armees[detachement.id] = detachement;
  return detachement;
}

/* ------------------------------------------------------------
   Levée de troupes et constructions navales
   ------------------------------------------------------------ */

/** Une province est un port si elle ouvre sur au moins une route maritime. */
export function estPort(territoire) {
  return territoire.voisinsMaritimes.length > 0;
}

/** Peut-on lever cette arme ici ? Renvoie un motif si non. */
export function verifierLevee(etat, territoire, type = 'infanterie') {
  const modele = UNITES[type];
  if (!modele) return { possible: false, motif: 'Arme inconnue.' };
  const empire = etat.empires[controleur(territoire)];
  if (!empire) return { possible: false, motif: 'Province sans maître.' };
  if (territoire.occupant && territoire.occupant !== territoire.maitre) {
    return { possible: false, motif: 'On ne lève pas de troupes en pays occupé.' };
  }
  if (territoire.levee) return { possible: false, motif: 'Une levée est déjà en cours ici.' };
  if (modele.domaine === 'mer' && !estPort(territoire)) {
    return { possible: false, motif: 'Cette province n\'a pas de port.' };
  }
  if (empire.reserves < RESERVES_REGIMENT[type]) {
    return { possible: false, motif: 'Les réserves d\'hommes sont épuisées.' };
  }
  for (const [ressource, montant] of Object.entries(modele.cout)) {
    if (empire.stocks[ressource] < montant) return { possible: false, motif: 'Le trésor ne suit pas.' };
  }
  return { possible: true };
}

export function lancerLevee(etat, territoire, type = 'infanterie') {
  const verdict = verifierLevee(etat, territoire, type);
  if (!verdict.possible) return verdict;

  const modele = UNITES[type];
  const empire = etat.empires[controleur(territoire)];
  for (const [ressource, montant] of Object.entries(modele.cout)) empire.stocks[ressource] -= montant;
  empire.reserves -= RESERVES_REGIMENT[type];
  territoire.levee = { type, restant: modele.duree, duree: modele.duree };

  if (empire.estJoueur) {
    journaliser(
      etat,
      `${modele.domaine === 'mer' ? 'Chantier naval ouvert' : 'Levée ordonnée'} en ` +
        `<strong>${territoire.nom}</strong> — ${modele.nom.toLowerCase()}, ${modele.duree} jours.`,
    );
  }
  return { possible: true };
}

function avancerLevee(etat, territoire) {
  if (!territoire.levee) return;
  territoire.levee.restant -= 1;
  if (territoire.levee.restant > 0) return;

  const { type } = territoire.levee;
  territoire.levee = null;
  const empire = etat.empires[controleur(territoire)];
  if (!empire) return;

  const modele = UNITES[type];
  const unites = compositionVide(modele.domaine);
  unites[type] = TAILLE_REGIMENT[type];
  creerArmee(etat, empire.id, territoire.id, unites, modele.domaine);

  if (empire.estJoueur) {
    journaliser(etat, `${modele.nom} : un renfort rejoint <strong>${territoire.nom}</strong>.`);
  }
}

/* ------------------------------------------------------------
   Maîtrise de la mer
   ------------------------------------------------------------ */

/** Puissance navale d'une puissance dans une province portuaire. */
function forceNavale(etat, idEmpire, idTerritoire) {
  return armeesDans(etat, idTerritoire)
    .filter((a) => a.domaine === 'mer' && a.empire === idEmpire)
    .reduce((s, a) => s + a.effectif, 0);
}

/**
 * Une armée de terre ne franchit un bras de mer que si sa marine tient le
 * passage : une escadre à l'un des deux bords, et aucune escadre ennemie plus
 * forte. C'est ce qui met l'Angleterre à l'abri d'une invasion improvisée.
 */
export function passageMaritimeOuvert(etat, armee, depuis, vers) {
  const nous = forceNavale(etat, armee.empire, depuis) + forceNavale(etat, armee.empire, vers);
  if (nous <= 0) return false;

  let ennemi = 0;
  for (const bord of [depuis, vers]) {
    for (const flotte of armeesDans(etat, bord)) {
      if (flotte.domaine !== 'mer') continue;
      if (flotte.empire === armee.empire) continue;
      if (!etat.relations) continue;
      const cle = flotte.empire < armee.empire ? `${flotte.empire}|${armee.empire}` : `${armee.empire}|${flotte.empire}`;
      if (etat.relations[cle] === 'guerre') ennemi += flotte.effectif;
    }
  }
  return nous >= ennemi;
}

/* ------------------------------------------------------------
   Marche
   ------------------------------------------------------------ */

/** Une étape est-elle praticable pour ce corps ? */
function etapeAutorisee(etat, armee, depuis, vers) {
  const a = etat.carte.territoires[depuis];
  const maritime = a.voisinsMaritimes.includes(vers);
  if (armee.domaine === 'mer') return maritime; // une escadre ne remonte pas les terres
  if (!maritime) return true;
  return passageMaritimeOuvert(etat, armee, depuis, vers);
}

/** Durée d'une étape, en jours, entre deux provinces voisines. */
export function dureeEtape(etat, armee, depuis, vers) {
  const a = etat.carte.territoires[depuis];
  const b = etat.carte.territoires[vers];
  const distance = Math.hypot(b.centre[0] - a.centre[0], b.centre[1] - a.centre[1]);
  let jours = Math.max(3, distance / 11);

  if (a.voisinsMaritimes.includes(vers) && armee.domaine === 'terre') jours *= 3.2;
  if (armee.domaine === 'terre') {
    if (b.terrain === 'montagne') jours *= 1.4;
    if (b.terrain === 'jungle' || b.terrain === 'toundra') jours *= 1.25;
  }

  // Vitesse propre à la composition, motivation et doctrine.
  jours /= vitesseComposition(armee.unites);
  const empire = etat.empires[armee.empire];
  jours /= 0.75 + (armee.motivation / MOTIVATION_MAX) * 0.35 + (empire.doctrine.marche ?? 1) - 1;
  return Math.max(2, jours);
}

/**
 * Plus court chemin en jours de marche (Dijkstra sur le graphe des provinces),
 * en n'empruntant que les étapes praticables par ce corps.
 * @returns {string[]|null} suite de provinces, départ exclu
 */
export function tracerRoute(etat, armee, depuis, vers) {
  if (depuis === vers) return null;
  const distances = { [depuis]: 0 };
  const precedent = {};
  const aVisiter = new Set(etat.carte.ordre);

  while (aVisiter.size) {
    let courant = null;
    let meilleur = Infinity;
    for (const id of aVisiter) {
      const d = distances[id] ?? Infinity;
      if (d < meilleur) {
        meilleur = d;
        courant = id;
      }
    }
    if (courant === null || meilleur === Infinity) break;
    if (courant === vers) break;
    aVisiter.delete(courant);

    for (const voisin of etat.carte.territoires[courant].voisins) {
      if (!aVisiter.has(voisin)) continue;
      if (!etapeAutorisee(etat, armee, courant, voisin)) continue;
      const cout = meilleur + dureeEtape(etat, armee, courant, voisin);
      if (cout < (distances[voisin] ?? Infinity)) {
        distances[voisin] = cout;
        precedent[voisin] = courant;
      }
    }
  }

  if (distances[vers] === undefined) return null;
  const chemin = [];
  let noeud = vers;
  while (noeud !== depuis) {
    chemin.unshift(noeud);
    noeud = precedent[noeud];
  }
  return chemin;
}

/** Donne l'ordre de marche. Renvoie false si la destination est inaccessible. */
export function ordonnerMarche(etat, armee, destination) {
  const depart = armee.route ? armee.route.depuis : armee.lieu;
  const chemin = tracerRoute(etat, armee, depart, destination);
  if (!chemin) return false;
  armee.lieu = depart;
  armee.route = {
    chemin,
    etape: 0,
    depuis: depart,
    progression: 0,
    duree: dureeEtape(etat, armee, depart, chemin[0]),
  };
  armee.joursImmobile = 0;
  return true;
}

export function annulerMarche(armee) {
  armee.route = null;
}

function avancerMarche(etat, armee) {
  const route = armee.route;
  if (!route) {
    armee.joursImmobile += 1;
    return;
  }
  if (armee.enBataille) return;

  route.progression += 1 / route.duree;
  if (route.progression < 1) return;

  const arrivee = route.chemin[route.etape];
  armee.lieu = arrivee;
  route.etape += 1;

  // Un débarquement éprouve les troupes.
  if (armee.domaine === 'terre' && etat.carte.territoires[route.depuis].voisinsMaritimes.includes(arrivee)) {
    armee.motivation = Math.max(0, armee.motivation - 10);
  }

  if (route.etape >= route.chemin.length) {
    armee.route = null;
    armee.joursImmobile = 0;
    absorberArmeesAmies(etat, armee);
    return;
  }
  route.depuis = arrivee;
  route.progression = 0;
  route.duree = dureeEtape(etat, armee, arrivee, route.chemin[route.etape]);
}

/** À l'arrivée, les corps amis se regroupent tant que le plafond le permet. */
function absorberArmeesAmies(etat, armee) {
  for (const autre of armeesDans(etat, armee.lieu)) {
    if (autre === armee || autre.empire !== armee.empire || autre.domaine !== armee.domaine) continue;
    if (armee.effectif + autre.effectif > TAILLE_MAX_CORPS) continue;
    fusionnerDans(armee, autre);
    dissoudre(etat, autre);
  }
}

/* ------------------------------------------------------------
   Motivation
   ------------------------------------------------------------ */

function faireEvoluerMotivation(etat, armee) {
  if (armee.enBataille) return;
  const empire = etat.empires[armee.empire];
  const territoire = etat.carte.territoires[armee.lieu];
  const chezSoi = controleur(territoire) === armee.empire;

  let cible = empire.doctrine.moralInitial;
  if (chezSoi) cible += territoire.moral * 0.2;
  else cible -= 12;
  if (armee.route) cible -= 6;
  if (empire.penuries.or) cible -= 15;
  if (empire.penuries.eau) cible -= 12;
  cible = Math.max(0, Math.min(MOTIVATION_MAX, cible));

  const ecart = cible - armee.motivation;
  let pas = 0.4;
  if (ecart < 0) pas /= empire.doctrine.tenacite ?? 1;
  else pas *= empire.doctrine.elan ?? 1;
  armee.motivation += Math.sign(ecart) * Math.min(Math.abs(ecart), pas);
}

export function recompenserVictoire(etat, armee, ampleur = 1) {
  const empire = etat.empires[armee.empire];
  const gain = 9 * ampleur * (empire.doctrine.gainMoralVictoire ?? 1);
  armee.motivation = Math.min(MOTIVATION_MAX, armee.motivation + gain);
}

export function punirDefaite(armee, ampleur = 1) {
  armee.motivation = Math.max(0, armee.motivation - 12 * ampleur);
}

/* ------------------------------------------------------------
   Journée militaire
   ------------------------------------------------------------ */

/** Entretien quotidien des forces d'une puissance, par ressource. */
export function entretienMilitaire(etat, idEmpire) {
  const total = { or: 0, bois: 0, fer: 0, eau: 0, charbon: 0 };
  for (const armee of Object.values(etat.armees)) {
    if (armee.empire !== idEmpire) continue;
    const part = entretienComposition(armee.unites);
    for (const ressource of Object.keys(total)) total[ressource] += part[ressource] ?? 0;
  }
  return total;
}

export function regenererReserves(etat) {
  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant) continue;
    let apport = 0;
    for (const id of empire.territoires) {
      const t = etat.carte.territoires[id];
      if (t.occupant && t.occupant !== t.maitre) continue;
      apport += t.population * 0.05 * (0.5 + t.moral / 200);
    }
    apport *= (empire.doctrine.reserves ?? 1) * (1 + effetsPolitiques(empire).reserves);
    empire.reserves = Math.min(empire.reservesMax, empire.reserves + apport);
  }
}

export function calculerReservesMax(etat, empire) {
  let population = 0;
  for (const id of empire.territoires) {
    const t = etat.carte.territoires[id];
    if (t.occupant && t.occupant !== t.maitre) continue;
    population += t.population;
  }
  return Math.round(population * 4 * (empire.doctrine.reserves ?? 1) * (1 + effetsPolitiques(empire).reserves));
}

/** Un jour d'armée : levées, marches, motivation, dissolutions. */
export function appliquerJourMilitaire(etat) {
  for (const id of etat.carte.ordre) avancerLevee(etat, etat.carte.territoires[id]);

  for (const armee of Object.values(etat.armees)) {
    avancerMarche(etat, armee);
    faireEvoluerMotivation(etat, armee);
  }

  for (const armee of Object.values(etat.armees)) {
    majEffectif(armee);
    if (armee.effectif < EFFECTIF_MINIMAL) {
      const empire = etat.empires[armee.empire];
      if (empire?.estJoueur) {
        journaliser(etat, `Un corps trop réduit est dissous en <strong>${etat.carte.territoires[armee.lieu].nom}</strong>.`);
      }
      dissoudre(etat, armee);
    }
  }

  // Sans solde, les hommes désertent et les équipages débarquent.
  for (const empire of Object.values(etat.empires)) {
    if (!empire.penuries.or) continue;
    for (const armee of Object.values(etat.armees)) {
      if (armee.empire !== empire.id) continue;
      for (const type of Object.keys(armee.unites)) armee.unites[type] *= 0.995;
      majEffectif(armee);
    }
  }
}

export { avecArticle, typesDuDomaine, UNITES, TAILLE_REGIMENT, RESERVES_REGIMENT };
