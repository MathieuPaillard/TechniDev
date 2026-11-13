import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { runner } from 'node-pg-migrate';
import { TEST_DATABASE_URL, TEST_DB_PORT } from './test-db.js';

// Base en mémoire, recréée à chaque exécution : `npm test` n'a besoin de rien d'autre, et ne touche jamais Neon.
export default async function setup() {
  const db = await PGlite.create();
  // Le pool de l'application ouvre jusqu'à 10 connexions, et le runner de migrations une de plus : 20 laisse de la marge.
  const server = new PGLiteSocketServer({ db, port: TEST_DB_PORT, host: '127.0.0.1', maxConnections: 20 });
  await server.start();

  const stop = async () => {
    await server.stop();
    await db.close();
  };

  try {
    await runner({
      databaseUrl: TEST_DATABASE_URL,
      dir: 'migrations',
      direction: 'up',
      migrationsTable: 'pgmigrations',
      log: () => {},
    });
  } catch (error) {
    // Sans ce message, Vitest n'affiche qu'une erreur obscure qui cache la vraie cause.
    console.error('Migrations de test en échec :', error instanceof Error ? error.message : error);
    await stop();
    throw error;
  }

  return stop;
}
