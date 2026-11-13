import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Une chaîne vide ou non numérique est refusée au lieu de retomber sur la valeur par défaut.
    PORT: z
      .string()
      .regex(/^\d+$/, 'Doit être un entier entre 1 et 65535.')
      .transform(Number)
      .pipe(z.number().int().min(1, 'Doit être un entier entre 1 et 65535.').max(65535, 'Doit être un entier entre 1 et 65535.'))
      .default(3000),
    DATABASE_URL: z.string({ error: 'Obligatoire : chaîne de connexion PostgreSQL.' }).min(1, 'Obligatoire : chaîne de connexion PostgreSQL.'),
    // Contrôle d'origine et proxy signé : obligatoires en production.
    FRONT_URL: z.url().optional(),
    NETLIFY_SIGNATURE: z.string().min(1).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.NODE_ENV !== 'production') return;
    // Sans verify-full, la connexion à la base ne vérifie pas le certificat. Message sans la chaîne de connexion.
    // Une seule valeur exigée : pg garde la dernière d'un paramètre répété, alors que get() lirait la première.
    let sslmodes: string[] = [];
    try {
      sslmodes = new URL(values.DATABASE_URL).searchParams.getAll('sslmode');
    } catch {
      // Chaîne illisible : traitée comme sans sslmode, sans la recopier.
    }
    if (sslmodes.length !== 1 || sslmodes[0] !== 'verify-full') {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'En production, la chaîne de connexion doit contenir sslmode=verify-full.' });
    }
    if (values.FRONT_URL !== undefined && new URL(values.FRONT_URL).protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', path: ['FRONT_URL'], message: 'En production, doit commencer par https://.' });
    }
    for (const key of ['FRONT_URL', 'NETLIFY_SIGNATURE'] as const) {
      if (values[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Obligatoire en production.' });
      }
    }
  });

/** Lit et vérifie les variables ; lève une erreur lisible si l'une est absente ou invalide. */
export function parseConfig(env: NodeJS.ProcessEnv) {
  // Une variable définie mais vide (NETLIFY_SIGNATURE=) équivaut à absente, sauf PORT, refusée explicitement.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([key, value]) => key === 'PORT' || value !== ''));
  // Render pose RENDER=true : sans NODE_ENV=production, la signature du proxy serait désactivée sans bruit.
  if (env.RENDER && env.NODE_ENV !== 'production') {
    throw new Error('Configuration invalide : la variable RENDER est présente, NODE_ENV doit valoir "production".');
  }
  // Annulerait verify-full pour tout le processus.
  if (env.NODE_ENV === 'production' && env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('Configuration invalide : NODE_TLS_REJECT_UNAUTHORIZED=0 est interdit en production.');
  }
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    // prettifyError ne reprend que les chemins et nos messages : jamais la valeur d'une variable.
    throw new Error(`Configuration invalide :\n${z.prettifyError(result.error)}`);
  }
  const { FRONT_URL, ...rest } = result.data;
  return {
    ...rest,
    // Seule l'origine compte : un chemin ou une barre finale ne doivent pas faire refuser le site.
    FRONT_URL: new URL(FRONT_URL ?? 'http://localhost:4321').origin,
    isProduction: rest.NODE_ENV === 'production',
  };
}

export const config = parseConfig(process.env);

/** Les réglages dont dépend la sécurité : injectables dans createApp pour tester le mode production. */
export type SecurityConfig = Pick<typeof config, 'isProduction' | 'FRONT_URL' | 'NETLIFY_SIGNATURE'>;
