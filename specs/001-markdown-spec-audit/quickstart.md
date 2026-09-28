# Quickstart — validation de bout en bout

**Feature**: `001-markdown-spec-audit` | Références : [plan.md](./plan.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

## Prérequis

- Windows / macOS / Linux avec **Node.js ≥ 22.12** (recommandé : 24 LTS) et npm.
- Un compte GitHub avec un **abonnement Copilot actif**.
- Une **GitHub OAuth App** (Settings → Developer settings → OAuth Apps) avec
  **« Enable Device Flow » coché** ; noter son `Client ID` (aucun secret requis).

## Installation et configuration

```powershell
npm install
Copy-Item .env.example .env
# Éditer .env :
#   GITHUB_OAUTH_CLIENT_ID=<Client ID de l'OAuth App>
#   COPILOT_MODEL=gpt-5            (optionnel)
#   PORT=5178                      (optionnel)
```

## Lancer

```powershell
npm run build
npm start          # sert l'application sur http://127.0.0.1:5178
# ou, en développement :
npm run dev
```

## Tests automatisés (sans consommer de quota Copilot)

```powershell
npm test             # Vitest : unit + contract + integration (faux client Copilot)
npm run test:e2e     # Playwright : collage, fichier, téléchargement du rapport
npm run lint; npm run typecheck
```

Attendu : tous les tests verts, dont ceux qui vérifient :
6 piliers dans l'ordre, rejet des sorties IA non conformes (retry puis `AI_OUTPUT_INVALID`),
routes d'audit refusées sans session (`401`), aucune trace du contenu dans les logs.

## Scénarios de validation manuelle (Copilot réel)

| # | Étapes | Résultat attendu | Réf. |
|---|--------|------------------|------|
| 1 | Ouvrir `http://127.0.0.1:5178` sans être connecté | Écran de connexion, aucune zone d'audit | US3-1, FR-001 |
| 2 | « Se connecter avec GitHub » → saisir le code affiché sur github.com/login/device | Retour automatique, login et avatar affichés | US3-2, FR-003 |
| 3 | Coller `tests/fixtures/specs/complete.md` → « Lancer l'audit » | Indicateur de progression, bouton désactivé ; puis score global + tableau 6 lignes × (Note, Description, Points d'amélioration) ; ≥ 5 piliers ≥ 70 | US1-1/2/4/5, SC-001, SC-004 |
| 4 | Coller `tests/fixtures/specs/missing-nfr.md` | Pilier 06 à 0/100 (« absent ») avec description d'absence | US1-3, FR-013 |
| 5 | Charger `tests/fixtures/specs/complete.md` par glisser-déposer | Contenu dans la zone de saisie ; résultat de même structure qu'au scénario 3 | US2-1/4 |
| 6 | Charger `document.pdf`, puis un `.md` de 300 Ko, puis 2 fichiers à la fois | Refus avec messages : type, taille (200 Ko), un seul fichier | US2-2/3, FR-006/007 |
| 7 | Coller `tests/fixtures/specs/prompt-injection.md` | Structure et barème respectés ; pas de 100/100 injustifiés | FR-014 |
| 8 | Coller un texte contenant `<script>alert(1)</script>` | Affiché comme texte, aucune exécution | FR-021 |
| 9 | Après le scénario 5 : « Copier le résultat » puis « Télécharger le rapport » | Presse-papiers et fichier `audit-complete-AAAAMMJJ-HHMM.md` conformes à [report-format.md](./contracts/report-format.md) | US4, FR-022/022a |
| 10 | Auditer 3 fois `complete.md` | Écart ≤ 10 points par pilier (≥ 90 % des cas) | SC-005 |
| 11 | Vérifier les logs serveur et le dossier temporaire de l'application après les audits | Aucun extrait de document ; dossier temporaire vide ; rien sous `~/.copilot/session-state` pour l'application | FR-024/025 |
| 12 | Depuis une autre machine du réseau, ouvrir `http://<ip-du-poste>:5178` | Connexion impossible (écoute sur 127.0.0.1 uniquement) | FR-026 |
| 13 | « Se déconnecter » puis relancer un audit via l'onglet | Redirection vers la connexion ; API → `401` | US3-4 |
