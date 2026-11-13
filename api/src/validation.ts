import { z } from 'zod';
import { notFound, validationError, zodDetails } from './errors.js';

// Messages de validation en français : ils sont renvoyés tels quels au front (SPEC §B6.1).
z.config(z.locales.fr());

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(zodDetails(result.error));
  return result.data;
}

export const parseBody = <S extends z.ZodType>(schema: S, body: unknown) => parse(schema, body);
export const parseQuery = <S extends z.ZodType>(schema: S, query: unknown) => parse(schema, query);

/** Plus grand identifiant possible : les clés sont des `serial` (entier sur 32 bits). */
export const MAX_ID = 2_147_483_647;

/** Identifiant de chemin : un entier positif, sinon 404 (la ressource n'existe pas). */
export function parseId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw notFound();
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id > MAX_ID) throw notFound();
  return id;
}
