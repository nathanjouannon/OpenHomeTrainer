# Glossaire

| Terme | Définition |
|---|---|
| **Home trainer (smart / connecté)** | Appareil sur lequel on fixe son vélo ; un modèle « smart » mesure la puissance et ajuste sa résistance à la demande d'une application. |
| **Direct drive** | Trainer sur lequel la roue arrière est retirée ; la chaîne entraîne directement le trainer. |
| **FTMS** | *Fitness Machine Service* : profil Bluetooth standard pour piloter et lire un appareil de fitness (trainer, tapis…). |
| **CPS / HRS / CSCS** | Profils Bluetooth standard : puissance, fréquence cardiaque, vitesse et cadence. |
| **ANT+ / FE-C** | Protocole radio concurrent du BLE, très répandu dans le vélo ; FE-C est son profil de contrôle de trainer. |
| **Mode SIM** | L'application envoie la pente ; le trainer ajuste la résistance ; la puissance dépend de l'effort du cycliste. |
| **Mode ERG** | L'application impose une puissance cible ; le trainer ajuste la résistance pour l'atteindre quelle que soit la cadence. |
| **Difficulté du trainer** | Pourcentage de la pente réelle effectivement ressentie (50 % par défaut). |
| **Vitesses virtuelles (virtual shifting)** | Changement de rapport simulé par l'application : le vélo reste sur un rapport physique fixe et la résistance du trainer est ajustée comme si l'on changeait de vitesse. |
| **BikeControl** | Application tierce (ex-SwiftControl), code public mais **non open source** (licence non commerciale), payante après essai. Elle relie des contrôleurs physiques (Zwift Click, Di2…) aux applications de home trainer et leur ajoute des vitesses virtuelles. Passerelle optionnelle pour HomeRealTrainer. |
| **OpenBikeControl** | Protocole ouvert (licence MIT) qui permet à une application de home trainer de recevoir les boutons de n'importe quel contrôleur, en Bluetooth ou en réseau (mDNS/TCP). Implémenté par HomeRealTrainer. |
| **Zwift Click / Play / Ride** | Contrôleurs Bluetooth de guidon (boutons de vitesse, direction) vendus par Zwift. |
| **Elite Sterzo** | Support de roue avant qui mesure la direction (pour diriger dans le jeu). |
| **Hub de commandes** | Module de l'application qui reçoit toutes les entrées (clavier, manette, contrôleurs) et les traduit en actions configurables. |
| **Rapport (de transmission)** | Plateau / pignon ; plus il est grand, plus chaque tour de pédale fait avancer, et plus il est dur. |
| **FTP** | *Functional Threshold Power* : puissance soutenable environ 1 h ; base des zones d'entraînement. |
| **W/kg** | Puissance rapportée au poids ; déterminant en montée. |
| **NP (Normalized Power)** | Puissance normalisée, qui reflète mieux le coût physiologique d'un effort variable. |
| **TSS** | *Training Stress Score* : charge d'entraînement d'une séance. |
| **CdA** | Coefficient de traînée × surface frontale (m²) : résistance aérodynamique. |
| **Crr** | Coefficient de résistance au roulement des pneus. |
| **Drafting / aspiration** | Réduction de la traînée en roulant dans le sillage d'un autre cycliste. |
| **D+** | Dénivelé positif cumulé. |
| **Segment** | Portion de route chronométrée (sprint, montée). |
| **Fantôme** | Avatar rejouant une sortie passée pour se mesurer à soi-même. |
| **Spiral of death** | En ERG, quand la cadence baisse, la résistance augmente pour maintenir la puissance, ce qui fait encore baisser la cadence. |
| **MNT / DEM** | Modèle numérique de terrain : grille d'altitudes. |
| **OSM** | OpenStreetMap, base de données cartographique libre. |
| **GPX / TCX / FIT** | Formats de fichiers de traces et d'activités. FIT est le format natif Garmin, accepté partout. |
| **ZWO / ERG / MRC** | Formats de séances structurées. |
| **Web Bluetooth** | API du navigateur permettant de communiquer avec des appareils BLE. |
| **Gamepad API** | API du navigateur pour lire les manettes de jeu. |
| **glTF / KTX2 / Meshopt / Draco** | Format 3D standard du web et techniques de compression associées. |
| **LOD** | *Level of Detail* : versions simplifiées d'un objet affichées à distance. |
| **Instancing** | Rendu de milliers de copies d'un même objet (arbres) en un seul appel GPU. |
| **ADR** | *Architecture Decision Record* : fiche qui documente une décision technique. |
| **Spike** | Prototype court et jetable pour lever une incertitude technique. |
| **Local-first** | Les données vivent d'abord sur l'appareil ; le serveur synchronise. |
