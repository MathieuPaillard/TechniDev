// Livre d'or : ce que le site calcule sans navigateur (src/lib/guestbook/format.ts).
import { expect, test } from '@playwright/test';
import { countCharacters, fieldMessages, formatDay, missingFields, plural, subjectFromSearch } from '../src/lib/guestbook/format';

const at = (codePoint: number) => String.fromCodePoint(codePoint);

test.describe('compteur de caractères', () => {
  test('compte des caractères, pas des unités UTF-16', () => {
    expect(countCharacters('')).toBe(0);
    expect(countCharacters('été')).toBe(3);
    expect(countCharacters('😀😀')).toBe(2);
  });

  test('ne compte pas les espaces du début et de la fin', () => {
    expect(countCharacters('  Bonjour \n')).toBe(7);
    expect(countCharacters(' \n ')).toBe(0);
  });

  test('compte une lettre et son accent séparé pour un seul caractère, comme l\'API', () => {
    expect(countCharacters(`e${at(0x301)}te${at(0x301)}`)).toBe(3);
  });
});

test.describe('date d\'un message', () => {
  test('s\'écrit en toutes lettres, à l\'heure de Paris', () => {
    expect(formatDay('2026-11-13T10:00:00.000Z')).toBe('13 novembre 2026');
    expect(formatDay('2026-03-01T08:30:00.000Z')).toBe('1 mars 2026');
    // 23 h 30 en temps universel : déjà le lendemain à Paris.
    expect(formatDay('2026-11-13T23:30:00.000Z')).toBe('14 novembre 2026');
  });

  test('une date illisible ne donne rien', () => {
    expect(formatDay('pas une date')).toBe('');
    expect(formatDay('')).toBe('');
  });
});

test.describe('sujet demandé dans l\'adresse', () => {
  const known = ['demo:gravite', 'project:depenses'];

  test('est retenu s\'il est connu', () => {
    expect(subjectFromSearch('?sujet=demo%3Agravite', known)).toBe('demo:gravite');
    expect(subjectFromSearch('?sujet=demo:gravite', known)).toBe('demo:gravite');
    expect(subjectFromSearch('?autre=1&sujet=project%3Adepenses', known)).toBe('project:depenses');
  });

  test('est ignoré sinon', () => {
    expect(subjectFromSearch('', known)).toBeNull();
    expect(subjectFromSearch('?sujet=', known)).toBeNull();
    expect(subjectFromSearch('?sujet=demo%3Ainconnue', known)).toBeNull();
    expect(subjectFromSearch('?sujet=%3Cscript%3E', known)).toBeNull();
  });
});

test.describe('erreurs du formulaire', () => {
  test('garde le premier message de l\'API pour chaque champ', () => {
    expect(
      fieldMessages([
        { path: 'author', message: 'Le pseudo doit faire entre 2 et 24 caractères.' },
        { path: 'body', message: 'Le texte est vide.' },
        { path: 'body', message: 'Un second message.' },
      ]),
    ).toEqual({ author: 'Le pseudo doit faire entre 2 et 24 caractères.', body: 'Le texte est vide.' });
    expect(fieldMessages([])).toEqual({});
  });

  test('avant l\'envoi, le site vérifie seulement que les champs sont remplis', () => {
    expect(missingFields({ author: '', body: '' })).toEqual({ author: 'Indiquez un pseudo.', body: 'Écrivez votre message.' });
    expect(missingFields({ author: '  ', body: '\n' })).toEqual({ author: 'Indiquez un pseudo.', body: 'Écrivez votre message.' });
    expect(missingFields({ author: 'Ada', body: '' })).toEqual({ body: 'Écrivez votre message.' });
    // Trop court, trop long, avec un lien : c'est l'API qui tranche.
    expect(missingFields({ author: 'a', body: 'x'.repeat(5000) })).toEqual({});
  });
});

test('pluriel', () => {
  expect(plural(0, 'message')).toBe('0 message');
  expect(plural(1, 'message')).toBe('1 message');
  expect(plural(2, 'message')).toBe('2 messages');
});
