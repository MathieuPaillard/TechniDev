import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** Contre les requêtes d'un autre site (SPEC §B7) : hors lecture, un Origin présent doit être celui du front. */
export function originGuard(frontUrl: string): RequestHandler {
  // Casse, chemin et barre finale ne doivent pas bloquer une requête légitime.
  const allowed = new URL(frontUrl).origin;
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (!SAFE_METHODS.has(req.method) && origin !== undefined && origin !== allowed) {
      throw new AppError('ORIGIN_REJECTED', 'Requête refusée : elle ne provient pas du site.');
    }
    next();
  };
}
