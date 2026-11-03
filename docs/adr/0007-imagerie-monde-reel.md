# ADR 0007 — Imagerie du mode monde réel

**Statut** : Proposé — décision finale au spike 4.0 (début de la phase 4)

## Contexte
Le mode B doit montrer des **images réelles** de la route. Options : Google Street View, Mapillary, vidéos géolocalisées, Photorealistic 3D Tiles, reconstitution 3D procédurale (détail et comparatif dans [06](../06-monde-reel.md)). Street View est la meilleure couverture, mais il est payant et ses CGU sont contraignantes ; Mapillary est gratuit, avec une licence ouverte, mais sa couverture est inégale.

## Décision proposée
1. Interface `ImageryProvider` ; une piste d'images peut combiner plusieurs fournisseurs.
2. **Mapillary** comme fournisseur principal (gratuit, cache local autorisé).
3. **Google Street View** en fournisseur optionnel, **uniquement** si un quota journalier plafonné sous le palier gratuit garantit 0 € ([ADR 0010](0010-budget-zero-execution-locale.md)) et après lecture des CGU.
4. Repli : reconstitution 3D procédurale, puis carte 3D.
5. Vidéo géolocalisée en phase 6.

## Conséquences
- (+) Pas de dépendance bloquante à un fournisseur payant ; démarrage à coût nul.
- (−) Qualité visuelle variable selon la couverture.
- Le spike 4.0 compare Mapillary, Street View et la vidéo sur 3 parcours : couverture, fluidité, nombre d'heures de sortie possibles dans le palier gratuit, contraintes légales.
