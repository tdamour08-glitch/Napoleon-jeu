/* ============================================================
   etat.js — état global de la partie
   ============================================================ */

import { construireCarte } from '../map/carte.js';
import { EMPIRES, EMPIRES_PAR_ID, DOCTRINE_DEFAUT, RESSOURCES } from '../data/empires.js';

export const DATE_DEPART = { jour: 1, mois: 3, annee: 1805 };

const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const JOURS_PAR_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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
      stocks: Object.fromEntries(RESSOURCES.map((r) => [r.id, 200])),
      production: Object.fromEntries(RESSOURCES.map((r) => [r.id, 0])),
      moral: (modele.doctrine ?? DOCTRINE_DEFAUT).moralInitial ?? DOCTRINE_DEFAUT.moralInitial,
    };
  }

  // Rattachement des territoires : `maitre` = souverain de droit, `occupant` = puissance
  // qui tient le terrain. Un territoire occupé n'est pas encore annexé (phase 5).
  for (const id of carte.ordre) {
    const territoire = carte.territoires[id];
    territoire.occupant = null;
    territoire.motivation = 50;
    if (!empires[territoire.maitre]) {
      console.warn(`[etat] Territoire « ${territoire.nom} » rattaché à un empire inconnu.`);
      continue;
    }
    empires[territoire.maitre].territoires.push(id);
    empires[territoire.maitre].vivant = true;
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
  };

  recalculerProduction(etat);
  return etat;
}

/** Empire contrôlant effectivement le territoire (occupant s'il existe, sinon maître). */
export function controleur(territoire) {
  return territoire.occupant ?? territoire.maitre;
}

/** Recalcule la production de chaque empire à partir de ses territoires contrôlés. */
export function recalculerProduction(etat) {
  for (const empire of Object.values(etat.empires)) {
    for (const r of RESSOURCES) empire.production[r.id] = 0;
    empire.territoires = [];
    empire.vivant = false;
  }
  for (const id of etat.carte.ordre) {
    const territoire = etat.carte.territoires[id];
    const idControleur = controleur(territoire);
    const empire = etat.empires[idControleur];
    if (!empire) continue;
    empire.territoires.push(id);
    empire.vivant = true;
    for (const r of RESSOURCES) {
      empire.production[r.id] += territoire.gisements[r.id] * (1 + territoire.population * 0.15);
    }
  }
  // Bonus de doctrine (ex. le commerce britannique).
  for (const empire of Object.values(etat.empires)) {
    if (empire.doctrine?.orBonus) empire.production.or *= empire.doctrine.orBonus;
    for (const r of RESSOURCES) empire.production[r.id] = Math.round(empire.production[r.id] * 10) / 10;
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

export { EMPIRES_PAR_ID, RESSOURCES };
