# Phase 1 — Data Model : Audit de spécification Markdown

**Feature**: `001-markdown-spec-audit` | **Date**: 2026-09-24

Aucune donnée n'est persistée (FR-024). Toutes les entités vivent **en mémoire** : côté
serveur pendant le traitement (et la session pour l'auditeur), côté navigateur pendant
l'affichage. Les types sont définis une seule fois dans `src/shared/` (schémas Zod) et
partagés entre serveur et interface.

## Pillar (référentiel immuable)

| Champ | Type | Règles |
|-------|------|--------|
| `id` | `"01"` … `"06"` | unique, ordre fixe |
| `title` | string | libellé canonique (ci-dessous) |
| `guidingQuestions` | string[] | questions directrices (spec FR-011) |

| id | title |
|----|-------|
| 01 | Contexte & Objectif |
| 02 | Périmètre |
| 03 | Besoins Fonctionnels |
| 04 | Données & Intégrations |
| 05 | Critères d'Acceptation |
| 06 | Exigences Non Fonctionnelles |

Constante `PILLARS` dans `src/shared/pillars.ts` ; utilisée par le prompt, la validation, le
rendu et le rapport.

## ScoreBand (barème, FR-012)

| min | max | label |
|-----|-----|-------|
| 0 | 0 | absent |
| 1 | 24 | très insuffisant |
| 25 | 49 | insuffisant |
| 50 | 69 | acceptable |
| 70 | 89 | bon |
| 90 | 100 | excellent |

Fonction `bandFor(score)` → label ; affichée à côté de chaque note et dans le rapport.

## Auditor (session serveur, en mémoire)

| Champ | Type | Règles |
|-------|------|--------|
| `sessionId` | string (≥ 128 bits aléatoires) | opaque, uniquement dans le cookie `HttpOnly` |
| `login` | string | issu de `GET /user` |
| `name` | string \| null | idem |
| `avatarUrl` | string (URL) \| null | idem |
| `copilotAccess` | `"active"` \| `"none"` | vérifié à la connexion (FR-002) |
| `accessToken` | string | **jamais** renvoyé au client ni journalisé |
| `expiresAt` | Date | expiration d'inactivité : 8 h |
| `auditInProgress` | boolean | empêche la double soumission (FR-016) |

**État** : `anonymous → pending_device_authorization → authenticated(copilotAccess) → logged_out`.
Un seul auditeur à la fois (application locale mono-utilisateur, FR-026).

## DeviceAuthorization (transitoire)

| Champ | Type | Règles |
|-------|------|--------|
| `deviceCode` | string | serveur uniquement |
| `userCode` | string | affiché à l'auditeur |
| `verificationUri` | URL | `https://github.com/login/device` |
| `interval` | int (s) | respecté lors du polling (augmenté si `slow_down`) |
| `expiresAt` | Date | au-delà → statut `expired` |

## SubmittedDocument (requête d'audit, éphémère)

| Champ | Type | Règles de validation |
|-------|------|----------------------|
| `content` | string | non vide après `trim()` (FR-008) ; ≤ 204 800 octets en UTF-8 ; pas d'octet nul ni de caractère de contrôle hors `\t \n \r` (FR-007) |
| `source` | `"paste"` \| `"file"` | obligatoire |
| `fileName` | string \| null | requis si `source = "file"` ; doit finir par `.md` (insensible à la casse) ; ≤ 255 caractères |

Jamais écrit sur disque ni journalisé ; seule sa taille en octets est journalisée.

## PillarEvaluation (ligne du tableau)

| Champ | Type | Règles |
|-------|------|--------|
| `pillarId` | `"01"` … `"06"` | correspond à `PILLARS[i].id`, dans l'ordre |
| `score` | int 0–100 | entier ; `0` si le pilier est absent (FR-013) |
| `summary` | string[] | 1 à 3 points concis, chacun non vide et ≤ 180 caractères |
| `description` | string | constat complet, non vide, ≤ 2 000 caractères ; affiché dans la fenêtre de détail et conservé dans le rapport |
| `improvements` | string[] | ≥ 1 élément, chacun non vide ; si rien à améliorer, un unique élément explicite (FR-019) |

## AuditResult (réponse d'audit, éphémère)

| Champ | Type | Règles |
|-------|------|--------|
| `auditedAt` | ISO 8601 | horodatage serveur |
| `documentName` | string | `fileName` sans extension, ou `"Texte collé"` |
| `source` | `"paste"` \| `"file"` | reprise de la requête |
| `globalScore` | int 0–100 | **calculé par le serveur** : `Math.round(moyenne des 6 scores)` (FR-017a) |
| `pillars` | PillarEvaluation[6] | exactement 6, ordre `01`→`06` |
| `model` | string | modèle Copilot utilisé (information) |

Relations : `AuditResult 1 — 6 PillarEvaluation`, `PillarEvaluation * — 1 Pillar`.

## AiAuditOutput (sortie brute attendue de l'IA)

Sous-ensemble de `AuditResult` produit par l'IA : `{ pillars: PillarEvaluation[6] }`, avec un résumé distinct du constat complet.
Schéma normatif : [contracts/audit-output.schema.json](./contracts/audit-output.schema.json).
Toute sortie non conforme → 1 nouvelle tentative, puis erreur `AI_OUTPUT_INVALID` (FR-015).

## AuditReport (fichier téléchargé, généré dans le navigateur)

Rendu Markdown de `AuditResult` + barème ; format et nom de fichier normatifs :
[contracts/report-format.md](./contracts/report-format.md).

## ApiError

| Champ | Type | Règles |
|-------|------|--------|
| `code` | enum (cf. [contracts/openapi.yaml](./contracts/openapi.yaml)) | stable, testable |
| `message` | string (fr) | compréhensible, sans détail interne (FR-023) |
