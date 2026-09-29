import { expect, test } from '@playwright/test';

const diagnosticSnapshot = {
  runtime: 'failed',
  environment: [
    { key: 'GITHUB_OAUTH_CLIENT_ID', status: 'valid' },
    {
      key: 'UPSTASH_REDIS_REST_URL',
      status: 'valid',
      value: 'redis.example.com',
    },
    { key: 'UPSTASH_REDIS_REST_TOKEN', status: 'valid' },
    { key: 'SESSION_ENCRYPTION_KEY', status: 'valid' },
    {
      key: 'EFFECTIVE_PUBLIC_ORIGIN',
      status: 'valid',
      value: 'https://rate-my-sdd.vercel.app',
    },
  ],
  events: [
    {
      timestamp: '2026-09-29T10:00:00.000Z',
      requestId: 'diagnostic-session-startup-id',
      source: 'startup',
      errorType: 'ConfigurationError',
      message: 'Configuration invalide. Vérifiez GITHUB_OAUTH_CLIENT_ID.',
    },
  ],
};

test('shows safe runtime diagnostics after the session request fails', async ({
  page,
}) => {
  let authorizationHeader = '';
  await page.route('**/api/session', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'INTERNAL_ERROR',
        message: 'Une erreur inattendue est survenue. Veuillez réessayer.',
        diagnosticId: 'diagnostic-session-startup-id',
      }),
    }),
  );
  await page.route('**/api/diagnostics', async (route) => {
    authorizationHeader = route.request().headers().authorization ?? '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify(diagnosticSnapshot),
    });
  });

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const openButton = page.getByRole('button', {
    name: 'Diagnostic administrateur',
  });
  await expect(openButton).toBeVisible();
  await openButton.click();
  await page.getByLabel('Code administrateur').fill('admin-diagnostics-token');
  await page.getByRole('button', { name: 'Vérifier' }).click();

  await expect(
    page.getByText('GITHUB_OAUTH_CLIENT_ID', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('redis.example.com')).toBeVisible();
  await expect(page.getByText('diagnostic-session-startup-id')).toBeVisible();
  await expect(page.getByText('Configuration invalide. Vérifiez GITHUB_OAUTH_CLIENT_ID.')).toBeVisible();
  expect(authorizationHeader).toBe('Bearer admin-diagnostics-token');
  await expect(page.getByText('admin-diagnostics-token')).toHaveCount(0);
  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(pageWidth).toBeLessThanOrEqual(320);

  await page.getByRole('button', { name: 'Fermer' }).click();
  await openButton.click();
  await expect(page.getByLabel('Code administrateur')).toHaveValue('');
});

test('shows a generic error when the administrator code is rejected', async ({
  page,
}) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'INTERNAL_ERROR',
        message: 'Une erreur inattendue est survenue. Veuillez réessayer.',
      }),
    }),
  );
  await page.route('**/api/diagnostics', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'INTERNAL_ERROR',
        message: 'Diagnostic indisponible.',
      }),
    }),
  );

  await page.goto('/');
  await page
    .getByRole('button', { name: 'Diagnostic administrateur' })
    .click();
  await page.getByLabel('Code administrateur').fill('wrong-token');
  await page.getByRole('button', { name: 'Vérifier' }).click();

  await expect(page.getByText('Diagnostic indisponible.')).toBeVisible();
  await expect(page.getByText('GITHUB_OAUTH_CLIENT_ID')).toHaveCount(0);
});