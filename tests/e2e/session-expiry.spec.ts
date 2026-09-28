import { expect, test } from '@playwright/test';

test('expires at the server deadline and preserves or clears drafts by login', async ({
  page,
}) => {
  let authorizedPolls = 0;
  await page.route('**/api/auth/device/poll', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as Record<string, unknown>;
    if (payload.status !== 'authorized') {
      await route.fulfill({ response });
      return;
    }

    authorizedPolls += 1;
    const user = payload.user as Record<string, unknown>;
    const expiresAt = new Date(Date.now() + 2_500).toISOString();
    const responsePayload =
      authorizedPolls === 3
        ? { ...payload, user: { ...user, login: 'another-test-user' } }
        : payload;

    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'x-session-expires-at': expiresAt,
      },
      body: JSON.stringify(responsePayload),
    });
  });
  await page.route('**/api/audits', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'x-session-expires-at': new Date(Date.now() + 2_500).toISOString(),
      },
    });
  });

  await page.goto('/');
  const signInButton = page.getByRole('button', {
    name: 'Se connecter avec GitHub Copilot',
  });
  await signInButton.click();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });

  const draft = '# A transient audit draft';
  await page.getByLabel('Spécification Markdown à auditer').fill(draft);
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByRole('row')).toHaveCount(7);
  await expect(signInButton).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveCount(0);

  await signInButton.click();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('row')).toHaveCount(7);
  await page.getByRole('tab', { name: 'Mettre le MD' }).click();
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveValue(draft);

  await expect(signInButton).toBeVisible({ timeout: 5_000 });
  await signInButton.click();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveValue('');
});

test('locks immediately on visibility return after the known deadline', async ({
  page,
}) => {
  let expiresAt = '';
  let pauseStatusChecks = false;
  let resumeStatusRequest: () => void = () => undefined;
  let signalStatusRequest: () => void = () => undefined;
  const statusRequestPaused = new Promise<void>((resolve) => {
    resumeStatusRequest = resolve;
  });
  const statusRequestStarted = new Promise<void>((resolve) => {
    signalStatusRequest = resolve;
  });
  const statusRequests: Array<{ method: string; postData: string | null }> = [];

  await page.route('**/api/session', async (route) => {
    const request = route.request();
    statusRequests.push({
      method: request.method(),
      postData: request.postData(),
    });
    if (pauseStatusChecks) {
      signalStatusRequest();
      await statusRequestPaused;
    }
    await route.continue();
  });
  await page.route('**/api/auth/device/poll', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as Record<string, unknown>;
    if (payload.status === 'authorized') {
      expiresAt = new Date(Date.now() + 60_000).toISOString();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'x-session-expires-at': expiresAt,
        },
      });
      return;
    }
    await route.fulfill({ response });
  });
  await page.route('**/api/audits', async (route) => {
    const response = await route.fetch();
    expiresAt = new Date(Date.now() + 60_000).toISOString();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'x-session-expires-at': expiresAt,
      },
    });
  });

  await page.goto('/');
  await page
    .getByRole('button', { name: 'Se connecter avec GitHub Copilot' })
    .click();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill('# Draft survives a visibility check');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByRole('row')).toHaveCount(7);

  expect(expiresAt).not.toBe('');
  pauseStatusChecks = true;
  await page.evaluate((deadline) => {
    const currentNow = Date.now;
    Date.now = () => new Date(deadline).getTime() + 1;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Date.now = currentNow;
  }, expiresAt);

  await expect(
    page.getByRole('button', { name: 'Se connecter avec GitHub Copilot' }),
  ).toBeVisible({ timeout: 1_500 });
  await statusRequestStarted;
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveCount(0);
  expect(statusRequests.every(({ method, postData }) => method === 'GET' && postData === null)).toBe(
    true,
  );
  resumeStatusRequest();
});

test('does not restore an in-flight audit after the session account changes', async ({
  page,
}) => {
  let replaceSession = false;
  let releaseAuditResponse: () => void = () => undefined;
  let signalAuditResponseReady: () => void = () => undefined;
  const auditResponsePaused = new Promise<void>((resolve) => {
    releaseAuditResponse = resolve;
  });
  const auditResponseReady = new Promise<void>((resolve) => {
    signalAuditResponseReady = resolve;
  });

  await page.route('**/api/session', async (route) => {
    if (!replaceSession) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const payload = (await response.json()) as Record<string, unknown>;
    const user = payload.user as Record<string, unknown>;
    await route.fulfill({
      response,
      body: JSON.stringify({
        ...payload,
        user: {
          ...user,
          login: 'another-test-user',
          name: 'Different test account',
        },
      }),
    });
  });
  await page.route('**/api/audits', async (route) => {
    const response = await route.fetch();
    signalAuditResponseReady();
    await auditResponsePaused;
    await route.fulfill({ response });
  });

  await page.goto('/');
  await page
    .getByRole('button', { name: 'Se connecter avec GitHub Copilot' })
    .click();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });
  const auditResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/audits'),
  );
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill('# This old account audit must not return');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await auditResponseReady;

  replaceSession = true;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Different test account')).toBeVisible();

  releaseAuditResponse();
  await auditResponse;
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveValue('');
  await expect(page.getByRole('row')).toHaveCount(0);
});

test('does not restore volatile audit content after a reload', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Se connecter avec GitHub Copilot' })
    .click();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill('# Content must not survive a reload');

  await page.reload();

  await expect(page.getByText('Utilisateur de test')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByLabel('Spécification Markdown à auditer'),
  ).toHaveValue('');
});

test('surfaces a malformed session-expiry header during authentication', async ({
  page,
}) => {
  await page.route('**/api/auth/device/poll', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as Record<string, unknown>;
    if (payload.status === 'authorized') {
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'x-session-expires-at': 'not-a-timestamp',
        },
      });
      return;
    }
    await route.fulfill({ response });
  });

  await page.goto('/');
  await page
    .getByRole('button', { name: 'Se connecter avec GitHub Copilot' })
    .click();

  await expect(page.getByRole('alert')).toContainText(
    'date d’expiration de session invalide',
    { timeout: 5_000 },
  );
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveCount(0);
});
