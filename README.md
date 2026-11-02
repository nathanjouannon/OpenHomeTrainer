# HomeRealTrainer

Simulation de sortie vélo sur home trainer connecté, dans le navigateur. Documentation de conception : [docs/README.md](docs/README.md).

## Démarrage

Prérequis : Node.js ≥ 20.19 (LTS 24 recommandé), pnpm 10, Chrome ou Edge.

```sh
pnpm install
pnpm build-world    # télécharge le relief réel et construit le monde v1 (une fois, ~10 s)
pnpm dev            # http://localhost:5173
```

Pour rouler sans environnement de dev : `pnpm start` (build de production servi sur http://localhost:4173).

Sans trainer, la sortie démarre avec le **trainer simulé** : `↑` / `↓` règlent la puissance de 10 W.

| Commande                    | Rôle                                                    |
| --------------------------- | ------------------------------------------------------- |
| `pnpm dev`                  | Application web (Vite)                                  |
| `pnpm start`                | Build de production + serveur local                     |
| `pnpm build-world`          | Construit le monde (`--preview fichier.png` : carte)    |
| `pnpm fetch-dem`            | Relief du spike 3D (`#/3d`)                             |
| `pnpm test`                 | Tests unitaires (Vitest) de tous les packages           |
| `pnpm typecheck`            | Vérification TypeScript                                 |
| `pnpm lint` / `pnpm format` | Biome                                                   |
| `pnpm verify`               | Lint + typecheck + tests (ce que lancent les hooks git) |
| `pnpm build`                | Build de production                                     |

Les hooks git (lefthook) lancent lint, typecheck et tests au commit, et le build au push.

## Raccourcis pendant la sortie

`Espace` pause · `A` / `Z` (ou `−` / `+`) vitesse plus facile / plus dure · `1`–`4` caméras · `C` caméra suivante · `H` masquer le HUD · `L` tour manuel · `F` plein écran · `↑` / `↓` puissance (trainer simulé).

## Structure

```
apps/web               Application React : écrans, HUD, scène 3D, orchestration de la sortie
packages/shared        Types communs, unités
packages/physics       Modèle physique pur (vitesse depuis la puissance)
packages/devices       FTMS / CPS / HRS : parsers, trainer et capteurs Web Bluetooth, appareils simulés
packages/route-engine  Format de route, boucles, interpolation, tours, manifeste de monde
packages/drivetrain    Vitesses virtuelles et pilotage du trainer (difficulté, stratégie S1)
packages/recorder      Enregistrement 1 Hz, stats, stockage IndexedDB, export .fit
tools/world-builder    Scripts hors ligne : relief réel, planificateur de routes, monde
content/worlds         Sources des mondes (points de passage des boucles)
```
