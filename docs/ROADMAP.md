# Roadmap — HomeRealTrainer

**Contraintes transverses** : budget de 0 € (hors outil d'IA déjà payé) et exécution uniquement en local pour l'instant ([ADR 0010](adr/0010-budget-zero-execution-locale.md)).

Les estimations sont en **semaines de développement pour 1 développeur à plein temps**. En temps partiel (soirs et week-ends), il faut les multiplier par environ 2,5 à 3. Elles servent à ordonner le travail, pas à s'engager sur des dates.

## Vue d'ensemble

```
Phase 0  Fondations & spikes techniques        ██                 1–2 sem.   ✅
Phase 1  MVP solo — Monde virtuel              █████████          7–9 sem.   ✅ jalon M1 : MVP (clôturée le 2026-11-03)
Phase 2  Rendu réaliste                        ███████            5–7 sem.   ← jalon M2 : monde crédible
Phase 3  Entraînement, vitesses virt., comptes █████████          6–9 sem.   ← jalon M3 : bêta privée
Phase 4  Mondes réels (cols alpins)            ████████████       8–12 sem.  ← jalon M4 : monde fidèle
Phase 5  Mode monde réel (bêta)                █████████          6–9 sem.   ← jalon M5 : mode B
Phase 6  Multijoueur & social                  ████████           6–8 sem.   ← jalon M6 : bêta publique
Phase 7  Contenu, polish, plateformes          continu
```

Principe directeur : **chaque phase se termine par quelque chose de jouable sur un vrai home trainer.**

---

## Phase 0 — Fondations et spikes (1–2 sem.) ✅

**Objectif** : lever les inconnues techniques les plus risquées avant d'investir dans le reste.

| Livrable | Détail |
|---|---|
| Monorepo initialisé | pnpm + Turborepo, apps `web`, packages `physics`, `devices`, `shared` ; lint, format, Vitest, CI GitHub Actions. Voir [14](14-conventions-dev.md). |
| **Spike BLE** | Page de test (**dès la livraison du trainer** ; en attendant, trainer simulé) : connexion à **ton** trainer (Van Rysel D500 ou Wahoo KICKR) en FTMS, lecture puissance et cadence, envoi d'une pente et d'une puissance cible ERG. Journal des trames brutes. |
| **Spike 3D** | Scène Three.js : terrain 4 × 4 km depuis un MNT réel, route en spline, caméra qui suit, 10 000 arbres instanciés. Mesure des FPS sur la config de référence. |
| Spike physique | Fonction `simulateStep()` testée contre des valeurs de référence. |
| Trainer simulé | Appareil virtuel (puissance réglée au clavier) implémentant la même interface que le vrai trainer. |

**Critères de sortie**

- La résistance du trainer change quand on envoie 0 %, 5 % puis 10 % de pente.
- La scène 3D tient au moins 50 FPS sur la config de référence.
- Décision confirmée sur Three.js ([ADR 0003](adr/0003-rendu-3d-threejs.md)) ou bascule sur Babylon.js si le spike échoue.

---

## Phase 1 — MVP solo en monde virtuel (7–9 sem.) → **Jalon M1** ✅ clôturée le 2026-11-03

**Objectif** : une vraie séance complète sur une route d'un monde original, avec export.

| Lot | Contenu |
|---|---|
| 1.1 Appareils | Appairage trainer, cardio et capteur de puissance ; reconnexion automatique ; mémorisation des appareils ; mode SIM. |
| 1.2 Physique | Modèle complet ([04](04-moteur-physique.md)) ; difficulté du trainer réglable ; lissage de la pente envoyée. |
| 1.3 Route engine | Format de route interne, échantillonnage à distance fixe, profil, interpolation position/pente/cap ; **boucles fermées** : distance modulo le tour, raccord continu à la ligne, détection du passage de ligne et comptage des tours. |
| 1.4 Monde v1 | Une zone d'environ 8 × 8 km, **3 boucles** (plate, vallonnée, avec col), terrain, routes, végétation, ciel, eau. Voir [05](05-monde-virtuel.md). |
| 1.5 Avatar | Cycliste et vélo, pédalage synchronisé, 3 caméras. |
| 1.6 HUD | Puissance (instantanée et 3 s), cadence, FC, vitesse, distance, temps, pente, mini-carte, profil du tour avec position, **tour en cours / temps au tour / meilleur tour**. |
| 1.7 Enregistrement | Échantillons à 1 Hz dans IndexedDB, sauvegarde incrémentale, récapitulatif avec tableau des tours, **export `.fit`** avec un lap par tour. |
| 1.8 Profil et réglages | Poids, FTP, vélo, unités, difficulté, qualité graphique ; FR/EN. |
| 1.9 Historique | Liste des sorties locales et détail. |
| 1.10 Exécution locale | Build de production servi en local (`pnpm preview` sur `localhost`), assets du monde servis depuis le disque ; script de démarrage en une commande. Aucun hébergement public (budget zéro). |
| 1.11 **Vitesses virtuelles de base** | Indispensables avec le Zwift Cog : package `@hrt/drivetrain`, transmission séquentielle par défaut (24 rapports), stratégie S1 (décalage de pente), passage au clavier (`A`/`Z`), indicateur de rapport dans le HUD. |

**Critères de sortie (Definition of Done du MVP)**

- Sortie de **3 h en enchaînant les tours** de la boucle du col, sans crash, sans chute de FPS sous 30, sans perte de connexion non récupérée, et sans à-coup visuel ni de résistance au passage de ligne.
- Fichier `.fit` accepté par Strava et Garmin Connect, avec puissance, cadence, FC et altitude correctes.
- Testé sur au moins 2 trainers différents (le tien + un autre emprunté, ou un capteur de puissance seul ; aucun achat de matériel).
- Toutes les user stories **M** du [PRD](PRD.md) hors mode B sont validées.

### Bilan de clôture (2026-11-03, branche `feat/phase-1`)

La phase est clôturée : tous les lots sont livrés. Les critères qui ne peuvent être vérifiés que sur le vrai matériel (trainer pas encore livré, voir Q2 dans [13](13-questions-ouvertes.md)) et les finitions restantes sont **reportés** dans les phases suivantes. Le rendu du monde, jugé trop proche d'un prototype, fait l'objet d'une phase dédiée (phase 2).

| Lot | État | Reporté |
|---|---|---|
| 1.1 Appareils | ✅ Trainer FTMS, ceinture cardio, capteur de puissance, reconnexion automatique, mémorisation, appareils simulés | Validation sur le vrai trainer → lot 3.13 |
| 1.2 Physique | ✅ Difficulté réglable, descente atténuée, lissage de la pente envoyée, envoi ≥ 1×/s | — |
| 1.3 Route engine | ✅ Format de route, boucles, raccord continu, comptage des tours | — |
| 1.4 Monde v1 | ✅ « Val de Vérane » 10 × 10 km, 3 boucles, terrain par tuiles avec LOD, lac, forêts, ciel ; 5 villages (maisons, trottoirs, lampadaires, panneaux, piétons, voitures garées), fermes, balises, voitures en sens inverse, accotements | Textures PBR, ombres, herbe 3D, eau réfléchissante, glissières en montagne → phase 2 |
| 1.5 Avatar | ✅ Cycliste procédural (pédalage par IK à la cadence, danseuse), cintre route avec cocottes ; 4 caméras dont POV (par défaut, avec ses propres bras) | Modèle glTF (MakeHuman) → lot 2.10 ; tenues → phase 3 |
| 1.6 HUD | ✅ Tuiles, profil du tour, mini-carte, tours, rapport, alertes | Tuiles configurables, modes daltoniens → lot 3.12 |
| 1.7 Enregistrement | ✅ 1 Hz, sauvegarde toutes les 10 s, reprise après plantage, `.fit` relu par le SDK Garmin | Import réel sur Strava et Garmin Connect → lot 3.13 |
| 1.8 Profil et réglages | ✅ Profil, unités, difficulté, qualité, transmission, FR/EN | — |
| 1.9 Historique | ✅ Liste, récapitulatif, tableau des tours, export, suppression | — |
| 1.10 Exécution locale | ✅ `pnpm start` | — |
| 1.11 Vitesses virtuelles | ✅ Plateaux 50/34 et cassette de 10 à 13 vitesses au choix ; `A`/`Z` un pignon, `Q`/`S` le plateau, changement de plateau automatique en bout de cassette ; stratégie S1 ; rapport « 50×21 » dans le HUD | Réglage du gain S1 sur le vrai trainer → lot 3.13 |

Un test automatique simule déjà 6 h de sortie (tours, échantillons, pas de dérive). Restent reportés au lot 3.13 : sortie de 3 h sur la boucle du col (FPS ≥ 30 sur la config de référence), `.fit` accepté par Strava et Garmin Connect, test sur 2 trainers, tests E2E Playwright.

---

## Phase 2 — Rendu réaliste (5–7 sem.) → **Jalon M2 : monde crédible**

**Objectif** : passer d'un rendu de prototype (relief en aplats de couleur, pas d'ombres, arbres géométriques, motifs répétés sur la route) à un rendu **« réaliste stylisé »** crédible à hauteur de cycliste, tel que prévu dans [05 §4](05-monde-virtuel.md), sans perdre la fluidité. Budget 0 € : uniquement des assets CC0 (Poly Haven, ambientCG).

**Ordre** : la bascule WebGPU se fait **en premier**, pour écrire une seule fois les shaders (terrain, herbe, eau) et le post-traitement en TSL, qui fonctionne aussi en repli WebGL2. Viennent ensuite la lumière et les matières (le plus gros gain visuel), puis la végétation.

| Lot | Contenu |
|---|---|
| 2.0 Banc de comparaison ✅ | Points de vue fixes sur chaque boucle (route dégagée, forêt, village, col, lac) avec captures automatiques avant/après ; mesure FPS, draw calls, triangles et mémoire GPU par niveau de qualité. Sert de référence pour tous les lots suivants. **Livré le 2026-11-03** : `pnpm bench`, `pnpm bench:compare`, run de référence `phase-1` ([10 §7](10-qualite-tests.md)). |
| 2.1 **WebGPU** ✅ | Bascule sur `WebGPURenderer` de Three.js avec repli WebGL2 automatique ; matériaux et shaders en TSL ; vérification de compatibilité avec React Three Fiber. Mise à jour de l'[ADR 0003](adr/0003-rendu-3d-threejs.md). **Livré le 2026-11-03** : ciel réécrit en TSL, réglage « Moteur de rendu » (Automatique / WebGL2), banc mesuré sur les deux backends (`pnpm bench -- --webgl2`, [10 §7](10-qualite-tests.md)). |
| 2.2 Lumière et ombres ✅ | Ombres portées en cascade limitées à ~200 m autour du cycliste ; éclairage d'ambiance par environment map HDRI CC0 ; soleil, ciel et brouillard cohérents ; tonemapping AgX. **Livré le 2026-11-03** : 3 cascades (160 m en moyenne, 200 m en haute, aucune en basse), HDRI « Alps Field » écrêtée et orientée sur le soleil, `pnpm fetch-assets` ; silhouette d'ombre du cycliste et copies d'ombre des instances proches pour tenir les budgets ([05 §4](05-monde-virtuel.md), [10 §7](10-qualite-tests.md)). |
| 2.3 Post-traitement ✅ | Occlusion ambiante à l'écran (GTAO), anticrénelage SMAA ou TAA, bloom léger, étalonnage des couleurs (LUT) ; chaque effet lié au niveau de qualité. **Livré le 2026-11-03** : `RenderPipeline` TSL (WebGPU et WebGL2), GTAO sur la profondeur (demi-résolution en moyenne, 3/4 en haute), halo, LUT 3D calculée dans le code, SMAA à la place du MSAA ; basse = étalonnage seul ([05 §4](05-monde-virtuel.md), [10 §7](10-qualite-tests.md)). |
| 2.4 Matières du terrain ✅ | Textures PBR CC0 (herbe, prairie, terre, roche, éboulis, neige) avec normal et roughness maps ; mélange selon la pente, l'altitude et la distance à la route (splatmap) ; projection triplanaire sur les pentes raides ; anti-répétition (échantillonnage stochastique et macro-variation de teinte). **Livré le 2026-11-03** : 6 matières ambientCG / Poly Haven en *texture arrays*, splatmap par point de la grille (pente, altitude, route, forêt, rives), mélange par la hauteur, stochastique et triplanaire en moyenne et haute ; seules les couches présentes sont échantillonnées ([05 §4](05-monde-virtuel.md), [10 §7](10-qualite-tests.md)). |
| 2.5 Route et abords ✅ | Asphalte PBR sans motif répété visible (usure, rapiéçages aléatoires, fissures) ; transition accotement → herbe ; fossés ; glissières en montagne, piquets, murets, clôtures. **Livré le 2026-11-03** : asphalte CC0 + shader TSL (sections d'âges différents, ornières, rapiéçages, fissures ouvertes ou pontées, bords effrités, marquages usés) ; accotement en gravier au bord irrégulier, talus et fossés dessinés avec le matériau du terrain ; glissières, murets maçonnés, clôtures de prés et balises placés selon le relief (`roadside.ts`) et instanciés près de la caméra ; rubans de route fusionnés (−40 à −50 draw calls) ; 2 points de vue ajoutés au banc ([05 §4](05-monde-virtuel.md), [10 §7](10-qualite-tests.md)). |
| 2.6 Végétation ✅ | Modèles d'arbres (feuillus et conifères) et de buissons, 2 à 3 LOD + imposteurs au loin ; herbe instanciée animée par le vent autour de la caméra (~50 m) ; herbes hautes et fleurs en bord de route ; densité selon la qualité. **Livré le 2026-11-04** : modèles **générés dans le code** plutôt qu'en glTF CC0 (ceux de Poly Haven font 0,4 à 17 M de triangles), 5 espèces à 2 LOD + imposteurs à 3 puis 2 plans, répartis par distance dans une instance par espèce et par niveau ; herbe en dalles de 12 m (28 / 45 / 60 m), vent TSL, herbes hautes et fleurs en bord de route, buissons à la lisière des bois ([05 §4](05-monde-virtuel.md), [10 §7](10-qualite-tests.md)). |
| 2.7 Ciel, eau, atmosphère ✅ | Nuages ; perspective atmosphérique et brume en hauteur pour fondre les lointains ; eau réfléchissante (réflexion plane ou SSR selon la qualité). **Livré le 2026-11-04** : nuages du `SkyMesh` (moyenne et haute), fog TSL (distance bleutée, chaude vers le soleil, brume de vallée intégrée le long du rayon, fin du monde toujours dans la brume), lac limité à sa boîte avec rides en carte de normales calculée dans le code : couleur (basse), reflets de l'environnement (moyenne), réflexion plane terrain et ciel à 1/3 de résolution (haute), WebGPU et WebGL2 ([05 §4](05-monde-virtuel.md), [10 §7](10-qualite-tests.md)). |
| 2.8 Relief proche ✅ | Micro-relief procédural ajouté près de la route pour casser l'aspect lisse de la grille de 10 m. **Livré le 2026-11-04** : dans le shader du terrain (géométrie, physique et route inchangées), bosses à trois échelles en perturbation de normale et creux assombris, fondus avec la distance ; qualité moyenne et haute ; accotements de route volontairement exclus (approuvés au lot 2.5). Banc : 85 à 87 FPS sur 3 vues en moyenne, sans draw call ni triangle de plus. |
| 2.9 Qualité graphique ✅ | Préréglages bas / moyen / haut / **auto** ; scaling dynamique de la résolution et de la densité de végétation si le FPS moyen reste sous 45 pendant 10 s (voir [05 §4](05-monde-virtuel.md)). **Livré le 2026-11-04** : réglage « Auto » (par défaut) qui démarre en qualité moyenne puis descend d'un niveau (résolution 100 → 85 → 70 → 60 %, herbe 100 → 70 → 45 → 0 %) à chaque fenêtre de 10 s sous 45 FPS de moyenne ; ne remonte pas pendant la sortie ; sans reconstruction du monde. Les ombres ne sont pas ajustées en direct (non retenu : recréer le soleil et ses cartes d'ombre ferait un à-coup). |
| 2.10 Avatar ✅ | Modèle glTF riggé (CC0) à la place du cycliste procédural, avec matières PBR (peau, tissu, gants), surtout visible en vue POV. **Livré le 2026-11-04** : « Universal Base Characters » de Quaternius (CC0) à la place de MakeHuman (même licence, déjà riggé, 12,5 k triangles ; archive à télécharger à la main, `pnpm import-avatar`) ; IK à deux os sur son squelette (jambes sur les pédales, bras sur les cocottes, torse penché selon la portée des bras, doigts refermés, danseuse), vêtements par masque UV, casque, caméra POV aux vrais yeux ; repli sur le cycliste procédural sans l'asset. Banc (qualité moyenne) : 82 à 95 FPS sur 3 vues, −17 draw calls et +37 k triangles par vue. |
| 2.12 Vélo ✅ | Vélo refait à l'image de celui du développeur (SCOTT Addict RC, taille 56, freins à disque), à la place des tubes et cylindres de `Rider.tsx`. **Livré le 2026-11-05** : aucun modèle glTF CC0 de vélo de route ne convenait (recherche faite), donc **construit dans le code** (`bike-builder.ts`, formes dans `bike-parts.ts`) à partir de cotes mesurées et de photos du propriétaire (`bike-geometry.ts` : empattement 1,00 m, base 0,41 m, pédalier à 0,295 m, manivelle 175 mm, selle à 74 cm du pédalier, cintre de 40 cm ; roues 700×28 sur jantes carbone de 65 mm). Cadre aéro à tubes balayés et dégradé bleu anodisé vers argent (couleurs de sommets, vernis), fourche, cockpit intégré avec cocottes Di2, pédalier Ultegra 50/34, chaîne animée, cassette 11 à 30, dérailleurs (cage CeramicSpeed rouge), freins à disque, porte-bidons, selle et sacoche, feu, pédales automatiques ; logos SCOTT et ULTEGRA en option (`logos`). 32 k triangles, 18 draw calls après fusion par matière. Page de travail `#/bike` (vues orthographiques avec la photo en transparence). L'avatar est recalé sur ces cotes (`rider-geometry.ts` en découle) et ses bras sont rallongés de 18 % (`armScale`) pour atteindre les cocottes. |
| 2.13 Retours de la phase 2 ✅ | Traiter **tous** les retours faits en roulant, recensés avec leurs coordonnées, leurs causes trouvées et leurs pistes dans [16](16-retours-phase-2.md) : (1) **niveaux route et sol** : routes volantes, routes doubles, croisements sans intersection ni pont, altitudes de route qui ne suivent pas le terrain, couloirs partagés par plusieurs boucles (cause : données du monde dans `tools/world-builder` et `flattenAlongRoutes`) ; (2) **voitures flottantes ou dans les maisons, maisons aux fenêtres coupées ou flottantes**, piétons et voitures trop simples ; (3) **scintillement** des clôtures, poteaux et ombres (`ref` en ligne qui remettent les instances à zéro à chaque rendu React) ; (4) **roues du cycliste enfoncées** de 4 à 6 cm dans l'asphalte ; (5) **végétation qui apparaît d'un coup** : distances plus grandes devant le cycliste, avec fondu ; L'asphalte et les accotements du lot 2.5 ne changent pas (validés). |
| 2.14 Retours de la phase 2.13 ✅ | Le tracé des routes est cool mais il y a encore des **routes volante**. Pourquoi il y a ce problème ? est-ce que c'est pour éviter d'avoir des pourcentage > 10% ? Si c'est le cas ok. Dans tous les cas on laisse le tracé des routes comme ca. Mais du coup est-ce que c'est possible d'adapté la map (la hauteur de la map) au endroit ou la route ne touche pas le sol. On ne touche pas la route mais on remonte le sol. Les herbes de bord de route elles sont toujours au bon niveau. J'aimerais que les **herbes de bord de route** ne soit plus généré à partir d'un certaine altitude et soit remplacé progressivement par un autre revêtement de sol qui fait plus montagne **Livré le 2026-11-06** : (1) cause des routes et de l'herbe flottantes, mesurée : le terrain physique et les routes étaient justes (route à +0,6 m, soit l'enfoncement voulu), mais le niveau de détail du terrain dessiné était choisi d'après la distance au centre de la carte (les morceaux n'avaient pas de position), et la maille grossière près des routes enfonçait le sol dessiné jusqu'à 40 m sous elles ; le niveau est maintenant choisi par morceau, et un morceau traversé par une route reste en maille de 10 m jusqu'à 2500 m puis 20 m, jamais 40 m (`scene-builders.ts`, `WorldView.tsx`) ; le tracé des routes n'a pas changé ; (2) plus d'herbe, d'herbe haute ni de fleurs à moins de 0,5 m du niveau du lac ; (3) l'herbe s'estompe de 600 à 1000 m, la couche herbe du terrain disparaît et la prairie puis un éboulis progressif prennent le relais (la prairie remplace l'herbe plutôt que de s'y ajouter : une couche de plus coûtait environ 8 FPS dans le col). Croisements (captures 5 et 6) : prototype abandonné sur décision du propriétaire, non retenu. |
| 2.15 boucles ✅ | Il y a trois boucle actuellement. je veux que l'on puisse les faires dans le sens inverse. ainsi sans grand travail, on double le nombre de boucle. |
| 2.16 Maison ✅ | **Les maison** sont toutes de la même sorte. J'aimerais différents type de maisons qui sont en adéquation avec l'altitude. Dans les villages en bas des maisons de plaines (une dizaine variété) et en altitude des chalets. **Livré le 2026-11-06** : 10 maisons de plaine de style suisse (deux pans, quatre pans, villa mansardée, pignons et tourelle, bungalow à toit plat, balcon, longère, maison de ville, garage, volets colorés), 5 chalets (classique, garage en soubassement, bardage noir, lames de bois, petit chalet) et une grange de montagne ; part de chalets de 0 % sous 550 m à 100 % dès 800 m (village du col : 100 %), fermes et granges comprises ; clôtures (haie, piquets, muret), portail et allée de gravier sur une partie des maisons, sur terrain plat seulement ; page de travail `#/houses` (`building-styles.ts`, `building-builders.ts`). |
| 2.17 Voitures ✅ | **Les voitures** ne sont que d'un modèle qui n'est pas très réaliste. je veux que tu cherche des photos de voitures (une dizaine, familliale, 4x4) et que tu les reproduise de manière la plus fidèle possible et que tu les ajoutes dans le jeu. **Livré le 2026-11-06** : 14 modèles construits dans le code (Clio V, 208 II, Polo VI, Fiat 500 électrique, Golf VIII, Focus IV, Octavia IV Combi, Passat B8 Variant, Scénic IV, Duster II, Tiguan II, Defender 110 ancien, Hilux double cabine, Berlingo III fourgon) à partir de fiches de cotes trouvées sur le web (`car-geometry.ts`, sources en commentaire) et des photos 3/4 avant du propriétaire (`car-styles.ts`) ; carrosserie en coupes successives lissées (coins arrondis en plan, nez et arrière arrondis, épaules elliptiques, capot bombé, pare-chocs et bas de caisse noirs, vitrage qui se rétrécit, montants, ligne de ceinture), phares selon le modèle, calandre, pare-chocs, rétroviseurs, barres de toit, plaques, roues fixes (5 jantes types) ; logos de marque en option (`logos`, comme sur le vélo : marques déposées, voir [11](11-legal-licences.md)). Chaque voiture fait 1,9 à 2,8 k triangles. Flotte selon le lieu (`car-fleet.ts`) : citadines et compactes en plaine, SUV, 4x4 et pick-up en montagne, pick-up et fourgons dans les fermes, Hilux et Defender jamais en village (place) ; une instance par modèle, y compris pour le trafic. Page de travail `#/cars` (un modèle ou tous, vues 3/4, côté, face, arrière, dessus, photo à côté). Banc (qualité moyenne) : 61 à 82 FPS sur 3 vues, +13 à +34 % de draw calls et +9 à +12 % de triangles par rapport au lot 2.16, soit −2 à −4 FPS. **Jugement du propriétaire (2026-11-06) : « pas ouf », on s'arrête là pour l'instant.** Formes encore trop simples face aux photos (pas d'ailes bombées au-dessus des roues, phares et calandre sommaires, roues à 14 pans, nez de la Hilux trop bas, SUV proches d'un hatchback) : à reprendre plus tard, modèle par modèle. |

**Critères de sortie**

- Captures avant/après du banc de comparaison validées : plus aucun aplat de couleur ni motif répété visible sur la route et le terrain à hauteur de cycliste.
- Sur la config de référence (MacBook Air M1, 1080p) : ≥ 60 FPS en qualité moyenne, ≥ 30 FPS garantis en qualité haute ; budgets de [05 §4](05-monde-virtuel.md) respectés (< 300 draw calls, < 2 M triangles, < 1,5 Go de mémoire GPU).
- Repli WebGL2 fonctionnel (même scène, effets réduits) quand WebGPU n'est pas disponible.
- Retours de la phase 2 traités ([16](16-retours-phase-2.md), lot 2.13).
- Les critères de sortie de la phase 1 qui demandent le vrai trainer ne bloquent plus cette phase : ils sont reportés au lot 3.13.

---

## Phase 3 — Entraînement, vitesses virtuelles, comptes et intégrations (6–9 sem.) → **Jalon M3 : bêta privée**

| Lot | Contenu |
|---|---|
| 3.1 Mode ERG | Puissance cible, transitions douces entre intervalles, gestion du « spiral of death » (cadence trop basse). |
| 3.2 Séances | Éditeur simple, bibliothèque, import `.zwo` / `.erg` / `.mrc`, affichage du graphe de séance. |
| 3.3 Backend v1 (local) | API Fastify + PostgreSQL lancés en local (Docker Compose) ; comptes ; synchronisation des sorties et du profil ; fichiers sur disque local (ou MinIO). |
| 3.4 Strava | OAuth et upload automatique. |
| 3.5 Monde v1.1 | 2 à 3 boucles de plus, segments chronométrés, record personnel par segment. |
| 3.6 Fantômes | Rouler contre une de ses sorties précédentes ou contre son **meilleur tour** sur la boucle. |
| 3.7 PWA | Installable, cache des assets hors ligne. |
| 3.8 **Vitesses virtuelles v1.1** | Stratégie S3 (ERG piloté par le rapport) en expérimental, transmission personnalisée (plateaux et cassette libres), rapport physique Cog renseigné. Voir [15](15-vitesses-virtuelles-et-commandes.md). |
| 3.9 **Hub de commandes** | Package `@hrt/controls` : clavier, manettes (Gamepad API), télécommandes appairées au système, **OpenBikeControl en Bluetooth** (boutons, App Information, retour haptique), écran de mapping, profils ; test avec BikeControl en passerelle si disponible et en mode clavier. |
| 3.10 **Télécommande smartphone** | Page compagnon via QR code (gros boutons vitesse +/−, pause, caméra), WebSocket vers le serveur local. Contrôleur gratuit et fiable posé sur le guidon. |
| 3.11 Spike **Zwift Click v2** | Connexion directe en Web Bluetooth au Zwift Click du développeur (protocole documenté par la communauté) ; conservé seulement si fiable, sinon BikeControl ou smartphone. |
| 3.12 HUD v1.1 (reliquat 1.6) | Tuiles configurables, modes daltoniens ; tenues de l'avatar (reliquat 1.5). |
| 3.13 Validation matérielle et tests (reliquats phase 1, ex-lot 2.11) | Dès la livraison du trainer (déplacé de la phase 2 le 2026-11-04 : pas de trainer pour le moment) : sortie de 3 h sur la boucle du col **avec le nouveau rendu**, import `.fit` sur Strava et Garmin Connect, test sur 2 trainers, réglage du gain S1 ; tests E2E Playwright des parcours principaux. |
| 3.14 **Interface v2** (style Zwift / MyWoosh) | Refonte visuelle de l'interface, placée en fin de phase 3 pour partir des fonctions réellement livrées (séances, ERG, commandes, tuiles configurables du lot 3.12). Menu principal et écrans de choix (monde, parcours, séance) soignés ; HUD retravaillé (jauges de puissance et de zones, bandeau d'intervalle animé, profil du tour plus lisible, transitions) ; écran de fin de sortie avec résumé et records ; thème et identité visuelle cohérents ([09](09-ux-ui.md)). Maquettes d'abord, validées avant le code. |

**Critères de sortie** : 5 à 10 testeurs bêta roulent chaque semaine ; aucun bug bloquant ouvert.

---

## Phase 4 — Mondes réels reconstitués (8–12 sem.) → **Jalon M4 : un col alpin fidèle**

**Objectif** : ajouter au monde fictif « Val de Vérane » des **mondes fidèles à la réalité**, reconstruits à partir de données ouvertes (satellite, LiDAR, topographie, occupation du sol, OpenStreetMap…), en commençant par les **grands cols des Alpes**. Le coureur choisit d'abord **son monde**, puis **son parcours dans ce monde**. Un col se roule en **aller-retour enchaîné** : la séance ne s'arrête jamais en haut. Budget 0 € : uniquement des données ouvertes, traitées et stockées en local ([ADR 0010](adr/0010-budget-zero-execution-locale.md)).

**Différence avec la phase 5 (mode monde réel)** : ici le monde est **modélisé en 3D** à partir de données géographiques (on peut le parcourir aussi longtemps qu'on veut, avec ombres, végétation et météo cohérentes) ; en phase 5 on roule sur n'importe quel GPX avec des **images réelles** (Mapillary, etc.). Le pipeline de données de la phase 4 sert de base au repli 3D de la phase 5.

### Sources de données visées

À valider au spike 4.0 (licences exactes, formats, volumes). Tout est gratuit ; les volumes (LiDAR en particulier) restent en cache local, hors dépôt git.

| Besoin | Sources candidates |
|---|---|
| Relief fin (route et abords) | **IGN LiDAR HD** (MNT/MNS 0,5 à 1 m, France), RGE ALTI ; **swisstopo swissALTI3D** et swissSURFACE3D (Suisse) ; LiDAR régionaux italiens quand ils sont ouverts, sinon MNT 10 m |
| Relief lointain et horizon | **Copernicus GLO-30** (30 m) pour les sommets visibles jusqu'à ~100 km |
| Couleurs du sol | **Orthophotos** IGN BD ORTHO (20 cm), swisstopo SWISSIMAGE (10 cm) ; **Sentinel-2** (10 m, repli et séries par saison) |
| Occupation du sol | IGN OCS GE et BD Forêt, CORINE Land Cover, ESA WorldCover 10 m : forêt, prairie, rocher, éboulis, névé, eau, bâti |
| Routes et abords | **OpenStreetMap** (tracé, largeur, revêtement, lacets, ponts, tunnels, galeries, murs, glissières, bâtiments, cours d'eau) ; IGN BD TOPO (bâtiments avec hauteur, hydrographie) |
| Végétation | Modèle de hauteur de canopée dérivé du LiDAR (MNS − MNT) : arbres placés à leur vraie position et à leur vraie hauteur ; essence selon l'altitude et l'occupation du sol (mélèzes, épicéas, alpages) |
| Signalétique et ambiance | Mapillary (CC-BY-SA, référence de panneaux, bornes et couleur de l'asphalte) ; position du soleil calculée selon la date, l'heure et les coordonnées |

### Choix du monde, puis du parcours

```
Écran 1 : choix du monde         Écran 2 : choix du parcours dans le monde
┌──────────┐ ┌──────────┐        Alpe d'Huez
│ Val de   │ │ Alpe     │  ──▶     ├─ Montée (aller-retour)   13,8 km · 8,1 % · +1 130 m
│ Vérane   │ │ d'Huez   │          ├─ Variante …
│ (fictif) │ │ (réel)   │          └─ …
└──────────┘ └──────────┘
```

Les mondes se distinguent par une vignette, une description, la nature des données (« fictif » ou « reconstitué : LiDAR IGN + orthophoto 2023 ») et leurs attributions. L'historique, le `.fit`, les records et plus tard les fantômes et le multijoueur retiennent `worldId` **et** `routeId`.

### Parcours en col : aller-retour enchaîné

Les mondes de montagne proposent des parcours de type **« col »** (aller-retour). La séance ne s'arrête pas en haut : on repart du début, comme sur une boucle.

1. **Montée** : le coureur pédale normalement jusqu'au sommet (physique et pente réelles du profil).
2. **Demi-tour au sommet** : l'avatar fait demi-tour (animation courte, caméra qui pivote) ; la pente envoyée au trainer glisse en douceur vers la descente.
3. **Descente** : le coureur redescend le col **par la route dans l'autre sens**, sur l'autre voie, **en accéléré**. Pour la résistance et le temps, **c'est comme si on pédalait dans une descente d'environ 6 %** : pente envoyée au trainer et calcul du temps de descente à partir de ce taux fixe (réglable), et non de la vraie pente des lacets. Les règles d'atténuation de la descente du lot 1.2 s'appliquent.
4. **Demi-tour en bas** : nouveau demi-tour, la pente remonte progressivement vers celle du bas du col.
5. **On recommence** : nouvelle montée, comptée comme un tour ; aucun arrêt ni écran intermédiaire. Le raccord est invisible pour la physique (distance totale continue) ; seul le moteur de route change de phase.

Cela étend la règle « uniquement des boucles » de l'[ADR 0009](adr/0009-boucles-uniquement.md) : un col est une **boucle dans le temps** (montée → demi-tour → descente → demi-tour). Un nouvel ADR 0012 documentera la décision.

Points à trancher avant le lot 4.8 (voir [13](13-questions-ouvertes.md), Q18 à Q20) : durée et vitesse affichée de la descente, ce que l'on enregistre dans le `.fit` pendant la descente, ce que mesure un « tour ».

### Lots

| Lot | Contenu |
|---|---|
| 4.0 **Spike fidélité** (1 à 2 sem.) | Reconstruire **un seul tronçon de ~3 km** d'un col (candidats : Alpe d'Huez, Galibier, Stelvio, Izoard, Madeleine) avec LiDAR + orthophoto + OSM, et le comparer à des photos et à Mapillary. Mesurer volumes de données, temps de construction, FPS, taille sur disque. Vérifier licences et attributions de chaque source. **Décision : ADR 0012** (mondes reconstitués, parcours en col, extension de l'ADR 0009). |
| 4.1 **Catalogue de mondes** | Manifeste de monde (`content/worlds/index.json` : id, nom, vignette, données, attributions, parcours) ; chargement d'un seul monde à la fois (mémoire, streaming) ; écran « choix du monde » puis « choix du parcours » ; `worldId` partout (historique, `.fit`, records, réglages). « Val de Vérane » devient le premier monde du catalogue, sans régression. |
| 4.2 **Pipeline de données v2** (`tools/world-builder`) | Téléchargement avec cache local des sources, reprojection et découpe (GDAL), génération des tuiles ; commande reproductible `pnpm build-world <id>` ; fichier de provenance (source, date, licence) par monde ; attributions affichées dans l'application et dans [CREDITS.md](../CREDITS.md). **Monde en couloir** : les cols font 15 à 25 km de long pour 1 000 à 2 000 m de dénivelé, pas 10 × 10 km ; streaming des tuiles le long du parcours, au lieu d'un carré. |
| 4.3 **Relief LiDAR** | Heightmap multi-résolution (0,5 à 1 m près de la route, 5 à 10 m ensuite, 30 m pour l'horizon) ; **la route réelle est déjà dans le MNT** : on ne l'aplanit plus (`flattenAlongRoutes`), on la suit, ce qui supprime à la source les routes qui flottent ou qui ne suivent pas le terrain ([16](16-retours-phase-2.md)). Raccord entre résolutions sans fissure. |
| 4.4 **Route réelle** | Tracé issu d'OSM ou d'un GPX, recalé sur la surface LiDAR (altitude, largeur, cap) ; lacets, épingles, ponts, tunnels et galeries paravalanches ; profil recalculé et lissé pour la physique ; revêtement et largeur selon les tags ; accotements et glissières d'après OSM et le relief. |
| 4.5 **Sol d'après les images satellite** | Orthophoto comme couleur de base du terrain, mélangée aux matières PBR du lot 2.4 (le satellite à distance, le PBR de près) ; masques d'occupation du sol pour choisir les matières (herbe, rocher, éboulis, névé, forêt, eau) ; correction des ombres cuites dans l'orthophoto (elles contredisent le soleil dynamique). |
| 4.6 **Végétation et bâti réels** | Arbres placés d'après la canopée LiDAR (position, hauteur, essence selon l'altitude) ; bâtiments depuis BD TOPO/OSM (emprise, hauteur, couleur de toit tirée de l'orthophoto) ; chalets, refuges, hameaux, murets, bornes kilométriques avec pente (« 8,5 % »), panneaux de lacets numérotés. |
| 4.7 **Lumière, saison et horizon fidèles** | Position du soleil selon la date, l'heure et les coordonnées ; **vrai horizon** (sommets lointains depuis le MNT de 30 m) ; ligne de neige et névés selon la saison choisie ; teintes de l'orthophoto cohérentes avec la lumière. Météo réelle (Open-Meteo, gratuit) laissée à la phase 7. |
| 4.8 **Parcours en col** | Type de parcours `outAndBack` dans le moteur de route (machine à états : montée, demi-tour haut, descente, demi-tour bas) ; descente virtuelle à pente fixe réglable (~6 %) avec transitions de pente lissées ; descente sur la voie opposée avec circulation dans le bon sens ; animation de demi-tour de l'avatar et de la caméra ; HUD (profil de la montée seule, phase en cours, **temps de montée**, meilleure montée) ; `.fit` avec un lap par montée et un lap pour la descente. |
| 4.9 **Fidélité vérifiée** | Test automatique par parcours : distance, dénivelé positif et pente moyenne par kilomètre comparés à une référence publiée (col, segment Strava ou tracé officiel) ; comparaison visuelle sur une vingtaine de points de vue fixes (banc du lot 2.0) face à des photos ; budgets de [05 §4](05-monde-virtuel.md) tenus sur un monde réel complet. |
| 4.10 **Premiers mondes** | 2 à 3 cols alpins complets (choix à faire : voir Q18, par exemple Alpe d'Huez, Galibier avec le Télégraphe, Stelvio), chacun avec sa montée et, si le relief s'y prête, une variante ; vignettes, descriptions, attributions. |

**Critères de sortie**

- L'écran de sélection propose le monde puis le parcours ; « Val de Vérane » fonctionne comme avant.
- Sur chaque col livré, distance à ±1 %, dénivelé à ±2 %, pente moyenne de chaque kilomètre à ±0,5 point de la référence.
- Ressemblance validée à l'œil sur au moins 20 points de vue comparés à des photos : lacets, tunnels, ponts, villages, lisière de forêt, crêtes à l'horizon.
- Séance de 2 h en **montées et descentes enchaînées**, sans à-coup visible ni de résistance aux deux demi-tours, sans chute de FPS sous 30 ; ≥ 60 FPS en qualité moyenne sur la config de référence.
- Chaque monde se reconstruit en une commande à partir de sources ouvertes, avec licences et attributions visibles ; **0 € dépensé** ; taille sur disque d'un monde raisonnable (cible < 2 Go, à confirmer au spike 4.0).

---

## Phase 5 — Mode monde réel, bêta (6–9 sem.) → **Jalon M5**

**Objectif** : rouler sur n'importe quel parcours réel, avec des images réelles et le vrai relief. Voir [06](06-monde-reel.md).

| Lot | Contenu |
|---|---|
| 5.0 **Spike imagerie** (1 sem.) | Prototype comparatif Mapillary (gratuit), Google Street View (seulement si un quota plafonné garantit 0 €) et vidéo GPX sur 3 parcours tests ; couverture, fluidité, licences, risque de facturation. **Décision finale de l'[ADR 0007](adr/0007-imagerie-monde-reel.md).** |
| 5.1 Import | GPX, TCX, FIT ; nettoyage (doublons, sauts GPS). |
| 5.2 Altimétrie | Correction de l'altitude par MNT, lissage, calcul de pente robuste, détection des montées. |
| 5.3 Tracé | Tracé sur carte avec routage vélo (BRouter / GraphHopper / OSRM). |
| 5.4 Lecteur d'images | Pré-chargement, synchronisation avec la vitesse, transitions (fondu, léger zoom), choix de l'image selon le cap. |
| 5.5 Repli | Vue carte 3D ou satellite lorsque la couverture en images manque. |
| 5.6 Parcours préparés | 5 à 10 montées célèbres pré-calculées et vérifiées. |
| 5.7 OpenBikeControl réseau | Relais local dans `apps/api` : découverte mDNS `_openbikecontrol._tcp`, connexion TCP, retransmission en WebSocket vers le navigateur. |

**Critères de sortie** : un GPX quelconque d'Europe de l'Ouest est jouable en moins de 60 s, avec une pente plausible et au moins 80 % du parcours couvert en images, ou un repli propre.

---

## Phase 6 — Multijoueur et social (6–8 sem.) → **Jalon M6 : bêta publique**

Voir [08](08-multijoueur.md).

| Lot | Contenu |
|---|---|
| 6.1 Serveur temps réel | Rooms par monde, diffusion des positions à 2–4 Hz, interpolation côté client. Testé en local et sur le réseau local (plusieurs navigateurs ou machines) ; le multijoueur en ligne suppose un hébergement public, à décider plus tard. |
| 6.2 Drafting | Réduction de la traînée derrière les autres coureurs. |
| 6.3 Présence | Liste des coureurs proches, abonnements, « ride ons ». |
| 6.4 Événements | Sorties de groupe planifiées, départ groupé. |
| 6.5 Bots | Bots « pacers » à puissance fixe pour animer le monde quand il y a peu de monde. |
| 6.6 Anti-triche de base | Contrôles de plausibilité (W/kg, sauts de position). |
| 6.7 Exploitation | Logs locaux, sauvegardes de la base locale ; CGU et politique de confidentialité **seulement si** un hébergement public est décidé. |
| 6.8 Vitesses virtuelles v2 | Choix final de la stratégie de vitesses par défaut ([ADR 0008](adr/0008-vitesses-virtuelles.md)) ; direction proportionnelle OpenBikeControl (`0x1B`) pour changer de boucle aux jonctions. |

---

## Phase 7 — Contenu, polish et plateformes (continu)

- Mondes supplémentaires hors Alpes (Pyrénées, côte, désert…) avec le pipeline de la phase 4 ; météo réelle (Open-Meteo) dans les mondes reconstitués.
- Météo et cycle jour/nuit, saisons.
- Vidéos réelles géolocalisées dans le mode B.
- ANT+ via WebUSB, support des trainers « legacy ».
- Contrôleurs : implémentation directe d'un protocole propriétaire (Zwift Click/Play/Ride, Sterzo…) **seulement** si OpenBikeControl et BikeControl ne couvrent pas un besoin ; étude des vitesses virtuelles natives des trainers (protocole propriétaire).
- Applications enveloppes (Capacitor ou Tauri) pour iOS, Android, Apple TV, avec BLE natif. Une app desktop Tauri est gratuite ; une publication sur les stores implique des frais de compte développeur, donc hors budget actuel.
- Courses, classements, défis, progression et cosmétiques.
- Accessoires : ventilateur intelligent, simulateur de pente (Wahoo KICKR CLIMB), direction.

---

## Jalons récapitulatifs

| Jalon | Contenu | Fin estimée (cumul plein temps) |
|---|---|---|
| M0 | Spikes validés | S+2 ✅ |
| **M1** | **MVP monde virtuel jouable et exportable, avec vitesses virtuelles au clavier** | S+11 ✅ (2026-11-03) |
| M2 | Rendu réaliste : lumière, ombres, matières PBR, végétation, WebGPU | S+18 |
| M3 | Bêta privée avec ERG, commandes (smartphone, OpenBikeControl, Zwift Click si possible), comptes, Strava | S+27 |
| **M4** | **Premiers mondes reconstitués (cols alpins) : choix monde → parcours, aller-retour enchaîné** | S+39 |
| M5 | Mode monde réel en bêta | S+48 |
| M6 | Multijoueur (réseau local tant qu'il n'y a pas d'hébergement) | S+56 |

## Ce qu'on prépare tôt pour ne pas le payer plus tard

- **Format de route unique** pour le mode A et le mode B (phase 1), afin que le mode B réutilise HUD, physique et enregistrement.
- **Interface `TrainerDevice` abstraite** (phase 0), pour ajouter ANT+, des protocoles propriétaires ou du BLE natif sans toucher au reste.
- **État du coureur sérialisable** (`RiderState`), qui servira tel quel pour les fantômes puis le multijoueur.
- **Boucle de simulation découplée du rendu**, pour qu'un onglet en arrière-plan ou un FPS bas ne fausse pas la physique.
- **Toutes les actions de sortie passent par un dispatcher d'actions** dès la phase 1 (même pour le clavier), pour que le hub de commandes et les vitesses virtuelles de la phase 3 s'y branchent sans refonte.
- **`TrainerController` qui compose plusieurs couches** (pente ressentie → difficulté → vitesses virtuelles → bornes du trainer), pour ajouter les vitesses virtuelles sans toucher à la physique.
- **Shaders et post-traitement en TSL** (phase 2), pour qu'un même code tourne en WebGPU et en repli WebGL2.
- **`worldId` et `routeId` dans tous les modèles** (historique, `.fit`, records, fantômes, multijoueur) dès la phase 3, pour qu'ajouter des mondes en phase 4 ne demande aucune migration.
