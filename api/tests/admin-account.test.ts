import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminCredentialsFromEnv, setAdminAccount } from '../src/admin-account.js';
import { pool } from '../src/db.js';
import { dummyCompare, fitsBcrypt, hashPassword, verifyPassword } from '../src/security/passwords.js';
import { adminSession, resetDb, testApp } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const PASSWORD = 'phrase de passe inventée';

describe('lecture de ADMIN_LOGIN et ADMIN_PASSWORD', () => {
  it("ne demande rien quand aucune des deux n'est définie", () => {
    expect(adminCredentialsFromEnv({})).toBeNull();
    expect(adminCredentialsFromEnv({ ADMIN_LOGIN: '', ADMIN_PASSWORD: '' })).toBeNull();
  });

  it('refuse une variable sans l\'autre, en nommant celle qui manque', () => {
    expect(() => adminCredentialsFromEnv({ ADMIN_LOGIN: 'mathieu' })).toThrow(/ADMIN_PASSWORD est absente/);
    expect(() => adminCredentialsFromEnv({ ADMIN_PASSWORD: PASSWORD })).toThrow(/ADMIN_LOGIN est absente/);
    expect(() => adminCredentialsFromEnv({ ADMIN_LOGIN: 'mathieu', ADMIN_PASSWORD: '' })).toThrow(/ADMIN_PASSWORD est absente/);
  });

  it("garde l'identifiant en minuscules, sans espaces autour", () => {
    expect(adminCredentialsFromEnv({ ADMIN_LOGIN: '  Mathieu.P ', ADMIN_PASSWORD: PASSWORD })).toEqual({ login: 'mathieu.p', password: PASSWORD });
  });

  it('prend le mot de passe tel quel', () => {
    expect(adminCredentialsFromEnv({ ADMIN_LOGIN: 'mathieu', ADMIN_PASSWORD: `  ${PASSWORD} ` })?.password).toBe(`  ${PASSWORD} `);
  });

  it('refuse un identifiant trop court, trop long ou aux caractères inattendus', () => {
    for (const ADMIN_LOGIN of ['ab', 'a'.repeat(41), 'mathieu paillard', 'mathieu@example.com', 'éric', 'a/b']) {
      expect(() => adminCredentialsFromEnv({ ADMIN_LOGIN, ADMIN_PASSWORD: PASSWORD }), ADMIN_LOGIN).toThrow(/ADMIN_LOGIN : 3 à 40 caractères/);
    }
    expect(adminCredentialsFromEnv({ ADMIN_LOGIN: 'a-b_c.9', ADMIN_PASSWORD: PASSWORD })?.login).toBe('a-b_c.9');
  });

  it('refuse un mot de passe de moins de 12 caractères, compté en caractères', () => {
    expect(() => adminCredentialsFromEnv({ ADMIN_LOGIN: 'mathieu', ADMIN_PASSWORD: 'onze caract' })).toThrow(/ADMIN_PASSWORD : Au moins 12 caractères/);
    // Six émojis : douze unités UTF-16, mais six caractères.
    expect(() => adminCredentialsFromEnv({ ADMIN_LOGIN: 'mathieu', ADMIN_PASSWORD: '😀'.repeat(6) })).toThrow(/Au moins 12 caractères/);
    expect(adminCredentialsFromEnv({ ADMIN_LOGIN: 'mathieu', ADMIN_PASSWORD: 'douze caract' })).not.toBeNull();
  });

  it('refuse un mot de passe de plus de 72 octets', () => {
    expect(() => adminCredentialsFromEnv({ ADMIN_LOGIN: 'mathieu', ADMIN_PASSWORD: 'a'.repeat(73) })).toThrow(/ADMIN_PASSWORD : Pas plus de 72 octets/);
    expect(adminCredentialsFromEnv({ ADMIN_LOGIN: 'mathieu', ADMIN_PASSWORD: 'a'.repeat(72) })).not.toBeNull();
  });

  it('ne recopie jamais le mot de passe dans le message', () => {
    for (const ADMIN_PASSWORD of ['trop-court', 'z'.repeat(80)]) {
      try {
        adminCredentialsFromEnv({ ADMIN_LOGIN: 'x', ADMIN_PASSWORD });
        expect.unreachable();
      } catch (error) {
        expect((error as Error).message).not.toContain(ADMIN_PASSWORD);
        // Les deux variables sont en faute : les deux sont nommées.
        expect((error as Error).message).toMatch(/ADMIN_LOGIN/);
        expect((error as Error).message).toMatch(/ADMIN_PASSWORD/);
      }
    }
  });
});

describe('création et remplacement du compte', () => {
  const app = testApp();
  const login = (body: { login: string; password: string }) => request(app).post('/api/admin/login').send(body);
  const admins = async () => (await pool.query<{ login: string; password_hash: string }>('SELECT login, password_hash FROM admins')).rows;

  it('crée le compte, avec un mot de passe haché par bcrypt', async () => {
    expect(await setAdminAccount({ login: 'mathieu', password: PASSWORD })).toBe('created');
    const rows = await admins();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.login).toBe('mathieu');
    expect(rows[0]!.password_hash).toMatch(/^\$2b\$10\$/);
    expect(rows[0]!.password_hash).not.toContain(PASSWORD);
    expect((await login({ login: 'mathieu', password: PASSWORD })).status).toBe(204);
  });

  it('remplace le compte : un seul reste, l\'ancien mot de passe ne vaut plus rien', async () => {
    await setAdminAccount({ login: 'mathieu', password: PASSWORD });
    expect(await setAdminAccount({ login: 'mathieu', password: 'une autre phrase de passe' })).toBe('replaced');
    expect(await admins()).toHaveLength(1);
    expect((await login({ login: 'mathieu', password: PASSWORD })).status).toBe(401);
    expect((await login({ login: 'mathieu', password: 'une autre phrase de passe' })).status).toBe(204);
  });

  it("remplace aussi l'identifiant : l'ancien disparaît", async () => {
    await setAdminAccount({ login: 'ancien', password: PASSWORD });
    expect(await setAdminAccount({ login: 'nouveau', password: PASSWORD })).toBe('replaced');
    expect((await admins()).map((row) => row.login)).toEqual(['nouveau']);
    expect((await login({ login: 'ancien', password: PASSWORD })).status).toBe(401);
    expect((await login({ login: 'nouveau', password: PASSWORD })).status).toBe(204);
  });

  it('ferme toutes les sessions en remplaçant le compte', async () => {
    await setAdminAccount({ login: 'mathieu', password: PASSWORD });
    const { rows } = await pool.query<{ id: number }>('SELECT id FROM admins');
    const session = await adminSession(rows[0]!.id);
    expect((await request(app).get('/api/admin/me').set('Cookie', session.cookie)).status).toBe(200);

    await setAdminAccount({ login: 'mathieu', password: PASSWORD });
    expect((await request(app).get('/api/admin/me').set('Cookie', session.cookie)).status).toBe(401);
    expect((await pool.query('SELECT 1 FROM sessions')).rowCount).toBe(0);
  });

  it("garde l'ancien compte si le remplacement échoue en route", async () => {
    await setAdminAccount({ login: 'mathieu', password: PASSWORD });
    // Identifiant nul : l'insertion échoue après la suppression, la transaction annule les deux.
    await expect(setAdminAccount({ login: null as unknown as string, password: PASSWORD })).rejects.toThrow();
    expect((await admins()).map((row) => row.login)).toEqual(['mathieu']);
    expect((await login({ login: 'mathieu', password: PASSWORD })).status).toBe(204);
  });

  it('la base refuse un second compte', async () => {
    await setAdminAccount({ login: 'mathieu', password: PASSWORD });
    await expect(pool.query("INSERT INTO admins (login, password_hash) VALUES ('second', 'x')")).rejects.toMatchObject({
      code: '23505',
      constraint: 'admins_single_row_idx',
    });
    expect(await admins()).toHaveLength(1);
  });
});

describe('mots de passe', () => {
  it('hache avec un sel : deux empreintes du même mot de passe diffèrent', async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(first).not.toBe(second);
    expect(await verifyPassword(PASSWORD, first)).toBe(true);
    expect(await verifyPassword(PASSWORD, second)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}x`, first)).toBe(false);
  });

  it('la comparaison à blanc échoue toujours', async () => {
    expect(await dummyCompare(PASSWORD)).toBe(false);
    expect(await dummyCompare('')).toBe(false);
  });

  it('mesure la limite de bcrypt en octets', () => {
    expect(fitsBcrypt('a'.repeat(72))).toBe(true);
    expect(fitsBcrypt('a'.repeat(73))).toBe(false);
    expect(fitsBcrypt('é'.repeat(36))).toBe(true);
    expect(fitsBcrypt('é'.repeat(37))).toBe(false);
  });
});
