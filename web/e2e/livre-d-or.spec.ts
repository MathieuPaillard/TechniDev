// Le livre d'or dans un vrai navigateur, contre l'API lancée sur une base jetable (SPEC §B8 et §B9).
// Les tests partagent cette base : chacun écrit sous un pseudo qu'il est seul à utiliser, et ne compte que ses messages.
import type { Locator, Page } from '@playwright/test';
import { loginAdmin, pendingOf, publishNew, reply, uniqueName } from './api';
import { expect, test } from './fixtures';

const TEXT = {
  waking: "Réveil du serveur… cela peut prendre jusqu'à une minute.",
  empty: "Personne n'a encore écrit. Le premier mot est pour vous.",
  unreachable: "Le livre d'or ne répond pas. Le reste du site fonctionne.",
  sent: "Merci. Votre message attend d'être relu avant d'apparaître.",
  invalid: "Le message n'est pas parti : corrigez ce qui est signalé.",
  notSent: "Le livre d'or ne répond pas : votre message n'est pas parti. Il est resté dans le formulaire.",
};

const fields = (page: Page) => ({
  author: page.getByRole('textbox', { name: 'Pseudo', exact: true }),
  subject: page.getByRole('combobox', { name: 'À propos de' }),
  body: page.getByRole('textbox', { name: 'Message', exact: true }),
  submit: page.getByRole('button', { name: 'Envoyer' }),
  status: page.locator('#gb-status'),
  count: page.locator('#gb-count'),
});

const listStatus = (page: Page) => page.locator('#guestbook-status');
const loaded = (page: Page) => expect(page.locator('#guestbook')).toHaveAttribute('data-state', /^(ready|empty)$/);

/** La carte du message de cet auteur. D'autres tests publient en même temps : au besoin, on demande la suite. */
async function cardOf(page: Page, author: string): Promise<Locator> {
  const card = page.locator('.message').filter({ hasText: author });
  const more = page.getByRole('button', { name: 'Afficher la suite' });
  await loaded(page);
  for (let i = 0; i < 20 && (await card.count()) === 0 && (await more.isVisible()); i += 1) {
    const before = await page.locator('.message').count();
    await more.click();
    await expect.poll(() => page.locator('.message').count()).toBeGreaterThan(before);
  }
  await expect(card).toHaveCount(1);
  return card;
}

test.describe("lire le livre d'or", () => {
  test('un message publié se lit avec son auteur, sa date, son sujet et la réponse de Mathieu', async ({ page, request }) => {
    const author = uniqueName('Ada');
    await loginAdmin(request);
    const [id] = await publishNew(request, [{ author, body: 'Première ligne.\nSeconde ligne.', page: 'demo:gravite' }]);
    await reply(request, id!, 'Merci pour ce mot.');

    await page.goto('/livre-d-or');
    const card = await cardOf(page, author);
    await expect(card.locator('.message-author')).toHaveText(author);

    // Le texte garde son retour à la ligne.
    const body = card.locator('.message-body').first();
    expect(await body.evaluate((node) => node.textContent)).toBe('Première ligne.\nSeconde ligne.');
    await expect(body).toHaveCSS('white-space', 'pre-wrap');

    const date = card.locator('time').first();
    await expect(date).toHaveText(/^\d{1,2} \S+ \d{4}$/);
    expect(Number.isNaN(Date.parse((await date.getAttribute('datetime')) ?? ''))).toBe(false);

    await expect(card.getByRole('link', { name: 'À propos de Gravité' })).toHaveAttribute('href', '/labo/gravite');

    const answer = card.locator('.message-reply');
    await expect(answer.locator('.message-reply-author')).toHaveText('Mathieu');
    await expect(answer.locator('.message-body')).toHaveText('Merci pour ce mot.');
  });

  test("un message qui attend d'être relu ne se voit pas", async ({ page, request }) => {
    const author = uniqueName('Attente');
    await request.post('/api/messages', { data: { author, body: 'Pas encore relu.' }, headers: { 'x-e2e-client': '10.200.1.1' } });
    await page.goto('/livre-d-or');
    await loaded(page);
    await expect(page.getByText(author)).toHaveCount(0);
    await expect(page.getByText('Pas encore relu.')).toHaveCount(0);
  });

  test("ce qu'un visiteur écrit s'affiche comme du texte, jamais comme du code", async ({ page, request }) => {
    const author = uniqueName('<b>x</b>');
    const body = `<img src=x onerror="document.title='pirate'"><script>document.title='pirate'</script> &amp; ${author}`;
    await loginAdmin(request);
    await publishNew(request, [{ author, body }]);

    await page.goto('/livre-d-or');
    const card = await cardOf(page, author);
    await expect(card.locator('.message-author')).toHaveText(author);
    expect(await card.locator('.message-body').first().evaluate((node) => node.textContent)).toBe(body);
    await expect(card.locator('img, script, b')).toHaveCount(0);
    await expect(page).toHaveTitle("Livre d'or · TechniDev");
  });

  test('la suite se demande page par page, sans doublon', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'une seule série de 31 messages suffit');
    const prefix = uniqueName('Suite');
    const series = Array.from({ length: 31 }, (_, i) => ({ author: `${prefix}-${i}`, body: `Message ${i} de la série.` }));
    await loginAdmin(request);
    await publishNew(request, series);

    await page.goto('/livre-d-or');
    const more = page.getByRole('button', { name: 'Afficher la suite' });
    await expect(more).toBeVisible();
    await expect(page.locator('.message')).toHaveCount(30);

    await more.click();
    await expect.poll(() => page.locator('.message').count()).toBeGreaterThan(30);
    // La lecture reprend au premier message ajouté.
    await expect(page.locator('.message:focus')).toHaveCount(1);
    expect(await page.locator('.message:focus').evaluate((node) => node.previousElementSibling !== null)).toBe(true);

    for (let i = 0; i < 20 && (await more.isVisible()); i += 1) {
      const before = await page.locator('.message').count();
      await more.click();
      await expect.poll(() => page.locator('.message').count()).toBeGreaterThan(before);
    }
    await expect(more).toBeHidden();
    await expect(page.locator('.message').filter({ hasText: `${prefix}-` })).toHaveCount(31);
    const ids = await page.locator('.message').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.messageId));
    expect(new Set(ids).size).toBe(ids.length);
    // Du plus récent au plus ancien.
    const numbers = ids.map(Number);
    expect([...numbers].sort((a, b) => b - a)).toEqual(numbers);
  });

  test("livre encore vide : la page le dit et invite à écrire", async ({ page }) => {
    await page.route('**/api/messages', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: { messages: [], nextBefore: null } }) : route.continue(),
    );
    await page.goto('/livre-d-or');
    await expect(listStatus(page)).toHaveText(TEXT.empty);
    await expect(page.locator('.message')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Afficher la suite' })).toBeHidden();
    await expect(fields(page).submit).toBeEnabled();
  });

  test('serveur injoignable : la page le dit, le reste fonctionne, et un nouvel essai réussit', async ({ page, guards }) => {
    guards.allowFailure(/\/api\/messages$/);
    let broken = true;
    await page.route('**/api/messages', (route) => (broken && route.request().method() === 'GET' ? route.abort() : route.continue()));

    await page.goto('/livre-d-or');
    await expect(listStatus(page)).toHaveText(TEXT.unreachable);
    await expect(page.locator('#guestbook')).toHaveAttribute('data-state', 'error');
    const retry = page.getByRole('button', { name: 'Réessayer' });
    await expect(retry).toBeVisible();
    // Le reste de la page vit : le gaz change encore.
    await page.locator('[data-gas-cycle]').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-gas', 'ar');

    broken = false;
    await retry.click();
    await loaded(page);
    await expect(retry).toBeHidden();
    await expect(listStatus(page)).not.toHaveText(TEXT.unreachable);
  });

  test('serveur endormi : la page attend son réveil, puis affiche les messages', async ({ page, guards }) => {
    guards.allowStatus(/\/api\/health$/);
    let calls = 0;
    await page.route('**/api/health', (route) => {
      calls += 1;
      return calls <= 2 ? route.fulfill({ status: 502, contentType: 'text/plain', body: 'Bad Gateway' }) : route.continue();
    });
    await page.goto('/livre-d-or');
    await expect(listStatus(page)).toHaveText(TEXT.waking);
    await expect(listStatus(page)).toHaveAttribute('data-state', 'waiting');
    // Deux essais refusés, à 3 secondes d'intervalle, puis le serveur répond.
    await expect(page.locator('#guestbook')).toHaveAttribute('data-state', /^(ready|empty)$/, { timeout: 15_000 });
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  test("un mot sans fin ne fait pas déborder la page", async ({ page, request }) => {
    const author = uniqueName('Large');
    await loginAdmin(request);
    await publishNew(request, [{ author, body: 'W'.repeat(600) }]);
    await page.goto('/livre-d-or');
    const card = await cardOf(page, author);
    await card.scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await card.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});

test.describe("écrire dans le livre d'or", () => {
  test("un message part, attend sa relecture, et l'administrateur le retrouve", async ({ page, request }) => {
    const author = uniqueName('Zoé');
    const f = fields(page);
    await page.goto('/livre-d-or');
    await f.author.fill(author);
    await f.subject.selectOption('demo:gravite');
    await f.body.fill('Très belle démo.\nMerci.');
    await expect(f.count).toHaveText('23 / 600');
    await f.submit.click();

    await expect(f.status).toHaveText(TEXT.sent);
    await expect(f.status).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#gb-live')).toHaveText(TEXT.sent);
    // Le texte est parti, le pseudo reste pour un second message.
    await expect(f.body).toHaveValue('');
    await expect(f.author).toHaveValue(author);
    await expect(f.count).toHaveText('0 / 600');
    await expect(page.locator('.message').filter({ hasText: author })).toHaveCount(0);

    await loginAdmin(request);
    const pending = await pendingOf(request, author);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ body: 'Très belle démo.\nMerci.', page: 'demo:gravite', status: 'pending' });
  });

  test('le formulaire propose le site, chaque démo et chaque projet', async ({ page }) => {
    await page.goto('/livre-d-or');
    const f = fields(page);
    await expect(f.subject).toHaveValue('');
    await expect(f.subject.locator('option').first()).toHaveText('Le site en général');
    await expect(f.subject.locator('optgroup[label="Une démo du labo"] option')).toHaveCount(6);
    await expect(f.subject.locator('optgroup[label="Un projet"] option')).toHaveCount(13);
  });

  test('en venant d’une démo, le sujet est déjà choisi', async ({ page, request }) => {
    const author = uniqueName('Sujet');
    const f = fields(page);
    await page.goto('/livre-d-or?sujet=demo%3Aondes#ecrire');
    await expect(f.subject).toHaveValue('demo:ondes');
    await expect(page.locator('#ecrire')).toBeInViewport();
    await f.author.fill(author);
    await f.body.fill('Un mot sur les ondes.');
    await f.submit.click();
    await expect(f.status).toHaveText(TEXT.sent);
    await loginAdmin(request);
    expect((await pendingOf(request, author))[0]).toMatchObject({ page: 'demo:ondes' });

    // Un sujet inconnu dans l'adresse est ignoré.
    await page.goto('/livre-d-or?sujet=demo%3Ainconnue');
    await expect(f.subject).toHaveValue('');
  });

  test("champs vides : rien ne part, chaque champ dit ce qui manque", async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url());
    });
    const f = fields(page);
    await page.goto('/livre-d-or');
    await f.submit.click();

    await expect(page.locator('#gb-author-error')).toHaveText('Indiquez un pseudo.');
    await expect(page.locator('#gb-body-error')).toHaveText('Écrivez votre message.');
    await expect(f.author).toHaveAttribute('aria-invalid', 'true');
    await expect(f.body).toHaveAttribute('aria-invalid', 'true');
    await expect(f.author).toBeFocused();
    await expect(f.status).toHaveText(TEXT.invalid);
    expect(posts).toEqual([]);

    // L'erreur d'un champ s'efface dès qu'on le corrige.
    await f.author.fill('Ada');
    await expect(page.locator('#gb-author-error')).toBeHidden();
    await expect(f.author).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#gb-body-error')).toBeVisible();
  });

  test("ce que l'API refuse est dit sous le bon champ, et le texte reste", async ({ page, guards }) => {
    guards.allowStatus(/\/api\/messages$/);
    const f = fields(page);
    await page.goto('/livre-d-or');
    await f.author.fill('a');
    await f.body.fill('Allez voir https://exemple.fr');
    await f.submit.click();

    await expect(page.locator('#gb-author-error')).toHaveText('Le pseudo doit faire entre 2 et 24 caractères.');
    await expect(page.locator('#gb-body-error')).toHaveText('Les liens ne sont pas acceptés : retirez les adresses (http://, https://, www.).');
    await expect(f.status).toHaveText(TEXT.invalid);
    await expect(f.status).toHaveAttribute('data-state', 'problem');
    await expect(f.author).toBeFocused();
    await expect(f.body).toHaveValue('Allez voir https://exemple.fr');
  });

  test('le compteur suit le texte et signale le dépassement', async ({ page, guards }) => {
    guards.allowStatus(/\/api\/messages$/);
    const f = fields(page);
    await page.goto('/livre-d-or');
    await expect(f.count).toHaveText('0 / 600');
    await f.body.fill('  Bonjour 😀  ');
    await expect(f.count).toHaveText('9 / 600');
    await expect(f.count).not.toHaveAttribute('data-over', '');

    await f.body.fill('a'.repeat(601));
    await expect(f.count).toHaveText('601 / 600');
    await expect(f.count).toHaveAttribute('data-over', '');
    await f.author.fill(uniqueName('Long'));
    await f.submit.click();
    await expect(page.locator('#gb-body-error')).toHaveText('Le texte ne doit pas dépasser 600 caractères.');
  });

  test("après trois messages dans l'heure, le quatrième est refusé", async ({ page, guards }) => {
    guards.allowStatus(/\/api\/messages$/);
    const f = fields(page);
    await page.goto('/livre-d-or');
    await f.author.fill(uniqueName('Vif'));
    for (let i = 1; i <= 3; i += 1) {
      await f.body.fill(`Message numéro ${i}.`);
      await f.submit.click();
      await expect(f.body).toHaveValue('');
      await expect(f.status).toHaveText(TEXT.sent);
    }
    await f.body.fill('Message numéro 4.');
    await f.submit.click();
    await expect(f.status).toHaveText('Vous avez déjà envoyé plusieurs messages. Réessayez dans une heure.');
    await expect(f.status).toHaveAttribute('data-state', 'problem');
    await expect(f.body).toHaveValue('Message numéro 4.');
  });

  test("livre plein : le formulaire répète ce que dit l'API", async ({ page, guards }) => {
    guards.allowStatus(/\/api\/messages$/);
    const message = "Le livre d'or est plein pour le moment. Revenez un peu plus tard.";
    await page.route('**/api/messages', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 409, json: { error: { code: 'GUESTBOOK_FULL', message } } }) : route.continue(),
    );
    const f = fields(page);
    await page.goto('/livre-d-or');
    await f.author.fill('Ada');
    await f.body.fill('Un mot de trop.');
    await f.submit.click();
    await expect(f.status).toHaveText(message);
    await expect(f.body).toHaveValue('Un mot de trop.');
  });

  test("envoi impossible : le texte reste dans le formulaire", async ({ page, guards }) => {
    guards.allowFailure(/\/api\/messages$/);
    await page.route('**/api/messages', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    const f = fields(page);
    await page.goto('/livre-d-or');
    await f.author.fill('Ada');
    await f.body.fill('Ce texte ne doit pas se perdre.');
    await f.submit.click();
    await expect(f.status).toHaveText(TEXT.notSent);
    await expect(f.body).toHaveValue('Ce texte ne doit pas se perdre.');
    await expect(f.submit).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('le champ piège est hors de portée, et un envoi qui le remplit ne laisse rien', async ({ page, request }) => {
    const author = uniqueName('Robot');
    const f = fields(page);
    await page.goto('/livre-d-or');
    const trap = page.locator('#gb-website');
    await expect(trap).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('.guestbook-trap')).toHaveAttribute('aria-hidden', 'true');
    await expect(trap).not.toBeInViewport();

    await trap.evaluate((node) => {
      (node as HTMLInputElement).value = 'https://spam.example';
    });
    await f.author.fill(author);
    await f.body.fill('Achetez mes produits.');
    await f.submit.click();
    // Le robot ne voit aucune différence.
    await expect(f.status).toHaveText(TEXT.sent);

    await loginAdmin(request);
    expect(await pendingOf(request, author)).toHaveLength(0);
  });

  test('deux appuis sur Envoyer ne font partir qu’un message', async ({ page, request }) => {
    const author = uniqueName('Double');
    const posts: string[] = [];
    page.on('request', (sent) => {
      if (sent.method() === 'POST') posts.push(sent.url());
    });
    const f = fields(page);
    await page.goto('/livre-d-or');
    await f.author.fill(author);
    await f.body.fill('Une seule fois.');
    await f.submit.dblclick();
    await expect(f.status).toHaveText(TEXT.sent);
    expect(posts).toHaveLength(1);
    await loginAdmin(request);
    expect(await pendingOf(request, author)).toHaveLength(1);
  });

  test('au clavier : le champ piège est sauté, Entrée envoie', async ({ page, isMobile }) => {
    test.skip(isMobile, 'navigation au clavier');
    const f = fields(page);
    await page.goto('/livre-d-or');
    await f.author.fill(uniqueName('Clavier'));
    await f.body.fill('Envoyé sans souris.');
    await f.body.focus();
    await page.keyboard.press('Tab');
    await expect(f.submit).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(f.status).toHaveText(TEXT.sent);
    // Le bouton garde le focus pendant et après l'envoi.
    await expect(f.submit).toBeFocused();
  });
});

test.describe('sans JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('la page le dit dans son code, et le formulaire ne peut pas partir', async ({ page, request }) => {
    // Chromium piloté n'affiche pas le contenu de <noscript> : on vérifie qu'il est dans la page servie.
    const html = await (await request.get('/livre-d-or')).text();
    expect(html).toMatch(/<noscript>\s*<p[^>]*>Le livre d'or a besoin de JavaScript pour afficher et envoyer les messages\.<\/p>\s*<\/noscript>/);

    await page.goto('/livre-d-or');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Livre d'or");
    await expect(page.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    await expect(page.locator('.message')).toHaveCount(0);
  });
});
