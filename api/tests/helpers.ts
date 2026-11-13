import { createHmac } from 'node:crypto';
import { createApp, type AppOptions } from '../src/app.js';
import { createLimits } from '../src/security/limits.js';

/** Site et secret fictifs des tests du mode production. */
export const FRONT = 'https://technidev.example';
export const SECRET = 'secret-de-test-partage-avec-netlify';

/** Application sans limites de requêtes : les tests enchaînent volontairement les échecs. */
export const testApp = (options: AppOptions = {}) => createApp({ limits: createLimits({ active: false }), ...options });

/** Application réglée comme en production : signature de Netlify exigée, cookie `Secure`. */
export const productionApp = (options: AppOptions = {}) =>
  testApp({ config: { isProduction: true, FRONT_URL: FRONT, NETLIFY_SIGNATURE: SECRET }, ...options });

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * En-tête X-Nf-Sign tel que Netlify le pose : un JWS compact HS256. Les revendications passées remplacent celles
 * par défaut ; `undefined` en retire une.
 */
export function netlifySignature(
  claims: Record<string, unknown> = {},
  options: { secret?: string; header?: Record<string, unknown> } = {},
): string {
  const header = options.header ?? { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: 'netlify',
    exp: Math.floor(Date.now() / 1000) + 300,
    site_url: FRONT,
    deploy_context: 'production',
    ...claims,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', options.secret ?? SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}
