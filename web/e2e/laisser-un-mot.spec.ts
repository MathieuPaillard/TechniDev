// Le bloc « Laisser un mot » des démos (SPEC §B8) : trois messages au plus, chargés seulement quand le bloc approche.
import { loginAdmin, publishNew, uniqueName } from './api';
import { expect, test } from './fixtures';

const isApiCall = (url: string) => new URL(url).pathname.startsWith('/api/');

test("une démo n'appelle pas l'API tant que le bloc est loin de l'écran", async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (isApiCall(request.url())) calls.push(request.url());
  });
  await page.goto('/labo/gravite');
  await expect(page.locator('.stage canvas')).toBeVisible();
  await page.waitForTimeout(800);
  expect(calls).toEqual([]);

  const block = page.locator('[data-guestbook-block]');
  await block.scrollIntoViewIfNeeded();
  await expect(block).toHaveAttribute('data-state', /^(ready|empty)$/);
  expect(calls.some((url) => url.endsWith('/api/health'))).toBe(true);
  expect(calls.some((url) => url.endsWith('/api/messages?page=demo%3Agravite'))).toBe(true);
});

test('le bloc montre les trois derniers messages de sa démo, et mène au formulaire', async ({ page, request }, testInfo) => {
  // Une démo par projet de test : les deux tournent en même temps sur la même base.
  const slug = testInfo.project.name === 'bureau' ? 'pgcd' : 'masse-molaire';
  const prefix = uniqueName('Bloc');
  await loginAdmin(request);
  await publishNew(request, [
    ...[1, 2, 3, 4].map((i) => ({ author: `${prefix}-${i}`, body: `Mot numéro ${i}.`, page: `demo:${slug}` })),
    { author: `${prefix}-x`, body: 'Un mot sur une autre démo.', page: 'demo:ondes' },
  ]);

  await page.goto(`/labo/${slug}`);
  const block = page.locator('[data-guestbook-block]');
  await block.scrollIntoViewIfNeeded();
  const cards = block.locator('.message');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText(`${prefix}-4`);
  await expect(cards.nth(1)).toContainText(`${prefix}-3`);
  await expect(cards.nth(2)).toContainText(`${prefix}-2`);
  // Tous parlent de cette démo : le sujet n'est pas répété sur chaque carte.
  await expect(block.locator('.message-subject')).toHaveCount(0);
  await expect(block.getByRole('link', { name: "Lire tout le livre d'or" })).toHaveAttribute('href', '/livre-d-or');

  await block.getByRole('link', { name: 'Écrire un mot sur cette démo' }).click();
  await expect(page).toHaveURL(`/livre-d-or?sujet=demo%3A${slug}#ecrire`);
  await expect(page.getByRole('combobox', { name: 'À propos de' })).toHaveValue(`demo:${slug}`);
  await expect(page.locator('#ecrire')).toBeInViewport();
});

test("sans message, le bloc invite à écrire le premier", async ({ page }) => {
  // Aucun test ne publie sur cette démo.
  await page.goto('/labo/population');
  const block = page.locator('[data-guestbook-block]');
  await block.scrollIntoViewIfNeeded();
  await expect(block).toHaveAttribute('data-state', 'empty');
  await expect(block.locator('[data-guestbook-status]')).toHaveText('Pas encore de mot sur cette démo. Le premier est pour vous.');
  await expect(block.locator('.message')).toHaveCount(0);
  await expect(block.getByRole('link', { name: "Lire tout le livre d'or" })).toBeHidden();
  await expect(block.getByRole('link', { name: 'Écrire un mot sur cette démo' })).toBeVisible();
});

test("si le livre d'or ne répond pas, la démo fonctionne quand même", async ({ page, guards }) => {
  guards.allowFailure(/\/api\/messages\?/);
  let broken = true;
  await page.route('**/api/messages?*', (route) => (broken ? route.abort() : route.continue()));
  await page.goto('/labo/ondes');
  const block = page.locator('[data-guestbook-block]');
  await block.scrollIntoViewIfNeeded();
  await expect(block.locator('[data-guestbook-status]')).toHaveText("Le livre d'or ne répond pas. Le reste du site fonctionne.");
  await expect(block).toHaveAttribute('data-state', 'error');
  await expect(page.locator('.stage canvas')).toBeAttached();

  broken = false;
  await block.getByRole('button', { name: 'Réessayer' }).click();
  await expect(block).toHaveAttribute('data-state', /^(ready|empty)$/);
});
