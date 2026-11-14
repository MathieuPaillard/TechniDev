// Livre d'or : ce qui se calcule sans navigateur (testé dans web/tests/guestbook.spec.ts).
import type { ValidationDetail } from '../../../../api/src/contract';

/** Bornes de la SPEC (§B3). L'API tranche ; le site s'en sert pour le compteur et les attributs des champs. */
export const AUTHOR_MIN = 2;
export const AUTHOR_MAX = 24;
export const BODY_MAX = 600;

/**
 * Longueur d'un texte comme l'API la compte : en caractères (points de code), forme NFC, sans les espaces du
 * début et de la fin. L'API ramène en plus les lignes vides répétées à une seule : ce compte peut donc dépasser
 * le sien de quelques unités, jamais l'inverse.
 */
export function countCharacters(value: string): number {
  return Array.from(value.trim().normalize('NFC')).length;
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

/** « 13 novembre 2026 », à l'heure de Paris. Une date illisible donne une chaîne vide. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DAY.format(date);
}

/** Le rattachement demandé dans l'adresse (`?sujet=demo:gravite`), s'il fait partie de ceux que la page connaît. */
export function subjectFromSearch(search: string, known: readonly string[]): string | null {
  const wanted = new URLSearchParams(search).get('sujet');
  return wanted !== null && known.includes(wanted) ? wanted : null;
}

/** Le premier message de l'API pour chaque champ : `{ author: '…', body: '…' }`. */
export function fieldMessages(details: readonly ValidationDetail[]): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const detail of details) {
    if (!(detail.path in messages)) messages[detail.path] = detail.message;
  }
  return messages;
}

/** Ce que le site vérifie avant d'envoyer : seulement qu'il y a quelque chose. Le reste appartient à l'API. */
export function missingFields(draft: { author: string; body: string }): Record<string, string> {
  const messages: Record<string, string> = {};
  if (draft.author.trim() === '') messages.author = 'Indiquez un pseudo.';
  if (draft.body.trim() === '') messages.body = 'Écrivez votre message.';
  return messages;
}

/** « 1 message », « 12 messages ». */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
