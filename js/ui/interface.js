/* ============================================================
   interface.js — bandeau, panneaux latéraux, marché, journal
   ============================================================ */

import { RESSOURCES, TERRAINS } from '../data/empires.js';
import { datif } from '../data/langue.js';
import { controleur, dateEnTexte } from '../core/etat.js';
import {
  sontEnGuerre,
  sontAllies,
  relation,
  opinion,
  attenteSubside,
  SUBSIDE,
  GUERRE,
  ALLIANCE,
} from '../core/diplomatie.js';
import { armeesDans, verifierLevee, estPort, fusionsPossibles } from '../core/armees.js';
import { UNITES, TAILLE_REGIMENT, decrireComposition } from '../data/unites.js';
import { couleurMotivation } from '../render/rendu.js';
import { partEuropeenne } from '../core/traites.js';
import {
  cultureDe,
  estNoyau,
  pretendantCulturel,
  regimeRevolte,
  SEUIL_REVENDICATION,
} from '../core/revolte.js';
import {
  POLITIQUES,
  POLITIQUES_PAR_ID,
  effetsPolitiques,
  coutPolitiques,
  moralImpot,
  plafondEmprunt,
  IMPOT_MIN,
  IMPOT_MAX,
} from '../core/politiques.js';
import { decrireTermes } from './traite.js';
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
      panneauDiplomatie: document.getElementById('panneau-diplomatie'),
      boutonDiplomatie: document.getElementById('btn-diplomatie'),
      panneauPuissances: document.getElementById('panneau-puissances'),
      barreVictoire: document.getElementById('barre-victoire'),
      seuilVictoire: document.getElementById('seuil-victoire'),
      chiffreVictoire: document.getElementById('chiffre-victoire'),
      listePuissances: document.getElementById('liste-puissances'),
      journal: document.getElementById('journal'),
    };
    this.derniereSelection = undefined;
    this.dernierJournal = -1;
    this.signatureTerritoire = null;
    this.signatureEconomie = null;
    this.signatureArmee = null;
    this.signatureDiplomatie = null;
    // Panneau occupant la colonne de gauche : null, 'economie' ou 'diplomatie'.
    this.panneauLateral = null;
    this.reponseDiplomatique = null;
    this.initialiserBandeau();

    this.el.boutonEconomie.addEventListener('click', () => this.basculerLateral('economie'));
    this.el.boutonDiplomatie.addEventListener('click', () => this.basculerLateral('diplomatie'));
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
          return this.actions.lever(this.etat.selection, cible.dataset.type);
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
      if (cible.dataset.action === 'diviser') this.actions.diviser(this.etat.selectionArmee);
      if (cible.dataset.action === 'fusionner') this.actions.fusionner(this.etat.selectionArmee);
    });

    this.el.panneauDiplomatie.addEventListener('click', (ev) => {
      const cible = ev.target.closest('[data-action]');
      if (!cible || cible.disabled) return;
      const idEmpire = cible.dataset.empire;
      switch (cible.dataset.action) {
        case 'fermer':
          return this.basculerLateral('diplomatie');
        case 'voir':
          return this.actions.centrerSurEmpire(idEmpire);
        case 'alliance':
          return this.actions.proposerAlliance(idEmpire);
        case 'negocier':
          return this.actions.negocier(idEmpire);
        case 'rompre':
          return this.actions.rompreAlliance(idEmpire);
        case 'guerre':
          return this.actions.declarerGuerre(idEmpire);
        case 'subside':
          return this.actions.verserSubside(idEmpire);
        case 'accepter':
          return this.actions.repondreOffre(cible.dataset.cle, cible.dataset.type, true);
        case 'refuser':
          return this.actions.repondreOffre(cible.dataset.cle, cible.dataset.type, false);
        default:
          return undefined;
      }
    });

    this.el.panneauEconomie.addEventListener('click', (ev) => {
      const cible = ev.target.closest('[data-action]');
      if (!cible || cible.disabled) return;
      if (cible.dataset.action === 'fermer') {
        this.basculerEconomie();
      } else if (cible.dataset.action === 'echanger') {
        this.actions.echanger(cible.dataset.ressource, cible.dataset.sens);
        this.rafraichirEconomieMaintenant();
      } else if (cible.dataset.action === 'rembourser') {
        this.actions.rembourser(100);
        this.rafraichirEconomieMaintenant();
      }
    });

    this.el.panneauEconomie.addEventListener('change', (ev) => {
      const cible = ev.target.closest('[data-action]');
      if (!cible) return;
      if (cible.dataset.action === 'politique') {
        this.actions.basculerPolitique(cible.dataset.politique);
        this.rafraichirEconomieMaintenant();
      }
    });

    // Le curseur d'impôt réagit pendant qu'on le déplace.
    this.el.panneauEconomie.addEventListener('input', (ev) => {
      const cible = ev.target.closest('[data-action="impot"]');
      if (!cible) return;
      this.actions.definirImpot(Number(cible.value) / 100);
      const montant = this.el.panneauEconomie.querySelector('.reglage-impot .montant');
      if (montant) montant.textContent = `${cible.value} %`;
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

    const europe = partEuropeenne(etat, joueur.id);
    this.el.barreVictoire.style.width = `${Math.min(100, europe.part * 100).toFixed(1)}%`;
    this.el.seuilVictoire.style.left = `${europe.seuil * 100}%`;
    this.el.chiffreVictoire.textContent = `${europe.tenues} / ${europe.total}`;

    this.rafraichirPuissances();
    this.rafraichirJournal();
    this.rafraichirTerritoire();
    this.rafraichirArmee();
    if (this.panneauLateral === 'economie') this.rafraichirEconomie();
    if (this.panneauLateral === 'diplomatie') this.rafraichirDiplomatie();
  }

  rafraichirPuissances() {
    const etat = this.etat;
    const classement = Object.values(etat.empires)
      .filter((e) => e.vivant)
      .sort((a, b) => b.territoires.length - a.territoires.length);

    const hegemon = etat.equilibre?.hegemon ?? null;
    const signature = classement.map((e) => `${e.id}:${e.territoires.length}`).join('|') + `#${hegemon}`;
    if (signature === this.signaturePuissances) return;
    this.signaturePuissances = signature;

    this.el.listePuissances.innerHTML = classement
      .map(
        (e) => `
        <div class="ligne-puissance ${e.id === etat.joueur ? 'joueur' : ''}" data-empire="${e.id}">
          <span class="pastille" style="background:${e.couleur}"></span>
          <span class="nom">${e.nom}</span>
          ${e.id === hegemon ? '<span class="badge hegemon" title="Domine l\'Europe">★</span>' : ''}
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
      Math.round(t.revolte ?? 0),
      controleur(t),
      t.occupant ?? '-',
      this.etat.selectionArmee ?? '-',
      armeesDans(this.etat, id)
        .map((a) => `${a.id}:${decrireComposition(a.unites)}:${Math.round(a.motivation)}`)
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
        <div class="paire"><span>Population</span><span>${t.population.toFixed(1)} M</span></div>
        <div class="paire"><span>Développement</span><span>${t.developpement} / ${DEVELOPPEMENT_MAX}</span></div>
        ${t.capitale ? '<div class="paire"><span>Statut</span><span>Capitale</span></div>' : ''}
        ${t.colonie ? '<div class="paire"><span>Statut</span><span>Colonie</span></div>' : ''}
        <div class="paire"><span>Moral</span><span>${Math.round(t.moral)} / 100</span></div>
        <div class="jauge-moral"><i style="width:${t.moral}%;background:${couleurMoral(t.moral)}"></i></div>
      </div>

      ${this.blocRevolte(t, tenu)}

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

  /** Attachement national de la province, et ce qu'il en coûte. */
  blocRevolte(t, tenu) {
    const etat = this.etat;
    const regime = regimeRevolte(etat, t);
    const revolte = t.revolte ?? 0;
    const noyau = estNoyau(etat, t, tenu.id);
    const pretendant = pretendantCulturel(etat, t);

    const explication = {
      noyau: `Province ${noyau ? 'du noyau national' : 'apaisée'} : rien à craindre de l'intérieur.`,
      occupation:
        'Occupée sans traité. Sans garnison à portée, la jauge monte jusqu\'au soulèvement, ' +
        'et la province revient à son souverain.',
      annexion:
        'Annexée, mais de culture étrangère. Elle ne fera pas sécession — ' +
        (pretendant
          ? `en revanche ${avecArticleEmpire(etat.empires[pretendant])} s'en réclame.`
          : 'en revanche elle donne à l\'étranger un prétexte.'),
    }[regime.type];

    const nomCulture = NOMS_CULTURES[cultureDe(t)] ?? etat.empires[cultureDe(t)]?.nom ?? cultureDe(t);

    return `
      <div class="bloc">
        <h3>Attachement</h3>
        <div class="paire"><span>Culture</span><span>${nomCulture}</span></div>
        <div class="paire">
          <span>Révolte</span>
          <span>${Math.round(revolte)} / 100${regime.type === 'annexion' ? ` (plafond ${Math.round(regime.plafond)})` : ''}</span>
        </div>
        <div class="jauge-moral">
          <i style="width:${revolte}%;background:${couleurRevolte(revolte)}"></i>
        </div>
        <p class="motif-chantier">${explication}</p>
        ${
          revolte >= SEUIL_REVENDICATION && regime.type === 'annexion'
            ? '<span class="etiquette-guerre">Revendiquée</span>'
            : ''
        }
      </div>`;
  }

  /** Bloc « levée » du panneau de province : une arme par bouton. */
  blocLevee(t) {
    if (t.levee) {
      const avancement = 1 - t.levee.restant / t.levee.duree;
      return `
        <div class="bloc">
          <h3>${UNITES[t.levee.type].domaine === 'mer' ? 'Chantier naval' : 'Levée en cours'}</h3>
          <div class="paire"><span>${UNITES[t.levee.type].nom}</span><span>${t.levee.restant} jours</span></div>
          <div class="progression"><i style="width:${(avancement * 100).toFixed(1)}%"></i></div>
        </div>`;
    }

    const empire = this.etat.empires[controleur(t)];
    const types = ['infanterie', 'cavalerie', 'artillerie', ...(estPort(t) ? ['ligne', 'fregate'] : [])];
    const boutons = types
      .map((type) => {
        const modele = UNITES[type];
        const verdict = verifierLevee(this.etat, t, type);
        const prix = Object.entries(modele.cout)
          .map(([r, montant]) => {
            const res = RESSOURCES.find((x) => x.id === r);
            const manque = empire.stocks[r] < montant;
            return `${manque ? '⚠ ' : ''}${res.nom} ${montant}`;
          })
          .join(' · ');
        return `
          <button class="bouton-arme ${verdict.possible ? '' : 'refuse'}"
                  data-action="lever" data-type="${type}" ${verdict.possible ? '' : 'disabled'}
                  title="${prix} — ${modele.duree} jours&#10;${modele.resume}">
            <span class="arme-nom">${modele.nom}</span>
            <span class="arme-detail">${TAILLE_REGIMENT[type]} · ${modele.duree} j</span>
          </button>`;
      })
      .join('');

    const motif = verifierLevee(this.etat, t, 'infanterie');
    return `
      <div class="bloc">
        <h3>Lever des troupes</h3>
        <div class="grille-armes">${boutons}</div>
        ${motif.possible ? '' : `<p class="motif-chantier">${motif.motif}</p>`}
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
          <div class="ligne-corps ${this.etat.selectionArmee === a.id ? 'active' : ''}" data-armee="${a.id}"
               title="${etat}">
            <span class="pastille" style="background:${empire.couleur}"></span>
            <span class="effectif">${decrireComposition(a.unites)}</span>
            <span class="etat">moral ${Math.round(a.motivation)}</span>
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
     Cabinet diplomatique
     ---------------------------------------------------------- */

  rafraichirDiplomatie() {
    const etat = this.etat;
    const moi = etat.joueur;
    const puissances = Object.values(etat.empires)
      .filter((e) => e.vivant && e.id !== moi)
      .sort((a, b) => b.territoires.length - a.territoires.length);

    const offres = [
      ...Object.entries(etat.offresAlliance).map(([cle, o]) => ({ cle, ...o, type: 'alliance' })),
      ...Object.entries(etat.offresPaix).map(([cle, o]) => ({ cle, ...o, type: 'paix' })),
    ].filter((o) => o.cle.split('|').includes(moi));

    const signature = [
      offres.map((o) => `${o.type}:${o.cle}`).join(','),
      puissances
        .map(
          (e) =>
            `${e.id}:${relation(etat, moi, e.id)}:${Math.round(opinion(etat, e.id, moi) / 5)}` +
            `:${attenteSubside(etat, moi, e.id) > 0 ? 'x' : 'o'}`,
        )
        .join('|'),
      etat.equilibre?.hegemon ?? '-',
      this.reponseDiplomatique?.texte ?? '',
    ].join('#');
    if (signature === this.signatureDiplomatie) return;
    this.signatureDiplomatie = signature;

    const blocsOffres = offres
      .map((offre) => {
        if (offre.type === 'alliance') {
          const demandeur = etat.empires[offre.demandeur];
          return `
            <div class="offre">
              <p><strong>${demandeur.nom}</strong> vous propose une alliance.</p>
              <div class="actions">
                <button class="bouton-mini" data-action="accepter" data-type="alliance" data-cle="${offre.cle}">Accepter</button>
                <button class="bouton-mini danger" data-action="refuser" data-type="alliance" data-cle="${offre.cle}">Refuser</button>
              </div>
            </div>`;
        }
        const traite = offre.traite;
        const autre = etat.empires[traite.demandeur === moi ? traite.cible : traite.demandeur];
        const jeGagne = traite.demandeur === moi;
        const entete = jeGagne
          ? `<strong>${autre.nom}</strong> demande la paix et offre&nbsp;:`
          : `<strong>${autre.nom}</strong> propose la paix à ses conditions&nbsp;:`;
        return `
          <div class="offre">
            <p>${entete}</p>
            <ul class="termes">${decrireTermes(etat, traite).map((l) => `<li>${l}</li>`).join('')}</ul>
            <div class="actions">
              <button class="bouton-mini" data-action="accepter" data-type="paix" data-cle="${offre.cle}">Signer</button>
              <button class="bouton-mini danger" data-action="refuser" data-type="paix" data-cle="${offre.cle}">Refuser</button>
            </div>
          </div>`;
      })
      .join('');

    const hegemon = etat.equilibre?.hegemon ?? null;
    const moiEmpire = etat.empires[moi];
    const attente = Object.fromEntries(puissances.map((e) => [e.id, attenteSubside(etat, moi, e.id)]));
    const lignes = puissances
      .map((e) => {
        const etatRelation = relation(etat, moi, e.id);
        const estime = Math.round(opinion(etat, e.id, moi));
        const enGuerre = etatRelation === GUERRE;
        const allie = etatRelation === ALLIANCE;
        return `
          <div class="ligne-relation">
            <span class="pastille" style="background:${e.couleur}"></span>
            <span class="nom" data-action="voir" data-empire="${e.id}">${e.nom}</span>
            ${e.id === hegemon ? '<span class="badge hegemon" title="Domine l\'Europe">★</span>' : ''}
            <span class="badge ${etatRelation}">${etatRelation}</span>
            <span class="estime" style="color:${couleurEstime(estime)}" title="Estime qu'elle vous porte">${estime > 0 ? '+' : ''}${estime}</span>
          </div>
          <div class="actions-relation">
            ${
              enGuerre
                ? `<button class="bouton-mini" data-action="negocier" data-empire="${e.id}">Négocier la paix</button>`
                : allie
                  ? `<button class="bouton-mini danger" data-action="rompre" data-empire="${e.id}">Rompre l'alliance</button>
                     <button class="bouton-mini danger" data-action="guerre" data-empire="${e.id}">Déclarer la guerre</button>`
                  : `<button class="bouton-mini" data-action="alliance" data-empire="${e.id}">Proposer une alliance</button>
                     <button class="bouton-mini danger" data-action="guerre" data-empire="${e.id}">Déclarer la guerre</button>`
            }
            ${
              enGuerre
                ? ''
                : `<button class="bouton-mini" data-action="subside" data-empire="${e.id}"
                           title="Verser ${SUBSIDE.montant} pièces d'or pour gagner ${SUBSIDE.estime} points d'estime"
                           ${attente[e.id] > 0 || moiEmpire.stocks.or < SUBSIDE.montant ? 'disabled' : ''}>
                     ${attente[e.id] > 0 ? `Subside dans ${attente[e.id]} j` : `Subside ${SUBSIDE.montant} or`}
                   </button>`
            }
          </div>`;
      })
      .join('');

    const reponse = this.reponseDiplomatique
      ? `<p class="reponse-diplomatique ${this.reponseDiplomatique.accepte ? 'oui' : 'non'}">${this.reponseDiplomatique.texte}</p>`
      : '';

    this.el.panneauDiplomatie.innerHTML = `
      <button class="fermer-panneau" data-action="fermer" title="Fermer">×</button>
      <h2>Cabinet diplomatique</h2>
      ${blocsOffres}
      ${reponse}
      <div class="bloc"><h3>Puissances</h3>${lignes}</div>`;
  }

  /** Affiche la réponse d'un cabinet étranger jusqu'à la prochaine démarche. */
  annoncerReponse(texte, accepte) {
    this.reponseDiplomatique = { texte, accepte };
    this.signatureDiplomatie = null;
    this.rafraichirDiplomatie();
  }

  /* ----------------------------------------------------------
     Panneau du corps sélectionné
     ---------------------------------------------------------- */

  rafraichirArmee() {
    const armee = this.etat.armees[this.etat.selectionArmee];
    if (!armee) {
      if (this.signatureArmee !== null) {
        this.signatureArmee = null;
    this.signatureDiplomatie = null;
    // Panneau occupant la colonne de gauche : null, 'economie' ou 'diplomatie'.
    this.panneauLateral = null;
    this.reponseDiplomatique = null;
        this.el.panneauArmee.classList.add('cache');
      }
      return;
    }
    const signature = [
      armee.id,
      decrireComposition(armee.unites),
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
      <h2>${armee.domaine === 'mer' ? `Escadre de ${Math.round(armee.effectif)} navires`
                                     : `Corps de ${Math.round(armee.effectif)} 000 hommes`}</h2>
      <p class="sous-titre-panneau">
        <span class="pastille" style="background:${empire.couleur}"></span>${empire.nom}
      </p>

      <div class="bloc">
        <h3>Composition</h3>
        ${Object.entries(armee.unites)
          .filter(([, n]) => n > 0.05)
          .map(([type, n]) => `<div class="paire"><span>${UNITES[type].nom}</span><span>${Math.round(n)}</span></div>`)
          .join('')}
      </div>

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
               <button class="bouton-ordre" data-action="diviser"
                       ${armee.route || armee.enBataille || armee.effectif < 2 ? 'disabled' : ''}>Diviser</button>
               <button class="bouton-ordre" data-action="fusionner"
                       ${fusionsPossibles(this.etat, armee).length ? '' : 'disabled'}>Fusionner ici</button>
             </div>
             <p class="indication">Clic droit sur une province pour l'y envoyer.</p>`
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

  /**
   * Liste des puissances, trésor et cabinet occupent la même colonne :
   * on n'en montre qu'un à la fois.
   */
  basculerLateral(nom) {
    this.panneauLateral = this.panneauLateral === nom ? null : nom;
    this.el.panneauEconomie.classList.toggle('cache', this.panneauLateral !== 'economie');
    this.el.panneauDiplomatie.classList.toggle('cache', this.panneauLateral !== 'diplomatie');
    this.el.panneauPuissances.classList.toggle('cache', this.panneauLateral !== null);
    this.el.boutonEconomie.classList.toggle('actif', this.panneauLateral === 'economie');
    this.el.boutonDiplomatie.classList.toggle('actif', this.panneauLateral === 'diplomatie');
    this.signatureEconomie = null;
    this.signatureDiplomatie = null;
    if (this.panneauLateral === 'economie') this.rafraichirEconomie();
    if (this.panneauLateral === 'diplomatie') this.rafraichirDiplomatie();
  }

  /** Conservé pour le raccourci clavier historique. */
  basculerEconomie() {
    this.basculerLateral('economie');
  }

  basculerDiplomatie() {
    this.basculerLateral('diplomatie');
  }

  /** Après une reprise de partie, tout est à redessiner. */
  reinitialiser() {
    this.signatureTerritoire = null;
    this.signatureEconomie = null;
    this.signatureArmee = null;
    this.signatureDiplomatie = null;
    this.signaturePuissances = null;
    this.dernierJournal = -1;
    this.derniereSelection = undefined;
    this.reponseDiplomatique = null;
    this.initialiserBandeau();
  }

  /** Force la reconstruction du panneau après une action du joueur. */
  rafraichirEconomieMaintenant() {
    this.signatureEconomie = null;
    this.rafraichirEconomie();
  }

  rafraichirEconomie() {
    const empire = this.etat.empires[this.etat.joueur];
    const signature = [
      RESSOURCES.map((r) => `${Math.floor(empire.stocks[r.id])}:${empire.net[r.id].toFixed(1)}`).join('|'),
      empire.tauxImposition.toFixed(2),
      Math.round(empire.dette),
      empire.politiques.join(','),
      (empire.heritage ?? []).join(','),
    ].join('#');
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
                    ${peutAcheter ? '' : 'disabled'}>acheter ${prix.achat.toFixed(0)} or</button>
            <button class="bouton-marche" data-action="echanger" data-ressource="${r.id}" data-sens="vente"
                    ${peutVendre ? '' : 'disabled'}>vendre ${prix.vente.toFixed(0)} or</button>
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

      ${this.blocBudget(empire)}
      ${this.blocPolitiques(empire)}

      <div class="bloc">
        <h3>Marché · lots de ${LOT_MARCHE}</h3>
        <div class="marche-lignes">${marche}</div>
      </div>

      <div class="bloc">
        <div class="paire"><span>Capacité des entrepôts</span><span>${empire.capacite}</span></div>
      </div>`;
  }

  /** Recettes, dépenses, impôt et dette : le budget de l'État, compté en or. */
  blocBudget(empire) {
    const b = empire.budget;
    const recettes = b.impots + (b.commerce ?? 0) + b.ressources;
    const depenses = b.administration + b.armee + b.politiques + b.interets;
    const solde = recettes - depenses;
    const plafond = plafondEmprunt(empire);
    const lourde = empire.dette > plafond * 0.6;
    const effetMoral = moralImpot(empire.tauxImposition);

    return `
      <div class="bloc">
        <h3>Budget · par jour</h3>
        <div class="budget-lignes">
          <div class="budget-ligne recette"><span>Impôt</span><span>+${b.impots.toFixed(1)}</span></div>
          <div class="budget-ligne recette"><span>Commerce maritime</span><span>+${(b.commerce ?? 0).toFixed(1)}</span></div>
          <div class="budget-ligne recette"><span>Mines et domaines</span><span>+${b.ressources.toFixed(1)}</span></div>
          <div class="budget-ligne depense"><span>Administration</span><span>−${b.administration.toFixed(1)}</span></div>
          <div class="budget-ligne depense"><span>Solde des armées</span><span>−${b.armee.toFixed(1)}</span></div>
          <div class="budget-ligne depense"><span>Politiques</span><span>−${b.politiques.toFixed(1)}</span></div>
          <div class="budget-ligne depense"><span>Intérêts de la dette</span><span>−${b.interets.toFixed(2)}</span></div>
          <div class="budget-ligne total">
            <span>Solde</span>
            <span style="color:${solde >= 0 ? 'var(--vert)' : '#e07b6a'}">${nombre(solde)}</span>
          </div>
        </div>

        <h3 style="margin-top:14px">Impôt</h3>
        <div class="reglage-impot">
          <input type="range" data-action="impot" min="${IMPOT_MIN * 100}" max="${IMPOT_MAX * 100}" step="5"
                 value="${Math.round(empire.tauxImposition * 100)}">
          <span class="montant">${Math.round(empire.tauxImposition * 100)} %</span>
        </div>
        <p class="effet-impot">
          ${effetMoral >= 0
            ? `Pression allégée : +${effetMoral.toFixed(0)} de moral dans les provinces.`
            : `Pression accrue : ${effetMoral.toFixed(0)} de moral dans les provinces.`}
        </p>

        <h3 style="margin-top:14px">Dette</h3>
        <div class="dette-ligne">
          <span class="montant ${lourde ? 'lourde' : ''}">${Math.round(empire.dette)} / ${Math.round(plafond)} or</span>
          <button class="bouton-mini" data-action="rembourser"
                  ${empire.dette > 0 && empire.stocks.or >= 20 ? '' : 'disabled'}>Rembourser 100</button>
        </div>
      </div>`;
  }

  /** Les grandes politiques du règne. */
  blocPolitiques(empire) {
    const cout = coutPolitiques(this.etat, empire);
    const effets = effetsPolitiques(empire);
    const lignes = POLITIQUES.filter((p) => !(empire.heritage ?? []).includes(p.id)).map((politique) => {
      const active = empire.politiques.includes(politique.id);
      const prix = Object.entries(politique.cout)
        .map(([r, taux]) => {
          const res = RESSOURCES.find((x) => x.id === r);
          const montant = active ? (cout[r] ?? 0).toFixed(1) : `${taux} / sujet`;
          return `<span style="color:${res.couleur}">${res.nom} ${montant}</span>`;
        })
        .join(' · ');
      return `
        <label class="politique ${active ? 'active' : ''}">
          <input type="checkbox" data-action="politique" data-politique="${politique.id}" ${active ? 'checked' : ''}>
          <span>
            <span class="titre">${politique.nom}</span>
            <span class="detail">${politique.resume}</span>
            <span class="prix">${prix}</span>
          </span>
        </label>`;
    }).join('');

    const acquises = (empire.heritage ?? [])
      .map((id) => POLITIQUES_PAR_ID[id])
      .filter(Boolean)
      .map(
        (politique) => `
          <div class="politique acquise" title="${politique.resume}">
            <span class="marque">✓</span>
            <span>
              <span class="titre">${politique.nom}</span>
              <span class="detail">Acquis avant 1805 — sans coût.</span>
            </span>
          </div>`,
      )
      .join('');

    return `
      ${acquises ? `<div class="bloc"><h3>Héritage du règne</h3><div class="liste-politiques">${acquises}</div></div>` : ''}
      <div class="bloc">
        <h3>Choix sociaux</h3>
        <div class="liste-politiques">${lignes}</div>
        <p class="effet-impot">
          Plafond de population ${effets.plafond >= 0 ? '+' : ''}${effets.plafond.toFixed(1)} ·
          croissance ${effets.croissance >= 0 ? '+' : ''}${Math.round(effets.croissance * 100)} % ·
          moral ${effets.moral >= 0 ? '+' : ''}${effets.moral}
        </p>
      </div>`;
  }

}

/** Noms lisibles des cultures qui n'ont pas d'État pour les porter. */
const NOMS_CULTURES = {
  irl: 'irlandaise', eco: 'écossaise', nee: 'néerlandaise', all: 'allemande',
  ita: 'italienne', ill: 'illyrienne', gre: 'grecque', ser: 'serbe', egy: 'égyptienne',
  amer: 'créole', jav: 'javanaise', aus: 'australienne', boh: 'tchèque', hon: 'hongroise',
};

function avecArticleEmpire(empire) {
  return empire ? `${empire.nom}` : 'une puissance';
}

function couleurRevolte(valeur) {
  if (valeur >= 70) return '#e0503a';
  if (valeur >= 45) return '#d98a2b';
  if (valeur >= 20) return '#c9a227';
  return '#4c9a5a';
}

function couleurEstime(valeur) {
  if (valeur >= 30) return 'var(--vert)';
  if (valeur <= -30) return '#e07b6a';
  return 'var(--texte-doux)';
}

function couleurMoral(moral) {
  if (moral >= 66) return '#4c9a5a';
  if (moral >= 40) return '#c9a227';
  return '#b6432f';
}
