/* ============================================================
   armees.js — levée, marche, entretien et motivation des troupes
   ------------------------------------------------------------
   Une armée appartient à une puissance, occupe une province ou
   marche entre deux provinces. Sa MOTIVATION monte avec les
   victoires et tombe avec les défaites, les longues marches en
   pays ennemi et les pénuries. Elle pèse sur la puissance au
   combat et sur la vitesse de marche.

   Invariant : une puissance n'a jamais deux armées à l'arrêt
   dans la même province — elles fusionnent à l'arrivée.
   ============================================================ */

import { controleur, journaliser } from './etat.js';
import { avecArticle } from '../data/langue.js';
import { effetsPolitiques } from './politiques.js';

/** Effectif d'un corps nouvellement levé, en milliers d'hommes. */
export const TAILLE_CORPS = 10;

/**
 * Effectif au-delà duquel deux corps ne fusionnent plus. Sans ce plafond,
 * chaque puissance finit par ne plus manœuvrer qu'une seule masse.
 */
export const TAILLE_MAX_CORPS = 60;

/** Coût d'une levée. */
export const COUT_LEVEE = { or: 130, fer: 90, bois: 60 };
export const RESERVES_PAR_CORPS = TAILLE_CORPS;
/** Durée d'une levée, en jours. */
export const DUREE_LEVEE = 20;

/** Entretien quotidien, par millier d'hommes. */
const ENTRETIEN = { or: 0.05, bois: 0.03, fer: 0.02, eau: 0.04 };

/** Effectif en deçà duquel une armée est dissoute. */
const EFFECTIF_MINIMAL = 0.6;

/** Motivation sous laquelle une armée engagée rompt le combat. */
export const SEUIL_DEROUTE = 22;

const MOTIVATION_MAX = 100;

/* ------------------------------------------------------------
   Création et destruction
   ------------------------------------------------------------ */

export function creerArmee(etat, idEmpire, idTerritoire, effectif) {
  const empire = etat.empires[idEmpire];
  const accueillante = armeesDans(etat, idTerritoire).find(
    (a) => a.empire === idEmpire && a.effectif + effectif <= TAILLE_MAX_CORPS,
  );
  if (accueillante) {
    fusionner(accueillante, { effectif, motivation: empire.doctrine.moralInitial });
    return accueillante;
  }
  const armee = {
    id: `a${etat.prochainIdArmee++}`,
    empire: idEmpire,
    effectif,
    motivation: empire.doctrine.moralInitial,
    lieu: idTerritoire,
    route: null,
    enBataille: false,
    joursImmobile: 0,
  };
  etat.armees[armee.id] = armee;
  return armee;
}

export function dissoudre(etat, armee) {
  delete etat.armees[armee.id];
  if (etat.selectionArmee === armee.id) etat.selectionArmee = null;
}

/** Armées à l'arrêt d'une puissance dans une province. */
export function armeesDe(etat, idEmpire, idTerritoire) {
  return armeesDans(etat, idTerritoire).filter((a) => a.empire === idEmpire);
}

/** Toutes les armées présentes dans une province (marches exclues). */
export function armeesDans(etat, idTerritoire) {
  return Object.values(etat.armees).filter((a) => a.lieu === idTerritoire && !a.route);
}

/** Deux armées n'en font plus qu'une ; la motivation suit l'effectif. */
function fusionner(cible, apport) {
  const total = cible.effectif + apport.effectif;
  cible.motivation =
    (cible.motivation * cible.effectif + apport.motivation * apport.effectif) / total;
  cible.effectif = total;
}

/* ------------------------------------------------------------
   Levée de troupes
   ------------------------------------------------------------ */

/** Peut-on lever un corps ici ? Renvoie un motif si non. */
export function verifierLevee(etat, territoire) {
  const empire = etat.empires[controleur(territoire)];
  if (!empire) return { possible: false, motif: 'Province sans maître.' };
  if (territoire.occupant && territoire.occupant !== territoire.maitre) {
    return { possible: false, motif: 'On ne lève pas de troupes en pays occupé.' };
  }
  if (territoire.levee) return { possible: false, motif: 'Une levée est déjà en cours ici.' };
  if (empire.reserves < RESERVES_PAR_CORPS) {
    return { possible: false, motif: 'Les réserves d\'hommes sont épuisées.' };
  }
  for (const [ressource, montant] of Object.entries(COUT_LEVEE)) {
    if (empire.stocks[ressource] < montant) {
      return { possible: false, motif: 'Le trésor ne suit pas.' };
    }
  }
  return { possible: true };
}

export function lancerLevee(etat, territoire) {
  const verdict = verifierLevee(etat, territoire);
  if (!verdict.possible) return verdict;
  const empire = etat.empires[controleur(territoire)];
  for (const [ressource, montant] of Object.entries(COUT_LEVEE)) empire.stocks[ressource] -= montant;
  empire.reserves -= RESERVES_PAR_CORPS;
  territoire.levee = { restant: DUREE_LEVEE, duree: DUREE_LEVEE };
  if (empire.estJoueur) {
    journaliser(etat, `Levée ordonnée en <strong>${territoire.nom}</strong> (${DUREE_LEVEE} jours).`);
  }
  return { possible: true };
}

function avancerLevee(etat, territoire) {
  if (!territoire.levee) return;
  territoire.levee.restant -= 1;
  if (territoire.levee.restant > 0) return;
  territoire.levee = null;
  const empire = etat.empires[controleur(territoire)];
  if (!empire) return;
  creerArmee(etat, empire.id, territoire.id, TAILLE_CORPS);
  if (empire.estJoueur) {
    journaliser(etat, `Un corps de ${TAILLE_CORPS} 000 hommes se rassemble en <strong>${territoire.nom}</strong>.`);
  }
}

/* ------------------------------------------------------------
   Marche
   ------------------------------------------------------------ */

/** Durée d'une étape, en jours, entre deux provinces voisines. */
export function dureeEtape(etat, armee, depuis, vers) {
  const a = etat.carte.territoires[depuis];
  const b = etat.carte.territoires[vers];
  const distance = Math.hypot(b.centre[0] - a.centre[0], b.centre[1] - a.centre[1]);
  let jours = Math.max(3, distance / 11);
  if (a.voisinsMaritimes.includes(vers)) jours *= 3.2; // rassembler les transports, traverser, débarquer
  if (b.terrain === 'montagne') jours *= 1.4;
  if (b.terrain === 'jungle' || b.terrain === 'toundra') jours *= 1.25;
  // Des troupes motivées marchent plus vite ; l'élan est un avantage discret.
  const empire = etat.empires[armee.empire];
  jours /= 0.75 + (armee.motivation / MOTIVATION_MAX) * 0.35 + (empire.doctrine.marche ?? 1) - 1;
  return Math.max(2, jours);
}

/**
 * Plus court chemin en jours de marche (Dijkstra sur le graphe des provinces).
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

/** Fait avancer une armée d'un jour. */
function avancerMarche(etat, armee) {
  const route = armee.route;
  if (!route) {
    armee.joursImmobile += 1;
    return;
  }
  if (armee.enBataille) return; // on ne quitte pas le champ de bataille en marchant

  route.progression += 1 / route.duree;
  if (route.progression < 1) return;

  const arrivee = route.chemin[route.etape];
  armee.lieu = arrivee;
  route.etape += 1;

  // Un débarquement éprouve les troupes : sans marine dédiée, la traversée se paie.
  if (etat.carte.territoires[route.depuis].voisinsMaritimes.includes(arrivee)) {
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
    if (autre === armee || autre.empire !== armee.empire) continue;
    if (armee.effectif + autre.effectif > TAILLE_MAX_CORPS) continue;
    fusionner(armee, autre);
    dissoudre(etat, autre);
  }
}

/** Détache la moitié d'un corps et l'envoie ailleurs. */
export function detacher(etat, armee, destination) {
  if (armee.effectif < 2 * EFFECTIF_MINIMAL) return null;
  const moitie = Math.round((armee.effectif / 2) * 10) / 10;
  armee.effectif -= moitie;
  const detachement = {
    id: `a${etat.prochainIdArmee++}`,
    empire: armee.empire,
    effectif: moitie,
    motivation: armee.motivation,
    lieu: armee.lieu,
    route: null,
    enBataille: false,
    joursImmobile: 0,
  };
  etat.armees[detachement.id] = detachement;
  if (!ordonnerMarche(etat, detachement, destination)) {
    // Destination inaccessible : le détachement rejoint le corps principal.
    armee.effectif += moitie;
    delete etat.armees[detachement.id];
    return null;
  }
  return detachement;
}

/* ------------------------------------------------------------
   Motivation
   ------------------------------------------------------------ */

/**
 * Fait dériver la motivation d'une armée au repos ou en marche.
 * Les combats la font bouger bien plus vite (cf. combat.js).
 */
function faireEvoluerMotivation(etat, armee) {
  if (armee.enBataille) return;
  const empire = etat.empires[armee.empire];
  const territoire = etat.carte.territoires[armee.lieu];
  const chezSoi = controleur(territoire) === armee.empire;

  let cible = empire.doctrine.moralInitial;
  if (chezSoi) cible += territoire.moral * 0.2;
  else cible -= 12; // vivre sur le pays use les troupes
  if (armee.route) cible -= 6;
  if (empire.penuries.or) cible -= 15;
  if (empire.penuries.eau) cible -= 12;
  cible = Math.max(0, Math.min(MOTIVATION_MAX, cible));

  // La ténacité russe ralentit la chute ; l'élan français accélère la reprise.
  const ecart = cible - armee.motivation;
  let pas = 0.4;
  if (ecart < 0) pas /= empire.doctrine.tenacite ?? 1;
  else pas *= empire.doctrine.elan ?? 1;
  armee.motivation += Math.sign(ecart) * Math.min(Math.abs(ecart), pas);
}

/** Récompense de motivation après une victoire. */
export function recompenserVictoire(etat, armee, ampleur = 1) {
  const empire = etat.empires[armee.empire];
  const gain = 9 * ampleur * (empire.doctrine.gainMoralVictoire ?? 1);
  armee.motivation = Math.min(MOTIVATION_MAX, armee.motivation + gain);
}

/** Pénalité de motivation après une défaite. */
export function punirDefaite(armee, ampleur = 1) {
  armee.motivation = Math.max(0, armee.motivation - 12 * ampleur);
}

/* ------------------------------------------------------------
   Journée militaire
   ------------------------------------------------------------ */

/** Entretien quotidien des armées d'une puissance, par ressource. */
export function entretienMilitaire(etat, idEmpire) {
  const total = { or: 0, bois: 0, fer: 0, eau: 0, charbon: 0 };
  for (const armee of Object.values(etat.armees)) {
    if (armee.empire !== idEmpire) continue;
    for (const [ressource, taux] of Object.entries(ENTRETIEN)) {
      total[ressource] += taux * armee.effectif;
    }
  }
  return total;
}

/** Régénération des réserves d'hommes. */
export function regenererReserves(etat) {
  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant) continue;
    let apport = 0;
    for (const id of empire.territoires) {
      const t = etat.carte.territoires[id];
      if (t.occupant && t.occupant !== t.maitre) continue; // un pays occupé ne fournit pas de recrues
      apport += t.population * 0.05 * (0.5 + t.moral / 200);
    }
    apport *= (empire.doctrine.reserves ?? 1) * (1 + effetsPolitiques(empire).reserves);
    empire.reserves = Math.min(empire.reservesMax, empire.reserves + apport);
  }
}

/** Plafond des réserves : un empire ne mobilise pas au-delà de sa population. */
export function calculerReservesMax(etat, empire) {
  let population = 0;
  for (const id of empire.territoires) {
    const t = etat.carte.territoires[id];
    if (t.occupant && t.occupant !== t.maitre) continue; // un pays occupé ne fournit pas de recrues
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
    if (armee.effectif < EFFECTIF_MINIMAL) {
      const empire = etat.empires[armee.empire];
      if (empire?.estJoueur) {
        journaliser(etat, `Un corps trop réduit est dissous en <strong>${etat.carte.territoires[armee.lieu].nom}</strong>.`);
      }
      dissoudre(etat, armee);
    }
  }

  // Une armée sans solde fond : les hommes désertent.
  for (const empire of Object.values(etat.empires)) {
    if (!empire.penuries.or) continue;
    for (const armee of Object.values(etat.armees)) {
      if (armee.empire !== empire.id) continue;
      armee.effectif *= 0.995;
    }
  }
}

export { avecArticle };
