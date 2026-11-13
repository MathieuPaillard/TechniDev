import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { dummyCompare, fitsBcrypt, verifyPassword } from '../security/passwords.js';
import { destroySession, openSession, requireAdmin, setSessionCookie } from '../security/sessions.js';
import { parseBody } from '../validation.js';

// L'identifiant est comparé en minuscules, comme il est gardé (admin-account.ts). Aucune règle de forme ici : une
// saisie qui ne ressemble pas à un identifiant est simplement un identifiant inconnu.
const loginSchema = z.strictObject({
  login: z.string().trim().toLowerCase().min(1).max(100),
  password: z.string().min(1).refine(fitsBcrypt, 'Le mot de passe ne doit pas dépasser 72 octets.'),
});

export interface AdminAuthOptions {
  /** Cookie `Secure` : en production. */
  secureCookie: boolean;
  /** Limite des essais de connexion (SPEC §B3), posée sur la route elle-même. */
  loginLimit: RequestHandler;
}

export function createAdminAuthRouter({ secureCookie, loginLimit }: AdminAuthOptions) {
  const router = Router();

  router.post('/login', loginLimit, async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const [row] = await query<{ id: number; password_hash: string }>('SELECT id, password_hash FROM admins WHERE login = $1', [body.login]);
    // Même message et même durée, que l'identifiant existe ou non.
    const ok = row ? await verifyPassword(body.password, row.password_hash) : await dummyCompare(body.password);
    if (!row || !ok) throw new AppError('INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');
    setSessionCookie(res, await openSession(row.id), secureCookie);
    res.status(204).end();
  });

  router.post('/logout', requireAdmin, async (req, res) => {
    await destroySession(req, res, secureCookie);
    res.status(204).end();
  });

  router.get('/me', requireAdmin, (req, res) => {
    res.status(200).json({ login: req.admin!.login });
  });

  return router;
}
