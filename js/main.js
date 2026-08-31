/* ============================================================
   main.js — assemblage et contrôles
   ============================================================ */

import { creerPartie, journaliser, avancerJour } from './core/etat.js';
import {
  recalculerEconomie,
  appliquerJourEconomie,
  gererEconomieBots,
  lancerChantier,
  echanger,
} from './core/economie.js';
import { Moteur } from './core/moteur.js';
import { Camera } from './render/camera.js';
import { Rendu } from './render/rendu.js';
import { choisirEmpire } from './ui/menu.js';
import { Interface } from './ui/interface.js';
import { Guide } from './ui/guide.js';

async function demarrer() {
  const idEmpire = await choisirEmpire();

  document.getElementById('ecran-menu').classList.add('cache');
  document.getElementById('ecran-jeu').classList.remove('cache');

  const etat = creerPartie(idEmpire);
  recalculerEconomie(etat);

  const canvas = document.getElementById('carte');
  const camera = new Camera(etat.carte.bornes);
  const rendu = new Rendu(canvas, camera);

  const centrerSurTerritoire = (id) => {
    const t = etat.carte.territoires[id];
    if (!t) return;
    etat.selection = id;
    camera.centrerSur(t.centre[0], t.centre[1], Math.max(camera.zoom, 2.6));
  };

  const ui = new Interface(etat, {
    centrerSurTerritoire,
    deselectionner: () => {
      etat.selection = null;
    },
    developper: (id) => {
      const territoire = etat.carte.territoires[id];
      const verdict = lancerChantier(etat, territoire);
      if (!verdict.possible) journaliser(etat, verdict.motif);
      recalculerEconomie(etat);
    },
    echanger: (ressource, sens) => {
      const resultat = echanger(etat, etat.empires[etat.joueur], ressource, sens);
      if (!resultat.ok) journaliser(etat, resultat.motif);
    },
  });

  // Le guide met le jeu en pause tant qu'il est ouvert.
  const guide = new Guide({
    surOuverture: () => {
      etat.enPause = true;
    },
  });

  // Vue initiale : la capitale du joueur.
  const empireJoueur = etat.empires[idEmpire];
  const capitale =
    empireJoueur.territoires.map((id) => etat.carte.territoires[id]).find((t) => t.capitale) ??
    etat.carte.territoires[empireJoueur.territoires[0]];
  camera.centrerSur(capitale.centre[0], capitale.centre[1], 2.4);
  etat.selection = capitale.id;

  journaliser(etat, `<strong>${empireJoueur.nom}</strong> : vous en prenez la tête.`);
  journaliser(etat, 'Les chancelleries d\'Europe observent vos premiers pas.');

  const moteur = new Moteur(
    etat,
    (e) => surJour(e),
    (e, dt) => {
      rendu.dessiner(e, dt);
      ui.rafraichir();
    },
  );

  brancherControles(canvas, camera, rendu, etat, moteur, guide, ui, centrerSurTerritoire);
  window.addEventListener('resize', () => rendu.redimensionner());

  moteur.demarrer();
  guide.ouvrirAuPremierLancement();

  // Accès depuis la console pour le débogage.
  window.jeu = { etat, camera, rendu, moteur, ui, guide };
}

/** Un jour de jeu. Les armées et la diplomatie s'y grefferont aux phases suivantes. */
function surJour(etat) {
  avancerJour(etat);
  appliquerJourEconomie(etat);
  gererEconomieBots(etat);
}

function brancherControles(canvas, camera, rendu, etat, moteur, guide, ui, centrerSurTerritoire) {
  let glisse = false;
  let deplace = false;
  let dernierX = 0;
  let dernierY = 0;

  canvas.addEventListener('pointerdown', (ev) => {
    glisse = true;
    deplace = false;
    dernierX = ev.clientX;
    dernierY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('glisse');
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (glisse) {
      const dx = ev.clientX - dernierX;
      const dy = ev.clientY - dernierY;
      if (Math.abs(dx) + Math.abs(dy) > 3) deplace = true;
      camera.deplacer(dx, dy);
      dernierX = ev.clientX;
      dernierY = ev.clientY;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    etat.survol = rendu.territoireSous(etat, ev.clientX - rect.left, ev.clientY - rect.top);
  });

  const relacher = (ev) => {
    if (!glisse) return;
    glisse = false;
    canvas.classList.remove('glisse');
    if (deplace) return;
    const rect = canvas.getBoundingClientRect();
    etat.selection = rendu.territoireSous(etat, ev.clientX - rect.left, ev.clientY - rect.top);
  };
  canvas.addEventListener('pointerup', relacher);
  canvas.addEventListener('pointercancel', () => {
    glisse = false;
    canvas.classList.remove('glisse');
  });

  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      camera.zoomer(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX - rect.left, ev.clientY - rect.top);
    },
    { passive: false },
  );

  document.getElementById('btn-pause').addEventListener('click', () => moteur.basculerPause());
  for (const bouton of document.querySelectorAll('.btn-vitesse')) {
    bouton.addEventListener('click', () => moteur.definirVitesse(Number(bouton.dataset.vitesse)));
  }

  window.addEventListener('keydown', (ev) => {
    // Le guide capte Échap en priorité.
    if (guide.ouvert && ev.code === 'Escape') {
      guide.fermer();
      return;
    }
    switch (ev.code) {
      case 'Space':
        ev.preventDefault();
        moteur.basculerPause();
        break;
      case 'Digit1':
        moteur.definirVitesse(1);
        break;
      case 'Digit2':
        moteur.definirVitesse(2);
        break;
      case 'Digit3':
        moteur.definirVitesse(4);
        break;
      case 'KeyE':
        ui.basculerEconomie();
        break;
      case 'KeyH':
        guide.basculer();
        break;
      case 'KeyC': {
        const empire = etat.empires[etat.joueur];
        const capitale = empire.territoires
          .map((id) => etat.carte.territoires[id])
          .find((t) => t.capitale);
        if (capitale) centrerSurTerritoire(capitale.id);
        break;
      }
      case 'Escape':
        etat.selection = null;
        break;
      default:
        break;
    }
  });

  // Déplacement au clavier, indépendant de la boucle de jeu.
  const touches = new Set();
  window.addEventListener('keydown', (ev) => touches.add(ev.code));
  window.addEventListener('keyup', (ev) => touches.delete(ev.code));
  const deplacementClavier = () => {
    const pas = 14;
    let dx = 0;
    let dy = 0;
    if (touches.has('ArrowLeft') || touches.has('KeyA')) dx += pas;
    if (touches.has('ArrowRight') || touches.has('KeyD')) dx -= pas;
    if (touches.has('ArrowUp') || touches.has('KeyW')) dy += pas;
    if (touches.has('ArrowDown') || touches.has('KeyS')) dy -= pas;
    if (dx || dy) camera.deplacer(dx, dy);
    requestAnimationFrame(deplacementClavier);
  };
  requestAnimationFrame(deplacementClavier);
}

demarrer();
