# Prompt Claude Design — Page ERG (sans parcours)

À coller tel quel dans Claude Design, avec les jetons et composants du lot 3.14 (`apps/web/src/design/hrt.css`, `docs/design/`). Le rendu est ensuite redonné à Claude Code pour être implémenté dans `apps/web`. Inventaire établi le 2026-11-22 d'après le code de la première version (`apps/web/src/pages/ErgPage.tsx`).

Contexte du besoin : la page fait rouler **uniquement en mode ERG, sans parcours ni monde 3D**. Soit une **séance structurée** construite à la main en blocs (watts), soit un **ERG libre** à une puissance réglable en direct depuis le téléphone ou la manette Zwift.

---

## Le prompt

Tu es designer produit senior. Conçois **deux écrans** de l'application **HomeRealTrainer** (simulation de sortie vélo sur home trainer connecté, Chrome/Edge sur ordinateur) : l'**éditeur de blocs ERG** et l'**écran de séance ERG plein écran**, plus une **évolution mineure de la page smartphone**. **Réutilise le design system v2 existant** (jetons, composants, thèmes) : ne propose pas de nouvelle identité. Aucun monde 3D, aucune route, aucun avatar sur ces écrans.

### 1. Contraintes générales
- L'écran de séance est regardé à **1,5–3 m de distance, en effort, en sueur**. Les chiffres sont l'information principale : **très gros**, contraste fort, chasse fixe (tabulaires), très peu de texte, aucun détail fin.
- **Aucune souris pendant l'effort** : pilotage au clavier, à la manette, aux boutons Zwift Click ou au smartphone. Seuls l'éditeur et les boutons « Pause / Terminer / Abandonner » sont cliquables ; ils doivent avoir un **focus visible**.
- Thème **sombre** par défaut sur l'écran de séance, **quel que soit le thème du système** (problème de la v1 : le texte héritait d'une couleur sombre sur un fond sombre, car l'écran plein écran n'a pas le cadre de l'application ; le fond et la couleur de texte doivent être posés explicitement). L'éditeur suit le thème clair/sombre de l'application.
- Français et anglais (textes de longueur différente), 4 tailles de HUD (S, M, L, XL) qui mettent tout à l'échelle, trois palettes (standard, daltonien rouge-vert, daltonien bleu-jaune) : les **zones de puissance Z1 à Z6** gardent leurs jetons `--z1..6`, avec une marque non colorée en plus de la couleur dans les modes daltoniens.
- Rendu 16:9 en 1920×1080 pour la séance (doit rester correct de 1280×720 à 2560×1440), bureau pour l'éditeur, mobile pour la page smartphone.

### 2. Écran A : éditeur de blocs (`#/erg`, dans le cadre de l'application avec la barre de navigation)
Entrée de navigation : **« ERG »**, entre Séances et Commandes. Titre de page : « Mode ERG », sur-titre : « Sans parcours ». Texte d'aide : « Construis des blocs pour une séance structurée, ou laisse la liste vide pour rouler en ERG libre. »

**Bandeau d'information** (état conditionnel) : « Aucun appareil connecté : un home trainer simulé sera utilisé. »

**A.1 Carte « Blocs »** :
- Liste ordonnée de blocs, vide au départ (**état vide à concevoir** : invite à ajouter un premier bloc, et rappel que sans bloc on roule en ERG libre).
- Un bloc = numéro, type **palier** ou **rampe**, **durée en minutes + secondes**, puissance en **watts** (un seul champ pour un palier ; « Watts début » et « Watts fin » pour une rampe), boutons **Dupliquer** et **Supprimer**. Bornes : durée de 5 s à 6 h, puissance de 0 à 2000 W ; les blocs de moins de 5 s sont ignorés au lancement (message : « Blocs trop courts (moins de 5 s) : ils sont ignorés »).
- Boutons **« Ajouter un palier »** et **« Ajouter une rampe »** ; le nouveau bloc reprend la durée et la puissance de fin du précédent (palier : même puissance ; rampe : +50 W).
- **Aperçu graphique** de la séance en barres colorées par zone (visible dès qu'un bloc est jouable), avec la ligne de FTP en pointillés ; zone calculée sur la FTP du profil (200 W par défaut si inconnue).
- À prévoir (non codé) : réordonner les blocs, bloc « répéter ×N ». Propose-les dans la maquette, signalés comme évolutions.

**A.2 Carte « ERG libre »** : texte « Sans bloc, la séance démarre à cette puissance. Tu la règles ensuite avec le téléphone ou les boutons + / − de la manette Zwift. » Un champ **« Puissance de départ (W) »** (130 W par défaut, pas de 5 W, 0–2000).

**A.3 Action principale** (un seul gros bouton, même taille que « Rouler » de l'accueil) dont le libellé change selon l'état :
- au moins un bloc jouable : « Lancer la séance (10:00) » (durée totale) ;
- aucun bloc : « Lancer en ERG libre à 130 W ».
Le brouillon (blocs et puissance libre) est mémorisé d'une visite à l'autre.

### 3. Écran B : séance ERG (`#/erg/run`, plein écran, sans barre de navigation)
Deux variantes de contenu sous la même structure : **séance structurée** et **ERG libre**. Trois zones : bandeau haut, grande zone centrale, zone basse.

**B.1 Bandeau haut** : à gauche, nom (« Séance ERG » ou « ERG libre ») et temps de pédalage, avec la durée totale pour une séance (« 12:30 / 45:00 ») ; à droite, **fréquence cardiaque** (♥ 142) seulement si un capteur est connecté, et trois boutons : **Pause / Reprendre**, **Terminer** (enregistre et ouvre le récapitulatif, action principale), **Abandonner** (n'enregistre rien ; **demande une confirmation**, absente de la v1).

**B.2 Zone centrale, deux colonnes de même poids** (les deux informations principales de l'écran) :
- **Puissance** en W : valeur énorme (moyenne sur 3 s), unité, puis la **cible** dessous (« Cible 130 W »). En séance, si la puissance a été décalée avec les boutons ±, afficher le décalage à côté de la cible (« Cible 150 W (+10) »). Prévois un **retour visuel de l'écart** entre puissance réelle et cible (colorer ou indiquer trop haut / trop bas) qui ne repose pas que sur la couleur.
- **Cadence** en tr/min : valeur énorme et unité.
Valeurs à 0 quand aucun capteur ne répond (prévoir un état « Pas de puissance reçue »).

**B.3 Zone basse, séance structurée** :
- ligne d'état : **bloc en cours** (étiquette de zone, ex. « Z2 ») avec le **temps restant du bloc** (« 4:51 »), et à droite **« Ensuite Z3 · 180 W »** ;
- **graphe zoomé** sur la zone en cours : fenêtre de **10 minutes** qui garde la position actuelle dans son premier tiers, barres colorées par zone, curseur de position, partie passée atténuée, rampes en pente ; les barres suivent le décalage ± appliqué ;
- **graphe de la séance complète**, plus bas et plus petit, avec le curseur ;
- **état final** : le bandeau du bloc est remplacé par « Séance terminée : appuie sur Terminer pour l'enregistrer. » (la v1 ne propose pas de passage automatique au récapitulatif).

**B.4 Zone basse, ERG libre** :
- à gauche, quatre boutons tactiles/cliquables **−10 W, −5 W, +5 W, +10 W** (gros, regroupés), et la mention « Manette Zwift : + = +5 W, − = −5 W » ;
- à droite, le **QR code** pour régler la cible depuis le téléphone, avec « Scanne pour régler la puissance », le nombre de téléphones connectés (« 1 téléphone(s) ») et, s'il y a plusieurs réseaux locaux, un sélecteur d'adresse ;
- **états de la liaison téléphone à concevoir** : désactivée (bouton « Activer le téléphone (QR code) »), recherche du relais, relais introuvable (« Relais introuvable : lance apps/api pour utiliser le téléphone. »), en attente d'un téléphone, téléphone connecté.
- Si la cible est coupée par un bouton ERG on/off, la page la rétablit sur la dernière valeur (ne pas afficher « ERG off » durablement).

**B.5 États transverses** : **en pause** (voile ou indication très visible, boutons inchangés), **cadence nulle / spirale** (« Pédalez pour reprendre » : la consigne se met en attente), **capteur muet**, **reconnexion de l'appareil**, **fin de séance**. Pas de toasts de tour ou de segment ici (il n'y a pas de parcours).

**B.6 Interactions** : Espace = pause/reprise ; boutons du téléphone, du Zwift Click et de la manette = mêmes actions qu'en sortie normale (+5 W / −5 W, +10 W / −10 W depuis le téléphone, intervalle suivant). Écran gardé allumé, plein écran possible (touche F).

### 4. Page compagnon smartphone (évolution mineure)
La page mobile existante (10 gros boutons : rapport −/+, ERG −5 W/+5 W, petit/grand plateau, pause, caméra, tour, suivant) gagne **une rangée « ERG −10 W / ERG +10 W »** sous la rangée ±5 W. Redessine la page avec cette rangée en plus, dans la même grille (5 rangées au lieu de 4). Pour l'ERG libre, propose une **variante épurée** où la cible actuelle s'affiche en grand sur le téléphone, entre les boutons ±, si la place le permet (non codé aujourd'hui : le téléphone n'affiche que des boutons).

### 5. Livrables attendus
1. Maquettes : éditeur (vide, avec blocs, erreurs de saisie, avec/sans appareil), séance structurée (bloc en cours, rampe, pause, fin, décalage ±), ERG libre (QR affiché, liaison désactivée, relais introuvable), page smartphone.
2. Jetons ajoutés éventuels, **uniquement en complément** de ceux de `hrt.css` ; tailles des très gros chiffres pour S, M, L, XL.
3. HTML/CSS directement exploitables (variables CSS, SVG pour les graphes), noms de composants stables.

### 6. Hors périmètre
Scène 3D, parcours, monde réel, multijoueur, historique et récapitulatif (existants, inchangés), réglages globaux.

---

## Notes pour l'implémentation (ne pas coller dans Claude Design)
- Code actuel : `apps/web/src/pages/ErgPage.tsx` (`ErgPage`, `ErgRunPage`), logique pure dans `apps/web/src/ride/erg-workout.ts` (tests `erg-workout.test.ts`), styles provisoires `.erg-*` en fin de `apps/web/src/styles.css`.
- La séance réutilise `RideSession` et `useRideController` avec un parcours plat fictif (`flatErgRoute`) : l'enregistrement, l'export .fit et l'historique fonctionnent comme une sortie, sous le nom « Séance ERG ».
- Cause du noir sur noir : `.erg-run` n'a ni `background` ni `color`, et `App.tsx` ne l'enveloppe pas dans `Shell` (qui pose le thème).
- Les boutons ±10 W du téléphone passent par les actions `ergUp10` / `ergDown10` (déjà branchées dans `packages/controls`).
