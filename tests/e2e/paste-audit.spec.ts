import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { AUDIT_CRITERIA } from '../../src/shared/audit-criteria.js';

function fixture(name: string): string {
  return readFileSync(
    join(process.cwd(), 'tests', 'fixtures', 'specs', name),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

interface AuditRequestBody {
  content: string;
  source: 'paste' | 'file';
  fileName?: string | null;
  documentType: 'spec' | 'plan' | 'tasks';
  referenceContent?: string;
}

function auditResultFor(request: AuditRequestBody, score: number) {
  const band = score >= 90 ? 'excellent' : 'bon';
  return {
    auditedAt: '2026-09-28T14:05:00.000Z',
    documentName: request.fileName?.replace(/\.md$/i, '') ?? 'Texte collé',
    documentType: request.documentType,
    source: request.source,
    fileName: request.fileName ?? null,
    globalScore: score,
    globalBand: band,
    evaluations: AUDIT_CRITERIA[request.documentType].map(({ id: criterionId, title }) => ({
      criterionId,
      title,
      score,
      band,
      summary: ['Critère évalué.'],
      description: 'Description factuelle.',
      improvements: ['Préciser un cas limite.'],
    })),
    model: 'test-model',
  };
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec GitHub Copilot' }).click();
  await expect(page.getByText('TEST-1234')).toBeVisible();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({ timeout: 15_000 });
}

async function expectLateAuditNotToRestoreDraft(
  page: import('@playwright/test').Page,
  outcome: 'success' | 'failure',
) {
  let releaseResponse: () => void = () => undefined;
  let signalResponseReady: () => void = () => undefined;
  const responsePaused = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const responseReady = new Promise<void>((resolve) => {
    signalResponseReady = resolve;
  });

  await page.route('**/api/audits', async (route) => {
    if (outcome === 'success') {
      const response = await route.fetch();
      signalResponseReady();
      await responsePaused;
      await route.fulfill({ response });
      return;
    }

    signalResponseReady();
    await responsePaused;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'COPILOT_UNAVAILABLE',
        message: 'Copilot est indisponible.',
      }),
    });
  });

  await signIn(page);
  const signInButton = page.getByRole('button', {
    name: 'Se connecter avec GitHub Copilot',
  });
  const auditResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/audits'),
  );
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill(`# Pending ${outcome} result must not return`);
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await responseReady;
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(signInButton).toBeVisible();

  releaseResponse();
  await auditResponse;
  await signInButton.click();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByLabel('Spécification Markdown à auditer'),
  ).toHaveValue('');
  await expect(page.getByRole('row')).toHaveCount(0);
}

test('requires sign-in before exposing the audit interface', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('button', { name: 'Se connecter avec GitHub Copilot' }),
  ).toBeVisible();
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveCount(0);
  await signIn(page);
  await expect(page.getByLabel('Spécification Markdown à auditer')).toBeVisible();
  await expect(page.getByRole('button', { name: "Lancer l'audit" })).toBeDisabled();
});

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

test('dismisses the privacy notice without hiding the audit input', async ({
  page,
}) => {
  await signIn(page);

  const notice = page.locator('.privacy-notice');
  await expect(notice).toBeVisible();
  await page
    .getByRole('button', { name: 'Masquer l’avis de confidentialité' })
    .click();

  await expect(notice).toHaveCount(0);
  await expect(
    page.getByLabel('Spécification Markdown à auditer'),
  ).toBeVisible();
});

test('clears a loaded file and loads the Markdown example', async ({ page }) => {
  await signIn(page);
  const textarea = page.getByLabel('Spécification Markdown à auditer');
  const auditButton = page.getByRole('button', { name: "Lancer l'audit" });

  await page
    .getByLabel('Choisir un fichier .md')
    .setInputFiles('tests/fixtures/specs/complete.md');
  await expect(page.locator('.loaded-file')).toHaveCount(0);

  await page.getByRole('button', { name: 'Effacer' }).click();
  await expect(textarea).toHaveValue('');
  await expect(page.locator('.loaded-file')).toHaveCount(0);
  await expect(auditButton).toBeDisabled();

  await page.getByRole('button', { name: 'Charger un exemple' }).click();
  await expect(textarea).toHaveValue(
    /# Spécification Fonctionnelle & Technique/,
  );
  await expect(auditButton).toBeEnabled();
});

test('enforces the 200 KiB limit before sending pasted content', async ({ page }) => {
  await signIn(page);
  const textarea = page.getByLabel('Spécification Markdown à auditer');
  const auditButton = page.getByRole('button', { name: "Lancer l'audit" });

  await textarea.fill('a'.repeat(204_800));
  await expect(auditButton).toBeEnabled();
  await textarea.fill('a'.repeat(204_801));
  await expect(auditButton).toBeDisabled();
  await expect(page.locator('.size-exceeded')).toContainText('200 Ko');
});

test('audits pasted Markdown and renders six ordered criterion rows', async ({ page }) => {
  const auditRequests: string[] = [];
  await page.route('**/api/audits', async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as AuditRequestBody;
    await route.fulfill({ json: auditResultFor(request, 84) });
  });
  page.on('request', (request) => {
    if (request.url().endsWith('/api/audits')) {
      auditRequests.push(request.postData() ?? '');
    }
  });

  await signIn(page);
  const draft = fixture('complete.md');
  const inputTab = page.getByRole('tab', { name: 'Mettre le MD' });
  const resultTab = page.getByRole('tab', { name: 'Le résultat' });
  await page.getByLabel('Spécification Markdown à auditer').fill(draft);
  await page.getByRole('button', { name: "Lancer l'audit" }).click();

  await expect(page.getByRole('heading', { name: /Score global/ })).toBeVisible();
  await expect(resultTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(7);
  await expect(page.getByText('Date de l’analyse')).toBeVisible();
  await expect(page.getByText('Modèle utilisé')).toBeVisible();
  await expect(page.getByText('test-model')).toBeVisible();
  await expect(page.getByText('Barème de notation')).toHaveCount(0);
  await expect(page.getByRole('row').nth(1)).toContainText('Contexte & Objectif');
  await expect(page.getByRole('row').nth(6)).toContainText('Exigences Non Fonctionnelles');
  await expect(page.getByText('Moyenne des six critères')).toBeVisible();

  await inputTab.click();
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveValue(draft);
  await expect(page.getByRole('row')).toHaveCount(0);
  await resultTab.click();
  await expect(page.getByRole('row')).toHaveCount(7);
  expect(auditRequests).toHaveLength(1);

  await inputTab.click();
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill('# Draft changed after returning to the input screen');
  await expect(resultTab).toBeDisabled();
  await expect(page.getByRole('row')).toHaveCount(0);
  expect(auditRequests).toHaveLength(1);
});

test('requires at least 85 for each step and sends its immediate reference', async ({
  page,
}) => {
  const requests: AuditRequestBody[] = [];
  let specAudits = 0;
  let planAudits = 0;
  let tasksAudits = 0;

  await page.route('**/api/audits', async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as AuditRequestBody;
    requests.push(request);
    const score =
      request.documentType === 'spec'
        ? (++specAudits === 1 ? 84 : 85)
        : request.documentType === 'plan'
          ? ++planAudits === 1
            ? 84
            : 85
          : ++tasksAudits > 0
            ? 92
            : 91;
    await route.fulfill({ json: auditResultFor(request, score) });
  });

  await signIn(page);
  const specInput = page.getByLabel('Spécification Markdown à auditer');
  await specInput.fill('# Spec initiale');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByText('Score global : 84/100 — bon')).toBeVisible();
  await expect(page.getByRole('button', { name: /plan\.md/ })).toBeDisabled();

  await page.getByRole('tab', { name: 'Mettre le MD' }).click();
  await specInput.fill('# Spec validée');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  const planInput = page.getByLabel('Plan Markdown à auditer');
  await expect(planInput).toBeVisible();
  await expect(page.getByRole('button', { name: /plan\.md/ })).toBeEnabled();
  await expect(page.getByText(/Lié à spec\.md/)).toBeVisible();

  await planInput.fill('# Plan à reprendre');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByText('Score global : 84/100 — bon')).toBeVisible();
  await expect(page.getByRole('button', { name: /tasks\.md/ })).toBeDisabled();

  await page.getByRole('tab', { name: 'Mettre le MD' }).click();
  await planInput.fill('# Plan validé');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  const tasksInput = page.getByLabel('Tasks Markdown à auditer');
  await expect(tasksInput).toBeVisible();
  await expect(page.getByRole('button', { name: /tasks\.md/ })).toBeEnabled();
  await expect(page.getByText(/Lié à plan\.md/)).toBeVisible();
  await tasksInput.fill('# Tasks');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByText('Score global : 92/100 — excellent')).toBeVisible();
  expect(requests.map(({ documentType }) => documentType)).toEqual([
    'spec',
    'spec',
    'plan',
    'plan',
    'tasks',
  ]);
  expect(requests[2]?.referenceContent).toBe('# Spec validée');
  expect(requests[3]?.referenceContent).toBe('# Spec validée');
  expect(requests[4]?.referenceContent).toBe('# Plan validé');
});

test('editing spec invalidates later scores but preserves plan and tasks drafts', async ({
  page,
}) => {
  await page.route('**/api/audits', async (route) => {
    const request = JSON.parse(route.request().postData() ?? '{}') as AuditRequestBody;
    await route.fulfill({ json: auditResultFor(request, 95) });
  });

  await signIn(page);
  await page.getByLabel('Spécification Markdown à auditer').fill('# Spec');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  const planInput = page.getByLabel('Plan Markdown à auditer');
  await planInput.fill('# Plan brouillon conservé');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  const tasksInput = page.getByLabel('Tasks Markdown à auditer');
  await tasksInput.fill('# Tasks brouillon conservé');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();

  await page.getByRole('button', { name: /spec\.md/ }).click();
  await page.getByRole('tab', { name: 'Mettre le MD' }).click();
  await page.getByLabel('Spécification Markdown à auditer').fill('# Spec modifiée');
  await expect(page.getByRole('button', { name: /plan\.md/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /tasks\.md/ })).toBeDisabled();
  await page.getByRole('button', { name: "Lancer l'audit" }).click();

  await expect(planInput).toHaveValue('# Plan brouillon conservé');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(tasksInput).toHaveValue('# Tasks brouillon conservé');
});

test('keeps the input screen visible when the audit request fails', async ({ page }) => {
  await page.route('**/api/audits', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'COPILOT_UNAVAILABLE',
        message: 'Copilot est indisponible.',
      }),
    }),
  );

  await signIn(page);
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill(fixture('complete.md'));
  await page.getByRole('button', { name: "Lancer l'audit" }).click();

  await expect(page.getByRole('alert')).toContainText('Copilot est indisponible.');
  await expect(page.getByLabel('Spécification Markdown à auditer')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(0);
});

test('disables the audit button while the request is in progress', async ({ page }) => {
  let resumeRequest: () => void = () => undefined;
  let signalRequestStarted: () => void = () => undefined;
  const requestStarted = new Promise<void>((resolve) => {
    signalRequestStarted = resolve;
  });
  const requestPaused = new Promise<void>((resolve) => {
    resumeRequest = resolve;
  });
  await page.route('**/api/audits', async (route) => {
    signalRequestStarted();
    await requestPaused;
    const request = JSON.parse(route.request().postData() ?? '{}') as AuditRequestBody;
    await route.fulfill({ json: auditResultFor(request, 84) });
  });

  await signIn(page);
  await page.getByLabel('Spécification Markdown à auditer').fill(fixture('complete.md'));
  const auditButton = page.getByRole('button', { name: /Lancer l'audit/ });
  await auditButton.click();
  await requestStarted;
  await expect(
    page.getByRole('button', { name: /Analyse en cours/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole('navigation', { name: 'Progression des audits' }),
  ).toBeVisible();
  resumeRequest();
  await expect(page.getByRole('row')).toHaveCount(7);
});

test('keeps prior result available after a failed retry', async ({ page }) => {
  let auditCount = 0;
  let releaseRetry: () => void = () => undefined;
  let signalRetryStarted: () => void = () => undefined;
  const retryStarted = new Promise<void>((resolve) => {
    signalRetryStarted = resolve;
  });
  const retryPaused = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });

  await page.route('**/api/audits', async (route) => {
    auditCount += 1;
    if (auditCount === 1) {
      const request = JSON.parse(route.request().postData() ?? '{}') as AuditRequestBody;
      await route.fulfill({ json: auditResultFor(request, 84) });
      return;
    }

    signalRetryStarted();
    await retryPaused;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'COPILOT_UNAVAILABLE',
        message: 'Copilot est indisponible.',
      }),
    });
  });

  await signIn(page);
  const draft = fixture('complete.md');
  const inputTab = page.getByRole('tab', { name: 'Mettre le MD' });
  const resultTab = page.getByRole('tab', { name: 'Le résultat' });
  const rows = page.getByRole('row');

  await page.getByLabel('Spécification Markdown à auditer').fill(draft);
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(rows).toHaveCount(7);
  const priorResultRows = await rows.allInnerTexts();

  await inputTab.click();
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveValue(draft);
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await retryStarted;
  await expect(resultTab).toBeDisabled();

  releaseRetry();
  await expect(page.getByRole('alert')).toContainText('Copilot est indisponible.');
  await expect(resultTab).toBeEnabled();
  await resultTab.click();
  await expect(rows).toHaveCount(7);
  expect(await rows.allInnerTexts()).toEqual(priorResultRows);
});

test('shows potentially dangerous Markdown as text without executing it', async ({ page }) => {
  let dialogCount = 0;
  page.on('dialog', async (dialog) => {
    dialogCount += 1;
    await dialog.dismiss();
  });
  await signIn(page);
  const textarea = page.getByLabel('Spécification Markdown à auditer');
  await textarea.fill(fixture('xss.md'));
  await expect(textarea).toHaveValue(fixture('xss.md'));
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByRole('row')).toHaveCount(7);
  expect(dialogCount).toBe(0);
});

test('preserves the draft when an audit request expires the session', async ({ page }) => {
  let firstAudit = true;
  await page.route('**/api/audits', async (route) => {
    if (firstAudit) {
      firstAudit = false;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'UNAUTHENTICATED',
          message: 'Veuillez vous connecter pour continuer.',
        }),
      });
      return;
    }
    const request = JSON.parse(route.request().postData() ?? '{}') as AuditRequestBody;
    await route.fulfill({ json: auditResultFor(request, 84) });
  });

  await signIn(page);
  const draft = fixture('complete.md');
  await page.getByLabel('Spécification Markdown à auditer').fill(draft);
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(
    page.getByRole('button', { name: 'Se connecter avec GitHub Copilot' }),
  ).toBeVisible();
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveCount(0);

  await page.getByRole('button', { name: 'Se connecter avec GitHub Copilot' }).click();
  await expect(page.getByText('TEST-1234')).toBeVisible();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({ timeout: 15_000 });
  const textarea = page.getByLabel('Spécification Markdown à auditer');
  await expect(textarea).toHaveValue(draft);
  await page.getByRole('button', { name: "Relancer l'audit" }).click();
  await expect(page.getByRole('row')).toHaveCount(7);
});

test('clears the draft after the user explicitly signs out', async ({ page }) => {
  await signIn(page);
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill(fixture('complete.md'));
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  const signInButton = page.getByRole('button', {
    name: 'Se connecter avec GitHub Copilot',
  });
  await expect(signInButton).toBeVisible();

  await signInButton.click();
  await expect(page.getByText('TEST-1234')).toBeVisible();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByLabel('Spécification Markdown à auditer'),
  ).toHaveValue('');
});

test('does not restore an in-flight successful audit after logout', async ({
  page,
}) => {
  await expectLateAuditNotToRestoreDraft(page, 'success');
});

test('does not restore an in-flight failed audit after logout', async ({ page }) => {
  await expectLateAuditNotToRestoreDraft(page, 'failure');
});

test('clears the draft when an explicit logout receives 401', async ({ page }) => {
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAUTHENTICATED',
        message: 'Veuillez vous connecter pour continuer.',
      }),
    }),
  );

  await signIn(page);
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill('# This draft must be cleared by explicit logout');
  const signInButton = page.getByRole('button', {
    name: 'Se connecter avec GitHub Copilot',
  });
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(signInButton).toBeVisible();

  await signInButton.click();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByLabel('Spécification Markdown à auditer'),
  ).toHaveValue('');
});
