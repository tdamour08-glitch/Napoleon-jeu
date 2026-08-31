/* ============================================================
   moteur.js — boucle de jeu temps réel avec pause
   ------------------------------------------------------------
   Le temps du jeu avance par « pas » d'un jour. Le rendu, lui,
   tourne à la fréquence de l'écran, pause comprise.
   ============================================================ */

const MS_PAR_JOUR = 900; // durée réelle d'un jour de jeu à la vitesse x1

export class Moteur {
  /**
   * @param {object} etat état de la partie
   * @param {(etat:object)=>void} surJour appelé à chaque jour écoulé
   * @param {(etat:object, dt:number)=>void} surRendu appelé à chaque image
   */
  constructor(etat, surJour, surRendu) {
    this.etat = etat;
    this.surJour = surJour;
    this.surRendu = surRendu;
    this.accumulateur = 0;
    this.dernierInstant = 0;
    this.enMarche = false;
    this.boucle = this.boucle.bind(this);
  }

  demarrer() {
    if (this.enMarche) return;
    this.enMarche = true;
    this.dernierInstant = performance.now();
    requestAnimationFrame(this.boucle);
  }

  arreter() {
    this.enMarche = false;
  }

  basculerPause() {
    this.etat.enPause = !this.etat.enPause;
    return this.etat.enPause;
  }

  definirVitesse(v) {
    this.etat.vitesse = v;
    // Régler la vitesse relance toujours le temps.
    this.etat.enPause = false;
  }

  boucle(instant) {
    if (!this.enMarche) return;
    const dt = Math.min(100, instant - this.dernierInstant);
    this.dernierInstant = instant;

    if (!this.etat.enPause) {
      this.accumulateur += dt * this.etat.vitesse;
      // Plafond de rattrapage : on ne simule jamais plus de 10 jours par image.
      let pas = 0;
      while (this.accumulateur >= MS_PAR_JOUR && pas < 10) {
        this.accumulateur -= MS_PAR_JOUR;
        pas += 1;
        this.surJour(this.etat);
      }
      if (pas >= 10) this.accumulateur = 0;
    }

    this.surRendu(this.etat, dt);
    requestAnimationFrame(this.boucle);
  }
}
