// Le site construit sans le livre d'or : ce qui est en ligne tant que l'API ne l'est pas (SPEC §0).
// Aucune page ne doit appeler l'API, ni promettre un livre d'or qui ne répondrait pas.
import { expect, PAGES, test } from './fixtures';

test("aucune page n'appelle l'API ni ne propose le livre d'or", async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api')) calls.push(request.url());
  });
  for (const { path } of PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole('link', { name: "Livre d'or" }), path).toHaveCount(0);
    await expect(page.locator('[data-guestbook-block]'), path).toHaveCount(0);
    // Jusqu'en bas : rien ne se charge à l'approche du pied de page.
    await page.locator('footer').scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
});

test("la page du livre d'or dit qu'il n'est pas encore ouvert", async ({ page }) => {
  await page.goto('/livre-d-or');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Livre d'or");
  await expect(page.getByText("Le livre d'or n'est pas encore ouvert.")).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  await page.getByRole('link', { name: 'Aller au labo' }).click();
  await expect(page).toHaveURL('/labo');
});

test('le pied de page ne parle que du gaz retenu', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('Aucun cookie, aucun traceur.');
  await expect(page.locator('footer')).not.toContainText("livre d'or");
});
