# Multijoueur (phase 6)

Le multijoueur n'est pas dans le MVP, mais certaines décisions prises dès la phase 1 le rendent possible sans refonte.

## 1. Modèle

- **Physique locale, position déclarée par le client** : chaque client calcule sa propre vitesse (latence nulle pour le coureur) et envoie son état. Le serveur relaie et contrôle la plausibilité.
- **Rooms** : une room par monde (ou par événement), découpée en zones d'intérêt si le nombre de joueurs augmente.
- **Position sur route** plutôt que coordonnées 3D : `(routeId, lap, lapDistanceM, lateralOffsetM)`. Les routes étant des boucles, la proximité entre deux coureurs se calcule sur la distance dans le tour, de façon circulaire (un coureur à 50 m de la ligne et un autre à 50 m après sont à 100 m l'un de l'autre). Le message est plus compact et l'interpolation reste triviale le long de la spline.

## 2. Protocole

Transport WebSocket (binaire, MessagePack ou encodage maison).

| Message | Sens | Fréquence | Contenu |
|---|---|---|---|
| `join` | C → S | 1× | token, worldId, routeId, avatar |
| `state` | C → S | 2–4 Hz | t, routeId, lap, lapDistanceM, lateralM, speed, power, cadence, hr?, gear?, flags |
| `snapshot` | S → C | 2–4 Hz | états des coureurs dans la zone d'intérêt (rayon ~2 km) |
| `event` | S → C | ponctuel | arrivée ou départ d'un joueur, ride on, résultats de segment |
| `ping` / `pong` | ↔ | 1 Hz | mesure du RTT, horloge |

Côté client : **interpolation** avec un tampon de 300 à 500 ms pour les autres coureurs, extrapolation courte en cas de perte de paquets.

## 3. Aspiration

Calculée **localement** par chaque client, à partir des positions interpolées des autres coureurs (modèle dans [04 §5](04-moteur-physique.md)). Le léger retard d'interpolation est acceptable à ces vitesses.

## 4. Anti-triche (base)

- W/kg instantané et soutenu plausibles (plafonds par durée).
- Vitesse cohérente avec la puissance, la pente et le poids déclaré (recalcul serveur avec `@hrt/physics`, tolérance).
- Pas de saut de distance.
- Poids et taille modifiables à une fréquence limitée.
- Les sorties suspectes sont exclues des classements, pas bloquées.

## 5. Technologie

| Option | Pour | Contre |
|---|---|---|
| **Colyseus** | Rooms, matchmaking, synchro d'état, reconnexion intégrés | Abstraction à apprendre ; le schéma d'état n'est pas indispensable ici |
| `uWebSockets.js` maison | Très performant, contrôle total | Plus de code (rooms, reconnexion) |

Choix provisoire : Colyseus, à confirmer au début de la phase 6. Redis pour la présence entre plusieurs instances.

## 6. Montée en charge (ordres de grandeur)

200 coureurs dans une room × 4 Hz × ~40 octets par état ≈ 32 ko/s entrants. Avec une diffusion filtrée par zone d'intérêt (~50 coureurs visibles), environ 8 ko/s sortants par client. Une seule instance suffit pour des centaines de joueurs.

## 7. Éléments sociaux

Bots « pacers » (puissance constante, rejoués côté serveur), fantômes, ride ons, sorties de groupe planifiées avec « mode groupe » (le groupe reste ensemble quelle que soit la puissance), classements de segments.

## 8. À préparer dès la phase 1

- `RiderState` sérialisable et indépendant du rendu.
- Le rendu d'un avatar prend un `RiderState`, qu'il soit local, fantôme ou distant.
- Le monde supporte N avatars instanciés (budget de rendu prévu dans [05](05-monde-virtuel.md)).
