import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError, errorHandler } from '../src/errors.js';
import { parseBody, parseId, parseQuery } from '../src/validation.js';
import { testApp } from './helpers.js';

const app = testApp();

describe('santé et en-têtes', () => {
  it('répond 200 avec les en-têtes de sécurité', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('répond aussi à HEAD, sans corps', async () => {
    const res = await request(app).head('/api/health');
    expect(res.status).toBe(200);
    expect(res.text ?? '').toBe('');
  });

  it("n'expose rien hors de /api", async () => {
    expect((await request(app).get('/')).status).toBe(404);
    expect((await request(app).get('/health')).status).toBe(404);
  });
});

describe('format des erreurs', () => {
  it('renvoie une 404 NOT_FOUND pour une route inconnue, avec les en-têtes', async () => {
    const res = await request(app).get('/api/inconnue');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toMatch(/^application\/json/);
  });

  it('renvoie 400 VALIDATION pour un JSON mal formé', async () => {
    const res = await request(app).post('/api/inconnue').set('Content-Type', 'application/json').send('{"author":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details).toEqual([{ path: '', message: "Le corps de la requête n'est pas un JSON valide." }]);
  });

  it('renvoie 400 VALIDATION pour un corps qui n\'est pas du JSON', async () => {
    const form = await request(app).post('/api/inconnue').type('form').send('author=a');
    expect(form.status).toBe(400);
    expect(form.body.error.code).toBe('VALIDATION');
    const text = await request(app).post('/api/inconnue').set('Content-Type', 'text/plain').send('{}');
    expect(text.status).toBe(400);
    expect(text.body.error.code).toBe('VALIDATION');
  });

  // Corps JSON de la taille exacte demandée, sur une route inconnue : 404 si le lecteur de corps l'accepte.
  const bodyOfSize = (bytes: number) => JSON.stringify({ pad: 'a'.repeat(bytes - '{"pad":""}'.length) });
  const post = (body: string) => request(app).post('/api/inconnue').set('Content-Type', 'application/json').send(body);

  it('refuse un corps de 8 ko plus un octet, avec un message qui dit 8 ko', async () => {
    const body = bodyOfSize(8 * 1024 + 1);
    expect(Buffer.byteLength(body)).toBe(8 * 1024 + 1);
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details).toEqual([{ path: '', message: 'Les données envoyées sont trop volumineuses (8 ko maximum).' }]);
  });

  it('accepte un corps de 8 ko exactement', async () => {
    const body = bodyOfSize(8 * 1024);
    expect(Buffer.byteLength(body)).toBe(8 * 1024);
    expect((await post(body)).status).toBe(404);
  });

  it('refuse un corps compressé, sans le décompresser', async () => {
    const json = Buffer.from('{"author":"Ada"}');
    const encodings: [string, Buffer][] = [
      ['gzip', gzipSync(json)],
      ['deflate', deflateSync(json)],
      ['br', brotliCompressSync(json)],
    ];
    for (const [encoding, compressed] of encodings) {
      const res = await request(app)
        .post('/api/inconnue')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', encoding)
        .send(compressed);
      expect(res.status, encoding).toBe(400);
      expect(res.body.error.details, encoding).toEqual([{ path: '', message: 'Le corps de la requête ne doit pas être compressé.' }]);
    }
  });

  it("masque les détails d'une erreur interne", async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = express();
    broken.get('/boom', () => {
      throw new Error('mot de passe secret en base');
    });
    broken.use(errorHandler);
    const res = await request(broken).get('/boom');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Une erreur inattendue est survenue.' } });
  });

  it('traduit une erreur Zod en 400 VALIDATION, le chemin joint par des points', async () => {
    const failing = express();
    failing.get('/zod', () => {
      z.object({ reply: z.object({ body: z.string() }) }).parse({ reply: { body: 3 } });
    });
    failing.use(errorHandler);
    const res = await request(failing).get('/zod');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details).toHaveLength(1);
    expect(res.body.error.details[0].path).toBe('reply.body');
  });

  it('donne un détail par champ inconnu, en français', () => {
    const schema = z.strictObject({ author: z.string() });
    try {
      parseBody(schema, { author: 'Ada', role: 'admin', id: 1 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const { code, details } = error as AppError;
      expect(code).toBe('VALIDATION');
      expect(details).toEqual([
        { path: 'role', message: "Le champ « role » n'est pas reconnu." },
        { path: 'id', message: "Le champ « id » n'est pas reconnu." },
      ]);
    }
  });

  it('écrit les messages de Zod en français', () => {
    try {
      parseQuery(z.strictObject({ before: z.string() }), {});
      expect.unreachable();
    } catch (error) {
      const [detail] = (error as AppError).details as { path: string; message: string }[];
      expect(detail?.path).toBe('before');
      expect(detail?.message).toMatch(/attendu|requis|invalide/i);
    }
  });

  it('borne une erreur VALIDATION à 20 détails', () => {
    const details = Array.from({ length: 50 }, (_, i) => ({ path: `p${i}`, message: 'm' }));
    expect(new AppError('VALIDATION', 'x', details).details).toHaveLength(20);
    // Les autres codes gardent leurs détails tels quels.
    expect(new AppError('INVALID_STATE', 'x', details).details).toHaveLength(50);
    const unknownKeys = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`inconnu${i}`, 1]));
    try {
      parseBody(z.strictObject({}), unknownKeys);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details).toHaveLength(20);
    }
  });

  it('associe chaque code à son statut', () => {
    const expected = {
      VALIDATION: 400,
      UNAUTHENTICATED: 401,
      INVALID_CREDENTIALS: 401,
      ORIGIN_REJECTED: 403,
      NOT_FOUND: 404,
      INVALID_STATE: 409,
      GUESTBOOK_FULL: 409,
      TOO_MANY_REQUESTS: 429,
      INTERNAL_ERROR: 500,
    } as const;
    for (const [code, status] of Object.entries(expected)) {
      const error = code === 'VALIDATION' ? new AppError('VALIDATION', 'x') : new AppError(code as 'NOT_FOUND', 'x');
      expect(error.status, code).toBe(status);
    }
  });
});

describe('identifiant de chemin', () => {
  it('accepte un entier positif', () => {
    expect(parseId('1')).toBe(1);
    expect(parseId('2147483647')).toBe(2_147_483_647);
  });

  it('répond 404 pour tout le reste', () => {
    for (const value of ['0', '-1', '1.5', '01', 'abc', '', ' 1', '1e3', '2147483648', '99999999999999999999', undefined, 12, ['1']]) {
      expect(() => parseId(value), String(value)).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
    }
  });
});
