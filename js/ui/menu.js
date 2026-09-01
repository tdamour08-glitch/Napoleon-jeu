/* ============================================================
   menu.js — écran de sélection de l'empire
   ============================================================ */

import { EMPIRES_JOUABLES } from '../data/empires.js';
import { TERRITOIRES } from '../data/monde.js';

/**
 * Affiche le menu et résout la promesse avec l'empire choisi et les règles.
 * @returns {Promise<{empire: string, options: object}>}
 */
export function choisirEmpire() {
  const liste = document.getElementById('liste-empires');
  const apercu = document.getElementById('apercu-empire');
  const bouton = document.getElementById('btn-commencer');
  let choix = null;

  liste.innerHTML = '';
  for (const empire of EMPIRES_JOUABLES) {
    const carte = document.createElement('button');
    carte.className = 'carte-empire';
    carte.style.setProperty('--couleur-empire', empire.couleur);
    carte.innerHTML = `
      <h3>${empire.nom}</h3>
      <div class="souverain">${empire.souverain}</div>
      <p class="resume">${empire.resume}</p>`;
    carte.addEventListener('click', () => {
      choix = empire.id;
      for (const autre of liste.children) autre.classList.remove('active');
      carte.classList.add('active');
      afficherApercu(apercu, empire);
      bouton.disabled = false;
    });
    liste.appendChild(carte);
  }

  return new Promise((resoudre) => {
    bouton.addEventListener('click', () => {
      if (!choix) return;
      resoudre({
        empire: choix,
        options: {
          doctrinesEgales: document.getElementById('opt-doctrines').checked,
          forcesEgales: document.getElementById('opt-forces').checked,
          agressivite: document.getElementById('opt-agressivite').value,
        },
      });
    });
  });
}

function afficherApercu(conteneur, empire) {
  const possessions = TERRITOIRES.filter((t) => t.maitre === empire.id);
  const capitale = possessions.find((t) => t.capitale);
  const colonies = possessions.filter((t) => t.colonie);
  const total = { bois: 0, eau: 0, charbon: 0, fer: 0, or: 0 };
  for (const t of possessions) {
    for (const cle of Object.keys(total)) total[cle] += t.gisements[cle];
  }
  const forces = Object.entries(total)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cle]) => cle);

  conteneur.innerHTML = `
    <h4>${empire.nom}</h4>
    <ul>
      <li>Capitale : <strong>${capitale ? capitale.nom : '—'}</strong></li>
      <li>Provinces : <strong>${possessions.length}</strong> dont <strong>${colonies.length}</strong> outre-mer</li>
      <li>Ressources dominantes : <strong>${forces.join(' et ')}</strong></li>
    </ul>`;
}
