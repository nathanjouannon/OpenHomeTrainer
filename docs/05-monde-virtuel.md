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

Monde v1 : **Val de Vérane** (nom fictif), zone de **10 × 10 km** sur un relief réel des Préalpes (sud d'un lac, plaine et col ; centre 45,80° N, 6,235° E). Design : `content/worlds/world-1/world.json`, construit par `pnpm build-world`.

Les tracés sont produits par un **planificateur de routes** (`tools/world-builder/src/road-planner.ts`) : plus court chemin A* sur le relief, avec une pénalité au-dessus d'une pente cible, ce qui crée automatiquement des lacets ; seuls quelques points de passage sont donnés à la main.

| Boucle | Visé | Obtenu (tour) | Profil |
|---|---|---|---|
| Boucle du lac (plate) | ~12 km, < 80 m | **9,2 km, 80 m**, pente max 5 % | Échauffement, récupération, intervalles réguliers |
| Boucle des collines (vallonnée) | ~20 km, ~300 m | **17,7 km, 378 m**, pente max 9 % | Bosses, la plus longue : 3,3 km à 7,6 % |
| Boucle du col (montagne) | ~30 km, ~700 m | **26,5 km, 865 m**, pente max 10 % | Montée de 7,5 km à 8,9 % par la vallée, descente en lacets vers le lac, retour par la rive |

## 4. Rendu

Mise en œuvre : phase 2 « Rendu réaliste » de la [roadmap](ROADMAP.md).

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

### Ce qui est en place (phase 2)

- **Lumière et ombres** (lot 2.2, `apps/web/src/world/Lighting.tsx`) : soleil directionnel avec ombres portées en cascade (`CSMShadowNode`, 3 cascades ; 160 m en qualité moyenne avec des cartes de 1024², 200 m en haute avec 2048², rien en basse). Le terrain reçoit les ombres sans en projeter. Pour tenir le budget de draw calls, le cycliste projette son ombre par une silhouette fusionnée (une seule géométrie vue des seules caméras d'ombre, plus les jambes animées), et les objets instanciés sur tout le monde (arbres, lampadaires, balises, voitures garées) ne projettent leur ombre qu'à moins de ~220 m de la caméra, via des copies « ombre seulement » rafraîchies toutes les 0,4 s (`NearShadows.tsx`), avec une silhouette simplifiée pour les arbres. Sans cela, chaque cascade redessinerait toutes les instances d'un objet dont la sphère englobante couvre le monde. Lumière d'ambiance et reflets : HDRI CC0 (« Alps Field ») dont le disque solaire est écrêté au téléchargement (0,05 % des pixels les plus lumineux) et que l'on tourne pour que son soleil soit du côté de celui de la scène ; repli sur une lumière hémisphérique sans les assets. Tonemapping AgX, brouillard de la couleur de l'horizon. Les profils par qualité sont dans `render-profile.ts`.

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

- Modèle de cycliste riggé (glTF) et vélo séparé ; 2 à 3 tenues et couleurs personnalisables (phase 3+).
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

- Heure du jour réglable ; cycle jour/nuit et météo en phase 6.
- Sons : vent proportionnel à la vitesse, roue libre, chaîne, ambiance (oiseaux, ruisseau), foule sur les sommets plus tard.
- Éléments vivants (phase 3+) : autres cyclistes (bots), animaux, voitures garées, banderoles de segments.

## 9. Outil de construction (`tools/world-builder`)

Scripts reproductibles (CI possible) :

1. `fetch-dem` : télécharge et découpe le MNT de la zone.
2. `fetch-osm` : extrait routes, eaux, forêts et bâtiments de la zone.
3. `build-terrain` : heightmaps par chunk, aplanissement le long des routes, splatmaps.
4. `place-vegetation` : génération des instances (graine aléatoire fixe → résultat déterministe).
5. `build-routes` : splines → format de route interne + profils.
6. `pack` : compression glTF, KTX2 et manifeste du monde (`world.json`).

Prévisualisation : page de dev « caméra libre » dans l'application pour inspecter le monde.
