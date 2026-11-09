// Serveur du site construit pour les tests de bout en bout : sert dist/ comme Netlify, avec les en-têtes de
// netlify.toml (dont la politique de sécurité), les adresses sans « .html » et la page 404.
//   node e2e/server.mjs --port 4410
import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { netlifyPageHeaders } from './netlify-headers.mjs';

const { values } = parseArgs({ options: { port: { type: 'string' } } });
const port = Number(values.port);
if (!Number.isInteger(port)) {
  console.error('Usage : node e2e/server.mjs --port N');
  process.exit(2);
}

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(webRoot, 'dist');
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
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
