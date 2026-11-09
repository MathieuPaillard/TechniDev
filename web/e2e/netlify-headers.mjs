// En-têtes que Netlify enverra pour les pages, lus dans netlify.toml (à la racine du dépôt) : la même source sert au
// serveur des tests (e2e/server.mjs) et au test des en-têtes. Seul le bloc [[headers]] « for = "/*" » est lu.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** @param {string} repoRoot dossier qui contient netlify.toml @returns {Record<string, string>} */
export function netlifyPageHeaders(repoRoot) {
  const toml = readFileSync(path.join(repoRoot, 'netlify.toml'), 'utf8');
  /** @type {Record<string, string>} */
  const headers = {};
  for (const block of toml.split(/^\s*\[\[headers\]\]\s*$/m).slice(1)) {
    // Le bloc s'arrête à la prochaine table du fichier ([[redirects]], [build]…).
    const body = block.split(/^\s*\[\[?(?!headers\.values\])[^\]]+\]\]?\s*$/m)[0] ?? '';
    if (!/^\s*for\s*=\s*"\/\*"\s*$/m.test(body)) continue;
    const values = body.split(/^\s*\[headers\.values\]\s*$/m)[1];
    if (values === undefined) continue;
    for (const line of values.split('\n')) {
      const match = /^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/.exec(line);
      if (match?.[1] && match[2] !== undefined) headers[match[1]] = match[2];
    }
  }
  if (!headers['Content-Security-Policy']) {
    throw new Error('Content-Security-Policy absente du bloc [[headers]] for = "/*" de netlify.toml');
  }
  return headers;
}
