# ADR 0009 — Monde virtuel : uniquement des boucles

**Statut** : Accepté — 2026-11-02

## Contexte
Demande produit : pouvoir faire des **séances longues sans relancer de sortie**. Avec des routes ouvertes (point A → point B), la sortie s'arrête ou impose un demi-tour, un rechargement ou une nouvelle sélection en fin de parcours.

## Décision
- **Toutes les routes du monde virtuel (mode A) sont des boucles fermées.**
- À la fin d'un tour, le coureur enchaîne automatiquement sur le suivant : pas d'arrêt, pas d'écran, pas de rechargement, pas de limite de tours.
- Le moteur de route travaille en distance modulo la longueur du tour ; la distance totale de la sortie continue de croître.
- Chaque tour est un *lap* (HUD, récapitulatif, export `.fit`) ; on suit le meilleur tour par boucle.
- Un objectif optionnel (durée, distance, tours) déclenche une notification, jamais un arrêt automatique.
- Le raccord de chaque boucle est contrôlé par le world-builder (position, altitude, pente, cap continus).
- Le mode B (monde réel) n'est pas concerné : un GPX peut être ouvert. En fin de parcours, on propose demi-tour, recommencer ou terminer, sans couper l'enregistrement.

## Conséquences
- (+) Séances de plusieurs heures d'une traite ; les tours deviennent une métrique de progression (meilleur tour, fantôme du meilleur tour).
- (+) Après le premier tour, tout le contenu de la boucle est en cache : plus aucun téléchargement.
- (+) Le multijoueur est simplifié : tout le monde tourne sur les mêmes boucles.
- (−) Conception des boucles plus contraignante (D+ = D−, raccord propre, une montée implique une descente dans le même tour).
- (−) Il faut un lissage circulaire du profil et des tests de continuité au raccord.
- Évolution prévue (US-16) : jonctions entre boucles pour changer de boucle sans s'arrêter.
- Évolution prévue (phase 4) : les **parcours en col** des mondes reconstitués sont des boucles *dans le temps* (montée, demi-tour, descente virtuelle à ~6 %, demi-tour), sans arrêt ni écran intermédiaire. Voir la [roadmap](../ROADMAP.md).
