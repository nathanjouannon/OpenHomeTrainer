# Qualité et stratégie de tests

## 1. Pyramide de tests

| Niveau | Outil | Cible | Exemples |
|---|---|---|---|
| Unitaires | Vitest | `physics`, `devices` (parsers), `route-engine`, `workouts`, `recorder`, `drivetrain`, `controls` | Vitesse stationnaire vs solveur de référence ; décodage d'une trame `0x2AD2` réelle ; lissage d'un GPX bruité ; encodage FIT relu par le décodeur officiel ; calcul des rapports virtuels |
| Propriétés | fast-check | physics, route-engine | La vitesse n'est jamais négative ; la distance est monotone ; la pente lissée est bornée ; sur une boucle, `sampleAt` est continu au raccord et périodique (`sampleAt(d) = sampleAt(d + longueurTour)`) |
| Intégration | Vitest + jsdom / fake-indexeddb | Boucle de simulation + trainer simulé + recorder | Sortie simulée de 30 min accélérée → stats et FIT cohérents |
| Composants | Vitest + Testing Library | HUD, écrans | Affichage d'un capteur déconnecté |
| E2E | Playwright | Parcours complet dans Chrome | Mock de `navigator.bluetooth` (injecté via `addInitScript`) qui rejoue un journal BLE ; « appairer → rouler 2 min → terminer → exporter » |
| Visuel / perf | Playwright + scénario de caméra scripté | Monde 3D | FPS moyen et 1 % low sur un trajet fixé ; captures de référence |
| Matériel | Manuel, checklist | Vrais trainers | Matrice ci-dessous |

## 2. Fixtures matérielles

- Chaque nouveau modèle de trainer ou de contrôleur testé → **journal BLE enregistré** (outil de debug, [03 §6](03-materiel-protocoles.md)) → ajouté à `fixtures/ble/<marque>-<modèle>.json`.
- Les parsers sont testés sur toutes les fixtures à chaque CI.

## 3. Matrice de tests matériels (à compléter)

| Appareil | Connexion | Puissance | Cadence | SIM | ERG | Vitesses virtuelles S1 / S3 | Reconnexion | Testé le |
|---|---|---|---|---|---|---|---|---|
| (ton trainer) | | | | | | | | |
| Ceinture cardio | | — | — | — | — | — | | |
| Zwift Click / Play (phase 4) | | — | — | — | — | | | |

## 4. Budgets automatisés (CI)

| Budget | Seuil |
|---|---|
| Bundle JS initial (gzip) | < 400 ko hors Three.js ; < 900 ko total |
| Temps de `physics.step` | < 0,05 ms |
| Couverture `physics`, `devices`, `route-engine`, `drivetrain` | ≥ 80 % |
| Lighthouse (pages hors 3D) | Performance ≥ 85, accessibilité ≥ 90 |

## 5. Tests d'endurance

Sortie simulée de **6 h** en accéléré (trainer simulé, vitesse de simulation ×10) sur la plus petite boucle, soit plusieurs dizaines de tours, en CI nocturne : mémoire JS stable, IndexedDB cohérente, nombre de tours et laps FIT corrects, aucune dérive de position au raccord, pas d'erreur. Une session réelle de 2 h par release majeure.

## 6. Definition of Done (par fonctionnalité)

- Code typé, linté, relu (auto-relecture via PR si développeur seul).
- Tests unitaires pour la logique ; E2E mis à jour si le parcours change.
- Testé sur un vrai trainer si la fonctionnalité touche au matériel.
- Pas de régression de FPS sur le scénario de référence.
- Documentation (`docs/`) mise à jour si une décision change → nouvel ADR ou ADR amendé.
- Traductions FR/EN présentes.
