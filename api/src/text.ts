import { z } from 'zod';

// Règles de texte du livre d'or (SPEC §B3) : mise au propre, puis contrôles. Les caractères refusés sont écrits
// par leur numéro : ce fichier ne contient aucun caractère invisible.

export const AUTHOR_MIN = 2;
export const AUTHOR_MAX = 24;
export const BODY_MAX = 600;

/** Longueur en points de code Unicode : la mesure de char_length() dans PostgreSQL, pas celle de `.length`. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

const NEWLINE = 0x0a;
/** Séparateurs de ligne et de paragraphe : des retours à la ligne que `\n` ne voit pas. */
const LINE_SEPARATORS = [0x2028, 0x2029];
/** Caractères qui changent le sens d'écriture (marques, embarquements, forçages, isolats) : ils maquillent un texte. */
const DIRECTION_CONTROLS = [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];

function isForbidden(codePoint: number, allowNewline: boolean): boolean {
  if (codePoint === NEWLINE) return !allowNewline;
  // Caractères de contrôle : C0, DEL et C1.
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  return LINE_SEPARATORS.includes(codePoint) || DIRECTION_CONTROLS.includes(codePoint);
}

export function hasForbiddenCharacter(value: string, { allowNewline }: { allowNewline: boolean }): boolean {
  // Une moitié de paire UTF-16 isolée n'est pas un caractère : la base la remplacerait en silence.
  if (!value.isWellFormed()) return true;
  for (const character of value) {
    if (isForbidden(character.codePointAt(0)!, allowNewline)) return true;
  }
  return false;
}

const LINK = /https?:\/\/|\bwww\./i;
export const containsLink = (value: string): boolean => LINK.test(value);

/** Pseudo : forme NFC, tabulations changées en espaces, une seule espace entre deux mots, rien autour. */
export function cleanAuthor(value: string): string {
  return value
    .normalize('NFC')
    .replaceAll('\t', ' ')
    .replace(/\p{Zs}+/gu, ' ')
    .trim();
}

/** Texte : forme NFC, retours à la ligne en `\n`, pas d'espace en fin de ligne, deux retours de suite au plus. */
export function cleanBody(value: string): string {
  return value
    .normalize('NFC')
    .replaceAll('\t', ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Zs}+\n/gu, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const FORBIDDEN_MESSAGE = "Un caractère invisible ou de contrôle n'est pas accepté ici.";
const LINK_MESSAGE = 'Les liens ne sont pas acceptés : retirez les adresses (http://, https://, www.).';

/** Pseudo d'un message : mis au propre, puis contrôlé. */
export const authorSchema = z
  .string()
  .transform(cleanAuthor)
  .pipe(
    z
      .string()
      .refine((value) => !hasForbiddenCharacter(value, { allowNewline: false }), FORBIDDEN_MESSAGE)
      .refine((value) => {
        const length = codePointLength(value);
        return length >= AUTHOR_MIN && length <= AUTHOR_MAX;
      }, `Le pseudo doit faire entre ${AUTHOR_MIN} et ${AUTHOR_MAX} caractères.`)
      .refine((value) => !containsLink(value), LINK_MESSAGE),
  );

function bodySchema({ allowLinks }: { allowLinks: boolean }) {
  return z
    .string()
    .transform(cleanBody)
    .pipe(
      z
        .string()
        .refine((value) => !hasForbiddenCharacter(value, { allowNewline: true }), FORBIDDEN_MESSAGE)
        .refine((value) => value.length > 0, 'Le texte est vide.')
        .refine((value) => codePointLength(value) <= BODY_MAX, `Le texte ne doit pas dépasser ${BODY_MAX} caractères.`)
        .refine((value) => allowLinks || !containsLink(value), LINK_MESSAGE),
    );
}

/** Texte d'un message : aucun lien. */
export const messageBodySchema = bodySchema({ allowLinks: false });
/** Réponse de l'administrateur : mêmes règles, mais les adresses y sont permises (elles ne sont pas cliquables). */
export const replyBodySchema = bodySchema({ allowLinks: true });
