import type { RequestHandler } from 'express';
import { validationError } from '../errors.js';

const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Refuse tout corps non JSON : un formulaire HTML d'un autre site ne peut pas envoyer du JSON (SPEC §B7).
export const jsonOnly: RequestHandler = (req, _res, next) => {
  const hasBody = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] ?? 0) > 0;
  if (!NO_BODY_METHODS.has(req.method) && hasBody && !req.is('application/json')) {
    return next(validationError('Le corps de la requête doit être du JSON (Content-Type: application/json).'));
  }
  next();
};
