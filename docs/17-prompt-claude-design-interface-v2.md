# Prompt Claude Design — Interface v2 (lot 3.14)

À coller tel quel dans Claude Design. Le rendu (maquettes, jetons de design, composants) est ensuite redonné à Claude Code pour être implémenté dans `apps/web`. Inventaire établi le 2026-11-18 d'après le code (pages, réglages, HUD) ; si une fonction est ajoutée avant la fin du lot, compléter la liste.

---

## Le prompt

Tu es designer produit senior. Conçois l'**interface complète v2** de **HomeRealTrainer** : une application web de simulation de sortie vélo sur home trainer connecté (Bluetooth), qui fait rouler le cycliste dans un monde 3D virtuel (boucles de route, col, lac, collines), avec séances structurées, vitesses virtuelles, enregistrement .fit et historique. Elle fonctionne en local dans Chrome/Edge sur un ordinateur, affichée sur un écran regardé à **1,5–3 m de distance, en effort, en sueur**. La scène 3D (route, avatar, vélo, décor) est déjà faite : **ne la conçois pas**, mais conçois tout ce qui se superpose ou l'entoure.

### 1. Direction artistique
- Identité **originale**, cohérente et reconnaissable, **sans ressemblance** avec Zwift ou MyWhoosh (couleurs dominantes, logos, typographies, formes de jauges). Qualité de finition et clarté comparables aux meilleures applications de sport, sans copier. Le nom de travail est « HomeRealTrainer » (à valider) : propose un logotype simple.
- **Thème sombre par défaut** pendant la sortie. Pages hors sortie : propose clair et sombre (l'app suit aujourd'hui le thème du système).
- **Lisible de loin** : très gros chiffres, contraste fort, peu de texte, chiffres à chasse fixe (tabulaires), pas de détails fins pendant la sortie.
- **Aucune souris pendant l'effort** : tout se pilote au clavier, à la manette, aux boutons Bluetooth (Zwift Click, OpenBikeControl) ou à la télécommande smartphone. Prévois un **état de focus visible** partout et une navigation possible à la flèche/entrée dans les écrans de choix.
- Français et anglais (textes de longueur différente), unités métriques ou impériales.
- Accessibilité : modes daltoniens (voir §4), 4 tailles de HUD (S, M, L, XL) qui mettent tout à l'échelle, contrastes AA minimum, option « réduire les mouvements » (pas d'animations de caméra ni de transitions agitées).
- Application utilisable de l'ouverture au premier coup de pédale en **moins de 60 s** (moins de 15 s si les appareils sont déjà connus).

### 2. Livrables attendus
1. **Jetons de design** : palette (neutres, accent, états succès/avertissement/erreur, **6 couleurs de zones de puissance**, **5 couleurs de bandes de pente**), variantes sombre/claire, variantes daltoniennes (rouge-vert, bleu-jaune), typographies et échelle, espacements, rayons, ombres, animations (durées, courbes).
2. **Bibliothèque de composants** avec tous leurs états (normal, survol, focus, actif, désactivé, erreur, chargement).
3. **Maquettes de chaque écran** listé en §3 et §4, aux **états vides, de chargement et d'erreur** inclus, en bureau 16:9 (1920×1080 pour la sortie), et en mobile pour la seule page compagnon smartphone (§3.13).
4. **Prototype ou séquence** du parcours principal et des transitions (accueil → sortie → récapitulatif).
5. Rendu directement exploitable en code : HTML/CSS propres (variables CSS pour les jetons, pas d'images pour ce qui peut être du CSS/SVG), noms de composants stables, spécifications d'espacement.

### 3. Écrans hors sortie (liste complète)
Navigation : l'app a aujourd'hui un routage par `#/…` et un bouton « Retour » par page ; propose une navigation globale cohérente (barre ou menu) tout en gardant l'accueil en cartes si c'est le meilleur choix.

**3.1 Accueil** : nom, accroche (« Simulation de sortie vélo sur home trainer connecté »), gros bouton **Rouler**, bandeau d'avertissement si Web Bluetooth est indisponible (Chrome/Edge requis), bandeau « une sortie n'a pas été terminée (onglet fermé ou plantage) » avec action **La récupérer**, cartes d'accès : Appareils (avec état de connexion), Séances (bibliothèque, éditeur, import), Commandes (clavier, manette, OpenBikeControl, smartphone, profils), Historique (dernière sortie : date et parcours, ou « aucune sortie »), Réglages.

**3.2 Vérification du premier lancement / navigateur non compatible** : détection de Web Bluetooth, explication, liens vers Chrome/Edge, rappel de l'autorisation Bluetooth (macOS) et du HTTPS.

**3.3 Profil / première configuration** : poids, taille, FTP (ou « Je ne sais pas » → estimation), FC max, type de vélo (route, route aéro, gravel, VTT), masse du vélo, source de puissance (home trainer ou capteur de puissance).

**3.4 Appareils (appairage)** : une carte par rôle — **Home trainer**, **Capteur de puissance**, **Ceinture cardio**, **Capteur de cadence**, **Commandes (Zwift Click)** — avec état (non connecté, connexion, connecté, reconnexion), nom de l'appareil, **valeur en direct** (W, bpm, tr/min), niveau de batterie pour le Click, boutons Connecter / Déconnecter / Oublier / Reconnecter {nom}, appareil **simulé** (mode dev, avec l'indication « ↑ / ↓ règlent la puissance de 10 W »), messages d'erreur précis (Bluetooth indisponible, aucun appareil choisi, connexion échouée, service absent, prise de contrôle refusée, commande refusée, non connecté), bouton **Choisir une boucle** pour continuer.

**3.5 Choix du parcours (boucles)** : liste des **mondes et boucles** en cartes avec : nom, profil du terrain (plat, vallonné, montagne), **longueur du tour, dénivelé positif par tour, pente max, temps au tour estimé selon la FTP, meilleur tour personnel**, **profil d'élévation d'un tour**, carte/aperçu du tracé. Options de la sortie : **sens** (aller / retour, chaque sens a ses segments et records), **segments** de la boucle avec record personnel (ou « aucun effort »), **fantôme** (aucun / meilleur tour / une des 10 dernières sorties du parcours, avec date et temps), **séance** (aucune / une de la bibliothèque), **objectif** (aucun / durée / distance dans l'unité choisie / nombre de tours), avertissement « aucun appareil de puissance connecté », message « parcours manquant », bouton **Démarrer →**.

**3.6 Chargement du monde** : progression de la construction (« Construction du monde… »), astuce, « commencer dès maintenant » quand l'essentiel est prêt.

**3.7 Séances (bibliothèque)** : séances fournies (9, dont test de rampe et test FTP 20 min) et « mes séances » ; chaque carte : nom, description, **graphe en barres coloré par zone**, durée, IF, TSS, boutons Rouler, Modifier, Dupliquer, Supprimer (confirmation) ; **import de fichiers** `.zwo` / `.erg` / `.mrc` (plusieurs à la fois, glisser-déposer) avec messages d'import réussi / échoué ; avertissement « FTP non renseignée (200 W utilisés) » ; bouton Nouvelle séance.

**3.8 Éditeur de séance** : nom, description ; liste d'étapes de trois types — **palier**, **rampe**, **répétition** (étapes imbriquées) — avec durée (minutes), puissance en % FTP ou en watts absolus (de / à pour une rampe), ajout / suppression / réordonnancement ; **graphe de prévisualisation** en direct, statistiques (durée, IF, TSS) ; Enregistrer / Annuler.

**3.9 Commandes** : (a) **profils** (le profil par défaut est non modifiable ; dupliquer, renommer, supprimer) ; (b) **appareils de saisie** : clavier, manette (Gamepad), OpenBikeControl en Bluetooth (appairer, état, test de vibration), Zwift Click ; (c) **télécommande smartphone** : activer, état de la connexion, **QR code**, choix du réseau local (Wi-Fi), « nouveau code », message si aucun réseau ; (d) **table de mapping** par catégories d'actions : une ligne par action avec son ou ses boutons assignés, bouton **assigner** (mode « appuie sur le bouton à assigner »), type d'appui (simple, long, double), retirer ; (e) **dernière entrée reçue** (retour en direct).

**3.10 Réglages** (sections Profil, Sortie, Affichage, Données) :
- Sortie : **difficulté du trainer** (0–100 %, part de la pente ressentie), **vitesses virtuelles** (activer), **type de boîte** (plateaux et cassette, ou 24 vitesses numérotées sans plateau), cassette virtuelle (nombre de vitesses), **transmission personnalisée** (plateaux jusqu'à 3, cassette jusqu'à 16 pignons, dents de 8 à 70, validation à la saisie), **pilotage par les vitesses** (décalage de pente par défaut / réaliste ERG expérimental), **rapport physique du trainer** (plateau × pignon), source de puissance.
- Affichage : langue (fr/en), unités, **qualité graphique** (auto, basse, moyenne, haute, avec aide), **moteur de rendu** (auto WebGPU / WebGL2), **taille du HUD** S/M/L/XL, **tuiles du HUD** (cocher/décocher, monter/descendre, remettre par défaut ; 9 tuiles), **couleurs du HUD** (standard / rouge-vert / bleu-jaune), réduire les mouvements de caméra.
- Données : télécharger le journal d'erreurs.
- Prévois des textes d'aide courts sous les champs et des regroupements repliables : cette page est longue.

**3.11 Historique** : liste des sorties (date, parcours, durée, distance, puissance moyenne), état vide, sorties **non terminées** avec action « Terminer et récupérer ». (À prévoir : filtres.)

**3.12 Récapitulatif d'une sortie** : date, parcours ; grille de statistiques (durée, distance, dénivelé, vitesse moy., puissance moy., puissance normalisée, puissance max, cadence moy., FC moy./max, travail en kJ, TSS) ; **courbes** altitude, puissance, FC ; **tableau des segments** (temps, record précédent, « Record ! ») ; **tableau des tours** (temps, puissance, FC, meilleur tour mis en évidence, déclencheur manuel/fin) ; zones de puissance (à prévoir) ; **records** battus ; boutons **Exporter en .fit** (et Strava, à prévoir), **Supprimer** (second clic pour confirmer) ; état « sortie introuvable ».

**3.13 Page compagnon smartphone** (mobile, servie par le relais local) : 10 gros boutons tactiles — rapport − / +, ERG −5 W / +5 W, petit / grand plateau, pause, caméra, tour, intervalle suivant — maintien = répétition, état de connexion, reconnexion automatique, indication d'écran gardé allumé, vibration. Pensée pour être posée sur le guidon, utilisable sans regarder.

**3.14 Pages techniques (ne pas refondre, seulement thème cohérent)** : `#/click` (diagnostic Zwift Click), `#/bench` (banc de comparaison graphique), `#/bike` (visionneuse du vélo), caméra libre de développement.

### 4. Écran de sortie (le plus important)
Vue 3D plein écran avec, par-dessus :

**4.1 HUD, rangée haute** : tuiles configurables **Temps, Distance, D+** ; tuile **Tour** (n° du tour, temps du tour en cours, dernier tour, meilleur tour) si le parcours est une boucle ; tuile **Fantôme** (écart en temps, coloré devant/derrière, et en distance) ; **mini-carte** du tracé avec la position.
**4.2 HUD, rangée basse** : tuiles configurables **Puissance** (grande, avec moyenne sur 3 s), **W/kg**, **Cadence**, **FC**, **Vitesse**, **Rapport** (étiquette du rapport + jauge des vitesses) ; tuile **Cible ERG** (valeur, consigne envoyée, état : actif / « Pédalez pour reprendre » / « En attente ») ; **profil d'élévation du tour en cours** avec position (il repart du début au passage de ligne, sans coupure) ; **pente en grand**, colorée par bande (descente, 0–3, 3–6, 6–9, > 9 %), avec une **marque non colorée** (▼ ▲ ▲▲ ▲▲▲) dans les modes daltoniens.
**4.3 Bandeau de séance** : nom, n° d'intervalle / total, cible en watts et étiquette de l'intervalle, écart d'ajustement (± W), **temps restant**, intervalle suivant, **graphe de la séance** avec curseur et partie passée atténuée ; état « Séance terminée ».
**4.4 Bandeau de segment** : nom, distance restante, temps écoulé, record personnel et écart (vert/rouge, daltonien-compatible).
**4.5 Indicateurs d'état discrets** : capteur de puissance muet (« Pas de puissance reçue »), « Reconnexion de {nom}… », focus perdu (« Clique dans la page pour que le clavier fonctionne »), FPS et moteur de rendu (WebGPU/WebGL2).
**4.6 Notifications brèves (toasts)** : tour terminé (« Tour 3 : 12:41 »), **meilleur tour**, début/fin de segment, **nouveau record**, segment plus lent (écart), objectif atteint, séance terminée, ERG activé / désactivé / cible / repris, changement de rapport.
**4.7 Pause** : carte centrale avec temps, distance, tour ; curseur de difficulté ; choix de caméra (POV guidon, poursuite, latérale, drone) ; Reprendre, Terminer la sortie, Abandonner sans enregistrer (confirmation) ; rappel des raccourcis.
**4.8 Bouton pause** à l'écran ; **masquage du HUD** (touche `H`) ; plein écran.
**4.9 Fin de sortie** : écran de transition vers le récapitulatif avec résumé et records.
**4.10 Raccourcis à afficher** (aide) : Espace pause/reprise, A/Z (ou −/+) vitesse plus facile/plus dure (ERG : ∓5 W), 1–4 caméras, ←/→ direction à l'intersection, U demi-tour, H HUD, M muet, L tour manuel, F plein écran, E ERG, N/B intervalle suivant/précédent.

### 5. Parcours et états à couvrir dans les maquettes
- Parcours principal : Accueil → Appareils → Choix du parcours (+ fantôme, séance, objectif) → Chargement → Sortie → Pause → Fin → Récapitulatif → Historique.
- Variantes : sortie libre (sans séance), sortie avec séance ERG, sortie contre fantôme, sortie avec segment, sortie sans capteur de puissance, perte de connexion du trainer, récupération d'une sortie non terminée.
- Chaque écran : état vide, chargement, erreur, long texte (anglais et français), tailles de HUD S → XL, trois palettes (standard, rouge-vert, bleu-jaune).

### 6. Hors périmètre (ne rien concevoir)
Scène 3D, avatar, vélo, mode « monde réel » (images/GPX/MapLibre, phase 4), multijoueur, comptes, tableau de bord web, tout élément qui n'existe pas dans cette liste, sauf mention « à prévoir ».
