import { Router } from 'express';
import { z } from 'zod';
import type { AdminMessageList } from '../contract.js';
import { query } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { MESSAGE_COLUMNS, toAdminMessage, type MessageRow } from '../serializers.js';
import { replyBodySchema } from '../text.js';
import { parseBody, parseId, parseQuery } from '../validation.js';
import { beforeSchema } from './messages.js';

// La modération (SPEC §B2 et §B6.2). Ce routeur se monte derrière requireAdmin : aucune route ici n'est publique.

export const ADMIN_PAGE_SIZE = 50;
/** Garde-fou de la liste d'attente : le plafond d'envoi la tient déjà à 200. */
const PENDING_LIMIT = 500;

const listSchema = z
  .strictObject({
    status: z.enum(['pending', 'published'], { error: 'Indiquez status=pending ou status=published.' }),
    before: beforeSchema.optional(),
  })
  .refine((filters) => filters.status === 'published' || filters.before === undefined, {
    path: ['before'],
    message: 'La suite ne se demande que pour les messages publiés.',
  });

const replySchema = z.strictObject({ body: replyBodySchema });

const router = Router();

router.get('/', async (req, res) => {
  const filters = parseQuery(listSchema, req.query);
  let rows: MessageRow[];
  let nextBefore: number | null = null;
  if (filters.status === 'pending') {
    // La file d'attente entière, du plus ancien au plus récent : le premier arrivé est le premier relu.
    rows = await query<MessageRow>(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE status = 'pending' ORDER BY id ASC LIMIT $1`, [PENDING_LIMIT]);
  } else {
    const found = await query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS}
       FROM messages
       WHERE status = 'published' AND ($1::integer IS NULL OR id < $1)
       ORDER BY id DESC
       LIMIT $2`,
      [filters.before ?? null, ADMIN_PAGE_SIZE + 1],
    );
    rows = found.slice(0, ADMIN_PAGE_SIZE);
    if (found.length > ADMIN_PAGE_SIZE) nextBefore = rows[rows.length - 1]!.id;
  }
  const [counts] = await query<{ pending: number; published: number }>(
    `SELECT count(*) FILTER (WHERE status = 'pending') AS pending,
            count(*) FILTER (WHERE status = 'published') AS published
     FROM messages`,
  );
  const list: AdminMessageList = {
    messages: rows.map(toAdminMessage),
    nextBefore,
    counts: { pending: counts!.pending, published: counts!.published },
  };
  res.status(200).json(list);
});

/** Le message existe-t-il ? Sert à distinguer « introuvable » de « pas dans le bon état » quand rien n'a été modifié. */
async function assertExists(id: number): Promise<void> {
  const found = await query('SELECT 1 FROM messages WHERE id = $1', [id]);
  if (found.length === 0) throw notFound();
}

router.post('/:id/publish', async (req, res) => {
  const id = parseId(req.params.id);
  // L'état est contrôlé par la requête elle-même : deux publications simultanées ne peuvent pas réussir toutes les deux.
  const [row] = await query<MessageRow>(
    `UPDATE messages
     SET status = 'published', published_at = statement_timestamp()
     WHERE id = $1 AND status = 'pending'
     RETURNING ${MESSAGE_COLUMNS}`,
    [id],
  );
  if (!row) {
    await assertExists(id);
    throw new AppError('INVALID_STATE', 'Ce message est déjà publié.');
  }
  res.status(200).json(toAdminMessage(row));
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await query('DELETE FROM messages WHERE id = $1 RETURNING id', [id]);
  if (deleted.length === 0) throw notFound();
  res.status(204).end();
});

router.put('/:id/reply', async (req, res) => {
  const id = parseId(req.params.id);
  const { body } = parseBody(replySchema, req.body);
  const [row] = await query<MessageRow>(
    `UPDATE messages
     SET reply = $2, replied_at = statement_timestamp()
     WHERE id = $1 AND status = 'published'
     RETURNING ${MESSAGE_COLUMNS}`,
    [id, body],
  );
  if (!row) {
    await assertExists(id);
    throw new AppError('INVALID_STATE', 'Ce message attend encore : publiez-le avant de répondre.');
  }
  res.status(200).json(toAdminMessage(row));
});

router.delete('/:id/reply', async (req, res) => {
  const id = parseId(req.params.id);
  // Sans réponse, il n'y a rien à retirer : la demande réussit quand même.
  const updated = await query('UPDATE messages SET reply = NULL, replied_at = NULL WHERE id = $1 RETURNING id', [id]);
  if (updated.length === 0) throw notFound();
  res.status(204).end();
});

export default router;
