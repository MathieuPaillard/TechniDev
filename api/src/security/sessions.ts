import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { query, type Executor } from '../db.js';
import { AppError } from '../errors.js';

export const SESSION_COOKIE = 'technidev_admin';
/** Le cookie ne part que vers les routes de l'administration : il ne voyage pas avec le livre d'or (SPEC §B3). */
export const SESSION_COOKIE_PATH = '/api/admin';
/** Expiration absolue d'une session : 12 heures. */
export const SESSION_DURATION_SECONDS = 12 * 60 * 60;

declare global {
  namespace Express {
    interface Request {
      /** Renseigné par requireAdmin. */
      admin?: { id: number; login: string };
    }
  }
}

/** Jeton aléatoire de 32 octets, sûr dans un cookie. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Empreinte SHA-256 : seule forme sous laquelle un jeton est stocké en base. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: SESSION_COOKIE_PATH };
}

function readToken(req: Request): string | undefined {
  const value: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export interface OpenedSession {
  token: string;
  expiresAt: Date;
}

/**
 * Enregistre une session et efface celles qui ont expiré. Ne pose pas le cookie. L'expiration est calculée par la
 * base, qui est aussi celle qui la contrôle : une seule horloge.
 */
export async function openSession(adminId: number, executor?: Executor): Promise<OpenedSession> {
  const token = generateToken();
  await query('DELETE FROM sessions WHERE expires_at <= statement_timestamp()', [], executor);
  const [row] = await query<{ expires_at: Date }>(
    `INSERT INTO sessions (token_hash, admin_id, expires_at)
     VALUES ($1, $2, statement_timestamp() + $3::integer * interval '1 second')
     RETURNING expires_at`,
    [hashToken(token), adminId, SESSION_DURATION_SECONDS],
    executor,
  );
  return { token, expiresAt: row!.expires_at };
}

export function setSessionCookie(res: Response, session: OpenedSession, secure: boolean): void {
  res.cookie(SESSION_COOKIE, session.token, { ...cookieOptions(secure), expires: session.expiresAt });
}

/** Supprime la session de la requête et efface le cookie. */
export async function destroySession(req: Request, res: Response, secure: boolean): Promise<void> {
  const token = readToken(req);
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  res.clearCookie(SESSION_COOKIE, cookieOptions(secure));
}

/** Remplit req.admin si le cookie correspond à une session non expirée, sinon 401 UNAUTHENTICATED. */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  const token = readToken(req);
  if (token) {
    const [row] = await query<{ id: number; login: string }>(
      `SELECT admins.id, admins.login
       FROM sessions JOIN admins ON admins.id = sessions.admin_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > statement_timestamp()`,
      [hashToken(token)],
    );
    if (row) {
      req.admin = { id: row.id, login: row.login };
      return next();
    }
  }
  throw new AppError('UNAUTHENTICATED', 'Veuillez vous connecter.');
};
