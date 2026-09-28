# RateMySDD

RateMySDD est une application web locale qui aide un utilisateur connecté avec son compte
GitHub Copilot à auditer une spécification Markdown. Le rapport évalue toujours les six
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

## Utilisation et confidentialité

Connectez-vous avec GitHub, puis collez une spécification Markdown ou chargez un fichier
`.md` (200 Ko maximum). Le contenu est transmis à Copilot avec le compte de l’utilisateur
connecté afin de générer l’audit. RateMySDD ne conserve ni le document ni l’historique des
résultats ; les journaux ne contiennent pas le contenu soumis. Le serveur n’écoute que sur
`127.0.0.1`, et le jeton GitHub reste en mémoire côté serveur.

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
