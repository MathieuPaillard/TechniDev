import type { AdminMessage, Message } from './contract.js';

/** Colonnes lues pour construire une réponse : jamais `SELECT *`. */
export const MESSAGE_COLUMNS = 'id, page, author, body, status, created_at, published_at, reply, replied_at';

export interface MessageRow {
  id: number;
  page: string | null;
  author: string;
  body: string;
  status: 'pending' | 'published';
  created_at: Date;
  published_at: Date | null;
  reply: string | null;
  replied_at: Date | null;
}

// Réponses construites champ par champ (SPEC §B6.3) : une colonne ajoutée à la table ne sort pas toute seule.
export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    page: row.page,
    author: row.author,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    reply: row.reply !== null && row.replied_at !== null ? { body: row.reply, repliedAt: row.replied_at.toISOString() } : null,
  };
}

export function toAdminMessage(row: MessageRow): AdminMessage {
  return {
    ...toMessage(row),
    status: row.status,
    publishedAt: row.published_at?.toISOString() ?? null,
  };
}
