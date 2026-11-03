# ADR 0003 — Three.js + React Three Fiber

**Statut** : Accepté, confirmé par le spike 3D de la phase 0 — 2026-11-02 ; complété par la bascule sur `WebGPURenderer` (lot 2.1) — 2026-11-03

## Contexte
Le mode A demande un rendu 3D réaliste dans le navigateur : grand terrain, végétation instanciée, ciel, eau, ombres. Candidats : Three.js, Babylon.js, PlayCanvas, Unity WebGL.

## Décision
**Three.js** (avec `WebGPURenderer` et repli WebGL2), intégré via **React Three Fiber** + **drei** pour l'UI et la composition de scène. Les parties critiques (terrain, instancing, streaming) sont écrites en Three.js « bas niveau » à l'intérieur de composants R3F, sans re-render React par frame.

## Alternatives
- **Babylon.js** : moteur plus « tout-en-un » (inspecteur, physique, terrain), excellent support WebGPU. **Plan B** si le spike Three.js n'atteint pas les budgets.
- **Unity WebGL** : builds lourds, temps de chargement, intégration web et Web Bluetooth malcommodes. Écarté.
- **PlayCanvas** : bon moteur, mais écosystème plus réduit et éditeur orienté cloud.

## Conséquences
- (+) Écosystème le plus large (exemples, bibliothèques terrain/eau/ciel, 3d-tiles-renderer utile au mode B).
- (−) Plus d'assemblage manuel qu'avec un moteur complet.
- Critère de sortie du spike : ≥ 50 FPS sur la config de référence avec terrain 4 × 4 km et 10 000 arbres.

## Résultat du spike (2026-11-02)
Scène de la page `#/3d` : terrain 4 × 4 km issu d'un MNT réel (513 × 513 sommets), boucle de 8,3 km, 10 000 arbres instanciés (2 draw calls), WebGL2. **60 FPS** mesurés sur la machine du développeur : critère de sortie (≥ 50 FPS) atteint, pas de bascule vers Babylon.js. `WebGPURenderer` restait à évaluer : voir la section suivante.

## Bascule sur `WebGPURenderer` (lot 2.1, 2026-11-03)

**Décision** : la vue 3D des sorties et le banc de comparaison utilisent `WebGPURenderer` de Three.js (r187). Il tourne en **WebGPU** quand le navigateur le propose et bascule **automatiquement en WebGL2** sinon (backend WebGL de Three.js, mêmes shaders). Un réglage « Moteur de rendu » (Automatique / WebGL2) permet de forcer le repli ; le banc l'accepte aussi (`pnpm bench -- --webgl2`, ou `#/bench?renderer=webgl2`).

**Matériaux et shaders** :

- tout nouveau shader s'écrit en **TSL** (Three Shading Language), compilé en WGSL ou en GLSL selon le backend ; plus de GLSL écrit à la main ni de `onBeforeCompile` ;
- le ciel de drei (`<Sky>`, un `ShaderMaterial` GLSL, incompatible avec `WebGPURenderer`) est remplacé par `SkyMesh` de Three.js, écrit en TSL, avec les mêmes paramètres ; ses nuages restent désactivés jusqu'au lot 2.7 ;
- les matériaux standards (`MeshStandardMaterial`…) sont conservés : `WebGPURenderer` les convertit en matériaux à nœuds (`MeshStandardNodeMaterial`) au premier rendu. Les lots suivants leur ajoutent des nœuds TSL (`colorNode`, `normalNode`…) ou passent directement aux classes `*NodeMaterial` là où il faut un shader sur mesure (terrain, herbe, eau).

**Compatibilité avec React Three Fiber 9** (vérifiée) :

- le renderer se crée par une fabrique asynchrone passée à `<Canvas gl={…}>` (`apps/web/src/world/renderer.ts`) : `await renderer.init()` avant le premier rendu ;
- R3F pilote sa propre boucle `requestAnimationFrame`, alors que `WebGPURenderer` ne remet à zéro ses compteurs par image (`info.render`) que dans sa propre boucle d'animation : la fabrique les remet à zéro à chaque `render()` de premier niveau, comme `WebGLRenderer` (depuis le lot 2.2, les rendus imbriqués, comme ceux des cartes d'ombres, s'ajoutent aux compteurs de l'image au lieu de les effacer). Les compteurs portent aussi d'autres noms (`drawCalls` au lieu de `calls`) : on les lit via `frameInfo()` ;
- `useThree().gl` reste typé `WebGLRenderer` par R3F : on passe par `asWorldRenderer()` pour l'API WebGPU ;
- fonctionnent sans changement : `dpr`, tone mapping et espace colorimétrique réglés par R3F, `LOD`, `InstancedMesh` avec couleurs par instance, layers de caméra (vue POV), `polygonOffset`, brouillard de scène, textures canvas, bump maps ;
- drei : seul `<Sky>` posait problème. Pour la suite, n'utiliser que des composants drei sans shader GLSL, ou leurs équivalents TSL de `three/addons`.

**Conséquences** :

- (+) un seul code de shader pour WebGPU et WebGL2, ce qui prépare les ombres, le post-traitement (`RenderPipeline` en TSL), le terrain, l'herbe et l'eau des lots 2.2 à 2.8 ;
- (+) les compteurs du renderer (programmes, géométries, textures) sont les mêmes quel que soit le backend ;
- (−) le chunk 3D grossit (Three.js WebGPU + compilateur TSL) ;
- (−) `WebGPURenderer` dessine la scène dans un tampon intermédiaire en demi-flottants, puis applique le tone mapping vers le canvas : un peu plus de mémoire vidéo (prise en compte par l'estimation du banc) et une passe plein écran de plus ;
- la page de spike `#/3d` reste en `WebGLRenderer` avec drei (archive de la phase 0).
