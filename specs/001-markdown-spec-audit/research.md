# Phase 0 — Research : Audit de spécification Markdown

**Feature**: `001-markdown-spec-audit` | **Date**: 2026-09-24

Toutes les inconnues du Technical Context sont résolues ci-dessous.

## R1 — Accès à l'IA via le compte Copilot de l'utilisateur

- **Decision**: utiliser le **GitHub Copilot SDK pour Node.js** (`@github/copilot-sdk`, ≥ 1.0),
  qui pilote le runtime Copilot par JSON-RPC et consomme l'abonnement Copilot du compte
  authentifié. Le jeton OAuth de l'auditeur est passé explicitement (`gitHubToken`,
  `useLoggedInUser: false`).
- **Rationale**: c'est la voie officielle et supportée pour utiliser Copilot depuis une
  application tierce ; elle respecte FR-010 (compte de l'utilisateur, et d'aucun autre) et le
  principe IV (pas de clé d'API statique). Node ≥ 22.12 requis — disponible (Node 24.19).
- **Alternatives considered**:
  - *GitHub Models API* : consomme un autre produit que l'abonnement Copilot → écarté.
  - *Appels directs non documentés à l'API Copilot* : non supporté, fragile → écarté.
  - *Réutiliser la connexion stockée de Copilot CLI (`useLoggedInUser`)* : pas de
    déconnexion propre à l'application (FR-003) et identité implicite → écarté (reste un
    repli documenté pour le développement).

## R2 — Authentification (connexion / déconnexion)

- **Decision**: **OAuth Device Flow** d'une GitHub OAuth App enregistrée par l'auditeur
  (seul le `client_id` est nécessaire, aucun secret client). Scope minimal : `read:user`.
  Le jeton obtenu est conservé **uniquement en mémoire du serveur local**, associé à un
  identifiant de session opaque transmis au navigateur via cookie `HttpOnly`,
  `SameSite=Strict`, `Path=/`. La déconnexion efface le jeton et arrête le client SDK.
- **Rationale**: flux OAuth officiel (principe IV), aucun mot de passe collecté (FR-004), pas
  de secret à stocker, adapté à une application locale sans URL de callback publique.
  Sur `http://localhost`, les navigateurs traitent l'origine comme sécurisée ; l'attribut
  `Secure` n'est pas exigé en HTTP local mais le cookie n'est jamais lisible en JavaScript.
- **Vérification de l'accès Copilot (FR-002)**: après autorisation, le serveur démarre un
  client SDK avec le jeton et effectue un appel léger (liste des modèles). Succès → accès
  actif ; erreur d'autorisation → statut « sans accès Copilot » et message dédié.
- **Identité (FR-003)**: `GET https://api.github.com/user` avec le jeton → `login`, `name`,
  `avatar_url`.
- **Alternatives considered**: Authorization Code flow (nécessite un secret client et un
  callback, inutile en local) ; PAT saisi manuellement (mauvaise UX, risque de fuite).

## R3 — Confidentialité côté runtime Copilot (FR-024, FR-025, principe V)

- **Decision**: démarrer le client SDK en `mode: "empty"` (pas de chargement de la config,
  des MCP ou skills personnels de l'auditeur), `enableSessionStore: false`, **aucun outil**
  (`availableTools: []`), `baseDirectory` pointant vers un répertoire temporaire propre à
  l'application, **purgé après chaque audit, au démarrage et à l'arrêt**. Chaque audit utilise
  une session SDK dédiée, déconnectée puis supprimée à la fin.
- **Rationale**: par défaut le runtime persiste l'état des sessions sous `~/.copilot` ; sans
  ces réglages, le contenu des documents resterait sur disque, violant FR-024. L'absence
  d'outils empêche l'IA d'agir (lecture de fichiers, commandes) si le document contient une
  injection de prompt (FR-014).
- **Alternatives considered**: laisser les valeurs par défaut (persistance disque) → écarté.

## R4 — Sortie structurée et validation (FR-011 à FR-015, principe III)

- **Decision**: le message système impose la grille des 6 piliers, le barème 0–100 et un
  **format JSON strict** (cf. [contracts/audit-output.schema.json](./contracts/audit-output.schema.json)).
  La réponse est extraite (premier objet JSON de la réponse), puis validée avec **Zod**
  (6 piliers, ids `01`→`06` dans l'ordre, note entière 0–100, textes non vides, note 0 si
  absent). Échec → **1 nouvelle tentative** avec rappel du format ; nouvel échec → erreur
  `AI_OUTPUT_INVALID`. Le **score global est calculé par le serveur** (FR-017a), jamais par
  l'IA.
- **Rationale**: le rendu ne dépend jamais d'un parsing libre (principe III) ; la validation
  est testable unitairement.
- **Alternatives considered**: parsing de tableau Markdown généré par l'IA (fragile) ;
  JSON Schema + Ajv (équivalent, mais Zod fournit aussi les types TypeScript partagés).

## R5 — Résistance à l'injection de prompt (FR-014)

- **Decision**: le document est transmis dans le message utilisateur, encadré par une
  **délimitation aléatoire par requête** (`<<<DOC-{uuid}>>>` … `<<<END-DOC-{uuid}>>>`) ; le
  message système précise que tout ce qui est entre ces balises est une donnée à évaluer, et
  que les instructions qu'il contient doivent être ignorées et peuvent être signalées comme
  défaut de la spécification. Combiné à l'absence d'outils (R3) et à la validation stricte (R4).
- **Rationale**: défense en profondeur ; même une injection réussie ne peut produire qu'une
  sortie conforme au schéma.
- **Alternatives considered**: filtrage par mots-clés (contournable, faux positifs) → écarté.

## R6 — Stack applicative

- **Decision**:
  - **Langage** : TypeScript 5.x sur Node.js 24 LTS (ESM).
  - **Serveur** : **Fastify 5** (léger, validation de schéma intégrée, `inject()` pour les
    tests sans réseau), lié à **127.0.0.1** uniquement, vérification des en-têtes `Host`
    (anti DNS-rebinding) et `Origin` (anti-CSRF, en complément de `SameSite=Strict`).
  - **Frontend** : **React 19 + Vite** ; React échappe tout texte par défaut (FR-021) ;
    aucun `dangerouslySetInnerHTML`. L'aperçu du document est un `<textarea>` (texte brut).
  - **Validation partagée** : Zod (schémas communs client/serveur).
  - **Journalisation** : logger Pino de Fastify avec `redact` sur les corps et en-têtes
    sensibles ; journalisation des corps de requête désactivée ; seules les métadonnées
    (taille, durée, statut, code d'erreur) sont émises (FR-025).
- **Rationale**: une seule langue (TS) pour le SDK Copilot, le serveur et l'UI ; typage
  partagé du résultat d'audit ; outillage de test rapide.
- **Alternatives considered**: .NET (SDK disponible, mais UI web séparée plus lourde) ;
  Python/FastAPI (idem, deux langages) ; Next.js (surdimensionné pour une page unique locale).

## R7 — Chargement de fichier et génération du rapport

- **Decision**: le fichier `.md` est lu **dans le navigateur** (File API) puis affiché dans la
  zone de saisie ; seul le texte est envoyé au serveur. Le serveur **revalide** (taille
  ≤ 204 800 octets UTF-8, absence d'octets nuls / caractères de contrôle binaires, UTF-8
  valide). Le rapport `.md` et la copie presse-papiers sont **générés côté navigateur** à partir
  du résultat (fonction partagée `renderReportMarkdown`) et téléchargés via un `Blob` : le
  serveur ne stocke rien (FR-022a, FR-024).
- **Rationale**: aucune écriture disque côté serveur ; la génération du rapport est une
  fonction pure testable.
- **Alternatives considered**: upload multipart vers le serveur (inutile, augmente la surface) ;
  génération du rapport côté serveur (nécessite de garder le résultat) → écartés.

## R8 — Modèle, délais et quotas

- **Decision**: modèle configurable (`COPILOT_MODEL`, défaut `gpt-5`), `reasoningEffort`
  configurable (défaut `medium`). Délai par tentative : **50 s** ; la requête HTTP d'audit est
  annulable. Erreurs SDK mappées : quota/limite → `COPILOT_RATE_LIMITED` (429),
  indisponibilité → `COPILOT_UNAVAILABLE` (503), délai → `COPILOT_TIMEOUT` (504). Un seul audit
  en cours à la fois par session (FR-016) → `AUDIT_IN_PROGRESS` (409).
- **Rationale**: SC-002 (≤ 60 s pour 95 % des documents < 50 Ko) ; le modèle reste ajustable
  sans modification de code pour améliorer la stabilité des notes (SC-005).
- **Alternatives considered**: modèle codé en dur (moins flexible).

## R9 — Stratégie de tests

- **Decision**: **Vitest** pour les tests unitaires (validation de sortie IA, score global,
  rendu du rapport, validation d'entrée), de contrat (routes Fastify via `inject()` contre
  l'OpenAPI) et d'intégration (moteur d'audit avec un **faux client Copilot** injectable,
  scénarios : réponse conforme, non conforme puis conforme, deux fois non conforme, délai,
  quota). **Playwright** pour 3 scénarios E2E (collage, fichier, téléchargement du rapport)
  avec le faux moteur. Un jeu de **spécifications de référence** (`tests/fixtures/specs/`)
  sert à la validation manuelle réelle avec Copilot (SC-004, SC-005).
- **Rationale**: tests déterministes en CI sans consommer de quota ; conformes aux barrières
  qualité de la constitution (présence/ordre des piliers, rejet des réponses non conformes,
  routes protégées, absence de contenu dans les logs).
- **Alternatives considered**: Jest (plus lent en ESM), tests réels contre Copilot en CI
  (non déterministes, coûteux).
