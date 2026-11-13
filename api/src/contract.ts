// Types échangés avec le site (SPEC §B6.3). Toute modification passe d'abord par la SPEC.

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
