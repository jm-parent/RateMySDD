# Revue de sécurité

**Périmètre** : `src/server/auth/`, `src/server/audit/`, `src/server/security/`,
`src/server/app.ts` et `src/server/index.ts`.

**Résultat** : aucun problème de sécurité exploitable identifié dans le périmètre examiné.

- [x] Le jeton GitHub reste en mémoire côté serveur ; il n’est pas renvoyé au navigateur ni
      écrit dans les journaux.
- [x] Les cookies de session sont `HttpOnly` et `SameSite=Strict` ; les mutations contrôlent
      l’origine.
- [x] Le serveur est limité à l’interface loopback `127.0.0.1`.
- [x] Les sessions Copilot d’audit n’exposent aucun outil et ne sont pas persistées.
- [x] Le répertoire temporaire Copilot est purgé au démarrage, après audit et à l’arrêt.
- [x] Les journaux d’audit ne contiennent que des métadonnées, jamais le document ou la sortie
      brute de l’IA.

**Limites** : l’examen porte sur les fichiers présents (le dossier ne contient pas de
métadonnées Git) ; les composants internes du SDK Copilot, la conservation côté fournisseur et
les fichiers hors du périmètre ci-dessus n’ont pas été audités.
