import { z } from 'zod';
import { query, transaction } from './db.js';
import { fitsBcrypt, hashPassword } from './security/passwords.js';

// Le compte administrateur (SPEC §B3) : un seul, créé ou remplacé à partir de deux variables d'environnement.

export const MIN_PASSWORD_LENGTH = 12;

/** Identifiant : gardé en minuscules, 3 à 40 caractères simples. */
export const adminLoginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, '3 à 40 caractères parmi les lettres sans accent, les chiffres, le point, le tiret et le tiret bas.');

/** Mot de passe : pris tel quel, sans retirer d'espace. La longueur se compte en caractères, pas en octets. */
export const adminPasswordSchema = z
  .string()
  .refine((value) => [...value].length >= MIN_PASSWORD_LENGTH, `Au moins ${MIN_PASSWORD_LENGTH} caractères.`)
  .refine(fitsBcrypt, 'Pas plus de 72 octets : au-delà, bcrypt ignorerait la fin.');

export interface AdminCredentials {
  login: string;
  password: string;
}

const VARIABLES = { login: 'ADMIN_LOGIN', password: 'ADMIN_PASSWORD' } as const;

/**
 * Lit ADMIN_LOGIN et ADMIN_PASSWORD. Renvoie null si aucune des deux n'est définie. Lève une erreur lisible si une
 * seule l'est ou si l'une est invalide : le message nomme la variable, jamais sa valeur.
 */
export function adminCredentialsFromEnv(env: NodeJS.ProcessEnv): AdminCredentials | null {
  const login = env.ADMIN_LOGIN ?? '';
  const password = env.ADMIN_PASSWORD ?? '';
  if (login === '' && password === '') return null;
  if (login === '' || password === '') {
    throw new Error(`Compte administrateur refusé : ${login === '' ? VARIABLES.login : VARIABLES.password} est absente, les deux variables vont ensemble.`);
  }
  const result = z.object({ login: adminLoginSchema, password: adminPasswordSchema }).safeParse({ login, password });
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `${issue.path[0] === 'login' ? VARIABLES.login : VARIABLES.password} : ${issue.message}`);
    throw new Error(`Compte administrateur refusé :\n${lines.join('\n')}`);
  }
  return result.data;
}

/**
 * Crée le compte administrateur, ou le remplace : il n'y en a jamais qu'un. Remplacer le compte ferme toutes les
 * sessions, qui partent avec lui (ON DELETE CASCADE).
 */
export async function setAdminAccount({ login, password }: AdminCredentials): Promise<'created' | 'replaced'> {
  const passwordHash = await hashPassword(password);
  return transaction(async (client) => {
    const removed = await query<{ id: number }>('DELETE FROM admins RETURNING id', [], client);
    await query('INSERT INTO admins (login, password_hash) VALUES ($1, $2)', [login, passwordHash], client);
    return removed.length > 0 ? 'replaced' : 'created';
  });
}
