import { createHmac } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createApp, type AppOptions } from '../src/app.js';
import { pool } from '../src/db.js';
import { createLimits } from '../src/security/limits.js';
import { generateToken, hashToken, SESSION_COOKIE } from '../src/security/sessions.js';
import { TEST_DATABASE_URL } from './test-db.js';

/** Site et secret fictifs des tests du mode production. */
export const FRONT = 'https://technidev.example';
export const SECRET = 'secret-de-test-partage-avec-netlify';

/** Application sans limites de requêtes : les tests enchaînent volontairement les échecs. */
export const testApp = (options: AppOptions = {}) => createApp({ limits: createLimits({ active: false }), ...options });

/** Application réglée comme en production : signature de Netlify exigée, cookie `Secure`. */
export const productionApp = (options: AppOptions = {}) =>
  testApp({ config: { isProduction: true, FRONT_URL: FRONT, NETLIFY_SIGNATURE: SECRET }, ...options });

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * En-tête X-Nf-Sign tel que Netlify le pose : un JWS compact HS256. Les revendications passées remplacent celles
 * par défaut ; `undefined` en retire une.
 */
export function netlifySignature(
  claims: Record<string, unknown> = {},
  options: { secret?: string; header?: Record<string, unknown> } = {},
): string {
  const header = options.header ?? { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: 'netlify',
    exp: Math.floor(Date.now() / 1000) + 300,
    site_url: FRONT,
    deploy_context: 'production',
    ...claims,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', options.secret ?? SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

/** Vide toutes les tables (à appeler dans un beforeEach). */
export async function resetDb(): Promise<void> {
  // Un TRUNCATE sur une vraie base serait irréversible.
  if (process.env.DATABASE_URL !== TEST_DATABASE_URL) {
    throw new Error('resetDb refusé : DATABASE_URL ne pointe pas vers la base de test.');
  }
  await pool.query('TRUNCATE admins, sessions, messages RESTART IDENTITY CASCADE');
}

export const ADMIN = { login: 'mathieu', password: 'un mot de passe assez long' } as const;

/** Insère le compte administrateur directement en base (coût bcrypt réduit : les tests n'ont pas à attendre). */
export async function createAdmin(overrides: { login?: string; password?: string } = {}) {
  const login = overrides.login ?? ADMIN.login;
  const password = overrides.password ?? ADMIN.password;
  const result = await pool.query<{ id: number }>('INSERT INTO admins (login, password_hash) VALUES ($1, $2) RETURNING id', [
    login,
    await bcrypt.hash(password, 4),
  ]);
  return { id: result.rows[0]!.id, login, password };
}

/** Ouvre une session directement en base et renvoie le jeton et l'en-tête Cookie correspondant. */
export async function adminSession(adminId: number, expiresInSeconds = 3600): Promise<{ token: string; cookie: string }> {
  const token = generateToken();
  await pool.query(
    "INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, statement_timestamp() + $3::integer * interval '1 second')",
    [hashToken(token), adminId, expiresInSeconds],
  );
  return { token, cookie: `${SESSION_COOKIE}=${token}` };
}

/** Un administrateur et sa session : l'en-tête Cookie à joindre aux requêtes. */
export async function loggedInAdmin(): Promise<string> {
  const admin = await createAdmin();
  return (await adminSession(admin.id)).cookie;
}

export interface InsertedMessage {
  author?: string;
  body?: string;
  page?: string | null;
  status?: 'pending' | 'published';
  reply?: string | null;
  /** Date d'écriture forcée (ISO 8601). */
  createdAt?: string;
}

/** Insère un message directement en base (sans passer par l'API) et renvoie son identifiant. */
export async function insertMessage(options: InsertedMessage = {}): Promise<number> {
  const status = options.status ?? 'published';
  const reply = options.reply ?? null;
  const result = await pool.query<{ id: number }>(
    `INSERT INTO messages (author, body, page, status, published_at, reply, replied_at, created_at)
     VALUES ($1, $2, $3, $4,
             CASE WHEN $4 = 'published' THEN statement_timestamp() END,
             $5, CASE WHEN $5::text IS NOT NULL THEN statement_timestamp() END,
             COALESCE($6::timestamptz, statement_timestamp()))
     RETURNING id`,
    [options.author ?? 'Ada', options.body ?? 'Belle démo.', options.page ?? null, status, reply, options.createdAt ?? null],
  );
  return result.rows[0]!.id;
}

/** Insère `count` messages d'un coup, dans l'état donné : pour atteindre un plafond sans des centaines de requêtes. */
export async function insertManyMessages(count: number, status: 'pending' | 'published'): Promise<void> {
  await pool.query(
    `INSERT INTO messages (author, body, status, published_at)
     SELECT 'Série', 'Message ' || n, $2, CASE WHEN $2 = 'published' THEN statement_timestamp() END
     FROM generate_series(1, $1::integer) AS n`,
    [count, status],
  );
}
