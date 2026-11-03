# Crédits et licences des données

| Donnée                                               | Usage                                                | Source et licence                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relief du spike 3D (`pnpm fetch-dem`, non versionné) | Terrain 4 × 4 km autour de Villard-de-Lans (Vercors) | [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (AWS Open Data / Mapzen). Sources : SRTM, GMTED, ETOPO1, EU-DEM (© Copernicus, EEA) et d'autres — [attribution détaillée](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |

## Assets 3D (CC0, téléchargés par `pnpm fetch-assets`, non versionnés)

Tous en [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.fr) : aucune attribution n'est exigée, on la donne quand même. Liste à jour dans `tools/world-builder/src/asset-catalog.ts`.

| Asset | Usage | Source et auteur |
| --- | --- | --- |
| HDRI « Alps Field » (1k) | Lumière d'ambiance et reflets (lot 2.2) ; le disque du soleil est écrêté, le soleil de la scène le remplace | [Poly Haven](https://polyhaven.com/a/alps_field), Andreas Mischok |

## Outils de test

- **Garmin FIT SDK** (`@garmin/fitsdk`, FIT Protocol License, gratuite) : utilisé uniquement dans les tests pour relire et valider les fichiers `.fit` exportés. Non inclus dans l'application.
