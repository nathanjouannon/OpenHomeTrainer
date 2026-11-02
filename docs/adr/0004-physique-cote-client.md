# ADR 0004 — Physique côté client, vitesse dérivée de la puissance

**Statut** : Accepté — 2026-11-02

## Contexte
La vitesse affichée par un trainer reflète la rotation de son volant d'inertie, pas une vitesse sur route (elle ignore la pente, le poids, l'aérodynamique). Il faut une vitesse virtuelle crédible et réactive.

## Décision
- La vitesse est calculée **dans le client**, par un modèle physique pur (`@hrt/physics`) à pas fixe de 20 Hz, à partir de la **puissance mesurée**.
- La pente envoyée au trainer (pente ressentie) est distincte de la pente simulée (difficulté, descentes, vitesses virtuelles).
- Le même module sert côté serveur pour les contrôles de plausibilité (phase 4).

## Conséquences
- (+) Latence nulle, fonctionne hors ligne, déterministe et testable.
- (+) Identique pour tous les trainers et capteurs.
- (−) En multijoueur, le client est la source de vérité : il faut des contrôles serveur (voir [08](../08-multijoueur.md)).
