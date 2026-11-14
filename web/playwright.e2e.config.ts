// Tests de bout en bout (npm run e2e) : un vrai navigateur sur le site construit, servi comme Netlify
// (e2e/server.mjs : mêmes en-têtes, mêmes adresses), relié à l'API lancée sur une base PGlite jetable
// (e2e/stack.mjs). Les tests des fonctions pures restent dans playwright.config.ts (npm test).
import { defineConfig } from '@playwright/test';

/** Le site construit avec le livre d'or, relié à l'API. */
export const SITE_PORT = 4420;
/** Le site construit sans le livre d'or : ce qui est en ligne tant que l'API ne l'est pas. */
export const SITE_OFF_PORT = 4421;
const API_PORT = 4430;
const DB_PORT = 4431;

const site = `http://127.0.0.1:${SITE_PORT}`;
const siteOff = `http://127.0.0.1:${SITE_OFF_PORT}`;
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/e2e',
  reporter: [['list']],
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: site,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Rien n'est repris d'un lancement précédent : la base de test repart de zéro à chaque fois.
  webServer: [
    {
      command: `node e2e/stack.mjs --api-port ${API_PORT} --db-port ${DB_PORT} --front ${site}`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: `node e2e/server.mjs --port ${SITE_PORT} --dist .e2e/on --api-port ${API_PORT}`,
      url: `${site}/`,
      reuseExistingServer: false,
    },
    {
      command: `node e2e/server.mjs --port ${SITE_OFF_PORT} --dist .e2e/off`,
      url: `${siteOff}/`,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'bureau', testIgnore: /sans-api\.spec\.ts/, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'telephone', testIgnore: /sans-api\.spec\.ts/, use: phone },
    {
      // La CSS vise 320 px de large : chaque page y tient sans défilement horizontal.
      name: 'petit-ecran',
      testMatch: /pages\.spec\.ts/,
      use: { ...phone, viewport: { width: 320, height: 640 } },
    },
    {
      // Le site tel qu'il se construit tant que l'API n'est pas en ligne : aucune trace du livre d'or.
      name: 'sans-api',
      testMatch: /sans-api\.spec\.ts/,
      use: { baseURL: siteOff, viewport: { width: 1280, height: 800 } },
    },
  ],
});
