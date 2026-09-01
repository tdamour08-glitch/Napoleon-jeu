/* ============================================================
   traites.js — paix négociée, annexion, reddition, victoire
   ------------------------------------------------------------
   L'occupation militaire ne change rien au droit : une province
   reste à son souverain tant qu'un traité ne l'a pas cédée. Ce
   module est ce qui rend les conquêtes définitives, et donc ce
   qui rend une partie gagnable.

   Un traité peut céder des provinces occupées, en restituer
   d'autres et exiger un tribut. Le vaincu l'accepte selon sa
   lassitude et le rapport de forces ; acculé, il capitule sans
   condition.
   ============================================================ */

import { journaliser, alerter } from './etat.js';
import { sontEnGuerre, conclureArmistice, ajusterOpinion, ennemis } from './diplomatie.js';
import { avecArticle, genitif, prepositionDe } from '../data/langue.js';
import { PROVINCES_EUROPEENNES } from '../data/monde.js';
import { cultureDe, estNoyau } from './revolte.js';

/** Les puissances qui disputent la partie. */
export const GRANDES_PUISSANCES = ['fra', 'gbr', 'pru', 'aut', 'rus', 'esp', 'ott'];

/**
 * Part des provinces européennes qui vaut victoire par hégémonie.
 * Mesuré sur des parties simulées : les vainqueurs culminent entre 28 et
 * 40 % avant que la voie des traités ne l'emporte. Au-dessus de 45 %, la
 * condition ne se déclencherait jamais et ne serait qu'un ornement.
 */
const SEUIL_HEGEMONIE = 0.45;

/* ------------------------------------------------------------
   Ce qui est négociable
   ------------------------------------------------------------ */

/** Ce que vaut une province dans une négociation. */
export function valeurProvince(territoire) {
  let valeur = 3 + territoire.population * 2 + territoire.developpement * 1.5;
  if (territoire.capitale) valeur *= 2.5;
  if (territoire.colonie) valeur *= 0.6;
  return valeur;
}

/**
 * On cède plus volontiers une province qui n'est pas à soi et qui gronde,
 * surtout à qui s'en réclame par la culture.
 */
function remiseCulturelle(etat, territoire, demandeur) {
  let remise = 0;
  if (cultureDe(territoire) === demandeur) remise += 0.45;
  if (!estNoyau(etat, territoire, territoire.maitre)) remise += 0.25;
  remise += Math.min(0.3, (territoire.revolte ?? 0) / 250);
  return Math.min(0.8, remise);
}

/**
 * Provinces qu'un vainqueur peut exiger et celles qu'il peut rendre.
 * @param {string} demandeur puissance qui pose ses conditions
 * @param {string} cible puissance à qui on les impose
 */
export function provincesNegociables(etat, demandeur, cible) {
  const annexables = [];
  const restituables = [];
  for (const id of etat.carte.ordre) {
    const t = etat.carte.territoires[id];
    if (t.maitre === cible && t.occupant === demandeur) annexables.push(id);
    if (t.maitre === demandeur && t.occupant === cible) restituables.push(id);
  }
  return { annexables, restituables };
}

/** Un traité vierge : l'armistice pur et simple. */
export function traiteVierge(demandeur, cible) {
  return { demandeur, cible, annexions: [], restitutions: [], tribut: 0, type: 'negocie' };
}

/**
 * Lassitude d'une puissance, de 0 (fraîche) à 1 (exsangue) : armées
 * fondues, caisses vides, provinces perdues.
 */
export function lassitude(etat, empire, equilibre = null) {
  const hommes = effectifTotal(etat, empire.id);
  const potentiel = Math.max(10, empire.reservesMax);
  let score = Math.max(0, 1 - hommes / potentiel) * 0.5;
  if (empire.penuries.or) score += 0.25;
  const perdues = etat.carte.ordre.filter(
    (id) => etat.carte.territoires[id].maitre === empire.id && etat.carte.territoires[id].occupant,
  ).length;
  score += Math.min(0.4, perdues * 0.12);
  if (equilibre && (equilibre.parts?.[empire.id] ?? 1) < 0.03) score += 0.2;
  return Math.min(1, score);
}

/* ------------------------------------------------------------
   Ce que le vaincu est prêt à concéder
   ------------------------------------------------------------ */

/** Coût des conditions, du point de vue de celui qui les subit. */
export function coutTermes(etat, traite) {
  let cout = 0;
  for (const id of traite.annexions) {
    const t = etat.carte.territoires[id];
    cout += valeurProvince(t) * (1 - remiseCulturelle(etat, t, traite.demandeur));
  }
  // Ne pas récupérer ses propres provinces occupées coûte aussi, mais moins :
  // elles restent siennes en droit.
  const { restituables } = provincesNegociables(etat, traite.demandeur, traite.cible);
  for (const id of restituables) {
    if (!traite.restitutions.includes(id)) cout += valeurProvince(etat.carte.territoires[id]) * 0.35;
  }
  cout += traite.tribut / 90;
  return cout;
}

/**
 * Ce qu'une puissance consent à céder pour en finir : d'autant plus
 * qu'elle est épuisée, battue et déjà occupée.
 */
export function toleranceCession(etat, cible, adversaire) {
  const empireCible = etat.empires[cible];
  const { annexables } = provincesNegociables(etat, adversaire, cible);

  // Ce qui est déjà perdu sur le terrain se marchande à bas prix.
  let tolerance = annexables.reduce((s, id) => s + valeurProvince(etat.carte.territoires[id]), 0) * 0.45;

  const hommes = effectifTotal(etat, cible);
  const potentiel = Math.max(10, empireCible.reservesMax);
  tolerance += Math.max(0, 1 - hommes / potentiel) * 22;
  if (empireCible.penuries.or) tolerance += 8;
  // Une puissance en guerre contre plusieurs adversaires brade sa position.
  tolerance += Math.max(0, ennemis(etat, cible).length - 1) * 9;
  // Une capitale ne se cède qu'à la dernière extrémité.
  if (empireCible.territoires.length === 0) tolerance += 40;

  return tolerance;
}

/**
 * Le vaincu accepte-t-il ?
 * @returns {{accepte: boolean, motif: string, cout: number, tolerance: number}}
 */
export function evaluerTraite(etat, traite) {
  const { demandeur, cible } = traite;
  if (!sontEnGuerre(etat, demandeur, cible)) {
    return { accepte: false, motif: 'Nous ne sommes pas en guerre.', cout: 0, tolerance: 0 };
  }
  const debut = etat.debutsDeGuerre?.[cleGuerre(demandeur, cible)] ?? 0;
  const attente = lassitude(etat, etat.empires[cible]) > 0.55 ? 20 : 45;
  if (etat.jourEcoule - debut < attente) {
    return { accepte: false, motif: 'La guerre vient à peine de commencer.', cout: 0, tolerance: 0 };
  }
  for (const id of traite.annexions) {
    const t = etat.carte.territoires[id];
    if (t.maitre !== cible || t.occupant !== demandeur) {
      return { accepte: false, motif: 'On ne cède pas une province qu\'on tient encore.', cout: 0, tolerance: 0 };
    }
  }
  if (traite.tribut > etat.empires[cible].stocks.or) {
    return { accepte: false, motif: 'Le tribut exigé dépasse nos caisses.', cout: 0, tolerance: 0 };
  }

  // On ne signe pas quand on est en train de gagner, même si l'on ne
  // nous demande rien : le camp qui avance veut aller au bout.
  const { annexables, restituables } = provincesNegociables(etat, demandeur, cible);
  const usureCible = lassitude(etat, etat.empires[cible]);
  if (restituables.length > annexables.length && usureCible < 0.45) {
    return {
      accepte: false,
      motif: 'Nous avons l\'avantage : pourquoi déposer les armes ?',
      cout: 0,
      tolerance: 0,
    };
  }

  const cout = coutTermes(etat, traite);
  const tolerance = toleranceCession(etat, cible, demandeur);

  if (cout <= tolerance) {
    return { accepte: true, motif: 'Les conditions sont acceptées.', cout, tolerance };
  }
  const exces = cout / Math.max(1, tolerance);
  const motif =
    exces > 2
      ? 'Ces conditions sont une insulte : nos armes ne sont pas encore brisées.'
      : 'Nous consentirions à moins, mais pas à cela.';
  return { accepte: false, motif, cout, tolerance };
}

/* ------------------------------------------------------------
   Application
   ------------------------------------------------------------ */

/** Signe le traité : cessions, restitutions, tribut, fin de la guerre. */
export function appliquerTraite(etat, traite) {
  const { demandeur, cible } = traite;
  const vainqueur = etat.empires[demandeur];
  const vaincu = etat.empires[cible];

  for (const id of traite.annexions) {
    const t = etat.carte.territoires[id];
    t.maitre = demandeur;
    t.occupant = null;
    t.occupationEnCours = null;
    // Une annexion apaise l'occupation mais laisse le ressentiment national.
    t.revolte = Math.min(60, t.revolte ?? 0);
    t.chantier = null;
    t.levee = null;
    // Une population annexée ne se réjouit pas de son nouveau maître.
    t.moral = Math.max(10, t.moral - 25);
  }

  // Tout ce qui n'est pas cédé est évacué : la paix rend le terrain.
  for (const id of etat.carte.ordre) {
    const t = etat.carte.territoires[id];
    if (t.occupant === demandeur && t.maitre === cible) t.occupant = null;
    if (t.occupant === cible && t.maitre === demandeur) t.occupant = null;
  }

  if (traite.tribut > 0) {
    const verse = Math.min(traite.tribut, vaincu.stocks.or);
    vaincu.stocks.or -= verse;
    vainqueur.stocks.or = Math.min(vainqueur.capacite, vainqueur.stocks.or + verse);
  }

  conclureArmistice(etat, demandeur, cible, true);
  ajusterOpinion(etat, cible, demandeur, -15 - traite.annexions.length * 10);

  const resume = decrireTraite(etat, traite);
  journaliser(etat, resume);
  etat.economieARecalculer = true;
  if (traite.annexions.length > 0) {
    if (!etat.traitesImposes[demandeur]) etat.traitesImposes[demandeur] = {};
    etat.traitesImposes[demandeur][cible] = etat.jourEcoule;
  }
  return true;
}

function decrireTraite(etat, traite) {
  const vainqueur = etat.empires[traite.demandeur];
  const vaincu = etat.empires[traite.cible];
  const titre = traite.type === 'reddition' ? 'Capitulation' : 'Traité de paix';
  if (traite.annexions.length === 0 && traite.tribut === 0) {
    return `<strong>${titre}</strong> entre ${avecArticle(vainqueur)} et ${avecArticle(vaincu)} : ` +
      `les armes se taisent sans cession.`;
  }
  const provinces = traite.annexions
    .map((id) => etat.carte.territoires[id].nom)
    .join(', ');
  const morceaux = [];
  if (provinces) morceaux.push(`${provinces} ${traite.annexions.length > 1 ? 'passent' : 'passe'} ${genitif(vaincu)} à ${avecArticle(vainqueur)}`);
  if (traite.tribut > 0) morceaux.push(`un tribut de ${Math.round(traite.tribut)} pièces d'or est versé`);
  return `<strong>${titre}</strong> : ${morceaux.join(' ; ')}.`;
}

const cleGuerre = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function effectifTotal(etat, idEmpire) {
  return Object.values(etat.armees)
    .filter((a) => a.empire === idEmpire)
    .reduce((s, a) => s + a.effectif, 0);
}

/* ------------------------------------------------------------
   Reddition
   ------------------------------------------------------------ */

/**
 * Une puissance sans terre ni armée capitule devant celui qui l'occupe :
 * il annexe tout ce qu'il tient.
 */
export function verifierRedditions(etat) {
  for (const empire of Object.values(etat.empires)) {
    if (empire.souverainete === 0) continue;
    if (empire.territoires.length > 0) continue; // il lui reste du sol
    if (effectifTotal(etat, empire.id) > 3) continue; // il lui reste une armée

    for (const idEnnemi of ennemis(etat, empire.id)) {
      const { annexables } = provincesNegociables(etat, idEnnemi, empire.id);
      if (annexables.length === 0) continue;
      const traite = {
        demandeur: idEnnemi,
        cible: empire.id,
        annexions: annexables,
        restitutions: [],
        tribut: Math.round(empire.stocks.or * 0.5),
        type: 'reddition',
      };
      journaliser(
        etat,
        `<strong>${empire.nom}</strong> capitule sans condition devant ${avecArticle(etat.empires[idEnnemi])}.`,
      );
      appliquerTraite(etat, traite);
    }
  }
}

/* ------------------------------------------------------------
   Élimination
   ------------------------------------------------------------ */

/** Une puissance sans la moindre province de droit disparaît de la carte. */
export function verifierEliminations(etat) {
  for (const empire of Object.values(etat.empires)) {
    if (empire.eliminee) continue;
    if (empire.souverainete > 0) continue;
    empire.eliminee = true;
    for (const armee of Object.values(etat.armees)) {
      if (armee.empire === empire.id) delete etat.armees[armee.id];
    }
    for (const paire of Object.keys(etat.relations)) {
      if (paire.split('|').includes(empire.id)) delete etat.relations[paire];
    }
    journaliser(etat, `<strong>${empire.nom}</strong> cesse d'exister comme puissance.`);
  }
}

/* ------------------------------------------------------------
   Conditions de victoire
   ------------------------------------------------------------ */

/** Provinces d'Europe, base des conditions de victoire. */
function provincesEuropeennes(etat) {
  return etat.carte.ordre.filter((id) => PROVINCES_EUROPEENNES.has(id));
}

/**
 * Vérifie si une puissance a gagné. Trois chemins, comme prévu :
 * l'élimination de toutes les autres, leur soumission par traité,
 * ou la domination de l'Europe.
 * @returns {{type: string, vainqueur: string, detail: string}|null}
 */
export function verifierVictoire(etat) {
  if (etat.fin) return etat.fin;

  const europeennes = provincesEuropeennes(etat);
  const parSouverain = {};
  for (const id of europeennes) {
    const maitre = etat.carte.territoires[id].maitre;
    parSouverain[maitre] = (parSouverain[maitre] ?? 0) + 1;
  }

  for (const id of GRANDES_PUISSANCES) {
    const empire = etat.empires[id];
    if (!empire || empire.eliminee || empire.souverainete === 0) continue;
    const rivales = GRANDES_PUISSANCES.filter(
      (autre) => autre !== id && etat.empires[autre] && !etat.empires[autre].eliminee && etat.empires[autre].souverainete > 0,
    );

    if (rivales.length === 0) {
      return finir(etat, 'elimination', id, 'Toutes les autres grandes puissances ont disparu.');
    }

    const imposes = etat.traitesImposes[id] ?? {};
    const toutesSoumises = rivales.every((autre) => imposes[autre] !== undefined);
    if (toutesSoumises && rivales.every((autre) => !sontEnGuerre(etat, id, autre))) {
      return finir(
        etat,
        'traites',
        id,
        'Toutes les grandes puissances ont signé un traité qui leur arrache des provinces.',
      );
    }

    const part = (parSouverain[id] ?? 0) / europeennes.length;
    if (part >= SEUIL_HEGEMONIE) {
      return finir(
        etat,
        'hegemonie',
        id,
        `${Math.round(part * 100)} % des provinces d'Europe reconnaissent son autorité.`,
      );
    }
  }

  const joueur = etat.empires[etat.joueur];
  if (joueur.souverainete === 0) {
    return finir(etat, 'defaite', etat.joueur, 'Vous ne possédez plus la moindre province.');
  }
  return null;
}

function finir(etat, type, vainqueur, detail) {
  etat.fin = { type, vainqueur, detail, date: { ...etat.date } };
  const empire = etat.empires[vainqueur];
  if (type === 'defaite') journaliser(etat, `<strong>Partie terminée</strong> : ${detail}`);
  else journaliser(etat, `<strong>${empire.nom} l'emporte.</strong> ${detail}`);
  return etat.fin;
}

/** Part des provinces d'Europe détenues en droit, pour l'interface. */
export function partEuropeenne(etat, idEmpire) {
  const europeennes = provincesEuropeennes(etat);
  const tenues = europeennes.filter((id) => etat.carte.territoires[id].maitre === idEmpire).length;
  return { tenues, total: europeennes.length, part: tenues / europeennes.length, seuil: SEUIL_HEGEMONIE };
}

export { alerter, prepositionDe };
