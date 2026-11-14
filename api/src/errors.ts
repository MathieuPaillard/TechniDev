import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import pg from 'pg';
import { z } from 'zod';
import type { ApiErrorBody, ErrorCode, ValidationDetail } from './contract.js';

export type { ApiErrorBody, ErrorCode, ValidationDetail };

// Codes et statuts du tableau du §B6.1 de la SPEC. Le type exige un statut pour chaque code du contrat, et aucun autre.
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ORIGIN_REJECTED: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  GUESTBOOK_FULL: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
};

/** Taille maximale d'un corps de requête, en ko (SPEC §B6). */
export const MAX_BODY_KB = 8;
/** Une erreur VALIDATION donne au plus 20 détails (SPEC §B6.1) : sans cela, un corps piégé gonflerait la réponse. */
export const MAX_VALIDATION_DETAILS = 20;

/** Erreur prévue : le statut découle du code, le message est en français et affichable tel quel. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  // VALIDATION n'accepte qu'une liste de détails : le type interdit d'y glisser autre chose, que la borne ne verrait pas.
  constructor(code: 'VALIDATION', message: string, details?: ValidationDetail[]);
  constructor(code: Exclude<ErrorCode, 'VALIDATION'>, message: string, details?: unknown);
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    // Borne unique : toute erreur VALIDATION passe ici, quel que soit le chemin qui la construit.
    this.details = code === 'VALIDATION' && Array.isArray(details) ? details.slice(0, MAX_VALIDATION_DETAILS) : details;
  }
}

export const notFound = () => new AppError('NOT_FOUND', 'Élément introuvable.');

export function validationError(details: ValidationDetail[] | string, path = ''): AppError {
  const list = typeof details === 'string' ? [{ path, message: details }] : details;
  return new AppError('VALIDATION', 'Certaines données sont invalides.', list);
}

export function zodDetails(error: z.ZodError): ValidationDetail[] {
  return error.issues.flatMap((issue): ValidationDetail[] => {
    // Champ inconnu (z.strictObject) : un détail par clé, dont le path est le nom du champ (SPEC §B6.1).
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: [...issue.path, key].join('.'),
        message: `Le champ « ${key} » n'est pas reconnu.`,
      }));
    }
    return [{ path: issue.path.join('.'), message: issue.message }];
  });
}

// Contrainte PostgreSQL -> erreur de la SPEC. La validation de l'API passe avant : ces traductions sont un filet,
// pour qu'une valeur refusée par la base donne un 400 lisible plutôt qu'un 500.
const CONSTRAINT_ERRORS: Record<string, () => AppError> = {
  messages_author_length: () => validationError('Le pseudo doit faire entre 2 et 24 caractères.', 'author'),
  messages_body_length: () => validationError('Le texte doit faire entre 1 et 600 caractères.', 'body'),
  messages_page_length: () => validationError('Rattachement inconnu.', 'page'),
  messages_reply_length: () => validationError('La réponse doit faire entre 1 et 600 caractères.', 'body'),
  messages_reply_only_published: () => new AppError('INVALID_STATE', 'Ce message attend encore : publiez-le avant de répondre.'),
};

/**
 * Traduit une erreur PostgreSQL attendue (23505 unicité, 23503 clé étrangère, 23514 CHECK) d'après le nom de
 * la contrainte. Renvoie undefined pour tout le reste, contrainte inconnue comprise : un 4xx générique
 * cacherait un bug, mieux vaut un 500 journalisé.
 */
export function translatePgError(error: unknown): AppError | undefined {
  if (!(error instanceof pg.DatabaseError) || !error.constraint) return undefined;
  if (error.code !== '23505' && error.code !== '23503' && error.code !== '23514') return undefined;
  return CONSTRAINT_ERRORS[error.constraint]?.();
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound());
};

/** Erreur du lecteur JSON d'Express (body-parser) : `type` et statut HTTP. */
function bodyParserError(error: unknown): { type: string; status: number } | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { type, status } = error as { type?: unknown; status?: unknown };
  return typeof type === 'string' && typeof status === 'number' ? { type, status } : undefined;
}

function isExposedClientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true;
}

function send(res: Response, error: AppError) {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message, ...(error.details !== undefined && { details: error.details }) },
  };
  res.status(error.status).json(body);
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // Réponse déjà entamée : on laisse Express couper la connexion.
  if (res.headersSent) {
    // Le message d'une erreur PostgreSQL peut reprendre une valeur saisie : Express journalise ce qu'on lui passe.
    next(error instanceof pg.DatabaseError ? new Error(`PostgreSQL ${error.code ?? '?'}`) : error);
    return;
  }
  if (error instanceof AppError) return send(res, error);
  if (error instanceof z.ZodError) return send(res, validationError(zodDetails(error)));

  const parser = bodyParserError(error);
  if (parser) {
    const message =
      parser.type === 'entity.too.large'
        ? `Les données envoyées sont trop volumineuses (${MAX_BODY_KB} ko maximum).`
        : parser.type === 'entity.parse.failed'
          ? "Le corps de la requête n'est pas un JSON valide."
          : // express.json({ inflate: false }) refuse tout Content-Encoding autre que identity (gzip, deflate, br...).
            parser.type === 'encoding.unsupported'
            ? 'Le corps de la requête ne doit pas être compressé.'
            : 'Le corps de la requête doit être du JSON encodé en UTF-8.';
    return send(res, validationError(message));
  }

  if (error instanceof pg.DatabaseError) {
    const translated = translatePgError(error);
    if (translated) return send(res, translated);
    // Classe 22 : valeur refusée par PostgreSQL (caractère nul, entier hors limites...), c'est la saisie qui est en cause.
    if (error.code?.startsWith('22')) {
      return send(res, validationError('Certaines données sont invalides.'));
    }
    // Le message peut reprendre des valeurs saisies : on ne journalise que le code et la contrainte.
    console.error(`Erreur PostgreSQL ${error.code ?? '?'} (${error.routine ?? 'routine inconnue'}) contrainte ${error.constraint ?? '-'}`);
  } else if (isExposedClientError(error)) {
    // Autre refus 4xx du lecteur de corps (gzip invalide...).
    return send(res, validationError('Le corps de la requête est invalide.'));
  } else {
    console.error('Erreur interne :', error);
  }
  send(res, new AppError('INTERNAL_ERROR', 'Une erreur inattendue est survenue.'));
};
