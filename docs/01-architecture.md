# Architecture

## 1. Vue d'ensemble

```
┌───────────────────────────────────────── Navigateur (Chrome / Edge) ─────────────────────────────────────────┐
│                                                                                                              │
│  ┌────────────┐   mesures    ┌──────────────┐   RiderState   ┌───────────────┐                               │
│  │  devices   │ ───────────▶ │  simulation  │ ─────────────▶ │  rendu 3D     │  (mode A : Three.js)          │
│  │ (BLE FTMS, │              │  (physics +  │                │  ou lecteur   │  (mode B : images + carte)    │
│  │  CPS, HRS) │ ◀─────────── │ route-engine)│ ──┐            │  d'images     │                               │
│  └────────────┘  pente / ERG └──────────────┘   │            └───────────────┘                               │
│        ▲                            │           │            ┌───────────────┐                               │
│        │                            ▼           └──────────▶ │  HUD (React)  │                               │
│  Web Bluetooth             ┌──────────────┐                  └───────────────┘                               │
│                            │  recorder    │ ──▶ IndexedDB ──▶ export .fit                                     │
│                            └──────────────┘                                                                  │
└────────────────────────────────────│─────────────────────────────────────────────────────────────────────────┘
                                     │ HTTPS (phase 2+)              WebSocket (phase 4)
                              ┌──────▼──────┐                     ┌──────────────────┐
                              │  API REST   │                     │ Serveur temps    │
                              │  (Fastify)  │                     │ réel (rooms)     │
                              └──────┬──────┘                     └──────────────────┘
                     ┌───────────────┼────────────────┐
                ┌────▼─────┐   ┌─────▼──────┐   ┌─────▼───────────┐
                │PostgreSQL│   │  Object    │   │  APIs externes  │
                │+ PostGIS │   │  storage   │   │ Strava, Mapillary│
                └──────────┘   │ (FIT, GPX, │   │ (Street View),MNT│
                               │  assets)   │   └─────────────────┘
                               └────────────┘
```

**Contrainte actuelle** : budget de 0 € et exécution **uniquement en local**. Tous les blocs « serveur » ci-dessus tournent sur la machine du développeur (Docker Compose) ; les APIs externes utilisées sont gratuites.

**Principe central** : toute la simulation tourne **dans le navigateur**. Le serveur ne sert qu'à stocker, synchroniser et (plus tard) relayer les positions multijoueur. Le MVP fonctionne donc avec un simple hébergement statique.

## 2. Modules (packages du monorepo)

| Package | Responsabilité | Dépend de | Testable sans navigateur |
|---|---|---|---|
| `@hrt/shared` | Types communs (`RiderState`, `Route`, `Sample`…), constantes, unités | — | Oui |
| `@hrt/devices` | Abstraction des capteurs, implémentations Web Bluetooth (FTMS, CPS, HRS, CSC), trainer simulé, parsers de trames | shared | Oui pour les parsers |
| `@hrt/physics` | Modèle physique pur : `step(state, inputs, dt) → state` | shared | Oui |
| `@hrt/route-engine` | Parsing GPX/TCX/FIT, rééchantillonnage, lissage, calcul de pente, interpolation le long de la route | shared | Oui |
| `@hrt/workouts` | Modèle de séance, parsers `.zwo`/`.erg`/`.mrc`, moteur de séance (cible courante) | shared | Oui |
| `@hrt/drivetrain` | Boîte de vitesses virtuelle et stratégies de pilotage (`ShiftingStrategy`), voir [15](15-vitesses-virtuelles-et-commandes.md) | shared, physics | Oui |
| `@hrt/controls` | Hub de commandes : sources d'entrée (clavier, Gamepad, smartphone, OpenBikeControl Bluetooth et réseau) → actions configurables | shared, devices | Oui (hors sources navigateur) |
| `@hrt/recorder` | Échantillonnage 1 Hz, stockage IndexedDB, calcul de stats (NP, TSS…), export FIT | shared | Oui (avec fake-indexeddb) |
| `@hrt/world` | Chargement du monde 3D, streaming de chunks, avatar, caméras | three | Non |
| `@hrt/imagery` | Mode B : interface `ImageryProvider` et implémentations | shared | Partiellement |
| `apps/web` | Application React : écrans, HUD, orchestration | tous | — |
| `apps/api` (phase 2) | API REST, auth, stockage | shared | Oui |
| `apps/realtime` (phase 4) | Serveur WebSocket multijoueur | shared | Oui |
| `tools/world-builder` | Scripts hors ligne : MNT → heightmap, OSM → routes et végétation, compression des assets | — | Oui |

Règle de dépendance : `physics`, `route-engine`, `workouts` et `recorder` sont du **TypeScript pur**, sans DOM, sans Three.js et sans React. Ils sont testés en isolation et réutilisables côté serveur (validation, anti-triche).

## 3. Boucle de simulation

```
            BLE notifications (1–4 Hz, asynchrones)
                         │
                         ▼
               ┌───────────────────┐
               │ DeviceHub         │ dernière valeur + horodatage par métrique
               └─────────┬─────────┘
                         │ lecture
   tick fixe 20 Hz ──────▼────────────────────────────────────────────────
               ┌───────────────────┐
               │ SimulationLoop    │ 1. lit puissance, cadence, FC
               │                   │ 2. route-engine → pente au point courant
               │                   │ 3. physics.step(dt = 50 ms)
               │                   │ 4. avance la distance (modulo le tour en mode A),
               │                   │    détecte le passage de ligne → nouveau tour,
               │                   │    met à jour RiderState
               │                   │ 5. TrainerController : pente ressentie
               │                   │    + vitesses virtuelles, ou ERG → trainer
               │                   │ 6. Recorder : échantillon toutes les 1 s
               └─────────┬─────────┘
                         │ RiderState (store)
   requestAnimationFrame ▼ (60 Hz, variable)
               ┌───────────────────┐
               │ Renderer / HUD    │ interpole entre les deux derniers états
               └───────────────────┘
```

Points importants :

- **Pas fixe découplé du rendu** : la physique avance à 20 Hz quel que soit le FPS. Le rendu interpole entre les deux derniers états pour rester fluide à 60 ou 120 Hz.
- **Onglet en arrière-plan** : `requestAnimationFrame` s'arrête et `setInterval` est fortement ralenti par le navigateur. La boucle calcule donc son `dt` à partir de `performance.now()` et rattrape le retard par sous-pas (avec un plafond). L'option envisagée est de faire tourner la boucle dans un **Web Worker**, moins soumis au ralentissement. Web Bluetooth n'étant pas disponible dans les workers, les mesures sont transmises au worker par `postMessage`. À trancher pendant le spike de la phase 0.
- **Données périmées** : si la puissance n'a pas été mise à jour depuis plus de 3 s, elle est considérée comme nulle (le coureur s'arrête en roue libre) et le HUD affiche un avertissement.

## 4. État de l'application

| État | Où | Outil |
|---|---|---|
| `RiderState` (position, vitesse, puissance…) | Store hors React, muté à 20 Hz | Store mutable + abonnement (Zustand `subscribe` sans re-render, ou objet mutable lu dans la boucle de rendu) |
| HUD | Composants React rafraîchis à 4 Hz maximum | Zustand avec sélecteurs |
| Appareils connectés | Store dédié | Zustand |
| Profil, réglages | Persistés | Zustand `persist` + IndexedDB / localStorage |
| Données serveur (phase 2) | Cache | TanStack Query |

Il ne faut **jamais** faire passer l'état à 20 Hz par des re-renders React : le HUD lit à basse fréquence et la scène 3D lit l'état directement dans `useFrame`.

## 5. Interfaces clés (contrats)

```ts
// @hrt/devices
interface SensorReading {
  power?: number;        // W
  cadence?: number;      // rpm
  heartRate?: number;    // bpm
  speed?: number;        // km/h (informatif, non utilisé par la physique)
  timestamp: number;     // performance.now()
}

interface Device {
  id: string;
  name: string;
  kind: 'trainer' | 'power' | 'heartrate' | 'cadence' | 'simulated';
  capabilities: Set<'power' | 'cadence' | 'heartRate' | 'sim' | 'erg' | 'resistance'>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onReading(cb: (r: SensorReading) => void): Unsubscribe;
  onStatus(cb: (s: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void): Unsubscribe;
}

interface ControllableTrainer extends Device {
  setSimulation(p: { gradePercent: number; windSpeedMs?: number; crr?: number; cwKgM?: number }): Promise<void>;
  setTargetPower(watts: number): Promise<void>;
  setResistance?(level: number): Promise<void>;
}

// @hrt/physics
interface RiderParams { massKg: number; bikeMassKg: number; cda: number; crr: number; drivetrainEfficiency: number; }
interface PhysicsInput { powerW: number; gradePercent: number; airDensity: number; draftFactor: number; }
function step(speedMs: number, input: PhysicsInput, params: RiderParams, dt: number): number; // nouvelle vitesse

// @hrt/route-engine
interface RoutePoint { d: number; lat?: number; lon?: number; x?: number; y?: number; z: number; grade: number; heading: number; }
interface Route { id: string; mode: 'virtual' | 'real'; points: RoutePoint[]; lengthM: number; ascentM: number; loop: boolean; }
function sampleAt(route: Route, distanceM: number): RoutePoint; // interpolation ; si route.loop, distanceM est pris modulo route.lengthM
function lapOf(route: Route, totalDistanceM: number): { lap: number; lapDistanceM: number };

// @hrt/imagery (mode B)
interface ImageryProvider {
  id: 'mapillary' | 'google-streetview' | 'video';
  prepare(route: Route, onProgress: (p: number) => void): Promise<ImageryTrack>;
}
interface ImageryTrack { frameAt(distanceM: number): ImageryFrame | null; prefetch(fromM: number, toM: number): void; attribution: string; }
```

## 6. Déploiement

**Exécution locale uniquement** (budget zéro) :

| Composant | Phase | Exécution |
|---|---|---|
| App web | 1 | Serveur de dev Vite ou build servi par `vite preview` sur `http://localhost` |
| Assets du monde (glTF, textures, heightmaps) | 1 | Dossier local servi par le même serveur (`apps/web/public/worlds/` ou dossier configuré) |
| API + base | 2 | Docker Compose local : PostgreSQL + PostGIS, API Fastify, MinIO (stockage S3) ou disque |
| Temps réel | 4 | Process local ; accessible sur le réseau domestique pour tester à plusieurs |
| Tablette / autre appareil du réseau local | — | HTTPS requis hors `localhost` : certificat local `mkcert` (gratuit) |

Si un hébergement public est décidé un jour, il faudra privilégier des offres gratuites (hébergement statique gratuit, base gratuite) et rouvrir l'[ADR 0010](adr/0010-budget-zero-execution-locale.md).

HTTPS est obligatoire dès le premier jour : Web Bluetooth n'est disponible qu'en contexte sécurisé (`https://` ou `localhost`).

## 7. Observabilité

- Phase 1 : erreurs capturées localement (handler global → console + journal téléchargeable), journal BLE téléchargeable, panneau de debug (FPS, latence BLE). Pas de service SaaS de monitoring.
- Phase 2 et plus : logs structurés (pino) dans des fichiers locaux.
- Pas de télémétrie distante tant qu'il n'y a pas d'hébergement public.
