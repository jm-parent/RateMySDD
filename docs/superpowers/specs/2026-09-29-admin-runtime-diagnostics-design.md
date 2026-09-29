# Design: Diagnostic administrateur du runtime


**Date :** 2026-09-29
**Statut :** Approuvé pour implémentation par l’utilisateur (2026-09-29)

## Contexte

L’interface peut être servie alors que `GET /api/session` échoue pendant
l’initialisation du runtime Vercel. Le handler actuel démarre toute l’application
avant de router la requête; une erreur de configuration ou de démarrage est alors
présentée comme un `FUNCTION_INVOCATION_FAILED`, sans détail exploitable dans
l’interface.

L’administrateur veut vérifier quelles variables d’environnement ont été chargées
et consulter les erreurs applicatives récentes, même si l’initialisation normale
échoue. Les valeurs secrètes ne doivent jamais quitter le serveur.

## Objectifs

- Rendre un bouton de diagnostic accessible depuis l’écran de connexion, sans
  authentification utilisateur.
- Réserver les détails du diagnostic à un code administrateur configuré côté serveur.
- Indiquer la présence et la validité des variables requises, sans afficher leurs
  valeurs secrètes.
- Conserver une trace courte et expurgée des erreurs applicatives récentes, avec un
  identifiant corrélable aux logs Vercel.
- Retourner un identifiant de diagnostic même lorsqu’une erreur survient avant que
  Fastify soit prêt.

## Décision

Ajouter un panneau de diagnostic dans le flux de connexion. Son bouton ouvre un
formulaire de code administrateur; après validation, le panneau affiche les contrôles
de configuration, l’état du runtime et les événements disponibles.

Sur Vercel, la route dédiée est interceptée dans `api/[...path].ts` avant
l’initialisation du runtime. Elle reste donc appelable lorsque `loadConfig()` ou
`createServerRuntime()` échoue. En local, la même route est enregistrée dans Fastify
après le démarrage normal. Dans les deux cas, l’accès est protégé par
`DIAGNOSTICS_TOKEN`, transmis dans `Authorization: Bearer ...`. Le jeton est gardé
uniquement en mémoire dans l’interface, n’est jamais persisté dans le navigateur et
doit être exclu des journaux. Si le jeton n’est pas configuré, la fonction de
diagnostic est désactivée.

### Contrôles de configuration

Le panneau affiche un état `valide`, `manquant`, `invalide` ou `optionnel` selon le
contrôle. Les valeurs de `UPSTASH_REDIS_REST_TOKEN`, `SESSION_ENCRYPTION_KEY`,
`GITHUB_OAUTH_CLIENT_ID` et `DIAGNOSTICS_TOKEN` ne sont jamais renvoyées. Les secrets
ne sont représentés que par leur présence et, si applicable, leur format valide.

Les valeurs non sensibles utiles au diagnostic peuvent être affichées :
`NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` et l’hôte de
l’origine publique effective. Les URL de configuration sont validées selon les mêmes
règles que le démarrage normal; aucun token ou paramètre d’URL n’est exposé.

### Erreurs et journal applicatif

Chaque erreur serveur diagnostiquée reçoit un identifiant de requête. Cet identifiant
est renvoyé dans `X-Diagnostic-Id`, inclus dans la réponse d’erreur normalisée et écrit
avec l’événement structuré côté serveur. Les erreurs de démarrage sont capturées dans
le handler Vercel afin que l’invocation renvoie une réponse JSON exploitable plutôt
qu’une exception non gérée. Les erreurs HTTP 5xx de Fastify sont également enregistrées.

Le processus conserve au plus 20 événements expurgés en mémoire. Chaque événement
contient l’heure UTC, l’identifiant, le type d’erreur et un message autorisé ou
sanitizé. Les cookies, en-têtes d’autorisation, corps, documents d’audit et valeurs
secrètes sont exclus. Le panneau précise que cet historique est local à une instance
chaude Vercel : il est volatil, limité à cette instance et peut être vide après un
démarrage à froid. L’identifiant permet alors de rechercher l’invocation correspondante
dans les journaux Vercel.

La comparaison du code administrateur est à temps constant. Les réponses du diagnostic
utilisent `Cache-Control: no-store`. Les erreurs d’authentification ne divulguent pas
la valeur configurée ni le détail des contrôles.

## Alternatives considérées

1. **Événements applicatifs expurgés et identifiants de requête — retenu.** N’exige pas
   de jeton d’accès à la plateforme Vercel et permet d’identifier la configuration ou
   le démarrage fautif. L’historique reste éphémère et limité à l’instance courante.
2. **Interroger l’API Vercel pour afficher l’historique complet.** Plus complet, mais
   exige un jeton Vercel de plateforme, des permissions supplémentaires et une
   surface de sécurité plus large.
3. **Afficher publiquement les statuts d’environnement.** Simple, mais révèle à tout
   visiteur quels services et réglages sont configurés; non retenu.

## Fichiers et responsabilités prévues

- `src/server/config.ts` : calculer les statuts et validations sans retourner de
  valeurs secrètes.
- `specs/001-markdown-spec-audit/contracts/openapi.yaml` : documenter le Bearer admin,
  le snapshot strict, l’identifiant d’erreur et les limites de données.
- `api/[...path].ts` : intercepter la route diagnostic avant le démarrage normal,
  corréler et capturer les échecs de démarrage.
- `src/server/app.ts` : servir le diagnostic en local et enregistrer les erreurs HTTP
  5xx sans journaliser de contenu sensible.
- `src/web/components/LoginScreen.tsx` et `src/web/api.ts` : formulaire admin,
  appel autorisé et présentation accessible des résultats.
- `src/web/styles.css` : états du panneau adaptés aux largeurs mobiles et bureau.
- `README.md` : expliquer la création et le périmètre Production de
  `DIAGNOSTICS_TOKEN`, ainsi que la limite des journaux en mémoire.
- Tests serveur et interface : vérifier accès, expurgation, erreurs de démarrage et
  états de chargement/erreur du panneau.
- Tests de contrat : vérifier que le snapshot expurgé et `diagnosticId` correspondent à
  OpenAPI.

## Vérification prévue

- Une requête sans code ou avec un code erroné ne renvoie aucun contrôle sensible.
- Un code correct permet d’obtenir les statuts de configuration alors que le runtime
  normal ne démarre pas.
- Les réponses ne contiennent aucune valeur de secret ou de document d’audit.
- Une erreur de démarrage est capturée, corrélée par identifiant et consultable si
  l’instance Vercel reste chaude.
- Une erreur 5xx de Fastify apparaît dans les événements expurgés et dans les journaux
  serveur avec le même identifiant.
- Le panneau est accessible depuis l’écran de connexion et fonctionne sur petit écran.
- Le typecheck, les tests ciblés, le build et les contrôles de lint passent.

## Portée exclue

Cette évolution ne fournit pas un accès à l’API Vercel, ne promet pas un historique
persistant ou partagé entre instances, ne permet pas de modifier l’environnement depuis
l’application et n’expose ni secrets, ni documents, ni rapports d’audit.
