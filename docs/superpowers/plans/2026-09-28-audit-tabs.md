# Onglets de saisie et résultat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bottom-of-screen return controls with two accessible tabs, « Mettre le MD » and « Le résultat », attached to the audit content panel.

**Architecture:** Reuse `AuditPageState.screen` as the selected-tab state and keep the existing audit data in `App`'s volatile React state. Render one stable workspace card with a tablist and two associated tabpanel shells; keep the inactive shell hidden and render only the active screen's content. Tab changes make no API calls, edits invalidate the current result, and a successful audit still selects and focuses the result.

**Tech Stack:** TypeScript 5.9, React 19, Vite 7, Vitest, Playwright; no new dependency.

## Global Constraints

- **FR-005**: Lors du retour à la saisie, le système MUST préserver en mémoire le contenu, la source (collage ou fichier) et, le cas échéant, le nom du fichier. Ce retour MUST NOT déclencher une nouvelle analyse.
- **FR-009**: Le système MUST NOT enregistrer le document, le résultat ou un historique d'audits au-delà de la session d'utilisation courante ; la navigation ne crée aucune sauvegarde persistante.
- **FR-010**: Lors d'un changement d'écran, le titre et les commandes de navigation MUST être perceptibles et utilisables au clavier ; le lecteur d'écran MUST pouvoir identifier le nouvel écran affiché.
- **FR-017**: Seul l'auditeur authentifié avec son compte GitHub Copilot courant MUST pouvoir soumettre un document, consulter sa saisie ou consulter le résultat correspondant. Une instance locale n'offre pas d'accès partagé aux membres de l'organisation.
- **FR-018**: Le document et le résultat MUST rester en mémoire volatile pendant l'utilisation courante ; ils MUST NOT être écrits dans une base persistante, un stockage navigateur persistant, un historique, des journaux, des traces, des métriques ou des messages d'erreur.
- **FR-020**: À l'expiration ou à la révocation de la session, les écrans MUST être protégés. Une reconnexion avec le même compte peut restaurer la saisie et le résultat encore valide uniquement depuis la mémoire courante ; une identité différente, une déconnexion explicite, un rechargement de page ou la fermeture de l'application MUST effacer la saisie et le résultat.
- **Assumptions**: Les entrées acceptées restent le Markdown collé ou un unique fichier `.md` UTF-8 limité à 204 800 octets. Le JSON normalisé est destiné à l'interface ; la copie et le téléchargement destinés à l'utilisateur restent au format Markdown.

---

## Constitution Check

| Principe | Décision | Résultat |
|---|---|---|
| I. Audit de spécification pour l'utilisateur Copilot authentifié | Les onglets restent dans l'écran d'audit déjà protégé par l'authentification. | PASS |
| II. Règle d'or des 6 piliers | Réutiliser le résultat existant sans modifier les six piliers, leur ordre ou leurs scores. | PASS |
| III. Format de sortie normalisé | Réutiliser le tableau, le JSON et les actions de rapport sans transformation. | PASS |
| IV. Authentification sécurisée | Ne pas modifier OAuth, les jetons, les cookies ou les routes protégées. | PASS |
| V. Confidentialité des données transmises à l'IA | Garder le document et le résultat en mémoire volatile ; la navigation n'ajoute ni journal ni stockage. | PASS |

**Complexity Tracking:** Aucune dérogation ni nouvelle dépendance. L'interface réutilise l'état d'écran et les composants actuels.

## File Map

| Fichier | Responsabilité du changement |
|---|---|
| `src/web/components/AuditPage.tsx` | Rendre le titre commun, la carte, le tablist, les deux panneaux et le comportement clavier ; garder les transitions d'audit et d'invalidation. |
| `src/web/components/AuditResultScreen.tsx` | Garder le tableau et les actions, retirer le bouton « Modifier la spécification », afficher un titre `h2` et ne déplacer le focus que lors d'un nouvel audit réussi. |
| `src/web/styles.css` | Styliser la carte et les états sélectionné, désactivé, focus et responsive ; retirer les styles des deux anciens contrôles de navigation. |
| `tests/e2e/paste-audit.spec.ts` | Tester les onglets avant et après audit, la désactivation, l'absence de nouvel audit au changement d'onglet et l'invalidation après édition. |
| `tests/e2e/accessibility.spec.ts` | Tester les rôles accessibles, les touches de navigation et le comportement du focus. |
| `tests/e2e/file-audit.spec.ts` | Vérifier que les onglets préservent le contenu, la source fichier et son nom. |
| `tests/e2e/report-download.spec.ts` | Revenir à la saisie avec l'onglet correspondant avant de modifier et réauditer. |
| `tests/e2e/session-expiry.spec.ts` | Utiliser l'onglet de saisie dans le scénario de reconnexion qui vérifie la conservation de l'état. |
| `tests/unit/audit-components.test.ts` | Vérifier le balisage SSR des onglets, panneaux et état désactivé. |
| `specs/002-audit-result-subscreen/spec.md` | Remplacer les exigences de navigation par boutons par les exigences d'onglets approuvées. |

**Non modifiés :** `src/web/App.tsx`, l'API, les schémas partagés, `package.json` et la configuration Playwright. `AuditPageState.screen` existe déjà et porte l'écran actif.

## Task 1: Add failing tab behavior tests

**Files:**
- Modify: `tests/e2e/paste-audit.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `tests/e2e/file-audit.spec.ts`
- Modify: `tests/e2e/report-download.spec.ts`
- Modify: `tests/e2e/session-expiry.spec.ts`
- Modify: `tests/unit/audit-components.test.ts`

**Interfaces:**
- Consumes: Existing `signIn(page)` helpers, `AuditPageState`, and test fixture `tests/fixtures/specs/complete.md`.
- Produces: Regression tests requiring tabs named « Mettre le MD » and « Le résultat », panels with stable IDs, no duplicate audit on navigation, and keyboard-operable selection.

- [ ] **Step 1: Add the pre-audit tab test in `tests/e2e/paste-audit.spec.ts`.**

```ts
test('shows the input tab and disables the result tab before a valid audit', async ({
  page,
}) => {
  await signIn(page);

  const inputTab = page.getByRole('tab', { name: 'Mettre le MD' });
  const resultTab = page.getByRole('tab', { name: 'Le résultat' });

  await expect(
    page.getByRole('tablist', { name: 'Navigation de l’audit' }),
  ).toBeVisible();
  await expect(inputTab).toHaveAttribute('aria-selected', 'true');
  await expect(inputTab).toHaveAttribute('aria-controls', 'audit-input-panel');
  await expect(resultTab).toHaveAttribute('aria-controls', 'audit-result-panel');
  await expect(resultTab).toBeDisabled();
  await expect(page.locator('#audit-input-panel')).toBeVisible();
  await expect(page.locator('#audit-result-panel')).toBeHidden();
});
```

- [ ] **Step 2: Convert the paste-navigation assertions to tabs.** In the existing successful-paste test, capture `/api/audits` requests as it already does; after the result appears, assert that the result tab is selected, click the input tab and verify the original Markdown, click the result tab and verify the six rows, then assert one audit request. After changing the Markdown, assert the result tab is disabled and the old table is absent. Use these selectors:

```ts
const inputTab = page.getByRole('tab', { name: 'Mettre le MD' });
const resultTab = page.getByRole('tab', { name: 'Le résultat' });

await expect(resultTab).toHaveAttribute('aria-selected', 'true');
await inputTab.click();
await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveValue(draft);
await resultTab.click();
await expect(page.getByRole('row')).toHaveCount(7);
expect(auditRequests).toHaveLength(1);
```

- [ ] **Step 3: Add keyboard assertions in `tests/e2e/accessibility.spec.ts`.** After a successful audit, use the input tab's `focus()` and `page.keyboard.press('ArrowRight')` to select and focus the result tab; press `ArrowLeft` to return to the input tab; press `End` and `Home` to select the last and first enabled tabs. Before an audit, verify that the disabled result tab is skipped and focus remains on the input tab. Change the result heading assertion to level 2 and assert that a manual switch leaves focus on the selected tab.

```ts
const inputTab = page.getByRole('tab', { name: 'Mettre le MD' });
const resultTab = page.getByRole('tab', { name: 'Le résultat' });

await inputTab.focus();
await page.keyboard.press('ArrowRight');
await expect(resultTab).toHaveAttribute('aria-selected', 'true');
await expect(resultTab).toBeFocused();
await page.keyboard.press('ArrowLeft');
await expect(inputTab).toHaveAttribute('aria-selected', 'true');
await expect(inputTab).toBeFocused();
await page.keyboard.press('End');
await expect(resultTab).toBeFocused();
await page.keyboard.press('Home');
await expect(inputTab).toBeFocused();
```

- [ ] **Step 4: Replace old button selectors in the remaining browser tests.** In `file-audit.spec.ts`, `report-download.spec.ts` and `session-expiry.spec.ts`, replace the old « Modifier la spécification » button selector with `page.getByRole('tab', { name: 'Mettre le MD' })`; in paste tests replace « Afficher le dernier résultat » with `page.getByRole('tab', { name: 'Le résultat' })`. Keep each test's existing file, report, session, and audit-request assertions.

- [ ] **Step 5: Add static-render assertions in `tests/unit/audit-components.test.ts`.** Render `AuditPage` from `INITIAL_AUDIT_PAGE_STATE`, extract the result-tab `<button>` by its `id`, and verify the tablist label, both `aria-controls` targets, selected input tab and disabled result tab. Keep the existing six-pillar and report assertions for a result state; assert that result markup uses an `h2`.

```ts
const html = renderToStaticMarkup(
  createElement(AuditPage, {
    state: INITIAL_AUDIT_PAGE_STATE,
    onStateChange: () => undefined,
  }),
);
const resultTab = html.match(/<button[^>]*id="audit-result-tab"[^>]*>/)?.[0] ?? '';

expect(html).toContain('role="tablist"');
expect(html).toContain('aria-label="Navigation de l’audit"');
expect(html).toContain('aria-controls="audit-input-panel"');
expect(html).toContain('aria-controls="audit-result-panel"');
expect(resultTab).toContain('disabled=""');
```

- [ ] **Step 6: Run the focused tests before changing production code.**

Run: `npm run test:e2e -- tests/e2e/paste-audit.spec.ts tests/e2e/file-audit.spec.ts tests/e2e/report-download.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/session-expiry.spec.ts`

Expected: FAIL because the application currently has no `tablist` or `tab` roles and still exposes the old navigation buttons.

Run: `npm test -- tests/unit/audit-components.test.ts`

Expected: FAIL on the missing tablist/tabpanel markup, not on TypeScript compilation or test setup.

## Task 2: Implement the accessible tabbed workspace

**Files:**
- Modify: `src/web/components/AuditPage.tsx`
- Modify: `src/web/components/AuditResultScreen.tsx`
- Modify: `src/web/styles.css`

**Interfaces:**
- Consumes: `AuditPageState.screen`, `AuditPageState.result`, `AuditPageState.status`, existing `onStateChange`, and the regression tests from Task 1.
- Produces: Two buttons with `role="tab"` and stable IDs `audit-input-tab` and `audit-result-tab`; two `tabpanel` shells with IDs `audit-input-panel` and `audit-result-panel`; `AuditResultScreen` receives `{ result: AuditResult, focusHeading: boolean }`.

- [ ] **Step 1: Replace conditional whole-page returns in `AuditPage.tsx` with a stable page title and workspace card.** Keep the existing page `h1` above the card. Add a `tablist` labelled `Navigation de l’audit` with:

```tsx
<button
  id="audit-input-tab"
  type="button"
  role="tab"
  aria-selected={state.screen === 'input'}
  aria-controls="audit-input-panel"
  tabIndex={state.screen === 'input' ? 0 : -1}
>
  Mettre le MD
</button>
```

Add the result tab with `id="audit-result-tab"`, `aria-controls="audit-result-panel"`, the corresponding `aria-selected` and `tabIndex`, and `disabled={state.result === null || isRunning || state.status === 'running'}`. Give each `tabpanel` shell an `aria-labelledby` that points back to its tab and a `hidden` property when inactive. Keep both shells in the DOM so `aria-controls` always resolves, but conditionally render the form or `AuditResultScreen` only inside the active shell.

- [ ] **Step 2: Make tab selection use the existing screen state.** Add a `selectScreen(screen: AuditPageState['screen'])` handler that ignores selection of a disabled result tab, clears pending result-heading focus on manual navigation, and calls `onStateChange({ ...state, screen })`. Do not call `apiPost` from this handler. Keep `handleContentChange`, file load, and file removal clearing the old result as they do now.

- [ ] **Step 3: Implement horizontal tab keyboard behavior.** Store refs for both tab buttons. On `ArrowLeft`/`ArrowRight`, select and focus the next enabled tab with wraparound; skip the disabled result tab. On `Home`/`End`, select and focus the first/last enabled tab. Prevent the browser's default arrow-key behavior for these handled keys. The active tab has `tabIndex={0}` and the inactive tab has `tabIndex={-1}`.

- [ ] **Step 4: Preserve automatic focus only for a newly completed audit.** Keep the shared page title focus on initial `AuditPage` mount rather than on every screen change. Set a one-shot `focusNewResult` state to `true` only after `AuditResultSchema` has validated a successful response; set it to `false` on audit start, audit failure and manual tab selection. Pass it to `AuditResultScreen`. In that component, focus its title only when `focusHeading` is true, change the result title from `h1` to `h2`, and remove its bottom « Modifier la spécification » navigation.

- [ ] **Step 5: Remove the bottom « Afficher le dernier résultat » control and style the workspace in `src/web/styles.css`.** Use one bordered white card with the tab bar attached to its top edge; provide visible selected, disabled and `:focus-visible` states. Keep both labels visible at narrow widths. Remove the obsolete `.input-result-navigation` and `.result-navigation` rules, and remove the nested card appearance from `.audit-result-screen` so the result panel sits inside the shared workspace.

- [ ] **Step 6: Run the focused unit and browser tests.**

Run: `npm test -- tests/unit/audit-components.test.ts`

Expected: PASS with the tab/panel static markup assertions and all six result rows intact.

Run: `npm run test:e2e -- tests/e2e/paste-audit.spec.ts tests/e2e/file-audit.spec.ts tests/e2e/report-download.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/session-expiry.spec.ts`

Expected: PASS; manual navigation makes no second audit request, edits disable the result tab, and keyboard selection preserves focus.

## Task 3: Update the feature specification

**Files:**
- Modify: `specs/002-audit-result-subscreen/spec.md`

**Interfaces:**
- Consumes: The approved design in `docs/superpowers/specs/2026-09-28-audit-tabs-design.md`.
- Produces: Functional requirements and acceptance scenarios that describe the implemented tabs rather than the removed bottom navigation buttons.

- [ ] **Step 1: Update Acceptance Scenarios 3 and 5 and the keyboard edge case.** Scenario 3 must describe choosing the « Mettre le MD » tab and returning to the unchanged draft without an audit. Scenario 5 must say that « Le résultat » is disabled when no valid result exists, while the input panel shows progress or an error. Replace the edge-case reference to generic navigation commands with the named tab controls and their keyboard support.

- [ ] **Step 2: Replace FR-004, FR-006 and FR-010 with the approved tab requirements.** Use these requirement texts:

```markdown
- **FR-004**: L'espace d'audit MUST afficher en permanence un onglet « Mettre le MD » et un onglet « Le résultat » au-dessus du panneau actif, dans la même carte. L'onglet de résultat MUST rester visible mais MUST être désactivé s'il n'existe pas de résultat valide pour le document courant ou si un audit est en cours.
- **FR-006**: Tant que le document n'est pas modifié, le système MUST permettre d'ouvrir à nouveau le dernier résultat valide au moyen de l'onglet « Le résultat », sans relancer l'audit. Dès que l'utilisateur modifie le texte, charge ou retire un fichier, le résultat précédent MUST être invalidé et l'onglet de résultat MUST rester désactivé jusqu'à la réussite d'un nouvel audit valide.
- **FR-010**: Les onglets MUST suivre le modèle accessible `tablist`/`tab`/`tabpanel`, identifier leur panneau avec `aria-controls` et `aria-labelledby`, et rester utilisables au clavier avec les flèches gauche/droite et les touches Début/Fin. Un changement manuel MUST conserver le focus sur l'onglet actif ; après un nouvel audit valide, le focus MUST aller au titre du résultat.
```

- [ ] **Step 3: Read the changed user-story requirements together and confirm that FR-003, FR-005, FR-007, FR-009, FR-018 and FR-020 still agree with the tab behavior.** Keep their session, confidentiality, no-re-audit and volatile-memory guarantees unchanged.

## Task 4: Run final validation

**Files:**
- No additional source files; validate the Task 1–3 changes.

**Interfaces:**
- Consumes: Completed tab implementation, migrated tests and updated specification.
- Produces: A fully tested, type-safe, lint-clean build with no server/API contract changes.

- [ ] **Step 1: Run all unit and component tests.**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run the complete Playwright suite.**

Run: `npm run test:e2e`

Expected: PASS on the isolated Playwright test server; all existing paste, file, download, accessibility, session-expiry and account-change scenarios remain valid.

- [ ] **Step 3: Run lint, type-check and production build.**

Run: `npm run lint`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS for both client and server TypeScript projects.

Run: `npm run build`

Expected: PASS; no API contract or dependency changes are produced.

## Execution Notes

- Do not add a dependency or modify `App.tsx`, authentication, server routes, API schemas, audit scoring or report generation.
- The Playwright configuration already uses an isolated port and `reuseExistingServer: false`; do not switch tests to a user's running development server.
- This workspace is folder-backed and has no Git repository, so this plan intentionally contains no `git commit` step.
