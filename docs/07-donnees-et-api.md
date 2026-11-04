# Données, stockage et API

## 1. Format de route interne (commun aux modes A et B)

```jsonc
// route.json
{
  "id": "boucle-du-belvedere",
  "version": 3,
  "name": { "fr": "Boucle du Belvédère", "en": "Belvedere Loop" },
  "mode": "virtual",              // "virtual" | "real"
  "worldId": "world-1",           // null en mode réel
  "loop": true,                   // toujours true en mode A (boucle fermée) ; selon le parcours en mode B
  "lengthM": 29800,               // longueur d'un tour
  "ascentM": 712,                 // par tour
  "descentM": 712,                // = ascentM pour une boucle
  "sampleStepM": 5,
  "points": {                     // stockage en colonnes (compact, rapide à parser)
    "d":   [0, 5, 10, ...],       // distance cumulée (m)
    "x":   [...], "y": [...],     // coordonnées monde (mode A)  — ou "lat"/"lon" (mode B)
    "z":   [...],                 // altitude lissée (m)
    "grade": [...],               // pente lissée (%)
    "heading": [...]              // cap (rad)
  },
  "segments": [
    { "id": "seg-col", "name": "Montée du col", "type": "climb", "startM": 400, "endM": 10100 }
  ],
  "surface": [ { "fromM": 0, "toM": 29800, "type": "asphalt" } ],   // → Crr
  "attribution": []               // ex. « © OpenStreetMap contributors »
}
```

Les routes volumineuses peuvent être stockées en binaire (Float32Array) avec le même schéma.

Pour une boucle, le dernier point ne duplique pas le premier : l'interpolation entre le dernier point et le point 0 se fait sur `lengthM`. Le validateur du world-builder rejette une boucle dont le raccord dépasse 0,5 m d'écart de position, 0,2 m d'altitude ou 0,5 % de pente.

## 2. Modèle de données

### 2.1 Côté client (IndexedDB, MVP)

| Table | Contenu |
|---|---|
| `profile` | Poids, taille, FTP, FC max, vélo (masse, type → CdA, Crr), unités, langue |
| `settings` | Difficulté du trainer, qualité graphique, caméra, sons, **transmission virtuelle, stratégie de vitesses, tables de commandes** |
| `devices` | Appareils mémorisés (id Web Bluetooth, nom, type, rôle choisi) |
| `rides` | En-tête de sortie : id, date, route, durée, distance, D+, stats, nombre de tours, objectif éventuel, statut (`recording`, `finished`, `exported`) |
| `ride_laps` | Un enregistrement par tour : numéro, début, durée, distance, D+, puissance moy./NP, FC moy. |
| `ride_samples` | Échantillons 1 Hz par paquets de 60 (une ligne par minute) : t, puissance, cadence, FC, vitesse, distance totale, numéro de tour, distance dans le tour, altitude, pente, rapport |
| `workouts` | Séances importées ou créées |
| `routes_cache` | Parcours du mode B importés |

### 2.2 Côté serveur (PostgreSQL + PostGIS, phase 3+)

```
users (id, email, display_name, created_at, locale, consent_health_at)
profiles (user_id PK/FK, weight_kg, height_cm, ftp_w, hr_max, bike_json, units)
user_settings (user_id, settings_json)                     -- dont tables de commandes et transmission
worlds (id, slug, name_json, version, manifest_url, published)
routes (id, world_id NULL, owner_id NULL, mode, name_json, length_m, ascent_m,
        geom geometry(LineStringZ, 4326) NULL, data_url, visibility, created_at)
segments (id, route_id, name, type, start_m, end_m)
rides (id, user_id, route_id, started_at, duration_s, distance_m, ascent_m,
       avg_power, np, avg_hr, max_hr, avg_cadence, tss, laps_count, best_lap_s, fit_url, samples_url,
       source_app_version, created_at)
ride_laps (ride_id, lap_index, started_at, duration_s, distance_m, ascent_m, avg_power, np, avg_hr)
lap_records (route_id, user_id, best_lap_s, ride_id)          -- meilleur tour par boucle
segment_efforts (id, segment_id, ride_id, user_id, lap_index, elapsed_s, avg_power, created_at)
workouts (id, owner_id NULL, name, description, structure_json, source_format)
integrations (user_id, provider, access_token_enc, refresh_token_enc, expires_at, scopes)
follows (follower_id, followee_id, created_at)                -- phase 6
events (id, world_id, route_id, starts_at, title, ...)        -- phase 6
```

Les **séries temporelles** ne vont pas dans des lignes SQL (14 400 lignes par sortie de 4 h). Elles sont stockées en fichier (FIT + JSON/binaire compressé) sur le stockage local (disque ou MinIO), avec seulement les agrégats en base.

## 3. API REST (phase 3)

Préfixe `/api/v1`, JSON, authentification par cookie de session (même domaine) ou bearer token.

| Méthode | Route | Description |
|---|---|---|
| POST | `/auth/*` | Inscription, connexion, OAuth (géré par la bibliothèque d'auth) |
| GET / PUT | `/me/profile` | Profil cycliste |
| GET / PUT | `/me/settings` | Réglages synchronisés |
| GET | `/worlds` · `/worlds/:id` | Mondes et manifestes |
| GET | `/routes?world=&mode=` · `/routes/:id` | Routes |
| POST | `/routes` | Créer un parcours (mode B) depuis GPX ou tracé |
| POST | `/rides` | Créer une sortie (métadonnées) → URL d'upload |
| PUT | `/rides/:id/files` (ou URL signée MinIO) | Upload du FIT et des échantillons vers le stockage local |
| GET | `/rides?cursor=` · `/rides/:id` | Historique, détail |
| DELETE | `/rides/:id` | Supprimer une sortie |
| GET | `/segments/:id/leaderboard` | Classement d'un segment |
| GET / POST | `/workouts` | Séances |
| POST | `/integrations/strava/connect` · `/callback` | OAuth Strava |
| POST | `/rides/:id/strava` | (Re)publier sur Strava |
| GET | `/me/export` · DELETE `/me` | Export et suppression RGPD |

Synchronisation : le client reste **local-first**. Les sorties sont créées localement puis poussées quand le réseau est disponible (file d'attente avec retry). En cas de conflit sur les réglages, la dernière écriture gagne.

## 4. Formats de fichiers

| Format | Usage | Sens |
|---|---|---|
| **FIT** (Activity) | Export de sortie vers Strava, Garmin, TrainingPeaks, Intervals.icu | Export (et import en mode B) |
| GPX 1.1 | Import de parcours ; export de trace optionnel | Import / export |
| TCX | Import de parcours | Import |
| ZWO (XML) | Séances structurées | Import |
| ERG / MRC (texte) | Séances structurées | Import |
| JSON interne | Routes, mondes, réglages, journaux BLE | Interne |

### Contenu de l'export FIT

- `file_id` : type activité, fabricant « development », produit, numéro de série.
- `record` à 1 Hz : timestamp, distance, vitesse, puissance, cadence, FC, altitude, et position lat/lon en mode B. En mode A, **pas de lat/lon** par défaut (sinon Strava placerait la sortie à un endroit réel). Option : coordonnées fictives pour avoir une carte, à décider.
- `lap` : **un lap automatique par tour de boucle** (mode A) ; par intervalle de séance ou manuel si l'utilisateur le choisit dans les réglages.
- `session` : sport `cycling`, sous-sport `virtual_activity` (pour que Strava la marque comme sortie virtuelle).
- `activity`.
- Champs développeur : rapport virtuel engagé, pente.
