# UX / UI

## 1. Principes

- **Lisible de loin** : on regarde l'écran à 1,5–3 m, en sueur. Gros chiffres, contraste fort, peu de texte.
- **Zéro friction au démarrage** : de l'ouverture de l'application au premier coup de pédale en moins de 60 s (appareils déjà connus : moins de 15 s).
- **Pas de souris pendant l'effort** : tout est accessible au clavier, à la manette et aux contrôleurs ([15](15-vitesses-virtuelles-et-commandes.md)).
- **Thème sombre** par défaut pendant la sortie.

## 2. Parcours principal

```
Accueil ──▶ Appairage ──▶ Choix du mode ──┬─▶ Monde virtuel : choix de la boucle ┐
   ▲         (mémorisé)                    ├─▶ Monde réel : import / tracé / catalogue ─┼─▶ (option) séance ──▶ Chargement ──▶ SORTIE
   │                                       └─▶ Séance seule                       ┘                                         │
   └──────────────── Historique ◀── Export / Strava ◀── Récapitulatif ◀── Fin ◀─────────────────────────────────────────────┘
```

## 3. Écrans

| Écran | Contenu clé |
|---|---|
| **Vérification** (1er lancement) | Détection du navigateur : si Web Bluetooth est absent, explication et liens vers Chrome/Edge. Rappel HTTPS et autorisation Bluetooth (macOS). |
| **Accueil** | Bouton « Rouler », dernière sortie, état des capteurs, accès profil et historique |
| **Appairage** | Une carte par rôle (Trainer, Puissance, Cardio, Cadence, **Commandes**) : état, valeur en direct, bouton connecter/oublier ; appareil simulé en mode dev |
| **Profil** (onboarding) | Poids, taille, FTP (ou « je ne sais pas » → estimation), vélo |
| **Choix de boucle** | Carte du monde, liste filtrable (longueur du tour, D+ par tour), profil d'un tour, temps au tour estimé selon la FTP, meilleur tour personnel ; objectif optionnel (durée, distance, nombre de tours) |
| **Mode réel** | Carte MapLibre, import GPX (glisser-déposer), tracé, catalogue, aperçu de la couverture d'images et du profil |
| **Chargement** | Progression, astuce, « commencer dès maintenant » quand l'essentiel est prêt |
| **Sortie** | Voir §4 |
| **Pause** | Stats courantes, reprendre, terminer, réglages rapides (difficulté, vitesses, caméra) |
| **Récapitulatif** | Durée, distance, D+, puissance moy./NP, FC, cadence, courbes, zones, segments, **tableau des tours** (temps, puissance, FC par tour, meilleur tour mis en évidence), boutons Exporter .fit / Strava / Supprimer |
| **Historique** | Liste, filtres, détail |
| **Réglages** | Unités, langue, graphismes, sons, difficulté, **transmission virtuelle**, **commandes et mapping**, données et vie privée |

## 4. HUD de sortie

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⏱ 00:42:17   📏 18,4 km   ⛰ +412 m   🔁 Tour 2 · 14:05 (meill. 27:48) [mini-carte]│
│                                                                    ◯──●      │
│                                                                              │
│                          (vue 3D ou image réelle)                            │
│                                                                              │
│ ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌─────────────┐   │
│ │  254 W   │ │ 3,4W/kg│ │ 88 rpm │ │ 152 bpm│ │ 28,6 km/h│ │ ⚙ 50×17 14/24│  │
│ │ 3s: 248  │ │        │ │        │ │        │ │          │ │ ▮▮▮▮▮▯▯▯▯    │  │
│ └──────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ └─────────────┘   │
│  ▁▂▃▅▆▇██▇▆▅▄▃▂▁▁▂▃▅▆▇▇▆▅  profil d'élévation  ▲ vous êtes ici   pente 6,8 %   │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Champs **configurables** (choix et ordre des tuiles).
- Pente affichée en grand, avec une couleur par tranche (0–3 %, 3–6 %, 6–9 %, > 9 %).
- En séance : bandeau supérieur avec intervalle courant, cible, temps restant et graphe de la séance.
- Indicateurs d'état discrets : capteur déconnecté (icône rouge clignotante), focus perdu, FPS bas.
- Notifications brèves : segment commencé ou terminé, **passage de ligne (temps du tour, écart avec le meilleur tour)**, objectif atteint, record personnel, changement de vitesse.
- Le profil d'élévation montre le **tour en cours** ; au passage de ligne, il repart du début sans interruption.

## 5. Raccourcis clavier par défaut (modifiables)

| Touche | Action |
|---|---|
| `Espace` | Pause / reprise |
| `A` / `Z` (ou `−` / `+`) | Vitesse plus facile / plus dure (ERG : −/+ 5 W) |
| `1`–`4` | Caméras |
| `←` / `→` | Direction à la prochaine intersection |
| `U` | Demi-tour |
| `H` | Masquer / afficher le HUD |
| `M` | Muet |
| `L` | Tour manuel |
| `F` | Plein écran |
| `↑` / `↓` | (Trainer simulé, mode dev) puissance ±10 W |

## 6. Accessibilité et confort

- Tailles de HUD : S / M / L / XL.
- Modes daltoniens pour les couleurs de pente et de zones.
- Réduction des mouvements de caméra (anti-cinétose) : caméra plus stable, sans balancement.
- Screen Wake Lock pendant la sortie ; plein écran recommandé.

## 7. Identité

Nom de travail **HomeRealTrainer** : à valider (disponibilité du nom de domaine et des marques). Une identité visuelle propre, sans ressemblance avec Zwift ou MyWhoosh (couleurs dominantes, logos, typographies).
