/* ============================================================
   geo.js — projection cartographique et utilitaires de polygones
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
   Polygones : aire, centroïde, appartenance, découpe
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

/** Test d'appartenance par lancer de rayon. */
export function pointDansPolygone(point, poly) {
  const [x, y] = point;
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const croise = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (croise) dedans = !dedans;
  }
  return dedans;
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

/**
 * Découpe un polygone convexe ou concave par un demi-plan (Sutherland–Hodgman).
 * Le demi-plan conservé est { p | a·p + b·p + c <= 0 } avec droite (nx, ny, c).
 * @param {Array<[number,number]>} poly
 * @param {number} nx composante x de la normale
 * @param {number} ny composante y de la normale
 * @param {number} c terme constant
 */
export function decouperDemiPlan(poly, nx, ny, c) {
  if (poly.length === 0) return poly;
  const dedans = (p) => nx * p[0] + ny * p[1] + c <= 0;
  const intersection = (p, q) => {
    const dp = nx * p[0] + ny * p[1] + c;
    const dq = nx * q[0] + ny * q[1] + c;
    const t = dp / (dp - dq);
    return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
  };

  const sortie = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const courant = poly[i];
    const suivant = poly[(i + 1) % n];
    const cDedans = dedans(courant);
    const sDedans = dedans(suivant);
    if (cDedans) {
      sortie.push(courant);
      if (!sDedans) sortie.push(intersection(courant, suivant));
    } else if (sDedans) {
      sortie.push(intersection(courant, suivant));
    }
  }
  return sortie;
}

/** Distance d'un point à une droite définie par (nx, ny, c) normalisée. */
export function distanceDroite(point, nx, ny, c) {
  const norme = Math.hypot(nx, ny) || 1;
  return Math.abs(nx * point[0] + ny * point[1] + c) / norme;
}

/** Supprime les sommets quasi confondus (nettoyage après découpes successives). */
export function nettoyerPolygone(poly, epsilon = 0.35) {
  if (poly.length < 3) return poly;
  const sortie = [];
  for (const p of poly) {
    const dernier = sortie[sortie.length - 1];
    if (!dernier || Math.hypot(p[0] - dernier[0], p[1] - dernier[1]) > epsilon) sortie.push(p);
  }
  while (
    sortie.length > 2 &&
    Math.hypot(sortie[0][0] - sortie[sortie.length - 1][0], sortie[0][1] - sortie[sortie.length - 1][1]) <= epsilon
  ) {
    sortie.pop();
  }
  return sortie;
}
