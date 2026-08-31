/* ============================================================
   interface.js — bandeau, panneaux latéraux, journal
   ============================================================ */

import { RESSOURCES, TERRAINS } from '../data/empires.js';
import { controleur, dateEnTexte } from '../core/etat.js';

export class Interface {
  /**
   * @param {object} etat
   * @param {{ centrerSurTerritoire: (id:string)=>void }} actions
   */
  constructor(etat, actions) {
    this.etat = etat;
    this.actions = actions;
    this.el = {
      ecusson: document.getElementById('ecusson-joueur'),
      nomEmpire: document.getElementById('nom-empire-joueur'),
      statsJoueur: document.getElementById('stats-joueur'),
      ressources: document.getElementById('bandeau-ressources'),
      date: document.getElementById('date-jeu'),
      pause: document.getElementById('btn-pause'),
      voilePause: document.getElementById('voile-pause'),
      panneauTerritoire: document.getElementById('panneau-territoire'),
      listePuissances: document.getElementById('liste-puissances'),
      journal: document.getElementById('journal'),
    };
    this.derniereSelection = undefined;
    this.dernierJournal = -1;
    this.initialiserBandeau();
  }

  initialiserBandeau() {
    const joueur = this.etat.empires[this.etat.joueur];
    this.el.ecusson.style.background = joueur.couleur;
    this.el.nomEmpire.textContent = joueur.nom;

    this.el.ressources.innerHTML = RESSOURCES.map(
      (r) => `
      <div class="ressource" title="${r.nom}">
        <span class="pastille" style="background:${r.couleur}"></span>
        <span class="valeur" data-ressource="${r.id}">0</span>
        <span class="nom">${r.nom}</span>
      </div>`,
    ).join('');
  }

  /** Rafraîchit tout ce qui change d'une image à l'autre. */
  rafraichir() {
    const etat = this.etat;
    const joueur = etat.empires[etat.joueur];

    this.el.date.textContent = dateEnTexte(etat.date);
    this.el.pause.textContent = etat.enPause ? '▶' : 'II';
    this.el.voilePause.classList.toggle('visible', etat.enPause);
    for (const bouton of document.querySelectorAll('.btn-vitesse')) {
      bouton.classList.toggle('actif', !etat.enPause && Number(bouton.dataset.vitesse) === etat.vitesse);
    }

    this.el.statsJoueur.textContent =
      `${joueur.territoires.length} province${joueur.territoires.length > 1 ? 's' : ''} · ${joueur.souverain}`;

    for (const r of RESSOURCES) {
      const cible = this.el.ressources.querySelector(`[data-ressource="${r.id}"]`);
      if (cible) {
        cible.textContent = Math.floor(joueur.stocks[r.id]);
        cible.title = `+${joueur.production[r.id].toFixed(1)} / jour`;
      }
    }

    this.rafraichirPuissances();
    this.rafraichirJournal();

    if (this.derniereSelection !== etat.selection) {
      this.derniereSelection = etat.selection;
      this.afficherTerritoire(etat.selection);
    }
  }

  rafraichirPuissances() {
    const etat = this.etat;
    const classement = Object.values(etat.empires)
      .filter((e) => e.vivant)
      .sort((a, b) => b.territoires.length - a.territoires.length);

    const signature = classement.map((e) => `${e.id}:${e.territoires.length}`).join('|');
    if (signature === this.signaturePuissances) return;
    this.signaturePuissances = signature;

    this.el.listePuissances.innerHTML = classement
      .map(
        (e) => `
        <div class="ligne-puissance ${e.id === etat.joueur ? 'joueur' : ''}" data-empire="${e.id}">
          <span class="pastille" style="background:${e.couleur}"></span>
          <span class="nom">${e.nom}</span>
          <span class="compte">${e.territoires.length}</span>
        </div>`,
      )
      .join('');

    for (const ligne of this.el.listePuissances.children) {
      ligne.addEventListener('click', () => {
        const empire = etat.empires[ligne.dataset.empire];
        const capitale = empire.territoires
          .map((id) => etat.carte.territoires[id])
          .find((t) => t.capitale) ?? etat.carte.territoires[empire.territoires[0]];
        if (capitale) this.actions.centrerSurTerritoire(capitale.id);
      });
    }
  }

  rafraichirJournal() {
    if (this.etat.journal.length === this.dernierJournal) return;
    this.dernierJournal = this.etat.journal.length;
    this.el.journal.innerHTML = this.etat.journal
      .slice(0, 20)
      .map(
        (e) =>
          `<div class="entree"><span class="horodatage">${dateEnTexte(e.date)}</span>${e.texte}</div>`,
      )
      .join('');
  }

  /** Détail d'un territoire dans le panneau de droite. */
  afficherTerritoire(id) {
    const panneau = this.el.panneauTerritoire;
    if (!id) {
      panneau.classList.add('cache');
      return;
    }
    const etat = this.etat;
    const t = etat.carte.territoires[id];
    const maitre = etat.empires[t.maitre];
    const occupant = t.occupant ? etat.empires[t.occupant] : null;
    const tenu = etat.empires[controleur(t)];

    const gisements = RESSOURCES.map((r) => {
      const valeur = t.gisements[r.id];
      return `
        <div class="gisement">
          <span class="pastille" style="background:${r.couleur}"></span>
          <span class="etiquette">${r.nom}</span>
          <span class="barre"><i style="width:${(valeur / 3) * 100}%;background:${r.couleur}"></i></span>
        </div>`;
    }).join('');

    const voisins = t.voisins
      .map((v) => {
        const vt = etat.carte.territoires[v];
        const maritime = t.voisinsMaritimes.includes(v);
        return `<span class="puce-voisin ${maritime ? 'maritime' : ''}" data-territoire="${v}"
                 title="${maritime ? 'Liaison maritime' : 'Frontière terrestre'}">${vt.nom}</span>`;
      })
      .join('');

    panneau.classList.remove('cache');
    panneau.innerHTML = `
      <button class="fermer-panneau" title="Fermer (Échap)">×</button>
      <h2>${t.nom}</h2>
      <div class="ligne-proprietaire">
        <span class="pastille" style="background:${tenu.couleur}"></span>
        ${occupant ? `occupé par ${occupant.nom} — souveraineté ${maitre.nom}` : maitre.nom}
      </div>

      <div class="bloc">
        <h3>Province</h3>
        <div class="paire"><span>Terrain</span><span>${TERRAINS[t.terrain]?.nom ?? t.terrain}</span></div>
        <div class="paire"><span>Population</span><span>${'●'.repeat(t.population)}${'○'.repeat(3 - t.population)}</span></div>
        <div class="paire"><span>Motivation</span><span>${Math.round(t.motivation)} / 100</span></div>
        ${t.capitale ? '<div class="paire"><span>Statut</span><span>Capitale</span></div>' : ''}
        ${t.colonie ? '<div class="paire"><span>Statut</span><span>Colonie</span></div>' : ''}
      </div>

      <div class="bloc">
        <h3>Gisements</h3>
        <div class="gisements">${gisements}</div>
      </div>

      <div class="bloc">
        <h3>Frontières</h3>
        <div class="liste-voisins">${voisins}</div>
      </div>`;

    for (const puce of panneau.querySelectorAll('.puce-voisin')) {
      puce.addEventListener('click', () => this.actions.centrerSurTerritoire(puce.dataset.territoire));
    }
    panneau.querySelector('.fermer-panneau').addEventListener('click', () => this.actions.deselectionner());
  }
}
