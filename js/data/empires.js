/* ============================================================
   empires.js — puissances du jeu
   ------------------------------------------------------------
   `jouable` : proposé au joueur dans le menu.
   `doctrine` : trait secret, non révélé dans l'interface.
   ============================================================ */

export const EMPIRES = [
  {
    id: 'fra',
    nom: 'Empire français',
    adjectif: 'français',
    souverain: 'Napoléon Ier',
    couleur: '#3563c9',
    jouable: true,
    resume:
      'La Grande Armée est la meilleure infanterie du continent, mais toute l\'Europe se ligue contre elle.',
    doctrine: {
      // Avantage caché des troupes napoléoniennes : révélé au combat, jamais affiché.
      elan: 1.25,
      moralInitial: 70,
      gainMoralVictoire: 1.4,
    },
  },
  {
    id: 'gbr',
    nom: 'Royaume-Uni',
    adjectif: 'britannique',
    souverain: 'George III',
    couleur: '#c0392b',
    jouable: true,
    resume: 'Maîtresse des mers et banquière des coalitions, faible sur terre.',
    doctrine: { elan: 0.95, moralInitial: 60, gainMoralVictoire: 1.0, orBonus: 1.3 },
  },
  {
    id: 'pru',
    nom: 'Royaume de Prusse',
    adjectif: 'prussien',
    souverain: 'Frédéric-Guillaume III',
    couleur: '#454b5c',
    jouable: true,
    resume: 'Une armée disciplinée pour un royaume trop petit : il lui faut conquérir ou périr.',
    doctrine: { elan: 1.05, moralInitial: 65, gainMoralVictoire: 1.1, disciplineDefensive: 1.15 },
  },
  {
    id: 'aut',
    nom: 'Empire d\'Autriche',
    adjectif: 'autrichien',
    souverain: 'François Ier',
    couleur: '#d8c46f',
    jouable: true,
    resume: 'Un empire vaste et divers, lent à se mobiliser mais inépuisable.',
    doctrine: { elan: 0.95, moralInitial: 60, gainMoralVictoire: 1.0, reserves: 1.2 },
  },
  {
    id: 'rus',
    nom: 'Empire russe',
    adjectif: 'russe',
    souverain: 'Alexandre Ier',
    couleur: '#3f8f63',
    jouable: true,
    resume: 'L\'espace et l\'hiver combattent pour vous. Vos soldats ne rompent jamais.',
    doctrine: { elan: 0.9, moralInitial: 75, gainMoralVictoire: 0.9, tenacite: 1.25 },
  },
  {
    id: 'esp',
    nom: 'Royaume d\'Espagne',
    adjectif: 'espagnol',
    souverain: 'Charles IV',
    couleur: '#d98a2b',
    jouable: true,
    resume: 'L\'or des Amériques afflue, mais l\'armée est en piteux état.',
    doctrine: { elan: 0.85, moralInitial: 55, gainMoralVictoire: 1.0, orBonus: 1.25 },
  },
  {
    id: 'ott',
    nom: 'Empire ottoman',
    adjectif: 'ottoman',
    souverain: 'Sélim III',
    couleur: '#8e44ad',
    jouable: true,
    resume: 'Un colosse assis sur trois continents, que ses voisins guettent déjà.',
    doctrine: { elan: 0.9, moralInitial: 60, gainMoralVictoire: 1.0, reserves: 1.15 },
  },

  /* --- Puissances mineures --- */
  { id: 'por', nom: 'Portugal', adjectif: 'portugais', souverain: 'Jean VI', couleur: '#1f7a6f' },
  { id: 'dan', nom: 'Danemark-Norvège', adjectif: 'danois', souverain: 'Christian VII', couleur: '#c95b7f' },
  { id: 'sue', nom: 'Suède', adjectif: 'suédois', souverain: 'Gustave IV', couleur: '#4bb3d9' },
  { id: 'bav', nom: 'Bavière', adjectif: 'bavarois', souverain: 'Maximilien Ier', couleur: '#7fa8d4' },
  { id: 'sax', nom: 'Saxe', adjectif: 'saxon', souverain: 'Frédéric-Auguste Ier', couleur: '#9c7fbf' },
  { id: 'han', nom: 'Hanovre', adjectif: 'hanovrien', souverain: 'Régence', couleur: '#a8683f' },
  { id: 'sui', nom: 'Confédération suisse', adjectif: 'suisse', souverain: 'Diète', couleur: '#cf5b52' },
  { id: 'tos', nom: 'Toscane', adjectif: 'toscan', souverain: 'Louis Ier', couleur: '#c7a86b' },
  { id: 'pap', nom: 'États pontificaux', adjectif: 'pontifical', souverain: 'Pie VII', couleur: '#e2e0d5' },
  { id: 'nap', nom: 'Royaume de Naples', adjectif: 'napolitain', souverain: 'Ferdinand IV', couleur: '#d1743f' },
  { id: 'var', nom: 'Duché de Varsovie', adjectif: 'polonais', souverain: 'Conseil', couleur: '#b03a5b' },
  { id: 'bar', nom: 'Régences barbaresques', adjectif: 'barbaresque', souverain: 'Deys', couleur: '#6f8f4a' },
  { id: 'usa', nom: 'États-Unis', adjectif: 'américain', souverain: 'Thomas Jefferson', couleur: '#5b7fa8' },
  { id: 'per', nom: 'Perse Qadjar', adjectif: 'persan', souverain: 'Fath Ali Shah', couleur: '#4f9e8f' },
  { id: 'qin', nom: 'Empire Qing', adjectif: 'chinois', souverain: 'Jiaqing', couleur: '#c2b03f' },
  { id: 'mar', nom: 'Confédération marathe', adjectif: 'marathe', souverain: 'Peshwa', couleur: '#8f6fb0' },
  { id: 'kha', nom: 'Khanats d\'Asie centrale', adjectif: 'ouzbek', souverain: 'Khans', couleur: '#9a8c5c' },
  { id: 'afr', nom: 'Royaumes africains', adjectif: 'africain', souverain: 'Rois', couleur: '#7a9c5f' },
];

/** Doctrine par défaut des puissances qui n'en déclarent pas. */
export const DOCTRINE_DEFAUT = {
  elan: 0.9,
  moralInitial: 55,
  gainMoralVictoire: 1.0,
};

export const EMPIRES_PAR_ID = Object.fromEntries(EMPIRES.map((e) => [e.id, e]));

export const EMPIRES_JOUABLES = EMPIRES.filter((e) => e.jouable);

/** Métadonnées d'affichage des ressources. */
export const RESSOURCES = [
  { id: 'bois', nom: 'Bois', couleur: '#7d5a3c', de: 'de bois', du: 'du bois' },
  { id: 'eau', nom: 'Eau', couleur: '#3f8fc9', de: "d'eau", du: "de l'eau" },
  { id: 'charbon', nom: 'Charbon', couleur: '#5a5a63', de: 'de charbon', du: 'du charbon' },
  { id: 'fer', nom: 'Fer', couleur: '#9aa3ad', de: 'de fer', du: 'du fer' },
  { id: 'or', nom: 'Or', couleur: '#c9a227', de: "d'or", du: "de l'or" },
];

export const TERRAINS = {
  plaine: { nom: 'Plaine', teinte: 0.0 },
  colline: { nom: 'Collines', teinte: -0.05 },
  montagne: { nom: 'Montagnes', teinte: -0.12 },
  foret: { nom: 'Forêt', teinte: -0.08 },
  cote: { nom: 'Côte', teinte: 0.06 },
  desert: { nom: 'Désert', teinte: 0.12 },
  steppe: { nom: 'Steppe', teinte: 0.05 },
  toundra: { nom: 'Toundra', teinte: 0.09 },
  jungle: { nom: 'Jungle', teinte: -0.1 },
};
