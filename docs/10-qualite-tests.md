# Qualité et stratégie de tests

## 1. Pyramide de tests

| Niveau | Outil | Cible | Exemples |
|---|---|---|---|
| Unitaires | Vitest | `physics`, `devices` (parsers), `route-engine`, `workouts`, `recorder`, `drivetrain`, `controls` | Vitesse stationnaire vs solveur de référence ; décodage d'une trame `0x2AD2` réelle ; lissage d'un GPX bruité ; encodage FIT relu par le décodeur officiel ; calcul des rapports virtuels |
| Propriétés | fast-check | physics, route-engine | La vitesse n'est jamais négative ; la distance est monotone ; la pente lissée est bornée ; sur une boucle, `sampleAt` est continu au raccord et périodique (`sampleAt(d) = sampleAt(d + longueurTour)`) |
| Intégration | Vitest + jsdom / fake-indexeddb | Boucle de simulation + trainer simulé + recorder | Sortie simulée de 30 min accélérée → stats et FIT cohérents |
| Composants | Vitest + Testing Library | HUD, écrans | Affichage d'un capteur déconnecté |
| E2E | Playwright | Parcours complet dans Chrome | Mock de `navigator.bluetooth` (injecté via `addInitScript`) qui rejoue un journal BLE ; « appairer → rouler 2 min → terminer → exporter » |
| Visuel / perf | Playwright + banc de comparaison (`pnpm bench`, §7) | Monde 3D | Captures figées de points de vue fixes ; FPS moyen et 1 % low, draw calls, triangles, mémoire GPU par qualité ; rapport avant/après |
| Matériel | Manuel, checklist | Vrais trainers | Matrice ci-dessous |

## 2. Fixtures matérielles

- Chaque nouveau modèle de trainer ou de contrôleur testé → **journal BLE enregistré** (outil de debug, [03 §6](03-materiel-protocoles.md)) → ajouté à `fixtures/ble/<marque>-<modèle>.json`.
- Les parsers sont testés sur toutes les fixtures à chaque CI.

## 3. Matrice de tests matériels (à compléter)

| Appareil | Connexion | Puissance | Cadence | SIM | ERG | Vitesses virtuelles S1 / S3 | Reconnexion | Testé le |
|---|---|---|---|---|---|---|---|---|
| (ton trainer) | | | | | | | | |
| Ceinture cardio | | — | — | — | — | — | | |
| Zwift Click / Play (phase 5) | | — | — | — | — | | | |

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
- Pas de régression de FPS sur le banc de comparaison (§7) pour toute modification du rendu.
- Documentation (`docs/`) mise à jour si une décision change → nouvel ADR ou ADR amendé.
- Traductions FR/EN présentes.

## 7. Banc de comparaison du rendu (lot 2.0)

Sert de référence à tous les lots de la phase 2 : chaque changement du rendu se juge sur les **mêmes images** et les **mêmes mesures** avant et après.

### Utilisation

```sh
pnpm bench -- --label avant-2.1            # build, serveur local, 16 points de vue × 3 qualités (~5 min)
pnpm bench -- --label apres-2.1
pnpm bench:compare avant-2.1 apres-2.1     # bench-results/compare-avant-2.1-vs-apres-2.1.html
```

Options utiles : `--quality medium`, `--views col-sommet,lac-foret`, `--duration 8`, `--no-build`, `--url http://localhost:5173` (serveur déjà lancé), `--headed` (Chrome visible), `--vsync` (FPS plafonné par l'écran). Chaque run écrit `bench-results/<label>/` : `captures/<point de vue>@<qualité>.jpg`, `results.json` et `report.html`. Le dossier est hors git (environ 15 Mo par run) ; garder au moins le run de référence `phase-1`.

La page `#/bench` s'utilise aussi à la main : choix du point de vue et de la qualité, mesure d'un point ou de tous.

### Points de vue

16 points de vue fixes sur les 3 boucles, définis dans `apps/web/src/bench/viewpoints.ts` : route dégagée, forêt, village, montée, sommet et lac, surtout en vue POV (hauteur de cycliste) avec quelques vues poursuite et drone. **On n'en modifie jamais l'identifiant ni la position** (les comparaisons en dépendent) : on en ajoute.

### Méthode

- **Images reproductibles** : pour une prise, la page `#/bench?auto=1` monte une scène neuve, avec une horloge d'animation à pas fixe (1/60 s par image) et un aléa à graine fixe (piétons, voitures). Après 120 images, l'animation est figée et la capture est prise. Deux runs du même code donnent des captures identiques à l'octet près, quel que soit le FPS.
- **FPS** : mesuré ensuite pendant 4 s avec les animations en temps réel, **sans plafond d'écran** (vsync désactivé) pour voir la marge au-dessus de 60 FPS. Chrome tourne sans fenêtre mais avec le GPU (Metal sur Mac), en 1920 × 1080 et ratio de pixels 1.
- **Draw calls et triangles** : ceux de l'image capturée (déterministes).
- **Mémoire GPU** : **estimée** (ni WebGL ni WebGPU ne l'exposent) en additionnant les buffers de géométrie et d'instances, les textures avec leurs mipmaps, les shadow maps et le framebuffer du canvas (`apps/web/src/world/gpu-memory.ts`). Utile pour comparer deux versions, pas comme valeur absolue.
- **Budgets** ([05 §4](05-monde-virtuel.md)) : FPS moyen ≥ 60 en qualité basse et moyenne, ≥ 30 en haute ; en basse et moyenne, < 300 draw calls, < 2 M triangles, < 1,5 Go de mémoire GPU. Les dépassements sont signalés dans la console et en rouge dans les rapports.
- **Bruit** : sur la config de référence (MacBook Air M1, sans ventilateur), deux runs du même build diffèrent d'environ ±6 % sur le FPS moyen et jusqu'à ±16 % sur le 1 % low. Le comparateur ignore les écarts sous ±10 % (FPS moyen) et ±20 % (1 % low). Comparer des runs faits dans les mêmes conditions (secteur branché, machine au repos) ; le comparateur prévient si le GPU, la résolution ou les options diffèrent.

### Référence : fin de phase 1 (run `phase-1`, 2026-11-03)

MacBook Air M1, Chrome 156 sans fenêtre, WebGL2, 1920 × 1080. Pire cas sur les 16 points de vue :

| Qualité | FPS moyen min. | 1 % low min. | Draw calls max. | Triangles max. | Mémoire GPU estimée |
|---|---|---|---|---|---|
| Basse | 295 | 152 | 267 | 1,43 M | 122 Mo |
| Moyenne | 199 | 115 | 279 | 1,73 M | 188 Mo |
| Haute | 136 | 76 | 295 | 3,06 M | 191 Mo |

À retenir pour la suite de la phase 2 :

- la marge de FPS est large (≥ 199 FPS en qualité moyenne) : il y a de la place pour les ombres, le post-traitement et la végétation ;
- les **draw calls sont déjà proches du budget** (279 en moyenne sur `collines-montee`, beaucoup de petits objets de bord de route) : les ombres portées vont ajouter une passe de rendu, donc il faudra fusionner ou instancier davantage ;
- en qualité haute, le nombre de triangles dépasse 2 M sur 8 points de vue (arbres lointains) : sans conséquence sur le FPS aujourd'hui, mais les imposteurs du lot 2.6 doivent le faire baisser ;
- défaut repéré grâce aux captures : à Port-Vérane (`col-port-verane`), un bâtiment semble flotter au-dessus du terrain, en haut à droite de l'image.

