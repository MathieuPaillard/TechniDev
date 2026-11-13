import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { createLimits } from '../src/security/limits.js';
import { hashToken, SESSION_COOKIE } from '../src/security/sessions.js';
import { ADMIN, adminSession, createAdmin, netlifySignature, productionApp, resetDb, testApp } from './helpers.js';

const app = testApp();

beforeEach(resetDb);
afterAll(() => pool.end());

const login = (body: unknown, target = app) => request(target).post('/api/admin/login').send(body as object);

/** Le cookie de session posé par une réponse : sa valeur et ses attributs. */
function sessionCookie(res: request.Response) {
  const lines: string[] = res.get('Set-Cookie') ?? [];
  const raw = lines.find((line) => line.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return undefined;
  const [pair, ...attributes] = raw.split('; ');
  return { value: pair!.slice(SESSION_COOKIE.length + 1), attributes };
}

const sessionCount = async () => (await pool.query<{ count: number }>('SELECT count(*) AS count FROM sessions')).rows[0]!.count;

describe('connexion', () => {
  it('ouvre une session de 12 heures et pose un cookie réservé aux routes de l\'administration', async () => {
    await createAdmin();
    const res = await login(ADMIN);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const cookie = sessionCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie!.attributes).toContain('HttpOnly');
    expect(cookie!.attributes).toContain('SameSite=Lax');
    expect(cookie!.attributes).toContain('Path=/api/admin');
    // Hors production (http://localhost), le cookie n'est pas marqué Secure : le navigateur le refuserait.
    expect(cookie!.attributes).not.toContain('Secure');
    const expires = cookie!.attributes.find((attribute) => attribute.startsWith('Expires='));
    const remainingMs = new Date(expires!.slice('Expires='.length)).getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan(12 * 3600_000 - 60_000);
    expect(remainingMs).toBeLessThanOrEqual(12 * 3600_000);

    const me = await request(app).get('/api/admin/me').set('Cookie', `${SESSION_COOKIE}=${cookie!.value}`);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ login: 'mathieu' });
  });

  it("ne stocke que l'empreinte du jeton", async () => {
    await createAdmin();
    const cookie = sessionCookie(await login(ADMIN))!;
    const { rows } = await pool.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(hashToken(cookie.value));
    expect(rows[0]!.token_hash).not.toBe(cookie.value);
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('pose un cookie Secure en production', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await createAdmin();
    const res = await request(productionApp()).post('/api/admin/login').set('X-Nf-Sign', netlifySignature()).send(ADMIN);
    vi.restoreAllMocks();
    expect(res.status).toBe(204);
    expect(sessionCookie(res)!.attributes).toContain('Secure');
  });

  it("accepte l'identifiant quelle que soit sa casse, entouré d'espaces", async () => {
    await createAdmin();
    expect((await login({ login: '  Mathieu ', password: ADMIN.password })).status).toBe(204);
  });

  it('répond de la même façon pour un mauvais mot de passe et pour un identifiant inconnu', async () => {
    await createAdmin();
    const wrongPassword = await login({ login: ADMIN.login, password: 'un autre mot de passe' });
    const unknownLogin = await login({ login: 'inconnu', password: ADMIN.password });
    const expected = { error: { code: 'INVALID_CREDENTIALS', message: 'Identifiant ou mot de passe incorrect.' } };
    for (const res of [wrongPassword, unknownLogin]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual(expected);
      expect(sessionCookie(res)).toBeUndefined();
    }
    expect(await sessionCount()).toBe(0);
  });

  it('répond 401 quand aucun compte n\'existe', async () => {
    expect((await login(ADMIN)).status).toBe(401);
  });

  it('compare le mot de passe tel quel, sans retirer d\'espace', async () => {
    await createAdmin();
    expect((await login({ login: ADMIN.login, password: `${ADMIN.password} ` })).status).toBe(401);
    expect((await login({ login: ADMIN.login, password: ADMIN.password.toUpperCase() })).status).toBe(401);
  });

  it('refuse un corps incomplet ou mal formé', async () => {
    await createAdmin();
    const empty = await login({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION');
    expect(empty.body.error.details.map((detail: { path: string }) => detail.path).sort()).toEqual(['login', 'password']);

    for (const body of [{ login: ADMIN.login }, { login: '', password: ADMIN.password }, { login: 42, password: ADMIN.password }, { login: ADMIN.login, password: '' }, [], 'texte']) {
      const res = await login(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await sessionCount()).toBe(0);
  });

  it('refuse un champ inconnu', async () => {
    await createAdmin();
    const res = await login({ ...ADMIN, admin: true });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: 'admin', message: "Le champ « admin » n'est pas reconnu." }]);
  });

  it('refuse un mot de passe de plus de 72 octets au lieu de le tronquer', async () => {
    // Deux mots de passe identiques sur leurs 72 premiers octets : bcrypt les confondrait.
    const password = 'a'.repeat(72);
    await createAdmin({ password });
    expect((await login({ login: ADMIN.login, password })).status).toBe(204);
    const longer = await login({ login: ADMIN.login, password: `${password}b` });
    expect(longer.status).toBe(400);
    expect(longer.body.error.details).toEqual([{ path: 'password', message: 'Le mot de passe ne doit pas dépasser 72 octets.' }]);
    // 37 caractères seulement, mais 74 octets.
    expect((await login({ login: ADMIN.login, password: 'é'.repeat(37) })).status).toBe(400);
  });

  it("n'existe qu'en POST", async () => {
    expect((await request(app).get('/api/admin/login')).status).toBe(404);
  });

  it("refuse une connexion envoyée depuis un autre site", async () => {
    await createAdmin();
    const res = await login(ADMIN).set('Origin', 'https://attaquant.example');
    expect(res.status).toBe(403);
    expect(await sessionCount()).toBe(0);
  });

  it('efface les sessions expirées à chaque connexion', async () => {
    const admin = await createAdmin();
    await adminSession(admin.id, -10);
    await adminSession(admin.id, -1);
    const valid = await adminSession(admin.id, 600);
    expect(await sessionCount()).toBe(3);
    expect((await login(ADMIN)).status).toBe(204);
    expect(await sessionCount()).toBe(2);
    expect((await request(app).get('/api/admin/me').set('Cookie', valid.cookie)).status).toBe(200);
  });
});

describe('session', () => {
  const me = (cookie?: string) => {
    const req = request(app).get('/api/admin/me');
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const unauthenticated = { error: { code: 'UNAUTHENTICATED', message: 'Veuillez vous connecter.' } };

  it('refuse une requête sans cookie, ou avec un jeton inconnu', async () => {
    await createAdmin();
    for (const cookie of [undefined, `${SESSION_COOKIE}=`, `${SESSION_COOKIE}=inconnu`, 'autre_cookie=valeur']) {
      const res = await me(cookie);
      expect(res.status, String(cookie)).toBe(401);
      expect(res.body, String(cookie)).toEqual(unauthenticated);
    }
  });

  it("refuse l'empreinte d'un jeton présentée à la place du jeton", async () => {
    const admin = await createAdmin();
    const { token } = await adminSession(admin.id);
    expect((await me(`${SESSION_COOKIE}=${hashToken(token)}`)).status).toBe(401);
  });

  it('refuse une session expirée', async () => {
    const admin = await createAdmin();
    const expired = await adminSession(admin.id, -1);
    expect((await me(expired.cookie)).status).toBe(401);
    const valid = await adminSession(admin.id, 5);
    expect((await me(valid.cookie)).status).toBe(200);
  });

  it('ferme la session à la déconnexion, et seulement celle-là', async () => {
    const admin = await createAdmin();
    const first = await adminSession(admin.id);
    const second = await adminSession(admin.id);

    const res = await request(app).post('/api/admin/logout').set('Cookie', first.cookie);
    expect(res.status).toBe(204);
    const cleared = sessionCookie(res)!;
    expect(cleared.value).toBe('');
    expect(cleared.attributes).toContain('Path=/api/admin');
    expect(cleared.attributes).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

    expect((await me(first.cookie)).status).toBe(401);
    expect((await me(second.cookie)).status).toBe(200);
    expect(await sessionCount()).toBe(1);
  });

  it('exige une session pour se déconnecter', async () => {
    const res = await request(app).post('/api/admin/logout');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticated);
  });

  it('tombe avec le compte', async () => {
    const admin = await createAdmin();
    const session = await adminSession(admin.id);
    await pool.query('DELETE FROM admins WHERE id = $1', [admin.id]);
    expect((await me(session.cookie)).status).toBe(401);
    expect(await sessionCount()).toBe(0);
  });
});

describe("limite des essais de connexion", () => {
  const limited = () => testApp({ limits: createLimits({ active: true, thresholds: { login: 2 } }) });

  it('bloque après le nombre d\'échecs permis, même avec le bon mot de passe', async () => {
    await createAdmin();
    const target = limited();
    expect((await login({ login: ADMIN.login, password: 'faux mot de passe' }, target)).status).toBe(401);
    expect((await login({ login: 'inconnu', password: 'faux mot de passe' }, target)).status).toBe(401);
    const blocked = await login(ADMIN, target);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: "Trop d'essais de connexion. Réessayez dans un quart d'heure." },
    });
    expect(await sessionCount()).toBe(0);
  });

  it('ne compte pas les connexions réussies', async () => {
    await createAdmin();
    const target = limited();
    for (let i = 0; i < 4; i += 1) {
      expect((await login(ADMIN, target)).status, `connexion ${i + 1}`).toBe(204);
    }
  });

  it('compte aussi les saisies refusées', async () => {
    await createAdmin();
    const target = limited();
    expect((await login({}, target)).status).toBe(400);
    expect((await login({ login: ADMIN.login }, target)).status).toBe(400);
    expect((await login(ADMIN, target)).status).toBe(429);
  });

  it('ne touche pas les autres routes', async () => {
    const admin = await createAdmin();
    const session = await adminSession(admin.id);
    const target = limited();
    await login({ login: ADMIN.login, password: 'faux mot de passe' }, target);
    await login({ login: ADMIN.login, password: 'faux mot de passe' }, target);
    expect((await login(ADMIN, target)).status).toBe(429);
    expect((await request(target).get('/api/admin/me').set('Cookie', session.cookie)).status).toBe(200);
    expect((await request(target).post('/api/admin/logout').set('Cookie', session.cookie)).status).toBe(204);
  });

  it('applique le seuil de la SPEC par défaut : 5 échecs', async () => {
    await createAdmin();
    const target = testApp({ limits: createLimits({ active: true }) });
    for (let i = 0; i < 5; i += 1) {
      expect((await login({ login: ADMIN.login, password: 'faux mot de passe' }, target)).status, `essai ${i + 1}`).toBe(401);
    }
    expect((await login(ADMIN, target)).status).toBe(429);
  });
});
