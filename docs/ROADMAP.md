# Roadmap — HomeRealTrainer

**Contraintes transverses** : budget de 0 € (hors outil d'IA déjà payé) et exécution uniquement en local pour l'instant ([ADR 0010](adr/0010-budget-zero-execution-locale.md)).

Les estimations sont en **semaines de développement pour 1 développeur à plein temps**. En temps partiel (soirs et week-ends), il faut les multiplier par environ 2,5 à 3. Elles servent à ordonner le travail, pas à s'engager sur des dates.

## Vue d'ensemble

```
Phase 0  Fondations & spikes techniques        ██                 1–2 sem.
Phase 1  MVP solo — Monde virtuel              ████████           6–8 sem.   ← jalon M1 : MVP
Phase 2  Entraînement, vitesses virt., comptes ███████            6–9 sem.   ← jalon M2 : bêta privée
Phase 3  Mode monde réel (bêta)                ████████           6–9 sem.   ← jalon M3 : mode B
Phase 4  Multijoueur & social                  ████████           6–8 sem.   ← jalon M4 : bêta publique
Phase 5  Contenu, polish, plateformes          continu
```

Principe directeur : **chaque phase se termine par quelque chose de jouable sur un vrai home trainer.**

---

## Phase 0 — Fondations et spikes (1–2 sem.)

**Objectif** : lever les inconnues techniques les plus risquées avant d'investir dans le reste.

| Livrable | Détail |
|---|---|
| Monorepo initialisé | pnpm + Turborepo, apps `web`, packages `physics`, `devices`, `shared` ; lint, format, Vitest, CI GitHub Actions. Voir [14](14-conventions-dev.md). |
| **Spike BLE** | Page de test : connexion à **ton** trainer en FTMS, lecture puissance et cadence, envoi d'une pente et d'une puissance cible ERG. Journal des trames brutes. |
| **Spike 3D** | Scène Three.js : terrain 4 × 4 km depuis un MNT réel, route en spline, caméra qui suit, 10 000 arbres instanciés. Mesure des FPS sur la config de référence. |
| Spike physique | Fonction `simulateStep()` testée contre des valeurs de référence. |
| Trainer simulé | Appareil virtuel (puissance réglée au clavier) implémentant la même interface que le vrai trainer. |

**Critères de sortie**

- La résistance du trainer change quand on envoie 0 %, 5 % puis 10 % de pente.
- La scène 3D tient au moins 50 FPS sur la config de référence.
- Décision confirmée sur Three.js ([ADR 0003](adr/0003-rendu-3d-threejs.md)) ou bascule sur Babylon.js si le spike échoue.

---

## Phase 1 — MVP solo en monde virtuel (6–8 sem.) → **Jalon M1**

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

**Critères de sortie (Definition of Done du MVP)**

- Sortie de **3 h en enchaînant les tours** de la boucle du col, sans crash, sans chute de FPS sous 30, sans perte de connexion non récupérée, et sans à-coup visuel ni de résistance au passage de ligne.
- Fichier `.fit` accepté par Strava et Garmin Connect, avec puissance, cadence, FC et altitude correctes.
- Testé sur au moins 2 trainers différents (le tien + un autre emprunté, ou un capteur de puissance seul ; aucun achat de matériel).
- Toutes les user stories **M** du [PRD](PRD.md) hors mode B sont validées.

---

## Phase 2 — Entraînement, vitesses virtuelles, comptes et intégrations (6–9 sem.) → **Jalon M2 : bêta privée**

| Lot | Contenu |
|---|---|
| 2.1 Mode ERG | Puissance cible, transitions douces entre intervalles, gestion du « spiral of death » (cadence trop basse). |
| 2.2 Séances | Éditeur simple, bibliothèque, import `.zwo` / `.erg` / `.mrc`, affichage du graphe de séance. |
| 2.3 Backend v1 (local) | API Fastify + PostgreSQL lancés en local (Docker Compose) ; comptes ; synchronisation des sorties et du profil ; fichiers sur disque local (ou MinIO). |
| 2.4 Strava | OAuth et upload automatique. |
| 2.5 Monde v1.1 | 2 à 3 boucles de plus, segments chronométrés, record personnel par segment. |
| 2.6 Fantômes | Rouler contre une de ses sorties précédentes ou contre son **meilleur tour** sur la boucle. |
| 2.7 PWA | Installable, cache des assets hors ligne. |
| 2.8 **Vitesses virtuelles** | Package `@hrt/drivetrain` : transmission configurable, stratégie S1 (décalage de pente) par défaut, S3 (ERG piloté par le rapport) en expérimental ; indicateur de rapport dans le HUD. Voir [15](15-vitesses-virtuelles-et-commandes.md). |
| 2.9 **Hub de commandes** | Package `@hrt/controls` : clavier, manettes (Gamepad API), télécommandes appairées au système, **OpenBikeControl en Bluetooth** (boutons, App Information, retour haptique), écran de mapping, profils ; test avec BikeControl en passerelle si disponible (smartphone) et en mode clavier. |

**Critères de sortie** : 5 à 10 testeurs bêta roulent chaque semaine ; aucun bug bloquant ouvert.

---

## Phase 3 — Mode monde réel, bêta (6–9 sem.) → **Jalon M3**

**Objectif** : rouler sur n'importe quel parcours réel, avec des images réelles et le vrai relief. Voir [06](06-monde-reel.md).

| Lot | Contenu |
|---|---|
| 3.0 **Spike imagerie** (1 sem.) | Prototype comparatif Mapillary (gratuit), Google Street View (seulement si un quota plafonné garantit 0 €) et vidéo GPX sur 3 parcours tests ; couverture, fluidité, licences, risque de facturation. **Décision finale de l'[ADR 0007](adr/0007-imagerie-monde-reel.md).** |
| 3.1 Import | GPX, TCX, FIT ; nettoyage (doublons, sauts GPS). |
| 3.2 Altimétrie | Correction de l'altitude par MNT, lissage, calcul de pente robuste, détection des montées. |
| 3.3 Tracé | Tracé sur carte avec routage vélo (BRouter / GraphHopper / OSRM). |
| 3.4 Lecteur d'images | Pré-chargement, synchronisation avec la vitesse, transitions (fondu, léger zoom), choix de l'image selon le cap. |
| 3.5 Repli | Vue carte 3D ou satellite lorsque la couverture en images manque. |
| 3.6 Parcours préparés | 5 à 10 montées célèbres pré-calculées et vérifiées. |
| 3.7 Télécommande smartphone | Page compagnon via QR code (gros boutons de vitesse, pause, caméra), liaison WebRTC/WebSocket. |
| 3.8 OpenBikeControl réseau | Relais local dans `apps/api` : découverte mDNS `_openbikecontrol._tcp`, connexion TCP, retransmission en WebSocket vers le navigateur. |

**Critères de sortie** : un GPX quelconque d'Europe de l'Ouest est jouable en moins de 60 s, avec une pente plausible et au moins 80 % du parcours couvert en images, ou un repli propre.

---

## Phase 4 — Multijoueur et social (6–8 sem.) → **Jalon M4 : bêta publique**

Voir [08](08-multijoueur.md).

| Lot | Contenu |
|---|---|
| 4.1 Serveur temps réel | Rooms par monde, diffusion des positions à 2–4 Hz, interpolation côté client. Testé en local et sur le réseau local (plusieurs navigateurs ou machines) ; le multijoueur en ligne suppose un hébergement public, à décider plus tard. |
| 4.2 Drafting | Réduction de la traînée derrière les autres coureurs. |
| 4.3 Présence | Liste des coureurs proches, abonnements, « ride ons ». |
| 4.4 Événements | Sorties de groupe planifiées, départ groupé. |
| 4.5 Bots | Bots « pacers » à puissance fixe pour animer le monde quand il y a peu de monde. |
| 4.6 Anti-triche de base | Contrôles de plausibilité (W/kg, sauts de position). |
| 4.7 Exploitation | Logs locaux, sauvegardes de la base locale ; CGU et politique de confidentialité **seulement si** un hébergement public est décidé. |
| 4.8 Vitesses virtuelles v2 | Choix final de la stratégie de vitesses par défaut ([ADR 0008](adr/0008-vitesses-virtuelles.md)) ; direction proportionnelle OpenBikeControl (`0x1B`) pour changer de boucle aux jonctions. |

---

## Phase 5 — Contenu, polish et plateformes (continu)

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
| M0 | Spikes validés | S+2 |
| **M1** | **MVP monde virtuel jouable et exportable** | S+10 |
| M2 | Bêta privée avec ERG, vitesses virtuelles, commandes, comptes, Strava | S+19 |
| M3 | Mode monde réel en bêta | S+28 |
| M4 | Multijoueur (réseau local tant qu'il n'y a pas d'hébergement) | S+36 |

## Ce qu'on prépare tôt pour ne pas le payer plus tard

- **Format de route unique** pour le mode A et le mode B (phase 1), afin que le mode B réutilise HUD, physique et enregistrement.
- **Interface `TrainerDevice` abstraite** (phase 0), pour ajouter ANT+, des protocoles propriétaires ou du BLE natif sans toucher au reste.
- **État du coureur sérialisable** (`RiderState`), qui servira tel quel pour les fantômes puis le multijoueur.
- **Boucle de simulation découplée du rendu**, pour qu'un onglet en arrière-plan ou un FPS bas ne fausse pas la physique.
- **Toutes les actions de sortie passent par un dispatcher d'actions** dès la phase 1 (même pour le clavier), pour que le hub de commandes et les vitesses virtuelles de la phase 2 s'y branchent sans refonte.
- **`TrainerController` qui compose plusieurs couches** (pente ressentie → difficulté → vitesses virtuelles → bornes du trainer), pour ajouter les vitesses virtuelles sans toucher à la physique.
