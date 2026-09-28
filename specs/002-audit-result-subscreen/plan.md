# Implementation Plan: Sous-écran dédié au résultat d’audit

**Branch**: `002-audit-result-subscreen` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Spécification de fonctionnalité dans `specs/002-audit-result-subscreen/spec.md`

## Summary

Remplacer le rendu actuellement intégré sous le formulaire par deux vues conditionnelles dans
le même onglet : saisie et résultat. Après une réponse d'audit valide, une vue de résultat
dédiée réutilise le tableau et les actions de copie/téléchargement existants. Un retour ou une
réouverture du résultat ne relance pas l'audit ; toute modification de la saisie invalide le
résultat associé.

Le document et le résultat restent dans l'état React volatile de l'application. À la perte de
session, l'interface est masquée ; une reconnexion avec la même identité reprend l'état en
mémoire, tandis qu'un changement de compte, une déconnexion ou un rechargement l'efface. Un
minuteur client calé sur l'échéance renvoyée par le serveur masque l'interface à l'expiration ;
un contrôle périodique non renouvelant et une vérification au retour de visibilité détectent
aussi une révocation. Le corps et le JSON de l'API d'audit, le traitement Copilot, le schéma du
résultat et l'export Markdown restent inchangés ; un en-tête d'expiration de session est ajouté
aux réponses concernées. Aucune télémétrie n'est ajoutée.

## Technical Context

**Language/Version**: TypeScript 5.9.x ; Node.js ≥ 22.12 (minimum du projet)

**Primary Dependencies**: React 19, Vite 7, Fastify 5, Zod 3 et `@github/copilot-sdk`
existants ; aucune nouvelle dépendance prévue

**Storage**: aucune persistance. L'état de navigation, le document et le résultat vivent dans
la mémoire React de `App`; les sessions d'authentification restent en mémoire serveur et les
artefacts temporaires Copilot conservent leur nettoyage existant.

**Testing**: Vitest pour les composants, transitions d'état et routes ; Playwright pour les
parcours complets, la navigation, l'accessibilité, la session et l'export

**Target Platform**: application locale dans un navigateur de bureau, servie par Fastify sur
`127.0.0.1`

**Project Type**: application web locale mono-utilisateur (SPA React et serveur Node/Fastify)

**Performance Goals**: les transitions saisie/résultat et le retour au résultat ne déclenchent
aucun nouvel audit ni requête `/api/audits` ; le contrôle d'état de session ne transmet aucun
contenu documentaire et ne prolonge pas l'expiration ; l'interface se verrouille à l'échéance
indiquée par le serveur

**Constraints**: conserver le compte Copilot authentifié, les six piliers dans l'ordre fixe,
la limite existante de 204 800 octets, le traitement d'un audit à la fois et l'absence de
stockage persistant ; les écrans ne sont jamais rendus simultanément ; les lectures de statut
ne renouvellent pas la session

**Scale/Scope**: un auditeur local, un document courant et un résultat courant ; ajout d'un
écran de résultat et d'une navigation en mémoire, avec un en-tête d'expiration de session
additif, sans partage, historique, export JSON ni instrumentation métier dans l'application

**Inconnues**: aucune inconnue technique ou dépendance nouvelle ne reste à clarifier.

## Constitution Check

*GATE: vérifié avant la recherche Phase 0 et après la conception Phase 1.*

| Principe / règle | Décision de conception | Pré-Phase 0 | Post-Phase 1 |
|------------------|------------------------|-------------|--------------|
| I. Audit pour l'utilisateur Copilot authentifié | Réutiliser l'entrée Markdown et le compte Copilot courant ; l'écran de résultat reste protégé par la session. | PASS | PASS |
| II. Règle d'or des 6 piliers | Réutiliser `AuditResultSchema`, `AuditResultTable` et les titres canoniques ; aucun pilier ni ordre ne change. | PASS | PASS |
| III. Format de sortie normalisé | Réutiliser le JSON validé, le tableau et `ResultActions` ; navigation sans parsing ni recalcul du score. | PASS | PASS |
| IV. Authentification sécurisée | Ne pas exposer de jeton ni toucher au flux OAuth ; masquer les vues à l'échéance serveur, préserver en mémoire uniquement pour la même identité et effacer lors d'un changement de compte ou d'une déconnexion. | PASS | PASS |
| V. Confidentialité | Le document et le résultat restent uniquement en mémoire volatile pour la consultation active, puis sont effacés aux limites prévues ; aucun stockage durable, historique, journal de contenu ou télémétrie. Le contrôle de session ne renouvelle pas artificiellement le délai d'inactivité. | PASS | PASS |
| Contraintes de traitement | Conserver validation `.md`, UTF-8, taille, échappement React et messages d'erreur existants. | PASS | PASS |
| Barrières qualité | Ajouter des tests de vues, de transitions, de session et d'accessibilité ; effectuer une revue de sécurité ciblée sur l'accès au résultat et l'état après expiration. | PASS | PASS |

**Résultat (pré-recherche)** : PASS — la solution reste dans la SPA existante, sans
persistance ni contournement de l'authentification.

**Résultat (post-conception Phase 1)** : PASS — les contrats et le modèle de données
confirment l'isolement des vues, la liaison du résultat au document, le verrouillage à
l'échéance serveur et la reprise limitée à la même identité ; aucune dérogation à la
constitution n'est nécessaire.

## Project Structure

### Documentation (this feature)

```text
specs/002-audit-result-subscreen/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── result-screen.md
└── tasks.md              # produit par /speckit-tasks, pas par ce plan
```

### Source Code (repository root)

```text
src/
├── server/
│   └── auth/
│       ├── require-auth.ts            # publie l'échéance après renouvellement d'une session protégée
│       └── routes.ts                 # session, Device Flow et échéance non renouvelante
└── web/
    ├── App.tsx                       # état temporaire, identité propriétaire, minuteur d'expiration
    ├── api.ts                        # traite l'en-tête d'échéance et les réponses 401
    ├── components/
    │   ├── AuditPage.tsx             # saisie et transitions de vue
    │   ├── AuditResultScreen.tsx     # nouveau conteneur de la vue résultat
    │   ├── AuditResultTable.tsx      # réutilisé sans changement de contrat
    │   └── ResultActions.tsx         # copie/téléchargement réutilisés
    └── styles.css                   # présentation responsive des deux vues

tests/
├── unit/
│   └── audit-components.test.ts      # composants et contrat de rendu
├── integration/
│   └── auth-flow.test.ts             # expiration et lecture de session
└── e2e/
    ├── paste-audit.spec.ts
    ├── file-audit.spec.ts
    ├── report-download.spec.ts
    └── accessibility.spec.ts
```

Le contrat HTTP existant `specs/001-markdown-spec-audit/contracts/openapi.yaml` est mis à
jour pour documenter l'en-tête d'expiration ; le corps de l'audit et le JSON de son résultat
ne changent pas.

**Structure Decision**: conserver le projet unique et ses limites actuelles. `App` conserve
l'état de navigation au-dessus des écrans d'authentification pour permettre une reprise
éphémère ; `AuditPage` affiche conditionnellement la saisie ou un nouveau composant
`AuditResultScreen`. Ce dernier réutilise le tableau, le barème et les actions existants.
L'API d'audit et les schémas partagés gardent leurs corps de requête et de réponse actuels.
Les réponses authentifiées, y compris le Device Flow réussi et `POST /api/audits`, exposent
`X-Session-Expires-At` (date RFC 3339) ; le client programme son verrouillage à cette échéance.
La route `GET /api/session` retourne aussi ce repère sans renouveler le délai d'inactivité,
et est contrôlée à un intervalle maximal de 60 secondes ainsi qu'au retour de visibilité
pour détecter une révocation. Les routes protégées continuent à renouveler la session lors
d'une action authentifiée.

## Complexity Tracking

Aucune violation de la constitution — aucune complexité supplémentaire à justifier.
