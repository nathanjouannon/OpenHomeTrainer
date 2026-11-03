# HomeRealTrainer — Documentation de planification

Application web de simulation de sortie vélo sur home trainer connecté, dans l'esprit de Zwift ou MyWhoosh, avec deux modes :

- **Mode A — Monde virtuel réaliste** : un monde 3D original rendu dans le navigateur. Priorité 1.
- **Mode B — Monde réel** : rouler sur de vraies routes, avec des images réelles (type Street View) et les vraies pentes. Prévu dans un second temps.

Cette documentation regroupe tout ce qu'il faut décider et savoir **avant** de commencer à développer.

## Par où commencer

1. [PRD.md](PRD.md) : ce que l'on construit, pour qui, et les exigences.
2. [ROADMAP.md](ROADMAP.md) : l'ordre de construction, les jalons et les critères de sortie de chaque phase.
3. [13-questions-ouvertes.md](13-questions-ouvertes.md) : les décisions encore ouvertes et les hypothèses retenues par défaut.

## Sommaire

| Fichier | Contenu |
|---|---|
| [PRD.md](PRD.md) | Product Requirements Document : vision, personas, user stories, exigences fonctionnelles et non fonctionnelles, KPI |
| [ROADMAP.md](ROADMAP.md) | Phases 0 à 6, livrables, critères de sortie, estimations |
| [01-architecture.md](01-architecture.md) | Architecture globale, modules, flux de données, boucle de simulation |
| [02-stack-technique.md](02-stack-technique.md) | Choix technologiques et alternatives écartées |
| [03-materiel-protocoles.md](03-materiel-protocoles.md) | Home trainers, capteurs, Bluetooth (FTMS, CPS, HRS, FE-C), compatibilité navigateurs |
| [04-moteur-physique.md](04-moteur-physique.md) | Modèle physique (vitesse depuis la puissance), pente, drafting, envoi au trainer |
| [05-monde-virtuel.md](05-monde-virtuel.md) | Conception du monde 3D : terrain, routes, assets, performance, avatar |
| [06-monde-reel.md](06-monde-reel.md) | Mode monde réel : GPX, altimétrie, sources d'images (Street View, Mapillary, vidéo) |
| [07-donnees-et-api.md](07-donnees-et-api.md) | Modèle de données, stockage, API REST, formats de fichiers (FIT, GPX, ZWO) |
| [08-multijoueur.md](08-multijoueur.md) | Conception du multijoueur (phase ultérieure, préparée dès le début) |
| [09-ux-ui.md](09-ux-ui.md) | Écrans, parcours utilisateur, HUD, contrôles |
| [10-qualite-tests.md](10-qualite-tests.md) | Stratégie de tests, trainer simulé, budgets de performance |
| [11-legal-licences.md](11-legal-licences.md) | Marques, licences des données et des assets, RGPD, CGU des API |
| [12-risques.md](12-risques.md) | Registre des risques et parades |
| [13-questions-ouvertes.md](13-questions-ouvertes.md) | Décisions en attente et hypothèses par défaut |
| [14-conventions-dev.md](14-conventions-dev.md) | Structure du dépôt, conventions de code, CI, Definition of Done |
| [15-vitesses-virtuelles-et-commandes.md](15-vitesses-virtuelles-et-commandes.md) | Vitesses virtuelles et hub de commandes physiques (équivalent BikeControl intégré) |
| [glossaire.md](glossaire.md) | Vocabulaire vélo et technique |
| [adr/](adr/) | Architecture Decision Records : une décision structurante par fichier |

## Résumé des décisions clés

| Sujet | Décision | ADR |
|---|---|---|
| Plateforme | Application web, Chrome/Edge desktop en priorité (Web Bluetooth) | [0001](adr/0001-application-web-web-bluetooth.md) |
| Code | Monorepo TypeScript (pnpm + Turborepo) | [0002](adr/0002-monorepo-typescript.md) |
| Rendu 3D | Three.js via React Three Fiber | [0003](adr/0003-rendu-3d-threejs.md) |
| Physique | Calculée dans le client ; la vitesse découle de la puissance, jamais du trainer | [0004](adr/0004-physique-cote-client.md) |
| Données MVP | Local-first (IndexedDB), backend à partir de la phase 3 | [0005](adr/0005-local-first-mvp.md) |
| Budget et hébergement | **0 €** (hors outil d'IA déjà payé) ; exécution **uniquement en local** ; uniquement des outils, données et assets gratuits | [0010](adr/0010-budget-zero-execution-locale.md) |
| Monde virtuel | Monde original construit sur un relief réel (MNT) + génération procédurale | [0006](adr/0006-monde-virtuel-relief-reel.md) |
| Routes du monde virtuel | Uniquement des boucles fermées, tours enchaînés sans fin pour les séances longues | [0009](adr/0009-boucles-uniquement.md) |
| Monde réel | Abstraction `ImageryProvider` ; Mapillary (gratuit) en source principale, Street View seulement si un quota plafonné garantit 0 € (proposé) | [0007](adr/0007-imagerie-monde-reel.md) |
| Vitesses virtuelles | Intégrées nativement (type BikeControl) ; stratégie « décalage de pente » par défaut, « ERG piloté » en expérimental | [0008](adr/0008-vitesses-virtuelles.md) |
| Commandes physiques | Protocole ouvert **OpenBikeControl** (MIT) ; BikeControl (non open source, payant après essai) seulement en passerelle optionnelle, aucun code réutilisé | [0011](adr/0011-openbikecontrol.md) |

## Définition du MVP en une phrase

> Je connecte mon home trainer depuis Chrome, je roule autant de tours que je veux sur une boucle d'un monde 3D original, je sens les pentes dans les jambes, je vois mes données en temps réel, et j'exporte ma sortie en `.fit` vers Strava ou Garmin.
