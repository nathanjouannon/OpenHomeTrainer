# Vitesses virtuelles et commandes physiques

> Demande produit : intégrer à la solution finale un outil **similaire à BikeControl**, pour contrôler un **changement de vitesses simulé** (virtual shifting) avec des boutons ou manettes physiques.

## 1. Référence : ce que fait BikeControl

[BikeControl](https://github.com/OpenBikeControl/bikecontrol) (anciennement SwiftControl) est une application séparée, disponible sur iOS, Android, macOS et Windows, qui :

- se connecte à des **contrôleurs physiques** : Zwift Click, Zwift Play, Zwift Ride, Shimano Di2, Wahoo KICKR Bike Shift, CYCPLUS BC2, etc. ;
- **traduit leurs boutons en commandes** pour une application de home trainer (MyWhoosh, Rouvy, Zwift…), par émulation clavier ou tactile, par le réseau ou en simulant un appareil Bluetooth ;
- **ajoute un changement de vitesses virtuel** aux applications qui n'en ont pas, avec un nombre de vitesses et des rapports configurables.

### 1.1 Licence de BikeControl : pas open source (vérifié le 2026-11-02)

| Élément | Constat |
|---|---|
| Code de l'application BikeControl | **Code source public, mais pas open source** au sens strict. Les versions récentes sont sous une **licence non commerciale** propriétaire (OpenBikeControl UG) : usage personnel, éducatif ou d'évaluation uniquement ; modification non commerciale ; redistribution uniquement en source, gratuitement, sous la même licence ; **licence révocable** ; tout usage commercial interdit sans accord écrit. |
| Anciennes versions | Publiées sous **GPL-3.0** avant le tag `gpl3` du dépôt ; elles restent sous cette licence. |
| Application distribuée | Gratuite au téléchargement avec achats intégrés. Après un **essai de 5 jours**, un déblocage payant ou un abonnement « Pro » semble nécessaire (prix variables selon les stores). Le contenu exact de la version gratuite est à vérifier. |
| Langage | Dart / Flutter, donc pas directement réutilisable dans notre code TypeScript. |
| **Protocole OpenBikeControl** | Dépôt séparé [`openbikecontrol-protocol`](https://github.com/OpenBikeControl/openbikecontrol-protocol) sous **licence MIT** : **vraiment open source**, sans frais de licence. Implémenté par MyWhoosh, TrainingPeaks Virtual, Biketerra (application web, en Bluetooth), etc. |

**Conséquences** :
- On **ne copie pas** de code de BikeControl. La licence non commerciale lierait notre projet à ses conditions, et la version GPL-3.0 imposerait la GPL. Le code est en plus écrit dans un autre langage.
- On **implémente le protocole ouvert OpenBikeControl** (MIT), qui est fait exactement pour ça : permettre à une application de home trainer de recevoir les commandes de n'importe quel contrôleur.
- BikeControl devient une **passerelle optionnelle**, installée par l'utilisateur s'il le souhaite. Elle convertit Zwift Click/Play/Ride, Di2, etc. en OpenBikeControl, et HomeRealTrainer la reçoit sans rien connaître des protocoles propriétaires. Budget zéro : son achat éventuel n'est pas prévu par le projet. Tout doit fonctionner sans elle (clavier, manette, smartphone, matériel compatible OpenBikeControl).

### 1.2 Ce que HomeRealTrainer intègre

Les deux fonctions sont **intégrées nativement** :

1. **Une boîte de vitesses virtuelle** (`@hrt/drivetrain`).
2. **Un hub de commandes** (`@hrt/controls`) qui accepte de nombreuses sources d'entrée, **dont le protocole OpenBikeControl**, et les associe à des actions configurables.

Comme l'application est aussi pilotable entièrement au clavier, BikeControl peut également la commander en mode clavier, en solution de secours.

### 1.3 Matériel du développeur : ce que ça implique (vérifié le 2026-11-02)

| Matériel | Utilisable dans HomeRealTrainer ? | Comment |
|---|---|---|
| **Zwift Cog** | **Oui** | Pignon fixe : le rapport physique = plateau utilisé × Cog. Toutes les vitesses passent par la boîte virtuelle HomeRealTrainer (S1/S3 via FTMS). Conséquence : **vitesses virtuelles + raccourcis clavier dès la phase 1** |
| **Zwift Click v2** | **Incertain** | Zwift n'a pas publié de protocole ouvert. Le support tiers repose sur de la rétro-ingénierie et casse régulièrement ; la v2 doit être périodiquement « déverrouillée » via Zwift (BikeControl le gère, l'abonnement Pro évitant de redéverrouiller toutes les 24 h). Plusieurs applications tierces ont perdu ou n'ont jamais eu le support. **Options** : (a) via BikeControl en passerelle (payant pour un usage confortable, donc hors budget du projet) ; (b) implémentation directe en spike phase 2 (fragile, peut nécessiter le déverrouillage Zwift) ; (c) repli gratuit : clavier, smartphone, manette |
| **Shimano Ultegra Di2** (R8050/R8070) | **Seulement avec une unité EW-WU111** (D-Fly, achat) | Les boutons cachés des cocottes passent alors en BLE (D-Fly), relayés par BikeControl. Sans cette unité, rien à faire côté logiciel. Sur un Zwift Cog, les passages Di2 réels déplacent le dérailleur pour rien : seuls les boutons « libres » sont intéressants |

**Conséquence sur le plan** : comme le Zwift Click n'est pas garanti, la **télécommande smartphone** (gratuite, développée par nous) est avancée en **phase 2** pour servir de contrôleur fiable posé sur le guidon. Au MVP, le clavier suffit.

## 2. Pourquoi des vitesses virtuelles

- Beaucoup de home trainers récents sont vendus **sans cassette** (Zwift Hub One, KICKR Core Zwift One…) ou avec un pignon unique.
- Changer de vitesse sur la cassette réelle est bruyant, use la transmission et oblige à avoir le vélo réglé.
- Avec un vélo laissé sur **un rapport physique fixe**, l'application simule 12 à 30 rapports, avec un passage instantané et silencieux.

## 3. Boîte de vitesses virtuelle

### 3.1 Configuration

| Paramètre | Exemple | Défaut |
|---|---|---|
| Plateaux virtuels | `[50, 34]` | 50/34 |
| Cassette virtuelle | 10 à 13 vitesses, au choix dans les réglages | 11–34, 12 vitesses |
| Rapport physique du trainer | plateau / pignon réellement engagés, ex. 50 × 17 | à renseigner (utilisé par la stratégie réaliste) |
| Circonférence de roue | 2,105 m (700 × 25c) | 2,105 m |
| Rapport de départ | index | milieu de plage |

Cassettes proposées (plateaux 50/34) : 10 v 11–28, 11 v 11–28, **12 v 11–34** (défaut), 13 v 11–34.

Le passage se fait comme sur un vrai vélo :
- `A` / `Z` : un pignon plus grand / plus petit, sur le plateau engagé ;
- `Q` / `S` : petit / grand plateau, le pignon reste le même ;
- en bout de cassette, un clic de plus change de plateau tout seul et prend le premier pignon qui donne le rapport suivant (comme le *synchro shift* Shimano Di2). Deux boutons suffisent donc pour parcourir toute la plage.

### 3.2 Grandeurs dérivées

```
r_v      = plateau / pignon                     (rapport virtuel)
v_gear   = cadence/60 × r_v × circonférence     (vitesse « imposée » par le rapport, m/s)
```

La **vitesse du jeu reste calculée par le moteur physique à partir de la puissance mesurée** ([04](04-moteur-physique.md)). Le rapport ne modifie que la **résistance** demandée au trainer, et donc le couple de pédalage, comme sur la route.

### 3.3 Stratégies de pilotage du trainer

Trois stratégies sont prévues, derrière une même interface `ShiftingStrategy`.

| | S1 — Décalage de pente | S2 — Pente équivalente (couple) | S3 — ERG piloté par le rapport |
|---|---|---|---|
| Principe | `pente_envoyée = pente_ressentie + Δ(rapport)` | On envoie la pente qui fait produire au trainer la force équivalente au rapport virtuel : `F_trainer = F_route(v) × r_v / r_physique` | On calcule la puissance nécessaire pour rouler à `v_gear` sur la route actuelle, puis on l'envoie en consigne ERG (2–4 Hz) |
| Commande FTMS | `0x11` (simulation) | `0x11` (simulation) | `0x05` (puissance cible) |
| Réalisme | Moyen : sensation de « dur / facile » cohérente mais pas exacte | Bon si calibré | Très bon en régime établi |
| Latence perçue d'un changement | < 0,5 s | < 0,5 s | 1–3 s (inertie de l'ERG) |
| Dépendances | Aucune | Rapport physique + modèle interne du trainer (masse supposée…) → calibration | Cadence fiable, lissage |
| Risques | Simpliste aux extrêmes | Modèle interne du trainer inconnu et variable selon les marques | Sensation « ERG » artificielle, oscillations, mauvaise gestion des sprints |
| Statut | **Phase 1, mode par défaut** (indispensable avec un Zwift Cog) | Expérimental après mesure sur matériel | **Phase 2, expérimental (« mode réaliste »)** |

**S1 en détail** : `Δ(rapport) = k × ln(r_v / r_ref)`, où `r_ref` est le rapport neutre (milieu de plage). `k` est réglé pour qu'un cran corresponde environ à +0,5–1 % de pente. Le résultat est borné à la plage du trainer. En descente, l'offset reste appliqué : on peut « pousser » dans un gros braquet.

**S3 en détail** :

```
v_gear      = cadence/60 × r_v × C
P_cible     = (F_gravité + F_roulement + F_aéro)(v_gear, pente_ressentie) × v_gear / η
P_cible     = clamp(lissé(P_cible), P_min_trainer, P_max_trainer)
```

Si la cadence tombe à 0, la consigne descend progressivement : jamais de saut brutal.

**S4 — vitesses virtuelles natives du trainer** (Zwift Hub, trainers « Zwift Cog » et firmwares compatibles) : le trainer gère lui-même le rapport, ce qui donne le meilleur ressenti. Le protocole est propriétaire et non documenté publiquement : **étude seulement en phase 5**, sous réserve des aspects juridiques ([11](11-legal-licences.md)).

Le choix final de la stratégie par défaut se fera après des essais sur au moins deux trainers ([ADR 0008](adr/0008-vitesses-virtuelles.md)).

### 3.4 Interaction avec les autres modes

| Mode | Effet des boutons de vitesse |
|---|---|
| SIM (sortie libre) | Changement de rapport virtuel |
| ERG (séance structurée) | **+/− 5 W** (ou ±1 % de FTP) sur la consigne ; le rapport est mémorisé mais inactif |
| Résistance manuelle | Niveau de résistance +/− |
| Vitesses virtuelles désactivées | Les boutons restent mappables à d'autres actions |

### 3.5 Retour à l'utilisateur

- HUD : indicateur de rapport (ex. `50 × 17` ou `14 / 24`), barre de position dans la cassette, cadence conseillée optionnelle.
- Son discret de « clic » à chaque passage, désactivable.
- Animation du dérailleur sur l'avatar (phase 5, cosmétique).
- Enregistrement du rapport dans la sortie (champ développeur FIT ou champ `gear` interne) pour l'analyse.

## 4. Hub de commandes (équivalent BikeControl intégré)

### 4.1 Architecture

```
 Sources d'entrée                    Hub                              Actions
┌──────────────────────┐   InputEvent   ┌───────────────┐   Action   ┌─────────────────────────┐
│ Clavier              │ ─────────────▶ │               │ ─────────▶ │ drivetrain.shiftUp()    │
│ Manette (Gamepad API)│                │  InputHub     │            │ drivetrain.shiftDown()  │
│ Smartphone (remote)  │                │  + ActionMap  │            │ camera.next()           │
│ Télécommande HID/OS  │                │  (profils)    │            │ ride.pause()            │
│ Contrôleurs BLE vélo │                │               │            │ route.turnLeft() …      │
│ (Click/Play/Ride,    │                └───────────────┘            └─────────────────────────┘
│  Sterzo, Di2…)       │
└──────────────────────┘
```

- Chaque source produit des `InputEvent` normalisés : `{ source, deviceId, control: 'button:shift_up' | 'axis:steer' …, type: 'press' | 'release' | 'long_press' | 'double_press' | 'value', value? }`.
- Une **table de correspondance** (`ActionMap`) relie `(appareil, contrôle, type)` à une action. Elle est éditable dans l'interface, avec des profils par appareil et un mode « appuyer sur le bouton à assigner ».
- Répétition automatique quand un bouton est maintenu (ex. un passage de vitesse toutes les 250 ms), configurable.
- Les contrôleurs BLE vélo sont des `Device` de type `controller` dans `@hrt/devices` : même appairage, même reconnexion automatique que le trainer ([03](03-materiel-protocoles.md)).

### 4.2 Actions mappables

| Catégorie | Actions |
|---|---|
| Transmission | Vitesse +/−, plateau +/− (mode double), rapport précis (raccourcis 1–9) |
| Entraînement | ERG +/− 5 W, intervalle suivant, pause/reprise de la séance |
| Navigation | Gauche / tout droit / droite à la prochaine intersection, demi-tour, direction analogique (Sterzo, joystick) |
| Caméra | Vue suivante / précédente, zoom |
| Sortie | Pause, reprise, tour manuel (lap), fin de sortie |
| Social (phase 4) | Ride on, emote, power-up |
| Interface | Masquer/afficher le HUD, muet, plein écran |

### 4.3 Sources d'entrée supportées

| Source | Technologie | Faisabilité navigateur | Phase |
|---|---|---|---|
| **Clavier** | `keydown` / `keyup` | Totale. Table de touches documentée par défaut (ex. `↑/↓` puissance simulée, `A/Z` vitesses, `1–9` caméras) | **1** (actions et vitesses) |
| **Manette de jeu** (Xbox, PlayStation, 8BitDo, mini-manettes de guidon) | **Gamepad API** | Totale sur Chrome/Edge | 2 |
| **Télécommandes Bluetooth génériques** (télécommandes média, anneaux, clickers de présentation) | Appairées au niveau du système → événements clavier ou touches média (Media Session API) | Bonne. Le service HID est bloqué dans Web Bluetooth, mais l'appairage OS suffit. WebHID en option pour certains modèles | 2 |
| **OpenBikeControl — Bluetooth** | Web Bluetooth (l'application est « central », le contrôleur est « peripheral ») ; voir §4.5 | **Totale** : c'est le cas d'usage de Biketerra, une application web | **2** |
| **OpenBikeControl — réseau (mDNS + TCP)** | Le navigateur ne peut faire ni mDNS ni TCP brut → **relais local** dans le serveur Node (`apps/api`) : découverte mDNS, connexion TCP, retransmission au navigateur en WebSocket | Bonne, via le relais local (budget zéro : tout est en local) | 3 |
| **Smartphone comme télécommande** | Page web compagnon ouverte via QR code sur le réseau local ; liaison WebSocket via le serveur local | Totale ; vibration à chaque passage (Vibration API sur Android) | **2** (avancé : contrôleur gratuit et fiable en attendant le Zwift Click) |
| **Zwift Click / Play / Ride, Shimano Di2, Wahoo KICKR Bike Shift…** | **Via BikeControl** (passerelle optionnelle de l'utilisateur) → OpenBikeControl | Rien à implémenter de propriétaire chez nous. Zwift Click v2 : support tiers instable (voir §1.3) | 2 (dès que la source OpenBikeControl existe) |
| **Zwift Click v2 en direct** | Web Bluetooth, protocole Zwift rétro-ingéniéré par la communauté | **Spike** car c'est le matériel du développeur ; fragile (déverrouillage Zwift, mises à jour de firmware) ; abandonné si non fiable | 2 (spike) |
| Matériel compatible OpenBikeControl en natif (ex. Stages SB200) | OpenBikeControl Bluetooth | Totale | 2 |
| **Elite Sterzo Smart** (direction) | Via BikeControl si supporté (à vérifier), sinon protocole propriétaire direct | À vérifier | 5 |
| Implémentation directe des protocoles propriétaires (Zwift Click/Play/Ride…) | Web Bluetooth, protocoles documentés par la communauté | **Repli seulement**, si OpenBikeControl et BikeControl ne couvrent pas un besoin ; risque juridique et de rupture | 5 (optionnel) |
| **SRAM AXS** | Protocole fermé | Probablement non faisable | Non prévu |
| **BikeControl en mode clavier** | Émulation clavier vers HomeRealTrainer | Rien à développer ; secours si OpenBikeControl pose problème | 2 |

### 4.4 Contraintes et points d'attention

- **Blocklist Web Bluetooth** : Chrome interdit certains services GATT, dont HID. Si un contrôleur n'expose que du HID BLE, il doit passer par l'appairage système (→ clavier) ou par WebHID.
- **Connexions simultanées** : trainer + cardio + capteur de puissance + 1 ou 2 contrôleurs, soit 4 à 5 connexions BLE. La limite dépend de l'adaptateur Bluetooth de l'ordinateur ; c'est à tester et à signaler à l'utilisateur. Une clé BLE USB récente peut aider.
- **Focus** : les événements clavier et manette ne sont reçus que si l'onglet a le focus. On affiche un avertissement visible si le focus est perdu pendant une sortie.
- **Latence cible** : appui sur un bouton → commande envoyée au trainer en **< 150 ms** et changement ressenti en **< 500 ms** (stratégie S1).
- **Budget zéro** : aucun achat pour le projet (ni contrôleur, ni licence BikeControl). Clavier, manette déjà possédée, smartphone et OpenBikeControl (protocole gratuit) couvrent le besoin. BikeControl n'est utilisé que si l'utilisateur l'a déjà.
- **Même machine** : si BikeControl tourne sur le même ordinateur que le navigateur, la liaison Bluetooth de l'ordinateur vers lui-même ne fonctionnera probablement pas. Il faut alors lancer BikeControl sur un **smartphone** (Bluetooth vers le PC), ou utiliser le mode **réseau** via le relais local. À vérifier au spike.
- **Licences** : aucune copie de code de BikeControl (licence non commerciale / GPL-3.0). Notre implémentation s'appuie uniquement sur la **spécification MIT** d'OpenBikeControl. Les exemples Python MIT du dépôt du protocole peuvent servir de contrôleur simulé pour les tests.

### 4.5 Protocole OpenBikeControl (résumé de la spécification MIT)

**Bluetooth**

| Élément | UUID | Propriétés | Rôle |
|---|---|---|---|
| Service | `d273f680-d548-419d-b9d1-fa0472345229` | — | Annoncé par le contrôleur ; filtre de `requestDevice()` |
| Button State | `d273f681-d548-419d-b9d1-fa0472345229` | Read, Notify | `[0x01, id1, état1, id2, état2, …]` ; état `0x00` relâché, `0x01` appuyé, `0x02–0xFF` valeur analogique |
| Haptic Feedback | `d273f682-d548-419d-b9d1-fa0472345229` | Write | `[0x03, motif, durée×10 ms, intensité]`, ex. vibration à chaque changement de vitesse |
| App Information | `d273f683-d548-419d-b9d1-fa0472345229` | Write | `[0x04, 0x01, len, "homerealtrainer", len, version, n, ids…]`, envoyé à la connexion pour annoncer les boutons gérés |

**Réseau** : service mDNS `_openbikecontrol._tcp.local.`, puis connexion TCP avec le même format binaire (plus le type `0x02` : statut de l'appareil).

**Correspondance des boutons standard → actions HomeRealTrainer**

| ID OpenBikeControl | Signification | Action HomeRealTrainer |
|---|---|---|
| `0x01` / `0x02` | Vitesse + / − | `drivetrain.shiftUp()` / `shiftDown()` (en ERG : ±5 W) |
| `0x03` / `0x04` / `0x05` | Rapport direct / plateau / pignon (valeur analogique = position + 1) | Sélection directe du rapport |
| `0x01` + `0x02` simultanés | Remise au rapport neutre | `drivetrain.reset()` |
| `0x18` / `0x19` / `0x1B` | Direction gauche / droite / angle proportionnel | Choix aux jonctions entre boucles, position latérale |
| `0x1A` | Frein (analogique) | Freinage virtuel (option) |
| `0x30` / `0x31` | Difficulté + / − | ERG ±, ou difficulté du trainer en SIM |
| `0x32` / `0x36` | Intervalle suivant / précédent | Séance |
| `0x33` / `0x34` / `0x35` | Pause / reprise / lap | Sortie |
| `0x37` | Demi-tour | Rouler la boucle dans l'autre sens |
| `0x3B` | Changer de route | Changement de boucle |
| `0x3C` | Régulateur (cruise control) | Option : ERG à la puissance courante |
| `0x10`–`0x17` | Navigation dans les menus | Navigation de l'interface sans souris |
| `0x20`, `0x24` | Emote, capture d'écran | Social (phase 4), capture |

Les boutons non standard restent réassignables dans l'écran de mapping. Les spécificités (vues `0x40`–`0x4F`, appuis répétés sur `0x30`/`0x31`) sont reprises de la spécification au moment de l'implémentation.

## 5. User stories associées

Reprises dans le [PRD](PRD.md), section 6.

| ID | Story | Prio |
|---|---|---|
| US-70 | En tant que cycliste avec un trainer sans cassette (Zwift Cog), je veux changer de vitesse virtuellement pour adapter ma cadence | **M (phase 1)** |
| US-71 | Je veux choisir ma transmission virtuelle (préréglage ou personnalisée) | S |
| US-72 | Je veux changer de vitesse avec une manette de jeu ou une télécommande posée sur mon guidon | S |
| US-73 | Je veux utiliser un contrôleur compatible **OpenBikeControl** (natif, ou via BikeControl pour Zwift Click / Play / Ride, Di2…) pour changer de vitesse | S (phase 2), **M pour la version finale** |
| US-79 | Je veux une vibration de confirmation sur mon contrôleur à chaque changement de vitesse | C |
| US-74 | Je veux réassigner n'importe quel bouton à n'importe quelle action | S |
| US-75 | Je veux voir mon rapport engagé dans le HUD | S |
| US-76 | En mode ERG, je veux que les boutons de vitesse ajustent la puissance cible | S |
| US-77 | Je veux utiliser mon téléphone comme télécommande | S (phase 2) |
| US-78 | Je veux diriger mon avatar aux intersections avec un contrôleur (Sterzo, joystick) | C |

## 6. Critères d'acceptation globaux

- Avec un trainer FTMS, en stratégie S1, 10 passages successifs vers un rapport plus dur produisent une hausse de résistance perceptible et monotone.
- En stratégie S3, à cadence constante de 90 rpm sur le plat, la puissance mesurée converge à ±5 % vers la puissance théorique du rapport en moins de 5 s.
- Un contrôleur déconnecté se reconnecte seul ; la sortie continue au clavier en attendant.
- Les tables de correspondance sont sauvegardées et restaurées au redémarrage.

## 7. Tests

- Tests unitaires : construction des rapports (tri, dédoublonnage), calculs S1/S2/S3, bornes.
- `SimulatedTrainer` étendu : il réagit aux commandes de pente et d'ERG pour qu'on puisse « ressentir » les vitesses en dev (la puissance simulée baisse si la résistance monte à effort constant).
- `SimulatedController` : boutons virtuels déclenchables depuis les tests et un panneau de debug.
- Journal BLE des contrôleurs pour créer des fixtures (trames OpenBikeControl).
- Contrôleur OpenBikeControl simulé : exemple Python MIT `mock_device_ble.py` du dépôt du protocole, lancé sur une autre machine ou un Raspberry Pi déjà disponible, ou bien source simulée injectée dans le hub en test.
- Mesure automatique de la latence bouton → écriture BLE.
