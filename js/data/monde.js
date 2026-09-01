/* ============================================================
   monde.js — géographie du jeu
   ------------------------------------------------------------
   La carte est construite en deux temps :
     1. des CONTINENTS, décrits par leur seule ligne de côte ;
     2. des TERRITOIRES, décrits par un simple point (leur capitale).
   Les frontières sont ensuite calculées automatiquement
   (diagramme de Voronoï découpé par la côte, cf. map/carte.js).
   ============================================================ */

/* ------------------------------------------------------------
   Continents — polygones [longitude, latitude]
   ------------------------------------------------------------ */
export const CONTINENTS = [
  {
    id: 'europe',
    nom: 'Europe',
    contour: [
      [-5.6, 36.0], [-9.0, 37.0], [-8.9, 41.9], [-9.3, 43.0], [-4.0, 43.5], [-1.8, 43.4],
      [-1.2, 46.2], [-2.3, 47.3], [-4.8, 48.6], [-1.5, 48.8], [0.2, 49.5], [1.6, 50.9],
      [3.1, 51.5], [4.7, 52.9], [6.9, 53.5], [8.2, 53.9], [8.1, 54.9], [8.5, 57.6],
      [10.6, 57.7], [10.0, 55.0], [11.0, 54.3], [14.2, 54.1], [18.6, 54.6], [21.0, 55.3],
      [24.0, 57.5], [24.5, 59.5], [28.5, 59.9], [27.0, 60.4], [22.5, 60.2], [21.3, 63.0],
      [24.5, 65.6], [21.5, 65.4], [18.0, 63.0], [17.5, 61.0], [18.7, 59.4], [16.5, 56.4],
      [12.9, 56.1], [11.8, 58.3], [10.7, 59.9], [5.7, 58.9], [5.0, 62.0], [11.5, 64.5],
      [14.5, 68.0], [19.0, 70.0], [25.5, 71.1], [30.5, 70.2], [33.5, 69.5], [40.0, 66.3],
      [44.5, 68.0], [52.0, 69.5], [60.0, 70.5], [60.0, 60.0], [58.0, 52.0], [55.0, 48.0],
      [49.0, 46.0], [47.5, 43.5], [45.0, 42.5], [41.5, 41.5], [39.0, 44.0], [37.0, 45.0],
      [35.0, 45.4], [33.5, 44.4], [32.5, 45.4], [31.5, 46.5], [30.5, 46.4], [29.7, 45.2],
      [28.6, 44.0], [27.9, 42.7], [28.0, 41.4], [28.9, 41.2], [26.7, 40.4], [24.5, 40.9],
      [23.0, 40.4], [24.0, 38.0], [23.7, 37.9], [21.5, 37.0], [21.0, 38.4], [19.0, 39.7],
      [19.5, 42.0], [18.0, 42.6], [15.2, 44.3], [13.6, 45.5], [12.3, 45.4], [14.0, 42.4],
      [16.0, 41.9], [18.4, 40.1], [17.2, 40.5], [16.3, 38.9], [15.6, 38.0], [14.0, 40.6],
      [12.4, 41.7], [10.3, 43.0], [10.0, 44.0], [8.0, 43.9], [5.4, 43.3], [3.2, 43.0],
      [2.2, 41.3], [0.9, 41.0], [0.0, 39.5], [-0.7, 37.6], [-2.2, 36.7],
    ],
  },
  {
    id: 'asie',
    nom: 'Asie',
    contour: [
      [26.5, 40.2], [29.0, 41.2], [33.0, 42.0], [38.0, 41.5], [41.5, 41.5], [45.0, 42.5],
      [47.5, 43.5], [49.0, 46.0], [55.0, 48.0], [58.0, 52.0], [60.0, 60.0], [60.0, 70.5],
      [70.0, 72.5], [80.0, 73.5], [90.0, 75.5], [105.0, 77.5], [113.0, 73.5], [130.0, 73.0],
      [140.0, 72.5], [160.0, 70.0], [170.0, 68.8], [179.0, 65.5], [172.0, 60.0], [162.0, 58.0],
      [156.0, 51.0], [142.0, 54.0], [135.0, 44.0], [128.0, 38.5], [126.0, 34.6], [122.0, 31.0],
      [117.0, 23.5], [110.0, 21.0], [107.0, 16.0], [106.5, 10.0], [100.5, 13.5], [98.5, 8.0],
      [100.0, 6.5], [98.5, 12.0], [97.0, 16.5], [94.0, 21.0], [90.0, 22.0], [87.0, 21.5],
      [80.5, 15.5], [77.5, 8.0], [73.0, 15.0], [70.0, 22.0], [67.0, 25.0], [61.0, 25.0],
      [57.0, 25.5], [56.5, 26.5], [50.5, 29.0], [48.5, 30.0], [47.5, 30.0], [48.0, 28.5],
      [50.0, 26.0], [54.0, 24.0], [57.0, 22.0], [55.0, 17.5], [52.0, 15.5], [45.0, 13.0],
      [43.3, 12.7], [39.0, 17.0], [36.0, 23.0], [34.5, 28.0], [34.2, 31.3], [35.5, 34.5],
      [36.0, 36.0], [35.0, 36.5], [32.0, 36.3], [29.0, 36.3], [27.0, 36.7], [26.5, 38.5],
    ],
  },
  {
    id: 'afrique',
    nom: 'Afrique',
    contour: [
      [-5.6, 35.8], [-1.0, 35.8], [3.1, 36.8], [8.2, 37.1], [10.2, 37.0], [11.0, 33.5],
      [15.2, 32.4], [19.5, 30.5], [23.0, 32.2], [27.0, 31.4], [31.5, 31.5], [34.2, 28.0],
      [37.0, 22.0], [39.0, 15.0], [43.3, 12.7], [47.0, 11.0], [51.4, 11.9], [48.5, 5.0],
      [42.5, -1.0], [40.0, -10.5], [35.5, -19.0], [32.5, -25.7], [27.0, -33.5], [18.4, -34.4],
      [14.5, -22.5], [11.8, -16.0], [13.5, -11.0], [12.0, -5.0], [9.4, 0.5], [8.5, 4.4],
      [3.5, 6.4], [-2.0, 4.8], [-7.5, 4.4], [-13.0, 9.0], [-16.5, 14.0], [-17.0, 21.0],
      [-13.0, 27.7], [-9.8, 30.0], [-6.0, 34.0],
    ],
  },
  {
    id: 'amerique_nord',
    nom: 'Amérique du Nord',
    contour: [
      [-168, 66], [-160, 71], [-140, 70], [-125, 70], [-110, 68], [-95, 68], [-85, 70],
      [-80, 73], [-70, 68], [-64, 60], [-56, 51], [-66, 45], [-70, 42], [-74, 40],
      [-76, 35], [-81, 25], [-85, 30], [-90, 29], [-97, 26], [-97, 22], [-95, 16],
      [-92, 14], [-84, 10], [-79, 9], [-83, 15], [-88, 21], [-90, 20], [-105, 20],
      [-110, 24], [-114, 31], [-120, 34], [-124, 40], [-125, 48], [-135, 57], [-150, 60],
      [-165, 55], [-162, 63],
    ],
  },
  {
    id: 'amerique_sud',
    nom: 'Amérique du Sud',
    contour: [
      [-81, -5], [-75, 0], [-70, 11], [-62, 10], [-52, 5], [-50, 0], [-44, -2], [-35, -5],
      [-39, -14], [-48, -25], [-54, -34], [-58, -38], [-62, -40], [-65, -45], [-68, -52],
      [-73, -53], [-75, -46], [-73, -40], [-71, -30], [-70, -20], [-76, -14],
    ],
  },
  {
    id: 'grande_bretagne',
    nom: 'Grande-Bretagne',
    contour: [
      [-5.2, 50.1], [-3.0, 51.2], [-5.0, 51.6], [-4.7, 53.4], [-3.1, 54.9], [-5.0, 55.0],
      [-5.8, 57.4], [-3.0, 58.6], [-1.8, 57.5], [-2.0, 56.0], [0.0, 53.5], [1.7, 52.7],
      [1.4, 51.4], [-1.0, 50.7],
    ],
  },
  {
    id: 'irlande',
    nom: 'Irlande',
    contour: [
      [-10.4, 51.6], [-9.0, 53.4], [-10.0, 54.3], [-8.0, 55.2], [-6.0, 54.6], [-6.0, 53.3],
      [-6.3, 52.2], [-8.5, 51.5],
    ],
  },
  {
    id: 'sicile',
    nom: 'Sicile',
    contour: [[12.4, 37.8], [15.1, 38.3], [15.6, 38.2], [15.2, 37.0], [12.9, 36.8]],
  },
  {
    id: 'antilles',
    nom: 'Antilles',
    contour: [[-85, 22], [-80, 23.2], [-74, 20.3], [-68, 19.2], [-70, 17.8], [-77, 17.9], [-84, 20]],
  },
  {
    id: 'australie',
    nom: 'Nouvelle-Hollande',
    contour: [
      [114, -22], [113, -26], [115, -34], [129, -32], [138, -35], [146, -39], [150, -35],
      [153, -28], [146, -19], [142, -11], [136, -12], [130, -12], [125, -14], [122, -17],
    ],
  },
  {
    id: 'insulinde',
    nom: 'Insulinde',
    contour: [
      [95, 5.5], [100, 2.0], [104, -2.0], [106, -6.5], [112, -8.5], [117, -8.0], [119, -2.0],
      [118, 4.0], [112, 5.5], [105, 4.0], [99, 6.0],
    ],
  },
];

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

/* ------------------------------------------------------------
   Liaisons maritimes ajoutées aux frontières terrestres.
   ------------------------------------------------------------ */
export const LIAISONS_MARITIMES = [
  ['angleterre', 'normandie'],
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
