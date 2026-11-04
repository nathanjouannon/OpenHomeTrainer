# Moteur physique

## 1. Principe

Le trainer mesure la **puissance** produite par le cycliste. L'application en déduit une **vitesse virtuelle** avec un modèle physique du cycliste sur route : pente, poids, aérodynamique, frottement des pneus et aspiration. La vitesse affichée par le trainer (vitesse de volant d'inertie) est **ignorée** : elle ne reflète ni la pente ni le poids.

## 2. Bilan des forces

```
m_eff · dv/dt = F_propulsion − F_gravité − F_roulement − F_aéro

F_propulsion = η · P / max(v, v_min)
F_gravité    = m · g · sin(θ)
F_roulement  = Crr · m · g · cos(θ)
F_aéro       = ½ · ρ · CdA · (1 − k_draft) · (v + v_vent)² · signe(v + v_vent)
θ            = atan(pente / 100)
```

| Symbole | Signification | Valeur par défaut |
|---|---|---|
| `m` | Masse totale cycliste + vélo | profil (ex. 75 + 8 kg) |
| `m_eff` | Masse effective (inertie des roues incluse) | `m + 1,5 kg` environ |
| `g` | Gravité | 9,81 m/s² |
| `η` | Rendement de la transmission | 0,97 |
| `Crr` | Coefficient de résistance au roulement | 0,004 (route) ; 0,008 (gravier) ; 0,012 (chemin) |
| `CdA` | Surface frontale × coefficient de traînée | 0,32 m² (cocottes) ; 0,25 (prolongateurs) ; 0,40 (VTT) |
| `ρ` | Masse volumique de l'air | 1,225 kg/m³ au niveau de la mer ; dépend de l'altitude (ρ ≈ 1,225 · e^(−h/8500)) |
| `v_min` | Vitesse plancher pour éviter la division par zéro | 0,5 à 1 m/s |
| `k_draft` | Réduction de traînée en aspiration | 0 seul ; jusqu'à ~0,3 en groupe (voir §5) |

Le `CdA` peut être dérivé de la taille et du poids (formule de type surface corporelle) ou d'un choix « position / type de vélo ».

## 3. Intégration numérique

- Pas fixe `dt = 50 ms` (20 Hz). Euler semi-implicite suffisant à cette échelle de temps.
- À chaque pas :
  1. pente = `route.sampleAt(distance).grade` (pente lissée, voir §6) ;
  2. accélération = somme des forces / `m_eff` ;
  3. `v = max(0, v + a·dt)` (pas de marche arrière) ;
  4. `distance += v·dt`.
- Freinage : pas de frein dans le MVP. En descente raide, la vitesse est naturellement plafonnée par l'aéro. On peut ajouter un plafond de sécurité (ex. 90 km/h).
- Le module est une **fonction pure** déterministe (mêmes entrées → mêmes sorties), ce qui est indispensable pour les tests, les fantômes et la vérification côté serveur.

## 4. Valeurs de référence (tests de non-régression)

Régime stabilisé, `m = 83 kg`, `CdA = 0,32`, `Crr = 0,004`, `η = 0,97`, `ρ = 1,225`, sans vent :

| Puissance | Pente | Vitesse attendue (≈) |
|---|---|---|
| 250 W | 0 % | 36,8 km/h (10,2 m/s) |
| 250 W | 7 % | 13,9 km/h (3,85 m/s) |
| 150 W | 0 % | 30,4 km/h (8,45 m/s) |
| 0 W | −6 % | vitesse limite ≈ 55 km/h (15,2 m/s) |

Ces valeurs doivent être recalculées précisément par un solveur de référence (bisection sur l'équation stationnaire) dans les tests. La tolérance de l'intégrateur en régime établi est de ±1 %.

## 5. Aspiration (drafting) — phase 6

Modèle simplifié, à calibrer :

```
k_draft(d) = 0,30                          si 0 ≤ d < 1,5 m derrière un coureur
           = 0,30 · (1 − (d − 1,5) / 8,5)  si 1,5 ≤ d < 10 m
           = 0                             au-delà, ou si décalage latéral > 1 m
```

En groupe, on prend le maximum des contributions (les effets ne s'additionnent pas linéairement), avec un bonus de peloton plafonné (ex. 0,4 au cœur d'un groupe de 10 ou plus). Le coureur de tête reçoit aussi un léger gain (~2–3 %).

## 6. Pente : calcul et lissage

Une pente calculée naïvement entre deux points GPS proches produit des pics absurdes (±40 %). Chaîne de traitement dans `route-engine` :

1. Rééchantillonner la route à **pas constant** (5 m pour l'interpolation, 10 à 25 m pour la pente).
2. Corriger l'altitude par un MNT si la source est un GPX de mauvaise qualité (mode B, voir [06](06-monde-reel.md)).
3. Lisser l'altitude (moyenne mobile pondérée ou Savitzky-Golay sur 50 à 100 m, à ajuster). Pour une **boucle** (mode A), le lissage est **circulaire** : la fenêtre déborde sur la fin et le début du tour, pour que la pente soit continue au passage de la ligne.
4. Pente = Δz / Δd sur une fenêtre centrée.
5. Bornes : [−25 %, +25 %] par défaut. Les exceptions réelles (murs à plus de 25 %) passent par un champ de route explicite.
6. Lissage temporel de la pente **envoyée au trainer** (constante de temps ~1 s) pour éviter les à-coups.

## 7. Pente envoyée au trainer vs pente simulée

Ce sont deux choses distinctes :

- la **pente simulée** (réelle, 100 %) sert au calcul de la vitesse ;
- la **pente ressentie** (= pente × difficulté, atténuée en descente, bornée) sert au trainer.

C'est le comportement standard du marché. Rouler à 50 % de difficulté ne rend pas plus rapide, cela change seulement la sensation et le choix de braquet.

Les **vitesses virtuelles** (changement de vitesses simulé) s'ajoutent à cette chaîne : elles modifient la résistance demandée au trainer, mais **jamais** le calcul de la vitesse, qui reste fondé sur la puissance mesurée. Voir [15-vitesses-virtuelles-et-commandes.md](15-vitesses-virtuelles-et-commandes.md).

## 8. Cas particuliers

| Cas | Comportement |
|---|---|
| Puissance absente depuis plus de 3 s | P = 0, roue libre, avertissement |
| Pic de puissance aberrant (> 2 500 W ou > 25 W/kg) | Valeur ignorée (filtre) |
| Pause | Vitesse figée à 0 ; enregistrement en pause |
| Mode ERG | La physique tourne normalement ; seule la commande au trainer change |
| Fin de tour (mode A, boucles) | Enchaînement transparent sur le tour suivant : la distance totale continue, la position sur la boucle repart de 0, la vitesse est conservée, la pente envoyée au trainer reste continue (raccord lissé) |
| Fin de parcours non bouclé (mode B uniquement) | Choix proposé sans arrêter l'enregistrement : demi-tour, recommencer depuis le départ, ou terminer |
| Altitude > 2 000 m | Densité de l'air réduite : on va plus vite à puissance égale (option « réalisme altitude ») |

## 9. Ce qui est volontairement simplifié

- Pas de modèle de virage (la vitesse en virage n'est pas limitée).
- Pas de vent météo dans le MVP (le champ `v_vent` existe pour plus tard).
- Pas de fatigue ni de modèle physiologique.
