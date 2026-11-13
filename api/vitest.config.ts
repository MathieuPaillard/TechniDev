import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './tests/test-db.js';

export default defineConfig({
  test: {
    // Les tests partagent une même base : un fichier à la fois.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
    },
  },
});
