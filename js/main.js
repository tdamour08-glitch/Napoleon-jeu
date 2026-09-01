/* ============================================================
   main.js — assemblage et contrôles
   ============================================================ */

import { creerPartie, journaliser } from './core/etat.js';
import { recalculerEconomie, initialiserReserves, lancerChantier, echanger } from './core/economie.js';
import { jouerUnJour } from './core/tour.js';
import { lancerLevee, ordonnerMarche, annulerMarche, detacher } from './core/armees.js';
import {
  declarerGuerre,
  rompreAlliance,
  conclureAlliance,
} from './core/diplomatie.js';
import { repondreAlliance } from './core/ia_strategie.js';
import { appliquerTraite, evaluerTraite, partEuropeenne, GRANDES_PUISSANCES } from './core/traites.js';
import { TableDesNegociations } from './ui/traite.js';
import { basculerPolitique, rembourser, IMPOT_MIN, IMPOT_MAX } from './core/politiques.js';
import { Moteur } from './core/moteur.js';
import { Camera } from './render/camera.js';
import { Rendu } from './render/rendu.js';
import { choisirEmpire } from './ui/menu.js';
import { Interface } from './ui/interface.js';
import { Guide } from './ui/guide.js';

async function demarrer() {
  const { empire: idEmpire, options } = await choisirEmpire();

  document.getElementById('ecran-menu').classList.add('cache');
  document.getElementById('ecran-jeu').classList.remove('cache');

  const etat = creerPartie(idEmpire, options);
  recalculerEconomie(etat);
  initialiserReserves(etat);

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
    lever: (id) => {
      const verdict = lancerLevee(etat, etat.carte.territoires[id]);
      if (!verdict.possible) journaliser(etat, verdict.motif);
      recalculerEconomie(etat);
    },
    declarerGuerre: (idCible) => {
      declarerGuerre(etat, etat.joueur, idCible);
      recalculerEconomie(etat);
    },
    proposerAlliance: (idCible) => {
      const reponse = repondreAlliance(etat, idCible, etat.joueur);
      ui.annoncerReponse(reponse.motif, reponse.accepte);
    },
    negocier: (idCible) => {
      etat.enPause = true;
      table.ouvrir(idCible);
    },
    rompreAlliance: (idCible) => {
      rompreAlliance(etat, etat.joueur, idCible);
    },
    repondreOffre: (cle, type, accepte) => {
      const registre = type === 'alliance' ? etat.offresAlliance : etat.offresPaix;
      const offre = registre[cle];
      delete registre[cle];
      if (!offre) return;
      if (!accepte) {
        ui.annoncerReponse('Vous déclinez la proposition.', false);
        return;
      }
      if (type === 'alliance') {
        conclureAlliance(etat, etat.joueur, offre.demandeur);
        ui.annoncerReponse('Vous acceptez l\'alliance.', true);
        return;
      }
      appliquerTraite(etat, offre.traite);
      recalculerEconomie(etat);
      ui.annoncerReponse('Le traité est signé.', true);
    },
    definirImpot: (taux) => {
      const empire = etat.empires[etat.joueur];
      empire.tauxImposition = Math.max(IMPOT_MIN, Math.min(IMPOT_MAX, taux));
      recalculerEconomie(etat);
    },
    basculerPolitique: (idPolitique) => {
      basculerPolitique(etat, etat.empires[etat.joueur], idPolitique);
      recalculerEconomie(etat);
    },
    rembourser: (montant) => {
      rembourser(etat.empires[etat.joueur], montant);
    },
    centrerSurEmpire: (idEmpire) => {
      const empire = etat.empires[idEmpire];
      const capitale =
        empire.territoires.map((id) => etat.carte.territoires[id]).find((t) => t.capitale) ??
        etat.carte.territoires[empire.territoires[0]];
      if (capitale) centrerSurTerritoire(capitale.id);
    },
    selectionnerArmee: (id) => {
      etat.selectionArmee = id;
    },
    faireHalte: (id) => {
      const armee = etat.armees[id];
      if (armee) annulerMarche(armee);
    },
  });

  const table = new TableDesNegociations(etat, {
    signer: (traite) => {
      if (!evaluerTraite(etat, traite).accepte) return;
      appliquerTraite(etat, traite);
      recalculerEconomie(etat);
      ui.annoncerReponse('Le traité est signé.', true);
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

  let finAffichee = false;
  const moteur = new Moteur(
    etat,
    (e) => jouerUnJour(e),
    (e, dt) => {
      rendu.dessiner(e, dt);
      ui.rafraichir();
      if (e.fin && !finAffichee) {
        finAffichee = true;
        e.enPause = true;
        afficherFinDePartie(e);
      }
    },
  );

  brancherControles(canvas, camera, rendu, etat, moteur, guide, table, ui, centrerSurTerritoire);
  window.addEventListener('resize', () => rendu.redimensionner());

  moteur.demarrer();
  guide.ouvrirAuPremierLancement();

  // Accès depuis la console pour le débogage.
  window.jeu = { etat, camera, rendu, moteur, ui, guide };
}



/** Écran de fin : verdict, motif et bilan des grandes puissances. */
function afficherFinDePartie(etat) {
  const { type, vainqueur, detail } = etat.fin;
  const empire = etat.empires[vainqueur];
  const gagne = type !== 'defaite' && vainqueur === etat.joueur;

  const titres = {
    elimination: 'Victoire par élimination',
    traites: 'Victoire par les traités',
    hegemonie: 'Victoire par hégémonie',
    defaite: 'Défaite',
  };
  const titre = gagne || type === 'defaite' ? titres[type] : `${empire.nom} l'emporte`;

  document.getElementById('titre-fin').textContent = titre;
  document.getElementById('titre-fin').style.color = gagne ? 'var(--or-clair)' : '#e07b6a';
  document.getElementById('detail-fin').textContent = detail;

  document.getElementById('bilan-fin').innerHTML = GRANDES_PUISSANCES.map((id) => {
    const e = etat.empires[id];
    const p = partEuropeenne(etat, id);
    return `
      <div class="ligne-bilan">
        <span class="pastille" style="background:${e.couleur}"></span>
        <span class="nom ${e.eliminee ? 'eliminee' : ''}">${e.nom}</span>
        <span class="part">${e.eliminee ? 'éliminée' : `${p.tenues} prov. · ${Math.round(p.part * 100)} %`}</span>
      </div>`;
  }).join('');

  // Une partie terminée referme les fenêtres encore ouvertes.
  document.getElementById('ecran-traite').classList.add('cache');
  document.getElementById('ecran-guide').classList.add('cache');
  document.getElementById('ecran-fin').classList.remove('cache');
}

function brancherControles(canvas, camera, rendu, etat, moteur, guide, table, ui, centrerSurTerritoire) {
  document.getElementById('btn-fermer-fin').addEventListener('click', () => {
    document.getElementById('ecran-fin').classList.add('cache');
  });
  let glisse = false;
  let deplace = false;
  let dernierX = 0;
  let dernierY = 0;

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return; // le bouton droit sert aux ordres de marche
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
    if (ev.button !== 0 || !glisse) return;
    glisse = false;
    canvas.classList.remove('glisse');
    if (deplace) return;
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const idArmee = rendu.armeeSous(etat, px, py);
    if (idArmee) {
      etat.selectionArmee = idArmee;
      etat.selection = etat.armees[idArmee].lieu;
    } else {
      etat.selectionArmee = null;
      etat.selection = rendu.territoireSous(etat, px, py);
    }
  };
  canvas.addEventListener('pointerup', relacher);
  canvas.addEventListener('pointercancel', () => {
    glisse = false;
    canvas.classList.remove('glisse');
  });

  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const armee = etat.armees[etat.selectionArmee];
    if (!armee || armee.empire !== etat.joueur) return;
    const rect = canvas.getBoundingClientRect();
    const destination = rendu.territoireSous(etat, ev.clientX - rect.left, ev.clientY - rect.top);
    if (!destination) return;

    if (ev.shiftKey) {
      const detachement = detacher(etat, armee, destination);
      if (!detachement) journaliser(etat, 'Ce corps est trop réduit pour se diviser.');
      return;
    }
    if (!ordonnerMarche(etat, armee, destination)) {
      journaliser(etat, `Aucune route ne mène à ${etat.carte.territoires[destination].nom}.`);
    }
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
    // Les fenêtres modales captent Échap en priorité.
    if (ev.code === 'Escape' && table.ouvert) {
      table.fermer();
      return;
    }
    if (ev.code === 'Escape' && guide.ouvert) {
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
      case 'KeyD':
        ui.basculerDiplomatie();
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
        if (etat.selectionArmee) etat.selectionArmee = null;
        else etat.selection = null;
        break;
      default:
        break;
    }
  });

  // Déplacement au clavier : les flèches seules. Les lettres sont réservées
  // aux commandes (E, D, H, C), qui entraient en conflit avec ZQSD/WASD.
  const touches = new Set();
  window.addEventListener('keydown', (ev) => touches.add(ev.code));
  window.addEventListener('keyup', (ev) => touches.delete(ev.code));
  const deplacementClavier = () => {
    const pas = 14;
    let dx = 0;
    let dy = 0;
    if (touches.has('ArrowLeft')) dx += pas;
    if (touches.has('ArrowRight')) dx -= pas;
    if (touches.has('ArrowUp')) dy += pas;
    if (touches.has('ArrowDown')) dy -= pas;
    if (dx || dy) camera.deplacer(dx, dy);
    requestAnimationFrame(deplacementClavier);
  };
  requestAnimationFrame(deplacementClavier);
}

demarrer();
