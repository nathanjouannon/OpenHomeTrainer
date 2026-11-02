# Matériel et protocoles

## 1. Types d'appareils

| Appareil | Données | Pilotable | Protocole BLE principal |
|---|---|---|---|
| Home trainer « smart » (direct drive ou roue) | Puissance, cadence, vitesse | Oui : pente (SIM), puissance cible (ERG), niveau de résistance | **FTMS** (Fitness Machine Service) |
| Trainer non connecté / rouleaux classiques | Aucune | Non | Vitesse estimée via un capteur de vitesse et une « power curve » connue (phase 5) |
| Capteur de puissance (pédales, manivelle, moyeu) | Puissance, parfois cadence | Non | **CPS** (Cycling Power Service) |
| Ceinture ou montre cardio | FC | Non | **HRS** (Heart Rate Service) |
| Capteur de cadence / vitesse | Cadence, vitesse roue | Non | **CSCS** (Cycling Speed and Cadence) |

## 2. UUID et caractéristiques

### FTMS — Fitness Machine Service (`0x1826`)

| Caractéristique | UUID | Propriétés | Usage |
|---|---|---|---|
| Fitness Machine Feature | `0x2ACC` | Read | Fonctions supportées (puissance, cadence, consigne de puissance, simulation…) |
| Indoor Bike Data | `0x2AD2` | Notify | Vitesse instantanée, cadence, puissance (champs optionnels selon des flags) |
| Training Status | `0x2AD3` | Read / Notify | Statut |
| Supported Resistance Level Range | `0x2AD6` | Read | Min / max / pas de résistance |
| Supported Power Range | `0x2AD8` | Read | Min / max / pas de puissance cible |
| **Fitness Machine Control Point** | `0x2AD9` | Write / Indicate | Commandes |
| Fitness Machine Status | `0x2ADA` | Notify | Changements d'état (consigne appliquée, arrêt…) |

**Op codes du Control Point utilisés**

| Op code | Commande | Paramètres |
|---|---|---|
| `0x00` | Request Control | — (à envoyer en premier) |
| `0x01` | Reset | — |
| `0x04` | Set Target Resistance Level | uint8 ou sint16 selon la version, résolution 0,1 |
| `0x05` | Set Target Power | sint16, en watts |
| `0x07` | Start or Resume | — |
| `0x08` | Stop or Pause | uint8 (1 = stop, 2 = pause) |
| `0x11` | **Set Indoor Bike Simulation Parameters** | vent sint16 (0,001 m/s), **pente sint16 (0,01 %)**, Crr uint8 (0,0001), Cw uint8 (0,01 kg/m) |
| `0x80` | Response Code (réponse du trainer) | op code d'origine + résultat (`0x01` = succès) |

Exemple : envoyer une pente de 5,25 % → `[0x11, vent LE (0x00, 0x00), pente = 525 en LE (0x0D, 0x02), crr = 40 (0x28), cw = 51 (0x33)]`.

**Indoor Bike Data (`0x2AD2`)** : les 2 premiers octets sont des flags qui indiquent quels champs suivent. Attention, le bit 0 vaut « More Data » et sa logique est **inversée** : s'il vaut 0, la vitesse instantanée est présente. Le parser doit être piloté par les flags et testé sur des trames réelles de plusieurs marques.

### CPS — Cycling Power Service (`0x1818`)

| Caractéristique | UUID | Usage |
|---|---|---|
| Cycling Power Measurement | `0x2A63` | Notify : flags (uint16), puissance instantanée (sint16, W), puis champs optionnels |
| Cycling Power Feature | `0x2A65` | Read |
| Cycling Power Control Point | `0x2A66` | Calibration / zero offset (option) |

La **cadence** se calcule à partir des champs « Crank Revolution Data » (révolutions cumulées uint16 + horodatage du dernier événement uint16 en 1/1024 s) entre deux notifications : `rpm = Δrévolutions / (Δtemps / 1024) × 60`, en gérant le débordement des compteurs 16 bits et en mettant la cadence à 0 si les compteurs ne bougent plus pendant 2 à 3 s.

### HRS — Heart Rate Service (`0x180D`)

Heart Rate Measurement `0x2A37` (Notify) : flags (bit 0 = format uint8 ou uint16), puis la FC.

### CSCS — Cycling Speed and Cadence (`0x1816`)

CSC Measurement `0x2A5B` : révolutions de roue (uint32) et de manivelle (uint16) cumulées, avec horodatages en 1/1024 s.

### Contrôleurs : OpenBikeControl (`d273f680-d548-419d-b9d1-fa0472345229`)

Protocole ouvert (MIT) pour les boutons de vitesse et de navigation. Le contrôleur (ou BikeControl jouant ce rôle) est périphérique et l'application s'y connecte en Web Bluetooth. Détail dans [15 §4.5](15-vitesses-virtuelles-et-commandes.md).

### Protocoles propriétaires (phase 5, si nécessaire)

| Protocole | Cas | Note |
|---|---|---|
| Tacx FE-C over BLE | Anciens Tacx sans FTMS | Service `6E40FEC1-B5A3-F393-E0A9-E50E24DCCA9E`, messages ANT+ FE-C encapsulés |
| Wahoo « legacy » | Anciens KICKR avant le firmware FTMS | Service propriétaire, mode simulation dédié ; UUID à confirmer sur matériel |
| ANT+ FE-C via WebUSB | PC avec clé ANT+ USB | Couvre les trainers sans BLE ou déjà monopolisés |

La quasi-totalité des trainers récents (Wahoo KICKR/CORE, Tacx Neo/Flux, Elite Direto/Suito/Justo, Saris H3, Zwift Hub, JetBlack, Van Rysel D500…) exposent FTMS. **Le MVP ne supporte que FTMS + CPS + HRS.**

## 3. Web Bluetooth : contraintes pratiques

- **Geste utilisateur obligatoire** : `navigator.bluetooth.requestDevice()` doit être appelé depuis un clic.
- **Filtres** : demander les services `fitness_machine`, `cycling_power`, `heart_rate` et `cycling_speed_and_cadence` dans `filters`, avec `optionalServices` pour les UUID propriétaires.
- **Reconnexion sans sélecteur** : `navigator.bluetooth.getDevices()` permet de retrouver les appareils déjà autorisés. Selon les versions de Chrome, il peut encore être derrière un flag : à vérifier pendant le spike. À défaut, on affiche un bouton « Reconnecter » qui rouvre le sélecteur.
- **Déconnexions** : écouter `gattserverdisconnected`, puis retenter avec backoff (1 s, 2 s, 4 s… jusqu'à 30 s) en gardant la sortie en cours.
- **Un seul maître** : un trainer BLE accepte souvent une seule connexion de contrôle. Si Zwift ou l'app constructeur est ouverte sur un téléphone, la connexion échoue. Le message d'erreur doit le dire.
- **File d'écriture** : une seule opération GATT à la fois, sinon `NetworkError: GATT operation already in progress`. Toutes les écritures passent par une file sérialisée.
- **Contexte sécurisé** : HTTPS ou `localhost` uniquement.
- **macOS** : il faut autoriser Chrome dans Réglages Système > Confidentialité > Bluetooth.
- **Linux** : BlueZ récent requis ; support parfois instable.

## 4. Pilotage du trainer

### Mode SIM (simulation de pente)

1. `Request Control` (0x00), puis `Start` (0x07).
2. À chaque changement de pente significatif (|Δ| ≥ 0,1 %) et au plus **2 fois par seconde**, envoyer `0x11` avec :
   - `pente_envoyée = pente_route × difficulté` (difficulté réglable, 50 % par défaut, comme le font la plupart des applications du marché) ;
   - en descente : `pente_envoyée = pente_route × difficulté × facteur_descente` (par exemple 0,5), car le trainer ne peut pas « pousser » ; la vitesse virtuelle, elle, reste calculée par la physique ;
   - pente bornée à la plage du trainer (souvent −10 % à +20 %, selon le modèle).
3. Crr et Cw : on envoie des valeurs neutres. C'est le moteur physique de l'application qui calcule la vitesse.

### Mode ERG (puissance cible)

- `Set Target Power` (0x05) à chaque changement d'intervalle.
- Rampe logicielle optionnelle sur 2 à 3 s pour adoucir les changements.
- Si la cadence descend sous 50 rpm pendant plus de 5 s alors que la consigne est élevée (« spiral of death »), on propose de mettre l'ERG en pause.

### Mode Résistance (option)

`Set Target Resistance Level` (0x04) pour un réglage manuel façon « vitesses ».

## 5. Sources de données et priorités

Quand plusieurs appareils fournissent la même métrique, l'utilisateur choisit la source. Par défaut :

| Métrique | Priorité par défaut |
|---|---|
| Puissance | Capteur de puissance dédié > trainer |
| Cadence | Capteur de cadence > capteur de puissance > trainer |
| FC | Ceinture cardio (seule source) |
| Vitesse | **Toujours calculée par la physique** |

Option avancée (phase 5) : « Power match ». Le trainer est piloté en ERG avec une consigne corrigée pour que le capteur de puissance atteigne la cible.

## 6. Outils de debug à développer

- **Journal BLE** : toutes les trames entrantes et sortantes, horodatées, en hexadécimal et décodées, exportables en JSON. Il alimente les fixtures de test.
- **Trainer simulé** : `SimulatedTrainer` qui implémente `ControllableTrainer`. Puissance réglée au clavier (↑/↓ par paliers de 10 W) ou issue d'un profil rejoué. En mode SIM, il simule même la « sensation » : la puissance baisse si la pente augmente à cadence constante.
- **Rejeu** : rejouer un journal BLE enregistré pour reproduire un bug.

## 7. Matériel cible du développeur (achat en cours)

| Matériel | Protocoles | Remarques pour HomeRealTrainer |
|---|---|---|
| **Van Rysel D500** (Decathlon), modèle 2025 « Zwift » | Bluetooth **FTMS**, ANT+, protocole Zwift ; souvent vendu avec Zwift Cog & Click | Compatible : pilotage FTMS SIM et ERG. Le modèle v1 (ancien) n'a pas les vitesses virtuelles natives Zwift, ce qui ne nous gêne pas : nos vitesses virtuelles passent par FTMS |
| **Wahoo KICKR** (v6, Core, Core Zwift One…) | Bluetooth **FTMS**, ANT+ FE-C ; protocole Wahoo historique | Compatible. Les anciens firmwares sans FTMS sont à mettre à jour via l'app Wahoo |
| **Zwift Cog** | Pignon unique (mécanique) | Le vélo n'a plus de vitesses physiques → **vitesses virtuelles HomeRealTrainer indispensables** (stratégies S1/S3 via FTMS, voir [15](15-vitesses-virtuelles-et-commandes.md)). Les vitesses virtuelles natives Zwift du trainer (S4) sont contrôlées par Zwift et ne sont pas utilisées |
| **Zwift Click** (v2 probablement) | BLE propriétaire Zwift | Compatibilité tierce **instable** ; voir [15 §1.3](15-vitesses-virtuelles-et-commandes.md) |
| **Shimano Ultegra Di2** (série R8000 : ST-R8050 / R8070) | Filaire E-Tube ; sans fil seulement avec l'unité **EW-WU111** (D-Fly) | Sans EW-WU111 : inutilisable par une application. Avec : boutons cachés des cocottes utilisables via BikeControl. Non prioritaire (budget zéro) |

## 8. Matériel de test minimum

| Matériel | Pourquoi |
|---|---|
| Ton home trainer | Référence principale (modèle à préciser, voir [questions ouvertes](13-questions-ouvertes.md)) |
| Une ceinture cardio BLE | Tests multi-appareils |
| Idéalement un 2e trainer d'une autre marque, **emprunté** (budget zéro) | Vérifier la tolérance des parsers |
| Une application de référence gratuite (nRF Connect) | Inspecter les services GATT sans code |
