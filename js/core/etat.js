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
    journal: [],
    // Avertissements déjà signalés, pour ne pas inonder le journal.
    alertesEmises: {},
  };

  recenserTerritoires(etat);
  return etat;
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
    empire.vivant = false;
  }
  for (const id of etat.carte.ordre) {
    const territoire = etat.carte.territoires[id];
    const empire = etat.empires[controleur(territoire)];
    if (!empire) continue;
    empire.territoires.push(id);
    empire.vivant = true;
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
