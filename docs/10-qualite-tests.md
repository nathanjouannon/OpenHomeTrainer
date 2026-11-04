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
pnpm bench -- --label avant-2.1            # build, serveur local, 18 points de vue × 3 qualités (~6 min)
pnpm bench -- --label apres-2.1
pnpm bench:compare avant-2.1 apres-2.1     # bench-results/compare-avant-2.1-vs-apres-2.1.html
```

Options utiles : `--quality medium`, `--views col-sommet,lac-foret`, `--duration 8`, `--no-build`, `--url http://localhost:5173` (serveur déjà lancé), `--headed` (Chrome visible), `--vsync` (FPS plafonné par l'écran), `--webgl2` (force le repli WebGL2 ; sans cette option, Chrome sans fenêtre tourne en WebGPU sur Mac). Le backend utilisé est noté dans le rapport, et le comparateur prévient si deux runs n'ont pas le même. Chaque run écrit `bench-results/<label>/` : `captures/<point de vue>@<qualité>.jpg`, `results.json` et `report.html`. Le dossier est hors git (environ 15 Mo par run) ; garder au moins le run de référence `phase-1`.

La page `#/bench` s'utilise aussi à la main : choix du point de vue et de la qualité, mesure d'un point ou de tous.

### Points de vue

18 points de vue fixes sur les 3 boucles, définis dans `apps/web/src/bench/viewpoints.ts` : route dégagée, forêt, village, montée, sommet et lac, surtout en vue POV (hauteur de cycliste) avec quelques vues poursuite et drone. Les 16 premiers datent du lot 2.0 ; `lac-clotures` (prés clôturés) et `col-muret` (muret au-dessus du lac) ont été ajoutés au lot 2.5 pour juger le mobilier de bord de route de près. **On n'en modifie jamais l'identifiant ni la position** (les comparaisons en dépendent) : on en ajoute.

### Méthode

- **Images reproductibles** : pour une prise, la page `#/bench?auto=1` monte une scène neuve, avec une horloge d'animation à pas fixe (1/60 s par image) et un aléa à graine fixe (piétons, voitures). Après 120 images, l'animation est figée et la capture est prise. Deux runs du même code donnent des captures identiques à l'octet près, quel que soit le FPS.
- **FPS** : mesuré ensuite pendant 4 s avec les animations en temps réel, **sans plafond d'écran** (vsync désactivé) pour voir la marge au-dessus de 60 FPS. Chrome tourne sans fenêtre mais avec le GPU (Metal sur Mac), en 1920 × 1080 et ratio de pixels 1.
- **Draw calls et triangles** : ceux de l'image capturée (déterministes).
- **Mémoire GPU** : **estimée** (ni WebGL ni WebGPU ne l'exposent) en additionnant les buffers de géométrie et d'instances, les textures avec leurs mipmaps, les shadow maps, le framebuffer du canvas et, depuis le lot 2.1, le tampon de sortie en demi-flottants de `WebGPURenderer` (`apps/web/src/world/gpu-memory.ts`). Utile pour comparer deux versions, pas comme valeur absolue.
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

### Après la bascule WebGPU (runs `apres-2.1-webgpu` et `apres-2.1-webgl2`, 2026-11-03)

Même machine et mêmes conditions que `phase-1`. Pire cas sur les 16 points de vue, et FPS moyen médian :

| Qualité | Backend | FPS moyen min. | FPS moyen médian | 1 % low min. | Draw calls max. | Triangles max. | Mémoire GPU estimée |
|---|---|---|---|---|---|---|---|
| Basse | WebGPU | 383 | 452 | 53 | 268 | 1,43 M | 138 Mo |
| Basse | WebGL2 (repli) | 268 | 345 | 175 | 268 | 1,43 M | 138 Mo |
| Moyenne | WebGPU | 252 | 300 | 62 | 280 | 1,73 M | 235 Mo |
| Moyenne | WebGL2 (repli) | 128 | 152 | 68 | 280 | 1,73 M | 235 Mo |
| Haute | WebGPU | 127 | 193 | 10 | 296 | 3,06 M | 239 Mo |
| Haute | WebGL2 (repli) | 82 | 113 | 44 | 296 | 3,06 M | 239 Mo |

(`phase-1`, `WebGLRenderer` : FPS moyen médian 415 / 239 / 176.)

- **Images** : identiques à l'œil à celles de `phase-1` sur les deux backends ; seul le ciel est un peu plus bleu (shader `SkyMesh` de Three.js).
- **WebGPU** : FPS moyen en hausse (+25 % en médiane en qualité moyenne, +10 % en haute).
- **1 % low en WebGPU** : sans plafond d'écran, une image sur quelques centaines dure 80 à 150 ms sur les points de vue les plus chargés, sans création de shader, de géométrie ni de texture à ce moment-là. C'est le rythme d'images de WebGPU quand le GPU est saturé bien au-delà de la fréquence de l'écran. **Avec `--vsync`** (usage réel), les trois pires points de vue en qualité haute tiennent 60 FPS avec un 1 % low à 57. Pour juger les à-coups en WebGPU, faire un run `--vsync`.
- **Repli WebGL2** : environ 35 % plus lent que l'ancien `WebGLRenderer` (passe de sortie supplémentaire, backend WebGL de `WebGPURenderer` moins optimisé), mais toujours bien au-dessus des budgets (≥ 128 FPS en moyenne, ≥ 82 en haute).
- **Draw calls** : +1 (la passe qui copie le tampon de sortie dans le canvas). **Mémoire estimée** : +47 Mo à 1080p avec MSAA, à cause du tampon de sortie en demi-flottants.

### Après la lumière et les ombres (runs `apres-2.2-webgpu` et `apres-2.2-webgl2`, 2026-11-03)

Même machine et mêmes conditions. Pire cas sur les 16 points de vue, et FPS moyen médian :

| Qualité | Backend | FPS moyen min. | FPS moyen médian | 1 % low min. | Draw calls max. | Triangles max. | Mémoire GPU estimée |
|---|---|---|---|---|---|---|---|
| Basse | WebGPU | 334 | 462 | 149 | 225 | 1,43 M | 142 Mo |
| Basse | WebGL2 (repli) | 227 | 299 | 127 | 225 | 1,43 M | 142 Mo |
| Moyenne | WebGPU | 175 | 225 | 33 | 282 | 1,95 M | 264 Mo |
| Moyenne | WebGL2 (repli) | 94 | 113 | 55 | 282 | 1,95 M | 264 Mo |
| Haute | WebGPU | 101 | 149 | 12 | 298 | 3,28 M | 340 Mo |
| Haute | WebGL2 (repli) | 63 | 80 | 34 | 298 | 3,28 M | 340 Mo |

- **Images** : ombres portées du cycliste, des arbres, des maisons, des lampadaires et des voitures ; lumière d'ambiance plus douce (HDRI) ; image un peu plus terne avec AgX, que l'étalonnage du lot 2.3 doit corriger.
- **Coût des ombres** (qualité moyenne, WebGPU) : FPS moyen médian 300 → 225 (−25 %), triangles max. 1,73 → 1,95 M (les objets proches redessinés dans 3 cascades), mémoire +29 Mo (cartes d'ombres et HDRI).
- **Draw calls** : en baisse en basse qualité (268 → 225) grâce à la fusion des pièces du cycliste ; en moyenne et haute, la fusion compense les passes d'ombre (282 et 298 au maximum, toujours sur `collines-montee`).
- Points de vigilance : le budget de 2 M triangles est presque atteint en qualité moyenne (`col-rive-lac`) ; les imposteurs du lot 2.6 doivent le faire baisser.

### Après le post-traitement (runs `apres-2.3-webgpu` et `apres-2.3-webgl2`, 2026-11-03)

Même machine et mêmes conditions. Pire cas sur les 16 points de vue, et FPS moyen médian :

| Qualité | Backend | FPS moyen min. | FPS moyen médian | 1 % low min. | Draw calls max. | Triangles max. | Mémoire GPU estimée |
|---|---|---|---|---|---|---|---|
| Basse | WebGPU | 237 | 460 | 152 | 225 | 1,43 M | 150 Mo |
| Basse | WebGL2 (repli) | 243 | 274 | 149 | 225 | 1,43 M | 150 Mo |
| Moyenne | WebGPU | 107 | 130 | 54 | 299 | 1,95 M | 239 Mo |
| Moyenne | WebGL2 (repli) | 75 | 84 | 39 | 299 | 1,95 M | 239 Mo |
| Haute | WebGPU | 62 | 74 | 25 | 315 | 3,28 M | 316 Mo |
| Haute | WebGL2 (repli) | 43 | 56 | 23 | 315 | 3,28 M | 316 Mo |

- **Images** : couleurs plus contrastées et plus saturées (étalonnage), occlusion au pied des murs, des bordures et sous les voitures, halo discret face au soleil, bords lissés par SMAA.
- **Coût** (qualité moyenne, WebGPU) : FPS moyen médian 225 → 130, surtout l'occlusion ambiante (~2 ms) ; halo + SMAA ~1 ms, compensés en partie par la fin du MSAA du canvas. Tous les budgets de FPS restent tenus, mais la marge pour les shaders du terrain (lot 2.4) se réduit : à surveiller.
- **Draw calls** : +15 environ (passes du post-traitement) ; 299 au maximum en qualité moyenne (`collines-montee`), à la limite du budget de 300. La mémoire baisse un peu (plus de tampons MSAA).

### Après les matières du terrain (runs `apres-2.4-webgpu` et `apres-2.4-webgl2`, 2026-11-03)

Même machine et mêmes conditions. Pire cas sur les 16 points de vue, et FPS moyen médian :

| Qualité | Backend | FPS moyen min. | FPS moyen médian | 1 % low min. | Draw calls max. | Triangles max. | Mémoire GPU estimée |
|---|---|---|---|---|---|---|---|
| Basse | WebGPU | 206 | 328 | 125 | 225 | 1,43 M | 222 Mo |
| Basse | WebGL2 (repli) | 162 | 248 | 97 | 225 | 1,43 M | 222 Mo |
| Moyenne | WebGPU | 78 | 105 | 33 | 299 | 1,95 M | 311 Mo |
| Moyenne | WebGL2 (repli) | 69 | 82 | 37 | 299 | 1,95 M | 311 Mo |
| Haute | WebGPU | 51 | 62 | 21 | 315 | 3,28 M | 388 Mo |
| Haute | WebGL2 (repli) | 41 | 55 | 24 | 315 | 3,28 M | 388 Mo |

- **Images** : plus d'aplats sur le terrain : herbe et prairie par taches, terre sous les bois denses, le long des accotements et sur les rives, roche sur les pentes raides et les talus des routes, éboulis en altitude ; aucun motif répété visible à hauteur de cycliste. Draw calls et triangles inchangés (le terrain garde une matière par LOD).
- **Coût** (qualité moyenne, WebGPU) : FPS moyen médian 130 → 105. La première version échantillonnait les 6 matières sur chaque pixel (médian ~70, 66 au pire sur `col-sommet`) ; le shader n'échantillonne plus que les couches présentes au pixel (1 à 3 en général).
- **Repli WebGL2** : sans échantillonnage stochastique (triplanaire gardé), il retrouve presque son niveau du lot 2.3 (82 contre 84 en médiane en qualité moyenne). Avec le stochastique, il passait sous les budgets (53 FPS au pire en moyenne, 21 en haute).
- **Mémoire estimée** : +72 Mo, surtout les deux *texture arrays* (6 couches 1024², mipmaps comprises, ~67 Mo) et les poids de la splatmap dans les sommets. L'estimation compte désormais les textures des matières TSL (`userData.textures`).
- **Mesure** : le MacBook Air chauffe pendant les runs longs enchaînés (jusqu'à −25 % de FPS sur le run suivant). Laisser refroidir la machine quelques minutes entre deux runs complets.
- Points de vigilance : marge réduite en qualité haute (51 FPS au pire en WebGPU, 41 en WebGL2, toujours ≥ 30) ; à surveiller pour la végétation du lot 2.6.

### Après la route et ses abords (runs `apres-2.5-webgpu` et `apres-2.5-webgl2`, 2026-11-03)

Même machine et mêmes conditions. Pire cas sur les 16 points de vue d'origine (les 2 nouveaux, `lac-clotures` et `col-muret`, ne changent aucun pire cas), et FPS moyen médian :

| Qualité | Backend | FPS moyen min. | FPS moyen médian | 1 % low min. | Draw calls max. | Triangles max. | Mémoire GPU estimée |
|---|---|---|---|---|---|---|---|
| Basse | WebGPU | 195 | 286 | 29 | 179 | 1,38 M | 259 Mo |
| Basse | WebGL2 (repli) | 133 | 197 | 78 | 179 | 1,38 M | 259 Mo |
| Moyenne | WebGPU | 84 | 104 | 39 | 259 | 1,90 M | 349 Mo |
| Moyenne | WebGL2 (repli) ¹ | 66 | 75 | 34 | 259 | 1,90 M | 349 Mo |
| Haute | WebGPU | 54 | 62 | 26 | 275 | 3,29 M | 426 Mo |
| Haute | WebGL2 (repli) | 41 | 49 | 22 | 275 | 3,29 M | 426 Mo |

¹ Run `check-2.5-webgl2-medium`, refait après 4 min de repos : enchaîné juste après le run WebGPU, le run complet `apres-2.5-webgl2` donnait 53 FPS au pire (`collines-plaine`) et 70 en médiane, la machine ayant chauffé.

- **Images** : asphalte texturé avec ses sections de réfection, ornières, rapiéçages, fissures et marquages usés ; accotements en gravier au bord irrégulier, talus et fossés fondus dans le terrain ; glissières sur les pentes du col et des collines, murets au-dessus du lac (`col-muret`), clôtures de prés dans la plaine (`lac-clotures`), balises tous les 50 m.
- **Draw calls** : −40 en qualité moyenne et haute (299 → 259 et 315 → 275 sur `collines-montee`), −46 en basse : les rubans de route (asphalte, accotements, trottoirs, bordures) de toutes les boucles et de tous les villages sont fusionnés, ce qui libère de la place sous le budget de 300 pour la végétation du lot 2.6. Le mobilier ajoute un draw call par sorte et par passe (4 sortes, plus leurs copies d'ombre).
- **Triangles** : stables, voire en baisse (1,95 → 1,90 M au pire en moyenne). Dessiner les accotements à fossés de tout le monde aurait ajouté ~200 000 triangles : ils sont découpés en tronçons de 1 km masqués au-delà de 1,3 km, et le mobilier n'est dessiné qu'à moins de 900 m.
- **Coût** : FPS médian en qualité moyenne inchangé en WebGPU (105 → 104) par rapport au run `apres-2.4-webgpu`, −9 % en WebGL2 (82 → 75). À conditions thermiques égales (référence 2.4 refaite juste avant sur 6 points de vue), le lot coûte ~12 % en WebGPU : ~5 % pour la texture d'asphalte, ~5 % pour ses détails procéduraux, le reste pour le mobilier et les accotements. La première version du shader d'asphalte (une douzaine de bruits de Perlin par pixel, échantillonnage stochastique) coûtait 30 % ; elle lit maintenant ses bruits fins dans une texture de bruit de 256² et reçoit les bruits lents des sommets.
- **Mémoire estimée** : +38 Mo (les trois textures de la route, ~34 Mo avec leurs mipmaps, et la texture de bruit).
- **Repli sans assets** (manifeste masqué, qualité basse) : asphalte et gravier procéduraux, muret uni ; rien ne manque.
- Points de vigilance : la marge en qualité haute reste réduite (54 FPS au pire en WebGPU, 41 en WebGL2) ; le 1 % low en WebGPU sans plafond d'écran reste à juger avec `--vsync` (voir lot 2.1).
