# Mode A — Monde virtuel réaliste

## 1. Intention

Un monde **original**, au rendu réaliste (pas « cartoon »), qui donne envie de rouler : relief crédible, routes cohérentes, végétation dense, lumière soignée. Il ne reproduit aucun monde d'un jeu existant.

## 2. Approche retenue : relief réel + habillage procédural

Voir [ADR 0006](adr/0006-monde-virtuel-relief-reel.md).

Modéliser un monde à la main coûte très cher, et le budget est nul : **uniquement des assets gratuits** (CC0 en priorité : Poly Haven, ambientCG, Quaternius ; CC-BY avec attribution) ou créés soi-même. On part donc d'un **relief réel** (modèle numérique de terrain), choisi pour sa variété (côte, vallée, col), et on l'habille de façon **procédurale** puis retouchée à la main. Le monde porte un nom fictif. Ce pipeline sert aussi de base au mode B.

```
MNT réel (GeoTIFF) ──▶ découpe + reprojection (GDAL) ──▶ heightmap 16 bits par chunk (1×1 km)
OSM (routes, eau, forêts, champs) ──▶ masques d'occupation du sol ──▶ splatmap (textures) + zones de végétation
Tracé des routes du jeu (splines éditées) ──▶ maillage de route + aplanissement du terrain le long de la route
Assets (arbres, rochers, bâtiments, barrières) ──▶ placement procédural par règles (pente, altitude, distance à la route)
                                                 └──▶ export : chunks glTF + JSON de placement (instances)
```

### Candidats de relief (à choisir, voir [questions ouvertes](13-questions-ouvertes.md))

| Option | Intérêt |
|---|---|
| Massif alpin ou pyrénéen (zone de 10 × 10 km) | Vrais cols, grands paysages |
| Côte méditerranéenne vallonnée | Plat, bosses et mer ; ambiance estivale |
| Île fictive composée de plusieurs reliefs réels assemblés | Variété maximale, liberté créative ; plus de travail de raccord |

Sources de MNT : **Copernicus GLO-30** (monde, 30 m, licence libre avec attribution), **IGN RGE ALTI** (France, 1–5 m, Licence Ouverte), SRTM (domaine public, 30 m). La résolution de 30 m est insuffisante près de la route : le terrain est rééchantillonné et lissé, avec du bruit de détail procédural.

## 3. Routes : uniquement des boucles

**Règle produit** : toutes les routes du monde virtuel sont des **boucles fermées**. À la fin d'un tour, le coureur repart automatiquement pour un nouveau tour, sans arrêt, sans écran intermédiaire et sans rechargement. Les séances longues se font donc d'une seule traite. Voir [ADR 0009](adr/0009-boucles-uniquement.md).

Contraintes de conception d'une boucle :

- **Spline fermée** et continue en position, en tangente (cap) et en altitude au point de raccord : aucun saut visible ni à-coup de pente au passage de la ligne.
- **Dénivelé net nul** sur un tour (D+ = D−) ; le profil est lissé de part et d'autre de la ligne comme partout ailleurs (lissage circulaire).
- Ligne de départ/arrivée matérialisée dans le décor (arche, marquage au sol), placée de préférence sur une portion plate et droite.
- Longueur de tour variée selon la boucle (de ~5 à ~30 km) : une petite boucle sert aux séances d'intervalles, une grande à la variété du paysage.
- Les chunks traversés sont tous connus : le streaming précharge la boucle entière en cache après le premier tour, pour que les tours suivants ne téléchargent plus rien.

Technique :

- Chaque route est une **spline 3D** (Catmull-Rom ou Bézier) éditée dans un outil interne (`tools/world-builder`) ou dans Blender.
- Le terrain est **aplani et raccordé** le long de la route (largeur de chaussée + accotements), avec des pentes de route limitées et réalistes.
- La spline est exportée au **format de route interne** ([07](07-donnees-et-api.md)), échantillonnée tous les 5 m : distance, position, altitude, pente, cap. La physique et le HUD n'utilisent que ce format.
- La distance le long de la boucle est `distanceTotale mod longueurTour` ; la distance totale de la sortie continue de croître pour l'enregistrement.
- Jonctions entre boucles (plus tard, US-16) : plusieurs boucles peuvent partager des tronçons. Un graphe de routes (nœuds = jonctions) permettra de basculer d'une boucle à l'autre sans s'arrêter. Le MVP propose des boucles indépendantes, choisies avant le départ.
- Largeur jouable : la position latérale du coureur (pour le multijoueur et le drafting) est un décalage par rapport à l'axe de la route.

### Boucles du monde v1 (MVP)

| Boucle | Longueur du tour | D+ par tour | Profil |
|---|---|---|---|
| Boucle du lac (plate) | ~12 km | < 80 m | Échauffement, récupération, intervalles réguliers |
| Boucle des collines (vallonnée) | ~20 km | ~300 m | Bosses de 1 à 2 km |
| Boucle du col (montagne) | ~30 km | ~700 m | Montée de ~10 km à 6–8 % (passages à 10 %), descente par un autre versant, retour par la vallée |

## 4. Rendu

| Élément | Technique |
|---|---|
| Terrain | Chunks de 1 × 1 km, LOD par distance (géométrie en grille + morphing ou CDLOD), texturage par splatmap (herbe, roche, terre, neige) avec textures PBR CC0 (Poly Haven, ambientCG) |
| Végétation | `InstancedMesh` ou `BatchedMesh` ; 2 à 3 LOD par espèce ; imposteurs (billboards) au loin ; densité selon la qualité graphique |
| Herbe | Instanciation près de la caméra seulement (rayon ~50 m) avec animation de vent en shader |
| Ciel et lumière | Modèle de ciel physique (atmosphère), soleil directionnel, cascaded shadow maps limitées à ~200 m, éclairage d'ambiance par environment map |
| Eau | Shader d'eau (réflexion plane ou SSR selon la qualité) |
| Brume | Brouillard de distance + perspective atmosphérique pour masquer la fin du terrain |
| Post-traitement | Tonemapping ACES ou AgX, bloom léger, SMAA ; profondeur de champ désactivée par défaut |
| Renderer | `WebGPURenderer` de Three.js avec repli WebGL2 automatique |

### Budgets de performance (config de référence, qualité « moyenne », 1080p)

| Indicateur | Budget |
|---|---|
| FPS | ≥ 60 visé, ≥ 30 garanti |
| Draw calls | < 300 |
| Triangles visibles | < 2 M |
| Mémoire GPU | < 1,5 Go |
| Téléchargement initial du monde | < 80 Mo (compressé), puis streaming |
| Taille d'un chunk | < 3 Mo |

Ajustement automatique de qualité : si le FPS moyen reste sous 45 pendant 10 s, on baisse la densité de végétation, la distance des ombres et la résolution de rendu (scaling dynamique).

## 5. Streaming et chargement

- Chargement des chunks dans un rayon autour du coureur, avec pré-chargement **dans le sens de la route** (on connaît le trajet à l'avance).
- Décodage glTF, Meshopt et KTX2 dans des workers.
- Cache HTTP + Cache Storage (PWA) pour que les sessions suivantes soient instantanées.
- Écran de chargement avec progression ; la sortie peut démarrer avant la fin du chargement des chunks lointains.

## 6. Avatar et vélo

- Modèle de cycliste riggé (glTF) et vélo séparé ; 2 à 3 tenues et couleurs personnalisables (phase 2+).
- **Pédalage procédural** : la rotation des manivelles est pilotée par la cadence ; les jambes suivent par IK à deux os (hanche → genou → pied sur la pédale). Les bibliothèques d'animations courantes ont peu de cycles de pédalage exploitables : l'IK est plus robuste et suit exactement la cadence.
- Animations secondaires : danseuse quand la puissance dépasse un seuil en montée, position aéro en descente, roue libre (manivelles immobiles) à cadence nulle.
- Roues tournant à la vitesse virtuelle.
- Source des modèles (budget zéro, donc **aucun achat**) : corps humain généré avec **MakeHuman** (modèles exportés sous CC0), riggé dans Blender (ou via Mixamo, gratuit) ; vélo modélisé sous Blender ou issu d'un modèle gratuit sous licence CC0/CC-BY (Sketchfab, Poly Pizza…), licence tracée. Voir [risques](12-risques.md).

## 7. Caméras

| Vue | Description |
|---|---|
| Poursuite (défaut) | Derrière et au-dessus, amortie (spring), anticipe les virages via la spline |
| Première personne | Hauteur des yeux, léger balancement |
| Latérale | Plan de côté, utile en montée |
| Drone | Haute, lente, cinématique |

## 8. Ambiance

- Heure du jour réglable ; cycle jour/nuit et météo en phase 5.
- Sons : vent proportionnel à la vitesse, roue libre, chaîne, ambiance (oiseaux, ruisseau), foule sur les sommets plus tard.
- Éléments vivants (phase 2+) : autres cyclistes (bots), animaux, voitures garées, banderoles de segments.

## 9. Outil de construction (`tools/world-builder`)

Scripts reproductibles (CI possible) :

1. `fetch-dem` : télécharge et découpe le MNT de la zone.
2. `fetch-osm` : extrait routes, eaux, forêts et bâtiments de la zone.
3. `build-terrain` : heightmaps par chunk, aplanissement le long des routes, splatmaps.
4. `place-vegetation` : génération des instances (graine aléatoire fixe → résultat déterministe).
5. `build-routes` : splines → format de route interne + profils.
6. `pack` : compression glTF, KTX2 et manifeste du monde (`world.json`).

Prévisualisation : page de dev « caméra libre » dans l'application pour inspecter le monde.
