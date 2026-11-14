// Accès à l'API : toujours en chemin relatif /api (proxy signé de Netlify en ligne, relais de Vite en
// développement). Repris de Dépenses partagées, où l'attente du réveil a été vérifiée en ligne.
import type { ApiErrorBody, ErrorCode, ValidationDetail } from '../../../../api/src/contract';

/** Codes de l'API (SPEC §B6.1) et codes produits par le navigateur. */
export type ClientErrorCode = ErrorCode | 'NETWORK' | 'SERVER_UNAVAILABLE';

// Table exhaustive (le compilateur signale un code manquant) : sert à reconnaître les codes de l'API.
const KNOWN_CODES: Record<ErrorCode, true> = {
  VALIDATION: true,
  UNAUTHENTICATED: true,
  INVALID_CREDENTIALS: true,
  ORIGIN_REJECTED: true,
  NOT_FOUND: true,
  INVALID_STATE: true,
  GUESTBOOK_FULL: true,
  TOO_MANY_REQUESTS: true,
  INTERNAL_ERROR: true,
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly details: ValidationDetail[];

  constructor(status: number, code: ClientErrorCode, message: string, details: ValidationDetail[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Le serveur n'a pas pu être joint, ou n'a pas répondu comme une API : rien à corriger côté visiteur. */
  get unreachable(): boolean {
    return this.code === 'NETWORK' || this.code === 'SERVER_UNAVAILABLE' || this.code === 'INTERNAL_ERROR';
  }
}

const WAKE_INTERVAL_MS = 3000;
const WAKE_MAX_MS = 90_000;
const IDLE_BEFORE_REWAKE_MS = 10 * 60_000; // Render s'endort après environ 15 minutes : marge de sécurité

let wake: Promise<void> | undefined;
let wakeDone = false;
let lastResponseAt = 0;

/**
 * Attend que l'API réponde (SPEC §B4). Sur l'offre gratuite de Render, le serveur s'endort : son réveil prend
 * jusqu'à une minute, plus que le délai du proxy de Netlify. Appelée avant chaque requête : une seule attente
 * est partagée, et elle est relancée après plus de 10 minutes sans réponse (page restée ouverte).
 */
export function wakeApi(): Promise<void> {
  if (wakeDone && Date.now() - lastResponseAt > IDLE_BEFORE_REWAKE_MS) {
    wake = undefined;
    wakeDone = false;
  }
  wake ??= waitForApi().then(
    () => {
      wakeDone = true;
    },
    (error: unknown) => {
      wake = undefined; // nouvel essai possible au prochain appel
      throw error;
    },
  );
  return wake;
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + WAKE_MAX_MS;
  for (;;) {
    try {
      // Chaque tentative est bornée par le temps restant : jamais plus de 90 s au total.
      const signal = AbortSignal.timeout(Math.min(30_000, Math.max(1, deadline - Date.now())));
      const response = await fetch('/api/health', { cache: 'no-store', signal });
      await response.arrayBuffer(); // corps lu pour libérer la connexion
      if (response.ok) {
        lastResponseAt = Date.now();
        return;
      }
    } catch {
      // Serveur endormi ou réseau coupé : on réessaie.
    }
    if (Date.now() + WAKE_INTERVAL_MS > deadline) {
      throw new ApiError(503, 'SERVER_UNAVAILABLE', 'Le serveur ne répond pas.');
    }
    await new Promise((resolve) => setTimeout(resolve, WAKE_INTERVAL_MS));
  }
}

function isDetail(value: unknown): value is ValidationDetail {
  if (typeof value !== 'object' || value === null) return false;
  const { path, message } = value as { path?: unknown; message?: unknown };
  return typeof path === 'string' && typeof message === 'string';
}

function errorFrom(status: number, body: unknown): ApiError {
  const error = (body as Partial<ApiErrorBody> | undefined)?.error;
  if (error && typeof error.code === 'string' && typeof error.message === 'string') {
    // Un code inconnu de ce site (API plus récente) est traité comme une erreur interne.
    const code = Object.hasOwn(KNOWN_CODES, error.code) ? error.code : 'INTERNAL_ERROR';
    const details = Array.isArray(error.details) ? error.details.filter(isDetail) : [];
    return new ApiError(status, code, error.message, details);
  }
  // Réponse sans le format attendu : typiquement une page d'erreur du proxy pendant un réveil.
  return new ApiError(status, 'SERVER_UNAVAILABLE', 'Le serveur ne répond pas correctement.');
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  await wakeApi();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible.');
  }
  lastResponseAt = Date.now();
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw errorFrom(response.status, data);
  // Un 200 qui n'est pas du JSON : une page du site servie à la place de l'API.
  if (data === undefined) throw new ApiError(response.status, 'SERVER_UNAVAILABLE', 'Le serveur ne répond pas correctement.');
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T = void>(path: string, body?: unknown) => call<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => call<T>('PUT', path, body),
  delete: (path: string) => call<void>('DELETE', path),
};

/** L'erreur telle que le site la traite, quelle que soit la forme de ce qui a été lancé. */
export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'NETWORK', 'Connexion impossible.');
}

/** Délai au bout duquel une attente s'explique par le réveil du serveur plutôt que par un simple chargement. */
export const SLOW_AFTER_MS = 1500;
