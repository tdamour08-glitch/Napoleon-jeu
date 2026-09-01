/* ============================================================
   economie.js — production, entretien, chantiers et marché
   ------------------------------------------------------------
   Chaque province produit selon ses gisements, sa population et
   son développement ; elle coûte en retour de l'eau et du bois
   pour nourrir ses habitants, de l'or pour l'administrer, et du
   charbon et du fer pour entretenir ses infrastructures.
   Un empire qui se développe sans surveiller son entretien
   finit en pénurie, et son moral s'effondre.
   ============================================================ */

import { RESSOURCES } from '../data/empires.js';
import { controleur, estOccupe, recenserTerritoires, alerter, journaliser } from './etat.js';
import { entretienMilitaire, regenererReserves, calculerReservesMax, estPort } from './armees.js';
import { malusRevolte } from './revolte.js';
import { coutAssimilation } from './assimilation.js';
import {
  effetsPolitiques,
  coutPolitiques,
  moralImpot,
  servirLaDette,
  emprunter,
  faireEvoluerPopulation,
} from './politiques.js';

/** Rendement d'un gisement selon le terrain : certains sols donnent plus. */
const AFFINITES_TERRAIN = {
  plaine: { bois: 0.9, eau: 1.1, charbon: 1.0, fer: 1.0, or: 1.0 },
  colline: { bois: 1.0, eau: 0.9, charbon: 1.2, fer: 1.2, or: 1.1 },
  montagne: { bois: 0.9, eau: 1.0, charbon: 1.3, fer: 1.3, or: 1.2 },
  foret: { bois: 1.4, eau: 1.0, charbon: 0.9, fer: 1.0, or: 0.9 },
  cote: { bois: 0.9, eau: 1.3, charbon: 0.9, fer: 0.9, or: 1.1 },
  desert: { bois: 0.4, eau: 0.5, charbon: 1.0, fer: 1.0, or: 1.1 },
  steppe: { bois: 0.7, eau: 0.8, charbon: 1.0, fer: 1.0, or: 1.0 },
  toundra: { bois: 1.1, eau: 0.9, charbon: 1.1, fer: 1.1, or: 1.0 },
  jungle: { bois: 1.4, eau: 1.2, charbon: 0.7, fer: 0.8, or: 1.2 },
};

/** Une colonie est loin : elle rend moins et coûte plus à administrer. */
const RENDEMENT_COLONIE = 0.7;

/**
 * Commerce maritime : l'or que rapportent les ports et surtout les colonies.
 * C'est là, et non dans l'impôt, que se joue la richesse des puissances
 * maritimes — les Indes et les Antilles pèsent bien plus qu'une province.
 */
const OR_PAR_PORT = 0.35;
const OR_PAR_COLONIE = 1.6;
/** Une province occupée mais non annexée travaille à contrecœur. */
const RENDEMENT_OCCUPATION = 0.5;

export const DEVELOPPEMENT_MAX = 3;

/** Coût pour passer du niveau `niveau` au niveau suivant. */
export function coutDeveloppement(niveau) {
  return {
    bois: 120 + 120 * niveau,
    fer: 80 + 100 * niveau,
    or: 160 + 180 * niveau,
  };
}

/** Durée des travaux, en jours. */
export function dureeDeveloppement(niveau) {
  return 60 + 40 * niveau;
}

/* ------------------------------------------------------------
   Production et entretien d'une province
   ------------------------------------------------------------ */

/** Ce qu'une province rapporte par jour. */
export function productionTerritoire(territoire, empire = null) {
  const affinites = AFFINITES_TERRAIN[territoire.terrain] ?? AFFINITES_TERRAIN.plaine;
  let facteur = (0.35 + 0.2 * territoire.population) * (1 + 0.35 * territoire.developpement);
  if (territoire.colonie) facteur *= RENDEMENT_COLONIE;
  if (estOccupe(territoire)) facteur *= RENDEMENT_OCCUPATION;
  // Une population démoralisée travaille mal : de 0,7 à 1,15.
  facteur *= 0.7 + (territoire.moral / 100) * 0.45;
  // Et une province qui gronde travaille moins encore.
  facteur *= malusRevolte(territoire);

  const sortie = {};
  for (const r of RESSOURCES) {
    sortie[r.id] = territoire.gisements[r.id] * affinites[r.id] * facteur;
  }
  // L'impôt : un État vit d'abord de ses sujets, pas seulement de ses mines.
  const taux = empire ? empire.tauxImposition : 1;
  const remise = empire ? effetsPolitiques(empire).impot : 0;
  sortie.impots =
    0.3 * territoire.population * (1 + 0.2 * territoire.developpement) *
    facteurLoyaute(territoire) * (taux + remise);
  sortie.or += sortie.impots;
  return sortie;
}

/** Une province occupée ou lointaine paie mal l'impôt. */
function facteurLoyaute(territoire) {
  if (estOccupe(territoire)) return 0.4;
  if (territoire.colonie) return 0.75;
  return 1;
}

/** Ce qu'une province coûte par jour. */
export function consommationTerritoire(territoire) {
  const habitants = territoire.population;
  const dev = territoire.developpement;
  return {
    eau: 0.35 * habitants + 0.15 * dev,
    bois: 0.25 * habitants + 0.2 * dev,
    charbon: 0.35 * dev,
    fer: 0.25 * dev,
    or: 0.2 + 0.18 * habitants + (territoire.colonie ? 0.5 : 0) + (estOccupe(territoire) ? 0.7 : 0),
  };
}

/* ------------------------------------------------------------
   Bilan d'un empire
   ------------------------------------------------------------ */

/** Recalcule production, entretien et solde net de chaque empire. */
export function recalculerEconomie(etat) {
  recenserTerritoires(etat);

  for (const empire of Object.values(etat.empires)) {
    for (const r of RESSOURCES) {
      empire.production[r.id] = 0;
      empire.consommation[r.id] = 0;
    }
  }

  for (const empire of Object.values(etat.empires)) {
    empire.budget = {
      impots: 0, commerce: 0, ressources: 0,
      administration: 0, armee: 0, politiques: 0, assimilation: 0, interets: 0,
    };
  }

  for (const id of etat.carte.ordre) {
    const territoire = etat.carte.territoires[id];
    const empire = etat.empires[controleur(territoire)];
    if (!empire) continue;
    const production = productionTerritoire(territoire, empire);
    const consommation = consommationTerritoire(territoire);
    for (const r of RESSOURCES) {
      empire.production[r.id] += production[r.id];
      empire.consommation[r.id] += consommation[r.id];
    }
    empire.budget.impots += production.impots;
    empire.budget.ressources += production.or - production.impots;
    empire.budget.administration += consommation.or;
  }

  // Le commerce maritime, compté empire par empire : il dépend des ports et
  // des colonies, non de chaque province prise séparément.
  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant) continue;
    let ports = 0;
    let colonies = 0;
    for (const id of empire.territoires) {
      const t = etat.carte.territoires[id];
      if (estPort(t)) ports += 1;
      if (t.colonie) colonies += 1;
    }
    const commerce =
      (ports * OR_PAR_PORT + colonies * OR_PAR_COLONIE) * (empire.doctrine.commerce ?? 1);
    empire.budget.commerce = commerce;
    empire.production.or += commerce;
  }

  // Entretien des armées et des politiques : les deux grands postes de dépense.
  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant) continue;
    const solde = entretienMilitaire(etat, empire.id);
    for (const r of RESSOURCES) empire.consommation[r.id] += solde[r.id] ?? 0;
    empire.budget.armee = solde.or ?? 0;

    const social = coutPolitiques(etat, empire);
    for (const r of RESSOURCES) empire.consommation[r.id] += social[r.id] ?? 0;
    empire.budget.politiques = social.or ?? 0;

    const culturel = coutAssimilation(etat, empire.id);
    for (const r of RESSOURCES) empire.consommation[r.id] += culturel[r.id] ?? 0;
    empire.budget.assimilation = culturel.or ?? 0;

    empire.consommation.or += empire.interets;
    empire.budget.interets = empire.interets;
    empire.reservesMax = calculerReservesMax(etat, empire);
    empire.reserves = Math.min(empire.reserves, empire.reservesMax);
  }

  for (const empire of Object.values(etat.empires)) {
    // Sans charbon ni fer, les ateliers tournent au ralenti.
    const malus = (empire.penuries.charbon ? 0.9 : 1) * (empire.penuries.fer ? 0.92 : 1);
    if (malus < 1) {
      for (const r of RESSOURCES) empire.production[r.id] *= malus;
    }
    // L'instruction publique rend les ateliers plus productifs.
    const rendement = 1 + effetsPolitiques(empire).production;
    if (rendement !== 1) {
      for (const r of RESSOURCES) empire.production[r.id] *= rendement;
    }

    for (const r of RESSOURCES) {
      empire.net[r.id] = empire.production[r.id] - empire.consommation[r.id];
    }
    // Capacité de stockage : les entrepôts suivent la taille de l'empire.
    empire.capacite = 400 + 90 * empire.territoires.length;
  }
}

/** Réserves d'hommes au début de la partie : la moitié du potentiel. */
export function initialiserReserves(etat) {
  for (const empire of Object.values(etat.empires)) {
    empire.reservesMax = calculerReservesMax(etat, empire);
    empire.reserves = Math.round(empire.reservesMax * 0.5);
  }
}

/* ------------------------------------------------------------
   Un jour d'économie
   ------------------------------------------------------------ */

export function appliquerJourEconomie(etat) {
  for (const empire of Object.values(etat.empires)) servirLaDette(empire);
  recalculerEconomie(etat);
  regenererReserves(etat);

  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant) continue;

    for (const r of RESSOURCES) {
      const stock = empire.stocks[r.id] + empire.net[r.id];
      if (r.id === 'or' && stock < 0) {
        // Un État ne fait pas faillite du jour au lendemain : il emprunte.
        const decouvert = emprunter(etat, empire, -stock);
        empire.penuries.or = decouvert > 0;
        empire.stocks.or = 0;
        continue;
      }
      empire.penuries[r.id] = stock < 0;
      empire.stocks[r.id] = Math.max(0, Math.min(empire.capacite, stock));
    }

    if (empire.estJoueur) signalerPenuries(etat, empire);
  }

  for (const id of etat.carte.ordre) {
    const territoire = etat.carte.territoires[id];
    avancerChantier(etat, territoire);
    faireEvoluerMoral(etat, territoire);
    faireEvoluerPopulation(etat, territoire);
  }
}

/** Le moral d'une province glisse vers une valeur d'équilibre. */
function faireEvoluerMoral(etat, territoire) {
  const empire = etat.empires[controleur(territoire)];
  if (!empire) return;

  const effets = effetsPolitiques(empire);
  let cible = 55 + 6 * territoire.developpement + effets.moral + moralImpot(empire.tauxImposition);
  if (territoire.colonie) cible -= 8;
  if (estOccupe(territoire)) cible -= 25;
  if (empire.penuries.eau) cible -= 20;
  if (empire.penuries.bois) cible -= 10;
  if (empire.penuries.or) cible -= 8;
  // Une province qui ne se reconnaît pas dans son drapeau boude.
  cible -= (territoire.revolte ?? 0) * 0.12;
  cible = Math.max(0, Math.min(100, cible));

  const ecart = cible - territoire.moral;
  territoire.moral += Math.sign(ecart) * Math.min(Math.abs(ecart), 0.25);
}

function signalerPenuries(etat, empire) {
  for (const r of RESSOURCES) {
    if (!empire.penuries[r.id]) continue;
    alerter(
      etat,
      `penurie-${r.id}`,
      60,
      `<strong>Pénurie ${r.de}</strong> : les réserves sont épuisées, le moral des provinces décline.`,
    );
  }
}

/* ------------------------------------------------------------
   Chantiers de développement
   ------------------------------------------------------------ */

/** Peut-on lancer des travaux sur cette province ? Renvoie un motif si non. */
export function verifierChantier(etat, territoire) {
  const empire = etat.empires[controleur(territoire)];
  if (!empire) return { possible: false, motif: 'Province sans maître.' };
  if (territoire.chantier) return { possible: false, motif: 'Des travaux sont déjà en cours.' };
  if (territoire.developpement >= DEVELOPPEMENT_MAX) {
    return { possible: false, motif: 'Cette province est déjà pleinement développée.' };
  }
  if (estOccupe(territoire)) {
    return { possible: false, motif: 'On ne bâtit pas sur une province seulement occupée.' };
  }
  const cout = coutDeveloppement(territoire.developpement);
  for (const [ressource, montant] of Object.entries(cout)) {
    if (empire.stocks[ressource] < montant) {
      const r = RESSOURCES.find((res) => res.id === ressource);
      return { possible: false, motif: `Il manque ${r.du}.`, cout };
    }
  }
  return { possible: true, cout };
}

/** Débite le trésor et ouvre le chantier. */
export function lancerChantier(etat, territoire) {
  const verdict = verifierChantier(etat, territoire);
  if (!verdict.possible) return verdict;

  const empire = etat.empires[controleur(territoire)];
  for (const [ressource, montant] of Object.entries(verdict.cout)) {
    empire.stocks[ressource] -= montant;
  }
  const duree = dureeDeveloppement(territoire.developpement);
  territoire.chantier = { duree, restant: duree, niveauVise: territoire.developpement + 1 };

  if (empire.estJoueur) {
    journaliser(etat, `Travaux ouverts en <strong>${territoire.nom}</strong> (${duree} jours).`);
  }
  return { possible: true };
}

function avancerChantier(etat, territoire) {
  const chantier = territoire.chantier;
  if (!chantier) return;
  const empire = etat.empires[controleur(territoire)];
  // Sans or, les ouvriers ne sont pas payés : le chantier s'arrête.
  if (empire?.penuries.or) return;

  chantier.restant -= 1 + effetsPolitiques(empire).chantiers;
  if (chantier.restant > 0) return;

  territoire.developpement = chantier.niveauVise;
  territoire.chantier = null;
  territoire.moral = Math.min(100, territoire.moral + 5);
  if (empire?.estJoueur) {
    journaliser(
      etat,
      `<strong>${territoire.nom}</strong> atteint le développement ${territoire.developpement}.`,
    );
  }
}

/* ------------------------------------------------------------
   Marché : tout s'achète et se vend contre de l'or
   ------------------------------------------------------------ */

/** Combien d'unités d'une ressource vaut une pièce d'or. */
const PARITES = { bois: 3.0, eau: 4.0, charbon: 2.6, fer: 2.2 };
/** Marge prise par les marchands, dans les deux sens. */
const MARGE = 0.15;

export const LOT_MARCHE = 50;

/** Prix en or d'un lot acheté / reçu pour un lot vendu. */
export function prixMarche(ressource) {
  const parite = PARITES[ressource];
  if (!parite) return null;
  return {
    achat: (LOT_MARCHE / parite) * (1 + MARGE),
    vente: (LOT_MARCHE / parite) * (1 - MARGE),
  };
}

/**
 * Achète (`sens = 'achat'`) ou vend (`sens = 'vente'`) un lot contre de l'or.
 * @returns {{ok: boolean, motif?: string}}
 */
export function echanger(etat, empire, ressource, sens) {
  const prix = prixMarche(ressource);
  if (!prix) return { ok: false, motif: 'L\'or ne s\'échange pas contre lui-même.' };

  if (sens === 'achat') {
    if (empire.stocks.or < prix.achat) return { ok: false, motif: 'Trésor insuffisant.' };
    empire.stocks.or -= prix.achat;
    empire.stocks[ressource] = Math.min(empire.capacite, empire.stocks[ressource] + LOT_MARCHE);
  } else {
    if (empire.stocks[ressource] < LOT_MARCHE) return { ok: false, motif: 'Stock insuffisant.' };
    empire.stocks[ressource] -= LOT_MARCHE;
    empire.stocks.or = Math.min(empire.capacite, empire.stocks.or + prix.vente);
  }
  return { ok: true };
}

/* ------------------------------------------------------------
   Gestion économique sommaire des puissances non jouées.
   L'intelligence artificielle proprement dite arrive en phase 4.
   ------------------------------------------------------------ */

export function gererEconomieBots(etat) {
  // Une décision par empire tous les dix jours, pour rester léger.
  if (etat.jourEcoule % 10 !== 0) return;

  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant || empire.estJoueur) continue;

    // Vendre les surplus pour financer l'administration.
    for (const ressource of Object.keys(PARITES)) {
      if (empire.stocks[ressource] > empire.capacite * 0.8 && empire.net[ressource] > 0) {
        echanger(etat, empire, ressource, 'vente');
      }
    }
    // Acheter ce qui manque, tant que le trésor le permet.
    for (const ressource of Object.keys(PARITES)) {
      const manque = empire.penuries[ressource] || empire.stocks[ressource] < LOT_MARCHE;
      if (manque && empire.stocks.or > empire.capacite * 0.25) {
        echanger(etat, empire, ressource, 'achat');
      }
    }
    if (empire.penuries.or) continue;

    // Développer la province la plus prometteuse encore améliorable.
    const candidates = empire.territoires
      .map((id) => etat.carte.territoires[id])
      .filter((t) => !t.chantier && t.developpement < DEVELOPPEMENT_MAX && !estOccupe(t))
      .sort((a, b) => valeurProvince(b) - valeurProvince(a));

    for (const territoire of candidates.slice(0, 3)) {
      if (verifierChantier(etat, territoire).possible) {
        lancerChantier(etat, territoire);
        break;
      }
    }
  }
}

function valeurProvince(territoire) {
  const total = Object.values(territoire.gisements).reduce((s, v) => s + v, 0);
  return total * (1 + territoire.population) - territoire.developpement * 2;
}
