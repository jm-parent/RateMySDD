import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter avec GitHub Copilot' }).click();
  await expect(page.getByText('TEST-1234')).toBeVisible();
  await expect(page.getByText('Utilisateur de test')).toBeVisible({ timeout: 15_000 });
}

test('aligns and focuses the branded authenticated header responsively', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);

  const title = page.locator('.user-bar').getByRole('heading', {
    level: 1,
    name: 'RateMySDD',
  });
  const logoutButton = page.getByRole('button', { name: 'Se déconnecter' });
  await expect(title).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect(
    await title.evaluate((element) => element.closest('a, button') !== null),
  ).toBe(false);
  await expect(logoutButton).toHaveAttribute('aria-label', 'Se déconnecter');
  await expect(logoutButton).toHaveAttribute('title', 'Se déconnecter');
  await expect(logoutButton.locator('svg')).toBeVisible();
  const logoutBox = await logoutButton.boundingBox();
  expect(logoutBox?.width).toBeLessThanOrEqual(160);
  expect(logoutBox?.height).toBeLessThanOrEqual(48);

  const header = page.locator('.user-bar');
  const headerBox = await header.boundingBox();
  const titleBox = await title.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  if (!headerBox || !titleBox) {
    throw new Error('The authenticated header or page title has no layout box.');
  }
  expect(titleBox.x).toBeGreaterThan(headerBox.x);
  expect(titleBox.x).toBeLessThan(headerBox.x + headerBox.width / 2);

  const desktopFontSize = await title.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(title).toHaveCSS('outline-style', 'none');
  await expect(title).toBeVisible();
  const mobileHeaderBox = await header.boundingBox();
  const mobileTitleBox = await title.boundingBox();
  expect(mobileHeaderBox).not.toBeNull();
  expect(mobileTitleBox).not.toBeNull();
  if (!mobileHeaderBox || !mobileTitleBox) {
    throw new Error('The mobile header or page title has no layout box.');
  }
  expect(mobileTitleBox.x).toBeGreaterThan(mobileHeaderBox.x);
  expect(mobileTitleBox.x).toBeLessThan(
    mobileHeaderBox.x + mobileHeaderBox.width / 2,
  );
  const mobileFontSize = await title.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(mobileFontSize).toBeLessThan(desktopFontSize);
  const mobileLogoutBox = await logoutButton.boundingBox();
  expect(mobileLogoutBox?.width).toBeLessThanOrEqual(160);
  expect(mobileLogoutBox?.height).toBeLessThanOrEqual(48);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('keeps a neutral focus cue without a blue outline on the Markdown editor', async ({
  page,
}) => {
  await signIn(page);
  const textarea = page.getByLabel('Spécification Markdown à auditer');
  await textarea.click();
  await expect(textarea).toBeFocused();

  const focusStyles = await textarea.evaluate((element) => ({
    outlineStyle: getComputedStyle(element).outlineStyle,
    editorShadow: getComputedStyle(element.parentElement!).boxShadow,
  }));

  expect(focusStyles.outlineStyle).toBe('none');
  expect(focusStyles.editorShadow).not.toBe('none');
  expect(focusStyles.editorShadow).not.toContain('20, 99, 197');
});

test('keeps the result table readable at 1280px with accessible score colors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  const workspaceBox = await page.locator('.audit-workspace').boundingBox();
  expect(workspaceBox?.width).toBeGreaterThanOrEqual(790);

  const inputTab = page.getByRole('tab', { name: 'Mettre le MD' });
  const resultTab = page.getByRole('tab', { name: 'Le résultat' });

  await inputTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(resultTab).toBeDisabled();
  await expect(inputTab).toHaveAttribute('aria-selected', 'true');
  await expect(inputTab).toBeFocused();

  await page
    .getByLabel('Spécification Markdown à auditer')
    .fill('# Audit test\n\nExigences non fonctionnelles : disponibilité 99,9 %.');
  await page.getByRole('button', { name: "Lancer l'audit" }).click();
  await expect(page.getByRole('row')).toHaveCount(7);
  const tableFontSizes = await page
    .locator('.audit-table th, .audit-table td')
    .evaluateAll((cells) =>
      cells.map((cell) => Number.parseFloat(getComputedStyle(cell).fontSize)),
    );
  expect(tableFontSizes.every((size) => size <= 13)).toBe(true);
  await expect(page.locator('.audit-table thead')).toHaveCSS(
    'background-color',
    'rgb(237, 244, 250)',
  );
  await expect(page.locator('.audit-results > h2')).toHaveCSS(
    'background-color',
    'rgb(242, 248, 255)',
  );
  const resultHeading = page.getByRole('heading', {
    level: 2,
    name: 'Résultat de l’audit',
  });
  await expect(resultHeading).toBeFocused();
  await expect(resultHeading).toHaveCSS('outline-style', 'none');

  const detailButton = page.getByRole('button', { name: 'Voir le détail' }).first();
  await expect(detailButton).toBeVisible();
  await detailButton.click();
  const descriptionDialog = page.getByRole('dialog', {
    name: /Description complète — Contexte & Objectif/,
  });
  await expect(descriptionDialog).toBeVisible();
  await expect(descriptionDialog).toContainText(
    'Le besoin est justifié par la réduction des demandes manuelles',
  );
  await page.keyboard.press('Escape');
  await expect(descriptionDialog).toBeHidden();
  await expect(detailButton).toBeFocused();

  await expect(resultTab).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByLabel('Spécification Markdown à auditer'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Lancer l'audit" })).toHaveCount(0);

  await inputTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(resultTab).toHaveAttribute('aria-selected', 'true');
  await expect(resultTab).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(inputTab).toHaveAttribute('aria-selected', 'true');
  await expect(inputTab).toBeFocused();
  await page.keyboard.press('End');
  await expect(resultTab).toHaveAttribute('aria-selected', 'true');
  await expect(resultTab).toBeFocused();
  await page.keyboard.press('Home');
  await expect(inputTab).toHaveAttribute('aria-selected', 'true');
  await expect(inputTab).toBeFocused();
  await resultTab.click();
  await expect(resultTab).toHaveAttribute('aria-selected', 'true');
  await expect(resultTab).toBeFocused();
  await inputTab.click();
  await expect(inputTab).toHaveAttribute('aria-selected', 'true');
  await expect(inputTab).toBeFocused();
  await resultTab.click();
  await expect(resultTab).toBeFocused();

  const tableFitsViewport = await page
    .locator('.audit-table-wrap')
    .evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(tableFitsViewport).toBe(true);

  const contrastRatios = await page
    .locator('.pillar-badge, .score-band')
    .evaluateAll((badges) => {
      function luminance(color: string): number {
        const channels = color.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
        const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      }

      return badges.map((badge) => {
        const style = getComputedStyle(badge);
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
    });
  expect(contrastRatios).toHaveLength(12);
  expect(contrastRatios.every((ratio) => ratio >= 4.5)).toBe(true);

  await inputTab.click();
  await expect(inputTab).toBeFocused();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copier le résultat' })).toHaveCount(0);
  await resultTab.click();
  await expect(resultTab).toBeFocused();
});
