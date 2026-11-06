# Crédits et licences des données

| Donnée                                               | Usage                                                | Source et licence                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relief du spike 3D (`pnpm fetch-dem`, non versionné) | Terrain 4 × 4 km autour de Villard-de-Lans (Vercors) | [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (AWS Open Data / Mapzen). Sources : SRTM, GMTED, ETOPO1, EU-DEM (© Copernicus, EEA) et d'autres — [attribution détaillée](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |

## Assets 3D (CC0, téléchargés par `pnpm fetch-assets`, non versionnés)

Tous en [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.fr) : aucune attribution n'est exigée, on la donne quand même. Liste à jour dans `tools/world-builder/src/asset-catalog.ts`.

| Asset | Usage | Source et auteur |
| --- | --- | --- |
| HDRI « Alps Field » (1k) | Lumière d'ambiance et reflets (lot 2.2) ; le disque du soleil est écrêté, le soleil de la scène le remplace | [Poly Haven](https://polyhaven.com/a/alps_field), Andreas Mischok |
| « Grass004 » (1K JPG) | Herbe du terrain (lot 2.4) | [ambientCG](https://ambientcg.com/view?id=Grass004), Lennart Demes |
| « Ground037 » (1K JPG) | Prairie du terrain (lot 2.4) | [ambientCG](https://ambientcg.com/view?id=Ground037), Lennart Demes |
| « Forest Ground 04 » (1k) | Terre : sol forestier, accotements, rives (lot 2.4) | [Poly Haven](https://polyhaven.com/a/forest_ground_04), Rob Tuytel, Rico Cilliers |
| « Rock030 » (1K JPG) | Roche des pentes raides (lot 2.4) | [ambientCG](https://ambientcg.com/view?id=Rock030), Lennart Demes |
| « Gray Rocks » (1k) | Éboulis en altitude (lot 2.4) | [Poly Haven](https://polyhaven.com/a/gray_rocks), Dimitrios Savva |
| « Snow 02 » (1k) | Neige au-dessus de ~1 900 m (lot 2.4) | [Poly Haven](https://polyhaven.com/a/snow_02), Rob Tuytel |
| « Asphalt015 » (1K JPG) | Asphalte des routes (lot 2.5) | [ambientCG](https://ambientcg.com/view?id=Asphalt015), Lennart Demes |
| « Gravel Floor 02 » (1k) | Gravier des accotements (lot 2.5) | [Poly Haven](https://polyhaven.com/a/gravel_floor_02), Jenelle van Heerden, Dimitrios Savva |
| « Old Stone Wall » (1k) | Murets maçonnés (lot 2.5) | [Poly Haven](https://polyhaven.com/a/old_stone_wall), Charlotte Baglioni |
| « Universal Base Characters » (Standard, homme « Superhero », textures réduites à 1 024 px) | Cycliste riggé (lot 2.10), importé par `pnpm import-avatar` depuis une archive téléchargée à la main | [Quaternius](https://quaternius.com/packs/universalbasecharacters.html) ([itch.io](https://quaternius.itch.io/universal-base-characters)), CC0 |

## Vélo du monde virtuel (lot 2.12)

Aucun asset : le vélo (SCOTT Addict RC) est construit dans le code (`apps/web/src/world/bike-builder.ts`) d'après les cotes et les photos du propriétaire du projet, qui restent en local et ne sont pas versionnées. Les lettrages SCOTT et ULTEGRA sont des marques de leurs propriétaires, utilisées de façon descriptive (voir [docs/11](docs/11-legal-licences.md)).

Aucun asset non plus pour les voitures (lot 2.17) : les 14 modèles sont construits dans le code (`apps/web/src/world/car-builders.ts`) d'après des fiches de cotes publiques (liste des sources dans `car-geometry.ts`) et des photos 3/4 avant fournies par le propriétaire du projet, qui restent en local. Les badges (Renault, Peugeot, Volkswagen, Fiat, Ford, Škoda, Dacia, Land Rover, Toyota, Citroën) sont des marques de leurs propriétaires, dessinés de façon descriptive et désactivables (voir [docs/11](docs/11-legal-licences.md)).

## Outils de test

- **Garmin FIT SDK** (`@garmin/fitsdk`, FIT Protocol License, gratuite) : utilisé uniquement dans les tests pour relire et valider les fichiers `.fit` exportés. Non inclus dans l'application.
