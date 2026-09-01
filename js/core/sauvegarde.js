/* ============================================================
   sauvegarde.js — enregistrer et reprendre une partie
   ------------------------------------------------------------
   On ne sérialise que ce qui change : la géométrie de la carte
   pèse deux cents kilo-octets et se reconstruit à l'identique.
   Reprendre une partie, c'est donc recréer le monde de 1805 puis
   y réappliquer l'état sauvegardé.
   ============================================================ */

import { creerPartie } from './etat.js';
import { recalculerEconomie } from './economie.js';

const CLE = 'aigles.partie';
export const VERSION = 3;

/** Champs d'une province qui évoluent en cours de partie. */
const CHAMPS_TERRITOIRE = [
  'maitre', 'occupant', 'developpement', 'chantier', 'levee', 'moral',
  'population', 'occupationEnCours', 'insurrection',
];

/** Champs d'un empire qui évoluent en cours de partie. */
const CHAMPS_EMPIRE = [
  'stocks', 'reserves', 'reservesMax', 'dette', 'interets', 'tauxImposition',
  'politiques', 'moral', 'eliminee',
];

/** Réduit la partie à un objet transportable. */
export function serialiser(etat) {
  const territoires = {};
  for (const id of etat.carte.ordre) {
    const t = etat.carte.territoires[id];
    territoires[id] = Object.fromEntries(CHAMPS_TERRITOIRE.map((c) => [c, t[c]]));
  }

  const empires = {};
  for (const [id, e] of Object.entries(etat.empires)) {
    empires[id] = Object.fromEntries(CHAMPS_EMPIRE.map((c) => [c, e[c]]));
  }

  return {
    version: VERSION,
    enregistreLe: new Date().toISOString(),
    joueur: etat.joueur,
    options: etat.options,
    date: etat.date,
    jourEcoule: etat.jourEcoule,
    vitesse: etat.vitesse,
    territoires,
    empires,
    armees: etat.armees,
    prochainIdArmee: etat.prochainIdArmee,
    relations: etat.relations,
    opinions: etat.opinions,
    offresAlliance: etat.offresAlliance,
    offresPaix: etat.offresPaix,
    traitesImposes: etat.traitesImposes,
    debutsDeGuerre: etat.debutsDeGuerre,
    dernieresGuerres: etat.dernieresGuerres,
    alertesEmises: etat.alertesEmises,
    journal: etat.journal,
    fin: etat.fin,
    selection: etat.selection,
  };
}

/**
 * Reconstruit une partie complète depuis un objet sauvegardé.
 * @returns {object} l'état de jeu, prêt à être joué
 */
export function restaurer(donnees) {
  if (!donnees || donnees.version !== VERSION) {
    throw new Error('Cette sauvegarde provient d\'une autre version du jeu.');
  }

  const etat = creerPartie(donnees.joueur, donnees.options);

  for (const [id, champs] of Object.entries(donnees.territoires)) {
    const t = etat.carte.territoires[id];
    if (!t) continue;
    Object.assign(t, champs);
  }
  for (const [id, champs] of Object.entries(donnees.empires)) {
    const e = etat.empires[id];
    if (!e) continue;
    Object.assign(e, champs);
  }

  etat.date = { ...donnees.date };
  etat.jourEcoule = donnees.jourEcoule;
  etat.vitesse = donnees.vitesse ?? 1;
  etat.armees = donnees.armees;
  etat.prochainIdArmee = donnees.prochainIdArmee;
  etat.relations = donnees.relations ?? {};
  etat.opinions = donnees.opinions ?? {};
  etat.offresAlliance = donnees.offresAlliance ?? {};
  etat.offresPaix = donnees.offresPaix ?? {};
  etat.traitesImposes = donnees.traitesImposes ?? {};
  etat.debutsDeGuerre = donnees.debutsDeGuerre ?? {};
  etat.dernieresGuerres = donnees.dernieresGuerres ?? {};
  etat.alertesEmises = donnees.alertesEmises ?? {};
  etat.journal = donnees.journal ?? [];
  etat.fin = donnees.fin ?? null;
  etat.selection = donnees.selection ?? null;
  etat.selectionArmee = null;
  etat.enPause = true;

  recalculerEconomie(etat);
  return etat;
}

/* ------------------------------------------------------------
   Rangement dans le navigateur
   ------------------------------------------------------------ */

export function enregistrer(etat) {
  try {
    localStorage.setItem(CLE, JSON.stringify(serialiser(etat)));
    return { ok: true };
  } catch (erreur) {
    return { ok: false, motif: 'Le navigateur refuse d\'enregistrer (mode privé ?).' };
  }
}

export function sauvegardeExiste() {
  try {
    return localStorage.getItem(CLE) !== null;
  } catch {
    return false;
  }
}

/** Résumé de la sauvegarde rangée, pour l'afficher sans la charger. */
export function apercuSauvegarde() {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const d = JSON.parse(brut);
    return { joueur: d.joueur, date: d.date, version: d.version };
  } catch {
    return null;
  }
}

export function charger() {
  const brut = localStorage.getItem(CLE);
  if (!brut) throw new Error('Aucune partie enregistrée.');
  return restaurer(JSON.parse(brut));
}

export function effacer() {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à faire */
  }
}

/* ------------------------------------------------------------
   Fichier, pour emporter sa partie ailleurs
   ------------------------------------------------------------ */

export function exporterFichier(etat) {
  const contenu = JSON.stringify(serialiser(etat), null, 1);
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const d = etat.date;
  lien.download = `aigles-${etat.joueur}-${d.annee}-${String(d.mois).padStart(2, '0')}.json`;
  lien.click();
  URL.revokeObjectURL(lien.href);
}

/** Ouvre un sélecteur de fichier et rend l'état restauré. */
export function importerFichier() {
  return new Promise((resoudre, rejeter) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = 'application/json,.json';
    champ.addEventListener('change', async () => {
      const fichier = champ.files?.[0];
      if (!fichier) return rejeter(new Error('Aucun fichier choisi.'));
      try {
        resoudre(restaurer(JSON.parse(await fichier.text())));
      } catch (erreur) {
        rejeter(erreur);
      }
    });
    champ.click();
  });
}
