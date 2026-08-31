/* ============================================================
   interface.js — bandeau, panneaux latéraux, marché, journal
   ============================================================ */

import { RESSOURCES, TERRAINS } from '../data/empires.js';
import { datif } from '../data/langue.js';
import { controleur, dateEnTexte } from '../core/etat.js';
import { sontEnGuerre } from '../core/diplomatie.js';
import {
  armeesDans,
  verifierLevee,
  COUT_LEVEE,
  DUREE_LEVEE,
  TAILLE_CORPS,
} from '../core/armees.js';
import { couleurMotivation } from '../render/rendu.js';
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
      panneauArmee: document.getElementById('panneau-armee'),
      troupes: document.getElementById('valeur-troupes'),
      reserves: document.getElementById('valeur-reserves'),
      panneauEconomie: document.getElementById('panneau-economie'),
      boutonEconomie: document.getElementById('btn-economie'),
      listePuissances: document.getElementById('liste-puissances'),
      journal: document.getElementById('journal'),
    };
    this.derniereSelection = undefined;
    this.dernierJournal = -1;
    this.signatureTerritoire = null;
    this.signatureEconomie = null;
    this.signatureArmee = null;
    this.initialiserBandeau();

    this.el.boutonEconomie.addEventListener('click', () => this.basculerEconomie());
    this.brancherPanneaux();
  }

  /**
   * Délégation : un seul écouteur par panneau, posé une fois pour toutes.
   * Les panneaux se reconstruisent à chaque changement d'état ; réattacher
   * les écouteurs à chaque reconstruction laissait des poignées mortes.
   */
  brancherPanneaux() {
    this.el.panneauTerritoire.addEventListener('click', (ev) => {
      const cible = ev.target.closest('[data-action], [data-territoire], [data-armee]');
      if (!cible || cible.disabled) return;
      if (cible.dataset.territoire) return this.actions.centrerSurTerritoire(cible.dataset.territoire);
      if (cible.dataset.armee) return this.actions.selectionnerArmee(cible.dataset.armee);
      switch (cible.dataset.action) {
        case 'fermer':
          return this.actions.deselectionner();
        case 'developper':
          return this.actions.developper(this.etat.selection);
        case 'lever':
          return this.actions.lever(this.etat.selection);
        case 'guerre':
          return this.actions.declarerGuerre(cible.dataset.empire);
        default:
          return undefined;
      }
    });

    this.el.panneauArmee.addEventListener('click', (ev) => {
      const cible = ev.target.closest('[data-action]');
      if (!cible || cible.disabled) return;
      if (cible.dataset.action === 'fermer') this.actions.selectionnerArmee(null);
      if (cible.dataset.action === 'halte') this.actions.faireHalte(this.etat.selectionArmee);
    });

    this.el.panneauEconomie.addEventListener('click', (ev) => {
      const cible = ev.target.closest('[data-action]');
      if (!cible || cible.disabled) return;
      if (cible.dataset.action === 'fermer') {
        this.basculerEconomie();
      } else if (cible.dataset.action === 'echanger') {
        this.actions.echanger(cible.dataset.ressource, cible.dataset.sens);
        this.signatureEconomie = null;
        this.rafraichirEconomie();
      }
    });
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

    const hommes = Object.values(etat.armees)
      .filter((a) => a.empire === joueur.id)
      .reduce((s, a) => s + a.effectif, 0);
    this.el.troupes.textContent = `${Math.round(hommes)} 000`;
    this.el.reserves.textContent = `${Math.round(joueur.reserves)} 000`;
    this.el.reserves.style.color = joueur.reserves < 10 ? '#e07b6a' : '';

    this.rafraichirPuissances();
    this.rafraichirJournal();
    this.rafraichirTerritoire();
    this.rafraichirArmee();
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
      t.levee ? t.levee.restant : 'x',
      controleur(t),
      t.occupant ?? '-',
      this.etat.selectionArmee ?? '-',
      armeesDans(this.etat, id)
        .map((a) => `${a.id}:${Math.round(a.effectif)}:${Math.round(a.motivation)}`)
        .join(','),
      sontEnGuerre(this.etat, this.etat.joueur, controleur(t)) ? 'g' : 'p',
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
      <button class="fermer-panneau" data-action="fermer" title="Fermer (Échap)">×</button>
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
      ${aMoi ? this.blocLevee(t) : ''}
      ${this.blocCorps(t)}
      ${aMoi ? '' : this.blocDiplomatie(tenu)}

      <div class="bloc">
        <h3>Frontières</h3>
        <div class="liste-voisins">${voisins}</div>
      </div>`;

  }

  /** Bloc « levée » du panneau de province. */
  blocLevee(t) {
    if (t.levee) {
      const avancement = 1 - t.levee.restant / t.levee.duree;
      return `
        <div class="bloc">
          <h3>Levée en cours</h3>
          <div class="paire"><span>Rassemblement</span><span>${t.levee.restant} jours</span></div>
          <div class="progression"><i style="width:${(avancement * 100).toFixed(1)}%"></i></div>
        </div>`;
    }

    const verdict = verifierLevee(this.etat, t);
    const empire = this.etat.empires[controleur(t)];
    const detail = Object.entries(COUT_LEVEE)
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
        <h3>Levée</h3>
        <div class="cout-chantier">
          ${detail}
          <span class="${empire.reserves < TAILLE_CORPS ? 'insuffisant' : ''}">${TAILLE_CORPS} 000 hommes</span>
          <span style="margin-left:auto">${DUREE_LEVEE} j</span>
        </div>
        <button class="action-levee action-chantier" data-action="lever" ${verdict.possible ? '' : 'disabled'}>
          Lever un corps
        </button>
        ${verdict.possible ? '' : `<p class="motif-chantier">${verdict.motif}</p>`}
      </div>`;
  }

  /** Corps présents dans la province. */
  blocCorps(t) {
    const corps = armeesDans(this.etat, t.id);
    if (corps.length === 0) return '';
    const lignes = corps
      .map((a) => {
        const empire = this.etat.empires[a.empire];
        const etat = a.enBataille ? 'au combat' : a.route ? 'en marche' : 'au repos';
        return `
          <div class="ligne-corps ${this.etat.selectionArmee === a.id ? 'active' : ''}" data-armee="${a.id}">
            <span class="pastille" style="background:${empire.couleur}"></span>
            <span class="effectif">${Math.round(a.effectif)} 000</span>
            <span class="etat">${etat} · moral ${Math.round(a.motivation)}</span>
          </div>`;
      })
      .join('');
    return `
      <div class="bloc">
        <h3>Corps présents</h3>
        <div class="liste-corps">${lignes}</div>
      </div>`;
  }

  /** Déclaration de guerre depuis une province étrangère. */
  blocDiplomatie(empire) {
    if (empire.id === this.etat.joueur) return '';
    if (sontEnGuerre(this.etat, this.etat.joueur, empire.id)) {
      return `<div class="bloc"><h3>Relations</h3><span class="etiquette-guerre">En guerre</span></div>`;
    }
    return `
      <div class="bloc">
        <h3>Relations</h3>
        <div class="paire"><span>État</span><span>Paix</span></div>
        <button class="bouton-guerre" data-action="guerre" data-empire="${empire.id}">
          Déclarer la guerre ${datif(empire)}
        </button>
      </div>`;
  }

  /* ----------------------------------------------------------
     Panneau du corps sélectionné
     ---------------------------------------------------------- */

  rafraichirArmee() {
    const armee = this.etat.armees[this.etat.selectionArmee];
    if (!armee) {
      if (this.signatureArmee !== null) {
        this.signatureArmee = null;
        this.el.panneauArmee.classList.add('cache');
      }
      return;
    }
    const signature = [
      armee.id,
      Math.round(armee.effectif * 10),
      Math.round(armee.motivation),
      armee.lieu,
      armee.route ? `${armee.route.etape}/${armee.route.chemin.length}` : 'x',
      armee.enBataille ? 'b' : '-',
    ].join('|');
    if (signature === this.signatureArmee) return;
    this.signatureArmee = signature;
    this.afficherArmee(armee);
  }

  afficherArmee(armee) {
    const panneau = this.el.panneauArmee;
    const empire = this.etat.empires[armee.empire];
    const lieu = this.etat.carte.territoires[armee.lieu];
    const aMoi = armee.empire === this.etat.joueur;

    let situation;
    if (armee.enBataille) {
      situation = `<span class="etiquette-guerre">Au combat</span>
                   <div class="paire"><span>Champ de bataille</span><span>${lieu.nom}</span></div>`;
    } else if (armee.route) {
      const destination = this.etat.carte.territoires[armee.route.chemin[armee.route.chemin.length - 1]];
      const restant = armee.route.chemin.length - armee.route.etape;
      situation = `<div class="paire"><span>En marche vers</span><span>${destination.nom}</span></div>
                   <div class="paire"><span>Étapes restantes</span><span>${restant}</span></div>`;
    } else {
      situation = `<div class="paire"><span>Cantonné</span><span>${lieu.nom}</span></div>`;
    }

    panneau.classList.remove('cache');
    panneau.innerHTML = `
      <button class="fermer-panneau" data-action="fermer" title="Fermer (Échap)">×</button>
      <h2>Corps de ${Math.round(armee.effectif)} 000 hommes</h2>
      <p class="sous-titre-panneau">
        <span class="pastille" style="background:${empire.couleur}"></span>${empire.nom}
      </p>

      <div class="bloc">
        <h3>Motivation</h3>
        <div class="paire"><span>Moral des troupes</span><span>${Math.round(armee.motivation)} / 100</span></div>
        <div class="jauge-motivation">
          <i style="width:${armee.motivation}%;background:${couleurMotivation(armee.motivation)}"></i>
        </div>
      </div>

      <div class="bloc">
        <h3>Situation</h3>
        ${situation}
      </div>

      ${
        aMoi
          ? `<div class="ordres">
               <button class="bouton-ordre" data-action="halte" ${armee.route ? '' : 'disabled'}>Faire halte</button>
             </div>
             <p class="indication">Clic droit sur une province pour l'y envoyer.
             Maj + clic droit pour n'y envoyer que la moitié du corps.</p>`
          : '<p class="indication">Corps étranger : vous ne pouvez que l\'observer.</p>'
      }`;

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
        <button class="action-chantier" data-action="developper" ${verdict.possible ? '' : 'disabled'}>
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
            <button class="bouton-marche" data-action="echanger" data-ressource="${r.id}" data-sens="achat"
                    ${peutAcheter ? '' : 'disabled'} title="Acheter ${LOT_MARCHE} ${r.nom.toLowerCase()}">
              acheter ${prix.achat.toFixed(0)} or
            </button>
            <button class="bouton-marche" data-action="echanger" data-ressource="${r.id}" data-sens="vente"
                    ${peutVendre ? '' : 'disabled'} title="Vendre ${LOT_MARCHE} ${r.nom.toLowerCase()}">
              vendre ${prix.vente.toFixed(0)} or
            </button>
          </div>`;
      })
      .join('');

    this.el.panneauEconomie.innerHTML = `
      <button class="fermer-panneau" data-action="fermer" title="Fermer">×</button>
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

  }
}

function couleurMoral(moral) {
  if (moral >= 66) return '#4c9a5a';
  if (moral >= 40) return '#c9a227';
  return '#b6432f';
}
