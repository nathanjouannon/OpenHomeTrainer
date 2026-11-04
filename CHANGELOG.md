# Changelog

Toutes les évolutions notables du projet. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/) : une version par jalon de la [roadmap](docs/ROADMAP.md).

## [Non publié]

Phase 2 « Rendu réaliste » en cours : voir la [roadmap](docs/ROADMAP.md).

### Ajouté

- **Banc de comparaison du rendu** (lot 2.0) : page `#/bench` et commandes `pnpm bench` / `pnpm bench:compare`. 16 points de vue fixes sur les 3 boucles, captures reproductibles à l'octet près, FPS moyen et 1 % low, draw calls, triangles et mémoire GPU estimée pour chaque qualité, rapports HTML avant/après. Run de référence `phase-1` mesuré (voir [docs/10 §7](docs/10-qualite-tests.md)).
- **Rendu WebGPU** (lot 2.1) : la vue 3D passe sur `WebGPURenderer` de Three.js, avec repli automatique en WebGL2 quand le navigateur n'a pas WebGPU ; nouveau réglage « Moteur de rendu » (Automatique / WebGL2) ; backend affiché à côté du FPS pendant la sortie ; option `--webgl2` de `pnpm bench`. Voir l'[ADR 0003](docs/adr/0003-rendu-3d-threejs.md).
- **Lumière et ombres** (lot 2.2) : soleil avec ombres portées en cascade autour du cycliste (3 cascades, jusqu'à 160 m en qualité moyenne et 200 m en haute, aucune en basse) ; lumière d'ambiance et reflets venus d'une HDRI CC0 (« Alps Field », Poly Haven), son soleil écrêté et orientée comme celui de la scène ; tonemapping AgX ; brouillard accordé à l'horizon du ciel. Le cycliste, les arbres proches, les bâtiments, les voitures, les piétons et le mobilier projettent leur ombre.
- **Post-traitement** (lot 2.3) : chaîne TSL (`RenderPipeline` de Three.js, WebGPU et WebGL2) avec occlusion ambiante GTAO calculée sur la profondeur (demi-résolution en qualité moyenne, 3/4 en haute), halo léger sur les parties les plus lumineuses, étalonnage des couleurs par une LUT 3D calculée dans le code (contraste, saturation, hautes lumières chaudes) et anticrénelage SMAA. La qualité basse garde l'étalonnage seul ; le MSAA du canvas est retiré quand SMAA le remplace.
- **Matières du terrain** (lot 2.4) : 6 textures PBR CC0 (herbe, prairie, terre, roche, éboulis, neige) mélangées selon la pente, l'altitude, les forêts, la distance à la route et les rives du lac ; bords nets par mélange selon la hauteur des textures ; anti-répétition par échantillonnage stochastique et variation de teinte à grande échelle ; projection triplanaire de la roche et des éboulis sur les falaises (qualité moyenne et haute). `pnpm fetch-assets` télécharge aussi ces textures (archives ambientCG lues sans dépendance).
- **Route et abords** (lot 2.5) : asphalte PBR CC0 avec sections de réfection d'âges différents, ornières, rapiéçages, fissures (certaines pontées au bitume), bords effrités et marquages usés, sans motif répété ; accotements en gravier au bord irrégulier, talus et fossés qui se fondent dans le terrain (même matériau, même splatmap) ; glissières en montagne, murets maçonnés au-dessus des pentes et du lac, clôtures de prés et balises, placés selon le relief. Deux points de vue ajoutés au banc (`lac-clotures`, `col-muret`).
- **Végétation** (lot 2.6) : cinq espèces d'arbres et de buissons (épicéa, pin, hêtre, peuplier, buisson) générées dans le code avec tronc, branches et cartes de feuillage à normales de houppier, 2 niveaux de détail et des imposteurs au loin ; herbe instanciée autour de la caméra (28 à 60 m selon la qualité) animée par le vent ; herbes hautes et fleurs en bord de route ; buissons à la lisière des bois ; textures peintes au chargement (aucun asset à télécharger). Les modèles glTF CC0 de Poly Haven (0,4 à 17 millions de triangles) sont inutilisables en instances.
- **Ciel, eau, atmosphère** (lot 2.7) : nuages (qualité moyenne et haute) ; perspective atmosphérique par un fog TSL : brume de distance bleutée, chaude vers le soleil, et brume de vallée qui épaissit avec la basse altitude ; le monde finit toujours dans la brume ; lac aux rides animées par une carte de normales calculée dans le code, avec reflets de l'environnement en qualité moyenne et **réflexion plane** (terrain et ciel) en haute, le plan d'eau se limitant au lac.
- **Micro-relief du sol** (lot 2.8) : bosses procédurales à trois échelles (26 m, 7 m, 1,9 m) ajoutées aux normales du terrain et légère occlusion dans les creux, fondues avec la distance (90 à 420 m), en qualité moyenne et haute ; les accotements de route gardent la matière du lot 2.5 (inchangés).
- **Qualité graphique automatique** (lot 2.9) : nouveau réglage « Auto », par défaut. Le monde démarre en qualité moyenne ; quand le FPS moyen reste sous 45 pendant 10 s, la résolution de rendu (85, 70 puis 60 %) et l'herbe autour de la caméra (70, 45 puis 0 %) baissent d'un niveau, sans reconstruire le monde ni remonter pendant la sortie. Les préréglages manuels ne sont jamais ajustés.
- **`pnpm fetch-assets`** : télécharge les assets CC0 du monde (non versionnés, licences tracées dans leur manifeste et dans `CREDITS.md`). Sans eux, le monde garde un rendu et un éclairage de repli.

### Modifié

- Arbres : les lots d'instances par chunk et par sorte laissent place à une instance par espèce et par niveau de détail, remplie autour de la caméra ; les arbres en cônes et en icosaèdres disparaissent. La répartition des arbres du monde ne change pas.
- Routes : rubans de toutes les boucles fusionnés (une géométrie par surface au lieu d'une par boucle et par village), soit 40 à 50 draw calls de moins ; un tronçon partagé par deux boucles n'est plus dessiné deux fois. Les balises quittent les villages (`settlements.ts`) pour le mobilier de bord de route et ne sont dessinées qu'à moins de 900 m.
- Le brouillard linéaire fait place au fog TSL (voir ci-dessus) ; le lac n'est plus un plan de la taille du monde.
- Ciel réécrit en TSL (`SkyMesh` de Three.js) à la place du `<Sky>` de drei, incompatible avec WebGPU.
- Banc : la mémoire GPU estimée compte aussi les textures des matières TSL.
- Banc : compteurs de draw calls et de triangles lus de la même façon sur les deux backends ; l'estimation de mémoire GPU inclut le tampon de sortie en demi-flottants de `WebGPURenderer`.
- Cycliste : pièces fixes fusionnées par matière et une seule silhouette pour son ombre, ce qui retire une quarantaine de draw calls. Arbres, lampadaires, balises et voitures garées ne projettent leur ombre qu'à moins de ~220 m de la caméra (copies « ombre seulement »), pour rester dans le budget de triangles.
- Banc : les rendus imbriqués (cartes d'ombres) s'ajoutent aux compteurs de l'image au lieu de les remettre à zéro ; cartes d'ombres et environment map comptées dans la mémoire estimée.

## [0.1.0] — 2026-11-03 — Jalon M1 : MVP en monde virtuel

Clôture des phases 0 et 1. Les vérifications qui demandent le vrai trainer (sortie de 3 h, import du `.fit` sur Strava et Garmin Connect, test sur 2 trainers) sont reportées au lot 2.11.

### Ajouté

- **Monorepo** pnpm + Turborepo, Biome, Vitest, TypeScript strict ; hooks git locaux (lefthook) à la place d'une CI payante.
- **Appareils** (`@hrt/devices`) : home trainer FTMS (pente, ERG), capteur de puissance, ceinture cardio en Web Bluetooth ; reconnexion automatique, mémorisation ; trainer et cardio simulés.
- **Physique** (`@hrt/physics`) : modèle complet (gravité, roulement, aéro, inertie), solveur de référence, difficulté du trainer réglable, descente atténuée, lissage de la pente envoyée.
- **Routes** (`@hrt/route-engine`) : format de route interne, boucles fermées avec raccord continu à la ligne, comptage des tours.
- **Monde v1 « Val de Vérane »** : relief réel de 10 × 10 km, planificateur de routes sur le relief (lacets automatiques), 3 boucles (lac 9 km, collines 18 km, col 27 km) ; terrain par tuiles avec LOD, lac, forêts, 5 villages, fermes, piétons, voitures garées et en sens inverse, route détaillée avec marquage français.
- **Cycliste** procédural : pédalage à la cadence, danseuse ; 4 caméras dont la vue POV par défaut (cintre, cocottes, compteur, bras dédiés).
- **Vitesses virtuelles** (`@hrt/drivetrain`) : plateaux 50/34 et cassette de 10 à 13 vitesses au choix ; `A`/`Z` un pignon, `Q`/`S` le plateau, changement de plateau automatique en bout de cassette ; stratégie S1 (décalage de pente) pour les trainers sans cassette (Zwift Cog).
- **HUD** : puissance, W/kg, cadence, FC, vitesse, rapport, distance, temps, D+, pente, tours, mini-carte, profil du tour.
- **Enregistrement** (`@hrt/recorder`) : échantillons à 1 Hz, stats (NP, IF, TSS), un lap par tour, sauvegarde incrémentale dans IndexedDB, reprise après plantage, export `.fit` validé par le SDK Garmin.
- **Écrans** : accueil, appareils, choix de la boucle, sortie, récapitulatif, historique, profil et réglages ; français et anglais.
- **Exécution locale** en une commande (`pnpm start`) ; pages de spike `#/ble` et `#/3d`.
- **Documentation** : PRD, architecture, ADR, roadmap, risques, conventions.
