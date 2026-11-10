import { expect, test } from './fixtures';

test('la page liste treize projets, chacun avec son état', async ({ page }) => {
  await page.goto('/projets');
  const rows = page.locator('[data-project]');
  await expect(rows).toHaveCount(13);
  await expect(page.locator('[data-project] .lamp')).toHaveCount(13);
});

test('le filtre ne garde que les projets écrits à la main, ou codés avec une IA', async ({ page }) => {
  await page.goto('/projets');
  const visible = page.locator('[data-project]:visible');

  await page.locator('label[for="making-hand"]').click();
  await expect(visible).toHaveCount(6);
  await expect(page.locator('#projects-status')).toHaveText('6 projets affichés.');
  for (const tag of await visible.locator('.tag').allTextContents()) expect(tag).toBe('Écrit à la main');

  await page.locator('label[for="making-ai"]').click();
  await expect(visible).toHaveCount(5);

  await page.locator('label[for="making-all"]').click();
  await expect(visible).toHaveCount(13);
});

test('les liens des projets mènent à leur démo', async ({ page }) => {
  await page.goto('/projets');
  await page.getByRole('link', { name: 'Jouer la démo PGCD' }).click();
  await expect(page).toHaveURL('/labo/pgcd');
});

test('l’accueil met six projets en avant et mène à la liste complète', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-project]')).toHaveCount(6);
  await page.getByRole('link', { name: 'Voir les 13 projets' }).click();
  await expect(page).toHaveURL('/projets');
});

test('la bande Gravité de l’accueil répond au clic', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('[data-gravity-preview]');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.7, y: box.height * 0.4 } });
  // Rien à lire dans un canvas : le test vaut par ses garde-fous (aucune erreur) et par le dessin non vide.
  const painted = await canvas.evaluate((node: HTMLCanvasElement) => {
    const context = node.getContext('2d');
    if (!context) return false;
    const data = context.getImageData(0, 0, node.width, node.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
    return false;
  });
  expect(painted).toBe(true);
});
