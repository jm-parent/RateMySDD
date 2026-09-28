# Contrat d'interface : écran du résultat d'audit

**Feature**: `002-audit-result-subscreen`  
**Statut**: proposition Phase 1  
**Référence**: [spécification](../spec.md) et [OpenAPI existante](../../001-markdown-spec-audit/contracts/openapi.yaml)

## Portée

Le sous-écran est une vue distincte dans l'onglet RateMySDD courant. Il n'ajoute ni route
publique, ni point d'API d'audit, ni stockage. Les corps de requête et de réponse JSON de
`POST /api/audits` restent conformes au contrat OpenAPI existant ; les réponses authentifiées
ajoutent uniquement l'en-tête de métadonnées de session défini ci-dessous.

## Vues et transitions

| Vue | Contenu visible | Entrée et sortie |
|-----|-----------------|------------------|
| `input` | titre de saisie, avis de confidentialité, import/collage, actions d'audit, progression ou erreur | vue initiale ; affichée pendant l'audit et après un échec |
| `result` | titre du résultat, score global, tableau complet, barème, copie/téléchargement et commande de retour | atteinte uniquement après un résultat valide ou par réouverture explicite du dernier résultat encore valide |

- Les vues sont rendues conditionnellement : lorsque `result` est visible, la zone de saisie
  n'est ni affichée ni présente dans l'arbre accessible.
- « Modifier la spécification » retourne à `input` sans requête réseau. Le contenu, la source
  et le nom de fichier restent identiques.
- « Afficher le dernier résultat » est disponible depuis `input` uniquement tant que le
  document courant est inchangé ; cette commande n'appelle pas `/api/audits`.
- Modifier le texte, charger un autre fichier ou retirer le fichier invalide immédiatement le
  résultat et maintient l'utilisateur dans `input`.
- Une soumission en cours ou échouée reste dans `input`. Seul un résultat complet validé par
  `AuditResultSchema` peut ouvrir la vue `result`.

## Contenu et actions de la vue résultat

- Le tableau contient exactement les six piliers canoniques, dans l'ordre `01` à `06`, avec
  note, description et points d'amélioration ; le score global et le barème existant sont
  conservés.
- La vue réutilise le rendu du tableau et les actions existants. La copie et le fichier
  téléchargé restent conformes à
  `../../001-markdown-spec-audit/contracts/report-format.md` et ne contiennent pas le document
  source.
- À chaque transition, le focus clavier est déplacé sur le titre principal de la nouvelle
  vue. Le titre et la région de contenu sont nommés pour les technologies d'assistance.

## Session et confidentialité

- Aucune vue d'audit n'est exposée sans une session authentifiée avec accès Copilot.
- Un 401 ou une vérification de session non authentifiée masque les deux vues. L'état demeure
  uniquement en mémoire pendant la reconnexion : même `login`, reprise ; autre `login`,
  effacement.
- La déconnexion explicite, le rechargement et la fermeture effacent l'état d'audit.
- Toute réponse authentifiée concernée (Device Flow réussi, `GET /api/session` authentifié et
  réponse d'une route protégée) inclut `X-Session-Expires-At`, une date RFC 3339 UTC. Le client
  arme ou réarme un minuteur à cette échéance ; à son déclenchement, les vues sont masquées.
- Le navigateur vérifie aussi `GET /api/session` à un intervalle maximal de 60 secondes et
  au retour de visibilité afin de détecter une révocation anticipée ou un onglet suspendu. Au
  retour de visibilité, si l'échéance en mémoire est dépassée, les vues sont masquées
  synchroniquement avant le contrôle réseau. Cette lecture fournit l'échéance courante sans
  renouveler le TTL d'inactivité ; les routes protégées continuent à le renouveler côté serveur.
- Aucun contenu documentaire ou résultat n'est transmis par la vérification de session ;
  aucun événement de navigation n'est envoyé à un service de télémétrie.

## Contrat d'audit inchangé

Le corps de requête reste `{ content, source, fileName }`. Une réponse 200 fournit l'objet
`AuditResult` existant. Les réponses normalisées d'erreur et les protections de session/Origin
restent celles de `../../001-markdown-spec-audit/contracts/openapi.yaml`, qui documente aussi
`X-Session-Expires-At`. Le retour et la réouverture du résultat ne produisent aucune requête
d'audit supplémentaire.
