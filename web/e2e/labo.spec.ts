import type { Locator } from '@playwright/test';
import { expect, plain, test } from './fixtures';

/** Appuie sur une scène à une position donnée en fractions de sa taille (la page défile jusqu'à elle s'il le faut). */
async function press(canvas: Locator, fx: number, fy: number): Promise<void> {
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
}

test.describe('Gravité', () => {
  test('le système de 2020 tourne, un clic y ajoute un astre', async ({ page }) => {
    await page.goto('/labo/gravite');
    const count = page.locator('#gravity-count');
    // Cinq astres au départ, dont deux se touchent : il en reste quatre dès les premiers pas.
    await expect(count).toHaveText('4');
    await expect.poll(async () => Number(plain(await page.locator('#gravity-time').textContent()).replace(/ /g, ''))).toBeGreaterThan(5);

    await page.locator('#gravity-play').click();
    await expect(page.locator('#gravity-play')).toHaveText('Lancer');
    await press(page.locator('#gravity-canvas'), 0.8, 0.25);
    await expect(count).toHaveText('5');
    await expect(page.locator('#gravity-status')).toContainText('5 astres');
  });

  test('les scénarios, le pas à pas et l’effacement', async ({ page }) => {
    await page.goto('/labo/gravite');
    await page.locator('#gravity-play').click();
    await page.locator('label[for="gravity-preset-eight"]').click();
    await expect(page.locator('#gravity-count')).toHaveText('3');
    await expect(page.locator('#gravity-time')).toHaveText('0');
    await page.locator('#gravity-step').click();
    await expect(page.locator('#gravity-time')).toHaveText('1');
    await page.locator('#gravity-random').click();
    await expect(page.locator('#gravity-count')).toHaveText('4');
    await page.locator('#gravity-clear').click();
    await expect(page.locator('#gravity-count')).toHaveText('0');
  });
});

test.describe('Ondes', () => {
  test('deux sources émettent, le mur du son affiche Mach 1,7', async ({ page }) => {
    await page.goto('/labo/ondes');
    await expect(page.locator('#waves-count')).toHaveText('2');
    await expect.poll(async () => Number(await page.locator('#waves-rings').textContent())).toBeGreaterThan(1);
    await expect(page.locator('#waves-source-speed')).toBeDisabled();

    await page.locator('label[for="waves-preset-mach"]').click();
    await expect(page.locator('#waves-count')).toHaveText('1');
    await expect(page.locator('#waves-source-speed')).toBeEnabled();
    await expect(page.locator('#waves-source-speed-value')).toHaveText('Mach 1,70');
    await expect.poll(() => page.locator('#waves-mach').textContent()).toBe('1,7');
  });

  test('un clic pose une source, l’affichage bascule sur les interférences', async ({ page }) => {
    await page.goto('/labo/ondes');
    await press(page.locator('#waves-canvas'), 0.5, 0.2);
    await expect(page.locator('#waves-count')).toHaveText('3');
    await page.locator('label[for="waves-view-field"]').click();
    await expect(page.locator('#waves-view-field')).toBeChecked();
    await page.locator('#waves-clear').click();
    await expect(page.locator('#waves-count')).toHaveText('0');
    // Sans pointeur : le bouton pose une source au hasard.
    await page.locator('#waves-random').click();
    await expect(page.locator('#waves-count')).toHaveText('1');
  });
});

test.describe('Population', () => {
  test('les années passent, un clic sème une plante ou dépose un couple', async ({ page }) => {
    await page.goto('/labo/population');
    // La simulation démarre aussitôt avec 8 personnes : le temps de lire le compteur, il peut y avoir eu des naissances.
    await expect.poll(async () => Number(plain(await page.locator('#population-count').textContent()).replace(/ /g, ''))).toBeGreaterThanOrEqual(8);
    await expect.poll(async () => Number(await page.locator('#population-year').textContent())).toBeGreaterThan(1);

    await page.locator('#population-play').click();
    await expect(page.locator('#population-play')).toHaveText('Lancer');
    const plants = Number(await page.locator('#population-plants').textContent());
    const people = Number(plain(await page.locator('#population-count').textContent()).replace(/ /g, ''));
    await press(page.locator('#population-canvas'), 0.5, 0.5);
    await expect(page.locator('#population-plants')).toHaveText(String(plants + 1));

    await page.locator('label[for="population-tool-couple"]').click();
    await press(page.locator('#population-canvas'), 0.4, 0.4);
    await expect(page.locator('#population-count')).toHaveText(String(people + 2));

    await page.locator('#population-cut').click();
    await expect(page.locator('#population-plants')).toHaveText('0');
    // Sans pointeur : le bouton applique l'outil choisi (ici, le couple) à un endroit tiré au hasard.
    await page.locator('#population-random').click();
    await expect(page.locator('#population-count')).toHaveText(String(people + 4));
  });
});

test.describe('Masse molaire', () => {
  test('le glucose par défaut, puis l’eau tapée au clavier', async ({ page }) => {
    await page.goto('/labo/masse-molaire');
    await expect(page.locator('#molar-display')).toHaveText('C₆H₁₂O₆');
    await expect(page.locator('#molar-status')).toContainText('180,156 grammes par mole');
    await expect(page.locator('.pcell.is-lit')).toHaveCount(3);

    await page.locator('#molar-input').fill('H2O');
    await expect(page.locator('#molar-status')).toContainText('18,015 grammes par mole');
    await expect(page.locator('#molar-rows tr')).toHaveCount(2);
    await expect(page.locator('.pcell[data-symbol="H"]')).toHaveClass(/is-lit/);
  });

  test('le tableau périodique sert de clavier', async ({ page }) => {
    await page.goto('/labo/masse-molaire');
    await page.locator('#molar-clear').click();
    await page.locator('.pcell[data-symbol="Na"]').click();
    await page.locator('.pcell[data-symbol="Cl"]').click();
    await expect(page.locator('#molar-input')).toHaveValue('NaCl');
    await expect(page.locator('#molar-status')).toContainText('58,440 grammes par mole');
    await page.locator('#molar-backspace').click();
    await expect(page.locator('#molar-input')).toHaveValue('Na');
  });

  test('une formule mal écrite dit ce qui ne va pas', async ({ page }) => {
    await page.goto('/labo/masse-molaire');
    await page.locator('#molar-input').fill('Ca(OH');
    await expect(page.locator('#molar-error')).toHaveText('Parenthèse ouverte jamais refermée.');
    await expect(page.locator('#molar-input')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#molar-input').fill('Ca(OH)2');
    await expect(page.locator('#molar-error')).toHaveText('');
    await expect(page.locator('#molar-status')).toContainText('74,092');
  });
});

test.describe('PGCD', () => {
  test('1 071 et 462 donnent 21, en trois divisions', async ({ page }) => {
    await page.goto('/labo/pgcd');
    await expect(page.locator('#gcd-status')).toHaveText(/PGCD de 1.071, 462 : 21\./);
    await expect(page.locator('#gcd-steps li')).toHaveCount(3);
    expect(plain(await page.locator('#gcd-counts').textContent())).toContain('3 divisions ici, contre 11 soustractions');
    expect(plain(await page.locator('#gcd-fraction').textContent())).toBe('1 071 / 462 = 51 / 22');
    expect(plain(await page.locator('#gcd-lcm').textContent())).toBe('23 562');
    await expect(page.locator('.gcd-factor.is-common')).toHaveCount(4); // 3 et 7, dans chacun des deux nombres
  });

  test('les boutons plus et moins, les exemples, une saisie fausse', async ({ page }) => {
    await page.goto('/labo/pgcd');
    await page.locator('[data-gcd-field="0"] [data-gcd-step="1"]').click();
    await expect(page.locator('#gcd-n1')).toHaveValue('1072');
    await expect(page.locator('#gcd-status')).toHaveText(/: 2\.$/);

    await page.locator('[data-gcd-example="84,126,210"]').click();
    await expect(page.locator('[data-gcd-field]:visible')).toHaveCount(3);
    await expect(page.locator('#gcd-status')).toHaveText(/: 42\.$/);

    await page.locator('#gcd-n1').fill('douze');
    await expect(page.locator('#gcd-error1')).toContainText('Un entier de 1 à');
    await expect(page.locator('#gcd-n1')).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('Qui doit quoi', () => {
  test('l’exemple : quatre soldes de somme nulle, trois virements pour solder', async ({ page }) => {
    await page.goto('/labo/qui-doit-quoi');
    const balances = (await page.locator('#ledger-balances li').allTextContents()).map(plain);
    expect(balances).toEqual([
      'Lina doit recevoir 22,78 €',
      'Sacha doit 11,82 €',
      'Noé doit recevoir 30,54 €',
      'Maël doit 41,50 €',
    ]);
    expect(plain(await page.locator('#ledger-sum').textContent())).toContain('Somme des soldes : 0,00 €');
    await expect(page.locator('#ledger-settlements button')).toHaveCount(3);

    for (let i = 0; i < 3; i++) await page.locator('#ledger-settlements button').first().click();
    await expect(page.locator('#ledger-settlements')).toContainText('tout le monde est à l’équilibre');
    await expect(page.locator('#ledger-operations li')).toHaveCount(7);
  });

  test('ajouter une dépense partage les centimes, un montant faux est refusé', async ({ page }) => {
    await page.goto('/labo/qui-doit-quoi');
    await page.locator('#ledger-amount').fill('12 50');
    await page.getByRole('button', { name: 'Ajouter la dépense' }).click();
    await expect(page.locator('#ledger-amount-error')).toContainText('Un montant de 0,01 €');
    await expect(page.locator('#ledger-operations li')).toHaveCount(4);

    await page.locator('#ledger-label').fill('Pizzas');
    await page.locator('#ledger-amount').fill('0,10');
    await page.getByRole('button', { name: 'Ajouter la dépense' }).click();
    await expect(page.locator('#ledger-operations li')).toHaveCount(5);
    expect(plain(await page.locator('#ledger-operations li').last().textContent())).toContain(
      'Parts : 0,03 €, 0,03 €, 0,02 € et 0,02 €.',
    );
    await expect(page.locator('#ledger-status')).toHaveText(/Dépense ajoutée : Pizzas/);
  });

  test('un membre engagé dans une opération ne se retire pas', async ({ page }) => {
    await page.goto('/labo/qui-doit-quoi');
    await page.locator('#ledger-remove-member').click();
    await expect(page.locator('#ledger-member-error')).toContainText('Maël figure dans une opération');
    await page.locator('#ledger-add-member').click();
    await expect(page.locator('#ledger-members input')).toHaveCount(5);
    await expect(page.locator('#ledger-payer option')).toHaveCount(5);
    await page.locator('#ledger-remove-member').click();
    await expect(page.locator('#ledger-members input')).toHaveCount(4);
  });
});
