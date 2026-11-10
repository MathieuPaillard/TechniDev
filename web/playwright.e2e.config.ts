// Tests de bout en bout (npm run e2e) : un vrai navigateur sur le site construit, servi comme Netlify
// (e2e/server.mjs : mêmes en-têtes, mêmes adresses). Les tests des fonctions pures restent dans
// playwright.config.ts (npm test).
import { defineConfig } from '@playwright/test';

const PORT = 4420;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/e2e',
  reporter: [['list']],
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node e2e/server.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'bureau', use: { viewport: { width: 1280, height: 800 } } },
    {
      name: 'telephone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      // La CSS vise 320 px de large : chaque page y tient sans défilement horizontal.
      name: 'petit-ecran',
      testMatch: /pages\.spec\.ts/,
      use: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
});
