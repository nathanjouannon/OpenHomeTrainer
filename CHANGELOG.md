# Changelog

Toutes les évolutions notables du projet. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/) : une version par jalon de la [roadmap](docs/ROADMAP.md).

## [Non publié]

Phase 2 « Rendu réaliste » en cours : voir la [roadmap](docs/ROADMAP.md).

### Ajouté

- **Banc de comparaison du rendu** (lot 2.0) : page `#/bench` et commandes `pnpm bench` / `pnpm bench:compare`. 16 points de vue fixes sur les 3 boucles, captures reproductibles à l'octet près, FPS moyen et 1 % low, draw calls, triangles et mémoire GPU estimée pour chaque qualité, rapports HTML avant/après. Run de référence `phase-1` mesuré (voir [docs/10 §7](docs/10-qualite-tests.md)).

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
