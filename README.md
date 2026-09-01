# Les Aigles — grande stratégie napoléonienne

Jeu de stratégie **temps réel avec pause**, en 2D, sur une carte du monde.
Aucune dépendance, aucun outil de compilation : du HTML, du CSS et du JavaScript.

## Lancer le jeu

Le jeu utilise les modules ES : il doit être servi par un serveur HTTP
(l'ouvrir directement depuis le disque avec `file://` est bloqué par le navigateur).

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Commandes

| Action | Commande |
|---|---|
| Déplacer la carte | glisser à la souris, ou les flèches |
| Zoom | molette |
| Pause / reprise | `Espace` ou le bouton `II` |
| Vitesse x1 / x2 / x4 | `1`, `2`, `3` ou les boutons du bandeau |
| Recentrer sur sa capitale | `C` |
| Sélectionner une province | clic |
| Désélectionner | `Échap` |
| Sélectionner un corps d'armée | clic sur son pion |
| Ordre de marche | **clic droit** sur une province |
| Détacher la moitié d'un corps | **Maj + clic droit** |
| Trésor et marché | `E` ou le bouton **Économie** |
| Cabinet diplomatique | `D` ou le bouton **Diplomatie** |
| Guide « comment jouer » | `H` ou le bouton **Guide** |

Le guide s'ouvre au premier lancement et met le jeu en pause. Une case à cocher
permet de ne plus l'afficher au démarrage&nbsp;; il reste accessible par `H`.

## Feuille de route

- [x] **Phase 1 — Fondations** : carte du monde, provinces, caméra, temps réel avec
      pause, choix de l'empire, panneaux d'information.
- [x] **Phase 2 — Économie** : production et entretien des cinq ressources,
      chantiers de développement, marché, pénuries, moral des provinces,
      et un guide de jeu intégré.
- [x] **Phase 3 — Armées** : levée de troupes, marches en temps réel, batailles,
      jauge de motivation, occupation militaire, déclarations de guerre.
- [x] **Phase 4 — Intelligence artificielle** : les cabinets rivaux évaluent le
      rapport de forces, dévorent les voisins faibles, nouent des alliances,
      se liguent contre l'hégémon et savent demander un armistice.
- [x] **Phase 5 — Traités et victoire** : négociations qui cèdent les provinces
      occupées, annexion, reddition, élimination, conditions de victoire.
- [x] **Phase 6 — Vraies frontières et gouvernement** : carte tracée sur les
      frontières réelles, réglages de partie (dont les doctrines égales),
      croissance de la population par choix sociaux, budget et dette publique.

## Architecture

```
index.html            page et ossature de l'interface
css/style.css         thème Empire
js/data/monde.js      provinces : nom, capitale, terrain, gisements, souverain
js/data/frontieres.js contours réels (généré par outils/frontieres.py)
js/data/empires.js    puissances, couleurs, doctrines
js/map/geo.js         projection de Mercator et géométrie des polygones
js/map/carte.js       frontières calculées (Voronoï découpé par la côte)
js/core/etat.js       état de la partie, calendrier, journal
js/core/economie.js   production, entretien, chantiers, marché
js/core/armees.js     levées, marches, entretien, motivation
js/core/combat.js     batailles, déroutes, occupation, insurrections
js/core/diplomatie.js paix et guerre
js/core/ia_militaire.js conduite des armées non jouées
js/core/ia_strategie.js décisions des cabinets : alliances, guerres, paix
js/core/traites.js    traités, annexion, reddition, élimination, victoire
js/core/politiques.js choix sociaux, impôt, dette, croissance de la population
outils/frontieres.py  fabrique js/data/frontieres.js depuis Natural Earth
js/ui/traite.js       table des négociations
js/core/tour.js       ordre des systèmes dans une journée
js/data/langue.js     articles et élisions (« aux États-Unis », « d'Île-de-France »)
js/core/moteur.js     boucle temps réel avec pause et vitesses
js/render/camera.js   déplacement et zoom
js/render/rendu.js    dessin sur canvas 2D
js/ui/menu.js         écran de sélection d'empire
js/ui/interface.js    bandeau, panneaux, marché, journal
js/ui/guide.js        fenêtre « comment jouer »
js/main.js            assemblage et contrôles
```

### Comment la carte est construite

Les frontières sont **réelles**. `outils/frontieres.py` fait correspondre chaque
province du jeu à de véritables entités administratives — pays, régions
françaises, Länder allemands, régions italiennes, voïvodies polonaises — tirées de
[Natural Earth](https://github.com/nvkelso/natural-earth-vector), les rastérise sur
une grille de 0,15° (environ 17 km), attribue les terres non revendiquées à la
province dont la capitale est la plus proche, puis retrace les contours obtenus, les
lisse (Chaikin) et les simplifie (Douglas–Peucker).

Le résultat est écrit dans `js/data/frontieres.js` : 84 provinces, 13 600 points,
200 Ko. L'**adjacence** en sort aussi, déduite du voisinage réel des cellules — la
Bavière touche l'Autriche, la Bohême, la Rhénanie, la Saxe et la Souabe, ni plus ni
moins. Seuls les détroits et les routes maritimes restent déclarés à la main
(`LIAISONS_MARITIMES`).

Le script se relance ainsi, après avoir téléchargé les deux fichiers cités dans son
en-tête :

```bash
python3 outils/frontieres.py <dossier_geojson> js/data/frontieres.js
```

Ajouter une province tient en une ligne dans `monde.js` et une entrée dans la table
de correspondance du script.

### Comment tourne l'économie

Chaque jour, chaque province produit selon ses **gisements** (0 à 3 par ressource),
sa population, l'affinité de son terrain et son **développement** (0 à 3). En regard,
elle consomme de l'eau et du bois pour ses habitants, de l'or pour son administration,
du charbon et du fer pour ses ateliers. L'or vient surtout de l'impôt, donc de la
population, ce qui rend la conquête payante.

Un **chantier** fait monter le développement d'un cran&nbsp;: il se paie d'avance en
bois, fer et or, puis dure de 60 à 140 jours. Il augmente la production et le moral,
mais alourdit durablement l'entretien&nbsp;— développer sans compter mène à la pénurie.

Une **pénurie** (stock à zéro et solde négatif) fait chuter le moral des provinces,
arrête les chantiers faute de solde à payer les ouvriers, et ralentit les ateliers.
Le **marché** permet d'y remédier en échangeant n'importe quelle ressource contre de
l'or par lots de 50, les marchands prenant 15&nbsp;% de marge dans les deux sens.

Le **moral** d'une province glisse vers une valeur d'équilibre fixée par son
développement, son éloignement et les pénuries de l'empire. Une population démoralisée
produit jusqu'à 40&nbsp;% de moins. C'est le moral *civil*&nbsp;; la motivation des
*troupes*, qui monte avec les victoires, viendra en phase 3.

Les puissances non jouées gèrent déjà leur économie sommairement (elles vendent leurs
surplus, achètent ce qui leur manque et développent leurs meilleures provinces). Leur
véritable intelligence — expansion, guerres, alliances — arrive en phase 4.

### Comment se fait la guerre

Une **levée** puise dans les réserves d'hommes d'un empire (plafonnées par sa
population), coûte or, fer et bois, et rassemble en vingt jours un corps de
10&nbsp;000&nbsp;hommes. Les corps amis se regroupent en arrivant dans la même province,
jusqu'à 60&nbsp;000&nbsp;hommes&nbsp;: au-delà ils restent distincts, faute de quoi chaque
puissance finirait par ne manœuvrer qu'une seule masse.

Une armée marche d'une province à l'autre par le plus court chemin en jours
(Dijkstra sur le graphe des provinces). Une traversée maritime prend trois fois plus
longtemps qu'une étape terrestre et coûte dix points de motivation au débarquement —
sans marine dédiée, c'est ce qui empêche les descentes amphibies d'être gratuites.

Deux puissances en guerre présentes dans la même province se battent chaque jour. Les
pertes suivent le rapport des puissances&nbsp;; la puissance d'un corps combine son
effectif, sa **motivation**, le bonus défensif du terrain et sa **doctrine**. Le camp
qui souffre le moins gagne de la motivation, l'autre en perd&nbsp;; sous 22, un corps
rompt le combat et se replie sur une province voisine.

Une province tenue douze jours sans opposition passe sous **occupation** : elle rapporte
moitié moins, paie mal l'impôt et ne fournit plus de recrues. Elle reste propriété de son
souverain de droit — l'**annexion** demandera un traité (phase 5). Une occupation sans
garnison ni corps à portée se **soulève** au bout de trente jours et revient à son
souverain, ce qui interdit les empires fantômes tenus par cinq mille hommes.

Chaque puissance porte une **doctrine** — élan au combat, ténacité sous le feu, gain de
motivation après une victoire, discipline défensive, vitesse de marche. Ces valeurs ne
sont affichées nulle part et ne le seront pas&nbsp;: elles se lisent aux résultats. Les
troupes napoléoniennes ont, de ce fait, un avantage que le joueur doit deviner.

### Comment décident les cabinets rivaux

Tous les quinze jours, chaque puissance non jouée évalue le rapport de forces — terres,
population, développement, armées, trésor — puis révise l'**opinion** qu'elle porte à
chacune des autres, de −100 à +100. Cette opinion tient compte du voisinage, des ennemis
communs, des provinces occupées, et surtout de l'**hégémonie**.

Une puissance fait figure d'hégémon lorsqu'elle dépasse la deuxième de moitié. Un seuil
en part du total ne conviendrait pas&nbsp;: avec vingt-six puissances, celle qui domine
l'Europe ne pèse jamais qu'un sixième du monde. Dès qu'un hégémon se détache, ceux qu'il
menace le détestent et se rapprochent entre eux — c'est ainsi que naissent les
**coalitions**, y compris contre le joueur.

Sur cette base, chaque cabinet choisit&nbsp;:

- **la guerre**, contre un voisin nettement plus faible ou franchement détesté, à
  condition d'avoir l'avantage. Contre l'hégémon, il accepte un risque qu'il ne prendrait
  pas ailleurs, et compte comme renfort ceux qui le combattent déjà&nbsp;;
- **l'alliance**, avec un voisin ou un compagnon d'armes de confiance, jamais avec qui
  traîne plus de guerres qu'on n'en peut porter&nbsp;;
- **l'armistice**, quand la guerre dure depuis deux cents jours et que la lassitude —
  armées fondues, caisses vides, provinces perdues — l'emporte, l'adversaire étant lui
  aussi à bout ou déjà satisfait de ses gains.

Un allié entrant en guerre appelle les siens, mais seuls répondent ceux que la querelle
concerne, c'est-à-dire ceux qui touchent l'un des belligérants. Sans cette réserve, une
escarmouche entre deux principautés allemandes mettait la Perse en guerre contre les
États-Unis.

Les propositions faites au joueur arrivent dans son **cabinet diplomatique** (`D`), qui
sert aussi à proposer, rompre et déclarer.

### Comment se gagne une partie

L'occupation militaire ne change rien au droit. Pour qu'une province devienne vôtre, il
faut un **traité**. La table des négociations laisse composer ses conditions — provinces
annexées, provinces rendues, tribut — et affiche à chaque clause ce que le cabinet adverse
est prêt à avaler. Sa tolérance dépend de sa lassitude, de ce qu'il a déjà perdu sur le
terrain et du nombre de ses ennemis. Ce qui n'est pas annexé est évacué&nbsp;: la paix rend
le terrain.

Une puissance sans terre ni armée **capitule** sans condition&nbsp;; celle qui perd sa
dernière province de droit **disparaît**. Trois chemins mènent à la victoire&nbsp;:

- **les traités** — avoir arraché des provinces à chacune des six autres grandes
  puissances, et n'être plus en guerre avec aucune&nbsp;;
- **l'hégémonie** — posséder en droit 45&nbsp;% des provinces d'Europe&nbsp;;
- **l'élimination** — ne laisser à aucune rivale la moindre province.

Le seuil d'hégémonie a été fixé sur mesure&nbsp;: en partie simulée, les vainqueurs
culminent entre 28 et 40&nbsp;% avant que la voie des traités ne l'emporte. Au-dessus de
45&nbsp;%, la condition ne se déclencherait jamais.

### Le gouvernement : budget, impôt et choix sociaux

Le **budget** se lit en or et par jour. Recettes : l'impôt, qui vient des sujets, et
les mines et le commerce. Dépenses : l'administration des provinces, la solde des
armées, les politiques décrétées et les intérêts de la dette. Le taux d'imposition se
règle de 40 à 160&nbsp;%&nbsp;: presser le contribuable rapporte et coûte du moral,
l'alléger fait l'inverse.

Un déficit ne ruine pas l'État sur-le-champ&nbsp;: il **emprunte**, à 7&nbsp;% l'an,
tant que la dette reste sous huit dixièmes des recettes annuelles. Au-delà, les
banquiers ferment leurs guichets, la solde n'est plus versée et les armées fondent.

Cinq **choix sociaux** se décrètent, chacun payé chaque jour au prorata de la
population : hospices et hygiène, écoles et académies, grands travaux, conscription
générale, abolition des privilèges. Ils jouent sur la natalité, le moral, les réserves
d'hommes, la vitesse des chantiers et le rendement de l'impôt.

La **population** d'une province est un nombre continu, exprimé en millions. Elle
croît quand le moral est bon, recule sous la disette et l'occupation, et bute sur un
plafond valant 2 plus le développement — que les choix sociaux relèvent ou abaissent.
Mesuré sur vingt ans dans une province de développement 2 au moral 65&nbsp;: 2,0 → 4,0
sans politique, 5,0 avec hospices et abolition, 3,7 sous conscription.

### Régler la partie

Le menu propose trois réglages, sous **Règles de la partie**&nbsp;:

- **Doctrines égales** — toutes les puissances reçoivent la même doctrine. L'élan des
  troupes napoléoniennes, la ténacité russe et la discipline prussienne disparaissent :
  deux corps de même effectif se battent alors à égalité stricte.
- **Forces égales** — chaque grande puissance débute avec le même effectif total.
- **Ardeur des cabinets rivaux** — prudente, normale ou implacable : à quelle fréquence
  les puissances non jouées déclarent la guerre.

### La France est-elle jouable ?

Question légitime, puisque toute l'Europe se ligue contre elle. Mesuré sur des parties
simulées de vingt-cinq ans, toutes puissances pilotées&nbsp;:

- la France atteint le **pic de possession européenne le plus élevé** (23,2&nbsp;% en
  moyenne, à égalité avec l'Autriche et devant les cinq autres)&nbsp;;
- elle **gagne effectivement** certaines parties, par la voie des traités&nbsp;;
- le seul geste qu'un joueur fait et que l'intelligence artificielle néglige — signer un
  traité dès que l'adversaire plie, au lieu de laisser la guerre s'enliser — fait passer
  son pic de 23&nbsp;% à 25-32&nbsp;%.

C'est le siège le plus difficile, parce qu'elle est désignée hégémon dès la première
année et absorbe la première coalition. Ce n'est pas un handicap de règles.
