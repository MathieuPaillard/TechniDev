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
    expect(await tables()).toEqual(['admins', 'pgmigrations', 'sessions']);
  });

  it('datent les lignes avec statement_timestamp(), jamais now()', async () => {
    const { rows } = await client.query<{ table_name: string; column_default: string }>(
      "SELECT table_name, column_default FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'created_at' AND table_name <> 'pgmigrations' ORDER BY table_name",
    );
    expect(rows.map((row) => row.table_name)).toEqual(['admins', 'sessions']);
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

  it('se défont entièrement, puis se rejouent', async () => {
    await migrate('down');
    expect(await tables()).toEqual(['pgmigrations']);
    expect((await client.query('SELECT 1 FROM pgmigrations')).rowCount).toBe(0);
    await migrate('up');
    expect(await tables()).toEqual(['admins', 'pgmigrations', 'sessions']);
  });
});
