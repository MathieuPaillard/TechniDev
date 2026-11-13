import cookieParser from 'cookie-parser';
import express from 'express';
import { config, type SecurityConfig } from './config/env.js';
import { errorHandler, MAX_BODY_KB, notFoundHandler } from './errors.js';
import { jsonOnly } from './middleware/json-only.js';
import { requestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security-headers.js';
import { createAdminAuthRouter } from './routes/admin-auth.js';
import adminMessagesRouter from './routes/admin-messages.js';
import healthRouter from './routes/health.js';
import { createMessagesRouter } from './routes/messages.js';
import { createLimits, type Limits } from './security/limits.js';
import { originGuard } from './security/origin.js';
import { netlifyProxy } from './security/proxy.js';
import { requireAdmin } from './security/sessions.js';

export interface AppOptions {
  /** Réglages de sécurité : injectables pour tester le mode production sans toucher à l'environnement. */
  config?: SecurityConfig;
  /** Limites de requêtes : toujours actives par défaut (jamais coupées par une variable d'environnement). */
  limits?: Limits;
}

// Séparée de index.ts pour que les tests montent l'application sans ouvrir de port.
export function createApp(options: AppOptions = {}) {
  const security = options.config ?? config;
  const limits = options.limits ?? createLimits({ active: true });

  const app = express();
  app.disable('x-powered-by');
  // Render place un proxy devant l'application : req.ip est l'adresse qu'il transmet.
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(requestLogger);
  // Avant toute limite : leur clé dépend de la signature, et une requête non signée est refusée sans rien compter.
  app.use(netlifyProxy({ secret: security.NETLIFY_SIGNATURE, required: security.isProduction, frontOrigin: security.FRONT_URL }));
  app.use('/api', limits.global);
  app.use(originGuard(security.FRONT_URL));
  app.use(jsonOnly);
  // 8 ko (SPEC §B6) et jamais compressé : inflate: false refuse gzip, deflate et br avant toute décompression.
  app.use(express.json({ limit: `${MAX_BODY_KB}kb`, inflate: false }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(healthRouter);
  api.use('/admin', createAdminAuthRouter({ secureCookie: security.isProduction, loginLimit: limits.login }));
  // La session est exigée avant tout le reste : sans elle, aucune route de modération ne dit quoi que ce soit.
  api.use('/admin/messages', requireAdmin, adminMessagesRouter);
  // L'heure avant la journée : un envoi refusé pour l'heure n'entame pas le compte de la journée.
  api.use('/messages', createMessagesRouter({ sendLimits: [limits.messagesHour, limits.messagesDay] }));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
