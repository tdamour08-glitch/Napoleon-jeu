/* ============================================================
   etat.js — état global de la partie
   ------------------------------------------------------------
   Ce module ne connaît que la structure de la partie : carte,
   empires, calendrier, journal. Les règles économiques vivent
   dans core/economie.js, qui s'appuie sur ce module.
   ============================================================ */

import { construireCarte } from '../map/carte.js';
import { EMPIRES, EMPIRES_PAR_ID, DOCTRINE_DEFAUT, RESSOURCES } from '../data/empires.js';

export const DATE_DEPART = { jour: 1, mois: 3, annee: 1805 };

/**
 * Réglages d'une partie, choisis au menu.
 * `doctrinesEgales` et `forcesEgales` permettent de jouer à armes strictement
 * égales : mêmes qualités militaires, mêmes garnisons de départ.
 */
export const OPTIONS_PAR_DEFAUT = {
  doctrinesEgales: false,
  forcesEgales: false,
  agressivite: 'normale', // 'prudente' | 'normale' | 'implacable'
};

const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const JOURS_PAR_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Stock de départ, par ressource. */
const STOCK_INITIAL = 400;

/**
 * Forces de 1805, arme par arme. À terre en milliers d'hommes, à la mer en
 * navires. Les compositions disent l'histoire de chaque armée : l'artillerie
 * de Bonaparte, les cosaques du tsar, la cavalerie prussienne, et surtout la
 * Royal Navy, qui écrase toutes les autres marines réunies.
 */
const FORCES_INITIALES = {
  fra: [
    ['ile_de_france', { infanterie: 26, cavalerie: 8, artillerie: 6 }],
    ['rhenanie', { infanterie: 20, cavalerie: 6, artillerie: 4 }],
    ['lombardie', { infanterie: 17, cavalerie: 5, artillerie: 3 }],
    ['bourgogne', { infanterie: 14, cavalerie: 4, artillerie: 2 }],
    ['bretagne', { ligne: 10, fregate: 6 }],
    ['provence', { ligne: 6, fregate: 4 }],
    ['hollande', { ligne: 4, fregate: 3 }],
  ],
  gbr: [
    ['angleterre', { infanterie: 20, cavalerie: 4, artillerie: 3 }],
    ['irlande', { infanterie: 8, cavalerie: 1, artillerie: 1 }],
    ['bengale', { infanterie: 12, cavalerie: 2, artillerie: 1 }],
    ['angleterre', { ligne: 22, fregate: 16 }],
    ['ecosse', { ligne: 6, fregate: 6 }],
  ],
  pru: [
    ['brandebourg', { infanterie: 24, cavalerie: 8, artillerie: 5 }],
    ['silesie', { infanterie: 14, cavalerie: 4, artillerie: 2 }],
  ],
  aut: [
    ['autriche', { infanterie: 24, cavalerie: 7, artillerie: 5 }],
    ['boheme', { infanterie: 14, cavalerie: 4, artillerie: 2 }],
    ['venetie', { infanterie: 14, cavalerie: 4, artillerie: 2 }],
  ],
  rus: [
    ['moscou', { infanterie: 20, cavalerie: 6, artillerie: 5 }],
    ['lituanie', { infanterie: 20, cavalerie: 7, artillerie: 4 }],
    ['ukraine', { infanterie: 12, cavalerie: 8, artillerie: 2 }],
    ['saint_petersbourg', { ligne: 5, fregate: 4 }],
  ],
  esp: [
    ['castille', { infanterie: 18, cavalerie: 4, artillerie: 3 }],
    ['andalousie', { infanterie: 11, cavalerie: 3, artillerie: 1 }],
    ['andalousie', { ligne: 8, fregate: 5 }],
  ],
  ott: [
    ['constantinople', { infanterie: 20, cavalerie: 8, artillerie: 3 }],
    ['anatolie', { infanterie: 14, cavalerie: 6, artillerie: 1 }],
    ['egypte', { infanterie: 10, cavalerie: 4, artillerie: 1 }],
    ['constantinople', { ligne: 5, fregate: 4 }],
  ],
  dan: [['danemark', { infanterie: 8, cavalerie: 2, artillerie: 1 }], ['danemark', { ligne: 4, fregate: 3 }]],
  sue: [['suede', { infanterie: 8, cavalerie: 2, artillerie: 1 }], ['suede', { ligne: 3, fregate: 3 }]],
  por: [['portugal', { infanterie: 8, cavalerie: 2, artillerie: 1 }], ['portugal', { ligne: 3, fregate: 2 }]],
};

/** Guerres déjà engagées au 1er mars 1805. */
const GUERRES_INITIALES = [['fra', 'gbr']];

/** Alliances déjà signées : Londres et Saint-Pétersbourg, avril 1805. */
const ALLIANCES_INITIALES = [['gbr', 'rus']];

const parRessource = (valeur) => Object.fromEntries(RESSOURCES.map((r) => [r.id, valeur]));

/**
 * Crée l'état d'une nouvelle partie.
 * @param {string} idEmpireJoueur
 */
export function creerPartie(idEmpireJoueur, options = {}) {
  const carte = construireCarte();
  const reglages = { ...OPTIONS_PAR_DEFAUT, ...options };

  const empires = {};
  for (const modele of EMPIRES) {
    empires[modele.id] = {
      ...modele,
      // « Doctrines égales » efface les avantages propres à chaque puissance,
      // avantage napoléonien compris : les batailles se jouent alors à armes égales.
      doctrine: reglages.doctrinesEgales
        ? { ...DOCTRINE_DEFAUT }
        : { ...DOCTRINE_DEFAUT, ...(modele.doctrine ?? {}) },
      estJoueur: modele.id === idEmpireJoueur,
      vivant: false,
      territoires: [],
      stocks: parRessource(STOCK_INITIAL),
      production: parRessource(0),
      consommation: parRessource(0),
      net: parRessource(0),
      penuries: parRessource(false),
      capacite: 0,
      // Réserves d'hommes mobilisables, en milliers.
      reserves: 0,
      reservesMax: 0,
      // Provinces possédées en droit, occupation comprise. Distinct de
      // `territoires`, qui ne compte que celles effectivement tenues.
      souverainete: 0,
      // Gouvernement : taux de l'impôt, politiques décrétées, dette publique.
      tauxImposition: 1,
      // Acquis avant 1805 : effets gratuits, et l'on ne peut y renoncer.
      heritage: [...(modele.heritage ?? [])],
      // Décrétées en cours de règne : payées chaque jour.
      politiques: [],
      dette: 0,
      interets: 0,
      budget: { impots: 0, ressources: 0, administration: 0, armee: 0, politiques: 0, interets: 0 },
      // Rayée de la carte : plus une seule province de droit.
      eliminee: false,
      moral: (modele.doctrine ?? DOCTRINE_DEFAUT).moralInitial ?? DOCTRINE_DEFAUT.moralInitial,
    };
  }

  // `maitre` = souverain de droit, `occupant` = puissance qui tient le terrain.
  // Un territoire occupé n'est pas encore annexé (phase 5).
  for (const id of carte.ordre) {
    const territoire = carte.territoires[id];
    territoire.occupant = null;
    // Développement : richesse des infrastructures, de 0 à 3.
    territoire.developpement = territoire.capitale ? 2 : Math.max(0, territoire.population - 1);
    territoire.chantier = null;
    territoire.levee = null;
    territoire.occupationEnCours = null;
    territoire.insurrection = 0;
    // Moral de la population : 0 à 100. Le moral des troupes viendra en phase 3.
    territoire.moral = 55;
    if (!empires[territoire.maitre]) {
      console.warn(`[etat] Territoire « ${territoire.nom} » rattaché à un empire inconnu.`);
      continue;
    }
  }

  const etat = {
    carte,
    empires,
    joueur: idEmpireJoueur,
    date: { ...DATE_DEPART },
    jourEcoule: 0,
    enPause: true,
    vitesse: 1,
    selection: null,
    survol: null,
    selectionArmee: null,
    journal: [],
    // Avertissements déjà signalés, pour ne pas inonder le journal.
    alertesEmises: {},
    // Militaire et diplomatie (phases 3 et 5).
    armees: {},
    prochainIdArmee: 1,
    batailles: {},
    options: reglages,
    relations: {},
    opinions: {},
    // Offres en attente de réponse du joueur, et premier jour de chaque guerre.
    offresAlliance: {},
    offresPaix: {},
    // Traités arrachés : traitesImposes[vainqueur][vaincu] = jour de signature.
    traitesImposes: {},
    fin: null,
    debutsDeGuerre: {},
    dernieresGuerres: {},
    subsides: {},
    equilibre: null,
    economieARecalculer: false,
  };

  recenserTerritoires(etat);
  installerForcesInitiales(etat);
  return etat;
}

/** Place les garnisons de départ et ouvre les guerres déjà déclarées. */
function installerForcesInitiales(etat) {
  // À forces égales, chaque grande puissance reçoit le même total, réparti
  // sur ses places fortes historiques et dans les mêmes proportions d'armes.
  const total = (g) => g.reduce((s, [, u]) => s + Object.values(u).reduce((x, y) => x + y, 0), 0);
  const grandes = ['fra', 'gbr', 'pru', 'aut', 'rus', 'esp', 'ott'];
  const moyenne = grandes.reduce((s, id) => s + total(FORCES_INITIALES[id]), 0) / grandes.length;

  for (const [idEmpire, garnisons] of Object.entries(FORCES_INITIALES)) {
    const facteur =
      etat.options.forcesEgales && grandes.includes(idEmpire) ? moyenne / total(garnisons) : 1;
    for (const [idTerritoire, unites] of garnisons) {
      const territoire = etat.carte.territoires[idTerritoire];
      if (!territoire) {
        console.warn(`[etat] Garnison sur une province inconnue : ${idTerritoire}`);
        continue;
      }
      const ajustees = Object.fromEntries(
        Object.entries(unites).map(([type, n]) => [type, Math.max(1, Math.round(n * facteur))]),
      );
      creerArmeeInitiale(etat, idEmpire, idTerritoire, ajustees);
    }
  }

  // Chaque puissance mineure garde sa capitale.
  for (const empire of Object.values(etat.empires)) {
    if (!empire.vivant || FORCES_INITIALES[empire.id]) continue;
    const capitale = empire.territoires
      .map((id) => etat.carte.territoires[id])
      .find((t) => t.capitale);
    if (capitale) {
      creerArmeeInitiale(etat, empire.id, capitale.id, { infanterie: 9, cavalerie: 2, artillerie: 1 });
    }
  }

  for (const [a, b] of GUERRES_INITIALES) {
    etat.relations[a < b ? `${a}|${b}` : `${b}|${a}`] = 'guerre';
  }
  for (const [a, b] of ALLIANCES_INITIALES) {
    etat.relations[a < b ? `${a}|${b}` : `${b}|${a}`] = 'alliance';
  }
}

/**
 * Création directe d'un corps, sans passer par core/armees.js :
 * ce module ne doit dépendre de rien pour rester en amont du reste.
 */
function creerArmeeInitiale(etat, idEmpire, idTerritoire, unites) {
  const empire = etat.empires[idEmpire];
  const id = `a${etat.prochainIdArmee++}`;
  const domaine = 'ligne' in unites || 'fregate' in unites ? 'mer' : 'terre';
  const base = domaine === 'mer' ? { ligne: 0, fregate: 0 } : { infanterie: 0, cavalerie: 0, artillerie: 0 };
  etat.armees[id] = {
    id,
    empire: idEmpire,
    domaine,
    unites: { ...base, ...unites },
    effectif: Object.values(unites).reduce((s, v) => s + v, 0),
    motivation: empire.doctrine.moralInitial,
    lieu: idTerritoire,
    route: null,
    enBataille: false,
    joursImmobile: 0,
  };
}

/** Empire contrôlant effectivement le territoire (occupant s'il existe, sinon maître). */
export function controleur(territoire) {
  return territoire.occupant ?? territoire.maitre;
}

/** Un territoire occupé rapporte moins et coûte plus tant qu'il n'est pas annexé. */
export function estOccupe(territoire) {
  return Boolean(territoire.occupant) && territoire.occupant !== territoire.maitre;
}

/** Reconstitue la liste des provinces de chaque empire. */
export function recenserTerritoires(etat) {
  for (const empire of Object.values(etat.empires)) {
    empire.territoires = [];
    empire.souverainete = 0;
    empire.vivant = false;
  }
  // Une puissance éliminée ne revient pas : ses provinces ont changé de maître.
  for (const id of etat.carte.ordre) {
    const territoire = etat.carte.territoires[id];
    const empire = etat.empires[controleur(territoire)];
    if (empire) {
      empire.territoires.push(id);
      empire.vivant = true;
    }
    // La souveraineté de droit survit à l'occupation : une puissance
    // entièrement envahie existe encore tant qu'aucun traité ne l'a dépecée.
    const souverain = etat.empires[territoire.maitre];
    if (souverain) {
      souverain.souverainete += 1;
      souverain.vivant = true;
    }
  }
}

/** Avance la date d'un jour. */
export function avancerJour(etat) {
  etat.jourEcoule += 1;
  const d = etat.date;
  d.jour += 1;
  const bissextile = d.annee % 4 === 0 && (d.annee % 100 !== 0 || d.annee % 400 === 0);
  const limite = JOURS_PAR_MOIS[d.mois - 1] + (d.mois === 2 && bissextile ? 1 : 0);
  if (d.jour > limite) {
    d.jour = 1;
    d.mois += 1;
    if (d.mois > 12) {
      d.mois = 1;
      d.annee += 1;
    }
  }
}

export function dateEnTexte(date) {
  return `${date.jour} ${NOMS_MOIS[date.mois - 1]} ${date.annee}`;
}

/** Ajoute une entrée au journal (les plus récentes en tête). */
export function journaliser(etat, texte) {
  etat.journal.unshift({ date: { ...etat.date }, texte });
  if (etat.journal.length > 60) etat.journal.pop();
}

/**
 * Journalise au plus une fois par période pour un même sujet.
 * @param {string} cle identifiant de l'alerte
 * @param {number} delaiJours nombre de jours de silence entre deux rappels
 */
export function alerter(etat, cle, delaiJours, texte) {
  const dernier = etat.alertesEmises[cle];
  if (dernier !== undefined && etat.jourEcoule - dernier < delaiJours) return false;
  etat.alertesEmises[cle] = etat.jourEcoule;
  journaliser(etat, texte);
  return true;
}

export { EMPIRES_PAR_ID, RESSOURCES };
