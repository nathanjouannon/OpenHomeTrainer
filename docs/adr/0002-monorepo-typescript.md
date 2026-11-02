# ADR 0002 — Monorepo TypeScript

**Statut** : Accepté — 2026-11-02

## Contexte
Plusieurs briques partagent du code : la physique (client, puis contrôle anti-triche serveur), les types de route et les schémas d'API. Le développeur travaille seul au départ.

## Décision
Monorepo **pnpm workspaces + Turborepo**, TypeScript strict partout (front, back, outils). Packages purs séparés du rendu (voir [01-architecture](../01-architecture.md)).

## Conséquences
- (+) Partage de code et de types sans publication de paquets ; refactorings sûrs.
- (+) Tests rapides et ciblés par package (cache Turborepo).
- (−) Un peu de configuration initiale (tsconfig, références, lint des frontières).
