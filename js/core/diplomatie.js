/* ============================================================
   diplomatie.js — état des relations entre puissances
   ------------------------------------------------------------
   Version minimale : la paix ou la guerre. Les alliances, les
   négociations et les traités arrivent en phase 5.
   ============================================================ */

import { journaliser } from './etat.js';
import { avecArticle, datif } from '../data/langue.js';

export const PAIX = 'paix';
export const GUERRE = 'guerre';

/** Clé symétrique d'un couple de puissances. */
function cle(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function relation(etat, a, b) {
  if (a === b) return PAIX;
  return etat.relations[cle(a, b)] ?? PAIX;
}

export function sontEnGuerre(etat, a, b) {
  return relation(etat, a, b) === GUERRE;
}

/** Déclare la guerre. Renvoie false si elle était déjà déclarée. */
export function declarerGuerre(etat, agresseur, victime) {
  if (agresseur === victime) return false;
  if (sontEnGuerre(etat, agresseur, victime)) return false;
  etat.relations[cle(agresseur, victime)] = GUERRE;
  const a = etat.empires[agresseur];
  const v = etat.empires[victime];
  journaliser(etat, `<strong>${a.nom}</strong> déclare la guerre ${datif(v)}.`);
  return true;
}

/** Rétablit la paix (utilisé par les traités de la phase 5). */
export function conclurePaix(etat, a, b) {
  if (!sontEnGuerre(etat, a, b)) return false;
  delete etat.relations[cle(a, b)];
  journaliser(
    etat,
    `Paix signée entre <strong>${etat.empires[a].nom}</strong> et ${avecArticle(etat.empires[b])}.`,
  );
  return true;
}

/** Liste des puissances avec lesquelles `id` est en guerre. */
export function ennemis(etat, id) {
  const sortie = [];
  for (const [paire, valeur] of Object.entries(etat.relations)) {
    if (valeur !== GUERRE) continue;
    const [a, b] = paire.split('|');
    if (a === id) sortie.push(b);
    else if (b === id) sortie.push(a);
  }
  return sortie;
}

