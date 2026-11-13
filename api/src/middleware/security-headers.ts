import type { RequestHandler } from 'express';

// SPEC §B7 : rien à mettre en cache ni à interpréter autrement que prévu.
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  next();
};
