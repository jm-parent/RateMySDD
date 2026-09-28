# Feedback de copie et en-tête centré — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le résultat de la copie du code Device Flow visible et placer le titre principal au centre de l’en-tête authentifié entre le compte GitHub et la déconnexion.

**Architecture:** Réutiliser `LoginScreen.copyStatus` comme statut visible et annoncé poliment, sans ajouter de persistance ni d’appel serveur. Ajouter à `UserBar` un titre facultatif pour la vue d’audit authentifiée ; `App` le fournit, `AuditPage` retire son titre dupliqué et l’en-tête l’affiche dans une grille responsive à trois colonnes.

**Tech Stack:** Node.js >= 22.12, TypeScript 5.9, React 19, Vite 7, Vitest, Playwright ; aucune nouvelle dépendance.

## Global Constraints

- « Code copié. » est affiché après une copie réussie ; « La copie automatique est indisponible. » est affiché si le presse-papiers refuse la copie.
- Le résultat est annoncé avec `role="status"` et `aria-live="polite"`. Le toast de succès reste visible 3 secondes puis disparaît par fondu sur 350 ms ; le toast d’erreur reste visible jusqu’à un nouvel essai de copie ou à la génération d’un nouveau code.
- Dans la vue d’audit authentifiée, l’en-tête place l’identité GitHub, le titre « RateMySDD — Audit de spécifications » et la déconnexion dans cet ordre ; le titre est centré horizontalement.
- Sur petit écran, le titre peut se réduire et revenir à la ligne ; l’en-tête ne crée pas de débordement horizontal.
- La page de connexion conserve son titre dans sa carte ; l’écran « Accès GitHub Copilot requis » reste inchangé.
- **FR-003**: Le système MUST afficher l'identité de l'utilisateur connecté et lui permettre de se déconnecter ; la déconnexion MUST invalider sa session.
- L’authentification, l’API, les règles de session, le contenu Markdown et les résultats d’audit ne changent pas.
- Ne pas ajouter de dépendance ni de stockage pour l’état de copie ou le titre.

---

## File Map

| Fichier | Responsabilité |
|---|---|
| `src/web/components/LoginScreen.tsx` | Annoncer le résultat de copie et afficher un toast temporaire de succès ou persistant d’erreur. |
| `src/web/styles.css` | Animer le toast de copie et styliser la variante d’en-tête en grille, avec adaptation au breakpoint mobile existant de 760 px. |
| `tests/e2e/login-copy-feedback.spec.ts` | Couvrir la durée du succès, la persistance de l’erreur, le nouvel essai et le remplacement du code Device Flow. |
| `src/web/components/UserBar.tsx` | Ajouter un titre facultatif `pageTitle`, le rendre comme `h1` entre l’identité et la déconnexion et préserver son focus initial. |
| `src/web/App.tsx` | Fournir le titre uniquement à l’en-tête de la vue d’audit authentifiée. |
| `src/web/components/AuditPage.tsx` | Retirer le `h1` dupliqué et le focus associé ; garder la région d’audit nommée par le titre commun de l’en-tête. |
| `tests/unit/auth-components.test.ts` | Vérifier le balisage et l’ordre identité, titre `h1`, déconnexion dans `UserBar`. |
| `tests/e2e/accessibility.spec.ts` | Vérifier le focus initial, le centrage géométrique sur desktop et l’absence de débordement à 320 px. |
| `specs/001-markdown-spec-audit/spec.md` | Ajouter les critères d’acceptation et exigences fonctionnelles du retour de copie et de l’en-tête. |

## Task 1: Rendre le résultat de copie visible

**Files:**
- Create: `tests/e2e/login-copy-feedback.spec.ts`
- Modify: `src/web/components/LoginScreen.tsx`
- Modify: `src/web/styles.css`

**Interfaces:**
- Consumes: `LoginScreen.copyStatus`, `DeviceStartSchema`, `navigator.clipboard.writeText`.
- Produces: Une région `role="status"` contenant les textes de succès et d’échec déjà définis dans `LoginScreen`.

- [ ] **Step 1: Ajouter un test E2E rouge pour le toast de succès.** Créer un helper qui intercepte le démarrage Device Flow avec une réponse valide et un intervalle de polling assez long pour que le test reste sur l’écran du code :

```ts
async function openDeviceCodePage(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/device/start', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userCode: 'COPY-1234',
        verificationUri: 'https://github.com/login/device',
        expiresIn: 900,
        interval: 300,
      }),
    }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Se connecter avec GitHub Copilot' })
    .click();
  await expect(page.getByRole('button', { name: 'Copier le code' })).toBeVisible();
}
```

Ajouter ce test `shows a visible status after copying the device code` :

```ts
test('shows then dismisses the success toast after copying the device code', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDeviceCodePage(page);
  await page.getByRole('button', { name: 'Copier le code' }).click();

  const status = page.getByRole('status');
  const toast = page.locator('.copy-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('Code copié.');
  await expect(status).toHaveText('Code copié.');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(toast).toBeHidden({ timeout: 4_500 });
  await expect(status).toHaveText('');
});
```

- [ ] **Step 2: Vérifier le rouge avant la modification de production.**

Run: `rtk npm run test:e2e -- tests/e2e/login-copy-feedback.spec.ts`

Expected: FAIL parce que le retour actuel n’est pas un toast temporaire ; ne pas modifier le test pour contourner cette absence.

- [ ] **Step 3: Ajouter les tests d’échec et de remise à zéro.** Le test d’échec remplace le presse-papiers dans `page.addInitScript` afin que la première tentative échoue et la deuxième réussisse :

```ts
await page.addInitScript(() => {
  let attempts = 0;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Clipboard permission denied.');
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 250);
        });
      },
    },
  });
});

await openDeviceCodePage(page);
const copyButton = page.getByRole('button', { name: 'Copier le code' });
const status = page.getByRole('status');
const toast = page.locator('.copy-toast');
await copyButton.click();
await expect(status).toHaveText('La copie automatique est indisponible.');
await expect(toast).toBeVisible();
await page.waitForTimeout(3_500);
await expect(toast).toBeVisible();
await expect(toast).toHaveText('La copie automatique est indisponible.');
await copyButton.click();
await expect(status).toHaveText('');
await expect(status).toHaveText('Code copié.');
```

Le test de nouveau code contrôle l’expiration du premier code sans course temporelle en
gardant la réponse du premier poll en attente jusqu’à ce que la copie ait été vérifiée :

```ts
let starts = 0;
let releasePoll!: () => void;
let signalPoll!: () => void;
const pollRequested = new Promise<void>((resolve) => {
  signalPoll = resolve;
});
const pollRelease = new Promise<void>((resolve) => {
  releasePoll = resolve;
});
await page.route('**/api/auth/device/start', (route) => {
  starts += 1;
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      userCode: starts === 1 ? 'OLD-CODE' : 'NEW-CODE',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900,
      interval: starts === 1 ? 1 : 300,
    }),
  });
});
await page.route('**/api/auth/device/poll', async (route) => {
  signalPoll();
  await pollRelease;
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'expired' }),
  });
});
```

Dans ce test, accorder les deux permissions de presse-papiers, ouvrir `/`, démarrer la connexion,
attendre `OLD-CODE` puis la capture du poll, copier le code et vérifier la confirmation, libérer
le poll pour obtenir « Code expiré. », cliquer « Recommencer », attendre `NEW-CODE`, puis vérifier
que `page.getByText('Code copié.')` ne correspond plus à aucun élément.

Run: `rtk npm run test:e2e -- tests/e2e/login-copy-feedback.spec.ts`

Expected: FAIL sur les assertions visibles de succès/échec et de rôle `status` avant la correction de production.

- [ ] **Step 4: Ajouter le toast et garder l’annonce accessible dans `LoginScreen`.** Dans `copyUserCode`, après le garde `if (!device) return`, effacer le statut précédent et les minuteries avant l’accès asynchrone au presse-papiers. Garder les textes de succès/échec existants. Le succès démarre une minuterie de 3 secondes puis une sortie de 350 ms ; l’échec n’a pas de minuterie. Ignorer les réponses d’une copie devenue obsolète et nettoyer les minuteries à chaque nouvel essai, nouveau code et démontage.

```tsx
<p className="copy-status-announcement" role="status" aria-live="polite">
  {copyStatus}
</p>
{copyStatus && (
  <div className="copy-toast" aria-hidden="true">
    {copyStatus}
  </div>
)}
```

Le reset existant dans `beginLogin` reste en place afin qu’un nouveau code ne réutilise pas le statut précédent.

- [ ] **Step 5: Animer le toast et relancer le test ciblé.** Ajouter `.copy-toast` dans `src/web/styles.css`, fixé en bas à droite avec un fondu d’entrée et de sortie de 350 ms, une disposition adaptée aux petits écrans et une animation désactivée avec `prefers-reduced-motion`.

Run: `rtk npm run test:e2e -- tests/e2e/login-copy-feedback.spec.ts`

Expected: PASS ; le succès disparaît après 3 secondes, l’erreur reste visible au-delà de ce
délai, le nouvel essai efface le statut et le nouveau code n’hérite pas de l’ancien message.

## Task 2: Centrer le titre dans l’en-tête authentifié

**Files:**
- Modify: `tests/unit/auth-components.test.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `src/web/components/UserBar.tsx`
- Modify: `src/web/App.tsx`
- Modify: `src/web/components/AuditPage.tsx`
- Modify: `src/web/styles.css`

**Interfaces:**
- `UserBarProps` reçoit `pageTitle?: string`.
- `App` passe `pageTitle="RateMySDD — Audit de spécifications"` uniquement à l’en-tête qui précède `AuditPage`.
- `UserBar` rend `pageTitle`, lorsqu’il est fourni, comme `h1#id="audit-page-title"` avec `tabIndex={-1}` et lui donne le focus à son montage.
- `AuditPage` conserve `aria-labelledby="audit-page-title"` pour nommer sa région à partir du `h1` commun.

- [ ] **Step 1: Ajouter l’assertion SSR rouge pour l’ordre de l’en-tête.** Dans `tests/unit/auth-components.test.ts`, rendre `UserBar` avec `pageTitle` et vérifier qu’un seul `h1` existe et que le nom du compte précède le titre, lui-même avant « Se déconnecter » :

```ts
const html = renderToStaticMarkup(
  createElement(UserBar, {
    user,
    onLoggedOut: () => undefined,
    pageTitle: 'RateMySDD — Audit de spécifications',
  }),
);
const identityIndex = html.indexOf('Octo Cat');
const titleIndex = html.indexOf('<h1');
const logoutIndex = html.indexOf('Se déconnecter');

expect(identityIndex).toBeGreaterThanOrEqual(0);
expect(titleIndex).toBeGreaterThan(identityIndex);
expect(logoutIndex).toBeGreaterThan(titleIndex);
expect(html).toContain('<h1 id="audit-page-title"');
expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
```

- [ ] **Step 2: Vérifier le rouge unitaire avant le changement de production.**

Run: `rtk npm test -- tests/unit/auth-components.test.ts`

Expected: FAIL sur les assertions de rendu parce que `UserBar` ne rend pas encore le titre `h1` fourni ; Vitest ne doit pas être utilisé comme substitut au typecheck.

- [ ] **Step 3: Ajouter le test E2E de focus et de centrage.** Dans `tests/e2e/accessibility.spec.ts`, utiliser le helper `signIn(page)` existant, puis vérifier :

```ts
const title = page.getByRole('heading', {
  level: 1,
  name: 'RateMySDD — Audit de spécifications',
});
await expect(title).toBeFocused();
await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

const header = page.locator('.user-bar');
const headerBox = await header.boundingBox();
const titleBox = await title.boundingBox();
expect(headerBox).not.toBeNull();
expect(titleBox).not.toBeNull();
if (!headerBox || !titleBox) {
  throw new Error('The authenticated header or page title has no layout box.');
}
expect(
  Math.abs(
    titleBox.x + titleBox.width / 2 - (headerBox.x + headerBox.width / 2),
  ),
).toBeLessThanOrEqual(1);

const desktopFontSize = await title.evaluate((element) =>
  Number.parseFloat(getComputedStyle(element).fontSize),
);
await page.setViewportSize({ width: 320, height: 900 });
await expect(title).toBeVisible();
const mobileHeaderBox = await header.boundingBox();
const mobileTitleBox = await title.boundingBox();
expect(mobileHeaderBox).not.toBeNull();
expect(mobileTitleBox).not.toBeNull();
if (!mobileHeaderBox || !mobileTitleBox) {
  throw new Error('The mobile header or page title has no layout box.');
}
expect(
  Math.abs(
    mobileTitleBox.x +
      mobileTitleBox.width / 2 -
      (mobileHeaderBox.x + mobileHeaderBox.width / 2),
  ),
).toBeLessThanOrEqual(1);
const mobileFontSize = await title.evaluate((element) =>
  Number.parseFloat(getComputedStyle(element).fontSize),
);
expect(mobileFontSize).toBeLessThan(desktopFontSize);
expect(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
).toBe(true);
```

Run: `rtk npm run test:e2e -- tests/e2e/accessibility.spec.ts`

Expected: FAIL because the title is still rendered inside `.audit-page`, not `.user-bar`, and is not centered in the header.

- [ ] **Step 4: Add the optional page title to `UserBar`.** Extend `UserBarProps` with `pageTitle?: string`; render the heading between `.user-identity` and the logout button only when provided. Use a ref and a mount effect to focus that heading when `pageTitle` exists. Preserve the current identity, logout behavior, and error alert.

```tsx
interface UserBarProps {
  user: User;
  onLoggedOut: () => void;
  showLogout?: boolean;
  pageTitle?: string;
}

const pageTitleRef = useRef<HTMLHeadingElement>(null);

useEffect(() => {
  if (pageTitle) {
    pageTitleRef.current?.focus();
  }
}, [pageTitle]);
```

Destructurer `pageTitle` avec les autres propriétés de `UserBar`, déclarer `pageTitleRef` à l’intérieur du composant, importer `useEffect` et `useRef` depuis React, puis rendre le header avec une classe de modification. Garder le balisage d’identité existant et placer ce titre entre le bloc identité et la déconnexion :

```tsx
<header className={pageTitle ? 'user-bar user-bar--with-title' : 'user-bar'}>
  <div className="user-identity">
    {user.avatarUrl ? (
      <img className="user-avatar" src={user.avatarUrl} alt={user.login} />
    ) : (
      <span className="user-avatar avatar-placeholder" aria-hidden="true">
        {user.login.slice(0, 1).toUpperCase()}
      </span>
    )}
    <span>{user.name || user.login}</span>
  </div>
  {pageTitle && (
    <h1
      id="audit-page-title"
      ref={pageTitleRef}
      className="user-bar-title"
      tabIndex={-1}
    >
      {pageTitle}
    </h1>
  )}
  {showLogout && (
    <button type="button" onClick={() => void logout()}>
      Se déconnecter
    </button>
  )}
  {error && (
    <p className="login-error" role="alert">
      {error}
    </p>
  )}
</header>
```

- [ ] **Step 5: Pass the title from `App` and remove the duplicate from `AuditPage`.** Pass the exact page title in the authenticated audit branch only. Do not pass it in the `copilotAccess === 'none'` branch. Remove the `h1`, its ref, the initial-focus effect, and the now-unused `useEffect` import from `AuditPage`; keep the section labelled by the shared `audit-page-title` heading. Leave `LoginScreen`’s separate title unchanged.

In `App.tsx`, the audit-capable branch passes:

```tsx
<UserBar
  user={user}
  onLoggedOut={handleLoggedOut}
  pageTitle="RateMySDD — Audit de spécifications"
/>
```

Keep `AuditPage`’s existing privacy notice and audit workspace children untouched. Its section remains labelled by the `h1` in the preceding `UserBar`:

```tsx
<section className="audit-page" aria-labelledby="audit-page-title">
```

- [ ] **Step 6: Implement the centered responsive grid.** Add the modifier class only when `pageTitle` is present, so the no-Copilot-access `UserBar` layout remains unchanged. Use symmetric side tracks, a shrinkable middle track, and center-aligned title text:

```css
.user-bar--with-title {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr);
  column-gap: 0.5rem;
}

.user-bar--with-title > * {
  min-width: 0;
}

.user-bar-title {
  min-width: 0;
  margin: 0;
  text-align: center;
  overflow-wrap: anywhere;
  font-size: clamp(0.9rem, 2.4vw, 1.5rem);
  line-height: 1.15;
}

.user-bar-title:focus,
.audit-result-screen h2:focus {
  outline: 3px solid #1463c5;
  outline-offset: 4px;
}

.user-bar--with-title .login-error {
  grid-column: 1 / -1;
  justify-self: center;
}

@media (max-width: 760px) {
  .user-bar--with-title {
    column-gap: 0.25rem;
  }

  .user-bar-title {
    font-size: clamp(0.75rem, 3.2vw, 1rem);
  }

  .user-bar--with-title > button {
    padding: 0.35rem 0.15rem;
    font-size: 0.7rem;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .user-bar--with-title .user-identity {
    min-width: 0;
    gap: 0.35rem;
  }

  .user-bar--with-title .user-identity > span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .user-bar--with-title .user-avatar {
    flex: 0 0 2rem;
  }
}
```

Keep the existing `.user-bar` styles as the default for headers without a page title.
Replace the obsolete `.audit-page h1` font rule with `.user-bar-title`, and replace `.audit-page h1:focus` in the existing focus selector with `.user-bar-title:focus`; retain the result `h2` focus outline.

- [ ] **Step 7: Run the focused unit and browser tests.**

Run: `rtk npm test -- tests/unit/auth-components.test.ts`

Expected: PASS with the identity/title/logout order and exactly one authenticated `h1`.

Run: `rtk npm run test:e2e -- tests/e2e/accessibility.spec.ts`

Expected: PASS with the initial title focus, centered title at desktop and 320 px, one `h1`, no horizontal overflow, and existing result-screen focus behavior unchanged.

## Task 3: Document the approved authentication UI behavior

**Files:**
- Modify: `specs/001-markdown-spec-audit/spec.md`

**Interfaces:**
- Consumes: The approved design in `docs/superpowers/specs/2026-09-28-copy-feedback-centered-header-design.md` and implemented labels/behaviors from Tasks 1–2.
- Produces: Acceptance scenarios and functional requirements for copy feedback and the authenticated header, without changing the existing FR identifiers.

- [ ] **Step 1: Extend User Story 3 acceptance scenarios.** Append these two scenarios after the existing four; do not renumber or rewrite the existing scenarios:

```markdown
5. **Given** un utilisateur qui affiche un code Device Flow, **When** il clique sur « Copier le code », **Then** « Code copié. » apparaît dans un toast pendant 3 secondes puis disparaît par fondu sur 350 ms, ou « La copie automatique est indisponible. » apparaît et reste visible jusqu’à un nouvel essai ou un nouveau code ; le résultat est annoncé comme statut accessible.
6. **Given** un utilisateur authentifié avec un accès Copilot actif, **When** la vue d’audit s’affiche, **Then** l’en-tête présente son identité, le titre centré « RateMySDD — Audit de spécifications » et « Se déconnecter » dans cet ordre ; à 320 px, le titre peut revenir à la ligne sans débordement horizontal et reçoit le focus initial.
```

- [ ] **Step 2: Add the next functional requirement identifiers after FR-026.** Use these texts:

```markdown
- **FR-027**: Pendant le parcours de connexion Device Flow, le système MUST afficher le résultat de la copie dans un toast : « Code copié. » en cas de succès, visible pendant 3 secondes puis masqué par un fondu de 350 ms, ou « La copie automatique est indisponible. » en cas d’échec, visible jusqu’à un nouvel essai de copie ou la génération d’un nouveau code. Le résultat MUST être annoncé par une région `role="status"` avec `aria-live="polite"`.
- **FR-028**: Dans la vue d’audit authentifiée, l’en-tête MUST afficher dans cet ordre l’identité GitHub, le titre « RateMySDD — Audit de spécifications » et le bouton « Se déconnecter » ; le titre MUST être le `h1` unique et être centré horizontalement. Le titre MUST conserver le focus initial. À une largeur de 320 px, il peut revenir à la ligne mais l’en-tête MUST NOT provoquer de débordement horizontal. L’écran de connexion conserve son titre dans sa carte.
```

- [ ] **Step 3: Relire FR-001 à FR-004 et les scénarios existants de la User Story 3.** Confirmer que l’exigence d’identité/déconnexion et l’accès Copilot restent inchangés ; vérifier qu’aucune nouvelle exigence ne promet un changement d’API, de session ou de stockage.

Run: `rtk rg -n 'FR-027|FR-028' specs/001-markdown-spec-audit/spec.md`

Expected: each new identifier has exactly one definition, and the surrounding FR-001–FR-004 text remains unchanged.

## Task 4: Valider l’ensemble de la fonctionnalité

**Files:**
- No additional source files; validate Tasks 1–3.

**Interfaces:**
- Consumes: Copy feedback, centered header, regression tests, and updated feature specification.
- Produces: Passing unit/E2E suites, lint, typecheck, and production build.

- [ ] **Step 1: Run all unit and integration tests.**

Run: `rtk npm test`

Expected: PASS.

- [ ] **Step 2: Run the complete Playwright suite.**

Run: `rtk npm run test:e2e`

Expected: PASS, including the new login-copy and authenticated-header scenarios.

- [ ] **Step 3: Run lint, typecheck, and production build.**

Run: `rtk npm run lint`

Expected: PASS.

Run: `rtk npm run typecheck`

Expected: PASS for client and server TypeScript projects.

Run: `rtk npm run build`

Expected: PASS without changes to API contracts or dependencies.

## Execution Notes

- Keep implementation and tests within the files listed in each task; do not change OAuth, API routes, audit scoring, report generation, or document storage.
- The Playwright configuration builds and runs its own test server with `RMSDD_TEST_MODE=1` on its isolated port; do not use the user’s running development server.
- This folder-backed workspace has no Git repository, so the plan intentionally has no commit steps.
