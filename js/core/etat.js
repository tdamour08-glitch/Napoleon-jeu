/* ============================================================
   etat.js — état global de la partie
   ------------------------------------------------------------
   Ce module ne connaît que la structure de la partie : carte,
   empires, calendrier, journal. Les règles économiques vivent
   dans core/economie.js, qui s'appuie sur ce module.
   ============================================================ */

import { construireCarte } from '../map/carte.js';
import { EMPIRES, EMPIRES_PAR_ID, DOCTRINE_DEFAUT, RESSOURCES } from '../data/empires.js';

export const DATE_DEPART = { jour: 1, mois: 3, annee: 1805 };

const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const JOURS_PAR_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Stock de départ, par ressource. */
const STOCK_INITIAL = 400;

/**
 * Garnisons de 1805, en milliers d'hommes.
 * Les puissances mineures reçoivent un corps dans leur capitale.
 */
const FORCES_INITIALES = {
  fra: [['ile_de_france', 40], ['rhenanie', 30], ['lombardie', 25], ['bourgogne', 20]],
  gbr: [['angleterre', 30], ['irlande', 10], ['bengale', 15]],
  pru: [['brandebourg', 35], ['silesie', 20]],
  aut: [['autriche', 35], ['boheme', 20], ['venetie', 20]],
  rus: [['moscou', 30], ['lituanie', 30], ['ukraine', 20]],
  esp: [['castille', 25], ['andalousie', 15]],
  ott: [['constantinople', 30], ['anatolie', 20], ['egypte', 15]],
};

/** Guerres déjà engagées au 1er mars 1805. */
const GUERRES_INITIALES = [['fra', 'gbr']];

/** Alliances déjà signées : Londres et Saint-Pétersbourg, avril 1805. */
const ALLIANCES_INITIALES = [['gbr', 'rus']];

const parRessource = (valeur) => Object.fromEntries(RESSOURCES.map((r) => [r.id, valeur]));

/**
 * Crée l'état d'une nouvelle partie.
 * @param {string} idEmpireJoueur
 */
export function creerPartie(idEmpireJoueur) {
  const carte = construireCarte();

  const empires = {};
  for (const modele of EMPIRES) {
    empires[modele.id] = {
      ...modele,
      doctrine: { ...DOCTRINE_DEFAUT, ...(modele.doctrine ?? {}) },
      estJoueur: modele.id === idEmpireJoueur,
      vivant: false,
      territoires: [],
      stocks: parRessource(STOCK_INITIAL),
      production: parRessource(0),
      consommation: parRessource(0),
      net: parRessource(0),
      penuries: parRessource(false),
      capacite: 0,
      // Réserves d'hommes mobilisables, en milliers.
      reserves: 0,
      reservesMax: 0,
      // Provinces possédées en droit, occupation comprise. Distinct de
      // `territoires`, qui ne compte que celles effectivement tenues.
      souverainete: 0,
      moral: (modele.doctrine ?? DOCTRINE_DEFAUT).moralInitial ?? DOCTRINE_DEFAUT.moralInitial,
    };
  }

  // `maitre` = souverain de droit, `occupant` = puissance qui tient le terrain.
  // Un territoire occupé n'est pas encore annexé (phase 5).
  for (const id of carte.ordre) {
    const territoire = carte.territoires[id];
    territoire.occupant = null;
    // Développement : richesse des infrastructures, de 0 à 3.
    territoire.developpement = territoire.capitale ? 2 : Math.max(0, territoire.population - 1);
    territoire.chantier = null;
    territoire.levee = null;
    territoire.occupationEnCours = null;
    territoire.insurrection = 0;
    // Moral de la population : 0 à 100. Le moral des troupes viendra en phase 3.
    territoire.moral = 55;
    if (!empires[territoire.maitre]) {
      console.warn(`[etat] Territoire « ${territoire.nom} » rattaché à un empire inconnu.`);
      continue;
    }
  }

  const etat = {
    carte,
    empires,
    joueur: idEmpireJoueur,
    date: { ...DATE_DEPART },
    jourEcoule: 0,
    enPause: true,
    vitesse: 1,
    selection: null,
    survol: null,
    selectionArmee: null,
    journal: [],
    // Avertissements déjà signalés, pour ne pas inonder le journal.
    alertesEmises: {},
    // Militaire et diplomatie (phases 3 et 5).
    armees: {},
    prochainIdArmee: 1,
    batailles: {},
    relations: {},
    opinions: {},
    // Offres en attente de réponse du joueur, et premier jour de chaque guerre.
    offresAlliance: {},
    offresArmistice: {},
    debutsDeGuerre: {},
    dernieresGuerres: {},
    equilibre: null,
    economieARecalculer: false,
  };

  recenserTerritoires(etat);
  installerForcesInitiales(etat);
  return etat;
}

/** Place les garnisons de départ et ouvre les guerres déjà déclarées. */
function installerForcesInitiales(etat) {
  for (const [idEmpire, garnisons] of Object.entries(FORCES_INITIALES)) {
    for (const [idTerritoire, effectif] of garnisons) {
      const territoire = etat.carte.territoires[idTerritoire];
      if (!territoire) {
        console.warn(`[etat] Garnison sur une province inconnue : ${idTerritoire}`);
        continue;
      }
      creerArmeeInitiale(etat, idEmpire, idTerritoire, effectif);
    }
  }

  // Chaque puissance mineure garde sa capitale.
  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant || FORCES_INITIALES[empire.id]) continue;
    const capitale = empire.territoires
      .map((id) => etat.carte.territoires[id])
      .find((t) => t.capitale);
    if (capitale) creerArmeeInitiale(etat, empire.id, capitale.id, 12);
  }

  for (const [a, b] of GUERRES_INITIALES) {
    etat.relations[a < b ? `${a}|${b}` : `${b}|${a}`] = 'guerre';
  }
  for (const [a, b] of ALLIANCES_INITIALES) {
    etat.relations[a < b ? `${a}|${b}` : `${b}|${a}`] = 'alliance';
  }
}

/**
 * Création directe d'une armée, sans passer par core/armees.js :
 * ce module ne doit dépendre de rien pour rester en amont du reste.
 */
function creerArmeeInitiale(etat, idEmpire, idTerritoire, effectif) {
  const empire = etat.empires[idEmpire];
  const id = `a${etat.prochainIdArmee++}`;
  etat.armees[id] = {
    id,
    empire: idEmpire,
    effectif,
    motivation: empire.doctrine.moralInitial,
    lieu: idTerritoire,
    route: null,
    enBataille: false,
    joursImmobile: 0,
  };
}

/** Empire contrôlant effectivement le territoire (occupant s'il existe, sinon maître). */
export function controleur(territoire) {
  return territoire.occupant ?? territoire.maitre;
}

/** Un territoire occupé rapporte moins et coûte plus tant qu'il n'est pas annexé. */
export function estOccupe(territoire) {
  return Boolean(territoire.occupant) && territoire.occupant !== territoire.maitre;
}

/** Reconstitue la liste des provinces de chaque empire. */
export function recenserTerritoires(etat) {
  for (const empire of Object.values(etat.empires)) {
    empire.territoires = [];
    empire.souverainete = 0;
    empire.vivant = false;
  }
  for (const id of etat.carte.ordre) {
    const territoire = etat.carte.territoires[id];
    const empire = etat.empires[controleur(territoire)];
    if (empire) {
      empire.territoires.push(id);
      empire.vivant = true;
    }
    // La souveraineté de droit survit à l'occupation : une puissance
    // entièrement envahie existe encore tant qu'aucun traité ne l'a dépecée.
    const souverain = etat.empires[territoire.maitre];
    if (souverain) {
      souverain.souverainete += 1;
      souverain.vivant = true;
    }
  }
}

/** Avance la date d'un jour. */
export function avancerJour(etat) {
  etat.jourEcoule += 1;
  const d = etat.date;
  d.jour += 1;
  const bissextile = d.annee % 4 === 0 && (d.annee % 100 !== 0 || d.annee % 400 === 0);
  const limite = JOURS_PAR_MOIS[d.mois - 1] + (d.mois === 2 && bissextile ? 1 : 0);
  if (d.jour > limite) {
    d.jour = 1;
    d.mois += 1;
    if (d.mois > 12) {
      d.mois = 1;
      d.annee += 1;
    }
  }
}

export function dateEnTexte(date) {
  return `${date.jour} ${NOMS_MOIS[date.mois - 1]} ${date.annee}`;
}

/** Ajoute une entrée au journal (les plus récentes en tête). */
export function journaliser(etat, texte) {
  etat.journal.unshift({ date: { ...etat.date }, texte });
  if (etat.journal.length > 60) etat.journal.pop();
}

/**
 * Journalise au plus une fois par période pour un même sujet.
 * @param {string} cle identifiant de l'alerte
 * @param {number} delaiJours nombre de jours de silence entre deux rappels
 */
export function alerter(etat, cle, delaiJours, texte) {
  const dernier = etat.alertesEmises[cle];
  if (dernier !== undefined && etat.jourEcoule - dernier < delaiJours) return false;
  etat.alertesEmises[cle] = etat.jourEcoule;
  journaliser(etat, texte);
  return true;
}

export { EMPIRES_PAR_ID, RESSOURCES };
