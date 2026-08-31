/* ============================================================
   tour.js — déroulé d'une journée de jeu
   ------------------------------------------------------------
   Un seul endroit décrit l'ordre des systèmes, partagé par la
   boucle temps réel et par les simulations d'équilibrage.
   ============================================================ */

import { avancerJour } from './etat.js';
import { appliquerJourEconomie, gererEconomieBots, recalculerEconomie } from './economie.js';
import { appliquerJourMilitaire } from './armees.js';
import { appliquerJourCombat } from './combat.js';
import { conduireArmeesBots } from './ia_militaire.js';

export function jouerUnJour(etat) {
  avancerJour(etat);

  // 1. Ressources, chantiers, moral des provinces, réserves d'hommes.
  appliquerJourEconomie(etat);

  // 2. Levées, marches, dérive de la motivation.
  appliquerJourMilitaire(etat);

  // 3. Batailles, déroutes, occupations.
  appliquerJourCombat(etat);

  // 4. Décisions des puissances non jouées.
  gererEconomieBots(etat);
  conduireArmeesBots(etat);

  // Une province qui change de mains bouleverse les bilans.
  if (etat.economieARecalculer) {
    recalculerEconomie(etat);
    etat.economieARecalculer = false;
  }
}
