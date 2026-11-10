// Tests des fonctions pures (npm test), sans navigateur. Les parcours dans un vrai navigateur sont dans
// playwright.e2e.config.ts (npm run e2e).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  reporter: [['list']],
  forbidOnly: !!process.env.CI,
});
