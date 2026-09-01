/* ============================================================
   monde.js — les provinces du jeu
   ------------------------------------------------------------
   Ce fichier décrit ce qu'est une province : son nom, sa
   capitale, son terrain, ses gisements, son souverain de 1805.
   Sa forme, elle, vient de data/frontieres.js — des contours
   réels, produits par outils/frontieres.py à partir de Natural
   Earth. Les deux fichiers sont liés par l'identifiant.
   ============================================================ */

/* ------------------------------------------------------------
   Territoires
   ------------------------------------------------------------
   gisements : [bois, eau, charbon, fer, or] — richesse de 0 à 3.
   ------------------------------------------------------------ */
const T = (id, nom, lon, lat, maitre, terrain, gisements, options = {}) => ({
  id,
  nom,
  lon,
  lat,
  maitre,
  terrain,
  gisements: {
    bois: gisements[0],
    eau: gisements[1],
    charbon: gisements[2],
    fer: gisements[3],
    or: gisements[4],
  },
  population: options.population ?? 1,
  capitale: options.capitale === true,
  ...options,
});

export const TERRITOIRES = [
  /* --- France --- */
  T('ile_de_france', 'Île-de-France', 2.35, 48.85, 'fra', 'plaine', [1, 2, 0, 1, 1], { capitale: true, population: 3 }),
  T('normandie', 'Normandie', 0.1, 49.2, 'fra', 'plaine', [2, 2, 0, 1, 0], { population: 2 }),
  T('bretagne', 'Bretagne', -2.8, 48.1, 'fra', 'cote', [2, 3, 0, 0, 0], { population: 2 }),
  T('aquitaine', 'Aquitaine', -0.6, 44.8, 'fra', 'plaine', [2, 2, 0, 1, 0], { population: 2 }),
  T('languedoc', 'Languedoc', 1.9, 43.7, 'fra', 'colline', [1, 1, 1, 1, 0], { population: 2 }),
  T('provence', 'Provence', 5.6, 43.8, 'fra', 'cote', [1, 1, 0, 1, 0], { population: 2 }),
  T('bourgogne', 'Bourgogne', 4.6, 47.2, 'fra', 'colline', [2, 2, 1, 2, 0], { population: 2 }),
  T('lorraine', 'Lorraine', 6.2, 48.7, 'fra', 'foret', [3, 1, 2, 2, 0], { population: 2 }),
  T('flandre', 'Flandre', 4.35, 50.85, 'fra', 'plaine', [1, 2, 3, 2, 1], { population: 3 }),
  T('hollande', 'Hollande', 5.0, 52.3, 'fra', 'cote', [1, 3, 0, 0, 2], { population: 2 }),
  T('rhenanie', 'Rhénanie', 7.1, 50.7, 'fra', 'foret', [2, 2, 3, 3, 0], { population: 2 }),
  T('piemont', 'Piémont', 7.7, 45.1, 'fra', 'montagne', [2, 2, 0, 2, 0], { population: 2 }),
  T('lombardie', 'Lombardie', 9.2, 45.5, 'fra', 'plaine', [1, 3, 0, 1, 1], { population: 2 }),
  T('indes_orientales', 'Indes orientales', 108.0, -6.0, 'fra', 'jungle', [3, 3, 0, 0, 2], { colonie: true }),

  /* --- Grande-Bretagne --- */
  T('angleterre', 'Angleterre', -1.5, 52.5, 'gbr', 'plaine', [1, 2, 3, 3, 2], { capitale: true, population: 3 }),
  T('ecosse', 'Écosse', -4.0, 56.7, 'gbr', 'montagne', [2, 3, 3, 2, 0], { population: 1 }),
  T('irlande', 'Irlande', -8.0, 53.3, 'gbr', 'plaine', [2, 3, 0, 0, 0], { population: 2 }),
  T('canada', 'Canada', -75.0, 50.0, 'gbr', 'foret', [3, 3, 0, 1, 0], { colonie: true }),
  T('bengale', 'Bengale', 88.0, 24.0, 'gbr', 'jungle', [2, 3, 0, 0, 3], { colonie: true, population: 3 }),
  T('cap', 'Colonie du Cap', 24.0, -30.0, 'gbr', 'steppe', [1, 1, 1, 1, 3], { colonie: true }),
  T('nouvelle_hollande', 'Nouvelle-Hollande', 133.0, -25.0, 'gbr', 'desert', [0, 0, 1, 1, 2], { colonie: true }),

  /* --- Prusse --- */
  T('brandebourg', 'Brandebourg', 13.4, 52.5, 'pru', 'plaine', [2, 1, 2, 2, 0], { capitale: true, population: 2 }),
  T('prusse_orientale', 'Prusse-Orientale', 20.5, 54.5, 'pru', 'foret', [3, 2, 0, 1, 0], { population: 1 }),
  T('silesie', 'Silésie', 17.0, 51.1, 'pru', 'colline', [2, 1, 3, 3, 0], { population: 2 }),
  T('pomeranie', 'Poméranie', 15.5, 53.6, 'pru', 'cote', [2, 2, 0, 1, 0], { population: 1 }),
  T('westphalie', 'Westphalie', 8.0, 51.6, 'pru', 'foret', [2, 1, 3, 3, 0], { population: 2 }),

  /* --- Autriche --- */
  T('autriche', 'Autriche', 16.4, 48.2, 'aut', 'montagne', [2, 2, 1, 2, 1], { capitale: true, population: 2 }),
  T('boheme', 'Bohême', 14.4, 50.1, 'aut', 'foret', [3, 1, 2, 3, 1], { population: 2 }),
  T('hongrie', 'Hongrie', 19.0, 47.4, 'aut', 'plaine', [1, 2, 1, 2, 1], { population: 2 }),
  T('galicie', 'Galicie', 24.0, 49.8, 'aut', 'plaine', [2, 1, 1, 1, 0], { population: 1 }),
  T('venetie', 'Vénétie', 12.0, 45.5, 'aut', 'cote', [1, 3, 0, 0, 1], { population: 2 }),
  T('illyrie', 'Illyrie', 15.9, 45.8, 'aut', 'montagne', [2, 1, 1, 2, 0], { population: 1 }),

  /* --- Russie --- */
  T('saint_petersbourg', 'Saint-Pétersbourg', 30.3, 59.9, 'rus', 'cote', [3, 3, 0, 1, 1], { capitale: true, population: 2 }),
  T('moscou', 'Moscou', 37.6, 55.75, 'rus', 'plaine', [3, 2, 1, 2, 1], { population: 3 }),
  T('livonie', 'Livonie', 24.1, 56.9, 'rus', 'foret', [3, 2, 0, 1, 0], { population: 1 }),
  T('lituanie', 'Lituanie', 25.3, 54.7, 'rus', 'foret', [3, 2, 0, 1, 0], { population: 1 }),
  T('ukraine', 'Ukraine', 31.0, 50.4, 'rus', 'plaine', [1, 2, 3, 3, 0], { population: 2 }),
  T('crimee', 'Crimée', 34.0, 45.3, 'rus', 'steppe', [0, 1, 0, 1, 1], { population: 1 }),
  T('volga', 'Volga', 45.0, 52.0, 'rus', 'steppe', [1, 2, 0, 2, 0], { population: 1 }),
  T('oural', 'Oural', 58.0, 57.0, 'rus', 'montagne', [3, 1, 3, 3, 2], { population: 1 }),
  T('siberie', 'Sibérie', 88.0, 60.0, 'rus', 'toundra', [3, 2, 2, 2, 2], { population: 1 }),

  /* --- Espagne --- */
  T('castille', 'Castille', -3.7, 40.4, 'esp', 'plaine', [1, 1, 1, 2, 1], { capitale: true, population: 2 }),
  T('andalousie', 'Andalousie', -4.5, 37.4, 'esp', 'colline', [1, 1, 1, 2, 2], { population: 2 }),
  T('catalogne', 'Catalogne', 1.2, 41.6, 'esp', 'cote', [1, 2, 1, 1, 1], { population: 2 }),
  T('mexique', 'Nouvelle-Espagne', -102.0, 22.0, 'esp', 'montagne', [1, 1, 1, 2, 3], { colonie: true, population: 2 }),
  T('perou', 'Pérou', -75.0, -12.0, 'esp', 'montagne', [1, 1, 0, 2, 3], { colonie: true }),
  T('rio_plata', 'Rio de la Plata', -60.0, -33.0, 'esp', 'plaine', [1, 2, 0, 1, 2], { colonie: true }),
  T('cuba', 'Antilles espagnoles', -78.0, 21.0, 'esp', 'jungle', [2, 2, 0, 0, 2], { colonie: true }),

  /* --- Empire ottoman --- */
  T('constantinople', 'Constantinople', 28.9, 41.1, 'ott', 'cote', [1, 2, 0, 1, 2], { capitale: true, population: 3 }),
  T('roumelie', 'Roumélie', 23.0, 41.9, 'ott', 'montagne', [2, 1, 1, 2, 0], { population: 2 }),
  T('grece', 'Grèce', 22.5, 38.5, 'ott', 'cote', [1, 1, 0, 1, 1], { population: 1 }),
  T('serbie', 'Serbie', 20.5, 44.3, 'ott', 'colline', [2, 1, 1, 2, 0], { population: 1 }),
  T('valachie', 'Valachie', 26.1, 44.6, 'ott', 'plaine', [1, 2, 1, 1, 0], { population: 1 }),
  T('anatolie', 'Anatolie', 33.0, 39.0, 'ott', 'montagne', [1, 1, 1, 2, 1], { population: 2 }),
  T('levant', 'Levant', 36.5, 34.0, 'ott', 'desert', [0, 1, 0, 1, 1], { population: 1 }),
  T('arabie', 'Arabie', 45.0, 22.0, 'ott', 'desert', [0, 0, 0, 0, 2], { population: 1 }),
  T('egypte', 'Égypte', 31.0, 27.0, 'ott', 'desert', [0, 3, 0, 0, 2], { population: 2 }),

  /* --- Puissances mineures (pilotées par l'IA) --- */
  T('portugal', 'Portugal', -8.4, 39.8, 'por', 'cote', [1, 2, 0, 1, 1], { capitale: true, population: 2 }),
  T('bresil', 'Brésil', -45.0, -12.0, 'por', 'jungle', [3, 3, 0, 2, 3], { colonie: true }),
  T('danemark', 'Danemark', 9.4, 56.0, 'dan', 'plaine', [1, 2, 0, 0, 1], { capitale: true, population: 1 }),
  T('norvege', 'Norvège', 9.0, 61.0, 'dan', 'montagne', [3, 3, 0, 2, 0], { population: 1 }),
  T('suede', 'Suède', 16.0, 59.5, 'sue', 'foret', [3, 2, 0, 3, 1], { capitale: true, population: 1 }),
  T('finlande', 'Finlande', 25.5, 62.5, 'sue', 'foret', [3, 3, 0, 1, 0], { population: 1 }),
  T('baviere', 'Bavière', 11.6, 48.9, 'bav', 'colline', [2, 2, 1, 2, 0], { capitale: true, population: 2 }),
  T('souabe', 'Souabe', 9.2, 48.6, 'bav', 'foret', [3, 2, 0, 1, 0], { population: 1 }),
  T('saxe', 'Saxe', 13.4, 51.1, 'sax', 'colline', [2, 1, 2, 2, 1], { capitale: true, population: 2 }),
  T('hanovre', 'Hanovre', 10.0, 52.6, 'han', 'plaine', [2, 2, 1, 1, 0], { capitale: true, population: 1 }),
  T('suisse', 'Suisse', 7.6, 46.8, 'sui', 'montagne', [2, 3, 0, 1, 1], { capitale: true, population: 1 }),
  T('toscane', 'Toscane', 11.3, 43.5, 'tos', 'colline', [1, 1, 0, 1, 2], { capitale: true, population: 1 }),
  T('rome', 'États pontificaux', 12.5, 41.9, 'pap', 'colline', [1, 1, 0, 0, 2], { capitale: true, population: 1 }),
  T('naples', 'Naples', 14.3, 40.9, 'nap', 'colline', [1, 1, 0, 1, 1], { capitale: true, population: 2 }),
  T('sicile', 'Sicile', 14.0, 37.5, 'nap', 'cote', [0, 1, 0, 1, 1], { population: 1 }),
  T('varsovie', 'Duché de Varsovie', 21.0, 52.2, 'var', 'plaine', [2, 2, 1, 1, 0], { capitale: true, population: 2 }),
  T('maghreb', 'Barbarie', 3.0, 33.0, 'bar', 'desert', [0, 0, 1, 1, 1], { capitale: true }),
  T('etats_unis', 'Virginie', -78.0, 39.0, 'usa', 'plaine', [3, 3, 2, 2, 1], { capitale: true, population: 2 }),
  T('louisiane', 'Louisiane', -95.0, 38.0, 'usa', 'plaine', [2, 3, 1, 1, 1], {}),
  T('perse', 'Perse', 53.0, 32.0, 'per', 'desert', [0, 1, 0, 2, 2], { capitale: true, population: 2 }),
  T('chine', 'Chine', 110.0, 32.0, 'qin', 'plaine', [2, 3, 3, 3, 3], { capitale: true, population: 3 }),
  T('indochine', 'Indochine', 103.0, 15.0, 'qin', 'jungle', [3, 3, 0, 1, 1], { population: 1 }),
  T('inde', 'Deccan', 78.0, 21.0, 'mar', 'plaine', [2, 2, 1, 2, 3], { capitale: true, population: 3 }),
  T('asie_centrale', 'Asie centrale', 65.0, 42.0, 'kha', 'steppe', [0, 1, 0, 1, 2], { capitale: true }),
  T('afrique_ouest', 'Afrique de l\'Ouest', -5.0, 12.0, 'afr', 'jungle', [3, 2, 0, 1, 3], { capitale: true }),
  T('afrique_centrale', 'Afrique centrale', 18.0, -5.0, 'afr', 'jungle', [3, 3, 0, 1, 2], {}),
  T('afrique_est', 'Afrique de l\'Est', 38.0, -5.0, 'afr', 'steppe', [1, 2, 0, 1, 2], {}),
];

/**
 * Cultures des provinces qui ne se reconnaissent pas dans le drapeau de leur
 * souverain de 1805. Toutes les autres prennent pour culture celle de ce
 * souverain, et forment donc son noyau.
 *
 * Une culture qui correspond à un empire vivant lui donne un droit à
 * revendiquer la province ; les autres — « ita », « irl », « hon »… — n'ont
 * pas d'État pour les porter : elles ne produisent que du ressentiment.
 */
export const CULTURES_PROVINCES = {
  // Îles Britanniques : l'Écosse est dans l'Union depuis 1707 et Londres
  // l'accepte pour sienne ; l'Union de 1801 n'a pas fait des Irlandais des Anglais.
  ecosse: 'eco',
  irlande: 'irl',

  // L'Empire français tient des pays qui ne sont pas la France.
  flandre: 'nee',
  hollande: 'nee',
  rhenanie: 'all',
  piemont: 'ita',
  lombardie: 'ita',
  indes_orientales: 'jav',

  // Le Canada français sous drapeau britannique.
  canada: 'fra',
  bengale: 'mar',
  cap: 'afr',
  nouvelle_hollande: 'aus',

  // La monarchie des Habsbourg, mosaïque de nations.
  venetie: 'ita',
  illyrie: 'ill',
  galicie: 'var',

  // La Silésie, prise à l'Autriche par Frédéric II : Vienne ne l'a pas oubliée.
  silesie: 'aut',

  // L'Empire russe et ses marches.
  lituanie: 'var',
  crimee: 'ott',

  // Les provinces chrétiennes et l'Égypte mamelouke de la Porte.
  grece: 'gre',
  serbie: 'ser',
  egypte: 'egy',

  // Les vice-royautés espagnoles, où gronde le sentiment créole.
  mexique: 'amer',
  perou: 'amer',
  rio_plata: 'amer',
  cuba: 'amer',
  bresil: 'amer',
};

/**
 * Provinces d'Europe, au sens des conditions de victoire.
 * La liste est explicite plutôt que déduite de la géographie : la limite
 * de l'Europe est une convention, pas une donnée.
 */
export const PROVINCES_EUROPEENNES = new Set([
  'ile_de_france', 'normandie', 'bretagne', 'aquitaine', 'languedoc', 'provence',
  'bourgogne', 'lorraine', 'flandre', 'hollande', 'rhenanie', 'piemont', 'lombardie',
  'angleterre', 'ecosse', 'irlande',
  'brandebourg', 'prusse_orientale', 'silesie', 'pomeranie', 'westphalie',
  'autriche', 'boheme', 'hongrie', 'galicie', 'venetie', 'illyrie',
  'saint_petersbourg', 'moscou', 'livonie', 'lituanie', 'ukraine', 'crimee', 'volga', 'oural',
  'castille', 'andalousie', 'catalogne',
  'constantinople', 'roumelie', 'grece', 'serbie', 'valachie',
  'portugal', 'danemark', 'norvege', 'suede', 'finlande',
  'baviere', 'souabe', 'saxe', 'hanovre', 'suisse',
  'toscane', 'rome', 'naples', 'sicile', 'varsovie',
]);

/* ------------------------------------------------------------
   Liaisons maritimes ajoutées aux frontières terrestres.
   ------------------------------------------------------------ */
export const LIAISONS_MARITIMES = [
  // Une province qui figure ici est un port : elle peut armer des navires,
  // et les escadres ne se déplacent que le long de ces routes.
  ['angleterre', 'normandie'],
  ['angleterre', 'bretagne'],
  ['bretagne', 'irlande'],
  ['bretagne', 'portugal'],
  ['portugal', 'andalousie'],
  ['andalousie', 'catalogne'],
  ['catalogne', 'provence'],
  ['provence', 'toscane'],
  ['toscane', 'naples'],
  ['venetie', 'naples'],
  ['venetie', 'illyrie'],
  ['egypte', 'arabie'],
  ['hollande', 'hanovre'],
  ['pomeranie', 'prusse_orientale'],
  ['canada', 'irlande'],
  ['etats_unis', 'canada'],
  ['bresil', 'afrique_ouest'],
  ['cap', 'indes_orientales'],
  ['angleterre', 'flandre'],
  ['angleterre', 'hollande'],
  ['angleterre', 'irlande'],
  ['ecosse', 'irlande'],
  ['ecosse', 'norvege'],
  ['angleterre', 'danemark'],
  ['danemark', 'suede'],
  ['danemark', 'norvege'],
  ['danemark', 'hanovre'],
  ['suede', 'finlande'],
  ['suede', 'pomeranie'],
  ['suede', 'livonie'],
  ['finlande', 'saint_petersbourg'],
  ['sicile', 'naples'],
  ['sicile', 'maghreb'],
  ['sicile', 'grece'],
  ['maghreb', 'andalousie'],
  ['maghreb', 'provence'],
  ['maghreb', 'egypte'],
  ['egypte', 'levant'],
  ['egypte', 'grece'],
  ['constantinople', 'anatolie'],
  ['constantinople', 'crimee'],
  ['grece', 'anatolie'],
  ['crimee', 'anatolie'],
  ['volga', 'asie_centrale'],
  ['oural', 'siberie'],
  ['oural', 'asie_centrale'],
  ['moscou', 'siberie'],
  ['cuba', 'etats_unis'],
  ['cuba', 'mexique'],
  ['cuba', 'perou'],
  ['angleterre', 'canada'],
  ['portugal', 'bresil'],
  ['bengale', 'indes_orientales'],
  ['indes_orientales', 'nouvelle_hollande'],
  ['indes_orientales', 'indochine'],
  ['cap', 'afrique_est'],
  ['portugal', 'afrique_ouest'],
];
