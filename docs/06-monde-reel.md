# Mode B — Monde réel

Objectif : rouler sur n'importe quelle route réelle, avec **les vraies pentes** et **de vraies images**. Prévu en phase 4, mais la phase 1 prépare le terrain : format de route commun, physique, HUD et enregistrement réutilisés tels quels.

## 1. Chaîne de traitement d'un parcours

```
Source du parcours                 Nettoyage                 Altimétrie                 Imagerie
─────────────────────              ──────────                ──────────                 ─────────
GPX / TCX / FIT  ─┐                                                                      ┌─▶ Mapillary
Tracé sur carte  ─┼─▶ parse ─▶ dédoublonnage, retrait ─▶ rééchantillonnage 5 m ─▶ MNT ─▶ lissage ─▶ pente ─┼─▶ Street View
Parcours préparé ─┘          des sauts GPS, fusion     interpolation               ▲                  └─▶ Vidéo GPX
                                                                                    │
                                                         altitude du fichier (si fiable) combinée au MNT
```

### 1.1 Import

- Formats : **GPX 1.1** (trk/rte), **TCX**, **FIT** (course ou activité).
- Import par glisser-déposer, ou depuis Strava/Komoot plus tard (sous réserve des CGU de leurs API).
- Validation : au moins 2 points, longueur ≥ 500 m, pas de saut > 200 m entre deux points (sinon proposition de routage pour combler).

### 1.2 Tracé sur carte

- Carte **MapLibre GL** avec un fond OSM gratuit : **OpenFreeMap** (sans clé ni compte), ou tuiles téléchargées en local (PMTiles).
- Routage vélo : **BRouter** (profils vélo route/gravel, open source, exécutable en local avec les données de la région), ou son instance publique gratuite pour les tests.

### 1.3 Altimétrie

L'altitude GPS d'un GPX est souvent bruitée (±10 m) ; celle d'un tracé sur carte n'existe pas. Stratégie :

1. Interroger un **MNT** pour chaque point rééchantillonné :
   - Monde : Copernicus GLO-30, tuiles téléchargées une fois et **stockées en local** (ou API publique gratuite OpenTopoData, avec limites de débit) ;
   - France : IGN (RGE ALTI, via le service d'altimétrie de la Géoplateforme) pour une précision métrique ;
   - Les services de tuiles « terrain RGB » commerciaux (MapTiler, Mapbox) sont écartés (budget zéro).
2. Si le fichier a une altitude barométrique de bonne qualité (enregistrée par un compteur), la combiner au MNT.
3. **Lissage** et calcul de pente selon [04 §6](04-moteur-physique.md).
4. Cas difficiles : **ponts et tunnels** (le MNT donne le fond de la vallée ou le dessus de la montagne). On les détecte via OSM (`bridge=yes`, `tunnel=yes`) et on interpole linéairement l'altitude entre l'entrée et la sortie.

Sortie : un `Route` au format interne (`mode: 'real'`, avec lat/lon), identique à celui du mode A.

## 2. Sources d'images : options

| Option | Principe | Avantages | Inconvénients |
|---|---|---|---|
| **A. Google Street View** | Images de panoramas récupérées via l'API Street View (Static ou panoramas dynamiques du SDK Maps JS) le long du trajet, avec un cap aligné sur la route | Couverture mondiale excellente, qualité homogène | **Payant** au-delà du quota gratuit ; CGU restrictives (pas de stockage ni de cache, attribution obligatoire, usage hors carte Google à vérifier) ; panoramas espacés d'environ 10 m → défilement saccadé ; clé API à protéger |
| **B. Mapillary** (API v4) | Images participatives, souvent en séquences continues | **Gratuit** ; licence CC-BY-SA permettant le cache et le pré-calcul ; séquences plus fluides | Couverture inégale (bonne sur les axes et en ville, faible sur les petites routes de montagne) ; qualité variable ; images parfois anciennes ou dans le mauvais sens |
| **C. Vidéo réelle géolocalisée** | Vidéo filmée à vélo (GoPro + trace GPS), lue à une vitesse proportionnelle à la vitesse virtuelle | **Meilleure immersion** (fluide, vivante) ; c'est le modèle de Rouvy, FulGaz ou Kinomap | Il faut produire ou collecter du contenu ; stockage et bande passante vidéo ; pas de parcours arbitraire |
| **D. Photorealistic 3D Tiles** (Google Map Tiles API) via `3d-tiles-renderer` ou CesiumJS | Maillage 3D photoréaliste dans lequel on « roule » | Liberté de caméra, rendu 3D réel | Rendu « fondu » au niveau de la route, faible en zone rurale, coût et CGU Google, lourd |
| **E. Reconstitution 3D procédurale** | Pipeline du mode A appliqué au parcours (MNT + OSM + assets) | Aucune dépendance d'imagerie ; toujours disponible ; fluide | Pas les « vraies images » ; seulement le vrai relief et le vrai tracé |

### Recommandation

Voir [ADR 0007](adr/0007-imagerie-monde-reel.md) (statut : proposé, décision finale au spike 4.0).

1. Concevoir une interface **`ImageryProvider`** pour que la source soit interchangeable et combinable sur un même parcours.
2. **Mapillary** est le fournisseur principal : gratuit (jeton développeur sans frais), avec une licence compatible avec le pré-calcul et le cache local.
3. **Google Street View en option uniquement**, et seulement si le **0 € est garanti** : un compte Google Cloud avec facturation activée est nécessaire, même pour le palier gratuit. On plafonne donc le quota journalier de l'API dans la console Google Cloud sous le palier gratuit, pour qu'aucun dépassement ne soit possible. Cela limite Street View à quelques heures de sortie par mois (à chiffrer au spike). À défaut, Street View n'est pas utilisé.
4. Utiliser **E (reconstitution 3D)** et une vue carte ou satellite comme **repli** quand il n'y a pas d'images.
5. Ajouter **C (vidéo)** en phase 6 pour des parcours « premium ».

## 3. Lecteur d'images

### Sélection des images

Pour chaque point du parcours tous les 5 à 10 m :

- chercher les images à moins de 15 m de la route ;
- privilégier les images dont le cap est proche du sens de déplacement (±30°), puis les séquences continues, puis les plus récentes ;
- pour un panorama 360°, recadrer dans la direction du cap ;
- résultat : une **piste d'images** ordonnée par distance (`ImageryTrack`).

### Pré-calcul

La piste est calculée **avant** le départ (barre de progression), car l'interrogation des API prend du temps. Pour Mapillary, la piste et les images peuvent être mises en cache **sur le disque local** (licence CC-BY-SA) : un parcours déjà préparé ne consomme plus d'appels API.

### Lecture

- La position (distance parcourue) vient de la physique ; on affiche l'image dont la distance est la plus proche, avec pré-chargement des 10 à 20 suivantes.
- **Transitions** : fondu enchaîné + léger zoom avant (effet de déplacement) entre deux images. Pour un panorama 360°, on peut aussi projeter l'image sur une sphère et avancer légèrement la caméra.
- Option avancée : interpolation de vues (estimation de profondeur, morphing) ; recherche, non prioritaire.
- Calques par-dessus l'image : HUD, mini-carte, profil, éventuellement un avatar ou des « fantômes » en surimpression.

### Débit

À 36 km/h (10 m/s) avec une image tous les 10 m, il faut environ 1 image par seconde, soit environ 3 600 images par heure. Avec Street View, c'est ce qui détermine combien d'heures de sortie le palier gratuit permet (budget zéro) :

| | Ordre de grandeur (à vérifier au moment du spike) |
|---|---|
| Street View Static | Tarif au millier de requêtes, avec un quota mensuel gratuit par SKU ; une sortie d'1 h peut consommer plusieurs milliers de requêtes |
| Mapillary | Gratuit (limites de débit de l'API à respecter) |

Le modèle de coût de Google Maps Platform a changé en 2025 (quotas gratuits par SKU au lieu d'un crédit mensuel global). Les tarifs exacts doivent être vérifiés sur la page officielle au moment du spike.

## 4. Repli quand il n'y a pas d'images

Ordre de préférence : autre fournisseur d'images → reconstitution 3D procédurale (option E) → vue carte 3D MapLibre (terrain + satellite) qui suit le coureur. Le HUD, la physique et l'enregistrement ne sont jamais interrompus.

## 5. Parcours préparés (catalogue)

Une liste de montées et de parcours célèbres (choix à faire : ex. Alpe d'Huez, Mont Ventoux, Tourmalet, Galibier…) est pré-traitée et vérifiée à la main : altimétrie validée, piste d'images sélectionnée, segments définis. Les noms de lieux réels sont utilisables ; les noms et visuels de marques d'événements (ex. logos de courses) ne le sont pas.

## 6. Points ouverts

- Validation juridique de l'usage de Street View pour ce cas d'usage ([11](11-legal-licences.md)).
- Qualité réelle de la couverture Mapillary sur les parcours cibles : à mesurer au spike.
- Doit-on autoriser les parcours partagés entre utilisateurs (modération, droits) ?
