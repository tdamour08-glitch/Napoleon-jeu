/* ============================================================
   rendu.js — dessin de la carte sur canvas 2D
   ============================================================ */

import { TERRAINS } from '../data/empires.js';
import { controleur } from '../core/etat.js';

const COULEUR_MER = '#16283f';
const COULEUR_MER_PROFONDE = '#101d2f';
const COULEUR_TERRE_NEUTRE = '#3b4152';
const COULEUR_FRONTIERE = 'rgba(10, 14, 22, 0.55)';
const COULEUR_COTE = 'rgba(200, 220, 255, 0.18)';

export class Rendu {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./camera.js').Camera} camera
   */
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.tempsAnimation = 0;
    this.redimensionner();
  }

  redimensionner() {
    const largeur = this.canvas.clientWidth;
    const hauteur = this.canvas.clientHeight;
    this.canvas.width = Math.round(largeur * this.dpr);
    this.canvas.height = Math.round(hauteur * this.dpr);
    this.camera.redimensionner(largeur, hauteur);
  }

  /**
   * @param {object} etat
   * @param {number} dt millisecondes écoulées
   */
  dessiner(etat, dt) {
    this.tempsAnimation += dt;
    const ctx = this.ctx;
    const cam = this.camera;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cam.largeur, cam.hauteur);

    this.dessinerMer(ctx, cam);

    const fenetre = cam.fenetreVisible();

    // 1. Silhouette des continents : sert de fond et bouche les micro-jointures.
    ctx.lineJoin = 'round';
    for (const continent of etat.carte.continents) {
      this.tracerPolygone(ctx, continent.contour);
      ctx.fillStyle = COULEUR_TERRE_NEUTRE;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COULEUR_TERRE_NEUTRE;
      ctx.stroke();
    }

    // 2. Territoires.
    const visibles = [];
    for (const id of etat.carte.ordre) {
      const territoire = etat.carte.territoires[id];
      if (!this.estVisible(territoire.bornes, fenetre)) continue;
      visibles.push(territoire);
      const empire = etat.empires[controleur(territoire)];
      this.tracerPolygone(ctx, territoire.polygone);
      ctx.fillStyle = this.couleurTerritoire(empire, territoire, etat);
      ctx.fill();
    }

    // 3. Frontières.
    ctx.lineWidth = Math.max(0.6, Math.min(1.6, 0.9 * cam.zoom));
    ctx.strokeStyle = COULEUR_FRONTIERE;
    for (const territoire of visibles) {
      this.tracerPolygone(ctx, territoire.polygone);
      ctx.stroke();
    }

    // 4. Traits de côte.
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = COULEUR_COTE;
    for (const continent of etat.carte.continents) {
      this.tracerPolygone(ctx, continent.contour);
      ctx.stroke();
    }

    // 5. Survol et sélection.
    if (etat.survol && etat.survol !== etat.selection) {
      this.souligner(ctx, etat.carte.territoires[etat.survol], 'rgba(255,255,255,0.35)', 1.5);
    }
    if (etat.selection) {
      const clignote = 0.55 + 0.25 * Math.sin(this.tempsAnimation / 320);
      this.souligner(ctx, etat.carte.territoires[etat.selection], `rgba(232,207,122,${clignote.toFixed(2)})`, 2.4);
    }

    // 6. Capitales et noms.
    this.dessinerMarqueurs(ctx, etat, visibles);
  }

  dessinerMer(ctx, cam) {
    const degrade = ctx.createLinearGradient(0, 0, 0, cam.hauteur);
    degrade.addColorStop(0, COULEUR_MER_PROFONDE);
    degrade.addColorStop(0.5, COULEUR_MER);
    degrade.addColorStop(1, COULEUR_MER_PROFONDE);
    ctx.fillStyle = degrade;
    ctx.fillRect(0, 0, cam.largeur, cam.hauteur);
  }

  dessinerMarqueurs(ctx, etat, visibles) {
    const cam = this.camera;
    const afficherNoms = cam.zoom > 1.6;
    const afficherTous = cam.zoom > 3.2;

    for (const territoire of visibles) {
      const [cx, cy] = cam.versEcran(territoire.centre[0], territoire.centre[1]);
      const empire = etat.empires[controleur(territoire)];

      if (territoire.capitale && cam.zoom > 0.7) {
        ctx.beginPath();
        ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = '#f4e6b0';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.stroke();
      }

      if (!afficherNoms) continue;
      if (!afficherTous && territoire.superficie < 900 && !territoire.capitale) continue;

      ctx.font = `${territoire.capitale ? 600 : 400} ${Math.min(15, 9 + cam.zoom)}px "Iowan Old Style", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const decalage = territoire.capitale ? 13 : 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8,10,16,.75)';
      ctx.strokeText(territoire.nom, cx, cy + decalage);
      ctx.fillStyle = empire ? '#f1f1f5' : '#c9ccd6';
      ctx.fillText(territoire.nom, cx, cy + decalage);
    }
  }

  souligner(ctx, territoire, couleur, epaisseur) {
    if (!territoire) return;
    this.tracerPolygone(ctx, territoire.polygone);
    ctx.lineWidth = epaisseur;
    ctx.strokeStyle = couleur;
    ctx.stroke();
  }

  tracerPolygone(ctx, poly) {
    const cam = this.camera;
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const [x, y] = cam.versEcran(poly[i][0], poly[i][1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /** Couleur d'un territoire : teinte de l'empire, nuancée par le terrain. */
  couleurTerritoire(empire, territoire, etat) {
    if (!empire) return COULEUR_TERRE_NEUTRE;
    const teinte = TERRAINS[territoire.terrain]?.teinte ?? 0;
    let couleur = eclaircir(empire.couleur, teinte);
    // Un territoire occupé mais non annexé est affiché plus pâle et hachuré (phase 5).
    if (territoire.occupant && territoire.occupant !== territoire.maitre) {
      couleur = eclaircir(couleur, 0.18);
    }
    if (etat.joueur && empire.id === etat.joueur) couleur = eclaircir(couleur, 0.06);
    return couleur;
  }

  estVisible(bornes, fenetre) {
    return !(bornes[2] < fenetre[0] || bornes[0] > fenetre[2] || bornes[3] < fenetre[1] || bornes[1] > fenetre[3]);
  }

  /** Territoire situé sous un point écran, ou null. */
  territoireSous(etat, px, py) {
    const [mx, my] = this.camera.versMonde(px, py);
    for (const id of etat.carte.ordre) {
      const t = etat.carte.territoires[id];
      const b = t.bornes;
      if (mx < b[0] || mx > b[2] || my < b[1] || my > b[3]) continue;
      if (dansPolygone(mx, my, t.polygone)) return id;
    }
    return null;
  }
}

function dansPolygone(x, y, poly) {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Éclaircit (t > 0) ou assombrit (t < 0) une couleur hexadécimale. */
export function eclaircir(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let v = (n >> 8) & 255;
  let b = n & 255;
  if (t >= 0) {
    r += (255 - r) * t;
    v += (255 - v) * t;
    b += (255 - b) * t;
  } else {
    r *= 1 + t;
    v *= 1 + t;
    b *= 1 + t;
  }
  const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(v)}${c(b)}`;
}
