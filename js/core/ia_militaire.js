/* ============================================================
   ia_militaire.js — conduite des armées non jouées
   ------------------------------------------------------------
   Portée volontairement limitée à la phase 3 : ces règles savent
   défendre une frontière et marcher sur un objectif, rien de plus.
   La stratégie d'ensemble — quand déclarer la guerre, qui
   s'allier, quand demander la paix — arrive en phase 4.
   ============================================================ */

import { controleur } from './etat.js';
import { ennemis, sontEnGuerre } from './diplomatie.js';
import {
  armeesDans,
  ordonnerMarche,
  verifierLevee,
  lancerLevee,
  TAILLE_CORPS,
} from './armees.js';
import { puissance } from './combat.js';

/** Une décision tous les trois jours suffit à animer la carte. */
const PERIODE = 3;

/**
 * Rapport de force au-delà duquel on refuse l'attaque. Au-dessus de 1,
 * on accepte d'attaquer un défenseur légèrement supérieur — sans quoi le
 * bonus défensif du terrain paralyse toutes les offensives.
 */
const SEUIL_AUDACE = 1.15;

export function conduireArmeesBots(etat) {
  if (etat.jourEcoule % PERIODE !== 0) return;

  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant || empire.estJoueur) continue;
    const adversaires = ennemis(etat, empire.id);
    leverSiNecessaire(etat, empire, adversaires.length > 0);
    if (adversaires.length === 0) {
      rentrerAuPays(etat, empire);
      continue;
    }
    conduireCampagne(etat, empire, adversaires);
  }
}

/** Une puissance en guerre lève des troupes tant qu'elle en a les moyens. */
function leverSiNecessaire(etat, empire, enGuerre) {
  const hommes = effectifTotal(etat, empire.id);
  const plafond = enGuerre ? empire.reservesMax * 1.2 : empire.reservesMax * 0.6;
  if (hommes >= plafond) return;

  const provinces = empire.territoires
    .map((id) => etat.carte.territoires[id])
    .filter((t) => !t.levee && verifierLevee(etat, t).possible)
    .sort((a, b) => b.population - a.population);
  if (provinces.length) lancerLevee(etat, provinces[0]);
}

function conduireCampagne(etat, empire, adversaires) {
  // On décide par province : les corps rassemblés attaquent ensemble,
  // sinon chacun se juge trop faible et personne ne bouge jamais.
  const parProvince = new Map();
  for (const armee of Object.values(etat.armees)) {
    if (armee.empire !== empire.id || armee.route || armee.enBataille) continue;
    if (!parProvince.has(armee.lieu)) parProvince.set(armee.lieu, []);
    parProvince.get(armee.lieu).push(armee);
  }

  for (const [idLieu, corps] of parProvince) {
    const ici = etat.carte.territoires[idLieu];

    // 0. On tient le terrain conquis : partir annulerait l'occupation en cours.
    if (adversaires.includes(controleur(ici)) || ici.occupationEnCours) continue;

    // 1. Une province voisine à nous est attaquée : on vole au secours.
    const menacee = ici.voisins
      .map((id) => etat.carte.territoires[id])
      .find(
        (t) =>
          controleur(t) === empire.id &&
          armeesDans(etat, t.id).some((a) => sontEnGuerre(etat, a.empire, empire.id)),
      );
    if (menacee) {
      for (const armee of corps) ordonnerMarche(etat, armee, menacee.id);
      continue;
    }

    // 2. Une province ennemie voisine est à notre portée : on l'attaque en masse.
    const notre = corps.reduce((s, a) => s + puissance(etat, a, ici, false), 0);
    const proie = ici.voisins
      .map((id) => etat.carte.territoires[id])
      .filter((t) => adversaires.includes(controleur(t)))
      .map((t) => ({ territoire: t, defense: defenseDe(etat, t) }))
      .filter(({ defense }) => defense < notre * SEUIL_AUDACE)
      .sort((a, b) => a.defense - b.defense)[0];
    if (proie) {
      for (const armee of corps) ordonnerMarche(etat, armee, proie.territoire.id);
      continue;
    }

    // 3. Sinon, on rejoint le front ; à défaut de front, on marche sur l'ennemi.
    const objectif = trouverFront(etat, empire, adversaires) ?? ennemiLePlusProche(etat, corps[0], adversaires);
    if (objectif && objectif !== idLieu) {
      for (const armee of corps) ordonnerMarche(etat, armee, objectif);
    }
  }
}

/** Hors guerre, les corps isolés rentrent vers la capitale. */
function rentrerAuPays(etat, empire) {
  const capitale = empire.territoires
    .map((id) => etat.carte.territoires[id])
    .find((t) => t.capitale);
  if (!capitale) return;
  for (const armee of Object.values(etat.armees)) {
    if (armee.empire !== empire.id || armee.route || armee.enBataille) continue;
    if (controleur(etat.carte.territoires[armee.lieu]) === empire.id) continue;
    ordonnerMarche(etat, armee, capitale.id);
  }
}

/** Province frontière la plus exposée : celle de nos provinces qui touche l'ennemi. */
function trouverFront(etat, empire, adversaires) {
  let meilleur = null;
  let meilleurScore = -Infinity;
  for (const id of empire.territoires) {
    const t = etat.carte.territoires[id];
    const contacts = t.voisins.filter((v) => adversaires.includes(controleur(etat.carte.territoires[v])));
    if (contacts.length === 0) continue;
    const score = contacts.length * 2 + t.population - defenseDe(etat, t) / 10;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = id;
    }
  }
  return meilleur;
}

/**
 * Province ennemie la plus proche en jours de marche. Sans cela, une
 * puissance en guerre avec un adversaire lointain reste l'arme au pied.
 */
function ennemiLePlusProche(etat, armee, adversaires) {
  const vus = new Set([armee.lieu]);
  let frontiere = [armee.lieu];
  for (let profondeur = 0; profondeur < 12 && frontiere.length; profondeur++) {
    const suivante = [];
    for (const id of frontiere) {
      for (const voisin of etat.carte.territoires[id].voisins) {
        if (vus.has(voisin)) continue;
        vus.add(voisin);
        if (adversaires.includes(controleur(etat.carte.territoires[voisin]))) return voisin;
        suivante.push(voisin);
      }
    }
    frontiere = suivante;
  }
  return null;
}

function defenseDe(etat, territoire) {
  return armeesDans(etat, territoire.id).reduce(
    (s, a) => s + puissance(etat, a, territoire, true),
    0,
  );
}

function effectifTotal(etat, idEmpire) {
  return Object.values(etat.armees)
    .filter((a) => a.empire === idEmpire)
    .reduce((s, a) => s + a.effectif, 0);
}

export { TAILLE_CORPS };
