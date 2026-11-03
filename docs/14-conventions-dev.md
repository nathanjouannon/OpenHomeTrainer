# Conventions de développement

## 1. Structure du dépôt

```
HomeRealTrainer/
├── apps/
│   ├── web/                 # Application React (Vite)
│   ├── api/                 # API Fastify (phase 3)
│   └── realtime/            # Serveur multijoueur (phase 5)
├── packages/
│   ├── shared/              # Types, constantes, unités, schémas Zod
│   ├── devices/             # Web Bluetooth : FTMS, CPS, HRS, CSC, contrôleurs ; trainer simulé
│   ├── physics/             # Modèle physique (pur)
│   ├── route-engine/        # Parsing GPX/TCX/FIT, lissage, interpolation
│   ├── drivetrain/          # Vitesses virtuelles et stratégies
│   ├── controls/            # Hub de commandes et mapping
│   ├── workouts/            # Séances, parsers ZWO/ERG/MRC
│   ├── recorder/            # Enregistrement, stats, export FIT
│   ├── world/               # Rendu 3D du monde (Three.js / R3F)
│   ├── imagery/             # Mode B : ImageryProvider
│   └── ui/                  # Composants UI partagés (HUD, tuiles)
├── tools/
│   ├── world-builder/       # Pipeline MNT + OSM → monde
│   └── ble-inspector/       # Outils de debug BLE
├── content/                 # Sources des mondes (splines, configs) ; binaires lourds hors git (voir §5)
├── fixtures/
│   ├── ble/                 # Journaux BLE enregistrés
│   └── routes/              # GPX de test
├── docs/                    # Cette documentation
├── .github/workflows/
├── package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json · biome.json
└── CREDITS.md / assets-licenses.json
```

Nom de scope npm interne : `@hrt/*`.

## 2. Code

- TypeScript `strict`, `noUncheckedIndexedAccess`, modules ESM.
- Les packages « purs » (`physics`, `route-engine`, `drivetrain`, `workouts`, `recorder`) n'importent ni DOM, ni React, ni Three.js. Une règle de lint l'impose.
- Unités SI partout en interne (m, s, W, kg, rad). La conversion en km/h, mi ou ft se fait **uniquement** à l'affichage. Suffixes explicites dans les noms : `speedMs`, `distanceM`, `gradePercent`.
- Pas d'état global implicite : les stores sont injectés ou importés explicitement.
- Erreurs matérielles typées (`DeviceError` avec un code) et messages utilisateur traduits.
- Commentaires courts, utiles ; en anglais dans le code, documentation en français.

## 3. Git

- Le projet doit avoir **son propre dépôt git**. Aujourd'hui, le dépôt actif est le dossier personnel entier (`/Users/nathanjouannon`), ce qui est à corriger avant le premier commit (`git init` dans `HomeRealTrainer/`).
- Branche principale `main`, protégée ; branches `feat/…`, `fix/…`, `chore/…`.
- Commits au format **Conventional Commits** (`feat(devices): parse FTMS indoor bike data`).
- PR même en solo : la CI doit passer.
- Tags de version SemVer à chaque jalon (`v0.1.0` = M1).

## 4. CI (GitHub Actions)

Budget zéro : la vérification tourne **en local** via des hooks git (lefthook) : lint + typecheck + tests unitaires au commit, build + E2E au push. Si le dépôt est poussé sur GitHub, la même chaîne tourne dans GitHub Actions (gratuit pour un dépôt public, quota de minutes gratuites pour un dépôt privé). Le test d'endurance et le scénario de performance 3D sont lancés à la demande (`pnpm test:endurance`, `pnpm test:perf`). Pas de déploiement : l'application tourne en local.

## 5. Assets lourds

- Les sources (`.blend`, MNT bruts) ne sont **pas** dans git : dossier local hors dépôt (ex. `~/hrt-data/`), sauvegardé sur un disque externe ou un cloud personnel déjà disponible. Git LFS seulement dans la limite du quota gratuit.
- Les assets générés (chunks, glTF compressés) sont produits par `tools/world-builder` dans un dossier local servi par l'application, avec un **manifeste versionné** (`world.json` + hash). L'application charge une version précise du monde.

## 6. Documentation

- Toute décision structurante → un **ADR** dans `docs/adr/` (format : contexte, décision, conséquences, statut).
- Le PRD et la roadmap sont mis à jour à chaque fin de phase.
- Un `CHANGELOG.md` à la racine dès la première release.

## 7. Environnement local

- Node.js LTS, pnpm, Chrome.
- `pnpm dev` lance l'application sur `https://localhost` ou `http://localhost` (contexte sécurisé : Web Bluetooth fonctionne).
- Variable `VITE_DEV_DEVICES=simulated` pour démarrer avec le trainer simulé.
- Pour tester sur une tablette ou un autre appareil du réseau local : HTTPS obligatoire (certificat local via `mkcert` ou tunnel).
