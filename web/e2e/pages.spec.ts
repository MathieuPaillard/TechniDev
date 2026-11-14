import { expect, PAGES, test } from './fixtures';

for (const { path, title } of PAGES) {
  test(`${path} : la page s'affiche, avec un titre, un contenu principal et sans défilement horizontal`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main#contenu')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'largeur du contenu au-delà de l’écran').toBeLessThanOrEqual(0);
  });
}

test('les pages portent les en-têtes de sécurité de netlify.toml', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  const policy = headers['content-security-policy'] ?? '';
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("style-src 'self'");
  expect(policy).not.toContain('unsafe-inline');
  expect(policy).not.toContain('unsafe-eval');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('no-referrer');
});

test('aucune page ne charge quoi que ce soit hors du site', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.host !== '127.0.0.1:4420') foreign.push(request.url());
  });
  for (const { path } of PAGES) await page.goto(path);
  expect(foreign).toEqual([]);
});

test('une adresse inconnue donne la page 404', async ({ page, guards }) => {
  guards.allowStatus(/\/pas-de-page-ici$/);
  const response = await page.goto('/pas-de-page-ici');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ce tube-là est grillé');
  await page.getByRole('link', { name: 'Revenir à l’accueil' }).or(page.getByRole('link', { name: "Revenir à l'accueil" })).click();
  await expect(page).toHaveURL('/');
});

test('le lien d’évitement mène au contenu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'navigation au clavier');
  await page.goto('/projets');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Aller au contenu' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenu$/);
});

test('la navigation mène au labo, aux projets et au parcours', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('link', { name: 'Labo' }).click();
  await expect(page).toHaveURL('/labo');
  await expect(nav.getByRole('link', { name: 'Labo' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Projets' }).click();
  await expect(page).toHaveURL('/projets');
  await nav.getByRole('link', { name: 'Parcours' }).click();
  await expect(page).toHaveURL('/#parcours');
  await expect(page.getByRole('heading', { name: 'Le parcours' })).toBeVisible();
});

test('le labo mène à chacune des six démos', async ({ page }) => {
  await page.goto('/labo');
  const links = page.locator('.lab-card');
  await expect(links).toHaveCount(6);
  const targets = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
  expect(targets).toEqual([
    '/labo/gravite',
    '/labo/ondes',
    '/labo/population',
    '/labo/masse-molaire',
    '/labo/pgcd',
    '/labo/qui-doit-quoi',
  ]);
});

test('aucun tiret cadratin dans les pages', async ({ request }) => {
  for (const { path } of PAGES) {
    const html = await (await request.get(path)).text();
    expect(html.includes('\u2014'), `tiret cadratin dans ${path}`).toBe(false);
  }
});

test('les mots interdits par le fichier local sont absents de toutes les pages', async ({ request }) => {
  // La liste n'est pas dans le dépôt : elle se donne par la variable E2E_FORBIDDEN_WORDS (mots séparés par des
  // virgules). Sans elle, le test est sauté.
  const words = (process.env.E2E_FORBIDDEN_WORDS ?? '').split(',').map((word) => word.trim().toLowerCase()).filter(Boolean);
  test.skip(words.length === 0, 'E2E_FORBIDDEN_WORDS non définie');
  for (const { path } of PAGES) {
    const html = (await (await request.get(path)).text()).toLowerCase();
    for (const word of words) expect(html.includes(word), `« ${word} » dans ${path}`).toBe(false);
  }
});
