# Résultats Quickstart

## Vérifications automatisées

- Vitest (unitaires, contrats, intégration) : **130 tests réussis**.
- Playwright en mode test : **12 tests réussis**, dont connexion simulée, collage, fichier,
  protection XSS, expiration de session, export du rapport et vérification responsive.
- `npm run build` : réussi.
- `npm run typecheck` : réussi.
- `npm run lint` : réussi.
- `npm audit --omit=dev` : aucune vulnérabilité de dépendance de production.
- L’audit complet signale encore deux avis modérés dans la dépendance de test Vitest
  (`@vitest/mocker`) ; ils ne sont pas inclus dans l’audit de production. Leur correctif proposé
  exige une montée majeure de Vitest et reste hors du périmètre des avis élevés/critiques exigés.

Ces vérifications utilisent le moteur Copilot simulé et ne valident pas le service Copilot réel.

## Validation avec un compte Copilot réel

**Statut : non exécutée.** Il faut configurer une GitHub OAuth App locale et autoriser le
Device Flow avec un compte Copilot actif. Les scénarios manuels 1 à 13 du [Quickstart](../quickstart.md),
la mesure SC-002 avec Copilot réel et la stabilité SC-005 sur trois audits restent à valider
par l’utilisateur.
