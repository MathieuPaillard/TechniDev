import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit, type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import type { ApiErrorBody } from '../errors.js';

const QUARTER_HOUR_MS = 15 * 60 * 1000;

/** Seuils de la SPEC (§B3). Les tests en injectent de plus petits. */
export const THRESHOLDS = {
  /** Toute l'API, par adresse et par quart d'heure. */
  global: 300,
  /** Échecs de connexion, par adresse et par quart d'heure. */
  login: 5,
} as const;

export type LimitName = keyof typeof THRESHOLDS;
export type Limits = Record<LimitName, RateLimitRequestHandler>;

/**
 * Clé de comptage, gardée en mémoire seulement. x-nf-client-connection-ip n'est cru que si la requête porte une
 * signature Netlify valide : sinon n'importe qui changerait de clé à chaque requête.
 */
export function limitKey(req: Request): string {
  const viaNetlify = req.netlifySigned === true ? req.get('x-nf-client-connection-ip') : undefined;
  return ipKeyGenerator(viaNetlify ?? req.ip ?? 'unknown');
}

export interface LimitsOptions {
  /** `false` (tests) : les compteurs ne bloquent rien. */
  active: boolean;
  /** Seuils de remplacement, pour atteindre une limite en quelques requêtes dans un test. */
  thresholds?: Partial<Record<LimitName, number>>;
}

export function createLimits({ active, thresholds = {} }: LimitsOptions): Limits {
  const limit = (name: LimitName, message: string, options: Partial<Options> = {}) =>
    rateLimit({
      windowMs: QUARTER_HOUR_MS,
      limit: thresholds[name] ?? THRESHOLDS[name],
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: limitKey,
      handler: (_req: Request, res: Response) => {
        const body: ApiErrorBody = { error: { code: 'TOO_MANY_REQUESTS', message } };
        res.status(429).json(body);
      },
      ...options,
      skip: async (req, res) => !active || (await options.skip?.(req, res)) === true,
    });

  return {
    // Sauf /api/health, vu ici sans le préfixe de montage : il est appelé en boucle pendant le réveil de Render.
    global: limit('global', 'Trop de requêtes. Réessayez dans quelques minutes.', { skip: (req) => req.path === '/health' }),
    // Seuls les échecs comptent : une connexion réussie rend son essai. Un essai interrompu avant la réponse reste compté.
    login: limit('login', "Trop d'essais de connexion. Réessayez dans un quart d'heure.", { skipSuccessfulRequests: true }),
  };
}
