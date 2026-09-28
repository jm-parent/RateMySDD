import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec GitHub Copilot' }).click();
  await expect(page.getByText('TEST-1234')).toBeVisible();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({ timeout: 15_000 });
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('copies and downloads the report, then replaces the result after re-audit', async ({
  page,
}) => {
  await signIn(page);
  await page.getByLabel('Choisir un fichier .md').setInputFiles(
    'tests/fixtures/specs/complete.md',
  );
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByRole('row')).toHaveCount(7);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le rapport' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^audit-complete-\d{8}-\d{4}\.md$/,
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const report = readFileSync(downloadPath!, 'utf8');
  expect(report.match(/^\| 0[1-6] \|/gm)).toHaveLength(6);
  expect(report).toContain('## Barème');
  expect(report).toContain("**Date de l'audit**");
  expect(report).toContain('**Source** : Fichier `complete.md`');
  expect(report).toContain('**Score global**');
  expect(report).not.toContain(
    readFileSync('tests/fixtures/specs/complete.md', 'utf8').replace(/\r\n/g, '\n'),
  );

  await page.getByRole('button', { name: 'Copier le résultat' }).click();
  await expect(
    page.getByText('Résultat copié dans le presse-papiers'),
  ).toBeVisible();
  const copiedReport = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedReport.replace(/\r\n/g, '\n')).toBe(
    report.replace(/\r\n/g, '\n'),
  );

  const initialScore = await page.getByRole('heading', { name: /Score global/ }).innerText();
  await page
    .getByRole('tab', { name: 'Mettre le MD' })
    .click({ timeout: 1_500 });
  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill("# Révision sans exigences d'exploitation");
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByRole('row')).toHaveCount(7);
  await expect(page.getByRole('row').nth(6)).toContainText('0/100');
  await expect(page.getByRole('table').first()).toContainText(
    'Résultat de l’audit : complete',
  );
  const updatedScore = await page.getByRole('heading', { name: /Score global/ }).innerText();
  expect(updatedScore).not.toBe(initialScore);
});
