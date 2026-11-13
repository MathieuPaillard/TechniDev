import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLimits } from '../src/security/limits.js';
import { checkNetlifySignature } from '../src/security/proxy.js';
import { FRONT, netlifySignature, productionApp, SECRET, testApp } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const check = (jws: string | undefined, now?: number) => checkNetlifySignature(jws, SECRET, FRONT, now);
const seconds = () => Math.floor(Date.now() / 1000);

describe('signature de Netlify', () => {
  it('accepte une signature exacte aux quatre revendications attendues', () => {
    const result = check(netlifySignature());
    expect(result).toMatchObject({ valid: true, hmacOk: true, problems: [] });
    expect(result.expiresIn).toBeGreaterThan(290);
    expect(result.expiresIn).toBeLessThanOrEqual(300);
  });

  it('refuse sans rien dire une signature absente, mal formée ou faite avec un autre secret', () => {
    const [header, payload, signature] = netlifySignature().split('.') as [string, string, string];
    const candidates = [
      undefined,
      '',
      'abc',
      `${header}.${payload}`,
      `${header}.${payload}.${signature}.${signature}`,
      `${header}.${payload}.pas+du/base64url`,
      `${header}.${payload}.${signature.slice(0, -2)}`,
      netlifySignature({}, { secret: 'un-autre-secret' }),
      // Contenu changé après signature.
      `${header}.${Buffer.from(JSON.stringify({ iss: 'netlify', site_url: FRONT, deploy_context: 'production', exp: seconds() + 9999 })).toString('base64url')}.${signature}`,
    ];
    for (const candidate of candidates) {
      expect(check(candidate), String(candidate).slice(0, 30)).toEqual({ valid: false, hmacOk: false, problems: [] });
    }
  });

  it('refuse toute signature quand le secret manque', () => {
    expect(checkNetlifySignature(netlifySignature(), undefined, FRONT).valid).toBe(false);
    expect(checkNetlifySignature(netlifySignature({}, { secret: '' }), '', FRONT).valid).toBe(false);
  });

  it('refuse un algorithme autre que HS256, même signé avec le bon secret', () => {
    for (const alg of ['none', 'HS512', 'RS256', undefined]) {
      const result = check(netlifySignature({}, { header: { alg, typ: 'JWT' } }));
      expect(result, String(alg)).toMatchObject({ valid: false, hmacOk: true, problems: ['alg'] });
    }
  });

  it("refuse un émetteur qui n'est pas netlify", () => {
    expect(check(netlifySignature({ iss: 'autre' })).problems).toEqual(['iss']);
    expect(check(netlifySignature({ iss: undefined })).problems).toEqual(['iss']);
  });

  it('exige une expiration, numérique et non dépassée', () => {
    expect(check(netlifySignature({ exp: undefined })).problems).toEqual(['exp absent']);
    expect(check(netlifySignature({ exp: 'demain' })).problems).toEqual(['exp invalide']);
    expect(check(netlifySignature({ exp: null })).problems).toEqual(['exp invalide']);
    const expired = check(netlifySignature({ exp: seconds() - 120 }));
    expect(expired.valid).toBe(false);
    expect(expired.problems[0]).toMatch(/^exp dépassé de 1[12]\d s$/);
  });

  it("tolère 30 secondes d'écart d'horloge, pas davantage", () => {
    const now = Date.now();
    const exp = Math.floor(now / 1000);
    const jws = netlifySignature({ exp });
    expect(check(jws, exp * 1000 + 29_000).valid).toBe(true);
    expect(check(jws, exp * 1000 + 30_000).valid).toBe(false);
  });

  it("exige l'origine du site, sans se soucier du chemin ni de la casse", () => {
    expect(check(netlifySignature({ site_url: `${FRONT}/` })).valid).toBe(true);
    expect(check(netlifySignature({ site_url: 'https://TechniDev.example/labo' })).valid).toBe(true);
    for (const site_url of ['https://autre.example', 'http://technidev.example', `${FRONT}.attaquant.example`, 'pas une adresse', undefined, 42]) {
      expect(check(netlifySignature({ site_url })).problems, String(site_url)).toEqual(['site_url']);
    }
  });

  it("refuse un déploiement d'aperçu", () => {
    for (const deploy_context of ['deploy-preview', 'branch-deploy', 'dev', undefined]) {
      expect(check(netlifySignature({ deploy_context })).problems, String(deploy_context)).toEqual(['deploy_context']);
    }
  });

  it('cumule les revendications refusées et tronque ce qui sera journalisé', () => {
    const result = check(netlifySignature({ iss: 'x', deploy_context: 'd'.repeat(500), site_url: `https://${'a'.repeat(500)}.example` }));
    expect(result.problems).toEqual(['iss', 'site_url', 'deploy_context']);
    expect(result.deployContext).toHaveLength(100);
    expect(result.siteUrl).toHaveLength(100);
  });
});

describe('proxy signé, en production', () => {
  const app = productionApp();

  it('laisse le contrôle de santé sans signature, en GET et en HEAD seulement', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).head('/api/health')).status).toBe(200);
    const post = await request(app).post('/api/health');
    expect(post.status).toBe(403);
    expect(post.body.error.code).toBe('ORIGIN_REJECTED');
  });

  it('refuse toute autre requête sans signature valide', async () => {
    for (const path of ['/api/messages', '/api/admin/me', '/api/inconnue', '/api/health/', '/api/HEALTH', '/']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(403);
      expect(res.body, path).toEqual({ error: { code: 'ORIGIN_REJECTED', message: 'Requête refusée : elle ne provient pas du site.' } });
    }
    const forged = await request(app).get('/api/inconnue').set('X-Nf-Sign', netlifySignature({}, { secret: 'faux' }));
    expect(forged.status).toBe(403);
  });

  it('laisse passer une requête signée', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await request(app).get('/api/inconnue').set('X-Nf-Sign', netlifySignature());
    expect(res.status).toBe(404);
    // La durée de vie de la première signature est journalisée, une seule fois, sans la signature.
    await request(app).get('/api/inconnue').set('X-Nf-Sign', netlifySignature());
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toMatch(/^Première signature Netlify acceptée : exp dans \d+ s\.$/);
  });

  it('journalise une signature exacte au contenu refusé, sans la signature ni le secret', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const jws = netlifySignature({ deploy_context: 'deploy-preview' });
    const res = await request(app).get('/api/inconnue').set('X-Nf-Sign', jws);
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledOnce();
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain('deploy_context');
    expect(logged).not.toContain(jws);
    expect(logged).not.toContain(jws.split('.')[2]);
    expect(logged).not.toContain(SECRET);
  });

  it('ne journalise rien pour une signature fausse ou absente', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await request(app).get('/api/inconnue');
    await request(app).get('/api/inconnue').set('X-Nf-Sign', netlifySignature({}, { secret: 'faux' }));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('proxy signé, hors production', () => {
  it("n'exige pas de signature", async () => {
    expect((await request(testApp()).get('/api/inconnue')).status).toBe(404);
  });
});

describe("contrôle d'origine", () => {
  const app = testApp({ config: { isProduction: false, FRONT_URL: FRONT, NETLIFY_SIGNATURE: undefined } });

  it("refuse une écriture venue d'un autre site", async () => {
    for (const origin of ['https://attaquant.example', 'http://technidev.example', 'null', `${FRONT}:8443`]) {
      const res = await request(app).post('/api/inconnue').set('Origin', origin).send({});
      expect(res.status, origin).toBe(403);
      expect(res.body.error.code, origin).toBe('ORIGIN_REJECTED');
    }
  });

  it('refuse aussi PUT, PATCH et DELETE', async () => {
    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await request(app)[method]('/api/inconnue').set('Origin', 'https://attaquant.example');
      expect(res.status, method).toBe(403);
    }
  });

  it("laisse passer une écriture du site, ou sans en-tête Origin", async () => {
    expect((await request(app).post('/api/inconnue').set('Origin', FRONT).send({})).status).toBe(404);
    expect((await request(app).post('/api/inconnue').send({})).status).toBe(404);
  });

  it("laisse passer une lecture, d'où qu'elle vienne", async () => {
    expect((await request(app).get('/api/health').set('Origin', 'https://attaquant.example')).status).toBe(200);
  });
});

describe('limite globale', () => {
  const limited = () => createLimits({ active: true, thresholds: { global: 2 } });

  it('compte par adresse transmise par Netlify quand la requête est signée', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = productionApp({ limits: limited() });
    const from = (ip: string) => request(app).get('/api/inconnue').set('X-Nf-Sign', netlifySignature()).set('X-Nf-Client-Connection-Ip', ip);
    expect((await from('203.0.113.7')).status).toBe(404);
    expect((await from('203.0.113.7')).status).toBe(404);
    const third = await from('203.0.113.7');
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de requêtes. Réessayez dans quelques minutes.' } });
    // Une autre adresse garde son propre compte.
    expect((await from('203.0.113.8')).status).toBe(404);
  });

  it('ne compte pas une requête refusée faute de signature', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = productionApp({ limits: limited() });
    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).get('/api/inconnue').set('X-Nf-Client-Connection-Ip', '203.0.113.9')).status).toBe(403);
    }
    const signed = await request(app).get('/api/inconnue').set('X-Nf-Sign', netlifySignature()).set('X-Nf-Client-Connection-Ip', '203.0.113.9');
    expect(signed.status).toBe(404);
  });

  it("ignore l'adresse annoncée quand la requête n'est pas signée", async () => {
    const app = testApp({ limits: limited() });
    const from = (ip: string) => request(app).get('/api/inconnue').set('X-Nf-Client-Connection-Ip', ip);
    expect((await from('203.0.113.1')).status).toBe(404);
    expect((await from('203.0.113.2')).status).toBe(404);
    // Changer l'en-tête ne change pas de compteur.
    expect((await from('203.0.113.3')).status).toBe(429);
  });

  it('ne limite jamais le contrôle de santé', async () => {
    const app = testApp({ limits: limited() });
    for (let i = 0; i < 6; i += 1) {
      expect((await request(app).get('/api/health')).status).toBe(200);
    }
  });
});
