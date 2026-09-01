/* ============================================================
   diplomatie.js — relations, alliances et opinions
   ------------------------------------------------------------
   Trois états possibles entre deux puissances : la paix (l'état
   par défaut), la guerre, ou l'alliance. Chaque puissance tient
   en outre une opinion chiffrée de toutes les autres, qui guide
   les décisions de core/ia_strategie.js.

   Les traités de paix qui cèdent des provinces relèvent de la
   phase 5 ; on ne trouve ici que l'armistice, qui arrête les
   combats et laisse les occupations en place.
   ============================================================ */

import { journaliser, controleur } from './etat.js';
import { avecArticle, datif } from '../data/langue.js';

export const PAIX = 'paix';
export const GUERRE = 'guerre';
export const ALLIANCE = 'alliance';

/** Clé symétrique d'un couple de puissances. */
function cle(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function relation(etat, a, b) {
  if (a === b) return PAIX;
  return etat.relations[cle(a, b)] ?? PAIX;
}

export function sontEnGuerre(etat, a, b) {
  return relation(etat, a, b) === GUERRE;
}

export function sontAllies(etat, a, b) {
  return relation(etat, a, b) === ALLIANCE;
}

/** Liste des puissances dans un état de relation donné avec `id`. */
function partenaires(etat, id, etatRecherche) {
  const sortie = [];
  for (const [paire, valeur] of Object.entries(etat.relations)) {
    if (valeur !== etatRecherche) continue;
    const [a, b] = paire.split('|');
    if (a === id) sortie.push(b);
    else if (b === id) sortie.push(a);
  }
  return sortie;
}

export const ennemis = (etat, id) => partenaires(etat, id, GUERRE);
export const allies = (etat, id) => partenaires(etat, id, ALLIANCE);

/* ------------------------------------------------------------
   Opinions
   ------------------------------------------------------------ */

/** Opinion de `a` envers `b`, de -100 (haine) à +100 (confiance). */
export function opinion(etat, a, b) {
  return etat.opinions[a]?.[b] ?? 0;
}

export function ajusterOpinion(etat, a, b, delta) {
  if (a === b) return;
  if (!etat.opinions[a]) etat.opinions[a] = {};
  const valeur = (etat.opinions[a][b] ?? 0) + delta;
  etat.opinions[a][b] = Math.max(-100, Math.min(100, valeur));
}

/** Ajuste l'opinion dans les deux sens. */
function ajusterMutuellement(etat, a, b, delta) {
  ajusterOpinion(etat, a, b, delta);
  ajusterOpinion(etat, b, a, delta);
}

/* ------------------------------------------------------------
   Guerre
   ------------------------------------------------------------ */

/**
 * Déclare la guerre et appelle les alliances des deux camps.
 * @returns {boolean} false si la guerre était déjà déclarée
 */
export function declarerGuerre(etat, agresseur, victime, silencieux = false) {
  if (agresseur === victime) return false;
  if (sontEnGuerre(etat, agresseur, victime)) return false;

  // Une alliance ne survit pas à une déclaration de guerre entre alliés.
  if (sontAllies(etat, agresseur, victime)) {
    delete etat.relations[cle(agresseur, victime)];
    ajusterMutuellement(etat, agresseur, victime, -60);
  }

  etat.relations[cle(agresseur, victime)] = GUERRE;
  ajusterOpinion(etat, victime, agresseur, -45);
  ajusterOpinion(etat, agresseur, victime, -20);

  if (!silencieux) {
    journaliser(
      etat,
      `<strong>${etat.empires[agresseur].nom}</strong> déclare la guerre ${datif(etat.empires[victime])}.`,
    );
  }

  appelerAuxArmes(etat, agresseur, victime);
  return true;
}

/**
 * Les alliés de chaque camp entrent dans la guerre — mais seulement ceux
 * que la querelle concerne, c'est-à-dire ceux qui touchent l'un des deux
 * belligérants. Sans cette réserve, une escarmouche entre deux principautés
 * allemandes met la Perse en guerre contre les États-Unis.
 */
function appelerAuxArmes(etat, agresseur, victime) {
  const concerne = (allie, contre) =>
    sontVoisines(etat, allie, contre) || sontVoisines(etat, allie, allie === agresseur ? victime : agresseur);

  for (const allie of allies(etat, victime)) {
    if (allie === agresseur || sontEnGuerre(etat, allie, agresseur)) continue;
    if (sontAllies(etat, allie, agresseur)) continue;
    if (!concerne(allie, agresseur)) continue;
    etat.relations[cle(allie, agresseur)] = GUERRE;
    journaliser(
      etat,
      `<strong>${etat.empires[allie].nom}</strong> honore son alliance et entre en guerre ` +
        `contre ${avecArticle(etat.empires[agresseur])}.`,
    );
  }
  for (const allie of allies(etat, agresseur)) {
    if (allie === victime || sontEnGuerre(etat, allie, victime)) continue;
    if (sontAllies(etat, allie, victime)) continue;
    if (!concerne(allie, victime)) continue;
    etat.relations[cle(allie, victime)] = GUERRE;
    journaliser(
      etat,
      `<strong>${etat.empires[allie].nom}</strong> suit son allié et déclare la guerre ` +
        `${datif(etat.empires[victime])}.`,
    );
  }
}

/**
 * Armistice : les armes se taisent, les occupations demeurent.
 * La cession des provinces occupées demandera un traité (phase 5).
 */
export function conclureArmistice(etat, a, b, silencieux = false) {
  if (!sontEnGuerre(etat, a, b)) return false;
  delete etat.relations[cle(a, b)];
  ajusterMutuellement(etat, a, b, 15);
  if (!silencieux) {
    journaliser(
      etat,
      `Armistice entre <strong>${etat.empires[a].nom}</strong> et ${avecArticle(etat.empires[b])}. ` +
        `Les provinces occupées le restent.`,
    );
  }
  return true;
}

/* ------------------------------------------------------------
   Alliances
   ------------------------------------------------------------ */

/** Noue une alliance. Refuse si les deux puissances sont en guerre. */
export function conclureAlliance(etat, a, b, silencieux = false) {
  if (a === b) return false;
  if (sontEnGuerre(etat, a, b)) return false;
  if (sontAllies(etat, a, b)) return false;
  etat.relations[cle(a, b)] = ALLIANCE;
  ajusterMutuellement(etat, a, b, 25);
  if (!silencieux) {
    journaliser(
      etat,
      `Alliance conclue entre <strong>${etat.empires[a].nom}</strong> et ${avecArticle(etat.empires[b])}.`,
    );
  }
  return true;
}

export function rompreAlliance(etat, a, b, silencieux = false) {
  if (!sontAllies(etat, a, b)) return false;
  delete etat.relations[cle(a, b)];
  ajusterOpinion(etat, b, a, -35);
  ajusterOpinion(etat, a, b, -10);
  if (!silencieux) {
    journaliser(
      etat,
      `<strong>${etat.empires[a].nom}</strong> rompt son alliance avec ${avecArticle(etat.empires[b])}.`,
    );
  }
  return true;
}

/** Les deux puissances se touchent-elles, par terre ou par mer ? */
export function sontVoisines(etat, a, b) {
  for (const id of etat.empires[a].territoires) {
    for (const v of etat.carte.territoires[id].voisins) {
      if (controleur(etat.carte.territoires[v]) === b) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------
   Subsides
   ------------------------------------------------------------ */

/** Montant d'un subside et estime qu'il achète. */
export const SUBSIDE = { montant: 200, estime: 8, delai: 90 };

/**
 * Verser de l'or à une puissance pour s'en faire bien voir. C'est ainsi que
 * Londres a payé les coalitions — et c'est le moyen, pour qui domine, de
 * désamorcer celle qui se prépare contre lui.
 * @returns {{ok: boolean, motif: string}}
 */
export function verserSubside(etat, donneur, beneficiaire, montant = SUBSIDE.montant) {
  if (donneur === beneficiaire) return { ok: false, motif: 'On ne se paie pas soi-même.' };
  const payeur = etat.empires[donneur];
  const recu = etat.empires[beneficiaire];
  if (!payeur || !recu?.vivant) return { ok: false, motif: 'Cette puissance n\'existe plus.' };
  if (sontEnGuerre(etat, donneur, beneficiaire)) {
    return { ok: false, motif: 'On ne subventionne pas celui qu\'on combat.' };
  }
  if (payeur.stocks.or < montant) return { ok: false, motif: 'Le Trésor ne suit pas.' };

  const cleSubside = cle(donneur, beneficiaire);
  const dernier = etat.subsides[cleSubside] ?? -SUBSIDE.delai;
  if (etat.jourEcoule - dernier < SUBSIDE.delai) {
    const reste = SUBSIDE.delai - (etat.jourEcoule - dernier);
    return { ok: false, motif: `Un subside vient d'être versé. Patientez ${reste} jours.` };
  }

  payeur.stocks.or -= montant;
  recu.stocks.or = Math.min(recu.capacite, recu.stocks.or + montant);
  etat.subsides[cleSubside] = etat.jourEcoule;
  ajusterOpinion(etat, beneficiaire, donneur, (montant / SUBSIDE.montant) * SUBSIDE.estime);

  if (payeur.estJoueur || recu.estJoueur) {
    journaliser(
      etat,
      `<strong>${payeur.nom}</strong> verse un subside de ${Math.round(montant)} pièces d'or ` +
        `${avecArticle(recu)}.`,
    );
  }
  return { ok: true, motif: `${recu.nom} accepte le subside.` };
}

/** Jours restant avant de pouvoir verser un nouveau subside. */
export function attenteSubside(etat, a, b) {
  const dernier = etat.subsides[cle(a, b)] ?? -SUBSIDE.delai;
  return Math.max(0, SUBSIDE.delai - (etat.jourEcoule - dernier));
}

/** Les puissances en guerre contre au moins un ennemi commun. */
export function ennemisCommuns(etat, a, b) {
  const mesEnnemis = new Set(ennemis(etat, a));
  return ennemis(etat, b).filter((e) => mesEnnemis.has(e));
}
