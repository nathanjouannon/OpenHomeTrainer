# ADR 0011 — Commandes physiques via le protocole ouvert OpenBikeControl

**Statut** : Accepté — 2026-11-02

## Contexte
On veut un outil « type BikeControl » : des contrôleurs physiques (Zwift Click/Play/Ride, Di2, manettes…) qui pilotent les vitesses virtuelles et d'autres actions. Vérification faite le 2026-11-02 :
- **BikeControl n'est pas open source** : son code est public, mais sous licence **non commerciale** propriétaire et révocable (GPL-3.0 pour les anciennes versions). L'application est payante après 5 jours d'essai (déblocage ou abonnement), et elle est écrite en Dart/Flutter.
- Le même éditeur publie le **protocole OpenBikeControl sous licence MIT**, adopté par MyWhoosh, TrainingPeaks Virtual, Biketerra (application web)… Il permet à une application de recevoir les boutons de n'importe quel contrôleur, en Bluetooth ou en réseau.

## Décision
- HomeRealTrainer **implémente OpenBikeControl** côté application, dans `@hrt/controls` :
  - Bluetooth (phase 2) : Web Bluetooth, service `d273f680-d548-419d-b9d1-fa0472345229`, notifications Button State, écriture App Information et Haptic Feedback ;
  - réseau (phase 3) : relais local Node (mDNS + TCP → WebSocket), puisque le navigateur ne peut pas faire de mDNS ni de TCP brut.
- Les contrôleurs propriétaires sont gérés **par BikeControl côté utilisateur** (passerelle optionnelle vers OpenBikeControl). Le projet n'en dépend pas et ne l'achète pas (budget zéro).
- **Aucun code de BikeControl** n'est copié ni adapté. Seule la spécification MIT sert de référence.
- L'implémentation directe d'un protocole propriétaire reste un repli éventuel (phase 5).

## Conséquences
- (+) Un seul protocole simple et documenté couvre le matériel compatible OpenBikeControl et, via BikeControl, la plupart des contrôleurs du marché.
- (+) Plus de rétro-ingénierie ni de risque juridique sur les protocoles propriétaires (R14 fortement réduit).
- (+) Licence MIT compatible avec tout futur choix de licence ou de modèle économique.
- (−) Pour un Zwift Click (par exemple), l'utilisateur a besoin de BikeControl, payant après essai.
- (−) BikeControl et le navigateur sur la même machine ne peuvent probablement pas se connecter en Bluetooth : on passera par un smartphone ou par le mode réseau (à vérifier au spike).
