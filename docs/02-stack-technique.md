# Stack technique

Les versions exactes seront figées au moment de l'initialisation du dépôt (phase 0), en prenant les dernières versions stables.

**Règle budget zéro** : chaque brique est open source ou gratuite, et tourne en local. Un service externe n'est accepté que s'il est gratuit **et** ne peut pas facturer par surprise : pas de carte bancaire enregistrée, ou bien un quota plafonné.

## 1. Frontend

| Besoin | Choix | Pourquoi | Alternatives écartées |
|---|---|---|---|
| Langage | **TypeScript (strict)** | Un seul langage du capteur au serveur, typage des protocoles binaires | — |
| Build | **Vite** | Rapide, bon support des workers, WASM et assets | Webpack (lent), Next.js (le SSR n'apporte rien à une app temps réel) |
| UI | **React** | Écosystème, React Three Fiber | Svelte, Solid (écosystème 3D plus réduit) |
| 3D | **Three.js + React Three Fiber + drei** | Plus grand écosystème WebGL/WebGPU, `WebGPURenderer` avec repli WebGL2, nombreux exemples terrain/eau/ciel | Babylon.js (solide, plan B si le spike échoue), PlayCanvas, Unity WebGL (build lourd, mauvaise intégration web) |
| Post-processing | `postprocessing` (pmndrs) | Bloom, SMAA, tonemapping performants | — |
| État | **Zustand** | Léger, utilisable hors React (boucle de simulation) | Redux (verbeux) |
| Données serveur | TanStack Query (phase 2) | Cache, retry | — |
| Styles | Tailwind CSS | Rapide pour HUD et menus | CSS Modules |
| Cartes 2D | **MapLibre GL JS** + tuiles gratuites (OpenFreeMap, sans clé) ou tuiles locales (PMTiles) | Open source, tuiles vectorielles, terrain 3D, 0 € | Leaflet (pas de 3D), Mapbox GL (payant) |
| Graphiques | uPlot (temps réel) + Recharts ou ECharts (récap) | uPlot est très rapide pour les séries longues | Chart.js |
| Stockage local | **IndexedDB via Dexie** | Sorties longues (14 400 échantillons pour 4 h), requêtes simples | localStorage (trop petit) |
| i18n | i18next | Standard | — |
| PWA | vite-plugin-pwa (phase 2) | Cache des assets, installation | — |

## 2. Matériel et formats

| Besoin | Choix |
|---|---|
| Bluetooth | **Web Bluetooth API** native, sans bibliothèque (parsers maison, testés) |
| ANT+ (phase 5) | WebUSB + clé ANT+ USB |
| Export FIT | **@garmin/fitsdk** (SDK officiel JavaScript) |
| Parsing GPX/TCX | `@tmcw/togeojson` ou parser maison sur `DOMParser` |
| Parsing FIT | @garmin/fitsdk (décodeur) |
| Géodésie | `@turf/turf` (distances, cap, rééchantillonnage) |
| Écran actif | Screen Wake Lock API |

## 3. Backend (phase 2 et plus)

| Besoin | Choix | Pourquoi |
|---|---|---|
| Runtime | **Node.js LTS** | Partage du code TypeScript (`physics`, `shared`) |
| Framework HTTP | **Fastify** | Rapide, schémas JSON, typage |
| Validation | Zod (schémas partagés front/back) | — |
| Base de données | **PostgreSQL + PostGIS** | Géométries des routes et segments, requêtes spatiales |
| ORM / requêtes | Drizzle ORM | Typé, proche du SQL, migrations |
| Auth | **Better Auth** (bibliothèque open source, auto-hébergée) | Gratuit ; e-mail + OAuth Strava (redirection vers `localhost` acceptée par Strava, à vérifier) |
| Fichiers | Disque local, ou **MinIO** (compatible S3, open source) en Docker | FIT, GPX, médias ; même API que S3 si un hébergement arrive un jour |
| Environnement serveur | **Docker Compose** local | Postgres/PostGIS, Redis, MinIO, API lancés d'une commande |
| Cache / pub-sub | Redis (ou Valkey) | Sessions, présence multijoueur |
| Temps réel (phase 4) | **Colyseus** ou `uWebSockets.js` maison | Colyseus fournit rooms, synchronisation d'état et matchmaking ; voir [08](08-multijoueur.md) |
| Jobs | BullMQ | Upload Strava, pré-calcul des parcours du mode B |

## 4. Outils hors ligne (construction du monde)

| Besoin | Outil |
|---|---|
| Relief | GDAL (`gdalwarp`, `gdal_translate`) pour découper et reprojeter le MNT, puis export en heightmap PNG 16 bits ou format quantifié |
| Données OSM | `osmium`, Overpass API, ou export Geofabrik |
| Modélisation | Blender (assets, avatar, export glTF) |
| Compression 3D | `gltf-transform` (Meshopt ou Draco, textures KTX2/Basis) |
| Scripts | Node.js ou Python dans `tools/` |

## 5. Qualité et outillage

| Besoin | Choix |
|---|---|
| Gestionnaire de paquets | **pnpm** (workspaces) |
| Orchestration monorepo | **Turborepo** |
| Lint et format | **Biome** (ou ESLint + Prettier) |
| Tests unitaires | **Vitest** |
| Tests E2E | **Playwright** (avec mock de `navigator.bluetooth`) |
| CI | Hooks git locaux (lefthook) ; GitHub Actions seulement si le dépôt est sur GitHub, dans le quota gratuit |
| Erreurs | Capture locale (handler global + journal téléchargeable) ; pas de SaaS payant |
| Perf 3D | `stats-gl`, `r3f-perf`, Chrome DevTools Performance, Spector.js |

## 6. Matrice de compatibilité navigateurs

| Navigateur | Web Bluetooth | WebGPU | Statut pour HomeRealTrainer |
|---|---|---|---|
| Chrome desktop (Win/macOS/Linux/ChromeOS) | Oui | Oui (selon GPU et OS) | **Cible principale** |
| Edge desktop | Oui | Oui | **Cible principale** |
| Chrome Android | Oui | Partiel | Best effort (HUD seul ou 3D en qualité basse) |
| Opera / Brave | Oui (Brave : à activer) | Variable | Non testé officiellement |
| Firefox | **Non** | Variable | Écran « navigateur non supporté » |
| Safari macOS / iOS (tous navigateurs iOS) | **Non** | Oui | Écran « non supporté » ; sur iOS, le navigateur tiers Bluefy expose Web Bluetooth (best effort) |

À vérifier au démarrage du projet : l'état de WebGPU et de Web Bluetooth évolue. Le rendu doit fonctionner en WebGL2 si WebGPU n'est pas disponible.
