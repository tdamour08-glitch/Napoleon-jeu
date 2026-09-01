/* ============================================================
   traite.js — table des négociations
   ------------------------------------------------------------
   Le joueur y compose ses conditions : provinces qu'il annexe,
   provinces qu'il rend, tribut exigé. Le verdict du cabinet
   adverse est recalculé à chaque changement, de sorte qu'on
   voit tout de suite ce qui passe et ce qui ne passe pas.
   ============================================================ */

import {
  provincesNegociables,
  traiteVierge,
  valeurProvince,
  evaluerTraite,
  coutTermes,
  toleranceCession,
} from '../core/traites.js';
import { avecArticle, genitif } from '../data/langue.js';

export class TableDesNegociations {
  /**
   * @param {object} etat
   * @param {{ signer: (traite:object)=>void, surFermeture?: ()=>void }} actions
   */
  constructor(etat, actions) {
    this.etat = etat;
    this.actions = actions;
    this.voile = document.getElementById('ecran-traite');
    this.corps = document.getElementById('corps-traite');
    this.traite = null;

    document.getElementById('btn-fermer-traite').addEventListener('click', () => this.fermer());
    this.voile.addEventListener('click', (ev) => {
      if (ev.target === this.voile) this.fermer();
    });
    this.corps.addEventListener('change', () => this.lireFormulaire());
    this.corps.addEventListener('input', () => this.lireFormulaire());
    this.corps.addEventListener('click', (ev) => {
      const bouton = ev.target.closest('[data-action]');
      if (!bouton || bouton.disabled) return;
      if (bouton.dataset.action === 'proposer') this.proposer();
      if (bouton.dataset.action === 'annuler') this.fermer();
    });
  }

  get ouvert() {
    return !this.voile.classList.contains('cache');
  }

  /** Ouvre la table face à une puissance donnée. */
  ouvrir(idCible) {
    const etat = this.etat;
    this.traite = traiteVierge(etat.joueur, idCible);
    const { restituables } = provincesNegociables(etat, etat.joueur, idCible);
    // On réclame ses propres provinces par défaut : personne n'y renonce de gaieté de cœur.
    this.traite.restitutions = [...restituables];
    this.voile.classList.remove('cache');
    this.dessiner();
  }

  fermer() {
    this.voile.classList.add('cache');
    this.traite = null;
    this.actions.surFermeture?.();
  }

  /* ---------------------------------------------------------- */

  dessiner() {
    const etat = this.etat;
    const traite = this.traite;
    const cible = etat.empires[traite.cible];
    const { annexables, restituables } = provincesNegociables(etat, traite.demandeur, traite.cible);
    const orAdverse = Math.floor(cible.stocks.or);

    const clause = (id, coche, nom) => {
      const t = etat.carte.territoires[id];
      return `
        <label class="clause">
          <input type="checkbox" name="${nom}" value="${id}" ${coche ? 'checked' : ''}>
          <span class="nom-province">${t.nom}</span>
          <span class="valeur-province">valeur ${Math.round(valeurProvince(t))}</span>
        </label>`;
    };

    this.corps.innerHTML = `
      <p class="traite-entete">
        Vous dictez vos conditions ${genitif(cible)}. Tout ce que vous n'annexez pas est
        évacué&nbsp;: la paix rend le terrain. Une province annexée change de souverain
        pour de bon — et sa population ne vous en saura pas gré.
      </p>

      <div class="traite-section">
        <h3>Provinces annexées</h3>
        ${
          annexables.length
            ? annexables.map((id) => clause(id, traite.annexions.includes(id), 'annexion')).join('')
            : '<p class="traite-vide">Vous n\'occupez aucune de ses provinces : rien à exiger.</p>'
        }
      </div>

      <div class="traite-section">
        <h3>Provinces qu'elle vous rend</h3>
        ${
          restituables.length
            ? restituables.map((id) => clause(id, traite.restitutions.includes(id), 'restitution')).join('')
            : '<p class="traite-vide">Elle n\'occupe aucune des vôtres.</p>'
        }
      </div>

      <div class="traite-section">
        <h3>Tribut</h3>
        <div class="tribut">
          <input type="range" name="tribut" min="0" max="${orAdverse}" step="10" value="${Math.min(traite.tribut, orAdverse)}">
          <span class="montant">${Math.round(traite.tribut)} / ${orAdverse} or</span>
        </div>
      </div>

      <div id="verdict-traite"></div>

      <div class="actions-traite">
        <button class="bouton-ordre" data-action="annuler">Renoncer</button>
        <button class="bouton-principal" data-action="proposer">Proposer ces conditions</button>
      </div>`;

    this.afficherVerdict();
  }

  /** Relit les cases cochées et le tribut, puis réévalue. */
  lireFormulaire() {
    if (!this.traite) return;
    const lire = (nom) =>
      [...this.corps.querySelectorAll(`input[name="${nom}"]:checked`)].map((e) => e.value);
    this.traite.annexions = lire('annexion');
    this.traite.restitutions = lire('restitution');
    const curseur = this.corps.querySelector('input[name="tribut"]');
    this.traite.tribut = curseur ? Number(curseur.value) : 0;
    const montant = this.corps.querySelector('.montant');
    if (montant) {
      montant.textContent = `${this.traite.tribut} / ${Math.floor(this.etat.empires[this.traite.cible].stocks.or)} or`;
    }
    this.afficherVerdict();
  }

  afficherVerdict() {
    const zone = this.corps.querySelector('#verdict-traite');
    if (!zone) return;
    const verdict = evaluerTraite(this.etat, this.traite);
    const cout = coutTermes(this.etat, this.traite);
    const tolerance = toleranceCession(this.etat, this.traite.cible, this.traite.demandeur);
    const remplissage = tolerance > 0 ? Math.min(1.6, cout / tolerance) : 1.6;
    const couleur = verdict.accepte ? 'var(--vert)' : '#e07b6a';

    zone.innerHTML = `
      <p class="verdict ${verdict.accepte ? 'acceptable' : 'refus'}">
        ${verdict.motif}
        <span class="jauge"><i style="width:${Math.min(100, (remplissage / 1.6) * 100).toFixed(0)}%;background:${couleur}"></i></span>
      </p>`;
    const bouton = this.corps.querySelector('[data-action="proposer"]');
    if (bouton) bouton.textContent = verdict.accepte ? 'Signer le traité' : 'Proposer quand même';
  }

  proposer() {
    const verdict = evaluerTraite(this.etat, this.traite);
    if (!verdict.accepte) {
      this.afficherVerdict();
      return;
    }
    this.actions.signer({ ...this.traite, annexions: [...this.traite.annexions] });
    this.fermer();
  }
}

/** Résumé lisible d'un traité, pour le cabinet diplomatique. */
export function decrireTermes(etat, traite) {
  const lignes = [];
  const vainqueur = etat.empires[traite.demandeur];
  for (const id of traite.annexions) {
    lignes.push(`${etat.carte.territoires[id].nom} passe à ${avecArticle(vainqueur)}`);
  }
  if (traite.tribut > 0) lignes.push(`tribut de ${Math.round(traite.tribut)} pièces d'or`);
  if (lignes.length === 0) lignes.push('aucune cession : les armes se taisent, rien de plus');
  return lignes;
}
