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
| Post-traitement | Tonemapping AgX, occlusion ambiante GTAO, bloom léger, étalonnage par LUT, SMAA ; profondeur de champ désactivée par défaut |
| Renderer | `WebGPURenderer` de Three.js avec repli WebGL2 automatique |

### Ce qui est en place (phase 2)

- **Lumière et ombres** (lot 2.2, `apps/web/src/world/Lighting.tsx`) : soleil directionnel avec ombres portées en cascade (`CSMShadowNode`, 3 cascades ; 160 m en qualité moyenne avec des cartes de 1024², 200 m en haute avec 2048², rien en basse). Le terrain reçoit les ombres sans en projeter. Pour tenir le budget de draw calls, le cycliste projette son ombre par une silhouette fusionnée (une seule géométrie vue des seules caméras d'ombre, plus les jambes animées), et les objets instanciés sur tout le monde (arbres, lampadaires, balises, voitures garées) ne projettent leur ombre qu'à moins de ~220 m de la caméra, via des copies « ombre seulement » rafraîchies toutes les 0,4 s (`NearShadows.tsx`), avec une silhouette simplifiée pour les arbres. Sans cela, chaque cascade redessinerait toutes les instances d'un objet dont la sphère englobante couvre le monde. Lumière d'ambiance et reflets : HDRI CC0 (« Alps Field ») dont le disque solaire est écrêté au téléchargement (0,05 % des pixels les plus lumineux) et que l'on tourne pour que son soleil soit du côté de celui de la scène ; repli sur une lumière hémisphérique sans les assets. Tonemapping AgX, brouillard de la couleur de l'horizon. Les profils par qualité sont dans `render-profile.ts`.
- **Post-traitement** (lot 2.3, `PostFX.tsx`) : `RenderPipeline` en TSL qui prend la main sur le rendu de R3F. Chaîne : passe de scène (tampon demi-flottant) → occlusion ambiante GTAO sur la profondeur, normales reconstruites (pas de tampon de normales : une cible de moins), multipliée à la couleur → halo (seuil 2, intensité 0,06) → tonemapping AgX et sRGB → LUT 3D 32³ calculée dans le code (`color-grading.ts`, aucun asset) → SMAA. Par qualité : basse = étalonnage seul ; moyenne = GTAO à demi-résolution (8 échantillons), halo, SMAA ; haute = GTAO aux 3/4 (12 échantillons), halo, SMAA. Le MSAA du canvas n'est plus utilisé. Coût mesuré en qualité moyenne sur la config de référence : ~2 ms pour l'occlusion, ~1 ms pour halo + SMAA, en partie compensés par l'abandon du MSAA.
- **Matières du terrain** (lot 2.4, `terrain-splat.ts`, `terrain-material.ts`, `texture-arrays.ts`) : 6 matières PBR CC0 en 1K (herbe, prairie, terre, roche, éboulis, neige ; couleur, normal map, rugosité, occlusion, hauteur), regroupées au chargement dans deux *texture arrays* (couleur × occlusion + hauteur ; normale XY + rugosité) pour un seul binding par shader. **Splatmap** calculée au chargement pour chaque point de la grille (10 m) et stockée dans deux attributs de sommet de 3 octets : roche selon la pente (plus tôt en altitude), éboulis au-dessus de ~1 300 m, neige au-dessus de ~1 900 m sur les pentes douces seulement, terre sous les forêts denses (même bruit que le placement des arbres, nul au-dessus de la limite des arbres), le long des accotements et sur les rives du lac, prairie par taches. Dans le shader (TSL) : bruit à petite échelle sur les poids pour que les limites ne suivent pas la grille, **mélange par la hauteur** des textures (bords nets et naturels), **échantillonnage stochastique** (cellules de bruit d'environ 15 m, chacune avec son décalage de texture, fondues entre elles selon le contraste de la texture), **macro-variation** de teinte et de luminosité (250 m et 30 m), **projection triplanaire** de la roche et des éboulis dont les poids suivent la vraie face du triangle (les normales lissées de la grille sont trop couchées sur les talus des routes et étiraient la texture). Un pixel n'échantillonne que les couches présentes à ses sommets (une branche par couche, gradients calculés avant les branches) : sans cela, le FPS tombait de moitié. Par qualité : basse = textures simples ; moyenne et haute = stochastique + triplanaire ; le repli WebGL2 garde le triplanaire mais pas le stochastique (`terrainProfile` dans `render-profile.ts`). Sans les assets, repli sur les couleurs de sommet.
- **Route et abords** (lot 2.5, `roadside.ts`, `road-builders.ts`, `road-material.ts`, `RoadFurniture.tsx`) :
  - **Asphalte** : texture CC0 (« Asphalt015 ») projetée en coordonnées monde, puis tout ce qui use une vraie route, calculé dans le shader à partir des coordonnées de la route (u en travers, v le long, en mètres) : sections de réfection de 80 à 250 m d'âges différents (teinte, rugosité) séparées par des joints droits, ornières plus sombres et polies, taches d'huile entre les roues, bords poussiéreux puis effrités, rapiéçages rectangulaires découpés par voie et cerclés de bitume, fissures transversales dans les sections anciennes, fissure longitudinale au joint des voies et le long des bords, certaines pontées au bitume (plus larges, noires, brillantes), marquages (axe 3 m / 13 m, rives 3 m / 6,5 m) usés par le trafic et les années et interrompus par les rapiéçages. Les lignes fines sont anticrénelées (`fwidth`) et s'estompent sous le pixel. Les bruits lents (sections, ornières, teinte) sont calculés par sommet sur le CPU (attributs `roadNoise`, `roadTint`) et les bruits fins viennent de deux lectures d'une petite texture de bruit (`noise-texture.ts`) : la première version, avec une douzaine de bruits de Perlin par pixel et un échantillonnage stochastique, coûtait 30 % de FPS. La rugosité reste ≥ 0,62 (pas d'aspect mouillé face au soleil). Une route partagée par deux boucles (1,1 km entre le col et les collines) n'est dessinée qu'une fois, et chaque boucle est surélevée d'1 cm par rapport à la précédente pour qu'aucun embranchement ne scintille.
  - **Accotements** : profil en travers de 6 points (`VERGE_PROFILE`) : bande de gravier de 0,7 m, puis talus jusqu'au terrain enfoncé de 0,6 m, ou **fossé** (fond à −0,7 m, coupé à plat par le terrain, et talus extérieur). Fossés sur le plat et côté amont, par tronçons (profondeur selon un bruit, lissée le long de la route), jamais au-dessus d'un ravin, dans les villages, aux carrefours ni sous une glissière. Le talus et le fossé sont dessinés **avec le matériau du terrain** et les poids de sa splatmap interpolés à chaque sommet (plus de terre au fond des fossés) : aucun raccord visible avec le sol. Le gravier recouvre le haut du talus et son bord extérieur est découpé par un bruit (test alpha), les cailloux dépassant en premier. Les accotements sont découpés en tronçons de 1 km dessinés à moins de 1,3 km de la caméra (au-delà, ils font moins d'un pixel ; tout dessiner coûtait ~200 000 triangles).
  - **Mobilier** (`planRoadside`) : **glissières** (lisse en W galvanisée sur poteaux tous les 4 m, extrémités abaissées dans le sol) côté aval quand le terrain tombe de plus de 12 m à 35 m de l'axe et de 24 m à 60 m ; **murets** maçonnés (texture CC0 « Old Stone Wall » en projection triplanaire, couvertine) à la place des glissières sur les pentes moins fortes, par tronçons, et le long du lac ; **clôtures** de prés en bois sur le plat dégagé, loin des forêts et des fermes ; **balises** J6 tous les 50 m là où il n'y a ni glissière ni muret. Rien dans les villages ni aux carrefours. Sur le monde 1 : ~9,5 km de glissières, ~3,5 km de murets, ~10 km de clôtures, ~1 500 balises. Chaque module est une instance dont la matrice est **cisaillée** (poteaux verticaux, lisses dans la pente) ; seuls ceux à moins de 900 m de la caméra sont dessinés, rafraîchis toutes les 0,4 s, plus une copie « ombre seulement » de ceux à portée des cascades (un draw call par sorte et par passe).
  - **Ordre de rendu** : la route est dessinée avant le terrain (`renderOrder` −1), dont le shader coûteux ne tourne alors plus sous la chaussée sur les GPU sans élimination des surfaces cachées.
  - Sans les assets : asphalte et gravier procéduraux, muret uni, accotements aux couleurs de sommet du terrain.
- **Végétation** (lot 2.6, `plants.ts`, `vegetation-builders.ts`, `vegetation-textures.ts`, `vegetation-material.ts`, `Plants3D.tsx`) :
  - **Pourquoi du procédural et pas des glTF** : les modèles d'arbres CC0 de Poly Haven (seule source CC0 réaliste) font de 0,4 à 17 millions de triangles chacun (`fir_sapling` 433 k, `pine_tree_01` 17 M, vérifié par l'API), inutilisables à 100 000 instances et sans LOD ; les packs CC0 stylisés (Quaternius, Kenney) iraient contre le parti pris « réaliste ». Les modèles sont donc générés dans le code, sans asset à télécharger.
  - **Espèces** : épicéa (verticilles de branches retombantes), pin (tronc nu, houppier irrégulier), hêtre (houppier rond), peuplier (houppier ovale) et buisson. Choisies par altitude (`speciesOf`) à partir d'un hachage du lieu, pour ne pas déplacer les arbres déjà placés par `placeTrees`.
  - **Modèle** : un squelette (tronc, branches, cartes de feuillage qu'elles portent) tiré avec une graine fixe, dessiné à 2 niveaux de détail issus du même squelette (silhouette stable) : LOD 0 avec tronc, branches en tubes et ~300 à 450 cartes (1,5 à 2,5 k triangles), LOD 1 avec un tiers des feuillus ou un verticille sur deux des conifères, cartes agrandies (~150 à 250 triangles). Au-delà : imposteur à 3 plans croisés puis à 2 plans, texture peinte de l'arbre. Les cartes sont à alpha test ; leurs normales pointent du centre du houppier vers l'extérieur et leurs couleurs de sommet assombrissent l'intérieur (occlusion ambiante bon marché), si bien qu'un houppier s'éclaire comme un volume.
  - **Textures peintes dans le code** (canvas 2D au chargement, ~30 ms) : brin d'aiguilles, amas de feuilles, une image par espèce pour les imposteurs, touffes d'herbe et trois fleurs (pâquerette, bouton d'or, géranium). Les pixels transparents reprennent la couleur moyenne de leur cellule : sans cela, les mipmaps cernent les cartes d'un liseré sombre.
  - **Répartition par niveau** (`collectTiers`) : toute la végétation du monde est rangée par chunk ; 2,5 fois par seconde, celle à portée est répartie dans les niveaux de son espèce selon la distance et copiée dans une `InstancedMesh` par espèce et par niveau (au plus ~20 draw calls au lieu de 128 pour les anciens lots d'arbres par chunk et par sorte). Distances de fin de niveau (pleine, LOD 1, imposteur à 3 plans) et de vue : basse 20 / 100 / 380 m, 1,8 km ; moyenne 40 / 170 / 650 m, 2,8 km ; haute 65 / 250 / 950 m, 4 km. Les ombres viennent de silhouettes opaques simples (cônes, ellipsoïdes) pour les arbres à portée des cascades.
  - **Buissons** (`placeShrubs`) : 3 000 / 12 000 / 26 000 selon la qualité, à la lisière des bois et dans les haies des prés, hors accotement.
  - **Herbe** (`generateGrassTile`, `GrassField`) : dalles de 12 m autour de la caméra (rayon 28 / 45 / 60 m), générées à la demande avec une graine par dalle (mêmes touffes à chaque passage) dans un réservoir d'instances où une dalle prend un emplacement libre en entrant et le rend en sortant. Densité selon la splatmap (herbe, prairie, un peu de terre), des plaques, la pente (rien sur les falaises et les talus raides) et la distance à la route (`RoadIndex`, index spatial des segments : rien sur l'accotement). Touffes de 3 plans croisés ; normale d'ombrage fixée vers le haut pour qu'elles s'éclairent comme le sol ; **vent** TSL : deux ondes qui traversent le champ, plié proportionnel au carré de la hauteur sur la touffe.
  - **Bord de route** : herbes hautes (1,2 m) dans une bande de 5 m au-delà de l'accotement, de plus en plus rares avec la distance, et fleurs par plaques d'une même espèce (~25 m) le long des routes et dans quelques prés ; pas sur les trottoirs des villages.

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
