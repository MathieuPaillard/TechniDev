import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { MessageList } from '../contract.js';
import { query, transaction } from '../db.js';
import { AppError } from '../errors.js';
import { KNOWN_PAGES } from '../pages.js';
import { MESSAGE_COLUMNS, toMessage, type MessageRow } from '../serializers.js';
import { authorSchema, messageBodySchema } from '../text.js';
import { MAX_ID, parseBody, parseQuery } from '../validation.js';

// Le livre d'or, côté visiteur (SPEC §B3 et §B6.2) : lire les messages publiés, en envoyer un.

export const PAGE_SIZE = 30;
/** Plafonds vérifiés à l'envoi (SPEC §B3). */
export const MAX_PENDING = 200;
export const MAX_PUBLISHED = 2000;
/** Clé du verrou consultatif pris le temps d'un envoi : un nombre arbitraire, propre à cet usage. */
const GUESTBOOK_LOCK = 7_326_001;

const page = z.string().refine((value) => KNOWN_PAGES.has(value), 'Rattachement inconnu.');

/** Identifiant passé dans `before` : la suite d'une liste (partagé avec la modération). */
export const beforeSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/, 'Identifiant invalide.')
  .transform(Number)
  .refine((value) => value <= MAX_ID, 'Identifiant invalide.');

const listSchema = z.strictObject({ page: page.optional(), before: beforeSchema.optional() });

const createSchema = z.strictObject({
  author: authorSchema,
  body: messageBodySchema,
  page: page.nullable().optional(),
  // Pot de miel : un champ caché du formulaire, qu'un visiteur ne remplit pas.
  website: z.string().max(200).optional(),
});

type NewMessage = z.output<typeof createSchema>;

declare global {
  namespace Express {
    interface Locals {
      /** Posé par readNewMessage : le message validé, que la route enregistre. */
      newMessage?: NewMessage;
    }
  }
}

export interface MessagesOptions {
  /** Limites d'envoi par adresse (SPEC §B3), dans l'ordre où elles s'appliquent : l'heure, puis la journée. */
  sendLimits: RequestHandler[];
}

export function createMessagesRouter({ sendLimits }: MessagesOptions) {
  const router = Router();

  router.get('/', async (req, res) => {
    const filters = parseQuery(listSchema, req.query);
    // Une ligne de plus que la page : sa présence dit s'il y a une suite.
    const rows = await query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS}
       FROM messages
       WHERE status = 'published'
         AND ($1::text IS NULL OR page = $1)
         AND ($2::integer IS NULL OR id < $2)
       ORDER BY id DESC
       LIMIT $3`,
      [filters.page ?? null, filters.before ?? null, PAGE_SIZE + 1],
    );
    const shown = rows.slice(0, PAGE_SIZE);
    const list: MessageList = {
      messages: shown.map(toMessage),
      nextBefore: rows.length > PAGE_SIZE ? shown[shown.length - 1]!.id : null,
    };
    res.status(200).json(list);
  });

  // Avant les limites : seul un envoi valide compte, et un champ caché rempli ne compte ni ne s'enregistre.
  const readNewMessage: RequestHandler = (req, res, next) => {
    const message = parseBody(createSchema, req.body);
    if (message.website !== undefined && message.website.trim() !== '') {
      res.status(201).json({ status: 'pending' });
      return;
    }
    res.locals.newMessage = message;
    next();
  };

  router.post('/', readNewMessage, ...sendLimits, async (_req, res) => {
    const message = res.locals.newMessage!;
    const target = message.page ?? null;
    await transaction(async (client) => {
      // Un envoi à la fois : deux envois simultanés ne lisent pas le même décompte. Le verrou tombe avec la transaction.
      await query('SELECT pg_advisory_xact_lock($1::bigint)', [GUESTBOOK_LOCK], client);
      // Doublon d'un message en attente (double clic, nouvel essai après une attente) : rien de plus à enregistrer.
      const duplicates = await query(
        `SELECT 1 FROM messages
         WHERE status = 'pending' AND author = $1 AND body = $2 AND page IS NOT DISTINCT FROM $3
         LIMIT 1`,
        [message.author, message.body, target],
        client,
      );
      if (duplicates.length > 0) return;
      const [counts] = await query<{ pending: number; published: number }>(
        `SELECT count(*) FILTER (WHERE status = 'pending') AS pending,
                count(*) FILTER (WHERE status = 'published') AS published
         FROM messages`,
        [],
        client,
      );
      if (counts!.pending >= MAX_PENDING || counts!.published >= MAX_PUBLISHED) {
        throw new AppError('GUESTBOOK_FULL', "Le livre d'or est plein pour le moment. Revenez un peu plus tard.");
      }
      await query('INSERT INTO messages (author, body, page) VALUES ($1, $2, $3)', [message.author, message.body, target], client);
    });
    res.status(201).json({ status: 'pending' });
  });

  return router;
}
