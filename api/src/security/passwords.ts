import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

const COST = 10;
/** bcrypt ignore tout ce qui suit le 72e octet : on refuse un mot de passe plus long au lieu de le tronquer en silence. */
export const MAX_PASSWORD_BYTES = 72;
export const fitsBcrypt = (password: string): boolean => Buffer.byteLength(password) <= MAX_PASSWORD_BYTES;

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, COST);
export const verifyPassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

// Empreinte calculée une fois : sert à comparer quand l'identifiant est inconnu.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

/** Même temps de réponse pour un identifiant inconnu que pour un mauvais mot de passe. */
export async function dummyCompare(password: string): Promise<false> {
  await verifyPassword(password, await dummyHash);
  return false;
}
