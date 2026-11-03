# ADR 0010 — Budget zéro et exécution locale

**Statut** : Accepté — 2026-11-02

## Contexte
Le budget du projet est de **0 €**, en dehors de l'outil d'IA de développement (déjà payé). L'application n'est pas hébergée publiquement pour l'instant : elle tourne **uniquement en local**.

## Décision
1. **Aucune dépense** : pas d'API payante, pas d'abonnement SaaS, pas d'achat d'assets ni de matériel pour le projet, pas de nom de domaine, pas d'hébergement payant.
2. **Exécution locale** : l'application web tourne sur `localhost` (contexte sécurisé, donc Web Bluetooth fonctionne). Le backend (phase 3 et plus) tourne en Docker Compose sur la même machine.
3. **Services externes** : acceptés seulement s'ils sont gratuits **et** sans risque de facturation (pas de carte bancaire, ou bien un quota plafonné vérifié). Les données téléchargeables (MNT, OSM) sont récupérées une fois et stockées en local.
4. **Assets** : uniquement CC0 / CC-BY gratuits, ou créés soi-même (Blender, MakeHuman).
5. **Tests matériels** : avec le matériel déjà possédé, ou prêté.

## Inventaire des dépendances externes (toutes gratuites)

| Dépendance | Usage | Coût | Mode d'accès |
|---|---|---|---|
| Copernicus GLO-30 / IGN RGE ALTI / SRTM | Relief | 0 € | Téléchargé une fois, stocké en local |
| OpenStreetMap (Geofabrik, Overpass) | Routes, occupation du sol | 0 € | Extraits téléchargés en local |
| OpenFreeMap | Fond de carte | 0 €, sans clé | Tuiles en ligne, ou PMTiles en local |
| BRouter | Routage vélo (mode B) | 0 €, open source | Exécutable en local |
| OpenTopoData (public) | Altitude ponctuelle (mode B, option) | 0 €, limité en débit | En ligne, ou remplacé par le MNT local |
| Mapillary API v4 | Images de rue (mode B) | 0 € (jeton gratuit) | En ligne + cache local |
| Google Street View | Images de rue (option) | 0 € **seulement** avec un quota journalier plafonné sous le palier gratuit ; nécessite un compte de facturation Google Cloud | Sinon non utilisé |
| Strava API | Upload automatique (phase 3) | 0 € | OAuth avec redirection vers `localhost` (à vérifier) |
| Garmin FIT SDK, Three.js, React, Fastify, PostgreSQL, MinIO… | Code | 0 €, open source | npm / Docker |
| Poly Haven, ambientCG, Quaternius, MakeHuman, Mixamo | Assets 3D et textures | 0 € | Téléchargés, licences tracées dans `assets-licenses.json` |
| GitHub (optionnel) | Dépôt distant, CI | 0 € (dépôt public, ou quota gratuit en privé) | Optionnel ; hooks git locaux sinon |

## Conséquences
- (+) Aucun risque financier ; l'architecture local-first ([ADR 0005](0005-local-first-mvp.md)) s'y prête naturellement.
- (−) Le **multijoueur en ligne** est impossible sans hébergement : la phase 5 est développée et testée en réseau local. L'ouverture en ligne demandera une nouvelle décision (offres gratuites à évaluer).
- (−) Pas de monitoring SaaS ni de déploiement : diagnostics via journaux locaux.
- (−) Le rendu du monde dépend des assets gratuits : on vise un rendu « réaliste stylisé » cohérent plutôt que photoréaliste.
- (−) Le mode B repose surtout sur Mapillary, dont la couverture est inégale ; Street View n'est qu'un complément plafonné, ou n'est pas utilisé.
- (−) Les applications mobiles natives (phase 6) impliquent des frais de compte développeur (Apple, Google) : hors budget tant que cette ADR s'applique.
- Toute nouvelle dépendance externe est ajoutée à l'inventaire ci-dessus avec son coût.
