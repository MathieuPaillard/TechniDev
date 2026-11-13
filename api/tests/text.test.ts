import { describe, expect, it } from 'vitest';
import { authorSchema, cleanAuthor, cleanBody, codePointLength, containsLink, hasForbiddenCharacter, messageBodySchema, replyBodySchema } from '../src/text.js';

// Les caractères invisibles sont fabriqués à partir de leur numéro : ce fichier n'en contient aucun.
const at = (codePoint: number) => String.fromCodePoint(codePoint);

describe('longueur en caractères', () => {
  it('compte des points de code, pas des unités UTF-16', () => {
    expect(codePointLength('')).toBe(0);
    expect(codePointLength('abc')).toBe(3);
    expect(codePointLength('été')).toBe(3);
    expect('😀'.length).toBe(2);
    expect(codePointLength('😀')).toBe(1);
    expect(codePointLength('a😀b')).toBe(3);
  });
});

describe('caractères refusés', () => {
  it('refuse les caractères de contrôle', () => {
    for (const codePoint of [0x00, 0x07, 0x08, 0x0b, 0x0c, 0x0d, 0x1b, 0x1f, 0x7f, 0x80, 0x85, 0x9f]) {
      expect(hasForbiddenCharacter(`a${at(codePoint)}b`, { allowNewline: true }), codePoint.toString(16)).toBe(true);
    }
  });

  it("n'accepte le retour à la ligne que là où il est permis", () => {
    expect(hasForbiddenCharacter('a\nb', { allowNewline: true })).toBe(false);
    expect(hasForbiddenCharacter('a\nb', { allowNewline: false })).toBe(true);
  });

  it("refuse les séparateurs de ligne et les caractères qui changent le sens d'écriture", () => {
    for (const codePoint of [0x2028, 0x2029, 0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(hasForbiddenCharacter(`a${at(codePoint)}b`, { allowNewline: true }), codePoint.toString(16)).toBe(true);
    }
  });

  it('refuse une moitié de paire UTF-16 isolée', () => {
    const half = '😀'.slice(0, 1);
    expect(hasForbiddenCharacter(`a${half}`, { allowNewline: true })).toBe(true);
    expect(hasForbiddenCharacter('a😀', { allowNewline: true })).toBe(false);
  });

  it('laisse passer le texte ordinaire, les accents, les émojis composés et les autres écritures', () => {
    // La liaison sans chasse (U+200D) assemble des émojis : elle n'est pas refusée.
    const family = ['👨', '👩', '👧'].join(at(0x200d));
    for (const value of ['Bonjour, ça va ? Très bien !', 'Ünïcödé « guillemets » … €', family, 'こんにちは', 'مرحبا', 'a b', `a${at(0xa0)}b`]) {
      expect(hasForbiddenCharacter(value, { allowNewline: false }), value).toBe(false);
    }
  });
});

describe('liens', () => {
  it('reconnaît http://, https:// et www., quelle que soit la casse', () => {
    for (const value of ['http://exemple.fr', 'voir https://exemple.fr/page', 'HTTPS://EXEMPLE.FR', 'www.exemple.fr', 'allez sur WWW.exemple.fr', '(www.exemple.fr)']) {
      expect(containsLink(value), value).toBe(true);
    }
  });

  it('ne prend pas un mot ordinaire pour un lien', () => {
    for (const value of ['https', 'le protocole http est ancien', 'awww.', 'www', 'www exemple', 'exemple.fr', 'http:/ /']) {
      expect(containsLink(value), value).toBe(false);
    }
  });
});

describe('mise au propre', () => {
  it('pseudo : une seule espace entre deux mots, rien autour', () => {
    expect(cleanAuthor('  Ada   Lovelace  ')).toBe('Ada Lovelace');
    expect(cleanAuthor('Ada\tLovelace')).toBe('Ada Lovelace');
    // Espace insécable et espace fine : des espaces comme les autres.
    expect(cleanAuthor(`Ada${at(0xa0)}${at(0x2009)}Lovelace`)).toBe('Ada Lovelace');
  });

  it('pseudo : un retour à la ligne reste, pour être refusé ensuite', () => {
    expect(cleanAuthor('Ada\nLovelace')).toBe('Ada\nLovelace');
  });

  it('forme NFC : une lettre et son accent séparé deviennent un seul caractère', () => {
    const decomposed = `e${at(0x301)}te${at(0x301)}`;
    expect(codePointLength(decomposed)).toBe(5);
    expect(cleanAuthor(decomposed)).toBe('été');
    expect(cleanBody(decomposed)).toBe('été');
  });

  it('texte : retours à la ligne en \\n, deux de suite au plus', () => {
    expect(cleanBody('un\r\ndeux\rtrois')).toBe('un\ndeux\ntrois');
    expect(cleanBody('un\n\n\n\n\ndeux')).toBe('un\n\ndeux');
    expect(cleanBody('un\n \n\t\n  \ndeux')).toBe('un\n\ndeux');
    expect(cleanBody('un\n\ndeux')).toBe('un\n\ndeux');
  });

  it('texte : rien au début ni à la fin, pas d\'espace en fin de ligne, les espaces intérieures gardées', () => {
    expect(cleanBody('\n\n  Bonjour  \n\n')).toBe('Bonjour');
    expect(cleanBody('un   \ndeux')).toBe('un\ndeux');
    expect(cleanBody('un    deux')).toBe('un    deux');
    expect(cleanBody('  \n\t ')).toBe('');
  });
});

describe('schémas', () => {
  const issues = (schema: typeof authorSchema, value: unknown) => {
    const result = schema.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

  it('pseudo : 2 à 24 caractères après mise au propre', () => {
    expect(authorSchema.parse('  Ada ')).toBe('Ada');
    expect(authorSchema.parse('ab')).toBe('ab');
    expect(authorSchema.parse('a'.repeat(24))).toHaveLength(24);
    expect(authorSchema.parse('😀'.repeat(24))).toBe('😀'.repeat(24));
    for (const value of ['', ' ', 'a', ' a ', 'a'.repeat(25), '😀'.repeat(25), '😀']) {
      expect(issues(authorSchema, value), JSON.stringify(value)).toEqual(['Le pseudo doit faire entre 2 et 24 caractères.']);
    }
  });

  it('pseudo : ni retour à la ligne, ni lien', () => {
    expect(issues(authorSchema, 'Ada\nLovelace')).toEqual(["Un caractère invisible ou de contrôle n'est pas accepté ici."]);
    expect(issues(authorSchema, 'www.exemple.fr')).toEqual(['Les liens ne sont pas acceptés : retirez les adresses (http://, https://, www.).']);
    expect(issues(authorSchema, 42)).toHaveLength(1);
  });

  it('texte : 1 à 600 caractères après mise au propre', () => {
    expect(messageBodySchema.parse(' Bravo ! ')).toBe('Bravo !');
    expect(messageBodySchema.parse('a'.repeat(600))).toHaveLength(600);
    expect(codePointLength(messageBodySchema.parse('😀'.repeat(600)))).toBe(600);
    expect(issues(messageBodySchema, '')).toEqual(['Le texte est vide.']);
    expect(issues(messageBodySchema, ' \n\t ')).toEqual(['Le texte est vide.']);
    expect(issues(messageBodySchema, 'a'.repeat(601))).toEqual(['Le texte ne doit pas dépasser 600 caractères.']);
    expect(issues(messageBodySchema, '😀'.repeat(601))).toEqual(['Le texte ne doit pas dépasser 600 caractères.']);
    // 600 caractères utiles entourés d'espaces : accepté, les espaces partent avant le compte.
    expect(messageBodySchema.parse(`   ${'a'.repeat(600)}\n\n`)).toHaveLength(600);
  });

  it('texte : retours à la ligne permis, caractères de maquillage refusés, liens refusés', () => {
    expect(messageBodySchema.parse('un\ndeux')).toBe('un\ndeux');
    expect(issues(messageBodySchema, `abc${at(0x202e)}def`)).toEqual(["Un caractère invisible ou de contrôle n'est pas accepté ici."]);
    expect(issues(messageBodySchema, `abc${at(0)}def`)).toEqual(["Un caractère invisible ou de contrôle n'est pas accepté ici."]);
    expect(issues(messageBodySchema, 'voir https://exemple.fr')).toEqual(['Les liens ne sont pas acceptés : retirez les adresses (http://, https://, www.).']);
  });

  it("réponse de l'administrateur : mêmes règles, adresses permises", () => {
    expect(replyBodySchema.parse(' Merci, le code est sur https://exemple.fr ')).toBe('Merci, le code est sur https://exemple.fr');
    expect(issues(replyBodySchema, '')).toEqual(['Le texte est vide.']);
    expect(issues(replyBodySchema, 'a'.repeat(601))).toEqual(['Le texte ne doit pas dépasser 600 caractères.']);
    expect(issues(replyBodySchema, `abc${at(0x2028)}def`)).toEqual(["Un caractère invisible ou de contrôle n'est pas accepté ici."]);
  });
});
