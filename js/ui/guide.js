/* ============================================================
   guide.js — fenêtre « Comment jouer »
   ------------------------------------------------------------
   Le contenu vit dans index.html ; ce module se contente de
   l'ouvrir, de le fermer et de retenir le choix du joueur.
   ============================================================ */

const CLE_MEMOIRE = 'aigles.guide.masque';

/** Lecture tolérante : un navigateur en navigation privée peut refuser le stockage. */
function estMasque() {
  try {
    return localStorage.getItem(CLE_MEMOIRE) === '1';
  } catch {
    return false;
  }
}

function memoriser(masque) {
  try {
    localStorage.setItem(CLE_MEMOIRE, masque ? '1' : '0');
  } catch {
    /* stockage indisponible : le choix ne sera pas retenu, sans conséquence */
  }
}

export class Guide {
  /**
   * @param {{ surOuverture?: ()=>void, surFermeture?: ()=>void }} rappels
   */
  constructor(rappels = {}) {
    this.rappels = rappels;
    this.voile = document.getElementById('ecran-guide');
    this.caseMemoire = document.getElementById('guide-ne-plus-montrer');
    this.caseMemoire.checked = estMasque();

    document.getElementById('btn-guide').addEventListener('click', () => this.basculer());
    document.getElementById('btn-fermer-guide').addEventListener('click', () => this.fermer());
    document.getElementById('btn-guide-compris').addEventListener('click', () => this.fermer());
    this.caseMemoire.addEventListener('change', () => memoriser(this.caseMemoire.checked));
    this.voile.addEventListener('click', (ev) => {
      if (ev.target === this.voile) this.fermer();
    });
  }

  get ouvert() {
    return !this.voile.classList.contains('cache');
  }

  ouvrir() {
    this.voile.classList.remove('cache');
    document.getElementById('btn-guide').classList.add('actif');
    this.rappels.surOuverture?.();
  }

  fermer() {
    this.voile.classList.add('cache');
    document.getElementById('btn-guide').classList.remove('actif');
    this.rappels.surFermeture?.();
  }

  basculer() {
    if (this.ouvert) this.fermer();
    else this.ouvrir();
  }

  /** Ouvre le guide au premier lancement, sauf si le joueur l'a désactivé. */
  ouvrirAuPremierLancement() {
    if (!estMasque()) this.ouvrir();
  }
}
