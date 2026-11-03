# Registre des risques

Échelle : Probabilité (P) et Impact (I) de 1 (faible) à 3 (fort). Score = P × I.

| # | Risque | P | I | Score | Parade | Phase |
|---|---|---|---|---|---|---|
| R1 | **Web Bluetooth absent sur Safari, iOS et Firefox** : une partie des utilisateurs ne peut pas utiliser l'app | 3 | 2 | 6 | Cible desktop Chrome/Edge assumée ; écran explicatif ; Bluefy sur iOS ; enveloppe native (Capacitor/Tauri) en phase 6 | 0 |
| R2 | **Charge de contenu 3D sous-estimée** (monde réaliste = beaucoup d'assets et de réglages) | 3 | 3 | 9 | Relief réel + procédural ; assets CC0 uniquement (budget zéro, pas d'achat ni d'artiste) ; monde v1 petit (8 × 8 km) ; viser un rendu « réaliste stylisé » cohérent plutôt que photoréaliste | 1 |
| R3 | Performances 3D insuffisantes sur les machines modestes | 2 | 3 | 6 | Spike phase 0 ; budgets mesurés en CI ; qualité auto ; WebGL2 en repli | 0–1 |
| R4 | Compatibilité FTMS variable entre marques (parsers, comportement en SIM) | 2 | 2 | 4 | Parsers pilotés par les flags ; fixtures multi-marques ; journal BLE pour le support | 1 |
| R5 | **Coût et CGU de Street View** incompatibles avec le budget zéro | 3 | 2 | 6 | Mapillary comme fournisseur principal ; Street View seulement avec un quota plafonné garantissant 0 € ; abstraction `ImageryProvider` | 3 |
| R6 | Couverture Mapillary insuffisante sur les routes de montagne | 3 | 2 | 6 | Repli 3D procédural et carte ; parcours du catalogue choisis selon la couverture ; vidéo en phase 6 | 3 |
| R7 | Altimétrie bruitée → pentes absurdes, mauvaise expérience | 2 | 2 | 4 | MNT + lissage + gestion des ponts et tunnels ; validation manuelle du catalogue | 3 |
| R8 | **Dérive du périmètre** (vouloir tout Zwift d'un coup) | 3 | 3 | 9 | Roadmap phasée ; chaque phase jouable ; « Won't » explicites dans le PRD | toutes |
| R9 | Bande passante d'un développeur seul | 3 | 2 | 6 | Spikes courts ; réutiliser des bibliothèques éprouvées ; automatiser les tests | toutes |
| R10 | Animation réaliste de l'avatar difficile | 2 | 2 | 4 | IK procédural ; MakeHuman (CC0) + Mixamo (gratuit) ; caméra par défaut assez éloignée | 1 |
| R11 | Onglet en arrière-plan ou ralentissement des timers → physique faussée | 2 | 2 | 4 | `dt` réel + sous-pas, ou boucle en Worker ; tests dédiés | 0 |
| R12 | Perte de données de sortie (crash, fermeture) | 2 | 3 | 6 | Sauvegarde incrémentale toutes les 10 s en IndexedDB ; reprise au redémarrage | 1 |
| R13 | Complexité du multijoueur (synchro, triche) ; **impossible en ligne sans hébergement** | 2 | 2 | 4 | Physique locale, serveur relais, rooms ; repoussé en phase 5 ; tests en réseau local ; hébergement gratuit à étudier le moment venu | 4 |
| R14 | Protocoles propriétaires des contrôleurs (Zwift Click/Play/Ride, Sterzo) | 1 | 2 | 2 | **Contourné** : protocole ouvert OpenBikeControl (MIT) ; contrôleurs propriétaires via BikeControl côté utilisateur ; implémentation directe seulement en repli (phase 6) | 5 |
| R21 | Dépendance à BikeControl (payant après essai, licence non commerciale, évolutions hors de notre contrôle) pour les contrôleurs propriétaires | 2 | 1 | 2 | BikeControl reste optionnel ; clavier, manette, smartphone et matériel OpenBikeControl natif suffisent ; aucun code de BikeControl dans le projet | 2 |
| R22 | Bluetooth : BikeControl et le navigateur sur la même machine ne peuvent probablement pas se connecter entre eux | 2 | 1 | 2 | BikeControl sur smartphone, ou mode réseau via le relais local ; à vérifier au spike | 2 |
| R23 | **Zwift Click v2 inutilisable hors Zwift** (verrouillage Zwift, support tiers instable) alors que c'est le contrôleur acheté | 3 | 2 | 6 | Clavier au MVP ; télécommande smartphone gratuite en phase 3 ; spike Click direct ; BikeControl en option | 1–2 |
| R24 | Trainer pas encore livré : le prototype Bluetooth de la phase 0 est bloqué | 2 | 1 | 2 | Avancer avec le trainer simulé, la structure du projet, la 3D et la physique ; spike BLE à la livraison | 0 |
| R15 | Vitesses virtuelles peu réalistes ou latentes selon le trainer | 2 | 2 | 4 | Plusieurs stratégies (S1/S3) ; réglages fins ; tests sur au moins 2 trainers | 2 |
| R16 | Trop de connexions BLE simultanées (trainer + capteurs + contrôleurs) pour l'adaptateur Bluetooth | 2 | 2 | 4 | Tester les limites ; recommander une clé BLE ; prioriser les connexions essentielles | 2 |
| R17 | Évolution des API navigateur (Web Bluetooth, WebGPU) | 1 | 2 | 2 | Veille ; repli WebGL2 ; abstraction `Device` | toutes |
| R18 | Licences d'assets ou de données mal tracées | 2 | 2 | 4 | `assets-licenses.json` obligatoire, vérifié en CI | 1 |
| R19 | **Facturation surprise** d'un service externe (clé API avec facturation activée, dépassement de quota gratuit) | 1 | 3 | 3 | Règle budget zéro : pas de service avec carte bancaire, sauf quota plafonné vérifié ; liste des dépendances externes revue à chaque phase | toutes |
| R20 | Limites de débit des API publiques gratuites (Mapillary, OpenTopoData, BRouter public) | 2 | 1 | 2 | Cache local agressif ; exécution locale de BRouter et des MNT ; pré-calcul des parcours | 3 |

## Top 3 à surveiller

1. **R2 / R8** : contenu et périmètre. C'est ce qui fait échouer ce genre de projet. On livre petit et jouable.
2. **R1** : contrainte navigateur, assumée dès le départ.
3. **R5 / R6** : viabilité du mode B, tranchée par un spike avant d'y investir.
