# ADR 0006 — Monde virtuel original sur relief réel + procédural

**Statut** : Accepté — 2026-11-02

## Contexte
Un monde « réaliste » modélisé entièrement à la main est hors de portée d'un développeur seul. Il faut aussi rester original (aucune reprise de monde existant).

## Décision
- Le relief du monde est issu d'un **MNT réel** (IGN, Copernicus), retravaillé ; le monde porte un nom et une identité fictifs.
- Occupation du sol inspirée d'OSM, puis **habillage procédural** (végétation, rochers, bâtiments) par règles et graine fixe, retouché à la main.
- Routes du jeu dessinées en splines, exportées au format de route commun.
- Pipeline reproductible dans `tools/world-builder`, réutilisable par le mode B (reconstitution 3D de repli).

## Conséquences
- (+) Relief naturel et crédible pour un coût réduit ; synergie avec le mode B.
- (−) Pipeline d'outillage à construire (GDAL, OSM, compression).
- (−) Attributions ODbL / IGN / Copernicus à afficher.
