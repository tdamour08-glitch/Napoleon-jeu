/* ============================================================
   politiques.js — choix sociaux, impôt et dette
   ------------------------------------------------------------
   Un empire ne se gouverne pas qu'à coups d'armées. Le souverain
   fixe le taux de l'impôt et décide de quelques grandes
   politiques : santé publique, instruction, conscription, grands
   travaux, abolition des privilèges. Chacune coûte tous les
   jours et modifie la croissance de la population, le moral, les
   réserves d'hommes ou la vitesse des chantiers.

   Quand les caisses ne suivent plus, l'État emprunte. La dette
   porte intérêt et finit par étouffer celui qui en abuse.
   ============================================================ */

import { journaliser, alerter, controleur, estOccupe } from './etat.js';

/* ------------------------------------------------------------
   Les politiques
   ------------------------------------------------------------ */

/**
 * `cout` est prélevé chaque jour, par point de population de l'empire :
 * une politique coûte d'autant plus cher qu'il y a de sujets à administrer.
 */
export const POLITIQUES = [
  {
    id: 'sante',
    nom: 'Hospices et hygiène',
    resume: 'Fait reculer la mortalité. La population croît beaucoup plus vite.',
    cout: { or: 0.05, eau: 0.05 },
    effets: { croissance: 0.6, plafond: 0.6 },
  },
  {
    id: 'instruction',
    nom: 'Écoles et académies',
    resume: 'Des ingénieurs et des contremaîtres : les chantiers avancent plus vite.',
    cout: { or: 0.045, bois: 0.04 },
    // Ingénieurs et manufactures : l'instruction finit par se payer elle-même.
    effets: { chantiers: 0.3, production: 0.08 },
  },
  {
    id: 'travaux',
    nom: 'Grands travaux',
    resume: 'Routes, canaux et greniers. Le peuple y gagne en confiance.',
    cout: { or: 0.04, bois: 0.05, fer: 0.04 },
    effets: { moral: 9 },
  },
  {
    id: 'conscription',
    nom: 'Conscription générale',
    resume: 'La nation entière est mobilisable — et le sait. Les réserves gonflent, le moral souffre.',
    cout: { or: 0.03 },
    effets: { reserves: 0.55, moral: -11, croissance: -0.25, plafond: -0.3 },
  },
  {
    id: 'abolition',
    nom: 'Abolition des privilèges',
    resume: 'Les terres circulent, les familles s\'agrandissent — et les ordres privilégiés paient enfin l\'impôt.',
    cout: { or: 0.03 },
    effets: { croissance: 0.35, moral: 6, impot: 0.06, plafond: 0.4 },
  },
];

export const POLITIQUES_PAR_ID = Object.fromEntries(POLITIQUES.map((p) => [p.id, p]));

/**
 * Somme des effets qui s'appliquent à un empire : ses réformes HÉRITÉES,
 * acquises avant 1805 et donc déjà payées par l'Histoire, et les politiques
 * qu'il DÉCRÈTE en cours de partie, celles-là à ses frais.
 */
export function effetsPolitiques(empire) {
  const total = { croissance: 0, moral: 0, reserves: 0, chantiers: 0, impot: 0, plafond: 0, production: 0 };
  if (!empire) return total;
  for (const id of [...(empire.heritage ?? []), ...(empire.politiques ?? [])]) {
    const politique = POLITIQUES_PAR_ID[id];
    if (!politique) continue;
    for (const [cle, valeur] of Object.entries(politique.effets)) total[cle] += valeur;
  }
  return total;
}

/**
 * Coût quotidien des politiques décrétées, proportionnel à la population
 * administrée. L'héritage, lui, ne coûte rien : il est acquis.
 */
export function coutPolitiques(etat, empire) {
  let sujets = 0;
  for (const id of empire.territoires) sujets += etat.carte.territoires[id].population;
  const total = {};
  for (const idPolitique of empire.politiques) {
    const politique = POLITIQUES_PAR_ID[idPolitique];
    if (!politique) continue;
    for (const [ressource, taux] of Object.entries(politique.cout)) {
      total[ressource] = (total[ressource] ?? 0) + taux * sujets;
    }
  }
  return total;
}

export function basculerPolitique(etat, empire, idPolitique) {
  if (!POLITIQUES_PAR_ID[idPolitique]) return false;
  if (empire.heritage?.includes(idPolitique)) return false; // on ne défait pas l'Histoire
  const position = empire.politiques.indexOf(idPolitique);
  if (position >= 0) {
    empire.politiques.splice(position, 1);
    if (empire.estJoueur) {
      journaliser(etat, `Vous abandonnez la politique « ${POLITIQUES_PAR_ID[idPolitique].nom} ».`);
    }
  } else {
    empire.politiques.push(idPolitique);
    if (empire.estJoueur) {
      journaliser(etat, `Vous décrétez « ${POLITIQUES_PAR_ID[idPolitique].nom} ».`);
    }
  }
  return true;
}

/* ------------------------------------------------------------
   L'impôt
   ------------------------------------------------------------ */

/** Bornes du taux d'imposition, 1 valant la pression fiscale ordinaire. */
export const IMPOT_MIN = 0.4;
export const IMPOT_MAX = 1.6;

/**
 * Effet du taux sur le moral : au-dessus de la normale, on presse le
 * contribuable et il le rend bien ; en dessous, on s'achète sa paix.
 */
export function moralImpot(taux) {
  return (1 - taux) * 22;
}

/* ------------------------------------------------------------
   La dette
   ------------------------------------------------------------ */

/** Intérêt quotidien, soit environ 7 % l'an. */
const TAUX_INTERET = 0.0002;
/** Au-delà de cette fraction du revenu annuel, plus personne ne prête. */
const PLAFOND_CREDIT = 0.8;

/** Ce que l'État peut encore emprunter. */
export function plafondEmprunt(empire) {
  const revenuAnnuel = Math.max(60, empire.production.or * 365);
  // Une place financière solide emprunte davantage et moins cher.
  return revenuAnnuel * PLAFOND_CREDIT * (empire.doctrine?.credit ?? 1);
}

/**
 * Comble un découvert par l'emprunt. Renvoie ce qui n'a pas pu être couvert :
 * au-delà, l'État fait défaut et ses armées cessent d'être payées.
 */
export function emprunter(etat, empire, manque) {
  const marge = plafondEmprunt(empire) - empire.dette;
  const emprunte = Math.max(0, Math.min(manque, marge));
  empire.dette += emprunte;
  const decouvert = manque - emprunte;

  if (empire.estJoueur && emprunte > 0) {
    alerter(
      etat,
      'emprunt',
      120,
      `Le Trésor emprunte pour boucler le budget. La dette atteint ${Math.round(empire.dette)} pièces d'or.`,
    );
  }
  if (empire.estJoueur && decouvert > 0) {
    alerter(
      etat,
      'defaut',
      90,
      '<strong>Les banquiers ferment leurs guichets.</strong> Faute de crédit, la solde n\'est plus versée.',
    );
  }
  return decouvert;
}

/** Rembourse par anticipation, dans la limite des liquidités. */
export function rembourser(empire, montant) {
  const verse = Math.max(0, Math.min(montant, empire.stocks.or, empire.dette));
  empire.stocks.or -= verse;
  empire.dette -= verse;
  return verse;
}

/** Intérêts du jour, ajoutés à la dette. */
export function servirLaDette(empire) {
  if (empire.dette <= 0) {
    empire.dette = 0;
    empire.interets = 0;
    return;
  }
  empire.interets = (empire.dette * TAUX_INTERET) / (empire.doctrine?.credit ?? 1);
  empire.dette += empire.interets;
}

/* ------------------------------------------------------------
   La population
   ------------------------------------------------------------ */

/**
 * Une province ne peut nourrir plus d'habitants que ses infrastructures.
 * Le plafond laisse toujours de la marge au-dessus de la population de
 * départ, sans quoi toutes les provinces déclineraient dès le premier jour.
 */
export function plafondPopulation(territoire, empire = null) {
  const social = empire ? effetsPolitiques(empire).plafond : 0;
  return Math.max(1, 2 + territoire.developpement + social);
}

/**
 * Fait varier la population d'une province. La croissance dépend du moral,
 * des politiques sociales et de l'abondance ; l'occupation et la disette la
 * font reculer.
 */
export function faireEvoluerPopulation(etat, territoire) {
  const empire = etat.empires[controleur(territoire)];
  if (!empire) return;

  const effets = effetsPolitiques(empire);
  const plafond = plafondPopulation(territoire, empire);

  // Base : environ +0,10 point par an dans une province paisible et prospère.
  let taux = 0.00028 * (territoire.moral / 60) * (1 + effets.croissance);
  if (territoire.colonie) taux *= 0.7;

  // Disette et occupation font reculer la population.
  if (empire.penuries.eau) taux -= 0.0006;
  if (empire.penuries.bois) taux -= 0.0002;
  if (estOccupe(territoire)) taux -= 0.0005;

  // Au-delà de ce que la province peut porter, la population reflue doucement.
  if (territoire.population >= plafond) taux = Math.min(taux, 0) - 0.00018;

  territoire.population = Math.max(0.4, Math.min(plafond + 0.4, territoire.population + taux));
}
