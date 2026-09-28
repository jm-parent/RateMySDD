# Implementation Plan: Audit de spécification Markdown selon les 6 piliers

**Branch**: `001-markdown-spec-audit` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-markdown-spec-audit/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Application web **locale, mono-utilisateur** permettant à un auditeur connecté avec son compte
GitHub Copilot d'auditer un document Markdown (collé ou fichier `.md` unique ≤ 200 Ko) selon
les **6 piliers** fixes, avec pour chacun une note 0–100, une description et des points
d'amélioration, un **score global** (moyenne calculée par le serveur), la copie Markdown et le
**téléchargement d'un rapport `.md`**. Rien n'est conservé.

Approche technique (cf. [research.md](./research.md)) : serveur **Node.js 24 / TypeScript /
Fastify** lié à `127.0.0.1`, interface **React + Vite**, connexion par **OAuth Device Flow**
GitHub (jeton en mémoire serveur, cookie de session `HttpOnly`), analyse via le **GitHub
Copilot SDK** (`@github/copilot-sdk`) en mode isolé (sans outils, sans persistance de session),
sortie IA en **JSON validé par Zod** avec 1 nouvelle tentative, rapport généré dans le
navigateur.

## Technical Context

**Language/Version**: TypeScript 5.x sur Node.js 24 LTS (minimum 22.12, exigence du SDK Copilot)

**Primary Dependencies**: `@github/copilot-sdk` (≥ 1.0), Fastify 5 (+ `@fastify/cookie`,
`@fastify/static`), Zod, React 19, Vite

**Storage**: N/A — aucune persistance ; sessions et résultats en mémoire ; répertoire
temporaire du runtime Copilot purgé après chaque audit

**Testing**: Vitest (unit, contract via `fastify.inject()`, integration avec faux client
Copilot), Playwright (E2E), jeu de spécifications de référence pour validation manuelle

**Target Platform**: poste de l'auditeur (Windows en priorité, macOS/Linux compatibles),
navigateur de bureau récent (Edge/Chrome/Firefox)

**Project Type**: application web locale (serveur Node + SPA servie par le même processus)

**Performance Goals**: résultat < 60 s pour 95 % des documents < 50 Ko (SC-002) ; UI réactive
(retour de validation d'entrée < 200 ms)

**Constraints**: écoute `127.0.0.1` uniquement ; 1 audit à la fois ; document ≤ 204 800 octets ;
délai 50 s par tentative, 1 retry ; aucun contenu de document dans les logs ni sur disque ;
aucun outil exposé à l'IA

**Scale/Scope**: 1 utilisateur, 1 écran principal (connexion + audit + résultat), 5 routes API,
6 piliers fixes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe / règle | Exigence | Conformité du plan | Statut |
|------------------|----------|--------------------|--------|
| I. Audit pour l'utilisateur Copilot authentifié | Accès réservé aux utilisateurs authentifiés ; collage et `.md` ; résultat équivalent | Toutes les routes `/api/audits` exigent la session ; même pipeline serveur pour `paste` et `file` (le fichier est lu en texte dans le navigateur) | ✅ |
| II. Règle d'or des 6 piliers (NON NÉGOCIABLE) | 6 piliers, ordre fixe, aucun omis ; pilier absent présent avec note minimale ; sortie non conforme rejetée | Constante `PILLARS` partagée ; schéma [audit-output.schema.json](./contracts/audit-output.schema.json) (6 éléments, ids ordonnés) ; retry puis `AI_OUTPUT_INVALID` | ✅ |
| III. Format de sortie normalisé | Tableau Note / Description / Points d'amélioration ; échelle unique documentée ; sortie structurée, pas de parsing libre | JSON validé par Zod → tableau React ; barème 0–100 unique affiché et inclus au rapport | ✅ |
| IV. Authentification sécurisée | OAuth officiel ; moindre privilège ; jetons hors JS client/logs/URL ; expiration, déconnexion, anti-CSRF ; secrets hors code | Device Flow (pas de secret client), scope `read:user` ; jeton en mémoire serveur ; cookie `HttpOnly` + `SameSite=Strict` ; contrôle `Origin`/`Host` ; expiration 8 h ; `GITHUB_OAUTH_CLIENT_ID` via `.env` (non versionné) | ✅ |
| V. Confidentialité des données transmises à l'IA | Minimisation ; uniquement via Copilot de l'utilisateur, TLS ; pas de persistance ; pas de contenu dans les logs ; isolement ; information avant envoi | SDK avec jeton de l'auditeur (TLS géré par le runtime) ; `mode: "empty"`, `enableSessionStore: false`, répertoire temporaire purgé ; logger avec `redact` et sans corps ; mention d'information visible avant le bouton d'audit ; mono-utilisateur local | ✅ |
| Contraintes de traitement | Type/encodage/taille validés serveur ; rendu assaini ; document = donnée ; erreurs claires | Validation Zod serveur (FR-007) ; React sans `dangerouslySetInnerHTML` ; délimiteurs aléatoires + aucun outil ; codes d'erreur normalisés en français | ✅ |
| Barrières qualité | Tests : 6 piliers + 3 colonnes, rejet des sorties non conformes, routes protégées, aucun contenu dans les logs ; revue sécurité sur auth/jetons/envoi IA | Suites Vitest dédiées (cf. [quickstart.md](./quickstart.md)) ; revue sécurité prévue sur `src/server/auth/` et `src/server/audit/` | ✅ |

**Résultat (pré-recherche)** : PASS — aucune violation.
**Résultat (post-conception Phase 1)** : PASS — les contrats et le modèle de données
confirment chaque point ; aucune dérogation, section Complexity Tracking vide.

## Project Structure

### Documentation (this feature)

```text
specs/001-markdown-spec-audit/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── openapi.yaml
│   ├── audit-output.schema.json
│   └── report-format.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
package.json             # scripts: dev, build, start, test, test:e2e, lint, typecheck
tsconfig.json
vite.config.ts
.env.example             # GITHUB_OAUTH_CLIENT_ID, COPILOT_MODEL, PORT (aucun secret)

src/
├── shared/                      # code commun serveur + navigateur
│   ├── pillars.ts               # PILLARS (ids, libellés, questions directrices)
│   ├── scoring.ts               # bandFor(), computeGlobalScore()
│   ├── schemas.ts               # Zod : AuditRequest, AiAuditOutput, AuditResult, ApiError
│   └── report.ts                # renderReportMarkdown(), reportFileName()
├── server/
│   ├── index.ts                 # démarrage, écoute 127.0.0.1, purge du répertoire temporaire
│   ├── app.ts                   # construction Fastify (plugins, logger redacté, static)
│   ├── config.ts                # lecture/validation .env
│   ├── security/
│   │   └── origin-guard.ts      # contrôle Host/Origin
│   ├── auth/
│   │   ├── device-flow.ts       # appels GitHub Device Flow
│   │   ├── session-store.ts     # sessions en mémoire (jeton, identité, expiration)
│   │   └── routes.ts            # /api/session, /api/auth/*
│   └── audit/
│       ├── copilot-engine.ts    # AuditEngine basé sur @github/copilot-sdk (isolé)
│       ├── prompt.ts            # message système + délimiteurs aléatoires
│       ├── parse-output.ts      # extraction JSON + validation Zod
│       ├── audit-service.ts     # validation entrée, retry, score global, mapping erreurs
│       └── routes.ts            # POST /api/audits
└── web/
    ├── index.html
    ├── main.tsx
    ├── api.ts                   # client fetch typé
    ├── components/
    │   ├── LoginScreen.tsx      # Device Flow (code + lien)
    │   ├── UserBar.tsx          # identité + déconnexion
    │   ├── DocumentInput.tsx    # textarea + sélection/glisser-déposer .md
    │   ├── PrivacyNotice.tsx    # information avant envoi (FR-009)
    │   ├── AuditResultTable.tsx # score global + tableau 6 × 3
    │   ├── ScoreLegend.tsx      # barème
    │   └── ResultActions.tsx    # copier / télécharger
    └── styles.css

tests/
├── fixtures/specs/              # complete.md, missing-nfr.md, prompt-injection.md, ...
├── unit/                        # scoring, schemas, parse-output, prompt, report
├── contract/                    # routes vs contracts/openapi.yaml (fastify.inject)
├── integration/                 # audit-service + FakeAuditEngine, logs sans contenu
└── e2e/                         # Playwright
```

**Structure Decision**: projet unique (un `package.json`) car serveur et interface tournent dans
le même processus local et partagent les types et règles métier (`src/shared/`). Le serveur
sert le build Vite (`dist/web`) ; en développement, Vite proxifie `/api` vers Fastify.
L'accès à Copilot est isolé derrière l'interface `AuditEngine` pour permettre des tests
déterministes sans quota.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Aucune violation — section non applicable.
