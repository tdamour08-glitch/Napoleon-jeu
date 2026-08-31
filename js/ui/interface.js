/* ============================================================
   interface.js — bandeau, panneaux latéraux, marché, journal
   ============================================================ */

import { RESSOURCES, TERRAINS } from '../data/empires.js';
import { controleur, dateEnTexte } from '../core/etat.js';
import {
  coutDeveloppement,
  dureeDeveloppement,
  verifierChantier,
  productionTerritoire,
  consommationTerritoire,
  prixMarche,
  LOT_MARCHE,
  DEVELOPPEMENT_MAX,
} from '../core/economie.js';

const nombre = (v, decimales = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(decimales);

export class Interface {
  /**
   * @param {object} etat
   * @param {{
   *   centrerSurTerritoire: (id:string)=>void,
   *   deselectionner: ()=>void,
   *   developper: (id:string)=>void,
   *   echanger: (ressource:string, sens:string)=>void,
   * }} actions
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
      panneauEconomie: document.getElementById('panneau-economie'),
      boutonEconomie: document.getElementById('btn-economie'),
      listePuissances: document.getElementById('liste-puissances'),
      journal: document.getElementById('journal'),
    };
    this.derniereSelection = undefined;
    this.dernierJournal = -1;
    this.signatureTerritoire = null;
    this.signatureEconomie = null;
    this.initialiserBandeau();

    this.el.boutonEconomie.addEventListener('click', () => this.basculerEconomie());
  }

  initialiserBandeau() {
    const joueur = this.etat.empires[this.etat.joueur];
    this.el.ecusson.style.background = joueur.couleur;
    this.el.nomEmpire.textContent = joueur.nom;

    this.el.ressources.innerHTML = RESSOURCES.map(
      (r) => `
      <div class="ressource" data-bloc="${r.id}" title="${r.nom}">
        <div class="ligne-haute">
          <span class="pastille" style="background:${r.couleur}"></span>
          <span class="valeur" data-ressource="${r.id}">0</span>
          <span class="nom">${r.nom}</span>
        </div>
        <span class="solde" data-solde="${r.id}">+0,0</span>
      </div>`,
    ).join('');
  }

  /* ----------------------------------------------------------
     Rafraîchissement par image
     ---------------------------------------------------------- */

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
      const bloc = this.el.ressources.querySelector(`[data-bloc="${r.id}"]`);
      const valeur = bloc.querySelector('.valeur');
      const solde = bloc.querySelector('.solde');
      valeur.textContent = Math.floor(joueur.stocks[r.id]);
      valeur.title = `Réserve maximale : ${joueur.capacite}`;
      solde.textContent = `${nombre(joueur.net[r.id])} / jour`;
      solde.classList.toggle('negatif', joueur.net[r.id] < 0);
      bloc.classList.toggle('penurie', joueur.penuries[r.id]);
    }

    this.rafraichirPuissances();
    this.rafraichirJournal();
    this.rafraichirTerritoire();
    if (!this.el.panneauEconomie.classList.contains('cache')) this.rafraichirEconomie();
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
        const capitale =
          empire.territoires.map((id) => etat.carte.territoires[id]).find((t) => t.capitale) ??
          etat.carte.territoires[empire.territoires[0]];
        if (capitale) this.actions.centrerSurTerritoire(capitale.id);
      });
    }
  }

  rafraichirJournal() {
    if (this.etat.journal.length === this.dernierJournal) return;
    this.dernierJournal = this.etat.journal.length;
    this.el.journal.innerHTML = this.etat.journal
      .slice(0, 20)
      .map((e) => `<div class="entree"><span class="horodatage">${dateEnTexte(e.date)}</span>${e.texte}</div>`)
      .join('');
  }

  /* ----------------------------------------------------------
     Panneau de province
     ---------------------------------------------------------- */

  rafraichirTerritoire() {
    const id = this.etat.selection;
    if (!id) {
      if (this.derniereSelection !== null) {
        this.derniereSelection = null;
        this.el.panneauTerritoire.classList.add('cache');
      }
      return;
    }
    const t = this.etat.carte.territoires[id];
    // On ne reconstruit le panneau que si son contenu a réellement changé.
    const signature = [
      id,
      t.developpement,
      Math.round(t.moral),
      t.chantier ? t.chantier.restant : 'x',
      controleur(t),
    ].join('|');
    if (signature === this.signatureTerritoire) return;
    this.signatureTerritoire = signature;
    this.derniereSelection = id;
    this.afficherTerritoire(id);
  }

  afficherTerritoire(id) {
    const panneau = this.el.panneauTerritoire;
    const etat = this.etat;
    const t = etat.carte.territoires[id];
    const maitre = etat.empires[t.maitre];
    const occupant = t.occupant ? etat.empires[t.occupant] : null;
    const tenu = etat.empires[controleur(t)];
    const aMoi = tenu.id === etat.joueur;

    const production = productionTerritoire(t);
    const consommation = consommationTerritoire(t);

    const gisements = RESSOURCES.map((r) => {
      const net = production[r.id] - (consommation[r.id] ?? 0);
      return `
        <div class="gisement" title="Produit ${production[r.id].toFixed(2)} · consomme ${(consommation[r.id] ?? 0).toFixed(2)}">
          <span class="pastille" style="background:${r.couleur}"></span>
          <span class="etiquette">${r.nom}</span>
          <span class="barre"><i style="width:${(t.gisements[r.id] / 3) * 100}%;background:${r.couleur}"></i></span>
          <span class="${net >= 0 ? 'positif' : 'negatif'}" style="width:52px;text-align:right;font-size:12px;color:${net >= 0 ? 'var(--vert)' : '#e07b6a'}">${nombre(net, 2)}</span>
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
        ${occupant ? `${occupant.nom} <em>(occupation)</em>` : maitre.nom}
      </div>
      ${occupant ? `<div class="ligne-proprietaire"><span class="pastille" style="background:${maitre.couleur}"></span>${maitre.nom} <em>(souverain de droit)</em></div>` : ''}

      <div class="bloc">
        <h3>Province</h3>
        <div class="paire"><span>Terrain</span><span>${TERRAINS[t.terrain]?.nom ?? t.terrain}</span></div>
        <div class="paire"><span>Population</span><span>${'●'.repeat(t.population)}${'○'.repeat(3 - t.population)}</span></div>
        <div class="paire"><span>Développement</span><span>${t.developpement} / ${DEVELOPPEMENT_MAX}</span></div>
        ${t.capitale ? '<div class="paire"><span>Statut</span><span>Capitale</span></div>' : ''}
        ${t.colonie ? '<div class="paire"><span>Statut</span><span>Colonie</span></div>' : ''}
        <div class="paire"><span>Moral</span><span>${Math.round(t.moral)} / 100</span></div>
        <div class="jauge-moral"><i style="width:${t.moral}%;background:${couleurMoral(t.moral)}"></i></div>
      </div>

      <div class="bloc">
        <h3>Bilan quotidien</h3>
        <div class="gisements">${gisements}</div>
      </div>

      ${aMoi ? this.blocChantier(t) : ''}

      <div class="bloc">
        <h3>Frontières</h3>
        <div class="liste-voisins">${voisins}</div>
      </div>`;

    for (const puce of panneau.querySelectorAll('.puce-voisin')) {
      puce.addEventListener('click', () => this.actions.centrerSurTerritoire(puce.dataset.territoire));
    }
    panneau.querySelector('.fermer-panneau').addEventListener('click', () => this.actions.deselectionner());
    const bouton = panneau.querySelector('.action-chantier');
    if (bouton && !bouton.disabled) {
      bouton.addEventListener('click', () => this.actions.developper(t.id));
    }
  }

  /** Bloc « travaux » du panneau de province. */
  blocChantier(t) {
    if (t.chantier) {
      const avancement = 1 - t.chantier.restant / t.chantier.duree;
      return `
        <div class="bloc">
          <h3>Travaux en cours</h3>
          <div class="paire"><span>Niveau visé</span><span>${t.chantier.niveauVise}</span></div>
          <div class="paire"><span>Achèvement</span><span>${t.chantier.restant} jours</span></div>
          <div class="progression"><i style="width:${(avancement * 100).toFixed(1)}%"></i></div>
        </div>`;
    }

    const verdict = verifierChantier(this.etat, t);
    if (t.developpement >= DEVELOPPEMENT_MAX) {
      return `
        <div class="bloc">
          <h3>Travaux</h3>
          <p class="motif-chantier">Cette province est pleinement développée.</p>
        </div>`;
    }

    const empire = this.etat.empires[controleur(t)];
    const cout = coutDeveloppement(t.developpement);
    const detail = Object.entries(cout)
      .map(([ressource, montant]) => {
        const r = RESSOURCES.find((res) => res.id === ressource);
        const manque = empire.stocks[ressource] < montant;
        return `<span class="${manque ? 'insuffisant' : ''}">
                  <span class="pastille" style="background:${r.couleur}"></span>${montant}
                </span>`;
      })
      .join('');

    return `
      <div class="bloc">
        <h3>Travaux</h3>
        <div class="cout-chantier">${detail}<span style="margin-left:auto">${dureeDeveloppement(t.developpement)} j</span></div>
        <button class="action-chantier" ${verdict.possible ? '' : 'disabled'}>
          Développer au niveau ${t.developpement + 1}
        </button>
        ${verdict.possible ? '' : `<p class="motif-chantier">${verdict.motif}</p>`}
      </div>`;
  }

  /* ----------------------------------------------------------
     Panneau économie et marché
     ---------------------------------------------------------- */

  basculerEconomie() {
    const cache = this.el.panneauEconomie.classList.toggle('cache');
    this.el.boutonEconomie.classList.toggle('actif', !cache);
    // Les deux panneaux occupent la même colonne : on les alterne.
    document.getElementById('panneau-puissances').classList.toggle('cache', !cache);
    this.signatureEconomie = null;
    if (!cache) this.rafraichirEconomie();
  }

  rafraichirEconomie() {
    const empire = this.etat.empires[this.etat.joueur];
    const signature = RESSOURCES.map(
      (r) => `${Math.floor(empire.stocks[r.id])}:${empire.net[r.id].toFixed(1)}`,
    ).join('|');
    if (signature === this.signatureEconomie) return;
    this.signatureEconomie = signature;

    const lignes = RESSOURCES.map((r) => {
      const net = empire.net[r.id];
      return `
        <tr>
          <td><span class="pastille" style="background:${r.couleur}"></span>${r.nom}</td>
          <td>${Math.floor(empire.stocks[r.id])}</td>
          <td>${empire.production[r.id].toFixed(1)}</td>
          <td>${empire.consommation[r.id].toFixed(1)}</td>
          <td class="${net >= 0 ? 'positif' : 'negatif'}">${nombre(net)}</td>
        </tr>`;
    }).join('');

    const marche = RESSOURCES.filter((r) => r.id !== 'or')
      .map((r) => {
        const prix = prixMarche(r.id);
        const peutAcheter = empire.stocks.or >= prix.achat;
        const peutVendre = empire.stocks[r.id] >= LOT_MARCHE;
        return `
          <div class="marche-ligne">
            <span class="etiquette"><span class="pastille" style="background:${r.couleur}"></span>${r.nom}</span>
            <button class="bouton-marche" data-ressource="${r.id}" data-sens="achat"
                    ${peutAcheter ? '' : 'disabled'} title="Acheter ${LOT_MARCHE} ${r.nom.toLowerCase()}">
              acheter ${prix.achat.toFixed(0)} or
            </button>
            <button class="bouton-marche" data-ressource="${r.id}" data-sens="vente"
                    ${peutVendre ? '' : 'disabled'} title="Vendre ${LOT_MARCHE} ${r.nom.toLowerCase()}">
              vendre ${prix.vente.toFixed(0)} or
            </button>
          </div>`;
      })
      .join('');

    this.el.panneauEconomie.innerHTML = `
      <button class="fermer-panneau" title="Fermer">×</button>
      <h2>Trésor</h2>
      <p class="sous-titre-panneau">
        <span class="pastille" style="background:${empire.couleur}"></span>${empire.nom}
      </p>
      <table class="table-eco">
        <thead>
          <tr><th>Ressource</th><th>Stock</th><th>Prod.</th><th>Entretien</th><th>Solde</th></tr>
        </thead>
        <tbody>${lignes}</tbody>
      </table>

      <div class="bloc">
        <h3>Marché · lots de ${LOT_MARCHE}</h3>
        <div class="marche-lignes">${marche}</div>
      </div>

      <div class="bloc">
        <div class="paire"><span>Capacité des entrepôts</span><span>${empire.capacite}</span></div>
      </div>`;

    this.el.panneauEconomie.querySelector('.fermer-panneau').addEventListener('click', () =>
      this.basculerEconomie(),
    );
    for (const bouton of this.el.panneauEconomie.querySelectorAll('.bouton-marche')) {
      bouton.addEventListener('click', () => {
        this.actions.echanger(bouton.dataset.ressource, bouton.dataset.sens);
        this.signatureEconomie = null;
        this.rafraichirEconomie();
      });
    }
  }
}

function couleurMoral(moral) {
  if (moral >= 66) return '#4c9a5a';
  if (moral >= 40) return '#c9a227';
  return '#b6432f';
}
