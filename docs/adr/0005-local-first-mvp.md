# ADR 0005 — Local-first pour le MVP

**Statut** : Accepté — 2026-11-02

## Contexte
Le MVP doit être livré vite, à coût quasi nul, et ne jamais perdre une sortie.

## Décision
- MVP **sans backend** : profil, réglages et sorties dans IndexedDB (Dexie) ; export `.fit` manuel.
- Exécution en local (`localhost`), aucun hébergement ([ADR 0010](0010-budget-zero-execution-locale.md)).
- À partir de la phase 2, synchronisation vers une API ; le client reste local-first (file d'envoi avec retry).

## Conséquences
- (+) Pas d'infra, pas de RGPD serveur au MVP, fonctionne hors ligne.
- (−) Pas de multi-appareil avant la phase 2 ; les données sont perdues si l'utilisateur vide son navigateur. On propose donc un export complet (sauvegarde JSON) dans les réglages.
