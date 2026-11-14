// L'API pour les tests de bout en bout : tout est local et jetable, rien ne touche Neon ni un fichier .env.
//   1. PGlite en mémoire, servi par le pglite-server de l'API ;
//   2. migrations de l'API (CLI de node-pg-migrate) ;
//   3. compte administrateur de test, au mot de passe tiré au hasard à chaque lancement ;
//   4. API lancée depuis ses sources (tsx src/index.ts), en développement : pas de signature exigée.
// Lancé par Playwright (playwright.e2e.config.ts), qui l'arrête à la fin des tests.
//   node e2e/stack.mjs --api-port 4430 --db-port 4431 --front http://127.0.0.1:4420
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { 'api-port': { type: 'string' }, 'db-port': { type: 'string' }, front: { type: 'string' } },
});
const apiPort = Number(values['api-port']);
const dbPort = Number(values['db-port']);
const front = values.front;
if (!Number.isInteger(apiPort) || !Number.isInteger(dbPort) || !front) {
  console.error('Usage : node e2e/stack.mjs --api-port N --db-port N --front http://127.0.0.1:N');
  process.exit(2);
}

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.resolve(webRoot, '..', 'api');
const workDir = path.join(webRoot, '.e2e');
const logDir = path.join(workDir, 'logs');
mkdirSync(logDir, { recursive: true });

const bin = (name) => path.join(apiDir, 'node_modules', '.bin', name);
for (const tool of ['pglite-server', 'node-pg-migrate', 'tsx']) {
  if (!existsSync(bin(tool))) {
    console.error(`${bin(tool)} manque : lancer « npm ci » dans ${apiDir}.`);
    process.exit(1);
  }
}

const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres?sslmode=disable`;

/**
 * Environnement des processus lancés : une liste blanche. Ni DATABASE_URL héritée, ni variable PG* (que pg
 * utiliserait), ni secret. DOTENV_CONFIG_PATH écarte le .env de l'API, qui désigne la base Neon de développement.
 */
function cleanEnv(extra = {}) {
  const kept = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']) {
    if (process.env[key] !== undefined) kept[key] = process.env[key];
  }
  const env = { ...kept, DOTENV_CONFIG_PATH: '/dev/null', ...extra };
  // Garde-fou : la seule base permise est la PGlite de ce harnais.
  if (env.DATABASE_URL !== undefined && env.DATABASE_URL !== databaseUrl) {
    throw new Error('DATABASE_URL doit viser la PGlite du harnais.');
  }
  return env;
}

const children = [];
function launch(name, command, args, env) {
  const log = openSync(path.join(logDir, `${name}.log`), 'w');
  const child = spawn(command, args, { cwd: apiDir, env, stdio: ['ignore', log, log] });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} s'est arrêté (code ${code}, signal ${signal}). Journal : ${path.join(logDir, `${name}.log`)}`);
      stop(1);
    }
  });
  children.push(child);
  return child;
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  // Un processus qui traîne est tué, puis ce script sort.
  setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 1500).unref();
  Promise.all(children.map((child) => new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve))))).then(
    () => process.exit(code),
  );
}
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

function run(name, command, args, env) {
  const log = openSync(path.join(logDir, `${name}.log`), 'w');
  const result = spawnSync(command, args, { cwd: apiDir, env, stdio: ['ignore', log, log], timeout: 120_000 });
  if (result.status !== 0) {
    console.error(`${name} a échoué (code ${result.status}). Journal : ${path.join(logDir, `${name}.log`)}`);
    stop(1);
    throw new Error(name);
  }
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitUntil(label, check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopping) throw new Error(label);
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  console.error(`${label} : pas prêt après ${timeoutMs / 1000} s (journaux dans ${logDir}).`);
  stop(1);
  throw new Error(label);
}

for (const port of [dbPort, apiPort]) {
  if (await portOpen(port)) {
    console.error(`Le port ${port} est déjà pris : un lancement précédent tourne peut-être encore.`);
    process.exit(1);
  }
}

// Un nombre de connexions confortable : le pool de l'API en ouvre jusqu'à 10, les migrations une de plus.
launch('pglite', bin('pglite-server'), ['--port', String(dbPort), '--host', '127.0.0.1', '--max-connections', '20'], cleanEnv());
await waitUntil('PGlite', () => portOpen(dbPort));

// --envPath /dev/null : la CLI de node-pg-migrate appelle dotenv et lirait sinon le .env de l'API.
run('migrations', bin('node-pg-migrate'), ['up', '--migrations-dir', 'migrations', '--envPath', '/dev/null'], cleanEnv({ DATABASE_URL: databaseUrl }));

// Le compte de test : son mot de passe change à chaque lancement et ne sort pas du dossier .e2e (ignoré par git).
const admin = { login: 'e2e-admin', password: randomBytes(18).toString('base64url') };
run('compte', bin('tsx'), ['src/create-admin.ts'], cleanEnv({ DATABASE_URL: databaseUrl, ADMIN_LOGIN: admin.login, ADMIN_PASSWORD: admin.password }));
writeFileSync(path.join(workDir, 'admin.json'), JSON.stringify(admin), { mode: 0o600 });

launch(
  'api',
  bin('tsx'),
  ['src/index.ts'],
  cleanEnv({ NODE_ENV: 'development', PORT: String(apiPort), DATABASE_URL: databaseUrl, FRONT_URL: front }),
);
await waitUntil('API', async () => (await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok);
console.log(`API de test sur http://127.0.0.1:${apiPort}, PGlite sur ${dbPort}.`);
