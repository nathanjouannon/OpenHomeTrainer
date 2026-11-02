# ADR 0003 — Three.js + React Three Fiber

**Statut** : Accepté, confirmé par le spike 3D de la phase 0 — 2026-11-02

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
Scène de la page `#/3d` : terrain 4 × 4 km issu d'un MNT réel (513 × 513 sommets), boucle de 8,3 km, 10 000 arbres instanciés (2 draw calls), WebGL2. **60 FPS** mesurés sur la machine du développeur : critère de sortie (≥ 50 FPS) atteint, pas de bascule vers Babylon.js. `WebGPURenderer` reste à évaluer en phase 1.
