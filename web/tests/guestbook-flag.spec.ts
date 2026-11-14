// Le livre d'or apparaît-il sur le site ? La règle est dans guestbook-flag.mjs, lue par astro.config.mjs.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { guestbookEnabled, redirectsApi } from '../guestbook-flag.mjs';

const COMMENTED = `
[build]
  base = "web"

# [[redirects]]
#   from = "/api/*"
#   to = "https://exemple.onrender.com/api/:splat"
`;
const ACTIVE = `
[[redirects]]
  from = "/api/*"
  to = "https://exemple.onrender.com/api/:splat"
  status = 200
`;

test.describe('redirection de /api dans netlify.toml', () => {
  test('un bloc en commentaire ne compte pas', () => {
    expect(redirectsApi(COMMENTED)).toBe(false);
    expect(redirectsApi('')).toBe(false);
    expect(redirectsApi('#from = "/api/*"')).toBe(false);
  });

  test('un bloc actif compte, quelle que soit son indentation', () => {
    expect(redirectsApi(ACTIVE)).toBe(true);
    expect(redirectsApi('from="/api/*"')).toBe(true);
    expect(redirectsApi('\tfrom   =   "/api/*"')).toBe(true);
  });

  test('une autre redirection ne compte pas', () => {
    expect(redirectsApi('[[redirects]]\n  from = "/ancien/*"\n  to = "/nouveau/:splat"')).toBe(false);
    expect(redirectsApi('  to = "/api/*"')).toBe(false);
  });

  test('le fichier du dépôt se lit sans erreur', () => {
    const netlifyToml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
    expect(typeof redirectsApi(netlifyToml)).toBe('boolean');
  });
});

test.describe('livre d\'or branché ou non', () => {
  test('suit netlify.toml à la construction', () => {
    expect(guestbookEnabled({ forced: undefined, dev: false, netlifyToml: COMMENTED })).toBe(false);
    expect(guestbookEnabled({ forced: undefined, dev: false, netlifyToml: ACTIVE })).toBe(true);
    expect(guestbookEnabled({ forced: '', dev: false, netlifyToml: ACTIVE })).toBe(true);
  });

  test('est toujours branché en développement', () => {
    expect(guestbookEnabled({ forced: undefined, dev: true, netlifyToml: COMMENTED })).toBe(true);
  });

  test('GUESTBOOK=on ou off passe avant tout', () => {
    expect(guestbookEnabled({ forced: 'on', dev: false, netlifyToml: COMMENTED })).toBe(true);
    expect(guestbookEnabled({ forced: 'off', dev: true, netlifyToml: ACTIVE })).toBe(false);
  });

  test('refuse une autre valeur', () => {
    expect(() => guestbookEnabled({ forced: 'oui', dev: false, netlifyToml: ACTIVE })).toThrow(/"on" ou "off"/);
  });
});
