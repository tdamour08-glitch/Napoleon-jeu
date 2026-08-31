/* ============================================================
   camera.js — déplacement et zoom sur la carte
   ============================================================ */

export class Camera {
  constructor(bornes) {
    this.bornes = bornes; // [minX, minY, maxX, maxY] de la carte utile
    this.x = (bornes[0] + bornes[2]) / 2;
    this.y = (bornes[1] + bornes[3]) / 2;
    this.zoom = 1;
    this.zoomMin = 0.25;
    this.zoomMax = 9;
    this.largeur = 1;
    this.hauteur = 1;
  }

  redimensionner(largeur, hauteur) {
    this.largeur = largeur;
    this.hauteur = hauteur;
    const [x0, y0, x1, y1] = this.bornes;
    // On ne descend jamais en dessous du zoom qui montre la carte entière.
    this.zoomMin = Math.min(largeur / (x1 - x0), hauteur / (y1 - y0)) * 0.85;
    this.zoom = Math.max(this.zoom, this.zoomMin);
    this.contraindre();
  }

  /** Monde → écran. */
  versEcran(x, y) {
    return [(x - this.x) * this.zoom + this.largeur / 2, (y - this.y) * this.zoom + this.hauteur / 2];
  }

  /** Écran → monde. */
  versMonde(px, py) {
    return [(px - this.largeur / 2) / this.zoom + this.x, (py - this.hauteur / 2) / this.zoom + this.y];
  }

  deplacer(dxEcran, dyEcran) {
    this.x -= dxEcran / this.zoom;
    this.y -= dyEcran / this.zoom;
    this.contraindre();
  }

  /** Zoom centré sur un point de l'écran. */
  zoomer(facteur, pxAncre, pyAncre) {
    const [mx, my] = this.versMonde(pxAncre, pyAncre);
    const nouveau = Math.max(this.zoomMin, Math.min(this.zoomMax, this.zoom * facteur));
    if (nouveau === this.zoom) return;
    this.zoom = nouveau;
    const [mx2, my2] = this.versMonde(pxAncre, pyAncre);
    this.x += mx - mx2;
    this.y += my - my2;
    this.contraindre();
  }

  /** Centre la vue sur un point monde, avec un zoom optionnel. */
  centrerSur(x, y, zoom) {
    this.x = x;
    this.y = y;
    if (zoom) this.zoom = Math.max(this.zoomMin, Math.min(this.zoomMax, zoom));
    this.contraindre();
  }

  /** Empêche la caméra de sortir complètement de la carte. */
  contraindre() {
    const [x0, y0, x1, y1] = this.bornes;
    const marge = 200;
    this.x = Math.max(x0 - marge, Math.min(x1 + marge, this.x));
    this.y = Math.max(y0 - marge, Math.min(y1 + marge, this.y));
  }

  /** Rectangle monde visible, avec marge. */
  fenetreVisible(marge = 40) {
    const [x0, y0] = this.versMonde(0, 0);
    const [x1, y1] = this.versMonde(this.largeur, this.hauteur);
    return [x0 - marge, y0 - marge, x1 + marge, y1 + marge];
  }
}
