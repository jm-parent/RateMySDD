# Diagnostic administrateur du runtime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un administrateur d’inspecter de façon sûre la configuration du runtime Vercel et les erreurs récentes, même quand le démarrage du serveur échoue.

**Architecture:** Un module serveur fournit l’inspection expurgée de l’environnement, l’authentification administrateur et un tampon d’événements borné. Le handler Vercel intercepte `/api/diagnostics` avant le démarrage normal et transforme les échecs de démarrage en erreurs JSON corrélées; Fastify enregistre également les erreurs 5xx. Un panneau sur l’écran de connexion présente ces données après saisie du code.

**Tech Stack:** TypeScript, Node.js `crypto`, Fastify 5, React 19, Zod, Vitest, Playwright, Vercel Functions; aucune nouvelle dépendance.

## Global Constraints

- Les valeurs de secrets ne sont jamais retournées, affichées, persistées ou écrites dans les logs.
- L’accès de diagnostic est protégé par `DIAGNOSTICS_TOKEN` et désactivé lorsque cette variable est absente.
- Les événements sont expurgés, conservés en mémoire uniquement et limités aux 20 plus récents de l’instance courante.
- Les journaux affichés ne prétendent pas remplacer l’historique complet de Vercel et ne sont pas partagés entre instances.
- Les réponses du diagnostic utilisent `Cache-Control: no-store`; les échecs serveur portent un identifiant `X-Diagnostic-Id`.
- Aucun document, rapport d’audit, cookie ou en-tête d’autorisation n’est ajouté au diagnostic.
- Ne pas créer de commit sans demande explicite.

---

## File Map

| Fichier                                                | Responsabilité                                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/schemas.ts`                                | Contrat Zod strict du snapshot, des contrôles d’environnement, des événements et des identifiants d’erreur.                        |
| `specs/001-markdown-spec-audit/contracts/openapi.yaml` | Documenter la route protégée, le snapshot expurgé et l’identifiant corrélé.                                                        |
| `src/server/diagnostics.ts`                            | Inspection sûre de l’environnement, comparaison du code admin, identifiants et tampon mémoire borné des événements.                |
| `src/server/config.ts`                                 | Réutiliser les validations d’origine, Redis, OAuth et clé de chiffrement pour exposer leur statut sans leurs valeurs secrètes.     |
| `api/[...path].ts`                                     | Intercepter le diagnostic avant `getRuntime`, gérer l’état du runtime, corréler les requêtes et capturer les erreurs de démarrage. |
| `src/server/app.ts`                                    | Servir le diagnostic en local, propager l’identifiant et enregistrer les erreurs HTTP 5xx sans le corps de requête.                |
| `src/web/api.ts`                                       | Envoyer le code admin en Bearer et valider le snapshot reçu.                                                                       |
| `src/web/components/LoginScreen.tsx`                   | Ajouter le panneau diagnostic accessible avant connexion, avec états de chargement, refus et résultat.                             |
| `src/web/styles.css`                                   | Présenter les états du panneau sans débordement sur mobile.                                                                        |
| `tests/unit/config.test.ts`                            | Couvrir les statuts de configuration et l’absence de valeurs sensibles.                                                            |
| `tests/unit/diagnostics.test.ts`                       | Couvrir la comparaison du jeton, l’expurgation et la limite du tampon.                                                             |
| `tests/unit/schemas.test.ts`                           | Couvrir le contrat Zod strict du diagnostic et l’identifiant d’erreur facultatif.                                                  |
| `tests/contract/auth.contract.test.ts`                 | Vérifier que l’OpenAPI accepte le snapshot et les IDs et documente le Bearer admin.                                                |
| `tests/integration/vercel-api-function.test.ts`        | Couvrir l’accès pré-runtime, l’échec d’initialisation et l’identifiant corrélé.                                                    |
| `tests/integration/vercel-cold-start.test.ts`          | Vérifier que le diagnostic répond même si le module serveur/Copilot échoue à l’import.                                             |
| `tests/integration/server-lifecycle.test.ts`           | Couvrir la capture d’une erreur 5xx Fastify avec le même identifiant.                                                              |
| `tests/unit/auth-components.test.ts`                   | Couvrir le rendu accessible du bouton et du panneau initial.                                                                       |
| `tests/e2e/admin-diagnostics.spec.ts`                  | Couvrir la saisie du code, le chargement du snapshot et les erreurs UI.                                                            |
| `README.md`                                            | Documenter la création et le périmètre de `DIAGNOSTICS_TOKEN`, ainsi que les limites mémoire.                                      |

## Task 1: Define the diagnostic contract and safe runtime store

**Files:**

- Modify: `src/shared/schemas.ts`
- Modify: `specs/001-markdown-spec-audit/contracts/openapi.yaml`
- Modify: `tests/contract/auth.contract.test.ts`
- Modify: `tests/unit/schemas.test.ts`
- Modify: `src/server/config.ts`
- Modify: `tests/unit/config.test.ts`
- Create: `src/server/diagnostics.ts`
- Create: `tests/unit/diagnostics.test.ts`

**Interfaces:**

- `DiagnosticSnapshotSchema` contient `runtime: 'not_started' | 'starting' | 'ready' | 'failed'`, un tableau de contrôles et un tableau d’événements.
- Un contrôle contient `key`, `status: 'valid' | 'missing' | 'invalid' | 'optional'` et un `value` facultatif réservé aux informations non sensibles.
- Un événement contient `timestamp`, `requestId`, `source: 'startup' | 'request'`, `errorType` et `message` expurgé.
- `inspectEnvironment(env)` retourne les contrôles sans renvoyer `GITHUB_OAUTH_CLIENT_ID`, `UPSTASH_REDIS_REST_TOKEN`, `SESSION_ENCRYPTION_KEY` ni `DIAGNOSTICS_TOKEN`.
- `isDiagnosticsAuthorized(candidate, configured)` compare les chaînes en temps constant et retourne `false` si l’une manque ou si leur longueur diffère.
- `recordDiagnosticEvent(event)` et `getDiagnosticEvents()` gèrent au plus les 20 événements les plus récents.

- [ ] **Step 1: Écrire les tests rouges du contrat et de l’inspection.** Dans `tests/unit/config.test.ts`, fournir des valeurs distinctes pour les secrets et vérifier qu’aucune ne figure dans le snapshot; vérifier aussi les cas Redis/token/clé valides, manquants et invalides et l’origine effective sûre. Dans `tests/unit/schemas.test.ts`, vérifier qu’un snapshot valide est accepté, qu’un secret en propriété supplémentaire est rejeté et qu’un `diagnosticId` optionnel est accepté dans `ApiErrorSchema`. Dans `tests/contract/auth.contract.test.ts`, vérifier le snapshot via Ajv, l’ID optionnel et la sécurité Bearer de la route.
- [ ] **Step 2: Exécuter les tests ciblés et confirmer les échecs attendus.**

Run: `rtk npm test -- tests/unit/config.test.ts tests/unit/schemas.test.ts`

Expected: FAIL uniquement parce que le contrat et l’inspection diagnostique ne sont pas encore implémentés.

- [ ] **Step 3: Écrire les tests rouges du module de diagnostic.** Vérifier que le jeton exact est autorisé, qu’un jeton différent ou absent est refusé, qu’un message d’erreur ne contient pas les valeurs fournies dans les variables secrètes et que 25 événements n’en conservent que 20 dans l’ordre chronologique.
- [ ] **Step 4: Exécuter le test ciblé avant l’implémentation.**

Run: `rtk npm test -- tests/unit/diagnostics.test.ts`

Expected: FAIL parce que les exports `inspectEnvironment`, `isDiagnosticsAuthorized`, `recordDiagnosticEvent` et `getDiagnosticEvents` ne sont pas encore disponibles.

- [ ] **Step 5: Ajouter les schémas stricts partagés, OpenAPI et l’inspection pure de l’environnement.** N’inclure que les valeurs non sensibles `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` et l’hôte de l’origine effective. Déclarer le Bearer `diagnosticsToken`, les champs du snapshot et l’ID d’erreur optionnel dans `ApiError`. Ne jamais inclure les valeurs OAuth, Redis token, clé de chiffrement ou jeton diagnostic.
- [ ] **Step 6: Implémenter le module serveur.** Utiliser `timingSafeEqual` après vérification d’égalité des longueurs; borner le tampon à 20; limiter les messages détaillés à `ConfigurationError` connu et remplacer les messages d’erreur non reconnus par une description générique et leur type. Ne journaliser ni stack, ni requête, ni valeur d’environnement.
- [ ] **Step 7: Rejouer les trois fichiers de tests ciblés.**

Run: `rtk npm test -- tests/unit/config.test.ts tests/unit/schemas.test.ts tests/unit/diagnostics.test.ts`

Expected: PASS; aucun secret d’entrée ne figure dans le snapshot ou les événements.

## Task 2: Make Vercel diagnostics available before runtime startup

**Files:**

- Modify: `api/[...path].ts`
- Modify: `src/shared/schemas.ts`
- Modify: `tests/integration/vercel-api-function.test.ts`
- Create: `tests/integration/vercel-cold-start.test.ts`

**Interfaces:**

- `GET /api/diagnostics` est traité avant tout appel à `loadConfig()` ou `createServerRuntime()`.
- Le Bearer attendu est lu directement depuis `process.env.DIAGNOSTICS_TOKEN`; le jeton n’est jamais ajouté à un log.
- Une requête valide reçoit un `DiagnosticSnapshotSchema` et `Cache-Control: no-store`.
- Une requête non autorisée reçoit une réponse générique sans snapshot.
- Un échec d’initialisation d’une route ordinaire reçoit un HTTP 500 JSON conforme à `ApiErrorSchema`, un `diagnosticId` et l’en-tête `X-Diagnostic-Id`.

- [ ] **Step 1: Ajouter les tests d’intégration rouges.** Dans `vercel-api-function.test.ts`, tester le diagnostic autorisé sans résolution de `createServerRuntime`, l’absence et l’invalidité du Bearer sans snapshot, puis simuler un rejet de `createServerRuntime` sur `/api/session` et vérifier le 500 structuré, l’identifiant d’événement et l’en-tête `X-Diagnostic-Id`. Dans `vercel-cold-start.test.ts`, faire échouer le chargement du module serveur et vérifier que le diagnostic reste joignable.
- [ ] **Step 2: Exécuter le test Vercel et confirmer ces échecs.**

Run: `rtk npm test -- tests/integration/vercel-api-function.test.ts`

Expected: FAIL sur le routage diagnostic absent et l’erreur de démarrage actuellement propagée sans réponse normalisée.

- [ ] **Step 3: Intercepter le chemin diagnostic avant `getRuntime()` et charger le runtime dynamiquement.** Ne pas importer statiquement `src/server/index.ts`; faire `await import('../src/server/index.js')` uniquement depuis `getRuntime()`. Comparer le Bearer au secret configuré; renvoyer le snapshot uniquement en cas de succès, avec `Cache-Control: no-store`. Retourner la même réponse générique pour jeton absent ou incorrect.
- [ ] **Step 4: Suivre l’état du runtime et corréler les erreurs de démarrage.** Générer un UUID par requête, le définir dans `X-Diagnostic-Id` et remplacer l’en-tête entrant `x-diagnostic-id` avant le dispatch Fastify. Conserver l’état `starting`/`ready`/`failed`, enregistrer l’échec expurgé et écrire un événement JSON expurgé sur stderr; renvoyer `{ code: 'INTERNAL_ERROR', message, diagnosticId }` au lieu de laisser la fonction rejeter la promesse.
- [ ] **Step 5: Rejouer le test d’intégration Vercel.**

Run: `rtk npm test -- tests/integration/vercel-api-function.test.ts`

Expected: PASS; le diagnostic reste joignable après un échec simulé du runtime et le chemin normal continue de router les requêtes.

## Task 3: Correlate Fastify 5xx errors

**Files:**

- Modify: `src/server/app.ts`
- Modify: `tests/integration/server-lifecycle.test.ts`
- Modify: `src/shared/schemas.ts`

**Interfaces:**

- Fastify utilise `x-diagnostic-id` comme identifiant de requête quand le handler Vercel l’a fourni.
- Fastify expose aussi `GET /api/diagnostics` pour permettre au panneau de fonctionner en local.
- Pour les erreurs 5xx, l’error handler enregistre un événement expurgé et renvoie `X-Diagnostic-Id` ainsi que le champ `diagnosticId` dans l’API error.
- Les erreurs métier 4xx et les réponses de succès ne sont pas enregistrées comme erreurs diagnostiques.

- [ ] **Step 1: Ajouter les tests rouges du serveur local.** Vérifier que `GET /api/diagnostics` refuse un code absent, accepte le code correct, renvoie `Cache-Control: no-store` et n’expose aucune valeur secrète. Monter aussi un endpoint de test qui lève une erreur interne; injecter une requête avec `x-diagnostic-id: diagnostic-test-id`; vérifier le 500 générique, l’en-tête et le champ JSON portant le même ID, et un événement sans message secret.
- [ ] **Step 2: Exécuter le test serveur ciblé.**

Run: `rtk npm test -- tests/integration/server-lifecycle.test.ts`

Expected: FAIL parce que l’erreur 5xx ne porte actuellement aucun identifiant ni événement de diagnostic.

- [ ] **Step 3: Ajouter la route locale et l’enregistrement au handler d’erreur.** Réutiliser le snapshot partagé, appliquer le contrôle Bearer et `Cache-Control: no-store`; ajouter l’ID à la réponse uniquement pour les statuts 5xx; enregistrer les erreurs avec `request.id` et une description sûre; émettre un événement structuré via `request.log.error` avec ce même ID; ne pas passer le body ou les headers au journal.
- [ ] **Step 4: Rejouer le test serveur et les tests d’erreurs.**

Run: `rtk npm test -- tests/integration/server-lifecycle.test.ts tests/unit/errors.test.ts`

Expected: PASS; les erreurs 4xx gardent leur contrat existant et chaque 5xx testé est corrélable.

## Task 4: Add the protected diagnostic panel to sign-in

**Files:**

- Modify: `src/web/api.ts`
- Modify: `src/web/components/LoginScreen.tsx`
- Modify: `src/web/styles.css`
- Modify: `tests/unit/auth-components.test.ts`
- Create: `tests/e2e/admin-diagnostics.spec.ts`

**Interfaces:**

- `LoginScreen` conserve sa prop `onAuthenticated` et expose une commande « Diagnostic administrateur ».
- Le code saisi reste dans l’état React local, envoyé avec `Authorization: Bearer ...`, puis effacé à la fermeture du panneau.
- Le snapshot est validé avec `DiagnosticSnapshotSchema` avant rendu.
- Les événements et états d’environnement sont rendus avec noms, statuts, dates et IDs; aucune valeur secrète n’est affichée.

- [ ] **Step 1: Ajouter des assertions de rendu et les scénarios navigateur rouges.** Vérifier le bouton accessible et le formulaire à l’écran de connexion. Dans le test Playwright, simuler `/api/session` en erreur, fournir un code de test, intercepter `/api/diagnostics`, vérifier l’en-tête Bearer, puis retourner un snapshot sans secret; ajouter aussi les cas code incorrect et endpoint désactivé.
- [ ] **Step 2: Exécuter les tests UI ciblés et confirmer l’absence du panneau.**

Run: `rtk npm test -- tests/unit/auth-components.test.ts`

Run: `rtk npm run test:e2e -- tests/e2e/admin-diagnostics.spec.ts`

Expected: FAIL sur le bouton et le flux de diagnostic absents; le serveur de test et Playwright doivent démarrer normalement.

- [ ] **Step 3: Ajouter la fonction API typée pour le Bearer diagnostic.** Réutiliser les options de headers de `request()` et valider la réponse avec le schéma partagé.
- [ ] **Step 4: Construire le panneau accessible.** Ajouter le bouton, un champ `type="password"`, un bouton de vérification, des messages accessibles de chargement/erreur, la liste des contrôles et l’état runtime/events. Ne jamais stocker le code dans `localStorage`, `sessionStorage` ou un état global.
- [ ] **Step 5: Ajouter le style responsive minimal.** Garder les contrôles lisibles à 320 px, faire revenir à la ligne les messages et IDs, et distinguer visuellement les statuts valides, manquants et invalides.
- [ ] **Step 6: Rejouer les tests unitaires et Playwright du panneau.**

Run: `rtk npm test -- tests/unit/auth-components.test.ts tests/unit/schemas.test.ts`

Run: `rtk npm run test:e2e -- tests/e2e/admin-diagnostics.spec.ts`

Expected: PASS pour le rendu, le flux autorisé, le refus d’accès et les états d’erreur.

## Task 5: Document configuration and run final gates

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Documenter `DIAGNOSTICS_TOKEN` pour Production.** Expliquer qu’il s’agit d’une valeur secrète, recommander un token aléatoire d’au moins 32 octets, dire que l’absence désactive le panneau et décrire le tampon volatile limité à l’instance chaude.
- [ ] **Step 2: Exécuter les tests serveur, les schémas et l’interface concernés.**

Run: `rtk npm test -- tests/unit/config.test.ts tests/unit/diagnostics.test.ts tests/unit/schemas.test.ts tests/unit/auth-components.test.ts tests/integration/vercel-api-function.test.ts tests/integration/server-lifecycle.test.ts`

Run: `rtk npm run test:e2e -- tests/e2e/admin-diagnostics.spec.ts`

Expected: toutes les commandes passent sans valeur de secret dans les sorties.

- [ ] **Step 3: Exécuter les portes globales.**

Run: `rtk npm run typecheck`

Run: `rtk npm run lint`

Run: `rtk npm run build`

Expected: exit code 0 pour chaque commande.

- [ ] **Step 4: Contrôler le patch final.**

Run: `rtk git diff --check`

Expected: aucune erreur de whitespace; aucun commit n’est créé.
