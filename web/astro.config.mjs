// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import { guestbookEnabled } from './guestbook-flag.mjs';

const guestbook = guestbookEnabled({
  forced: process.env.GUESTBOOK,
  dev: process.argv.includes('dev'),
  netlifyToml: readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8'),
});

export default defineConfig({
  // Site entièrement statique : aucun rendu côté serveur.
  output: 'static',
  build: { format: 'file' },
  trailingSlash: 'never',
  devToolbar: { enabled: false },
  vite: {
    // Aucun script ni style intégré dans le HTML : la politique de sécurité (netlify.toml) n'autorise que les fichiers du site.
    build: { assetsInlineLimit: 0 },
    // Le livre d'or est-il branché ? Lu par src/lib/guestbook/enabled.ts (voir guestbook-flag.mjs).
    define: { __GUESTBOOK__: JSON.stringify(guestbook) },
    // En développement, /api va vers l'API locale : même origine pour le navigateur, comme derrière Netlify.
    server: { proxy: { '/api': 'http://localhost:3000' } },
  },
});
