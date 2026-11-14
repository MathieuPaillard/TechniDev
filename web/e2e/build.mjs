// Construit le site deux fois pour les tests de bout en bout : avec le livre d'or (.e2e/on) et sans (.e2e/off).
// Les deux réponses sont forcées : les tests ne dépendent pas de l'état de netlify.toml.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const astro = path.join(webRoot, 'node_modules', '.bin', 'astro');

for (const mode of ['on', 'off']) {
  const result = spawnSync(astro, ['build', '--outDir', path.join('.e2e', mode)], {
    cwd: webRoot,
    env: { ...process.env, GUESTBOOK: mode, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
