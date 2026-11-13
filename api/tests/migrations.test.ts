import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Base à part de celle des autres tests : ici, les migrations sont défaites puis rejouées.
const PORT = 5437;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;

let db: PGlite;
let server: PGLiteSocketServer;
let client: pg.Client;

const migrate = (direction: 'up' | 'down') =>
  runner({
    databaseUrl: DATABASE_URL,
    dir: 'migrations',
    direction,
    // Toutes les migrations, dans un sens comme dans l'autre.
    count: Infinity,
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

const tables = async () =>
  (await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")).rows.map(
    (row) => row.table_name,
  );

beforeAll(async () => {
  db = await PGlite.create();
  server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1', maxConnections: 5 });
  await server.start();
  await migrate('up');
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
  await server?.stop();
  await db?.close();
});

describe('migrations', () => {
  it('créent les tables de la SPEC', async () => {
    expect(await tables()).toEqual(['admins', 'messages', 'pgmigrations', 'sessions']);
  });

  it('datent les lignes avec statement_timestamp(), jamais now()', async () => {
    const { rows } = await client.query<{ table_name: string; column_default: string }>(
      "SELECT table_name, column_default FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'created_at' AND table_name <> 'pgmigrations' ORDER BY table_name",
    );
    expect(rows.map((row) => row.table_name)).toEqual(['admins', 'messages', 'sessions']);
    for (const row of rows) expect(row.column_default, row.table_name).toBe('statement_timestamp()');
  });

  it("n'acceptent qu'un compte administrateur", async () => {
    await client.query("INSERT INTO admins (login, password_hash) VALUES ('premier', 'x')");
    await expect(client.query("INSERT INTO admins (login, password_hash) VALUES ('second', 'x')")).rejects.toMatchObject({
      code: '23505',
      constraint: 'admins_single_row_idx',
    });
  });

  it("refusent deux sessions de même empreinte, et une session sans compte", async () => {
    const { rows } = await client.query<{ id: number }>('SELECT id FROM admins');
    const adminId = rows[0]!.id;
    await client.query("INSERT INTO sessions (admin_id, token_hash, expires_at) VALUES ($1, 'empreinte', statement_timestamp())", [adminId]);
    await expect(
      client.query("INSERT INTO sessions (admin_id, token_hash, expires_at) VALUES ($1, 'empreinte', statement_timestamp())", [adminId]),
    ).rejects.toMatchObject({ code: '23505', constraint: 'sessions_token_hash_key' });
    await expect(
      client.query("INSERT INTO sessions (admin_id, token_hash, expires_at) VALUES ($1, 'autre', statement_timestamp())", [adminId + 1000]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('suppriment les sessions avec le compte', async () => {
    expect((await client.query('SELECT 1 FROM sessions')).rowCount).toBe(1);
    await client.query('DELETE FROM admins');
    expect((await client.query('SELECT 1 FROM sessions')).rowCount).toBe(0);
  });

  describe('messages', () => {
    const insert = (columns: string, values: string) => client.query(`INSERT INTO messages (${columns}) VALUES (${values})`);
    const refused = (constraint: string) => ({ code: '23514', constraint });

    it('naissent en attente, sans date de publication ni réponse', async () => {
      const { rows } = await client.query("INSERT INTO messages (author, body) VALUES ('Ada', 'Bravo') RETURNING *");
      expect(rows[0]).toMatchObject({ page: null, status: 'pending', published_at: null, reply: null, replied_at: null });
      expect(rows[0].created_at).toBeInstanceOf(Date);
    });

    it('bornent le pseudo, le texte et le rattachement, en caractères', async () => {
      await expect(insert('author, body', "'a', 'x'")).rejects.toMatchObject(refused('messages_author_length'));
      await expect(insert('author, body', "repeat('a', 25), 'x'")).rejects.toMatchObject(refused('messages_author_length'));
      await expect(insert('author, body', "'Ada', ''")).rejects.toMatchObject(refused('messages_body_length'));
      await expect(insert('author, body', "'Ada', repeat('a', 601)")).rejects.toMatchObject(refused('messages_body_length'));
      await expect(insert('author, body, page', "'Ada', 'x', ''")).rejects.toMatchObject(refused('messages_page_length'));
      await expect(insert('author, body, page', "'Ada', 'x', repeat('p', 61)")).rejects.toMatchObject(refused('messages_page_length'));
      // 24 et 600 émojis : chacun compte pour un caractère, comme dans l'API.
      await insert('author, body', "repeat('😀', 24), repeat('😀', 600)");
    });

    it("n'acceptent que les deux états, et une date de publication qui va avec", async () => {
      await expect(insert('author, body, status', "'Ada', 'x', 'refused'")).rejects.toMatchObject(refused('messages_status_known'));
      await expect(insert('author, body, status', "'Ada', 'x', 'published'")).rejects.toMatchObject(refused('messages_published_at_matches_status'));
      await expect(insert('author, body, published_at', "'Ada', 'x', statement_timestamp()")).rejects.toMatchObject(
        refused('messages_published_at_matches_status'),
      );
      await insert('author, body, status, published_at', "'Ada', 'x', 'published', statement_timestamp()");
    });

    it("n'acceptent une réponse que datée, bornée, et sous un message publié", async () => {
      const published = "'published', statement_timestamp()";
      await expect(insert('author, body, status, published_at, reply', `'Ada', 'x', ${published}, 'Merci'`)).rejects.toMatchObject(
        refused('messages_replied_at_matches_reply'),
      );
      await expect(insert('author, body, status, published_at, replied_at', `'Ada', 'x', ${published}, statement_timestamp()`)).rejects.toMatchObject(
        refused('messages_replied_at_matches_reply'),
      );
      await expect(
        insert('author, body, status, published_at, reply, replied_at', `'Ada', 'x', ${published}, '', statement_timestamp()`),
      ).rejects.toMatchObject(refused('messages_reply_length'));
      await expect(
        insert('author, body, status, published_at, reply, replied_at', `'Ada', 'x', ${published}, repeat('a', 601), statement_timestamp()`),
      ).rejects.toMatchObject(refused('messages_reply_length'));
      await expect(insert('author, body, reply, replied_at', "'Ada', 'x', 'Merci', statement_timestamp()")).rejects.toMatchObject(
        refused('messages_reply_only_published'),
      );
      await insert('author, body, status, published_at, reply, replied_at', `'Ada', 'x', ${published}, 'Merci', statement_timestamp()`);
    });

    it('ont un index sur (status, id)', async () => {
      const { rows } = await client.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'messages_status_id_index'");
      expect(rows[0]?.indexdef).toMatch(/\(status, id\)/);
    });
  });

  it('se défont entièrement, puis se rejouent', async () => {
    await migrate('down');
    expect(await tables()).toEqual(['pgmigrations']);
    expect((await client.query('SELECT 1 FROM pgmigrations')).rowCount).toBe(0);
    await migrate('up');
    expect(await tables()).toEqual(['admins', 'messages', 'pgmigrations', 'sessions']);
  });
});
