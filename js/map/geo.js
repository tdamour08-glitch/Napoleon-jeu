/* ============================================================
   geo.js — projection cartographique et mesures de polygones
   ============================================================ */

/** Largeur du monde projeté, en unités "monde". */
export const LARGEUR_MONDE = 4200;

/** Latitude au-delà de laquelle on écrête (Mercator diverge aux pôles). */
const LAT_MAX = 80;

/**
 * Projection de Mercator.
 * @param {number} lon degrés
 * @param {number} lat degrés
 * @returns {[number, number]} coordonnées monde
 */
export function projeter(lon, lat) {
  const l = Math.max(-LAT_MAX, Math.min(LAT_MAX, lat));
  const rad = (l * Math.PI) / 180;
  const x = ((lon + 180) / 360) * LARGEUR_MONDE;
  const y = LARGEUR_MONDE * (0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI));
  return [x, y];
}

/** Projette une liste de couples [lon, lat]. */
export function projeterPolygone(points) {
  return points.map(([lon, lat]) => projeter(lon, lat));
}

/* ------------------------------------------------------------
   Polygones : aire, centroïde, boîte englobante
   ------------------------------------------------------------ */

/** Aire signée (positive si le polygone tourne dans le sens horaire en repère écran). */
export function aireSignee(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function aire(poly) {
  return Math.abs(aireSignee(poly));
}

/** Centroïde géométrique ; retombe sur la moyenne des sommets si l'aire est nulle. */
export function centroide(poly) {
  const a = aireSignee(poly);
  if (Math.abs(a) < 1e-9) {
    const m = poly.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [m[0] / poly.length, m[1] / poly.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Boîte englobante [minX, minY, maxX, maxY]. */
export function boiteEnglobante(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

