// Migration 1 (SPEC §B5) : le compte administrateur et ses sessions.

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('admins', {
    id: 'id',
    login: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('statement_timestamp()') },
  });
  // Un seul compte (SPEC §B3) : toutes les lignes ont la même valeur indexée, donc la seconde est refusée.
  pgm.sql('CREATE UNIQUE INDEX admins_single_row_idx ON admins ((true))');

  pgm.createTable('sessions', {
    id: 'id',
    admin_id: { type: 'integer', notNull: true, references: 'admins', onDelete: 'CASCADE' },
    // Empreinte SHA-256 du jeton : le jeton lui-même n'est jamais stocké.
    token_hash: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('statement_timestamp()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('sessions');
  pgm.dropTable('admins');
};
