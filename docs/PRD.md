# PRD — HomeRealTrainer

| | |
|---|---|
| Statut | Brouillon v1, à valider avant le développement |
| Date | 2026-11-02 |
| Propriétaire produit | Nathan Jouannon |
| Documents liés | [ROADMAP](ROADMAP.md), [Architecture](01-architecture.md), [Questions ouvertes](13-questions-ouvertes.md) |

---

## 1. Contexte et vision

Rouler en intérieur sur home trainer est souvent monotone. Des applications comme Zwift, MyWhoosh, Rouvy ou FulGaz ont montré qu'un monde visuel, une résistance qui suit le relief et des données en temps réel rendent l'effort bien plus engageant.

**Vision** : une application **web**, sans installation, qui transforme une séance de home trainer en vraie sortie vélo :

- soit dans un **monde virtuel réaliste et original** (mode A) ;
- soit sur de **vraies routes** avec des images réelles et le vrai relief (mode B).

L'application est accessible depuis un simple navigateur, et le relief est fidèle : le trainer durcit dans les montées et s'allège dans les descentes.

## 2. Objectifs

| # | Objectif | Mesure |
|---|---|---|
| O1 | Connecter un home trainer connecté du marché depuis le navigateur, sans logiciel tiers | ≥ 90 % des trainers FTMS testés se connectent et sont pilotés |
| O2 | Restituer une sensation réaliste de la pente et de la vitesse | Vitesse simulée à ±5 % d'un calculateur de référence (voir [04](04-moteur-physique.md)) |
| O3 | Offrir un monde 3D immersif et fluide sur un ordinateur portable courant | 60 FPS visés, 30 FPS minimum sur la config de référence |
| O4 | Permettre de rouler sur n'importe quelle route réelle (mode B) | Import d'un GPX et départ en moins de 60 s |
| O5 | S'intégrer à l'écosystème du cycliste | Export `.fit` compatible Strava, Garmin Connect, Intervals.icu |

## 3. Non-objectifs (pour l'instant)

- Application mobile native iOS/Android (le web mobile est un bonus, pas une cible du MVP).
- Copier un monde, des parcours, des noms ou des visuels de Zwift, MyWhoosh ou d'autres jeux existants. Le monde, la marque et les assets sont **originaux**.
- Courses e-sport officielles avec contrôle anti-triche avancé.
- Course à pied (tapis connecté).
- Matériel propriétaire (direction, freinage, ventilateur intelligent) avant la phase 5.

## 4. Personas

| Persona | Profil | Besoin principal |
|---|---|---|
| **Camille, la cycliste d'hiver** | 35 ans, roule dehors l'été, 2 à 3 séances d'intérieur par semaine l'hiver | Ne pas s'ennuyer et garder la forme ; démarrage simple |
| **Hugo, le cycliste structuré** | 28 ans, suit un plan d'entraînement, connaît sa FTP | Séances structurées (mode ERG), données précises, export vers ses outils |
| **Martine, l'exploratrice** | 50 ans, aime les cols et les voyages | Rouler sur l'Alpe d'Huez ou le Ventoux depuis son salon (mode B) |
| **Le développeur (toi)** | Construit et teste l'application | Pouvoir développer sans trainer branché (trainer simulé), outils de debug BLE |

## 5. Périmètre fonctionnel

### 5.1 Socle commun (les deux modes)

- Appairage des capteurs : home trainer, capteur de puissance, cardio, cadence.
- Profil cycliste : poids, taille, FTP, poids du vélo, unités.
- Moteur physique : vitesse calculée depuis la puissance, la pente, le poids et l'aérodynamique.
- Pilotage du trainer : **mode SIM** (pente) et **mode ERG** (puissance cible).
- HUD temps réel : puissance, cadence, FC, vitesse, distance, temps, pente, dénivelé, profil d'élévation.
- Enregistrement de la sortie, récapitulatif de fin, export `.fit`.
- Historique des sorties.

### 5.2 Mode A — Monde virtuel réaliste

- **Toutes les routes du monde virtuel sont des boucles fermées.** À la fin d'un tour, le coureur enchaîne automatiquement sur le suivant, sans arrêt ni rechargement, et ce sans limite. On peut ainsi faire des séances longues (3 h, 5 h…) sans relancer de sortie.
- Un premier monde original avec au moins 3 boucles : plate, vallonnée, avec un col.
- Suivi des tours : numéro du tour, temps du tour en cours, dernier tour, meilleur tour ; un *lap* automatique par tour dans l'export `.fit`.
- Objectif de sortie optionnel (durée, distance ou nombre de tours) : une notification s'affiche quand il est atteint, mais la sortie continue jusqu'à ce que l'utilisateur l'arrête.
- Avatar cycliste animé, pédalage synchronisé sur la cadence.
- Plusieurs caméras : arrière, première personne, latérale, drone.
- Ambiance : ciel dynamique, heure du jour, sons.
- Plus tard : segments chronométrés (sprints, ascensions), autres coureurs (fantômes, bots puis multijoueur).

### 5.3 Mode B — Monde réel

- Import d'un parcours : fichier GPX/TCX/FIT, ou tracé sur une carte.
- Calcul du profil altimétrique fiable (lissage, correction par modèle numérique de terrain).
- Affichage d'images réelles le long du parcours, synchronisées avec la vitesse simulée.
- Carte et profil en surimpression.
- Plus tard : vidéos réelles géolocalisées, parcours célèbres préparés.

### 5.4 Entraînement structuré

- Bibliothèque de séances (endurance, sweet spot, VO2max, test FTP).
- Import de séances `.zwo` et `.erg`/`.mrc`.
- Le mode ERG est utilisable dans les deux modes : la route défile, mais la puissance est imposée.

### 5.5 Vitesses virtuelles et commandes physiques (outil type BikeControl intégré)

Fonction **attendue dans la solution finale**. Détail complet dans [15-vitesses-virtuelles-et-commandes.md](15-vitesses-virtuelles-et-commandes.md).

- **Boîte de vitesses virtuelle** : le vélo reste sur un rapport physique fixe (ou le trainer n'a pas de cassette) ; l'application simule 12 à 30 rapports configurables (plateaux, cassette, mode séquentiel) et adapte la résistance du trainer.
- **Hub de commandes** : clavier, manette de jeu, télécommandes Bluetooth, smartphone et **protocole ouvert OpenBikeControl** (licence MIT), associés à des actions configurables : vitesses, ERG ±, direction, caméra, pause…
- Les contrôleurs propriétaires (Zwift Click / Play / Ride, Di2…) sont accessibles via **BikeControl** utilisé comme passerelle optionnelle (OpenBikeControl, ou mode clavier) : aucun protocole propriétaire à implémenter. BikeControl n'est pas open source (licence non commerciale) et est payant après essai : on ne réutilise pas son code et on ne dépend pas de lui.

## 6. User stories

Priorités : **M** = Must (MVP), **S** = Should, **C** = Could, **W** = Won't (pas maintenant).

### Appairage et matériel

| ID | Story | Prio | Critères d'acceptation |
|---|---|---|---|
| US-01 | En tant que cycliste, je veux connecter mon home trainer en Bluetooth depuis le navigateur | M | Le sélecteur Bluetooth natif s'ouvre ; après sélection, la puissance s'affiche en < 3 s |
| US-02 | Je veux connecter une ceinture cardio séparée | M | La FC s'affiche et est enregistrée |
| US-03 | Je veux utiliser un capteur de puissance comme source de puissance à la place du trainer | S | Choix de la source « puissance » dans les réglages ; la valeur du capteur est utilisée pour la physique |
| US-04 | Je veux que l'application se reconnecte toute seule si la connexion BLE tombe | M | Reconnexion automatique en < 10 s ; la sortie n'est pas perdue |
| US-05 | En tant que développeur, je veux rouler avec un trainer simulé (clavier/curseur) | M | Un appareil « Simulé » est disponible en mode dev ; il expose la même interface qu'un vrai trainer |
| US-06 | Je veux que l'application se souvienne de mes capteurs | S | Au retour, reconnexion en un clic aux appareils déjà autorisés |

### Sortie en monde virtuel (mode A)

| ID | Story | Prio | Critères d'acceptation |
|---|---|---|---|
| US-10 | Je veux choisir une boucle et voir la longueur du tour, son dénivelé et son profil | M | Liste des boucles avec carte, longueur du tour, D+ par tour et profil |
| US-19 | Je veux enchaîner les tours sans interruption pour faire une séance longue sans relancer de sortie | M | Passage de la ligne → tour suivant sans arrêt, sans chargement, sans saut visuel ni à-coup de résistance ; aucune limite de tours |
| US-19b | Je veux voir mon numéro de tour, le temps du tour en cours, le dernier et le meilleur tour | M | Tuile « Tour » dans le HUD ; notification à chaque passage de ligne ; tableau des tours dans le récapitulatif |
| US-19c | Je veux me fixer un objectif (durée, distance ou nombre de tours) | S | Notification à l'atteinte de l'objectif ; la sortie continue tant que je ne l'arrête pas |
| US-11 | Je veux sentir la pente dans les jambes | M | La pente est envoyée au trainer au moins 1×/s ; la résistance change perceptiblement entre 0 % et 6 % |
| US-12 | Je veux voir mon avatar rouler à une vitesse cohérente avec mon effort | M | Vitesse conforme au modèle physique ; animation de pédalage à la cadence |
| US-13 | Je veux voir mes données en temps réel | M | HUD rafraîchi à au moins 4 Hz, latence capteur → écran < 250 ms |
| US-14 | Je veux régler la difficulté du trainer (pourcentage de pente ressentie) | M | Curseur de 0 à 100 %, 50 % par défaut |
| US-15 | Je veux changer de caméra | S | Au moins 3 vues, raccourci clavier |
| US-16 | Je veux faire demi-tour (rouler la boucle dans l'autre sens) ou basculer sur une autre boucle à une jonction, sans m'arrêter | C | Touche demi-tour ; flèche de choix aux jonctions entre boucles ; le compteur de tours repart sur la nouvelle boucle |
| US-17 | Je veux rouler avec des fantômes de mes sorties précédentes | C | Avatar translucide rejouant une activité passée |
| US-18 | Je veux voir mon temps sur les segments chronométrés | C | Classement personnel par segment |

### Mode monde réel (mode B)

| ID | Story | Prio | Critères d'acceptation |
|---|---|---|---|
| US-30 | Je veux importer un fichier GPX et rouler dessus | M (phase 3) | Parcours affiché sur une carte avec profil ; départ possible |
| US-31 | Je veux que la pente soit réaliste même si mon GPX est bruité | M (phase 3) | Pente lissée, pas de pics aberrants > 25 % sur une route normale |
| US-32 | Je veux voir de vraies images de la route pendant que je roule | M (phase 3) | Images affichées en avançant au rythme de la vitesse simulée ; transitions fluides |
| US-33 | Je veux tracer un parcours sur une carte | S | Tracé point par point avec routage cyclable automatique |
| US-34 | Je veux une solution de repli quand aucune image n'existe | S | Bascule sur carte 3D/satellite + profil, sans planter |
| US-35 | Je veux rouler sur des parcours célèbres préparés | C | Catalogue de cols et de classiques |

### Entraînement

| ID | Story | Prio | Critères d'acceptation |
|---|---|---|---|
| US-40 | Je veux suivre une séance structurée en mode ERG | S | Le trainer impose la puissance cible ; affichage de l'intervalle courant et du suivant |
| US-41 | Je veux importer une séance `.zwo` | S | La séance est lue et jouable |
| US-42 | Je veux faire un test FTP et mettre à jour ma FTP | C | Protocole rampe ou 20 min ; proposition de nouvelle FTP |

### Vitesses virtuelles et commandes

| ID | Story | Prio | Critères d'acceptation |
|---|---|---|---|
| US-70 | En tant que cycliste avec un trainer sans cassette, je veux changer de vitesse virtuellement | S (phase 2), M version finale | Chaque passage modifie la résistance de façon perceptible en < 500 ms |
| US-71 | Je veux choisir ma transmission virtuelle | S | Préréglages + personnalisation (plateaux, pignons, séquentiel) |
| US-72 | Je veux changer de vitesse avec une manette ou une télécommande de guidon | S | Gamepad API et télécommandes appairées au système fonctionnent |
| US-73 | Je veux utiliser un contrôleur compatible OpenBikeControl (natif, ou Zwift Click / Play / Ride, Di2… via BikeControl) | S (phase 2), M version finale | Appairage Web Bluetooth du service OpenBikeControl, reconnexion, passage de vitesse < 150 ms jusqu'à l'envoi BLE au trainer |
| US-74 | Je veux réassigner n'importe quel bouton à n'importe quelle action | S | Écran de mapping « appuyer pour assigner », profils sauvegardés |
| US-75 | Je veux voir le rapport engagé | S | Indicateur dans le HUD |
| US-76 | En ERG, je veux que les boutons de vitesse ajustent la puissance cible | S | ±5 W par appui |
| US-77 | Je veux utiliser mon téléphone comme télécommande | C | Page compagnon via QR code |
| US-78 | Je veux diriger aux intersections avec un contrôleur | C | Sterzo ou joystick reconnus |

### Après la sortie

| ID | Story | Prio | Critères d'acceptation |
|---|---|---|---|
| US-50 | Je veux un récapitulatif de fin de sortie | M | Durée, distance, D+, puissance moy./normalisée, FC moy., graphiques |
| US-51 | Je veux exporter ma sortie en `.fit` | M | Fichier accepté sans erreur par Strava et Garmin Connect |
| US-52 | Je veux envoyer automatiquement mes sorties sur Strava | S | OAuth Strava ; upload à la fin de la sortie |
| US-53 | Je veux consulter l'historique de mes sorties | M | Liste avec stats ; détail consultable |
| US-54 | Je veux ne rien perdre si l'onglet se ferme ou plante | M | Sauvegarde incrémentale ; reprise ou export de la sortie partielle |

### Compte et social (phase 2 et plus)

| ID | Story | Prio | Critères d'acceptation |
|---|---|---|---|
| US-60 | Je veux un compte pour retrouver mes données sur plusieurs appareils | S | Inscription, connexion, synchronisation |
| US-61 | Je veux voir d'autres cyclistes rouler en même temps que moi | C (phase 4) | Avatars des autres joueurs visibles en temps réel |
| US-62 | Je veux profiter de l'aspiration derrière d'autres coureurs | C (phase 4) | Gain de vitesse à puissance égale dans le sillage |
| US-63 | Je veux organiser une sortie de groupe | C (phase 4) | Événement à heure fixe avec point de départ commun |

## 7. Exigences fonctionnelles

| ID | Exigence |
|---|---|
| FR-01 | Le système supporte le protocole Bluetooth FTMS en lecture (puissance, cadence, vitesse) et en écriture (pente, puissance cible). |
| FR-02 | Le système supporte les profils Cycling Power, Heart Rate et Cycling Speed & Cadence. |
| FR-03 | La vitesse virtuelle est calculée par le moteur physique depuis la puissance, jamais lue sur le trainer. |
| FR-04 | Une boucle de simulation à pas fixe (≥ 20 Hz) met à jour position, vitesse et pente. |
| FR-05 | Les commandes au trainer sont limitées en fréquence (≤ 2/s) et filtrées (variation minimale) pour ne pas saturer le lien BLE. |
| FR-06 | Les données de sortie sont échantillonnées à 1 Hz et sauvegardées localement au fil de l'eau. |
| FR-07 | L'export `.fit` respecte le profil FIT Activity (messages File ID, Record, Lap, Session, Activity). |
| FR-08 | Les routes sont décrites par un format interne commun aux deux modes (polyligne 3D + profil + métadonnées), voir [07](07-donnees-et-api.md). |
| FR-17 | En mode A, toute route est une **boucle fermée et continue** : la position, l'altitude, la pente et le cap se raccordent sans discontinuité à la ligne de départ et d'arrivée. Le moteur de route gère la distance modulo la longueur du tour ; la distance totale de la sortie continue de croître. Le passage de ligne crée un nouveau tour (lap). |
| FR-09 | Le mode B accepte GPX 1.1, TCX et FIT en entrée. |
| FR-10 | Le fournisseur d'images du mode B est interchangeable via une interface `ImageryProvider`. |
| FR-11 | L'écran ne se met pas en veille pendant une sortie (Screen Wake Lock API). |
| FR-12 | L'interface est disponible en français et en anglais. |
| FR-13 | Toutes les grandeurs sont affichables en système métrique ou impérial. |
| FR-14 | Le système fournit une boîte de vitesses virtuelle configurable, pilotant le trainer selon une stratégie interchangeable (`ShiftingStrategy` : décalage de pente, pente équivalente, ERG piloté par le rapport). |
| FR-15 | Toute entrée (clavier, manette, télécommande, smartphone, contrôleur BLE) passe par un hub de commandes unique avec une table de correspondance éditable et persistée. |
| FR-18 | Le système implémente le protocole **OpenBikeControl** côté application : Bluetooth (service `d273f680-…`, notifications d'état des boutons, écriture App Information et retour haptique) et réseau mDNS/TCP via un relais local. |
| FR-16 | L'application est entièrement pilotable au clavier pendant une sortie, avec une table de touches documentée (et donc compatible avec BikeControl en mode clavier). |

## 8. Exigences non fonctionnelles

| ID | Catégorie | Exigence |
|---|---|---|
| NFR-01 | Navigateurs | Chrome et Edge desktop (Windows, macOS, Linux, ChromeOS) récents : support complet. Chrome Android : best effort. Safari/Firefox : écran explicatif (pas de Web Bluetooth). |
| NFR-02 | Performance rendu | 60 FPS visés, 30 FPS minimum en 1080p sur la config de référence (MacBook Air M1 ou PC portable avec GPU intégré récent). Qualité graphique ajustable (bas/moyen/haut/auto). |
| NFR-03 | Latence | Notification BLE → HUD < 250 ms. Changement de pente → commande envoyée au trainer < 1 s. |
| NFR-04 | Chargement | Première ouverture < 5 s (hors assets du monde). Monde prêt à rouler < 15 s sur connexion 50 Mb/s ; chargements suivants depuis le cache < 5 s. |
| NFR-05 | Robustesse | Une perte BLE, réseau ou un plantage d'onglet ne fait jamais perdre plus de 10 s de données. |
| NFR-06 | Endurance | Une sortie de **6 h** (plusieurs dizaines de tours) ne provoque ni fuite mémoire, ni baisse de FPS de plus de 10 %, ni dérive de position au passage des tours. |
| NFR-07 | Sécurité | HTTPS obligatoire (requis par Web Bluetooth). Aucune clé API secrète exposée côté client ; clés publiques restreintes par domaine. |
| NFR-08 | Vie privée | Données de santé (FC) traitées selon le RGPD : consentement explicite, export et suppression des données. En exécution locale, les données ne quittent pas la machine ; en cas d'hébergement futur : hébergement UE. Voir [11](11-legal-licences.md). |
| NFR-09 | Accessibilité | HUD lisible à 2–3 m de l'écran (grandes polices, contraste élevé) ; navigation clavier complète hors 3D. |
| NFR-10 | Maintenabilité | TypeScript strict ; couverture de tests ≥ 80 % sur `physics`, `devices`, `route-engine`. |
| NFR-11 | Coûts | **0 €** : aucune dépense d'infrastructure, d'API ou d'assets. Tout tourne en local ; toute dépendance externe doit être gratuite et utilisable sans risque de facturation. |
| NFR-12 | Réactivité des commandes | Appui sur un bouton → commande BLE envoyée < 150 ms ; changement de résistance ressenti < 500 ms (stratégie par défaut). |

## 9. Indicateurs de succès (KPI)

**Qualité produit**

- Taux de connexion trainer réussie au premier essai ≥ 90 %.
- Sorties terminées sans crash ≥ 99 %.
- FPS médian ≥ 50 sur la config de référence.

**Usage** (si ouverture au public)

- Durée moyenne de sortie ≥ 45 min.
- Rétention à 4 semaines ≥ 30 % des utilisateurs actifs.
- Part des sorties exportées vers Strava ou Garmin.

## 10. Hypothèses et contraintes

- **H1** : la cible principale possède un home trainer « smart » compatible **FTMS** (standard sur la quasi-totalité des modèles vendus depuis 2020 : Wahoo, Tacx/Garmin, Elite, Saris, JetBlack, Van Rysel, Zwift Hub…).
- **H2** : l'utilisateur roule sur un ordinateur (portable ou fixe) avec Chrome ou Edge. C'est une contrainte forte de Web Bluetooth, voir [ADR 0001](adr/0001-application-web-web-bluetooth.md).
- **H3** : projet porté au départ par un seul développeur ; le périmètre est découpé en conséquence.
- **H4** : le MVP fonctionne sans compte utilisateur (local-first).
- **H5** : le modèle économique n'est pas encore fixé ; on évite tout choix qui empêcherait une ouverture au public (licences, marques, CGU des API).
- **H6 — Budget zéro** : aucune dépense en dehors de l'outil d'IA de développement (déjà payé). Pas d'API payante, pas d'achat d'assets, pas d'abonnement SaaS, pas de nom de domaine. Seuls les services gratuits (open source, données ouvertes, offres gratuites sans carte bancaire si possible) sont autorisés. Voir [ADR 0010](adr/0010-budget-zero-execution-locale.md).
- **H7 — Exécution locale** : pour l'instant, l'application tourne **uniquement en local** sur la machine du développeur (`localhost`, qui est un contexte sécurisé, donc compatible avec Web Bluetooth). Aucun hébergement public tant que ce n'est pas décidé explicitement.

## 11. Dépendances externes

| Dépendance | Usage | Phase |
|---|---|---|
| Web Bluetooth (navigateur) | Connexion des capteurs | 0 |
| Modèle numérique de terrain (Copernicus GLO-30, IGN RGE ALTI…) | Relief du monde virtuel, correction d'altitude du mode B | 1 / 3 |
| OpenStreetMap | Routes, occupation du sol, routage | 1 / 3 |
| Mapillary API v4 | Images de rue (mode B) | 3 |
| Google Street View (Maps Platform) | Images de rue alternatives (mode B, **optionnel**) : uniquement avec un quota journalier plafonné sous le palier gratuit pour garantir 0 €, sinon non utilisé | 3 |
| Strava API | Upload automatique | 2 |
| Garmin FIT SDK | Encodage des fichiers `.fit` | 1 |
| Gamepad API (navigateur) | Manettes de jeu comme commandes | 2 |
| Protocole OpenBikeControl (MIT) | Commandes physiques standardisées | 2 |
| BikeControl (application tierce, optionnelle, payante après essai) | Passerelle des contrôleurs propriétaires vers OpenBikeControl, côté utilisateur | 2 |

## 12. Hors périmètre explicite du MVP

Comptes utilisateurs, multijoueur, mode B (monde réel), séances structurées avancées, vitesses virtuelles et contrôleurs physiques (hors raccourcis clavier), mobile, ANT+, intégrations hors export `.fit` manuel.

## 13. Validation

Le PRD est validé lorsque les questions bloquantes de [13-questions-ouvertes.md](13-questions-ouvertes.md) ont une réponse ou que leur hypothèse par défaut est acceptée.
