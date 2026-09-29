# RateMySDD

RateMySDD est une application web qui aide les utilisateurs connectés avec leur compte GitHub
Copilot à auditer une spécification Markdown. Chaque profil de navigateur possède sa session.
Le rapport évalue toujours les six
piliers canoniques, avec une note de 0 à 100, une description et des points d’amélioration
pour chacun, puis calcule le score global comme moyenne des six notes.

## Prérequis

- Node.js **22.12 ou supérieur** (Node.js 24 LTS recommandé) et npm.
- Un compte GitHub avec un abonnement Copilot actif.
- Une GitHub OAuth App avec le **Device Flow** activé.

## Configuration OAuth

1. Dans GitHub, ouvrez **Settings → Developer settings → OAuth Apps**, puis créez une OAuth
   App pour votre instance locale.
2. Activez **Enable Device Flow** dans les paramètres de l’application.
3. Copiez son **Client ID**. Aucun client secret n’est requis pour le Device Flow.
4. Copiez `.env.example` vers `.env` et renseignez `GITHUB_OAUTH_CLIENT_ID` :

   ```dotenv
   GITHUB_OAUTH_CLIENT_ID=votre-client-id
   COPILOT_MODEL=gpt-5
   COPILOT_REASONING_EFFORT=medium
   PORT=5178
   ```

   Dans PowerShell :

   ```powershell
   Copy-Item .env.example .env
   ```

   Puis modifiez `.env` avec votre Client ID.

## Lancer l’application

```powershell
npm install
npm run build
npm start
```

Ouvrez ensuite [http://127.0.0.1:5178](http://127.0.0.1:5178). En développement, `npm run dev`
lance le serveur et l’interface Vite.

## Déploiement multi-utilisateur sur Vercel

Le point d’entrée Node/Fastify, les assets Vite et la durée de fonction sont configurés dans
`src/server.ts` et `vercel.json`. Le build produit le frontend dans `dist/web`.

1. Créez une base Redis avec l’API REST activée dans Upstash.
2. Dans Vercel, gardez la racine du dépôt comme **Root Directory**, utilisez Node.js **22.x**
   ou plus récent, `npm run build` comme commande de build et `dist/web` comme dossier de sortie.
3. Configurez ces variables dans **Preview** et **Production** :

   ```dotenv
   GITHUB_OAUTH_CLIENT_ID=...
   UPSTASH_REDIS_REST_URL=https://...
   UPSTASH_REDIS_REST_TOKEN=...
   SESSION_ENCRYPTION_KEY=...
   ```

   `SESSION_ENCRYPTION_KEY` doit être une clé aléatoire de 32 octets encodée en hexadécimal
   (64 caractères). Vous pouvez en générer une avec :

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Ne publiez pas ces valeurs dans le dépôt. Si vous utilisez un domaine personnalisé,
   configurez `APP_ORIGIN=https://votre-domaine.example` dans **Production**, avec l’alias stable
   que vos utilisateurs ouvrent (par exemple `https://rate-my-sdd.vercel.app`). En **Preview**,
   laissez-la absente : Vercel fournit `VERCEL_URL` pour vérifier l’origine de chaque déploiement.
4. Déployez d’abord un **Preview** et testez le flux GitHub ainsi qu’un audit réel. Le SDK
   démarre le CLI Copilot pendant une fonction Vercel ; un build local ne valide pas ce point.
   La fonction d’audit est limitée à 180 secondes par `vercel.json`.

Chaque profil de navigateur conserve sa propre session. Les sessions expirent après huit heures
d’inactivité ; Redis conserve uniquement l’état d’authentification chiffré, jamais les textes ou
rapports d’audit. La clé de chiffrement doit rester stable : son remplacement empêche le
déchiffrement des sessions et autorisations déjà stockées. Utilisez des profils de navigateur
distincts pour des utilisateurs connectés simultanément.

## Utilisation et confidentialité

Connectez-vous avec GitHub, puis collez une spécification Markdown ou chargez un fichier
`.md` (200 Ko maximum). Le contenu est transmis à Copilot avec le compte de l’utilisateur
connecté afin de générer l’audit. RateMySDD ne conserve ni le document ni l’historique des
résultats ; les journaux ne contiennent pas le contenu soumis. En local, le jeton GitHub reste
en mémoire côté serveur. Sur Vercel, tokens et codes Device Flow sont chiffrés avant leur
stockage temporaire dans Redis.

Avant de soumettre des documents, vérifiez qu’ils peuvent être transmis au service Copilot
associé à votre compte.

## Tests et validation

Les tests automatisés utilisent un moteur Copilot simulé et ne consomment pas de quota :

```powershell
npm test
npm run test:e2e
npm run lint
npm run typecheck
```

Pour les scénarios détaillés et la validation manuelle avec un compte Copilot réel,
consultez le [guide Quickstart](specs/001-markdown-spec-audit/quickstart.md).
