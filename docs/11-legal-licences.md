# Légal, licences et vie privée

> Ce document liste les points à surveiller ; il ne remplace pas l'avis d'un juriste. Avant toute ouverture au public ou monétisation, faire valider les points marqués ⚠️.

## 1. Marques et propriété intellectuelle

- « Comme Zwift ou MyWhoosh » décrit un **genre** (simulateur de vélo connecté). On ne reprend ni les noms, ni les logos, ni les mondes (îles, routes, lieux fictifs), ni les visuels ou interfaces caractéristiques de ces produits.
- Le nom **HomeRealTrainer** doit être vérifié (INPI / EUIPO, noms de domaine) avant toute communication publique. ⚠️
- Les noms de lieux réels (cols, villes) sont utilisables ; les marques d'événements (logos de courses, maillots distinctifs) ne le sont pas.
- Les noms de marques de matériel (Wahoo, Tacx, Zwift Click…) peuvent être cités de façon descriptive pour indiquer la compatibilité, sans logo ni suggestion de partenariat.

## 2. Données géographiques et imagerie

| Source | Licence / conditions | Obligations |
|---|---|---|
| OpenStreetMap | ODbL | Attribution « © OpenStreetMap contributors » ; partage à l'identique des **bases de données dérivées** diffusées |
| Copernicus DEM GLO-30 | Licence libre Copernicus, avec attribution | Mention de la source (texte exact à reprendre de la licence) |
| IGN (RGE ALTI, Géoplateforme) | Licence Ouverte Etalab 2.0 | Attribution IGN |
| SRTM | Domaine public (NASA/USGS) | Mention recommandée |
| Mapillary | Images sous **CC-BY-SA 4.0** ; conditions de l'API Mapillary | Attribution des images ; respect des limites de l'API |
| Google Street View / Maps Platform | CGU Google Maps Platform + conditions spécifiques au service | ⚠️ Stockage et cache des images interdits (hors exceptions), attribution et logo Google obligatoires, restrictions d'usage hors carte Google et de création de contenus dérivés à vérifier ; facturation à l'usage |
| Fond de carte (OpenFreeMap, MapTiler, Stadia…) | Selon le fournisseur | Attribution, quotas |

Toutes les attributions sont affichées dans l'application (écran « Crédits » + mention discrète en sortie quand c'est requis).

## 3. Assets 3D, textures, sons

- Privilégier le **CC0** (Poly Haven, ambientCG, Quaternius) ; tenir un fichier `CREDITS.md` / `assets-licenses.json` qui trace **chaque asset** : source, auteur, licence, URL.
- Budget zéro : **aucun asset payant**. Pour les assets gratuits non-CC0 (CC-BY, licences « free » des plateformes), vérifier qu'ils autorisent une diffusion web, où les fichiers sont techniquement téléchargeables. ⚠️
- Pas d'asset extrait d'un autre jeu.

## 4. Protocoles matériels

- FTMS, CPS, HRS et CSCS sont des **spécifications publiques** du Bluetooth SIG : leur implémentation côté application ne pose pas de difficulté. Une qualification Bluetooth concerne les produits matériels, pas une application web utilisant le Bluetooth de l'OS.
- ANT+ : profils accessibles après inscription gratuite comme « ANT+ Adopter » ; conditions à relire avant la phase 7.
- **Protocoles propriétaires** (Zwift Click/Play/Ride, Elite Sterzo, Wahoo, Shimano Di2, vitesses virtuelles natives des trainers) : leur rétro-ingénierie à des fins d'**interopérabilité** est encadrée en droit européen (directive 2009/24/CE, art. 6), mais certains protocoles incluent un chiffrement ou une authentification dont le contournement peut poser problème, et les CGU des fabricants peuvent l'interdire. ⚠️ Avant de publier ces intégrations :
  - vérifier les CGU des fabricants et l'existence d'un programme partenaire ou SDK officiel ;
  - **BikeControl** (vérifié le 2026-11-02) : code public mais **non open source**. Licence non commerciale propriétaire pour les versions récentes (usage personnel, révocable, usage commercial interdit) ; GPL-3.0 pour les versions antérieures au tag `gpl3`. **Aucune copie de son code** dans HomeRealTrainer ;
  - **OpenBikeControl** : spécification sous **licence MIT**, librement implémentable (y compris commercialement), sans frais ni certification pour une application. La certification ne concerne que les fabricants de matériel ;
  - ne pas copier d'autre code tiers sans vérifier sa licence : respecter les obligations si elle est copyleft ;
  - isoler chaque protocole dans un module désactivable.

## 5. Intégrations tierces

- **Strava API** : accord développeur ; limites de débit ; restrictions sur l'affichage des données d'autres utilisateurs et sur certains usages (à relire au moment de l'intégration). ⚠️
- **Garmin** : export par fichier FIT (aucun accord nécessaire) ; l'API Garmin Connect nécessite un programme partenaire.

## 6. RGPD et données personnelles

- La **fréquence cardiaque** est une **donnée de santé** (art. 9 RGPD) : consentement explicite et séparé, finalité claire, minimisation.
- Le poids, l'âge et les performances sont des données personnelles.
- MVP local-first : les données restent dans le navigateur ; pas de traitement serveur, donc obligations réduites. Il faut tout de même une mention d'information.
- Phase 3 et plus :
  - en cas d'hébergement public futur : hébergement dans l'UE (aujourd'hui tout est local, les données ne quittent pas la machine) ;
  - politique de confidentialité, registre des traitements ;
  - export (portabilité) et suppression du compte en libre-service ;
  - chiffrement des jetons OAuth tiers ;
  - télémétrie opt-in, sans donnée de santé ;
  - sous-traitants listés le cas échéant (aucun aujourd'hui : exécution locale).
- Mineurs : âge minimum à fixer dans les CGU.

## 7. Sécurité et santé de l'utilisateur

Avertissement au premier lancement : effort physique intense, consulter un médecin en cas de doute, vérifier la fixation du vélo sur le trainer. Limitation de responsabilité dans les CGU.

## 8. Licence du projet

À décider : code propriétaire, ou open source (MIT, AGPL…). Cela conditionne aussi la possibilité de réutiliser du code copyleft (ex. pour les protocoles des contrôleurs). Voir [questions ouvertes](13-questions-ouvertes.md).
