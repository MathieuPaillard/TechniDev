import type { RequestHandler } from 'express';
import { config } from '../config/env.js';

/** Méthode, chemin sans paramètres d'adresse, statut, durée. Jamais de corps, de pseudo, de jeton ni d'adresse (SPEC §B7). */
export const requestLogger: RequestHandler = (req, res, next) => {
  if (config.NODE_ENV === 'test') return next();
  const start = performance.now();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    console.log(`${req.method} ${path} ${res.statusCode} ${Math.round(performance.now() - start)} ms`);
  });
  next();
};
