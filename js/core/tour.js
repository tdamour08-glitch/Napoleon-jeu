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
import { conduireDiplomatieBots, suivreGuerres, expirerOffres } from './ia_strategie.js';
import { verifierRedditions, verifierEliminations, verifierVictoire } from './traites.js';
import { avancerRevolte, signalerRevoltes } from './revolte.js';

export function jouerUnJour(etat) {
  // Une partie terminée ne se poursuit pas.
  if (etat.fin) return;
  avancerJour(etat);

  // 1. Ressources, chantiers, moral des provinces, réserves d'hommes.
  appliquerJourEconomie(etat);

  // 2. Levées, marches, dérive de la motivation.
  appliquerJourMilitaire(etat);

  // 3. Batailles, déroutes, occupations.
  appliquerJourCombat(etat);

  // 4. Ce que les peuples en pensent : jauges de révolte et soulèvements.
  for (const id of etat.carte.ordre) avancerRevolte(etat, etat.carte.territoires[id]);
  signalerRevoltes(etat);

  // 5. Décisions des puissances non jouées : cabinet, puis état-major.
  suivreGuerres(etat);
  expirerOffres(etat);
  conduireDiplomatieBots(etat);
  gererEconomieBots(etat);
  conduireArmeesBots(etat);

  // 6. Capitulations, disparitions, et fin de partie.
  verifierRedditions(etat);
  if (etat.economieARecalculer) {
    recalculerEconomie(etat);
    etat.economieARecalculer = false;
  }
  verifierEliminations(etat);
  verifierVictoire(etat);

  // Une province qui change de mains bouleverse les bilans.
  if (etat.economieARecalculer) {
    recalculerEconomie(etat);
    etat.economieARecalculer = false;
  }
}
