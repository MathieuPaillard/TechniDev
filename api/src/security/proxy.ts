import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

// Proxy signé (SPEC §B7) : Netlify ajoute X-Nf-Sign, un JWS compact HS256 signé avec le secret partagé
// (NETLIFY_SIGNATURE ici). Seule cette signature prouve qu'une requête est passée par Netlify, donc que
// l'en-tête x-nf-client-connection-ip est fiable. Repris de Dépenses partagées, où il a été audité et vérifié en ligne.

declare global {
  namespace Express {
    interface Request {
      /** Renseigné par netlifyProxy : la requête porte une signature Netlify valide. */
      netlifySigned?: boolean;
    }
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function readJson(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** Résultat du contrôle : `hmacOk` distingue une signature fausse (silence) d'une signature exacte au contenu refusé (journal). */
export interface SignatureCheck {
  valid: boolean;
  hmacOk: boolean;
  /** Secondes avant `exp` si la signature est valide (valeur publique, pour le journal). */
  expiresIn?: number;
  /** Revendications absentes ou différentes, quand l'HMAC est exact. */
  problems: string[];
  /** Valeurs publiques reçues, tronquées, pour le journal. */
  siteUrl?: string;
  deployContext?: string;
}

const MAX_LOGGED = 100;
// Marge sur exp : les horloges de Netlify et de Render ne sont pas synchrones.
const EXP_MARGIN_MS = 30_000;
const truncate = (value: unknown) => (typeof value === 'string' ? value.slice(0, MAX_LOGGED) : undefined);

/**
 * Vérifie la signature (temps constant), puis le contenu : `alg` = HS256, `iss` = netlify, `exp` présent et
 * non dépassé (marge de 30 s), `site_url` de même origine que `frontOrigin`, `deploy_context` = production.
 */
export function checkNetlifySignature(
  jws: string | undefined,
  secret: string | undefined,
  frontOrigin: string,
  now = Date.now(),
): SignatureCheck {
  const rejected: SignatureCheck = { valid: false, hmacOk: false, problems: [] };
  if (!jws || !secret) return rejected;
  const parts = jws.split('.');
  if (parts.length !== 3 || !parts.every((part) => BASE64URL.test(part))) return rejected;
  const [header, payload, signature] = parts as [string, string, string];

  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return rejected;

  // Contenu lu seulement une fois la signature vérifiée.
  const problems: string[] = [];
  let siteUrl: string | undefined;
  let expiresIn: number | undefined;
  let deployContext: string | undefined;
  try {
    const { alg } = readJson(header) as { alg?: unknown };
    const claims = readJson(payload) as { iss?: unknown; exp?: unknown; site_url?: unknown; deploy_context?: unknown };
    siteUrl = truncate(claims.site_url);
    deployContext = truncate(claims.deploy_context);
    if (alg !== 'HS256') problems.push('alg');
    if (claims.iss !== 'netlify') problems.push('iss');
    if (claims.exp === undefined) problems.push('exp absent');
    else if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) problems.push('exp invalide');
    else if (claims.exp * 1000 + EXP_MARGIN_MS <= now) problems.push(`exp dépassé de ${Math.round((now - claims.exp * 1000) / 1000)} s`);
    else expiresIn = Math.round((claims.exp * 1000 - now) / 1000);
    if (!sameOrigin(claims.site_url, frontOrigin)) problems.push('site_url');
    if (claims.deploy_context !== 'production') problems.push('deploy_context');
  } catch {
    problems.push('contenu illisible');
  }
  const check: SignatureCheck = { valid: problems.length === 0, hmacOk: true, problems };
  if (expiresIn !== undefined) check.expiresIn = expiresIn;
  if (siteUrl !== undefined) check.siteUrl = siteUrl;
  if (deployContext !== undefined) check.deployContext = deployContext;
  return check;
}

function sameOrigin(value: unknown, origin: string): boolean {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

export interface ProxyOptions {
  secret: string | undefined;
  /** Refuser toute requête sans signature valide (production). */
  required: boolean;
  /** Origine du site (FRONT_URL) que `site_url` doit avoir. */
  frontOrigin: string;
}

/** À monter avant les limites, dont la clé dépend de la signature. Seul GET /api/health s'en passe. */
export function netlifyProxy({ secret, required, frontOrigin }: ProxyOptions): RequestHandler {
  // Casse, chemin et barre finale ne doivent pas tout refuser (comme originGuard).
  const origin = new URL(frontOrigin).origin;
  let lifetimeLogged = false;
  return (req, _res, next) => {
    const check = checkNetlifySignature(req.get('x-nf-sign'), secret, origin);
    req.netlifySigned = check.valid;
    // Une fois par processus : dit combien de temps vaut une signature de Netlify.
    if (check.valid && !lifetimeLogged) {
      lifetimeLogged = true;
      console.log(`Première signature Netlify acceptée : exp dans ${check.expiresIn} s.`);
    }
    // Journal seulement pour une signature exacte au contenu refusé : sans signature ou avec une fausse, les
    // robots qui frappent Render directement rempliraient le journal. Jamais le jeton ni la signature.
    if (check.hmacOk && !check.valid) {
      console.warn(
        `Signature Netlify refusée : revendication(s) en cause : ${check.problems.join(', ')}` +
          ` (site_url=${JSON.stringify(check.siteUrl ?? null)}, deploy_context=${JSON.stringify(check.deployContext ?? null)}).`,
      );
    }
    const isHealthCheck = (req.method === 'GET' || req.method === 'HEAD') && req.path === '/api/health';
    if (required && !req.netlifySigned && !isHealthCheck) {
      throw new AppError('ORIGIN_REJECTED', 'Requête refusée : elle ne provient pas du site.');
    }
    next();
  };
}
