import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config/env.js';

// Chaînes de connexion fictives : aucune ne désigne une vraie base.
const LOCAL = 'postgresql://utilisateur:motdepasse@localhost:5432/base';
const VERIFIED = 'postgresql://utilisateur:motdepasse@hote.example/base?sslmode=verify-full';
const production = { NODE_ENV: 'production', DATABASE_URL: VERIFIED, FRONT_URL: 'https://technidev.example', NETLIFY_SIGNATURE: 'secret' };

describe('configuration', () => {
  it('donne des valeurs par défaut en développement', () => {
    const config = parseConfig({ DATABASE_URL: LOCAL });
    expect(config).toMatchObject({ NODE_ENV: 'development', PORT: 3000, FRONT_URL: 'http://localhost:4321', isProduction: false });
    expect(config.NETLIFY_SIGNATURE).toBeUndefined();
  });

  it('exige DATABASE_URL', () => {
    expect(() => parseConfig({})).toThrow(/Obligatoire : chaîne de connexion PostgreSQL\.\n.*DATABASE_URL/);
    expect(() => parseConfig({ DATABASE_URL: '' })).toThrow(/Obligatoire : chaîne de connexion PostgreSQL\.\n.*DATABASE_URL/);
  });

  it('refuse un port qui n\'est pas un entier entre 1 et 65535', () => {
    for (const PORT of ['', 'abc', '0', '65536', '3000.5', '-1', ' 3000']) {
      expect(() => parseConfig({ DATABASE_URL: LOCAL, PORT }), PORT).toThrow(/PORT/);
    }
    expect(parseConfig({ DATABASE_URL: LOCAL, PORT: '8080' }).PORT).toBe(8080);
  });

  it("ne garde de FRONT_URL que l'origine", () => {
    expect(parseConfig({ DATABASE_URL: LOCAL, FRONT_URL: 'https://Technidev.Example/labo/' }).FRONT_URL).toBe('https://technidev.example');
    expect(() => parseConfig({ DATABASE_URL: LOCAL, FRONT_URL: 'pas une adresse' })).toThrow(/FRONT_URL/);
  });

  it('traite une variable vide comme absente', () => {
    expect(parseConfig({ DATABASE_URL: LOCAL, NETLIFY_SIGNATURE: '', FRONT_URL: '' })).toMatchObject({ FRONT_URL: 'http://localhost:4321' });
  });

  it('accepte une configuration de production complète', () => {
    expect(parseConfig(production)).toMatchObject({ isProduction: true, FRONT_URL: 'https://technidev.example', NETLIFY_SIGNATURE: 'secret' });
  });

  it('exige sslmode=verify-full en production, une seule fois', () => {
    const urls = [
      LOCAL,
      'postgresql://utilisateur:motdepasse@hote.example/base?sslmode=require',
      // pg garderait la dernière valeur : deux valeurs sont refusées, quel que soit leur ordre.
      'postgresql://utilisateur:motdepasse@hote.example/base?sslmode=verify-full&sslmode=disable',
      'postgresql://utilisateur:motdepasse@hote.example/base?sslmode=disable&sslmode=verify-full',
      'chaîne illisible',
    ];
    for (const DATABASE_URL of urls) {
      expect(() => parseConfig({ ...production, DATABASE_URL }), DATABASE_URL).toThrow(/sslmode=verify-full/);
    }
  });

  it('ne recopie jamais la chaîne de connexion dans le message', () => {
    try {
      parseConfig({ ...production, DATABASE_URL: LOCAL });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('motdepasse');
      expect((error as Error).message).not.toContain('localhost:5432');
    }
  });

  it('exige FRONT_URL en https et NETLIFY_SIGNATURE en production', () => {
    expect(() => parseConfig({ ...production, FRONT_URL: 'http://technidev.example' })).toThrow(/https/);
    const { FRONT_URL: _front, ...withoutFront } = production;
    expect(() => parseConfig(withoutFront)).toThrow(/FRONT_URL/);
    const { NETLIFY_SIGNATURE: _signature, ...withoutSignature } = production;
    expect(() => parseConfig(withoutSignature)).toThrow(/NETLIFY_SIGNATURE/);
    expect(() => parseConfig({ ...production, NETLIFY_SIGNATURE: '' })).toThrow(/NETLIFY_SIGNATURE/);
  });

  it('refuse de tourner sur Render sans NODE_ENV=production', () => {
    expect(() => parseConfig({ DATABASE_URL: LOCAL, RENDER: 'true' })).toThrow(/RENDER/);
    expect(() => parseConfig({ DATABASE_URL: LOCAL, RENDER: 'true', NODE_ENV: 'development' })).toThrow(/RENDER/);
    expect(parseConfig({ ...production, RENDER: 'true' }).isProduction).toBe(true);
  });

  it('refuse NODE_TLS_REJECT_UNAUTHORIZED=0 en production', () => {
    expect(() => parseConfig({ ...production, NODE_TLS_REJECT_UNAUTHORIZED: '0' })).toThrow(/NODE_TLS_REJECT_UNAUTHORIZED/);
  });

  it('refuse un NODE_ENV inconnu', () => {
    expect(() => parseConfig({ DATABASE_URL: LOCAL, NODE_ENV: 'prod' })).toThrow(/NODE_ENV/);
  });
});
