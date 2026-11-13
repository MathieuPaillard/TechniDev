// npm run create-admin : crée ou remplace le compte administrateur dans la base de DATABASE_URL, à partir de
// ADMIN_LOGIN et ADMIN_PASSWORD. Les variables sont lues dans l'environnement, ou dans le fichier .env.
import 'dotenv/config';

let closePool: (() => Promise<void>) | undefined;
try {
  // Imports faits ici : une configuration invalide donne un message, pas une pile d'appels.
  const { adminCredentialsFromEnv, setAdminAccount } = await import('./admin-account.js');
  const { pool } = await import('./db.js');
  closePool = () => pool.end();

  const credentials = adminCredentialsFromEnv(process.env);
  if (!credentials) {
    throw new Error('ADMIN_LOGIN et ADMIN_PASSWORD sont absentes : définissez-les dans .env, le temps de cette commande.');
  }
  const outcome = await setAdminAccount(credentials);
  console.log(
    outcome === 'created'
      ? `Compte administrateur « ${credentials.login} » créé.`
      : `Compte administrateur remplacé par « ${credentials.login} ». Toutes les sessions sont fermées.`,
  );
  console.log('Retirez maintenant ADMIN_LOGIN et ADMIN_PASSWORD de .env.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Erreur inconnue.');
  process.exitCode = 1;
} finally {
  await closePool?.();
}
