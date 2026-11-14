// Types échangés avec le site (SPEC §B6). Toute modification passe d'abord par la SPEC.
// Ce fichier n'importe rien : le site le lit tel quel (web/src/lib/api/), sans dépendre du reste de l'API.

/** Codes d'erreur du §B6.1. */
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'ORIGIN_REJECTED'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'GUESTBOOK_FULL'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

export interface ValidationDetail {
  /** Le champ en cause ; vide quand l'erreur porte sur le corps entier. */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export interface Message {
  id: number;
  /** `demo:<slug>`, `project:<slug>`, ou null pour un message général. */
  page: string | null;
  author: string;
  body: string;
  /** Date d'écriture, ISO 8601. */
  createdAt: string;
  reply: { body: string; repliedAt: string } | null;
}

export interface MessageList {
  messages: Message[];
  /** Identifiant à passer dans `before` pour la suite ; null s'il n'y en a pas. */
  nextBefore: number | null;
}

/** Vue de l'administrateur : en plus, l'état et la date de publication. */
export interface AdminMessage extends Message {
  status: 'pending' | 'published';
  publishedAt: string | null;
}

export interface AdminMessageList {
  messages: AdminMessage[];
  nextBefore: number | null;
  counts: { pending: number; published: number };
}
