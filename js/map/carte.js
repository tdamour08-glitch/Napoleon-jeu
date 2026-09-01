/* ============================================================
   carte.js — assemblage de la carte politique
   ------------------------------------------------------------
   Les contours viennent de data/frontieres.js : de vraies
   frontières, lissées, produites hors ligne par
   outils/frontieres.py à partir de Natural Earth. Ce module se
   borne à les projeter, à en tirer centre et boîte englobante,
   et à compléter l'adjacence terrestre par les routes maritimes.
   ============================================================ */

import { TERRITOIRES, LIAISONS_MARITIMES } from '../data/monde.js';
import { FRONTIERES } from '../data/frontieres.js';
import { projeterPolygone, projeter, centroide, aire, boiteEnglobante } from './geo.js';

/**
 * Construit la géométrie complète de la carte.
 * @returns {{
 *   territoires: Object<string, object>,
 *   ordre: string[],
 *   bornes: [number, number, number, number]
 * }}
 */
export function construireCarte() {
  const territoires = {};
  let bornes = [Infinity, Infinity, -Infinity, -Infinity];

  for (const definition of TERRITOIRES) {
    const contours = FRONTIERES[definition.id];
    if (!contours) {
      console.warn(`[carte] Aucun contour pour « ${definition.nom} ».`);
      continue;
    }

    const anneaux = contours.anneaux.map(projeterPolygone).filter((a) => a.length >= 3);
    if (anneaux.length === 0) {
      console.warn(`[carte] Contour vide pour « ${definition.nom} ».`);
      continue;
    }

    // Le plus grand anneau porte le nom et le pion : les autres sont des îles.
    const principal = anneaux.reduce((a, b) => (aire(a) >= aire(b) ? a : b));
    const boites = anneaux.map(boiteEnglobante);
    const boite = [
      Math.min(...boites.map((b) => b[0])),
      Math.min(...boites.map((b) => b[1])),
      Math.max(...boites.map((b) => b[2])),
      Math.max(...boites.map((b) => b[3])),
    ];

    territoires[definition.id] = {
      ...definition,
      anneaux,
      centre: centroide(principal),
      point: projeter(definition.lon, definition.lat),
      superficie: anneaux.reduce((s, a) => s + aire(a), 0),
      bornes: boite,
      voisins: [...contours.voisins],
      voisinsMaritimes: [],
    };

    bornes = [
      Math.min(bornes[0], boite[0]),
      Math.min(bornes[1], boite[1]),
      Math.max(bornes[2], boite[2]),
      Math.max(bornes[3], boite[3]),
    ];
  }

  // Détroits et routes maritimes, déclarés à la main.
  for (const [x, y] of LIAISONS_MARITIMES) {
    const a = territoires[x];
    const b = territoires[y];
    if (!a || !b) {
      console.warn(`[carte] Liaison maritime invalide : ${x} ↔ ${y}`);
      continue;
    }
    if (!a.voisins.includes(b.id)) a.voisins.push(b.id);
    if (!b.voisins.includes(a.id)) b.voisins.push(a.id);
    if (!a.voisinsMaritimes.includes(b.id)) a.voisinsMaritimes.push(b.id);
    if (!b.voisinsMaritimes.includes(a.id)) b.voisinsMaritimes.push(a.id);
  }

  // Une adjacence n'a de sens que si les deux provinces existent.
  for (const territoire of Object.values(territoires)) {
    territoire.voisins = territoire.voisins.filter((v) => territoires[v]);
  }

  return { territoires, ordre: Object.keys(territoires), bornes };
}
