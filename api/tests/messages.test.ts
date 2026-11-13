import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db.js';
import { KNOWN_PAGES } from '../src/pages.js';
import { createLimits } from '../src/security/limits.js';
import { insertManyMessages, insertMessage, netlifySignature, productionApp, resetDb, testApp } from './helpers.js';

const app = testApp();

beforeEach(resetDb);
afterAll(() => pool.end());

const at = (codePoint: number) => String.fromCodePoint(codePoint);
// Le corps est écrit en JSON ici : un nombre ou null se testent comme un objet.
const send = (body: unknown, target = app) =>
  request(target).post('/api/messages').set('Content-Type', 'application/json').send(JSON.stringify(body));
const list = (query: Record<string, string | string[]> = {}) => request(app).get('/api/messages').query(query);
const VALID = { author: 'Ada', body: 'Belle démo, bravo.' };

interface StoredMessage {
  id: number;
  page: string | null;
  author: string;
  body: string;
  status: string;
  published_at: Date | null;
  reply: string | null;
  created_at: Date;
}
const stored = async () => (await pool.query<StoredMessage>('SELECT * FROM messages ORDER BY id')).rows;
const details = (res: request.Response) => res.body.error.details as { path: string; message: string }[];

describe('lecture des messages publiés', () => {
  it('renvoie une liste vide quand personne n\'a écrit', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ messages: [], nextBefore: null });
  });

  it('ne montre que les messages publiés, les plus récents d\'abord, champ par champ', async () => {
    const first = await insertMessage({ author: 'Ada', body: 'Premier', createdAt: '2026-11-01T10:00:00Z' });
    await insertMessage({ author: 'Caché', body: 'En attente', status: 'pending' });
    const third = await insertMessage({ author: 'Grace', body: 'Troisième', page: 'demo:gravite', reply: 'Merci !' });

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.nextBefore).toBeNull();
    expect(res.body.messages.map((message: { id: number }) => message.id)).toEqual([third, first]);

    const [recent, old] = res.body.messages;
    expect(Object.keys(recent).sort()).toEqual(['author', 'body', 'createdAt', 'id', 'page', 'reply']);
    expect(old).toEqual({ id: first, page: null, author: 'Ada', body: 'Premier', createdAt: '2026-11-01T10:00:00.000Z', reply: null });
    expect(recent).toMatchObject({ id: third, page: 'demo:gravite', author: 'Grace', body: 'Troisième' });
    expect(recent.reply.body).toBe('Merci !');
    expect(new Date(recent.reply.repliedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    // Rien de la modération ne sort : ni l'état, ni la date de publication.
    expect(JSON.stringify(res.body)).not.toMatch(/status|published|En attente/);
  });

  it('filtre sur un rattachement', async () => {
    await insertMessage({ body: 'général' });
    const gravity = await insertMessage({ body: 'gravité', page: 'demo:gravite' });
    await insertMessage({ body: 'ondes', page: 'demo:ondes' });
    await insertMessage({ body: 'gravité en attente', page: 'demo:gravite', status: 'pending' });

    const res = await list({ page: 'demo:gravite' });
    expect(res.body.messages.map((message: { id: number }) => message.id)).toEqual([gravity]);
    expect((await list({ page: 'project:depenses' })).body).toEqual({ messages: [], nextBefore: null });
    expect((await list()).body.messages).toHaveLength(3);
  });

  it('donne 30 messages par page, et de quoi demander la suite', async () => {
    await insertManyMessages(65, 'published');
    const first = await list();
    expect(first.body.messages).toHaveLength(30);
    expect(first.body.messages[0].id).toBe(65);
    expect(first.body.nextBefore).toBe(36);

    const second = await list({ before: String(first.body.nextBefore) });
    expect(second.body.messages.map((message: { id: number }) => message.id)).toEqual(Array.from({ length: 30 }, (_, i) => 35 - i));
    expect(second.body.nextBefore).toBe(6);

    const third = await list({ before: String(second.body.nextBefore) });
    expect(third.body.messages.map((message: { id: number }) => message.id)).toEqual([5, 4, 3, 2, 1]);
    expect(third.body.nextBefore).toBeNull();
  });

  it("n'annonce pas de suite quand la page est exactement pleine", async () => {
    await insertManyMessages(30, 'published');
    const res = await list();
    expect(res.body.messages).toHaveLength(30);
    expect(res.body.nextBefore).toBeNull();
  });

  it('garde une suite juste quand des messages sont supprimés entre deux pages', async () => {
    await insertManyMessages(40, 'published');
    const first = await list();
    expect(first.body.nextBefore).toBe(11);
    // Le message qui sert de repère disparaît, et un autre de la page suivante aussi.
    await pool.query('DELETE FROM messages WHERE id IN (11, 5)');
    const second = await list({ before: String(first.body.nextBefore) });
    expect(second.body.messages.map((message: { id: number }) => message.id)).toEqual([10, 9, 8, 7, 6, 4, 3, 2, 1]);
    expect(second.body.nextBefore).toBeNull();
  });

  it('combine le rattachement et la suite', async () => {
    for (let i = 0; i < 33; i += 1) await insertMessage({ page: 'demo:pgcd', body: `pgcd ${i}` });
    await insertMessage({ body: 'général' });
    const first = await list({ page: 'demo:pgcd' });
    expect(first.body.messages).toHaveLength(30);
    const second = await list({ page: 'demo:pgcd', before: String(first.body.nextBefore) });
    expect(second.body.messages).toHaveLength(3);
    expect(second.body.nextBefore).toBeNull();
  });

  it('refuse un rattachement inconnu', async () => {
    for (const page of ['demo:inconnue', 'gravite', '', 'DEMO:gravite', "demo:gravite' OR '1'='1"]) {
      const res = await list({ page });
      expect(res.status, page).toBe(400);
      expect(details(res), page).toEqual([{ path: 'page', message: 'Rattachement inconnu.' }]);
    }
  });

  it('refuse une suite qui n\'est pas un identifiant', async () => {
    for (const before of ['0', '-1', 'abc', '1.5', '01', '2147483648', '99999999999', '1;DROP TABLE messages']) {
      const res = await list({ before });
      expect(res.status, before).toBe(400);
      expect(details(res)[0]?.path, before).toBe('before');
    }
    expect((await list({ before: '2147483647' })).status).toBe(200);
  });

  it('refuse un paramètre inconnu ou répété', async () => {
    const unknown = await list({ limit: '500' });
    expect(unknown.status).toBe(400);
    expect(details(unknown)).toEqual([{ path: 'limit', message: "Le champ « limit » n'est pas reconnu." }]);
    expect((await list({ page: ['demo:gravite', 'demo:ondes'] })).status).toBe(400);
  });
});

describe('envoi d\'un message', () => {
  it('enregistre un message en attente, invisible tant qu\'il n\'est pas publié', async () => {
    const res = await send(VALID);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: 'pending' });

    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ author: 'Ada', body: 'Belle démo, bravo.', page: null, status: 'pending', published_at: null, reply: null });
    expect(Math.abs(rows[0]!.created_at.getTime() - Date.now())).toBeLessThan(60_000);
    expect((await list()).body.messages).toEqual([]);
  });

  it("n'enregistre rien d'autre que le pseudo, le texte, le rattachement et la date", async () => {
    await send(VALID).set('User-Agent', 'NavigateurDeTest/1.0').set('X-Forwarded-For', '203.0.113.50');
    const { rows } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'messages' ORDER BY column_name");
    expect(rows.map((row) => row.column_name)).toEqual(['author', 'body', 'created_at', 'id', 'page', 'published_at', 'replied_at', 'reply', 'status']);
    const dump = JSON.stringify(await stored());
    expect(dump).not.toContain('NavigateurDeTest');
    expect(dump).not.toContain('203.0.113.50');
  });

  it('rattache le message à une démo ou à un projet connus', async () => {
    expect((await send({ ...VALID, page: 'demo:gravite' })).status).toBe(201);
    expect((await send({ ...VALID, page: 'project:depenses' })).status).toBe(201);
    expect((await send({ ...VALID, page: null })).status).toBe(201);
    expect((await stored()).map((row) => row.page)).toEqual(['demo:gravite', 'project:depenses', null]);
  });

  it('accepte chaque rattachement de la liste', async () => {
    expect(KNOWN_PAGES.size).toBe(19);
    for (const page of KNOWN_PAGES) {
      expect((await send({ ...VALID, page })).status, page).toBe(201);
    }
  });

  it('refuse un rattachement inconnu', async () => {
    for (const page of ['demo:inconnue', 'gravite', '', 'project:', 42, ['demo:gravite']]) {
      const res = await send({ ...VALID, page });
      expect(res.status, JSON.stringify(page)).toBe(400);
      expect(details(res)[0]?.path, JSON.stringify(page)).toBe('page');
    }
    expect(await stored()).toHaveLength(0);
  });

  it('met le pseudo et le texte au propre avant de les enregistrer', async () => {
    const res = await send({ author: '  Ada \t  Lovelace ', body: `\n Bonjour,   \r\n\r\n\r\n\r\nc'est e${at(0x301)}le${at(0x301)}gant.\n\n` });
    expect(res.status).toBe(201);
    const [row] = await stored();
    expect(row!.author).toBe('Ada Lovelace');
    expect(row!.body).toBe("Bonjour,\n\nc'est élégant.");
  });

  it('borne le pseudo à 2 à 24 caractères, comptés en caractères', async () => {
    expect((await send({ ...VALID, author: 'ab' })).status).toBe(201);
    expect((await send({ ...VALID, author: 'a'.repeat(24) })).status).toBe(201);
    // 24 émojis : 48 unités UTF-16, mais 24 caractères pour l'API comme pour la base.
    expect((await send({ ...VALID, author: '😀'.repeat(24) })).status).toBe(201);
    for (const author of ['', ' ', 'a', ' a ', 'a'.repeat(25), '😀'.repeat(25), '😀']) {
      const res = await send({ ...VALID, author });
      expect(res.status, JSON.stringify(author)).toBe(400);
      expect(details(res), JSON.stringify(author)).toEqual([{ path: 'author', message: 'Le pseudo doit faire entre 2 et 24 caractères.' }]);
    }
    expect(await stored()).toHaveLength(3);
  });

  it('borne le texte à 600 caractères, comptés en caractères', async () => {
    expect((await send({ ...VALID, body: 'a'.repeat(600) })).status).toBe(201);
    expect((await send({ ...VALID, body: '😀'.repeat(600) })).status).toBe(201);
    const tooLong = await send({ ...VALID, body: 'a'.repeat(601) });
    expect(tooLong.status).toBe(400);
    expect(details(tooLong)).toEqual([{ path: 'body', message: 'Le texte ne doit pas dépasser 600 caractères.' }]);
    for (const body of ['', '   ', '\n\n\t']) {
      const res = await send({ ...VALID, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(details(res), JSON.stringify(body)).toEqual([{ path: 'body', message: 'Le texte est vide.' }]);
    }
    const lengths = await pool.query<{ length: number }>('SELECT char_length(body) AS length FROM messages ORDER BY id');
    expect(lengths.rows.map((row) => row.length)).toEqual([600, 600]);
  });

  it('garde les retours à la ligne du texte, les refuse dans le pseudo', async () => {
    expect((await send({ ...VALID, body: 'Une ligne.\nUne autre.' })).status).toBe(201);
    expect((await stored())[0]!.body).toBe('Une ligne.\nUne autre.');
    const res = await send({ ...VALID, author: 'Ada\nLovelace' });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([{ path: 'author', message: "Un caractère invisible ou de contrôle n'est pas accepté ici." }]);
  });

  it('refuse les caractères de contrôle et ceux qui changent le sens d\'écriture', async () => {
    for (const codePoint of [0x00, 0x07, 0x1b, 0x7f, 0x85, 0x2028, 0x2029, 0x061c, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069]) {
      for (const field of ['author', 'body'] as const) {
        const res = await send({ ...VALID, [field]: `texte${at(codePoint)}caché` });
        expect(res.status, `${field} ${codePoint.toString(16)}`).toBe(400);
        expect(details(res)[0], `${field} ${codePoint.toString(16)}`).toEqual({
          path: field,
          message: "Un caractère invisible ou de contrôle n'est pas accepté ici.",
        });
      }
    }
    expect(await stored()).toHaveLength(0);
  });

  it('refuse une moitié de paire UTF-16 isolée', async () => {
    // JSON.stringify écrit la moitié isolée sous forme d'échappement : le serveur la reçoit telle quelle.
    const res = await send({ ...VALID, body: `abc${'😀'.slice(0, 1)}` });
    expect(res.status).toBe(400);
    expect(details(res)[0]?.path).toBe('body');
  });

  it('refuse les liens, dans le texte comme dans le pseudo', async () => {
    const message = 'Les liens ne sont pas acceptés : retirez les adresses (http://, https://, www.).';
    for (const body of ['Visitez http://exemple.fr', 'https://exemple.fr', 'HTTPS://EXEMPLE.FR', 'allez sur www.exemple.fr vite', 'WWW.EXEMPLE.FR']) {
      const res = await send({ ...VALID, body });
      expect(res.status, body).toBe(400);
      expect(details(res), body).toEqual([{ path: 'body', message }]);
    }
    const author = await send({ ...VALID, author: 'www.exemple.fr' });
    expect(details(author)).toEqual([{ path: 'author', message }]);
    // Un mot qui ressemble n'est pas un lien.
    expect((await send({ ...VALID, body: 'Le protocole http est ancien, awww. Voir exemple.fr' })).status).toBe(201);
  });

  it('signale chaque champ en faute, et les champs manquants', async () => {
    const res = await send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(details(res).map((detail) => detail.path).sort()).toEqual(['author', 'body']);

    const both = await send({ author: 'a', body: '' });
    expect(details(both).map((detail) => detail.path).sort()).toEqual(['author', 'body']);
    for (const body of [null, [], 'texte', 42, { author: 42, body: VALID.body }, { author: VALID.author, body: ['a'] }]) {
      expect((await send(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await stored()).toHaveLength(0);
  });

  it('refuse un champ inconnu', async () => {
    const res = await send({ ...VALID, status: 'published', reply: 'x' });
    expect(res.status).toBe(400);
    expect(details(res).map((detail) => detail.path).sort()).toEqual(['reply', 'status']);
    expect(await stored()).toHaveLength(0);
  });

  it('enregistre tel quel un texte qui ressemble à du code : requêtes paramétrées, échappement au front', async () => {
    const author = "x'; DROP TABLE x;--";
    const body = '<script>alert(1)</script> & <img src=x onerror=alert(1)> ${7*7} {{7*7}}';
    expect((await send({ author, body })).status).toBe(201);
    const [row] = await stored();
    expect(row).toMatchObject({ author, body });
    await pool.query("UPDATE messages SET status = 'published', published_at = statement_timestamp()");
    const res = await list();
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.messages[0]).toMatchObject({ author, body });
  });

  it('refuse un envoi venu d\'un autre site', async () => {
    const res = await send(VALID).set('Origin', 'https://attaquant.example');
    expect(res.status).toBe(403);
    expect(await stored()).toHaveLength(0);
  });

  it("n'accepte que GET et POST", async () => {
    for (const method of ['put', 'patch', 'delete'] as const) {
      expect((await request(app)[method]('/api/messages').send(VALID)).status, method).toBe(404);
    }
    expect((await request(app).get('/api/messages/1')).status).toBe(404);
    expect((await request(app).delete('/api/messages/1')).status).toBe(404);
  });
});

describe('pot de miel', () => {
  it('répond comme si tout allait bien, sans rien enregistrer', async () => {
    const res = await send({ ...VALID, website: 'https://spam.example' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: 'pending' });
    expect(await stored()).toHaveLength(0);
  });

  it('laisse passer le champ vide que le formulaire envoie', async () => {
    expect((await send({ ...VALID, website: '' })).status).toBe(201);
    expect((await send({ ...VALID, body: 'Un autre mot.', website: '   ' })).status).toBe(201);
    expect(await stored()).toHaveLength(2);
  });

  it('ne dispense pas de la validation', async () => {
    expect((await send({ author: 'a', body: '', website: 'x' })).status).toBe(400);
    expect((await send({ ...VALID, website: 'x'.repeat(201) })).status).toBe(400);
  });
});

describe('doublons', () => {
  it("n'enregistre pas deux fois le même message en attente", async () => {
    expect((await send(VALID)).status).toBe(201);
    const again = await send({ author: '  Ada ', body: ' Belle démo, bravo.\n' });
    expect(again.status).toBe(201);
    expect(again.body).toEqual({ status: 'pending' });
    expect(await stored()).toHaveLength(1);
  });

  it('distingue le pseudo, le texte et le rattachement', async () => {
    await send(VALID);
    await send({ ...VALID, author: 'Grace' });
    await send({ ...VALID, body: 'Autre texte.' });
    await send({ ...VALID, page: 'demo:gravite' });
    await send({ ...VALID, page: 'demo:ondes' });
    await send({ ...VALID, page: 'demo:ondes' });
    expect(await stored()).toHaveLength(5);
  });

  it('accepte de nouveau un texte déjà publié', async () => {
    await insertMessage({ ...VALID, status: 'published' });
    expect((await send(VALID)).status).toBe(201);
    expect(await stored()).toHaveLength(2);
  });
});

describe('plafonds', () => {
  const full = { error: { code: 'GUESTBOOK_FULL', message: "Le livre d'or est plein pour le moment. Revenez un peu plus tard." } };

  it('refuse le 201e message en attente', async () => {
    await insertManyMessages(199, 'pending');
    expect((await send(VALID)).status).toBe(201);
    const res = await send({ ...VALID, body: 'Un de trop.' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(full);
    expect(await stored()).toHaveLength(200);
  });

  it('rouvre dès qu\'une place se libère', async () => {
    await insertManyMessages(200, 'pending');
    expect((await send(VALID)).status).toBe(409);
    await pool.query('DELETE FROM messages WHERE id = 1');
    expect((await send(VALID)).status).toBe(201);
  });

  it('refuse tout envoi quand 2 000 messages sont publiés', async () => {
    await insertManyMessages(1999, 'published');
    expect((await send(VALID)).status).toBe(201);
    await insertManyMessages(1, 'published');
    const res = await send({ ...VALID, body: 'Un de trop.' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(full);
  });

  it('répond pareil à un doublon quand le livre est plein : rien de plus à enregistrer', async () => {
    await insertManyMessages(199, 'pending');
    await send(VALID);
    expect((await send(VALID)).status).toBe(201);
    expect(await stored()).toHaveLength(200);
  });

  it('tient le plafond face à des envois simultanés', async () => {
    await insertManyMessages(197, 'pending');
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => send({ ...VALID, body: `Envoi simultané ${i}` })));
    expect(results.filter((res) => res.status === 201)).toHaveLength(3);
    expect(results.filter((res) => res.status === 409)).toHaveLength(5);
    expect(await stored()).toHaveLength(200);
  });
});

describe("limites d'envoi", () => {
  const limited = (thresholds: { messagesHour?: number; messagesDay?: number }) => testApp({ limits: createLimits({ active: true, thresholds }) });
  const numbered = (i: number) => ({ ...VALID, body: `Message numéro ${i}` });

  it('applique les seuils de la SPEC : 3 par heure', async () => {
    const target = testApp({ limits: createLimits({ active: true }) });
    for (let i = 0; i < 3; i += 1) expect((await send(numbered(i), target)).status, `envoi ${i + 1}`).toBe(201);
    const res = await send(numbered(4), target);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: { code: 'TOO_MANY_REQUESTS', message: 'Vous avez déjà envoyé plusieurs messages. Réessayez dans une heure.' } });
    expect(await stored()).toHaveLength(3);
  });

  it('applique la limite de la journée quand celle de l\'heure laisse passer', async () => {
    const target = limited({ messagesHour: 100, messagesDay: 2 });
    expect((await send(numbered(1), target)).status).toBe(201);
    expect((await send(numbered(2), target)).status).toBe(201);
    const res = await send(numbered(3), target);
    expect(res.status).toBe(429);
    expect(res.body.error.message).toBe("Vous avez atteint la limite de messages pour aujourd'hui. Réessayez demain.");
  });

  it("un envoi refusé pour l'heure n'entame pas la journée", async () => {
    const target = limited({ messagesHour: 1, messagesDay: 2 });
    expect((await send(numbered(1), target)).status).toBe(201);
    for (let i = 0; i < 5; i += 1) {
      const res = await send(numbered(2), target);
      expect(res.status).toBe(429);
      // C'est toujours la limite de l'heure qui répond : celle de la journée n'a compté qu'un envoi.
      expect(res.body.error.message).toMatch(/dans une heure/);
    }
  });

  it('ne compte pas une saisie refusée', async () => {
    const target = limited({ messagesHour: 2 });
    for (let i = 0; i < 6; i += 1) expect((await send({ author: 'a', body: '' }, target)).status).toBe(400);
    expect((await send(numbered(1), target)).status).toBe(201);
    expect((await send(numbered(2), target)).status).toBe(201);
    expect((await send(numbered(3), target)).status).toBe(429);
  });

  it('ne compte pas un envoi pris au pot de miel', async () => {
    const target = limited({ messagesHour: 1 });
    for (let i = 0; i < 4; i += 1) expect((await send({ ...VALID, website: 'spam' }, target)).status).toBe(201);
    expect((await send(VALID, target)).status).toBe(201);
    expect(await stored()).toHaveLength(1);
  });

  it('compte un envoi valide même quand rien de plus n\'est enregistré', async () => {
    const target = limited({ messagesHour: 2 });
    expect((await send(VALID, target)).status).toBe(201);
    expect((await send(VALID, target)).status).toBe(201);
    expect((await send(VALID, target)).status).toBe(429);
    expect(await stored()).toHaveLength(1);
  });

  it('ne limite pas la lecture', async () => {
    const target = limited({ messagesHour: 1 });
    await send(VALID, target);
    expect((await send(numbered(2), target)).status).toBe(429);
    for (let i = 0; i < 5; i += 1) expect((await request(target).get('/api/messages')).status).toBe(200);
  });

  it("compte par adresse du visiteur, telle que Netlify la transmet", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const target = productionApp({ limits: createLimits({ active: true, thresholds: { messagesHour: 1 } }) });
    const from = (ip: string, i: number) =>
      request(target).post('/api/messages').set('X-Nf-Sign', netlifySignature()).set('X-Nf-Client-Connection-Ip', ip).send(numbered(i));
    expect((await from('203.0.113.20', 1)).status).toBe(201);
    expect((await from('203.0.113.20', 2)).status).toBe(429);
    expect((await from('203.0.113.21', 3)).status).toBe(201);
    // Même réseau IPv6 (/56) : même compteur.
    expect((await from('2001:db8:1234:5600::1', 4)).status).toBe(201);
    expect((await from('2001:db8:1234:56ff::2', 5)).status).toBe(429);
    vi.restoreAllMocks();
  });

  it('en production, refuse un envoi qui ne passe pas par le site', async () => {
    const res = await send(VALID, productionApp());
    expect(res.status).toBe(403);
    expect(await stored()).toHaveLength(0);
  });
});
