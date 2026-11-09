// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Site entièrement statique : aucun rendu côté serveur.
  output: 'static',
  build: { format: 'file' },
  trailingSlash: 'never',
  devToolbar: { enabled: false },
  vite: {
    // Aucun script ni style intégré dans le HTML : la politique de sécurité (netlify.toml) n'autorise que les fichiers du site.
    build: { assetsInlineLimit: 0 },
  },
});
