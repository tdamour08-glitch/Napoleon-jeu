#!/usr/bin/env python3
"""
frontieres.py — fabrique js/data/frontieres.js à partir de Natural Earth.

Les provinces du jeu sont décrites par une correspondance avec de vraies
entités administratives (pays, régions, Länder…). Le script les rastérise
sur une grille, attribue les terres non revendiquées à la province dont la
capitale est la plus proche, puis retrace les contours obtenus, les lisse
et les simplifie.

On obtient des frontières et des côtes réelles, lissées, et une adjacence
déduite du voisinage effectif des provinces — sans polygones de Voronoï.

Usage :  python3 outils/frontieres.py <dossier_geojson> [sortie]

Données attendues dans <dossier_geojson>, depuis
https://github.com/nvkelso/natural-earth-vector (dossier geojson/) :
    ne_50m_admin_0_countries.geojson
    ne_10m_admin_1.geojson   (renommé de ne_10m_admin_1_states_provinces.geojson)

Le script lit aussi les capitales des provinces, extraites de js/data/monde.js :
    node --input-type=module -e "import('./js/data/monde.js').then(m => \
      console.log(JSON.stringify(Object.fromEntries( \
        m.TERRITOIRES.map(t => [t.id, [t.lon, t.lat]])))))" > outils/capitales.json
"""

import json
import math
import sys
from collections import defaultdict, deque

import numpy as np

# Grille de travail : 0,15° ≈ 17 km, assez fin pour l'Europe, assez léger
# pour tenir en mémoire sur le monde entier.
PAS = 0.15
LON_MIN, LON_MAX = -170.0, 180.0
LAT_MIN, LAT_MAX = -56.0, 78.0

COLS = int(round((LON_MAX - LON_MIN) / PAS))
ROWS = int(round((LAT_MAX - LAT_MIN) / PAS))

# Lissage et simplification des contours.
PASSES_CHAIKIN = 2
EPSILON_SIMPLIFICATION = 0.09      # en degrés
AIRE_MINIMALE_ANNEAU = 8           # cellules : en dessous, c'est un îlot négligeable


# ------------------------------------------------------------------
# Correspondance provinces du jeu ↔ entités réelles
# ------------------------------------------------------------------
# 'pays'    : nom d'un pays dans admin_0 (géométrie entière)
# 'regions' : valeurs du champ `region` d'admin_1, pour un pays donné
# 'noms'    : valeurs du champ `name` d'admin_1
# 'unites'  : valeurs du champ `geonunit` d'admin_1 (Angleterre, Écosse…)
# 'lon'     : bornes de longitude, pour trancher un pays en deux
#
# L'ordre compte : la première province qui revendique une cellule la garde.
CORRESPONDANCES = [
    # --- Îles Britanniques ---
    ('angleterre', {'admin1': 'United Kingdom', 'unites': ['England', 'Wales']}),
    ('ecosse', {'admin1': 'United Kingdom', 'unites': ['Scotland']}),
    ('irlande', {'pays': ['Ireland'], 'admin1': 'United Kingdom', 'unites': ['Northern Ireland']}),

    # --- France ---
    ('ile_de_france', {'admin1': 'France', 'regions': ['Île-de-France', 'Centre-Val de Loire']}),
    ('normandie', {'admin1': 'France', 'regions': ['Normandie', 'Hauts-de-France']}),
    ('bretagne', {'admin1': 'France', 'regions': ['Bretagne', 'Pays de la Loire']}),
    ('aquitaine', {'admin1': 'France', 'regions': ['Nouvelle-Aquitaine']}),
    ('languedoc', {'admin1': 'France', 'regions': ['Occitanie']}),
    ('provence', {'admin1': 'France', 'regions': ["Provence-Alpes-Côte-d'Azur", 'Corse']}),
    ('bourgogne', {'admin1': 'France', 'regions': ['Bourgogne-Franche-Comté', 'Auvergne-Rhône-Alpes']}),
    ('lorraine', {'admin1': 'France', 'regions': ['Grand Est']}),

    # --- Pays-Bas, Belgique, Suisse ---
    ('flandre', {'pays': ['Belgium', 'Luxembourg']}),
    ('hollande', {'pays': ['Netherlands']}),
    ('suisse', {'pays': ['Switzerland']}),

    # --- Allemagne ---
    ('rhenanie', {'admin1': 'Germany', 'noms': ['Rheinland-Pfalz', 'Saarland', 'Hessen']}),
    ('westphalie', {'admin1': 'Germany', 'noms': ['Nordrhein-Westfalen']}),
    ('hanovre', {'admin1': 'Germany', 'noms': ['Niedersachsen', 'Bremen', 'Hamburg', 'Schleswig-Holstein']}),
    ('brandebourg', {'admin1': 'Germany', 'noms': ['Brandenburg', 'Berlin', 'Sachsen-Anhalt']}),
    ('saxe', {'admin1': 'Germany', 'noms': ['Sachsen', 'Thüringen']}),
    ('baviere', {'admin1': 'Germany', 'noms': ['Bayern']}),
    ('souabe', {'admin1': 'Germany', 'noms': ['Baden-Württemberg']}),
    ('pomeranie', {'admin1': 'Germany', 'noms': ['Mecklenburg-Vorpommern']}),

    # --- Pologne, Prusse ---
    ('pomeranie', {'admin1': 'Poland', 'noms': ['West Pomeranian', 'Pomeranian', 'Lubusz']}),
    ('silesie', {'admin1': 'Poland', 'noms': ['Lower Silesian', 'Opole', 'Silesian']}),
    ('prusse_orientale', {'admin1': 'Poland', 'noms': ['Warmian-Masurian', 'Podlachian']}),
    ('varsovie', {'pays': ['Poland']}),

    # --- Italie ---
    ('piemont', {'admin1': 'Italy', 'regions': ['Piemonte', "Valle d'Aosta", 'Liguria']}),
    ('lombardie', {'admin1': 'Italy', 'regions': ['Lombardia', 'Emilia-Romagna']}),
    ('venetie', {'admin1': 'Italy', 'regions': ['Veneto', 'Friuli-Venezia Giulia', 'Trentino-Alto Adige']}),
    ('toscane', {'admin1': 'Italy', 'regions': ['Toscana', 'Umbria', 'Marche', 'Sardegna']}),
    ('rome', {'admin1': 'Italy', 'regions': ['Lazio', 'Abruzzo']}),
    ('naples', {'admin1': 'Italy', 'regions': ['Campania', 'Molise', 'Apulia', 'Basilicata', 'Calabria']}),
    ('sicile', {'admin1': 'Italy', 'regions': ['Sicily']}),

    # --- Espagne, Portugal ---
    ('catalogne', {'admin1': 'Spain', 'regions': ['Cataluña', 'Aragón', 'Valenciana', 'Islas Baleares']}),
    ('andalousie', {'admin1': 'Spain', 'regions': ['Andalucía', 'Murcia']}),
    ('castille', {'pays': ['Spain']}),
    ('portugal', {'pays': ['Portugal']}),

    # --- Autriche, Bohême, Hongrie, Balkans ---
    ('autriche', {'pays': ['Austria']}),
    ('boheme', {'pays': ['Czechia', 'Slovakia']}),
    ('hongrie', {'pays': ['Hungary']}),
    ('illyrie', {'pays': ['Croatia', 'Slovenia', 'Bosnia and Herz.', 'Montenegro']}),
    ('serbie', {'pays': ['Serbia', 'Kosovo']}),
    ('roumelie', {'pays': ['Bulgaria', 'North Macedonia', 'Albania']}),
    ('grece', {'pays': ['Greece', 'Cyprus']}),
    ('valachie', {'pays': ['Romania', 'Moldova']}),

    # --- Scandinavie ---
    ('danemark', {'pays': ['Denmark']}),
    ('norvege', {'pays': ['Norway']}),
    ('suede', {'pays': ['Sweden']}),
    ('finlande', {'pays': ['Finland']}),

    # --- Empire russe ---
    ('livonie', {'pays': ['Latvia', 'Estonia']}),
    ('lituanie', {'pays': ['Lithuania', 'Belarus']}),
    ('galicie', {'admin1': 'Ukraine', 'noms': ["L'viv", 'Ivano-Frankivs\'k', "Ternopil'", 'Volyn', 'Rivne',
                                               "Khmel'nyts'kyy", 'Chernivtsi', 'Transcarpathia']}),
    ('crimee', {'admin1': 'Russia', 'noms': ['Crimea', 'Sevastopol']}),
    ('ukraine', {'pays': ['Ukraine']}),

    # --- Empire ottoman et Levant ---
    ('constantinople', {'admin1': 'Turkey', 'noms': ['Istanbul', 'Edirne', 'Kirklareli', 'Tekirdag',
                                                     'Çanakkale', 'Bursa', 'Kocaeli', 'Yalova', 'Sakarya',
                                                     'Balikesir']}),
    ('anatolie', {'pays': ['Turkey']}),
    ('levant', {'pays': ['Syria', 'Lebanon', 'Israel', 'Palestine', 'Jordan', 'Iraq']}),
    ('arabie', {'pays': ['Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain']}),
    ('egypte', {'pays': ['Egypt', 'Sudan', 'S. Sudan']}),
    ('maghreb', {'pays': ['Algeria', 'Tunisia', 'Libya', 'Morocco', 'W. Sahara']}),

    # --- Asie ---
    ('perse', {'pays': ['Iran', 'Afghanistan']}),
    ('asie_centrale', {'pays': ['Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Tajikistan', 'Kyrgyzstan']}),
    ('inde', {'pays': ['India', 'Pakistan', 'Nepal', 'Bhutan', 'Sri Lanka']}),
    ('bengale', {'pays': ['Bangladesh']}),
    ('indochine', {'pays': ['Vietnam', 'Laos', 'Cambodia', 'Thailand', 'Myanmar']}),
    ('indes_orientales', {'pays': ['Indonesia', 'Malaysia', 'Philippines', 'Brunei', 'Papua New Guinea']}),
    ('chine', {'pays': ['China', 'Mongolia', 'North Korea', 'South Korea', 'Japan', 'Taiwan']}),
    ('siberie', {'pays': ['Russia'], 'lon': (60.0, 180.0)}),

    # --- Afrique ---
    ('afrique_ouest', {'pays': ['Nigeria', 'Ghana', 'Mali', 'Senegal', 'Guinea', 'Burkina Faso', 'Niger',
                                'Benin', 'Togo', 'Sierra Leone', 'Liberia', "Côte d'Ivoire", 'Mauritania',
                                'Gambia', 'Guinea-Bissau']}),
    ('afrique_centrale', {'pays': ['Dem. Rep. Congo', 'Congo', 'Angola', 'Cameroon', 'Gabon', 'Chad',
                                   'Central African Rep.', 'Eq. Guinea', 'Zambia', 'Namibia']}),
    ('afrique_est', {'pays': ['Ethiopia', 'Kenya', 'Tanzania', 'Somalia', 'Uganda', 'Mozambique',
                              'Madagascar', 'Zimbabwe', 'Malawi', 'Rwanda', 'Burundi', 'Eritrea', 'Djibouti']}),
    ('cap', {'pays': ['South Africa', 'Botswana', 'Lesotho', 'eSwatini']}),

    # --- Amériques ---
    ('canada', {'pays': ['Canada', 'Greenland']}),
    ('etats_unis', {'pays': ['United States of America'], 'lon': (-90.0, -60.0)}),
    ('louisiane', {'pays': ['United States of America']}),
    ('mexique', {'pays': ['Mexico', 'Guatemala', 'Honduras', 'Nicaragua', 'Costa Rica', 'Panama',
                          'El Salvador', 'Belize']}),
    ('cuba', {'pays': ['Cuba', 'Haiti', 'Dominican Rep.', 'Jamaica', 'Puerto Rico', 'Trinidad and Tobago',
                       'Bahamas']}),
    ('perou', {'pays': ['Peru', 'Bolivia', 'Ecuador', 'Chile', 'Colombia', 'Venezuela']}),
    ('bresil', {'pays': ['Brazil', 'Guyana', 'Suriname']}),
    ('rio_plata', {'pays': ['Argentina', 'Uruguay', 'Paraguay']}),

    # --- Océanie ---
    ('nouvelle_hollande', {'pays': ['Australia', 'New Zealand']}),

    # --- Russie d'Europe : ce qui reste de la Russie, découpé au plus proche ---
    ('__russie__', {'pays': ['Russia']}),
]

# Provinces dont la Russie d'Europe se partage le reste, au plus proche.
RUSSIE_EUROPEENNE = ['saint_petersbourg', 'moscou', 'volga', 'oural']


# ------------------------------------------------------------------
# Rastérisation
# ------------------------------------------------------------------

def anneaux_de(geometrie):
    """Anneaux extérieurs d'une géométrie GeoJSON (les trous sont ignorés)."""
    t = geometrie['type']
    if t == 'Polygon':
        return [geometrie['coordinates'][0]]
    if t == 'MultiPolygon':
        return [poly[0] for poly in geometrie['coordinates']]
    return []


def remplir(grille, anneau, valeur, bornes_lon=None):
    """
    Remplissage par balayage de lignes d'un anneau donné en degrés.
    `bornes_lon` restreint le remplissage à une bande de longitudes — le
    découpage se fait alors cellule par cellule, et non sur le centroïde de
    l'anneau : la Russie n'a qu'un seul contour, qui partirait sinon en bloc.
    """
    pts = [((lon - LON_MIN) / PAS, (lat - LAT_MIN) / PAS) for lon, lat in anneau]
    if len(pts) < 3:
        return
    col_min, col_max = 0, COLS - 1
    if bornes_lon:
        col_min = max(col_min, int(math.floor((bornes_lon[0] - LON_MIN) / PAS)))
        col_max = min(col_max, int(math.ceil((bornes_lon[1] - LON_MIN) / PAS)))
        if col_max < col_min:
            return
    ys = [p[1] for p in pts]
    y0 = max(0, int(math.floor(min(ys))))
    y1 = min(ROWS - 1, int(math.ceil(max(ys))))
    for ligne in range(y0, y1 + 1):
        y = ligne + 0.5
        coupures = []
        for i in range(len(pts)):
            (xa, ya), (xb, yb) = pts[i], pts[(i + 1) % len(pts)]
            if (ya > y) != (yb > y):
                coupures.append(xa + (y - ya) / (yb - ya) * (xb - xa))
        coupures.sort()
        for i in range(0, len(coupures) - 1, 2):
            xd = max(col_min, int(math.ceil(coupures[i] - 0.5)))
            xf = min(col_max, int(math.floor(coupures[i + 1] - 0.5)))
            if xf < xd:
                continue
            tranche = grille[ligne, xd:xf + 1]
            tranche[tranche == 0] = valeur




# ------------------------------------------------------------------
# Contours : parcours des arêtes de frontière puis lissage
# ------------------------------------------------------------------

def tracer_contours(masque):
    """Boucles fermées délimitant les cellules vraies d'un masque booléen."""
    aretes = {}
    lignes, colonnes = np.nonzero(masque)
    for ligne, col in zip(lignes.tolist(), colonnes.tolist()):
        haut = ligne + 1 >= ROWS or not masque[ligne + 1, col]
        bas = ligne == 0 or not masque[ligne - 1, col]
        gauche = col == 0 or not masque[ligne, col - 1]
        droite = col + 1 >= COLS or not masque[ligne, col + 1]
        # Sens direct : chaque arête est orientée pour que l'intérieur soit à gauche.
        if bas:
            aretes.setdefault((col, ligne), []).append((col + 1, ligne))
        if droite:
            aretes.setdefault((col + 1, ligne), []).append((col + 1, ligne + 1))
        if haut:
            aretes.setdefault((col + 1, ligne + 1), []).append((col, ligne + 1))
        if gauche:
            aretes.setdefault((col, ligne + 1), []).append((col, ligne))

    boucles = []
    while aretes:
        depart = next(iter(aretes))
        boucle = [depart]
        courant = depart
        while True:
            suivants = aretes.get(courant)
            if not suivants:
                break
            suivant = suivants.pop()
            if not suivants:
                del aretes[courant]
            boucle.append(suivant)
            courant = suivant
            if courant == depart:
                break
        if len(boucle) > 4:
            boucles.append(boucle[:-1])
    return boucles


def chaikin(points, passes=PASSES_CHAIKIN):
    """Adoucit une ligne fermée en coupant les angles (Chaikin)."""
    for _ in range(passes):
        sortie = []
        n = len(points)
        for i in range(n):
            xa, ya = points[i]
            xb, yb = points[(i + 1) % n]
            sortie.append((xa * 0.75 + xb * 0.25, ya * 0.75 + yb * 0.25))
            sortie.append((xa * 0.25 + xb * 0.75, ya * 0.25 + yb * 0.75))
        points = sortie
    return points


def simplifier(points, epsilon):
    """Douglas–Peucker sur une ligne fermée."""
    if len(points) < 4:
        return points

    def recur(debut, fin):
        pire, index = 0.0, 0
        xa, ya = points[debut]
        xb, yb = points[fin]
        dx, dy = xb - xa, yb - ya
        norme = math.hypot(dx, dy) or 1e-9
        for i in range(debut + 1, fin):
            x, y = points[i]
            d = abs(dy * x - dx * y + xb * ya - yb * xa) / norme
            if d > pire:
                pire, index = d, i
        if pire > epsilon:
            return recur(debut, index)[:-1] + recur(index, fin)
        return [points[debut], points[fin]]

    milieu = len(points) // 2
    return recur(0, milieu)[:-1] + recur(milieu, len(points) - 1)


def aire(points):
    s = 0.0
    for i in range(len(points)):
        xa, ya = points[i]
        xb, yb = points[(i + 1) % len(points)]
        s += xa * yb - xb * ya
    return abs(s) / 2


# ------------------------------------------------------------------
# Programme principal
# ------------------------------------------------------------------

def main():
    dossier = sys.argv[1] if len(sys.argv) > 1 else '.'
    sortie = sys.argv[2] if len(sys.argv) > 2 else 'js/data/frontieres.js'

    print(f'grille : {COLS} × {ROWS} cellules de {PAS}°')
    admin0 = json.load(open(f'{dossier}/ne_50m_admin_0_countries.geojson', encoding='utf-8'))
    admin1 = json.load(open(f'{dossier}/ne_10m_admin_1.geojson', encoding='utf-8'))

    par_pays = defaultdict(list)
    for f in admin0['features']:
        p = f['properties']
        for champ in ('NAME', 'ADMIN', 'name', 'admin'):
            if p.get(champ):
                par_pays[p[champ]].append(f)
                break

    par_admin1 = defaultdict(list)
    for f in admin1['features']:
        par_admin1[f['properties']['admin']].append(f)

    # Ordre des provinces : l'indice 0 est la mer.
    provinces = []
    for ident, _ in CORRESPONDANCES:
        if ident != '__russie__' and ident not in provinces:
            provinces.append(ident)
    for ident in RUSSIE_EUROPEENNE:
        if ident not in provinces:
            provinces.append(ident)
    index = {ident: i + 1 for i, ident in enumerate(provinces)}

    grille = np.zeros((ROWS, COLS), dtype=np.int16)
    introuvables = []

    for ident, sel in CORRESPONDANCES:
        valeur = index.get(ident, -1)
        features = []
        if 'pays' in sel:
            for nom in sel['pays']:
                if nom in par_pays:
                    features += par_pays[nom]
                else:
                    introuvables.append(f'pays « {nom} » ({ident})')
        if 'admin1' in sel:
            candidats = par_admin1.get(sel['admin1'], [])
            if not candidats:
                introuvables.append(f'admin1 « {sel["admin1"]} » ({ident})')
            for f in candidats:
                p = f['properties']
                if 'regions' in sel and p.get('region') in sel['regions']:
                    features.append(f)
                elif 'noms' in sel and p.get('name') in sel['noms']:
                    features.append(f)
                elif 'unites' in sel and p.get('geonunit') in sel['unites']:
                    features.append(f)
        bornes = sel.get('lon')
        for f in features:
            for anneau in anneaux_de(f['geometry']):
                # -1 : marqueur des terres à répartir au plus proche.
                remplir(grille, anneau, -1 if ident == '__russie__' else valeur, bornes)

    if introuvables:
        print('entités introuvables :')
        for m in sorted(set(introuvables)):
            print('   ', m)

    # Terres non revendiquées (y compris la Russie d'Europe) : à la province
    # dont la capitale est la plus proche. On sème d'abord les capitales.
    seeds = json.load(open('outils/capitales.json', encoding='utf-8'))
    reste = np.argwhere(grille == -1)
    if len(reste):
        cibles = [(ident, seeds[ident]) for ident in RUSSIE_EUROPEENNE + ['siberie'] if ident in seeds]
        for ligne, col in reste:
            lon = LON_MIN + (col + 0.5) * PAS
            lat = LAT_MIN + (ligne + 0.5) * PAS
            meilleur, distance = None, 1e18
            for ident, (slon, slat) in cibles:
                d = (lon - slon) ** 2 + ((lat - slat) * 1.6) ** 2
                if d < distance:
                    distance, meilleur = d, ident
            grille[ligne, col] = index[meilleur]

    occupees = int((grille > 0).sum())
    print(f'cellules terrestres attribuées : {occupees}')

    # Adjacence réelle : deux provinces voisines partagent une lisière.
    voisins = defaultdict(set)
    a = grille[:, :-1]
    b = grille[:, 1:]
    for x, y in zip(a[(a > 0) & (b > 0) & (a != b)].tolist(), b[(a > 0) & (b > 0) & (a != b)].tolist()):
        voisins[x].add(y)
        voisins[y].add(x)
    a = grille[:-1, :]
    b = grille[1:, :]
    for x, y in zip(a[(a > 0) & (b > 0) & (a != b)].tolist(), b[(a > 0) & (b > 0) & (a != b)].tolist()):
        voisins[x].add(y)
        voisins[y].add(x)

    # Contours.
    resultat = {}
    total_points = 0
    for ident in provinces:
        v = index[ident]
        masque = grille == v
        if not masque.any():
            print(f'  ⚠ aucune terre pour « {ident} »')
            continue
        anneaux = []
        for boucle in tracer_contours(masque):
            if aire(boucle) < AIRE_MINIMALE_ANNEAU:
                continue
            lisse = simplifier(chaikin(boucle), EPSILON_SIMPLIFICATION / PAS)
            if len(lisse) < 4:
                continue
            anneaux.append([[round(LON_MIN + x * PAS, 2), round(LAT_MIN + y * PAS, 2)] for x, y in lisse])
        anneaux.sort(key=lambda r: -aire(r))
        anneaux = anneaux[:6]      # au-delà, ce sont des îlots invisibles
        total_points += sum(len(r) for r in anneaux)
        resultat[ident] = {
            'anneaux': anneaux,
            'voisins': sorted(provinces[j - 1] for j in voisins[v]),
        }

    print(f'provinces dessinées : {len(resultat)} — {total_points} points au total')

    with open(sortie, 'w', encoding='utf-8') as f:
        f.write('/* ============================================================\n')
        f.write('   frontieres.js — GÉNÉRÉ, ne pas modifier à la main\n')
        f.write('   ------------------------------------------------------------\n')
        f.write('   Contours réels des provinces, lissés et simplifiés, avec leur\n')
        f.write('   adjacence terrestre. Produit par outils/frontieres.py à partir\n')
        f.write('   de Natural Earth (admin_0 50m et admin_1 10m).\n')
        f.write('   ============================================================ */\n\n')
        f.write('export const FRONTIERES = ')
        json.dump(resultat, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print(f'écrit : {sortie}')


if __name__ == '__main__':
    main()
