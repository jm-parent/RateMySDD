# Quickstart — validation du sous-écran de résultat

**Feature**: `002-audit-result-subscreen`  
**Références**: [plan](./plan.md), [modèle de données](./data-model.md),
[contrat d'interface](./contracts/result-screen.md)

## Prérequis

- Node.js ≥ 22.12 et npm.
- Dépendances installées avec `npm install`.
- Les tests E2E utilisent le mode de test et le faux moteur Copilot configurés dans
  `playwright.config.ts` ; aucun quota Copilot réel n'est consommé.
- Pour la vérification manuelle réelle, configurer `GITHUB_OAUTH_CLIENT_ID` dans `.env` et
  utiliser un compte GitHub Copilot autorisé, conformément à
  [quickstart.md de la fonctionnalité 001](../001-markdown-spec-audit/quickstart.md).

## Vérifications automatisées

```powershell
npm test
npm run test:e2e
npm run lint
npm run typecheck
npm run build
```

Attendu : tous les tests réussissent ; les scénarios E2E confirment que le résultat n'est
affiché qu'après une réponse valide, que la navigation ne relance pas l'audit, que les
modifications invalident le résultat, et que les actions d'export restent disponibles.
Les tests d'intégration vérifient également que `GET /api/session` ne prolonge pas le délai
d'inactivité, que les réponses authentifiées actualisent `X-Session-Expires-At`, que le
minuteur masque les vues à l'échéance serveur, qu'un retour de visibilité après échéance les
masque avant la réponse réseau et qu'une action protégée renouvelle la session.

## Parcours manuel ou E2E ciblé

1. Ouvrir l'application sans session : seule la connexion est accessible ; aucune saisie ni
   aucun résultat d'audit ne doit apparaître.
2. Se connecter et coller `tests/fixtures/specs/complete.md`, puis lancer l'audit.
   Vérifier que la saisie disparaît et que le sous-écran affiche le score et exactement six
   lignes de piliers dans l'ordre canonique.
3. Choisir « Modifier la spécification ». Vérifier que le contenu et la source sont inchangés.
   Compter les requêtes : cette transition n'ajoute aucun appel à `/api/audits`.
4. Choisir « Afficher le dernier résultat ». Vérifier que le rapport réapparaît sans nouvel
   audit ; le formulaire n'est toujours pas affiché.
5. Modifier le texte ou charger/retirer un fichier. Vérifier que le résultat précédent n'est
   plus consultable avant la réussite d'un nouvel audit.
6. Simuler une erreur d'audit (par exemple une réponse 503) et une expiration de session
   (échéance `X-Session-Expires-At` atteinte, réponse 401 ou `GET /api/session` avec
   `authenticated: false`). L'erreur reste sur la vue de saisie ; à l'expiration ou à la
   révocation, les données sont masquées derrière la connexion. Vérifier qu'un contrôle de
   statut n'envoie aucun contenu et ne repousse pas l'échéance.
7. Se reconnecter avec le même compte : l'état temporaire peut être repris. Se reconnecter
   avec un autre compte : le document et le résultat précédents sont effacés.
8. Se déconnecter, puis se reconnecter : la saisie doit être vide. Recharger la page : aucune
   saisie ni aucun résultat ne doit être restauré.
9. Depuis la vue résultat, copier puis télécharger le rapport. Vérifier les six lignes, le
   score et le barème ; le texte source ne figure pas dans le rapport.
10. Utiliser Tab et Shift+Tab à chaque transition. Le focus doit arriver sur le titre de la
    vue courante et aucune commande de la vue inactive ne doit rester atteignable.

Les indicateurs d'adoption, d'abandon et de satisfaction de la spécification sont relevés
manuellement et de manière agrégée hors application ; ce quickstart n'ajoute aucune
instrumentation ou collecte de contenu.
