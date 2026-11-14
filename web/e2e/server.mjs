// Serveur du site construit pour les tests de bout en bout : sert un dossier comme Netlify, avec les en-têtes de
// netlify.toml (dont la politique de sécurité), les adresses sans « .html » et la page 404.
// Avec --api-port, il transmet aussi /api/* à l'API locale, comme la redirection de Netlify.
//   node e2e/server.mjs --port 4410 [--dist .e2e/on] [--api-port 4430]
import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { netlifyPageHeaders } from './netlify-headers.mjs';

const { values } = parseArgs({
  options: { port: { type: 'string' }, dist: { type: 'string' }, 'api-port': { type: 'string' } },
});
const port = Number(values.port);
const apiPort = values['api-port'] === undefined ? null : Number(values['api-port']);
if (!Number.isInteger(port) || (apiPort !== null && !Number.isInteger(apiPort))) {
  console.error('Usage : node e2e/server.mjs --port N [--dist dossier] [--api-port N]');
  process.exit(2);
}

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(webRoot, values.dist ?? 'dist');
const headers = netlifyPageHeaders(path.resolve(webRoot, '..'));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function fileAt(candidate) {
  try {
    return statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/** Adresses propres comme sur Netlify : /labo sert labo.html, /labo/gravite sert labo/gravite.html. */
function resolveStatic(pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (relative.endsWith('/')) relative += 'index';
  for (const suffix of ['', '.html', '/index.html']) {
    const candidate = path.join(dist, relative + suffix);
    if (candidate.startsWith(dist + path.sep) && fileAt(candidate)) return candidate;
  }
  return null;
}

// Relais vers l'API. Une requête à la fois : la base de test (PGlite) n'a qu'une session, deux transactions
// qui se croiseraient s'y mélangeraient.
let queue = Promise.resolve();

function relay(req, res) {
  queue = queue.then(() => forward(req, res)).catch(() => {});
}

function forward(req, res) {
  return new Promise((resolve) => {
    const headers = { ...req.headers, host: `127.0.0.1:${apiPort}` };
    // Chaque test se présente sous sa propre adresse (e2e/fixtures.ts) : l'API compte ses limites par adresse,
    // et lit celle que son proxy lui transmet.
    const client = headers['x-e2e-client'];
    delete headers['x-e2e-client'];
    delete headers['x-forwarded-for'];
    if (typeof client === 'string') headers['x-forwarded-for'] = client;

    const upstream = http.request({ host: '127.0.0.1', port: apiPort, method: req.method, path: req.url, headers }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
      response.once('end', resolve);
      response.once('error', resolve);
    });
    upstream.once('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('API injoignable');
      resolve();
    });
    // Le navigateur est parti : la file ne doit pas rester bloquée.
    res.once('close', resolve);
    req.pipe(upstream);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (apiPort !== null && url.pathname.startsWith('/api/')) {
    relay(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, headers).end();
    return;
  }
  const found = resolveStatic(url.pathname);
  const file = found ?? fileAt(path.join(dist, '404.html'));
  if (!file) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
    return;
  }
  const type = types[path.extname(file)] ?? 'application/octet-stream';
  res.writeHead(found ? 200 : 404, { ...headers, 'Content-Type': type });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Site servi sur http://127.0.0.1:${port}`);
});
