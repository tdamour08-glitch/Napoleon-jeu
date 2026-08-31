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
| Déplacer la carte | glisser à la souris, flèches, ou ZQSD/WASD |
| Zoom | molette |
| Pause / reprise | `Espace` ou le bouton `II` |
| Vitesse x1 / x2 / x4 | `1`, `2`, `3` ou les boutons du bandeau |
| Recentrer sur sa capitale | `C` |
| Sélectionner une province | clic |
| Désélectionner | `Échap` |

## Feuille de route

- [x] **Phase 1 — Fondations** : carte du monde, provinces, caméra, temps réel avec
      pause, choix de l'empire, panneaux d'information.
- [ ] **Phase 2 — Économie** : production et consommation de bois, eau, charbon,
      fer et or ; bâtiments et entretien.
- [ ] **Phase 3 — Armées** : levée de troupes, déplacements en temps réel, batailles,
      jauge de motivation qui monte avec les victoires.
- [ ] **Phase 4 — Intelligence artificielle** : les puissances non jouées cherchent
      à l'emporter, s'étendent et se coalisent.
- [ ] **Phase 5 — Diplomatie et victoire** : alliances, occupation puis annexion par
      traité de paix ou élimination totale, reddition.
- [ ] **Phase 6 — Finitions** : équilibrage, sauvegarde, aide en jeu.

## Architecture

```
index.html            page et ossature de l'interface
css/style.css         thème Empire
js/data/monde.js      contours des continents + une capitale par province
js/data/empires.js    puissances, couleurs, doctrines
js/map/geo.js         projection de Mercator et géométrie des polygones
js/map/carte.js       frontières calculées (Voronoï découpé par la côte)
js/core/etat.js       état de la partie, calendrier, production
js/core/moteur.js     boucle temps réel avec pause et vitesses
js/render/camera.js   déplacement et zoom
js/render/rendu.js    dessin sur canvas 2D
js/ui/menu.js         écran de sélection d'empire
js/ui/interface.js    bandeau, panneaux, journal
js/main.js            assemblage et contrôles
```

### Comment la carte est construite

Dessiner à la main 84 provinces jointives serait fastidieux et source de trous.
À la place, `js/data/monde.js` ne décrit que **la ligne de côte de chaque continent**
et **un point par province** (sa capitale). `js/map/carte.js` calcule ensuite le
diagramme de Voronoï de ces points, découpé par la côte : les frontières sont
exactes et jointives, et l'adjacence entre provinces se déduit des arêtes
partagées. Les détroits et routes maritimes sont ajoutés à la main
(`LIAISONS_MARITIMES`).

Ajouter une province tient donc en une ligne de données.
