# HomeRealTrainer

Simulation de sortie vélo sur home trainer connecté, dans le navigateur. Documentation de conception : [docs/README.md](docs/README.md).

## Démarrage

Prérequis : Node.js ≥ 20.19 (LTS 24 recommandé), pnpm 10, Chrome ou Edge.

```sh
pnpm install
pnpm fetch-dem      # télécharge le relief réel du spike 3D (une fois)
pnpm dev            # http://localhost:5173
```

| Commande                    | Rôle                                                    |
| --------------------------- | ------------------------------------------------------- |
| `pnpm dev`                  | Application web (Vite)                                  |
| `pnpm test`                 | Tests unitaires (Vitest) de tous les packages           |
| `pnpm typecheck`            | Vérification TypeScript                                 |
| `pnpm lint` / `pnpm format` | Biome                                                   |
| `pnpm verify`               | Lint + typecheck + tests (ce que lancent les hooks git) |
| `pnpm build`                | Build de production                                     |

Les hooks git (lefthook) lancent lint, typecheck et tests au commit, et le build au push.

## Structure

```
apps/web               Application React (pages de spike : #/ble, #/3d)
packages/shared        Types communs, unités
packages/physics       Modèle physique pur (vitesse depuis la puissance)
packages/devices       FTMS / CPS / HRS : parsers, trainer Web Bluetooth, trainer simulé, journal BLE
tools/world-builder    Scripts hors ligne (fetch-dem)
```
