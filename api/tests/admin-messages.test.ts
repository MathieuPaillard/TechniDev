import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { adminSession, insertManyMessages, insertMessage, loggedInAdmin, netlifySignature, productionApp, resetDb, testApp } from './helpers.js';

const app = testApp();
let cookie: string;

beforeEach(async () => {
  await resetDb();
  cookie = await loggedInAdmin();
});
afterAll(() => pool.end());

const at = (codePoint: number) => String.fromCodePoint(codePoint);
const admin = {
  list: (query: Record<string, string>) => request(app).get('/api/admin/messages').query(query).set('Cookie', cookie),
  publish: (id: number | string) => request(app).post(`/api/admin/messages/${id}/publish`).set('Cookie', cookie),
  remove: (id: number | string) => request(app).delete(`/api/admin/messages/${id}`).set('Cookie', cookie),
  reply: (id: number | string, body: unknown) =>
    request(app).put(`/api/admin/messages/${id}/reply`).set('Cookie', cookie).set('Content-Type', 'application/json').send(JSON.stringify(body)),
  removeReply: (id: number | string) => request(app).delete(`/api/admin/messages/${id}/reply`).set('Cookie', cookie),
};
const publicList = async () => (await request(app).get('/api/messages')).body.messages as { id: number; reply: { body: string; repliedAt: string } | null }[];
const rowOf = async (id: number) => (await pool.query('SELECT * FROM messages WHERE id = $1', [id])).rows[0];
const details = (res: request.Response) => res.body.error.details as { path: string; message: string }[];
const ids = (res: request.Response) => res.body.messages.map((message: { id: number }) => message.id);

describe('accès à la modération', () => {
  const routes: [string, 'get' | 'post' | 'put' | 'delete', string][] = [
    ['liste', 'get', '/api/admin/messages?status=pending'],
    ['publication', 'post', '/api/admin/messages/1/publish'],
    ['suppression', 'delete', '/api/admin/messages/1'],
    ['réponse', 'put', '/api/admin/messages/1/reply'],
    ['retrait de la réponse', 'delete', '/api/admin/messages/1/reply'],
  ];

  it('exige une session sur chaque route, sans rien modifier', async () => {
    const id = await insertMessage({ status: 'pending' });
    expect(id).toBe(1);
    for (const [name, method, path] of routes) {
      const res = await request(app)[method](path).send(method === 'put' ? { body: 'Merci' } : undefined);
      expect(res.status, name).toBe(401);
      expect(res.body, name).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Veuillez vous connecter.' } });
    }
    expect(await rowOf(id)).toMatchObject({ status: 'pending', reply: null });
  });

  it('refuse une session expirée ou inconnue', async () => {
    const { rows } = await pool.query<{ id: number }>('SELECT id FROM admins');
    const expired = await adminSession(rows[0]!.id, -1);
    for (const value of [expired.cookie, 'technidev_admin=inconnu']) {
      expect((await request(app).get('/api/admin/messages?status=pending').set('Cookie', value)).status).toBe(401);
    }
  });

  it("ne dit rien d'un message à qui n'a pas de session", async () => {
    // Identifiant absent, mal formé ou existant : la même réponse.
    await insertMessage({ status: 'pending' });
    for (const id of ['1', '999', 'abc']) {
      expect((await request(app).post(`/api/admin/messages/${id}/publish`)).status, id).toBe(401);
      expect((await request(app).delete(`/api/admin/messages/${id}`)).status, id).toBe(401);
    }
  });

  it("refuse une écriture venue d'un autre site, même avec la session", async () => {
    const id = await insertMessage({ status: 'pending' });
    const res = await admin.publish(id).set('Origin', 'https://attaquant.example');
    expect(res.status).toBe(403);
    expect(await rowOf(id)).toMatchObject({ status: 'pending' });
  });

  it('en production, exige aussi la signature du site', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const target = productionApp();
    const unsigned = await request(target).get('/api/admin/messages?status=pending').set('Cookie', cookie);
    expect(unsigned.status).toBe(403);
    const signed = await request(target).get('/api/admin/messages?status=pending').set('Cookie', cookie).set('X-Nf-Sign', netlifySignature());
    expect(signed.status).toBe(200);
    vi.restoreAllMocks();
  });
});

describe('liste de modération', () => {
  it('donne la file d\'attente du plus ancien au plus récent, avec les compteurs', async () => {
    const first = await insertMessage({ author: 'Ada', body: 'Premier', status: 'pending', createdAt: '2026-11-01T10:00:00Z' });
    await insertMessage({ author: 'Publié', status: 'published' });
    const third = await insertMessage({ author: 'Grace', body: 'Troisième', status: 'pending', page: 'demo:ondes' });

    const res = await admin.list({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([first, third]);
    expect(res.body.nextBefore).toBeNull();
    expect(res.body.counts).toEqual({ pending: 2, published: 1 });
    expect(res.body.messages[0]).toEqual({
      id: first,
      page: null,
      author: 'Ada',
      body: 'Premier',
      createdAt: '2026-11-01T10:00:00.000Z',
      reply: null,
      status: 'pending',
      publishedAt: null,
    });
    expect(res.body.messages[1]).toMatchObject({ page: 'demo:ondes', status: 'pending' });
  });

  it('donne les messages publiés, les plus récents d\'abord, avec leur date de publication', async () => {
    const first = await insertMessage({ status: 'published' });
    const second = await insertMessage({ status: 'published', reply: 'Merci' });
    await insertMessage({ status: 'pending' });

    const res = await admin.list({ status: 'published' });
    expect(ids(res)).toEqual([second, first]);
    expect(res.body.counts).toEqual({ pending: 1, published: 2 });
    expect(res.body.messages[0].status).toBe('published');
    expect(new Date(res.body.messages[0].publishedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(res.body.messages[0].reply.body).toBe('Merci');
  });

  it('donne 50 messages publiés par page, et de quoi demander la suite', async () => {
    await insertManyMessages(120, 'published');
    const first = await admin.list({ status: 'published' });
    expect(first.body.messages).toHaveLength(50);
    expect(first.body.nextBefore).toBe(71);
    const second = await admin.list({ status: 'published', before: String(first.body.nextBefore) });
    expect(ids(second)[0]).toBe(70);
    expect(second.body.nextBefore).toBe(21);
    const third = await admin.list({ status: 'published', before: String(second.body.nextBefore) });
    expect(third.body.messages).toHaveLength(20);
    expect(third.body.nextBefore).toBeNull();
    expect(third.body.counts).toEqual({ pending: 0, published: 120 });
  });

  it('donne toute la file d\'attente en une fois', async () => {
    await insertManyMessages(200, 'pending');
    const res = await admin.list({ status: 'pending' });
    expect(res.body.messages).toHaveLength(200);
    expect(ids(res).slice(0, 3)).toEqual([1, 2, 3]);
    expect(res.body.nextBefore).toBeNull();
  });

  it('exige un état connu', async () => {
    for (const query of [{}, { status: 'refused' }, { status: '' }] as Record<string, string>[]) {
      const res = await admin.list(query);
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(details(res), JSON.stringify(query)).toEqual([{ path: 'status', message: 'Indiquez status=pending ou status=published.' }]);
    }
  });

  it('refuse une suite mal formée, un paramètre inconnu, ou une suite sur la file d\'attente', async () => {
    expect((await admin.list({ status: 'published', before: 'abc' })).status).toBe(400);
    expect((await admin.list({ status: 'published', page: 'demo:gravite' })).status).toBe(400);
    const res = await admin.list({ status: 'pending', before: '10' });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([{ path: 'before', message: 'La suite ne se demande que pour les messages publiés.' }]);
  });
});

describe('publication', () => {
  it('publie un message en attente, qui devient visible de tous', async () => {
    const id = await insertMessage({ author: 'Ada', body: 'Bravo', status: 'pending' });
    expect(await publicList()).toEqual([]);

    const res = await admin.publish(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, author: 'Ada', body: 'Bravo', status: 'published', reply: null });
    expect(Math.abs(new Date(res.body.publishedAt).getTime() - Date.now())).toBeLessThan(60_000);
    expect((await publicList()).map((message) => message.id)).toEqual([id]);
  });

  it('garde la date d\'écriture', async () => {
    const id = await insertMessage({ status: 'pending', createdAt: '2026-10-01T08:00:00Z' });
    const res = await admin.publish(id);
    expect(res.body.createdAt).toBe('2026-10-01T08:00:00.000Z');
  });

  it('répond 409 pour un message déjà publié', async () => {
    const id = await insertMessage({ status: 'pending' });
    expect((await admin.publish(id)).status).toBe(200);
    const before = (await rowOf(id)).published_at as Date;
    const again = await admin.publish(id);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: { code: 'INVALID_STATE', message: 'Ce message est déjà publié.' } });
    expect(((await rowOf(id)).published_at as Date).getTime()).toBe(before.getTime());
  });

  it('une seule de deux publications simultanées réussit', async () => {
    const id = await insertMessage({ status: 'pending' });
    const results = await Promise.all([admin.publish(id), admin.publish(id), admin.publish(id)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409, 409]);
  });

  it('répond 404 pour un message absent ou un identifiant mal formé', async () => {
    for (const id of ['999', '0', '-1', 'abc', '1.5', '2147483648']) {
      const res = await admin.publish(id);
      expect(res.status, id).toBe(404);
      expect(res.body, id).toEqual({ error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }
  });
});

describe('suppression', () => {
  it('supprime un message en attente : rien n\'en reste', async () => {
    const id = await insertMessage({ status: 'pending' });
    const res = await admin.remove(id);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await rowOf(id)).toBeUndefined();
  });

  it('supprime un message publié, avec sa réponse', async () => {
    const kept = await insertMessage({ status: 'published' });
    const removed = await insertMessage({ status: 'published', reply: 'Merci' });
    expect((await admin.remove(removed)).status).toBe(204);
    expect((await publicList()).map((message) => message.id)).toEqual([kept]);
    expect((await pool.query('SELECT 1 FROM messages')).rowCount).toBe(1);
  });

  it('répond 404 pour un message absent, déjà supprimé ou mal désigné', async () => {
    const id = await insertMessage({ status: 'pending' });
    expect((await admin.remove(id)).status).toBe(204);
    expect((await admin.remove(id)).status).toBe(404);
    for (const value of ['999', 'abc', '0']) expect((await admin.remove(value)).status, value).toBe(404);
  });
});

describe('réponse', () => {
  it('pose une réponse sous un message publié, visible de tous', async () => {
    const id = await insertMessage({ status: 'published' });
    const res = await admin.reply(id, { body: '  Merci pour ce mot.\n' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: 'published' });
    expect(res.body.reply.body).toBe('Merci pour ce mot.');
    expect(Math.abs(new Date(res.body.reply.repliedAt).getTime() - Date.now())).toBeLessThan(60_000);
    expect((await publicList())[0]!.reply).toEqual(res.body.reply);
  });

  it('remplace la réponse et sa date', async () => {
    const id = await insertMessage({ status: 'published' });
    const first = await admin.reply(id, { body: 'Première version' });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await admin.reply(id, { body: 'Seconde version' });
    expect(second.body.reply.body).toBe('Seconde version');
    expect(new Date(second.body.reply.repliedAt).getTime()).toBeGreaterThan(new Date(first.body.reply.repliedAt).getTime());
    expect((await publicList())[0]!.reply!.body).toBe('Seconde version');
  });

  it('permet les adresses et les retours à la ligne', async () => {
    const id = await insertMessage({ status: 'published' });
    const res = await admin.reply(id, { body: 'Le code est là :\nhttps://exemple.fr/depot' });
    expect(res.status).toBe(200);
    expect(res.body.reply.body).toBe('Le code est là :\nhttps://exemple.fr/depot');
  });

  it('refuse une réponse vide, trop longue ou maquillée', async () => {
    const id = await insertMessage({ status: 'published' });
    const cases: [unknown, string][] = [
      [{ body: '' }, 'Le texte est vide.'],
      [{ body: '  \n ' }, 'Le texte est vide.'],
      [{ body: 'a'.repeat(601) }, 'Le texte ne doit pas dépasser 600 caractères.'],
      [{ body: `abc${at(0x202e)}def` }, "Un caractère invisible ou de contrôle n'est pas accepté ici."],
    ];
    for (const [body, message] of cases) {
      const res = await admin.reply(id, body);
      expect(res.status, message).toBe(400);
      expect(details(res), message).toEqual([{ path: 'body', message }]);
    }
    expect((await admin.reply(id, { body: 'a'.repeat(600) })).status).toBe(200);
  });

  it('refuse un corps mal formé ou un champ inconnu', async () => {
    const id = await insertMessage({ status: 'published' });
    for (const body of [{}, { body: 42 }, { reply: 'Merci' }, { body: 'Merci', status: 'pending' }, null, []]) {
      expect((await admin.reply(id, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await rowOf(id)).reply).toBeNull();
  });

  it('refuse de répondre sous un message qui attend encore', async () => {
    const id = await insertMessage({ status: 'pending' });
    const res = await admin.reply(id, { body: 'Merci' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'INVALID_STATE', message: 'Ce message attend encore : publiez-le avant de répondre.' } });
    expect((await rowOf(id)).reply).toBeNull();
  });

  it('répond 404 pour un message absent', async () => {
    expect((await admin.reply('999', { body: 'Merci' })).status).toBe(404);
    expect((await admin.reply('abc', { body: 'Merci' })).status).toBe(404);
  });

  it('retire la réponse', async () => {
    const id = await insertMessage({ status: 'published', reply: 'Merci' });
    const res = await admin.removeReply(id);
    expect(res.status).toBe(204);
    expect(await rowOf(id)).toMatchObject({ reply: null, replied_at: null, status: 'published' });
    expect((await publicList())[0]!.reply).toBeNull();
  });

  it('accepte de retirer une réponse qui n\'existe pas, mais pas sur un message absent', async () => {
    const id = await insertMessage({ status: 'published' });
    expect((await admin.removeReply(id)).status).toBe(204);
    const pending = await insertMessage({ status: 'pending' });
    expect((await admin.removeReply(pending)).status).toBe(204);
    expect((await admin.removeReply('999')).status).toBe(404);
  });
});

describe('parcours complet', () => {
  it('un message envoyé par un visiteur se relit, se publie, reçoit une réponse, puis se supprime', async () => {
    const sent = await request(app).post('/api/messages').send({ author: 'Ada', body: 'Très belle démo.', page: 'demo:gravite' });
    expect(sent.status).toBe(201);

    const queue = await admin.list({ status: 'pending' });
    expect(queue.body.messages).toHaveLength(1);
    const id = queue.body.messages[0].id as number;

    expect((await admin.publish(id)).status).toBe(200);
    expect((await admin.reply(id, { body: 'Merci Ada.' })).status).toBe(200);

    const visible = await request(app).get('/api/messages').query({ page: 'demo:gravite' });
    expect(visible.body.messages).toHaveLength(1);
    expect(visible.body.messages[0]).toMatchObject({ id, author: 'Ada', body: 'Très belle démo.', page: 'demo:gravite' });
    expect(visible.body.messages[0].reply.body).toBe('Merci Ada.');

    expect((await admin.remove(id)).status).toBe(204);
    expect((await request(app).get('/api/messages')).body).toEqual({ messages: [], nextBefore: null });
    expect((await admin.list({ status: 'published' })).body.counts).toEqual({ pending: 0, published: 0 });
  });
});
