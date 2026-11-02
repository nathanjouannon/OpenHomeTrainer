# Questions ouvertes et hypothèses par défaut

Chaque question a une **hypothèse par défaut** : le développement peut avancer avec elle tant que la question n'a pas de réponse. Les questions marquées 🔴 doivent être tranchées avant la fin de la phase indiquée.

| # | Question | Hypothèse par défaut | Avant |
|---|---|---|---|
| Q1 | ✅ Phrase incomplète de la demande initiale | **Tranché** : il s'agissait du changement de vitesses virtuel ([15](15-vitesses-virtuelles-et-commandes.md)) | — |
| Q2 | 🔴 Home trainer définitif : **Van Rysel D500** (préciser : modèle 2025 « Zwift » ou ancien) ou **Wahoo KICKR** (préciser : KICKR v6, KICKR Core, Core Zwift One…) ? Ceinture cardio ? | Achat en cours ; les deux candidats supportent FTMS, développement prévu pour les deux. Le prototype Bluetooth (phase 0, étape 2) attend la livraison ; le trainer simulé permet d'avancer d'ici là | Phase 0 |
| Q3 | Projet personnel, open source, ou produit commercial à terme ? | Personnel, avec possibilité d'ouverture publique ; aucun choix bloquant pour une commercialisation | Phase 2 |
| Q4 | Licence du code ? | Propriétaire (dépôt privé) en attendant Q3 | Phase 2 |
| Q5 | Ordinateur de référence pour les performances ? | MacBook Air M1 / PC portable avec GPU intégré récent, 1080p | Phase 0 |
| Q6 | Quelle région réelle sert de base au premier monde virtuel ? | Une zone de moyenne montagne française (relief IGN précis), à choisir parmi 2–3 candidates lors du spike 3D | Phase 1 |
| Q7 | Le multijoueur doit-il arriver avant le mode monde réel ? | Non : mode B (phase 3) puis multijoueur (phase 4), comme demandé (« monde réel dans un second temps ») | Phase 2 |
| Q8 | Faut-il un compte dès le MVP ? | Non, local-first ; comptes en phase 2 | Phase 1 |
| Q9 | Langues ? | FR + EN | Phase 1 |
| Q10 | ✅ Budget ? | **Tranché : 0 €** hors outil d'IA de développement (déjà payé). Pas d'API payante, pas d'achat d'assets ni d'hébergement payant ([ADR 0010](adr/0010-budget-zero-execution-locale.md)) | — |
| Q11 | Street View : l'utiliser avec un quota journalier plafonné sous le palier gratuit (nécessite un compte Google Cloud avec facturation activée), ou y renoncer ? | Mapillary comme source principale ; Street View seulement si le plafonnement garantit 0 €, sinon abandonné | Phase 3 |
| Q18 | ✅ Hébergement ? | **Tranché : local uniquement pour l'instant.** Un hébergement public (gratuit) sera une décision ultérieure, nécessaire pour le multijoueur en ligne | — |
| Q12 | En mode A, l'export FIT doit-il contenir des coordonnées GPS (fictives) pour afficher une carte sur Strava ? | Non (pas de GPS) | Phase 1 |
| Q13 | ✅ Contrôleurs | **Réponse** : Zwift Cog + Zwift Click (achat en cours, v2 probablement) ; commandes Shimano Ultegra Di2 déjà possédées. Voir [15 §1.3](15-vitesses-virtuelles-et-commandes.md) pour la compatibilité | — |
| Q13b | Possèdes-tu une manette de jeu, ou acceptes-tu le smartphone comme télécommande gratuite en attendant que le Zwift Click soit validé ? | Smartphone (télécommande web gratuite) + clavier | Phase 1 |
| Q13c | Quelle référence exacte pour les Di2 (ST-R8050 / ST-R8070, avec boutons cachés sur les cocottes) et as-tu une unité sans fil Shimano **EW-WU111** (D-Fly) ? | Pas d'EW-WU111 → Di2 non utilisable sans achat ; non prioritaire | Phase 2 |
| Q14 | ✅ Cassette ou pignon unique ? | **Réponse** : **Zwift Cog** (pignon unique). Les vitesses virtuelles deviennent **indispensables dès le MVP** (phase 1). Il faudra relever le nombre de dents du plateau utilisé et du Cog pour la stratégie réaliste | — |
| Q15 | Le nom « HomeRealTrainer » est-il définitif ? | Nom de travail | Phase 4 |
| Q16 | Monde virtuel en boucles : faut-il pouvoir changer de boucle en cours de sortie via des jonctions (sans s'arrêter) ? | Oui, mais plus tard (US-16, priorité « Could ») ; au MVP, la boucle est choisie avant le départ | Phase 2 |
| Q17 | En mode B, faut-il aussi privilégier les boucles (ex. proposer de fermer automatiquement un parcours ouvert par un retour) ? | Non : en fin de parcours, choix entre demi-tour, recommencer ou terminer, sans couper l'enregistrement | Phase 3 |
