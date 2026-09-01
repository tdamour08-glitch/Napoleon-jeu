/* ============================================================
   assimilation.js — franciser, angliciser, russifier
   ------------------------------------------------------------
   Une province annexée mais étrangère peut être ralliée à la
   culture du vainqueur. Trois voies, trois prix :

   • LA TROUPE — on tient le pays par les armes. Il faut une
     garnison qui ne bouge pas, et de l'or pour la solde et les
     munitions. Ni très long ni très cher, mais l'armée immobilisée
     ne fait rien d'autre — et la répression attise le ressentiment
     tant qu'elle dure.

   • LE PEUPLEMENT — on installe des colons du pays d'origine
     jusqu'à noyer la population locale. Presque rien par jour,
     mais l'affaire prend des années.

   • LA PROSPÉRITÉ — on couvre la province de routes, d'écoles et
     de manufactures jusqu'à ce qu'elle n'ait plus envie de partir.
     C'est la voie la plus coûteuse en matières, et la plus rapide.
   ============================================================ */

import { controleur, journaliser } from './etat.js';
import { estNoyau } from './revolte.js';
import { armeesDans } from './armees.js';
import { RESSOURCES } from '../data/empires.js';
import { genitif } from '../data/langue.js';

/**
 * `cout` est prélevé chaque jour ; `duree` est la durée de base, en jours,
 * pour une province d'un million d'âmes — une province peuplée résiste bien
 * plus longtemps (voir `dureeAssimilation`) ;
 * `garnison` exige un corps de cet effectif sur place, sans quoi les
 * travaux s'arrêtent.
 */
export const METHODES_ASSIMILATION = {
  troupe: {
    id: 'troupe',
    nom: 'Par la troupe',
    resume:
      "Une garnison tient le pays. Il faut l'y laisser : elle ne fera rien d'autre, " +
      'et la répression attise le ressentiment tant qu\'elle dure.',
    cout: { or: 1.8, fer: 0.6 },
    duree: 200,
    garnison: 8,
    revolte: 0.35,
  },
  peuplement: {
    id: 'peuplement',
    nom: 'Par le peuplement',
    resume:
      'On installe des colons du pays d\'origine jusqu\'à noyer la population locale. ' +
      'Presque rien par jour, mais l\'affaire prend des années.',
    cout: { or: 0.4, eau: 0.35, bois: 0.3 },
    duree: 900,
    garnison: 0,
    revolte: -0.05,
  },
  prosperite: {
    id: 'prosperite',
    nom: 'Par la prospérité',
    resume:
      'Routes, écoles et manufactures, jusqu\'à ce que la province n\'ait plus envie de partir. ' +
      'La voie la plus coûteuse en matières, et la plus rapide.',
    cout: { or: 3.0, bois: 1.6, fer: 1.2, charbon: 1.2 },
    duree: 130,
    garnison: 0,
    revolte: -0.2,
  },
};

/**
 * Durée réelle du chantier. On ne francise pas la Lombardie et ses six
 * millions d'âmes aussi vite qu'une principauté de deux cent mille : la
 * population commande.
 */
export function dureeAssimilation(territoire, idMethode) {
  const methode = METHODES_ASSIMILATION[idMethode];
  return Math.round(methode.duree * (0.6 + (territoire.population ?? 1) * 0.55));
}

/* ------------------------------------------------------------
   Ouvrir et fermer un chantier d'assimilation
   ------------------------------------------------------------ */

/** Peut-on entreprendre cette assimilation ? Renvoie un motif si non. */
export function verifierAssimilation(etat, territoire, idMethode) {
  const methode = METHODES_ASSIMILATION[idMethode];
  if (!methode) return { possible: false, motif: 'Méthode inconnue.' };

  const tenue = controleur(territoire);
  const empire = etat.empires[tenue];
  if (!empire) return { possible: false, motif: 'Province sans maître.' };
  if (territoire.maitre !== tenue) {
    return { possible: false, motif: 'Il faut d\'abord annexer la province par traité.' };
  }
  if (estNoyau(etat, territoire, tenue)) {
    return { possible: false, motif: 'Cette province est déjà des vôtres.' };
  }
  if (territoire.assimilation) {
    return { possible: false, motif: 'Une assimilation est déjà en cours ici.' };
  }
  if (methode.garnison > 0 && garnisonSurPlace(etat, territoire, tenue) < methode.garnison) {
    return {
      possible: false,
      motif: `Il faut ${methode.garnison} 000 hommes en garnison sur place.`,
    };
  }
  // On vérifie qu'un mois de dépense est couvert : le reste suivra.
  for (const [ressource, taux] of Object.entries(methode.cout)) {
    if (empire.stocks[ressource] < taux * 30) {
      return { possible: false, motif: 'Le trésor ne suivrait pas un mois.' };
    }
  }
  return { possible: true };
}

function garnisonSurPlace(etat, territoire, idEmpire) {
  return armeesDans(etat, territoire.id)
    .filter((a) => a.empire === idEmpire && a.domaine === 'terre')
    .reduce((s, a) => s + a.effectif, 0);
}

export function lancerAssimilation(etat, territoire, idMethode) {
  const verdict = verifierAssimilation(etat, territoire, idMethode);
  if (!verdict.possible) return verdict;

  const methode = METHODES_ASSIMILATION[idMethode];
  const duree = dureeAssimilation(territoire, idMethode);
  territoire.assimilation = { methode: idMethode, restant: duree, duree };
  const empire = etat.empires[controleur(territoire)];
  if (empire.estJoueur) {
    journaliser(
      etat,
      `Assimilation entreprise en <strong>${territoire.nom}</strong> — ` +
        `${methode.nom.toLowerCase()}, ${duree} jours.`,
    );
  }
  return { possible: true };
}

export function abandonnerAssimilation(etat, territoire) {
  if (!territoire.assimilation) return false;
  territoire.assimilation = null;
  const empire = etat.empires[controleur(territoire)];
  if (empire?.estJoueur) {
    journaliser(etat, `Assimilation abandonnée en <strong>${territoire.nom}</strong>.`);
  }
  return true;
}

/* ------------------------------------------------------------
   Un jour d'assimilation
   ------------------------------------------------------------ */

/** Dépense quotidienne d'assimilation d'un empire, par ressource. */
export function coutAssimilation(etat, idEmpire) {
  const total = Object.fromEntries(RESSOURCES.map((r) => [r.id, 0]));
  for (const id of etat.carte.ordre) {
    const t = etat.carte.territoires[id];
    if (!t.assimilation || controleur(t) !== idEmpire) continue;
    const methode = METHODES_ASSIMILATION[t.assimilation.methode];
    for (const [ressource, taux] of Object.entries(methode.cout)) total[ressource] += taux;
  }
  return total;
}

/**
 * Fait avancer l'assimilation d'une province. Les travaux s'arrêtent si la
 * garnison s'en va, si la province cesse d'être à nous, ou si les caisses
 * sont vides — mais l'acquis n'est pas perdu.
 */
export function avancerAssimilation(etat, territoire) {
  const chantier = territoire.assimilation;
  if (!chantier) return;

  const tenue = controleur(territoire);
  const empire = etat.empires[tenue];
  if (!empire || territoire.maitre !== tenue) {
    territoire.assimilation = null;
    return;
  }

  const methode = METHODES_ASSIMILATION[chantier.methode];
  if (methode.garnison > 0 && garnisonSurPlace(etat, territoire, tenue) < methode.garnison) {
    chantier.suspendu = 'garnison';
    return;
  }
  if (Object.keys(methode.cout).some((r) => empire.penuries[r])) {
    chantier.suspendu = 'penurie';
    return;
  }
  chantier.suspendu = null;

  // La répression militaire attise ce qu'elle prétend éteindre.
  territoire.revolte = Math.max(0, Math.min(100, (territoire.revolte ?? 0) + methode.revolte));

  chantier.restant -= 1;
  if (chantier.restant > 0) return;

  territoire.assimilation = null;
  territoire.culture = tenue;
  territoire.revolte = 0;
  territoire.regimeRevolte = 'noyau';
  journaliser(
    etat,
    `<strong>${territoire.nom}</strong> a rejoint le noyau national ${genitif(empire)} : ` +
      `la province ne se soulèvera plus.`,
  );
  etat.economieARecalculer = true;
}
