# Roadmap — HomeRealTrainer

**Contraintes transverses** : budget de 0 € (hors outil d'IA déjà payé) et exécution uniquement en local pour l'instant ([ADR 0010](adr/0010-budget-zero-execution-locale.md)).

Les estimations sont en **semaines de développement pour 1 développeur à plein temps**. En temps partiel (soirs et week-ends), il faut les multiplier par environ 2,5 à 3. Elles servent à ordonner le travail, pas à s'engager sur des dates.

## Vue d'ensemble

```
Phase 0  Fondations & spikes techniques        ██                 1–2 sem.   ✅
Phase 1  MVP solo — Monde virtuel              █████████          7–9 sem.   ✅ jalon M1 : MVP (clôturée le 2026-11-03)
Phase 2  Rendu réaliste                        ███████            5–7 sem.   ← jalon M2 : monde crédible
Phase 3  Entraînement, vitesses virt., comptes █████████          6–9 sem.   ← jalon M3 : bêta privée
Phase 4  Mode monde réel (bêta)                █████████          6–9 sem.   ← jalon M4 : mode B
Phase 5  Multijoueur & social                  ████████           6–8 sem.   ← jalon M5 : bêta publique
Phase 6  Contenu, polish, plateformes          continu
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
| 1.1 Appareils | ✅ Trainer FTMS, ceinture cardio, capteur de puissance, reconnexion automatique, mémorisation, appareils simulés | Validation sur le vrai trainer → lot 2.11 |
| 1.2 Physique | ✅ Difficulté réglable, descente atténuée, lissage de la pente envoyée, envoi ≥ 1×/s | — |
| 1.3 Route engine | ✅ Format de route, boucles, raccord continu, comptage des tours | — |
| 1.4 Monde v1 | ✅ « Val de Vérane » 10 × 10 km, 3 boucles, terrain par tuiles avec LOD, lac, forêts, ciel ; 5 villages (maisons, trottoirs, lampadaires, panneaux, piétons, voitures garées), fermes, balises, voitures en sens inverse, accotements | Textures PBR, ombres, herbe 3D, eau réfléchissante, glissières en montagne → phase 2 |
| 1.5 Avatar | ✅ Cycliste procédural (pédalage par IK à la cadence, danseuse), cintre route avec cocottes ; 4 caméras dont POV (par défaut, avec ses propres bras) | Modèle glTF (MakeHuman) → lot 2.10 ; tenues → phase 3 |
| 1.6 HUD | ✅ Tuiles, profil du tour, mini-carte, tours, rapport, alertes | Tuiles configurables, modes daltoniens → lot 3.12 |
| 1.7 Enregistrement | ✅ 1 Hz, sauvegarde toutes les 10 s, reprise après plantage, `.fit` relu par le SDK Garmin | Import réel sur Strava et Garmin Connect → lot 2.11 |
| 1.8 Profil et réglages | ✅ Profil, unités, difficulté, qualité, transmission, FR/EN | — |
| 1.9 Historique | ✅ Liste, récapitulatif, tableau des tours, export, suppression | — |
| 1.10 Exécution locale | ✅ `pnpm start` | — |
| 1.11 Vitesses virtuelles | ✅ Plateaux 50/34 et cassette de 10 à 13 vitesses au choix ; `A`/`Z` un pignon, `Q`/`S` le plateau, changement de plateau automatique en bout de cassette ; stratégie S1 ; rapport « 50×21 » dans le HUD | Réglage du gain S1 sur le vrai trainer → lot 2.11 |

Un test automatique simule déjà 6 h de sortie (tours, échantillons, pas de dérive). Restent reportés au lot 2.11 : sortie de 3 h sur la boucle du col (FPS ≥ 30 sur la config de référence), `.fit` accepté par Strava et Garmin Connect, test sur 2 trainers, tests E2E Playwright.

---

## Phase 2 — Rendu réaliste (5–7 sem.) → **Jalon M2 : monde crédible**

**Objectif** : passer d'un rendu de prototype (relief en aplats de couleur, pas d'ombres, arbres géométriques, motifs répétés sur la route) à un rendu **« réaliste stylisé »** crédible à hauteur de cycliste, tel que prévu dans [05 §4](05-monde-virtuel.md), sans perdre la fluidité. Budget 0 € : uniquement des assets CC0 (Poly Haven, ambientCG).

**Ordre** : la bascule WebGPU se fait **en premier**, pour écrire une seule fois les shaders (terrain, herbe, eau) et le post-traitement en TSL, qui fonctionne aussi en repli WebGL2. Viennent ensuite la lumière et les matières (le plus gros gain visuel), puis la végétation.

| Lot | Contenu |
|---|---|
| 2.0 Banc de comparaison ✅ | Points de vue fixes sur chaque boucle (route dégagée, forêt, village, col, lac) avec captures automatiques avant/après ; mesure FPS, draw calls, triangles et mémoire GPU par niveau de qualité. Sert de référence pour tous les lots suivants. **Livré le 2026-11-03** : `pnpm bench`, `pnpm bench:compare`, run de référence `phase-1` ([10 §7](10-qualite-tests.md)). |
| 2.1 **WebGPU** | Bascule sur `WebGPURenderer` de Three.js avec repli WebGL2 automatique ; matériaux et shaders en TSL ; vérification de compatibilité avec React Three Fiber. Mise à jour de l'[ADR 0003](adr/0003-rendu-3d-threejs.md). |
| 2.2 Lumière et ombres | Ombres portées en cascade limitées à ~200 m autour du cycliste ; éclairage d'ambiance par environment map HDRI CC0 ; soleil, ciel et brouillard cohérents ; tonemapping AgX. |
| 2.3 Post-traitement | Occlusion ambiante à l'écran (GTAO), anticrénelage SMAA ou TAA, bloom léger, étalonnage des couleurs (LUT) ; chaque effet lié au niveau de qualité. |
| 2.4 Matières du terrain | Textures PBR CC0 (herbe, prairie, terre, roche, éboulis, neige) avec normal et roughness maps ; mélange selon la pente, l'altitude et la distance à la route (splatmap) ; projection triplanaire sur les pentes raides ; anti-répétition (échantillonnage stochastique et macro-variation de teinte). |
| 2.5 Route et abords | Asphalte PBR sans motif répété visible (usure, rapiéçages aléatoires, fissures) ; transition accotement → herbe ; fossés ; glissières en montagne, piquets, murets, clôtures. |
| 2.6 Végétation | Modèles glTF CC0 d'arbres (feuillus et conifères) et de buissons, 2 à 3 LOD + imposteurs au loin ; herbe instanciée animée par le vent autour de la caméra (~50 m) ; herbes hautes et fleurs en bord de route ; densité selon la qualité. |
| 2.7 Ciel, eau, atmosphère | Nuages ; perspective atmosphérique et brume en hauteur pour fondre les lointains ; eau réfléchissante (réflexion plane ou SSR selon la qualité). |
| 2.8 Relief proche | Micro-relief procédural ajouté près de la route pour casser l'aspect lisse de la grille de 10 m. |
| 2.9 Qualité graphique | Préréglages bas / moyen / haut / **auto** ; scaling dynamique de la résolution et de la densité de végétation si le FPS moyen reste sous 45 pendant 10 s (voir [05 §4](05-monde-virtuel.md)). |
| 2.10 Avatar | Modèle glTF riggé (MakeHuman, CC0) à la place du cycliste procédural, avec matières PBR (peau, tissu, gants), surtout visible en vue POV. |
| 2.11 Validation matérielle et tests (reliquats phase 1) | Dès la livraison du trainer : sortie de 3 h sur la boucle du col **avec le nouveau rendu**, import `.fit` sur Strava et Garmin Connect, test sur 2 trainers, réglage du gain S1 ; tests E2E Playwright des parcours principaux. |

**Critères de sortie**

- Captures avant/après du banc de comparaison validées : plus aucun aplat de couleur ni motif répété visible sur la route et le terrain à hauteur de cycliste.
- Sur la config de référence (MacBook Air M1, 1080p) : ≥ 60 FPS en qualité moyenne, ≥ 30 FPS garantis en qualité haute ; budgets de [05 §4](05-monde-virtuel.md) respectés (< 300 draw calls, < 2 M triangles, < 1,5 Go de mémoire GPU).
- Repli WebGL2 fonctionnel (même scène, effets réduits) quand WebGPU n'est pas disponible.
- Critères de sortie reportés de la phase 1 validés (lot 2.11).

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

**Critères de sortie** : 5 à 10 testeurs bêta roulent chaque semaine ; aucun bug bloquant ouvert.

---

## Phase 4 — Mode monde réel, bêta (6–9 sem.) → **Jalon M4**

**Objectif** : rouler sur n'importe quel parcours réel, avec des images réelles et le vrai relief. Voir [06](06-monde-reel.md).

| Lot | Contenu |
|---|---|
| 4.0 **Spike imagerie** (1 sem.) | Prototype comparatif Mapillary (gratuit), Google Street View (seulement si un quota plafonné garantit 0 €) et vidéo GPX sur 3 parcours tests ; couverture, fluidité, licences, risque de facturation. **Décision finale de l'[ADR 0007](adr/0007-imagerie-monde-reel.md).** |
| 4.1 Import | GPX, TCX, FIT ; nettoyage (doublons, sauts GPS). |
| 4.2 Altimétrie | Correction de l'altitude par MNT, lissage, calcul de pente robuste, détection des montées. |
| 4.3 Tracé | Tracé sur carte avec routage vélo (BRouter / GraphHopper / OSRM). |
| 4.4 Lecteur d'images | Pré-chargement, synchronisation avec la vitesse, transitions (fondu, léger zoom), choix de l'image selon le cap. |
| 4.5 Repli | Vue carte 3D ou satellite lorsque la couverture en images manque. |
| 4.6 Parcours préparés | 5 à 10 montées célèbres pré-calculées et vérifiées. |
| 4.7 OpenBikeControl réseau | Relais local dans `apps/api` : découverte mDNS `_openbikecontrol._tcp`, connexion TCP, retransmission en WebSocket vers le navigateur. |

**Critères de sortie** : un GPX quelconque d'Europe de l'Ouest est jouable en moins de 60 s, avec une pente plausible et au moins 80 % du parcours couvert en images, ou un repli propre.

---

## Phase 5 — Multijoueur et social (6–8 sem.) → **Jalon M5 : bêta publique**

Voir [08](08-multijoueur.md).

| Lot | Contenu |
|---|---|
| 5.1 Serveur temps réel | Rooms par monde, diffusion des positions à 2–4 Hz, interpolation côté client. Testé en local et sur le réseau local (plusieurs navigateurs ou machines) ; le multijoueur en ligne suppose un hébergement public, à décider plus tard. |
| 5.2 Drafting | Réduction de la traînée derrière les autres coureurs. |
| 5.3 Présence | Liste des coureurs proches, abonnements, « ride ons ». |
| 5.4 Événements | Sorties de groupe planifiées, départ groupé. |
| 5.5 Bots | Bots « pacers » à puissance fixe pour animer le monde quand il y a peu de monde. |
| 5.6 Anti-triche de base | Contrôles de plausibilité (W/kg, sauts de position). |
| 5.7 Exploitation | Logs locaux, sauvegardes de la base locale ; CGU et politique de confidentialité **seulement si** un hébergement public est décidé. |
| 5.8 Vitesses virtuelles v2 | Choix final de la stratégie de vitesses par défaut ([ADR 0008](adr/0008-vitesses-virtuelles.md)) ; direction proportionnelle OpenBikeControl (`0x1B`) pour changer de boucle aux jonctions. |

---

## Phase 6 — Contenu, polish et plateformes (continu)

- Deuxième monde (autre biome : montagne, côte, désert…).
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
| M4 | Mode monde réel en bêta | S+36 |
| M5 | Multijoueur (réseau local tant qu'il n'y a pas d'hébergement) | S+44 |

## Ce qu'on prépare tôt pour ne pas le payer plus tard

- **Format de route unique** pour le mode A et le mode B (phase 1), afin que le mode B réutilise HUD, physique et enregistrement.
- **Interface `TrainerDevice` abstraite** (phase 0), pour ajouter ANT+, des protocoles propriétaires ou du BLE natif sans toucher au reste.
- **État du coureur sérialisable** (`RiderState`), qui servira tel quel pour les fantômes puis le multijoueur.
- **Boucle de simulation découplée du rendu**, pour qu'un onglet en arrière-plan ou un FPS bas ne fausse pas la physique.
- **Toutes les actions de sortie passent par un dispatcher d'actions** dès la phase 1 (même pour le clavier), pour que le hub de commandes et les vitesses virtuelles de la phase 3 s'y branchent sans refonte.
- **`TrainerController` qui compose plusieurs couches** (pente ressentie → difficulté → vitesses virtuelles → bornes du trainer), pour ajouter les vitesses virtuelles sans toucher à la physique.
- **Shaders et post-traitement en TSL** (phase 2), pour qu'un même code tourne en WebGPU et en repli WebGL2.
