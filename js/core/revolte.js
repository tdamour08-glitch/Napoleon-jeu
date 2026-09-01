/* ============================================================
   revolte.js — cultures, centralisation et jauge de révolte
   ------------------------------------------------------------
   Un État tient son NOYAU sans effort : les provinces dont la
   culture est la sienne ne bougent jamais. Tout le reste se
   discute.

   Deux situations bien distinctes :

   • Une province OCCUPÉE, que nul traité n'a cédée, voit sa
     jauge monter jusqu'à chasser la garnison. C'est une
     révolte au sens propre.

   • Une province ANNEXÉE mais de culture étrangère — le Canada
     francophone sous Londres, la Vénétie sous Vienne — ne fait
     pas sécession : la jauge y mesure un ressentiment. Elle
     n'ouvre pas la porte de l'intérieur, mais elle donne à
     l'étranger un MOTIF, et les cabinets s'en saisissent.

   La CENTRALISATION dit combien un État sait tenir ce qui n'est
   pas son noyau. La France de l'an XIII, ses préfets et son
   Code civil, y excelle ; le Royaume-Uni, fait de trois royaumes
   et d'un empire, y échoue.
   ============================================================ */

import { controleur, journaliser, alerter } from './etat.js';
import { CULTURES_PROVINCES } from '../data/monde.js';
import { EMPIRES_PAR_ID } from '../data/empires.js';
import { armeesDans } from './armees.js';
import { genitif, avecArticle } from '../data/langue.js';

/** Jauge pleine : la province se soulève. */
const SEUIL_REVOLTE = 100;

/** Montée quotidienne dans une province occupée sans garnison à portée. */
const MONTEE_OCCUPATION = 2.4;
/** Montée quotidienne dans une province annexée de culture étrangère. */
const MONTEE_ANNEXION = 0.55;

/** Au-delà, le ressentiment d'une province annexée devient un motif de guerre. */
export const SEUIL_REVENDICATION = 45;

/* ------------------------------------------------------------
   Cultures
   ------------------------------------------------------------ */

/**
 * Culture d'une province : son attachement national, fixé en 1805 et
 * indépendant du drapeau qui flotte ensuite dessus.
 */
export function cultureDe(territoire) {
  return territoire.culture ?? CULTURES_PROVINCES[territoire.id] ?? territoire.maitre;
}

/** La province fait-elle partie du noyau de cette puissance ? */
export function estNoyau(etat, territoire, idEmpire) {
  const empire = etat.empires[idEmpire] ?? EMPIRES_PAR_ID[idEmpire];
  if (!empire) return false;
  const culture = cultureDe(territoire);
  if (culture === idEmpire) return true;
  return (empire.culturesAcceptees ?? []).includes(culture);
}

/** Puissance qui se réclame d'une province, si elle existe encore. */
export function pretendantCulturel(etat, territoire) {
  const culture = cultureDe(territoire);
  const empire = etat.empires[culture];
  return empire && empire.vivant && !empire.eliminee ? empire.id : null;
}

/** Aptitude d'un État à tenir ce qui n'est pas son noyau. */
function centralisation(empire) {
  return empire?.centralisation ?? 1;
}

/* ------------------------------------------------------------
   La jauge
   ------------------------------------------------------------ */

/**
 * Nature du mécontentement d'une province, pour l'interface comme pour le jeu.
 * @returns {{type: 'noyau'|'occupation'|'annexion', plafond: number, montee: number}}
 */
export function regimeRevolte(etat, territoire) {
  const tenue = controleur(territoire);
  const empire = etat.empires[tenue];
  const central = centralisation(empire);

  if (territoire.occupant && territoire.occupant !== territoire.maitre) {
    // Une garnison sur place, ou à une province de là, contient le pays.
    const garnison =
      armeesDans(etat, territoire.id).some((a) => a.empire === tenue && a.domaine === 'terre') ||
      territoire.voisins.some((v) =>
        armeesDans(etat, v).some((a) => a.empire === tenue && a.domaine === 'terre'),
      );
    const souverain = etat.empires[territoire.maitre];
    const orphelin = !souverain || souverain.souverainete === 0;
    return {
      type: 'occupation',
      plafond: SEUIL_REVOLTE,
      montee: garnison || orphelin ? -3.5 : MONTEE_OCCUPATION / central,
    };
  }

  if (estNoyau(etat, territoire, tenue)) {
    return { type: 'noyau', plafond: 0, montee: -2.5 };
  }

  // Annexée mais étrangère : le ressentiment plafonne, il ne renverse rien.
  // Un État centralisé et prospère plafonne bas ; un empire disparate et
  // malheureux voit le ressentiment monter jusqu'au prétexte de guerre.
  const plafond = Math.max(10, Math.min(95, 70 / central - territoire.moral * 0.25));
  return { type: 'annexion', plafond, montee: MONTEE_ANNEXION / central };
}

/** Fait évoluer la jauge d'une province et déclenche les soulèvements. */
export function avancerRevolte(etat, territoire) {
  const regime = regimeRevolte(etat, territoire);
  const courante = territoire.revolte ?? 0;

  let valeur = courante + regime.montee;
  if (regime.montee > 0) valeur = Math.min(valeur, regime.plafond);
  territoire.revolte = Math.max(0, Math.min(SEUIL_REVOLTE, valeur));
  territoire.regimeRevolte = regime.type;

  if (regime.type !== 'occupation' || territoire.revolte < SEUIL_REVOLTE) return;

  // Le pays chasse la garnison : la province revient à son souverain de droit.
  const occupant = etat.empires[territoire.occupant];
  territoire.revolte = 0;
  territoire.occupant = null;
  territoire.occupationEnCours = null;
  journaliser(
    etat,
    `<strong>${territoire.nom}</strong> se soulève et chasse la garnison ${genitif(occupant)}.`,
  );
  etat.economieARecalculer = true;
}

/* ------------------------------------------------------------
   Revendications
   ------------------------------------------------------------ */

/**
 * Provinces qu'une puissance tient contre leur culture, et dont le
 * mécontentement est assez vif pour armer un discours.
 */
export function revendicationsContre(etat, idDetenteur) {
  const sortie = [];
  for (const id of etat.carte.ordre) {
    const t = etat.carte.territoires[id];
    if (controleur(t) !== idDetenteur) continue;
    if ((t.revolte ?? 0) < SEUIL_REVENDICATION) continue;
    if (estNoyau(etat, t, idDetenteur)) continue;
    sortie.push({ territoire: t, pretendant: pretendantCulturel(etat, t) });
  }
  return sortie;
}

/** Provinces qu'une puissance peut réclamer à une autre au nom de la culture. */
export function revendicationsDe(etat, idPretendant, idDetenteur) {
  return revendicationsContre(etat, idDetenteur).filter((r) => r.pretendant === idPretendant);
}

/**
 * Le mécontentement pèse aussi sur place : une province qui gronde produit
 * moins et se tient mal. Ce n'est pas une sécession, c'est une mauvaise humeur.
 */
export function malusRevolte(territoire) {
  const revolte = territoire.revolte ?? 0;
  if (revolte <= 25) return 1;
  // La pénalité se cumule déjà avec celle que la révolte inflige au moral :
  // une courbe douce suffit, sinon un empire disparate cesse d'exister.
  return Math.max(0.7, 1 - (revolte - 25) / 300);
}

/** Signale au joueur les provinces qui lui échappent. */
export function signalerRevoltes(etat) {
  const joueur = etat.empires[etat.joueur];
  if (!joueur) return;

  for (const id of etat.carte.ordre) {
    const t = etat.carte.territoires[id];
    if (controleur(t) !== etat.joueur) continue;
    if ((t.revolte ?? 0) < 80) continue;
    const occupee = t.regimeRevolte === 'occupation';
    alerter(
      etat,
      `revolte-${id}`,
      120,
      occupee
        ? `<strong>${t.nom}</strong> est au bord du soulèvement : sans garnison, la province sera perdue.`
        : `<strong>${t.nom}</strong> ne se reconnaît pas dans votre drapeau. ` +
            `L'étranger y trouvera un prétexte.`,
    );
  }

  // Et les prétextes que d'autres nous opposent.
  const contre = revendicationsContre(etat, etat.joueur).filter((r) => r.pretendant);
  if (contre.length >= 2) {
    alerter(
      etat,
      'revendications',
      180,
      `${contre.length} de vos provinces sont revendiquées par leurs anciens souverains. ` +
        `C'est un motif de guerre tout trouvé.`,
    );
  }
}

export { avecArticle };
