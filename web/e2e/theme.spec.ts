import { expect, test } from './fixtures';

test('le gaz choisi éclaire tout le site et reste choisi d’une page à l’autre', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-gas', 'ar');
  const wallBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.locator('label[for="gas-ne"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-gas', 'ne');
  await expect(page.locator('#gas-ne')).toBeChecked();
  // Le mur change de couleur (le glissement dure moins d'une seconde).
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .not.toBe(wallBefore);
  await expect(page.locator('[data-gas-cycle-symbol]')).toHaveText('Ne');

  await page.goto('/labo/pgcd');
  await expect(page.locator('html')).toHaveAttribute('data-gas', 'ne');
  await expect(page.locator('[data-gas-cycle-symbol]')).toHaveText('Ne');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-gas', 'ne');
});

test('le bouton de l’en-tête passe au gaz suivant, en boucle', async ({ page }) => {
  await page.goto('/projets');
  const cycle = page.locator('[data-gas-cycle]');
  const symbol = page.locator('[data-gas-cycle-symbol]');
  await expect(symbol).toHaveText('Ar');
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    await cycle.click();
    seen.push((await symbol.textContent()) ?? '');
  }
  expect(seen).toEqual(['Kr', 'Xe', 'He', 'Ne', 'Ar']);
  await expect(cycle).toHaveAccessibleName('Gaz des tubes : Argon. Passer au gaz suivant.');
});

test('l’interrupteur éteint les tubes et le reste après rechargement', async ({ page }) => {
  await page.goto('/');
  const power = page.getByRole('switch', { name: 'Néons' });
  await expect(power).toHaveAttribute('aria-checked', 'true');
  const glowOn = await page.locator('.brand-text').evaluate((node) => getComputedStyle(node).textShadow);
  expect(glowOn).not.toBe('none');

  await power.click();
  await expect(power).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-tubes', 'off');
  await expect
    .poll(() => page.locator('.brand-text').evaluate((node) => getComputedStyle(node).textShadow))
    .toBe('none');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tubes', 'off');
  await expect(page.getByRole('switch', { name: 'Néons' })).toHaveAttribute('aria-checked', 'false');

  await page.getByRole('switch', { name: 'Néons' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-tubes', 'off');
});

test('l’enseigne s’amorce à la première page de la visite, pas aux suivantes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/ignite/);
  await page.goto('/labo');
  await expect(page.locator('html')).not.toHaveClass(/ignite/);
});

test('une lettre de l’enseigne s’éteint et se rallume d’un clic', async ({ page }) => {
  await page.goto('/');
  const letter = page.locator('[data-sign-letter]').first();
  await letter.click();
  await expect(letter).toHaveClass(/is-off/);
  await letter.click();
  await expect(letter).not.toHaveClass(/is-off/);
  // Le titre reste lu d'un seul tenant.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Mathieu Paillard/);
});

test.describe('avec « réduire les animations »', () => {
  test.use({ reducedMotion: 'reduce' });

  test('pas d’amorçage, et les simulations attendent qu’on les lance', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/ignite/);

    await page.goto('/labo/gravite');
    const play = page.locator('#gravity-play');
    await expect(play).toHaveText('Lancer');
    await expect(page.locator('#gravity-hint')).toContainText('Animation en pause');
    const before = await page.locator('#gravity-time').textContent();
    await page.waitForTimeout(600);
    expect(await page.locator('#gravity-time').textContent()).toBe(before);

    await play.click();
    await expect(play).toHaveText('Pause');
    // Sur téléphone, le bouton est sous la scène : la simulation n'avance que lorsqu'elle est à l'écran.
    await page.locator('#gravity-stage').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('#gravity-time').textContent()).not.toBe(before);
  });
});
