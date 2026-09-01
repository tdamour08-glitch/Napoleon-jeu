/* ============================================================
   unites.js — les armes du temps
   ------------------------------------------------------------
   Trois armes à terre, deux à la mer. Chacune a sa force, sa
   vitesse, son prix — et surtout ses affinités : la cavalerie
   sabre l'artillerie, l'artillerie écrase l'infanterie massée,
   l'infanterie en carré arrête la cavalerie. C'est de ce
   triangle que naît la stratégie : gagner, c'est amener la
   bonne arme devant la mauvaise.
   ============================================================ */

/**
 * `force`   : puissance de feu par millier d'hommes.
 * `vitesse` : facteur de marche (la cavalerie va vite, l'artillerie traîne).
 * `cout`    : à la levée, pour un régiment de TAILLE_REGIMENT.
 * `entretien` : par jour et par millier d'hommes.
 * `contre`  : multiplicateur appliqué à notre force selon l'arme d'en face.
 */
export const UNITES = {
  infanterie: {
    id: 'infanterie',
    nom: 'Infanterie',
    pluriel: "régiments d'infanterie",
    domaine: 'terre',
    resume: "L'ossature de toute armée. En carré, elle brise les charges.",
    force: 1.0,
    vitesse: 1.0,
    cout: { or: 110, fer: 70, bois: 50 },
    entretien: { or: 0.05, bois: 0.03, fer: 0.02, eau: 0.04 },
    duree: 20,
    contre: { infanterie: 1.0, cavalerie: 1.35, artillerie: 0.85 },
  },
  cavalerie: {
    id: 'cavalerie',
    nom: 'Cavalerie',
    pluriel: 'escadrons de cavalerie',
    domaine: 'terre',
    resume: 'Rapide et tranchante. Elle tourne les batteries et poursuit les fuyards.',
    force: 1.1,
    vitesse: 1.5,
    cout: { or: 190, fer: 60, bois: 40 },
    entretien: { or: 0.11, bois: 0.03, fer: 0.02, eau: 0.07 },
    duree: 28,
    contre: { infanterie: 0.8, cavalerie: 1.0, artillerie: 1.7 },
  },
  artillerie: {
    id: 'artillerie',
    nom: 'Artillerie',
    pluriel: "batteries d'artillerie",
    domaine: 'terre',
    resume: "Dévastatrice sur l'infanterie massée, sans défense si on l'aborde.",
    force: 1.6,
    vitesse: 0.65,
    cout: { or: 210, fer: 190, bois: 120 },
    entretien: { or: 0.09, bois: 0.06, fer: 0.06, eau: 0.03 },
    duree: 34,
    contre: { infanterie: 1.45, cavalerie: 0.55, artillerie: 1.0 },
  },
  ligne: {
    id: 'ligne',
    nom: 'Vaisseaux de ligne',
    pluriel: 'vaisseaux de ligne',
    domaine: 'mer',
    resume: 'Les murailles flottantes. Elles décident des batailles navales.',
    force: 1.5,
    vitesse: 0.85,
    cout: { or: 260, fer: 150, bois: 260 },
    entretien: { or: 0.12, bois: 0.07, fer: 0.03, eau: 0.05 },
    duree: 40,
    contre: { ligne: 1.0, fregate: 1.4 },
  },
  fregate: {
    id: 'fregate',
    nom: 'Frégates',
    pluriel: 'frégates',
    domaine: 'mer',
    resume: 'Rapides, elles escortent les convois et tiennent le blocus.',
    force: 0.85,
    vitesse: 1.4,
    cout: { or: 150, fer: 70, bois: 160 },
    entretien: { or: 0.06, bois: 0.04, fer: 0.02, eau: 0.03 },
    duree: 24,
    contre: { ligne: 0.7, fregate: 1.0 },
  },
};

export const UNITES_TERRE = ['infanterie', 'cavalerie', 'artillerie'];
export const UNITES_MER = ['ligne', 'fregate'];

/** Effectif d'un régiment levé d'un coup, en milliers d'hommes ou en navires. */
export const TAILLE_REGIMENT = { infanterie: 10, cavalerie: 5, artillerie: 4, ligne: 4, fregate: 6 };

/** Hommes puisés dans les réserves pour lever un régiment. */
export const RESERVES_REGIMENT = { infanterie: 10, cavalerie: 6, artillerie: 5, ligne: 5, fregate: 4 };

export const domaineDe = (type) => UNITES[type].domaine;
export const typesDuDomaine = (domaine) => (domaine === 'mer' ? UNITES_MER : UNITES_TERRE);

/** Composition vierge pour un domaine donné. */
export function compositionVide(domaine) {
  return Object.fromEntries(typesDuDomaine(domaine).map((t) => [t, 0]));
}

/** Total d'une composition. */
export function totalUnites(unites) {
  return Object.values(unites).reduce((s, v) => s + v, 0);
}

/**
 * Puissance d'une composition face à une autre.
 * Chaque arme est multipliée par ses affinités, pondérées par la part que
 * l'arme adverse occupe en face : une armée toute en artillerie s'effondre
 * devant de la cavalerie, et l'inverse est vrai.
 */
export function puissanceComposition(unites, unitesAdverses) {
  const totalAdverse = totalUnites(unitesAdverses) || 1;
  let total = 0;
  for (const [type, nombre] of Object.entries(unites)) {
    if (nombre <= 0) continue;
    const modele = UNITES[type];
    let affinite = 0;
    for (const [typeAdverse, nombreAdverse] of Object.entries(unitesAdverses)) {
      const part = nombreAdverse / totalAdverse;
      affinite += part * (modele.contre[typeAdverse] ?? 1);
    }
    total += nombre * modele.force * (affinite || 1);
  }
  return total;
}

/** Vitesse de marche d'une composition : celle de son élément le plus lent. */
export function vitesseComposition(unites) {
  let vitesse = Infinity;
  for (const [type, nombre] of Object.entries(unites)) {
    if (nombre > 0) vitesse = Math.min(vitesse, UNITES[type].vitesse);
  }
  return Number.isFinite(vitesse) ? vitesse : 1;
}

/** Entretien quotidien d'une composition, par ressource. */
export function entretienComposition(unites) {
  const total = { or: 0, bois: 0, fer: 0, eau: 0, charbon: 0 };
  for (const [type, nombre] of Object.entries(unites)) {
    if (nombre <= 0) continue;
    for (const [ressource, taux] of Object.entries(UNITES[type].entretien)) {
      total[ressource] += taux * nombre;
    }
  }
  return total;
}

/**
 * Répartit des pertes sur une composition. Les armes vulnérables à ce que
 * l'ennemi aligne souffrent davantage : l'artillerie fond sous la cavalerie.
 */
export function appliquerPertes(unites, part, unitesAdverses) {
  const totalAdverse = totalUnites(unitesAdverses) || 1;
  for (const type of Object.keys(unites)) {
    if (unites[type] <= 0) continue;
    let exposition = 0;
    for (const [typeAdverse, nombreAdverse] of Object.entries(unitesAdverses)) {
      const partAdverse = nombreAdverse / totalAdverse;
      // Moins on est efficace contre cette arme, plus on encaisse.
      exposition += partAdverse / (UNITES[type].contre[typeAdverse] ?? 1);
    }
    unites[type] *= 1 - Math.min(0.5, part * (exposition || 1));
    if (unites[type] < 0.05) unites[type] = 0;
  }
}

/** Arme la plus nombreuse d'une composition, pour l'icône du pion. */
export function armeDominante(unites) {
  let meilleur = null;
  let maximum = -1;
  for (const [type, nombre] of Object.entries(unites)) {
    if (nombre > maximum) {
      maximum = nombre;
      meilleur = type;
    }
  }
  return meilleur;
}

/** Description courte d'une composition : « 20 inf · 5 cav ». */
export function decrireComposition(unites) {
  const abreviations = { infanterie: 'inf', cavalerie: 'cav', artillerie: 'art', ligne: 'vais', fregate: 'frég' };
  return Object.entries(unites)
    .filter(([, n]) => n > 0.05)
    .map(([type, n]) => `${Math.round(n)} ${abreviations[type]}`)
    .join(' · ');
}
