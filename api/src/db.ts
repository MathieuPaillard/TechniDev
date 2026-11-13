import pg from 'pg';
import { config } from './config/env.js';

// COUNT(*) renvoie un bigint, que pg transmet en chaîne : on le convertit en nombre.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

// Pas d'option ssl : le sslmode de DATABASE_URL décide (SPEC §B7).
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

// Neon coupe les connexions inactives : on journalise sans arrêter le processus.
pool.on('error', (error) => {
  console.error('Connexion PostgreSQL interrompue :', error.message);
});

/** Pool ou client d'une transaction en cours. */
export type Executor = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = [], executor: Executor = pool): Promise<T[]> {
  const result = await executor.query<T>(sql, params);
  return result.rows;
}

/** Exécute `work` dans une transaction : validée s'il réussit, annulée s'il lève une erreur. */
export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let destroy: Error | undefined;
  // pg-pool retire l'écouteur d'erreur du client emprunté : sans celui-ci, une coupure ferait tomber le processus.
  const onError = (error: Error) => console.error('Connexion perdue pendant une transaction :', error.message);
  client.on('error', onError);
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // pg n'annule pas une transaction ouverte au release() : on détruit la connexion.
      console.error('ROLLBACK en échec :', rollbackError instanceof Error ? rollbackError.message : rollbackError);
      destroy = rollbackError instanceof Error ? rollbackError : new Error('ROLLBACK en échec');
    }
    throw error;
  } finally {
    client.off('error', onError);
    client.release(destroy);
  }
}
