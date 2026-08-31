/* ============================================================
   carte.js — construction de la carte politique
   ------------------------------------------------------------
   À partir des contours de continents et d'un point par territoire,
   on calcule le diagramme de Voronoï des capitales, découpé par la
   côte du continent. On obtient des frontières jointives, sans trous
   ni recouvrements, et l'adjacence est déduite des arêtes partagées.
   ============================================================ */

import { CONTINENTS, TERRITOIRES, LIAISONS_MARITIMES } from '../data/monde.js';
import {
  projeterPolygone,
  projeter,
  decouperDemiPlan,
  pointDansPolygone,
  centroide,
  aire,
  boiteEnglobante,
  nettoyerPolygone,
  distanceDroite,
} from './geo.js';

/** Longueur minimale (en unités monde) d'une arête pour valoir frontière. */
const LONGUEUR_FRONTIERE_MIN = 4;

/**
 * Construit la géométrie complète de la carte.
 * @returns {{
 *   continents: Array<{id:string, nom:string, contour:Array<[number,number]>}>,
 *   territoires: Object<string, object>,
 *   ordre: string[],
 *   bornes: [number, number, number, number]
 * }}
 */
export function construireCarte() {
  const continents = CONTINENTS.map((c) => ({
    id: c.id,
    nom: c.nom,
    contour: projeterPolygone(c.contour),
  }));

  // 1. Rattacher chaque territoire à son continent.
  const graines = TERRITOIRES.map((t) => ({
    def: t,
    point: projeter(t.lon, t.lat),
    continent: null,
  }));

  for (const graine of graines) {
    for (const continent of continents) {
      if (pointDansPolygone(graine.point, continent.contour)) {
        graine.continent = continent.id;
        break;
      }
    }
    if (!graine.continent) {
      console.warn(`[carte] Le territoire « ${graine.def.nom} » ne tombe sur aucun continent.`);
    }
  }

  // 2. Voronoï découpé, continent par continent.
  const territoires = {};
  for (const continent of continents) {
    const locaux = graines.filter((g) => g.continent === continent.id);
    for (const graine of locaux) {
      let cellule = continent.contour;
      for (const autre of locaux) {
        if (autre === graine) continue;
        const [ax, ay] = graine.point;
        const [bx, by] = autre.point;
        // Médiatrice [graine, autre] : on garde le côté de `graine`.
        const nx = 2 * (bx - ax);
        const ny = 2 * (by - ay);
        const c = ax * ax + ay * ay - (bx * bx + by * by);
        cellule = decouperDemiPlan(cellule, nx, ny, c);
        if (cellule.length < 3) break;
      }
      cellule = nettoyerPolygone(cellule);
      if (cellule.length < 3) {
        console.warn(`[carte] Cellule vide pour « ${graine.def.nom} ».`);
        continue;
      }
      territoires[graine.def.id] = {
        ...graine.def,
        continent: continent.id,
        polygone: cellule,
        centre: centroide(cellule),
        point: graine.point,
        superficie: aire(cellule),
        bornes: boiteEnglobante(cellule),
        voisins: [],
        voisinsMaritimes: [],
      };
    }
  }

  // 3. Adjacence terrestre : deux cellules voisines partagent un morceau de médiatrice.
  const ids = Object.keys(territoires);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = territoires[ids[i]];
      const b = territoires[ids[j]];
      if (a.continent !== b.continent) continue;
      if (!boitesProches(a.bornes, b.bornes)) continue;
      if (partagentUneArete(a, b)) {
        a.voisins.push(b.id);
        b.voisins.push(a.id);
      }
    }
  }

  // 4. Liaisons maritimes déclarées à la main.
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

  // 5. Bornes globales de la carte utile.
  let bornes = [Infinity, Infinity, -Infinity, -Infinity];
  for (const continent of continents) {
    const [x0, y0, x1, y1] = boiteEnglobante(continent.contour);
    bornes = [
      Math.min(bornes[0], x0),
      Math.min(bornes[1], y0),
      Math.max(bornes[2], x1),
      Math.max(bornes[3], y1),
    ];
  }

  return { continents, territoires, ordre: Object.keys(territoires), bornes };
}

/** Deux boîtes englobantes se touchent-elles (avec marge) ? */
function boitesProches(a, b, marge = 8) {
  return !(a[2] + marge < b[0] || b[2] + marge < a[0] || a[3] + marge < b[1] || b[3] + marge < a[1]);
}

/** Les deux cellules partagent-elles une arête de longueur suffisante ? */
function partagentUneArete(a, b) {
  const [ax, ay] = a.point;
  const [bx, by] = b.point;
  const nx = 2 * (bx - ax);
  const ny = 2 * (by - ay);
  const c = ax * ax + ay * ay - (bx * bx + by * by);

  let longueur = 0;
  const poly = a.polygone;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    if (distanceDroite(p, nx, ny, c) > 0.6) continue;
    if (distanceDroite(q, nx, ny, c) > 0.6) continue;
    longueur += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return longueur >= LONGUEUR_FRONTIERE_MIN;
}
