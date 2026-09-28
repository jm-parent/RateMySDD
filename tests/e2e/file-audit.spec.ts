import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec GitHub Copilot' }).click();
  await expect(page.getByText('TEST-1234')).toBeVisible();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({ timeout: 15_000 });
}

test('loads and audits one Markdown file', async ({ page }) => {
  const auditPayloads: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/audits')) {
      auditPayloads.push(request.postDataJSON());
    }
  });

  await signIn(page);
  await page.getByLabel('Choisir un fichier .md').setInputFiles(
    'tests/fixtures/specs/complete.md',
  );
  await expect(page.getByLabel('Spécification Markdown à auditer')).toContainText(
    '# Gestion des abonnements',
  );
  await expect(page.locator('.loaded-file')).toHaveCount(0);
  await page.getByRole('button', { name: "Lancer l'audit" }).click();

  await expect(page.getByRole('row')).toHaveCount(7);
  await expect(page.getByRole('table').first()).toContainText(
    'Résultat de l’audit : complete',
  );
  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Mettre le MD' }).click();
  await expect(page.getByLabel('Spécification Markdown à auditer')).toContainText(
    '# Gestion des abonnements',
  );
  await expect(page.locator('.loaded-file')).toHaveCount(0);
  expect(auditPayloads).toHaveLength(1);
  expect(auditPayloads[0]).toMatchObject({
    source: 'file',
    fileName: 'complete.md',
    content: expect.stringContaining('# Gestion des abonnements'),
  });

  await page.getByRole('tab', { name: 'Le résultat' }).click();
  await expect(page.getByRole('row')).toHaveCount(7);
  expect(auditPayloads).toHaveLength(1);
});

test('clears an uploaded file and returns to an empty paste input', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('Choisir un fichier .md').setInputFiles(
    'tests/fixtures/specs/complete.md',
  );
  await expect(page.locator('.loaded-file')).toHaveCount(0);

  await page.getByRole('button', { name: 'Effacer' }).click();

  await expect(page.getByLabel('Spécification Markdown à auditer')).toHaveValue('');
  await expect(page.locator('.loaded-file')).toHaveCount(0);
});

test('rejects a dropped PDF and multiple selected files', async ({ page }) => {
  await signIn(page);
  const dropZone = page.locator('.file-drop-zone');

  await dropZone.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File(['pdf'], 'document.pdf', { type: 'application/pdf' }),
    );
    element.dispatchEvent(
      new DragEvent('drop', { bubbles: true, dataTransfer }),
    );
  });
  await expect(page.getByRole('alert')).toContainText(
    'Seuls les fichiers .md sont acceptés.',
  );

  await dropZone.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['# One'], 'one.md', { type: 'text/markdown' }));
    dataTransfer.items.add(new File(['# Two'], 'two.md', { type: 'text/markdown' }));
    element.dispatchEvent(
      new DragEvent('drop', { bubbles: true, dataTransfer }),
    );
  });
  await expect(page.getByRole('alert')).toContainText(
    'Un seul fichier à la fois',
  );
});
