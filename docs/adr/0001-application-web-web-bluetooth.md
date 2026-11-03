# ADR 0001 — Application web + Web Bluetooth

**Statut** : Accepté — 2026-11-02

## Contexte
Le projet est demandé sous forme d'**application web**. Le seul moyen de parler aux home trainers depuis une page web est l'API Web Bluetooth, disponible sur Chrome, Edge et les navigateurs Chromium (desktop et Android), mais **pas** sur Safari, Firefox ni sur iOS.

## Décision
- Application web (PWA) ciblant **Chrome et Edge desktop** en priorité.
- Web Bluetooth natif pour FTMS, CPS, HRS et CSCS.
- Toute la couche matériel passe par une interface `Device` / `ControllableTrainer`, pour pouvoir ajouter plus tard une implémentation native (Capacitor/Tauri) ou ANT+ via WebUSB sans toucher au reste.

## Conséquences
- (+) Aucune installation, déploiement instantané, un seul code.
- (−) Les utilisateurs iPhone/iPad et Safari sont exclus au départ (écran explicatif, Bluefy en best effort).
- (−) Un geste utilisateur est nécessaire pour chaque appairage initial.
- Une enveloppe native est envisagée en phase 6 si la demande mobile ou TV le justifie.
