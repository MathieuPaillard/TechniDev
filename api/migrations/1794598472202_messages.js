// Migration 2 (SPEC §B5) : les messages du livre d'or. Chaque règle de la SPEC est aussi une contrainte nommée.

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Les longueurs sont comptées par char_length : des caractères dans une base en UTF8, des octets ailleurs.
  // La migration refuse donc toute autre base, plutôt que de poser des contraintes qui ne veulent plus rien dire.
  pgm.sql(`
    DO $$
    BEGIN
      IF current_setting('server_encoding') <> 'UTF8' THEN
        RAISE EXCEPTION 'La base doit être encodée en UTF8 (elle est en %).', current_setting('server_encoding');
      END IF;
    END
    $$;
  `);

  pgm.createTable('messages', {
    id: 'id',
    // Rattachement à une démo ou à un projet ; nul pour un message général.
    page: { type: 'text' },
    author: { type: 'text', notNull: true },
    body: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'pending' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('statement_timestamp()') },
    published_at: { type: 'timestamptz' },
    reply: { type: 'text' },
    replied_at: { type: 'timestamptz' },
  });

  // char_length compte des points de code, comme l'API.
  pgm.addConstraint('messages', 'messages_page_length', { check: 'page IS NULL OR char_length(page) BETWEEN 1 AND 60' });
  pgm.addConstraint('messages', 'messages_author_length', { check: 'char_length(author) BETWEEN 2 AND 24' });
  pgm.addConstraint('messages', 'messages_body_length', { check: 'char_length(body) BETWEEN 1 AND 600' });
  pgm.addConstraint('messages', 'messages_status_known', { check: "status IN ('pending', 'published')" });
  pgm.addConstraint('messages', 'messages_published_at_matches_status', { check: "(status = 'published') = (published_at IS NOT NULL)" });
  pgm.addConstraint('messages', 'messages_reply_length', { check: 'reply IS NULL OR char_length(reply) BETWEEN 1 AND 600' });
  pgm.addConstraint('messages', 'messages_replied_at_matches_reply', { check: '(reply IS NULL) = (replied_at IS NULL)' });
  // Une réponse ne se pose que sous un message publié.
  pgm.addConstraint('messages', 'messages_reply_only_published', { check: "reply IS NULL OR status = 'published'" });

  // Sert les deux listes : les messages publiés et les messages en attente, dans l'ordre des identifiants.
  pgm.createIndex('messages', ['status', 'id']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('messages');
};
