# ADR 0008 — Vitesses virtuelles et hub de commandes intégrés

**Statut** : Accepté ; stratégie par défaut à confirmer sur matériel (phase 2) — 2026-11-02

## Contexte
Demande produit : disposer dans la solution finale d'un outil **similaire à BikeControl**, pour un changement de vitesses simulé piloté par des commandes physiques. BikeControl est une application externe qui relie des contrôleurs (Zwift Click/Play/Ride, Di2…) à d'autres applications et leur ajoute des vitesses virtuelles. Détail dans [15](../15-vitesses-virtuelles-et-commandes.md).

## Décision
- **Intégrer nativement** dans HomeRealTrainer :
  - `@hrt/drivetrain` : transmission virtuelle configurable et stratégies interchangeables (`ShiftingStrategy`) ;
  - `@hrt/controls` : hub d'entrées (clavier, Gamepad API, télécommandes système, smartphone, contrôleurs BLE) → actions configurables.
- Matériel du développeur : **Zwift Cog** (pignon unique), donc la stratégie S1 et le passage au clavier sont livrés **dès la phase 1 (MVP)**.
- Stratégie par défaut : **S1, décalage de pente** (simple, faible latence, compatible avec tout trainer FTMS en SIM). **S3, ERG piloté par le rapport**, est proposée en mode « réaliste » expérimental. **S2** (pente équivalente calibrée) sera évaluée après mesures.
- Ordre des sources d'entrée : clavier, manette et **OpenBikeControl Bluetooth** (phase 2), smartphone et OpenBikeControl réseau (phase 3). Les contrôleurs propriétaires passent par BikeControl côté utilisateur ([ADR 0011](0011-openbikecontrol.md)) ; leur implémentation directe n'est qu'un repli (phase 5).
- L'application reste pilotable au clavier, donc compatible avec BikeControl en mode clavier.

## Conséquences
- (+) Fonction clé pour les trainers sans cassette ; aucune dépendance à une application tierce.
- (+) L'architecture « tout passe par des actions » profite aussi au HUD, à l'accessibilité et au multijoueur.
- Le risque lié aux protocoles propriétaires (R14) est largement contourné par OpenBikeControl.
- (−) Le réalisme dépend du trainer : tests sur au moins 2 modèles requis.
