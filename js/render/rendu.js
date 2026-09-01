/* ============================================================
   rendu.js — dessin de la carte sur canvas 2D
   ============================================================ */

import { TERRAINS } from '../data/empires.js';
import { controleur } from '../core/etat.js';
import { armeDominante } from '../data/unites.js';

const COULEUR_MER = '#16283f';
const COULEUR_MER_PROFONDE = '#101d2f';
const COULEUR_TERRE_NEUTRE = '#3b4152';
const COULEUR_FRONTIERE = 'rgba(10, 14, 22, 0.5)';
/** Halo clair le long des côtes, qui détache les terres de la mer. */
const COULEUR_RIVAGE = 'rgba(150, 190, 235, 0.28)';

/** Les pions se dessinent au-dessus du centre pour ne pas masquer le nom. */
export const DECALAGE_PION = -13;

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
    const visibles = [];
    for (const id of etat.carte.ordre) {
      const territoire = etat.carte.territoires[id];
      if (this.estVisible(territoire.bornes, fenetre)) visibles.push(territoire);
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 1. Halo de rivage : un trait large sous les terres, qui déborde en mer
    //    et donne aux côtes un liseré clair.
    ctx.lineWidth = 4;
    ctx.strokeStyle = COULEUR_RIVAGE;
    for (const territoire of visibles) this.tracerAnneaux(ctx, territoire, true);

    // 2. Fond de terre. Les contours sont tracés province par province : un
    //    trait de la même couleur que le fond bouche les jointures d'un pixel
    //    que le lissage laisse entre deux voisines.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COULEUR_TERRE_NEUTRE;
    ctx.fillStyle = COULEUR_TERRE_NEUTRE;
    for (const territoire of visibles) this.tracerAnneaux(ctx, territoire, true, true);

    // 3. Couleur du souverain.
    for (const territoire of visibles) {
      const empire = etat.empires[controleur(territoire)];
      ctx.fillStyle = this.couleurTerritoire(empire, territoire, etat);
      ctx.strokeStyle = ctx.fillStyle;
      this.tracerAnneaux(ctx, territoire, true, true);
    }

    // 4. Provinces qui grondent : hachures d'autant plus denses que la
    //    révolte est haute.
    for (const territoire of visibles) {
      const revolte = territoire.revolte ?? 0;
      if (revolte < 35) continue;
      this.hachurer(ctx, territoire, revolte);
    }

    // 5. Frontières.
    ctx.lineWidth = Math.max(0.5, Math.min(1.4, 0.8 * cam.zoom));
    ctx.strokeStyle = COULEUR_FRONTIERE;
    for (const territoire of visibles) this.tracerAnneaux(ctx, territoire, true);

    // 6. Survol et sélection.
    if (etat.survol && etat.survol !== etat.selection) {
      this.souligner(ctx, etat.carte.territoires[etat.survol], 'rgba(255,255,255,0.35)', 1.5);
    }
    if (etat.selection) {
      const clignote = 0.55 + 0.25 * Math.sin(this.tempsAnimation / 320);
      this.souligner(ctx, etat.carte.territoires[etat.selection], `rgba(232,207,122,${clignote.toFixed(2)})`, 2.4);
    }

    // 7. Capitales et noms.
    this.dessinerMarqueurs(ctx, etat, visibles);

    // 8. Armées, marches et batailles, au premier plan.
    this.dessinerRouteSelectionnee(ctx, etat);
    this.dessinerBatailles(ctx, etat);
    this.dessinerArmees(ctx, etat);
  }

  /* ----------------------------------------------------------
     Armées
     ---------------------------------------------------------- */

  /** Position à l'écran d'une armée, marche comprise. */
  positionArmee(etat, armee) {
    const cam = this.camera;
    const ici = etat.carte.territoires[armee.lieu];
    if (!armee.route) return cam.versEcran(ici.centre[0], ici.centre[1]);

    const depuis = etat.carte.territoires[armee.route.depuis] ?? ici;
    const vers = etat.carte.territoires[armee.route.chemin[armee.route.etape]];
    if (!vers) return cam.versEcran(depuis.centre[0], depuis.centre[1]);
    const t = Math.max(0, Math.min(1, armee.route.progression));
    return cam.versEcran(
      depuis.centre[0] + (vers.centre[0] - depuis.centre[0]) * t,
      depuis.centre[1] + (vers.centre[1] - depuis.centre[1]) * t,
    );
  }

  /**
   * Positions des pions, empilement compris : plusieurs corps dans une
   * même province sont décalés pour rester distincts et cliquables.
   */
  calculerPionsArmees(etat) {
    const parLieu = new Map();
    const pions = [];
    for (const armee of Object.values(etat.armees)) {
      const [x, y] = this.positionArmee(etat, armee);
      const cle = armee.route ? armee.id : armee.lieu;
      const rang = parLieu.get(cle) ?? 0;
      parLieu.set(cle, rang + 1);
      pions.push({ armee, x, y: y + DECALAGE_PION + rang * 17 });
    }
    return pions;
  }

  dessinerArmees(ctx, etat) {
    const cam = this.camera;
    if (cam.zoom < 0.5) return;
    const compact = cam.zoom < 1.1;
    const largeur = compact ? 22 : 36;
    const hauteur = compact ? 12 : 17;

    for (const { armee, x, y } of this.calculerPionsArmees(etat)) {
      if (x < -40 || y < -40 || x > cam.largeur + 40 || y > cam.hauteur + 40) continue;
      const empire = etat.empires[armee.empire];
      const selectionnee = etat.selectionArmee === armee.id;
      const encre = contraste(empire.couleur);

      ctx.save();
      ctx.translate(x, y);

      // Corps du pion : rectangle à terre, pastille allongée en mer.
      const rayon = armee.domaine === 'mer' ? hauteur / 2 : 3;
      rectangleArrondi(ctx, -largeur / 2, -hauteur / 2, largeur, hauteur, rayon);
      ctx.fillStyle = empire.couleur;
      ctx.fill();
      ctx.lineWidth = selectionnee ? 2.2 : 1.1;
      ctx.strokeStyle = selectionnee ? '#f4e6b0' : 'rgba(8,10,16,.85)';
      ctx.stroke();

      // Jauge de motivation, collée sous le pion.
      const largeurJauge = largeur - 4;
      ctx.fillStyle = 'rgba(8,10,16,.6)';
      ctx.fillRect(-largeurJauge / 2, hauteur / 2 + 1, largeurJauge, 3);
      ctx.fillStyle = couleurMotivation(armee.motivation);
      ctx.fillRect(-largeurJauge / 2, hauteur / 2 + 1, (largeurJauge * armee.motivation) / 100, 3);

      if (!compact) {
        // Icône de l'arme dominante, puis l'effectif.
        dessinerArme(ctx, armeDominante(armee.unites), -largeur / 2 + 9, 0, encre);
        ctx.font = '600 11px "Iowan Old Style", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = encre;
        ctx.fillText(Math.round(armee.effectif), 5, 0.5);
      }

      // Une armée en marche porte un fanion ; au combat, une pointe rouge.
      if (armee.enBataille) {
        ctx.beginPath();
        ctx.arc(largeur / 2, -hauteur / 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#e0503a';
        ctx.fill();
      } else if (armee.route) {
        ctx.beginPath();
        ctx.moveTo(largeur / 2 - 1, -hauteur / 2);
        ctx.lineTo(largeur / 2 + 5, -hauteur / 2 + 3);
        ctx.lineTo(largeur / 2 - 1, -hauteur / 2 + 6);
        ctx.closePath();
        ctx.fillStyle = '#f4e6b0';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Chemin restant de l'armée sélectionnée. */
  dessinerRouteSelectionnee(ctx, etat) {
    const armee = etat.armees[etat.selectionArmee];
    if (!armee?.route) return;
    const cam = this.camera;

    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(232,207,122,.8)';
    ctx.beginPath();
    const [x0, y0] = this.positionArmee(etat, armee);
    ctx.moveTo(x0, y0);
    for (let i = armee.route.etape; i < armee.route.chemin.length; i++) {
      const t = etat.carte.territoires[armee.route.chemin[i]];
      const [x, y] = cam.versEcran(t.centre[0], t.centre[1]);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Hachures diagonales sur une province mécontente. Elles s'épaississent
   * avec la jauge, si bien qu'on lit la carte d'un coup d'œil.
   */
  hachurer(ctx, territoire, revolte) {
    const [x0, y0, x1, y1] = territoire.bornes;
    const cam = this.camera;
    const [ex0, ey0] = cam.versEcran(x0, y0);
    const [ex1, ey1] = cam.versEcran(x1, y1);
    const pas = Math.max(6, 22 - revolte / 6);

    ctx.save();
    ctx.beginPath();
    for (const anneau of territoire.anneaux) {
      for (let i = 0; i < anneau.length; i++) {
        const [x, y] = cam.versEcran(anneau[i][0], anneau[i][1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.clip();

    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `rgba(226, 92, 66, ${(0.18 + (revolte / 100) * 0.4).toFixed(2)})`;
    ctx.beginPath();
    const etendue = ex1 - ex0 + (ey1 - ey0);
    for (let d = -etendue; d < etendue; d += pas) {
      ctx.moveTo(ex0 + d, ey0);
      ctx.lineTo(ex0 + d + (ey1 - ey0), ey1);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Anneau battant sur les provinces où l'on se bat. */
  dessinerBatailles(ctx, etat) {
    const cam = this.camera;
    const pulsation = 0.5 + 0.5 * Math.sin(this.tempsAnimation / 220);
    for (const id of Object.keys(etat.batailles)) {
      const t = etat.carte.territoires[id];
      if (!t) continue;
      const [x, y] = cam.versEcran(t.centre[0], t.centre[1]);
      const rayon = 16 + 8 * pulsation;
      ctx.beginPath();
      ctx.arc(x, y, rayon, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(224,80,58,${(0.35 + 0.4 * pulsation).toFixed(2)})`;
      ctx.stroke();
    }
  }

  /** Armée sous un point écran, ou null. */
  armeeSous(etat, px, py) {
    const pions = this.calculerPionsArmees(etat);
    // On teste du dernier au premier : le pion dessiné au-dessus gagne.
    for (let i = pions.length - 1; i >= 0; i--) {
      const { armee, x, y } = pions[i];
      // Zone de préhension un peu plus large que le pion : les corps se
      // chevauchent et un clic au pixel près serait pénible.
      const compact = this.camera.zoom < 1.1;
      const dx = compact ? 14 : 21;
      const dy = compact ? 10 : 14;
      if (Math.abs(px - x) <= dx && Math.abs(py - y) <= dy) return armee.id;
    }
    return null;
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
    ctx.lineWidth = epaisseur;
    ctx.strokeStyle = couleur;
    this.tracerAnneaux(ctx, territoire, true);
  }

  /**
   * Trace les anneaux d'une province.
   * @param {boolean} contour applique le trait courant
   * @param {boolean} remplir applique le remplissage courant
   */
  tracerAnneaux(ctx, territoire, contour = false, remplir = false) {
    for (const anneau of territoire.anneaux) {
      this.tracerPolygone(ctx, anneau);
      if (remplir) ctx.fill();
      if (contour) ctx.stroke();
    }
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
      for (const anneau of t.anneaux) {
        if (dansPolygone(mx, my, anneau)) return id;
      }
    }
    return null;
  }
}

function rectangleArrondi(ctx, x, y, largeur, hauteur, rayon) {
  ctx.beginPath();
  ctx.moveTo(x + rayon, y);
  ctx.arcTo(x + largeur, y, x + largeur, y + hauteur, rayon);
  ctx.arcTo(x + largeur, y + hauteur, x, y + hauteur, rayon);
  ctx.arcTo(x, y + hauteur, x, y, rayon);
  ctx.arcTo(x, y, x + largeur, y, rayon);
  ctx.closePath();
}

/**
 * Icône d'une arme, dessinée au trait : un bloc pour l'infanterie, un sabre
 * pour la cavalerie, un boulet pour l'artillerie, une voile pour les navires.
 */
function dessinerArme(ctx, type, x, y, couleur) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = couleur;
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 1.5;
  switch (type) {
    case 'infanterie':
      ctx.fillRect(-4, -3, 8, 6);
      break;
    case 'cavalerie':
      ctx.beginPath();
      ctx.moveTo(-4.5, 3.5);
      ctx.lineTo(4.5, -3.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4.5, -3.5);
      ctx.lineTo(1.5, -3);
      ctx.lineTo(4, -0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'artillerie':
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ligne':
    case 'fregate':
      ctx.beginPath();
      ctx.moveTo(0, -4.5);
      ctx.lineTo(4, 3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      if (type === 'ligne') ctx.fill();
      else ctx.stroke();
      break;
    default:
      break;
  }
  ctx.restore();
}

export function couleurMotivation(motivation) {
  if (motivation >= 70) return '#5fbf72';
  if (motivation >= 45) return '#d9b23f';
  if (motivation >= 25) return '#d98a2b';
  return '#e0503a';
}

/** Noir ou blanc, selon ce qui se lit le mieux sur la couleur donnée. */
function contraste(hex) {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? '#14161f' : '#f2f2f6';
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
