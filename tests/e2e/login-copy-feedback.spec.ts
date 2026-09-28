import { expect, test } from '@playwright/test';

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
  await expect(
    page.getByRole('button', { name: 'Copier le code' }),
  ).toBeVisible();
}

test('dismisses the success status after copying the device code', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDeviceCodePage(page);
  await page.getByRole('button', { name: 'Copier le code' }).click();

  const status = page.getByRole('status');
  const toast = page.locator('.copy-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('Code copié.');
  await expect(status).toHaveText('Code copié.');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await page.waitForTimeout(2_800);
  await expect(toast).toBeVisible();
  await expect(toast).not.toHaveClass(/copy-toast--fading/);
  await expect(toast).toHaveClass(/copy-toast--fading/, { timeout: 500 });
  await page.waitForTimeout(175);
  const opacity = Number(
    await toast.evaluate((element) => window.getComputedStyle(element).opacity),
  );
  expect(opacity).toBeGreaterThan(0);
  expect(opacity).toBeLessThan(1);
  await expect(toast).toBeHidden({ timeout: 4_500 });
  await expect(status).toHaveText('');
});

test('shows clipboard failures and replaces them after a successful retry', async ({
  page,
}) => {
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
});

test('clears the copy status when a new device code is generated', async ({
  page,
}) => {
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
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Se connecter avec GitHub Copilot' })
    .click();
  await expect(page.getByText('OLD-CODE')).toBeVisible();
  await pollRequested;
  await page.getByRole('button', { name: 'Copier le code' }).click();
  await expect(page.getByRole('status')).toHaveText('Code copié.');

  releasePoll();
  await expect(page.getByRole('alert')).toHaveText('Code expiré.');
  await page.getByRole('button', { name: 'Recommencer' }).click();
  await expect(page.getByText('NEW-CODE')).toBeVisible();
  await expect(page.getByText('Code copié.')).toHaveCount(0);
});
