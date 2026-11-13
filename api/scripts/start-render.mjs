// Démarrage sur Render : vérifie la configuration, applique les migrations, crée ou remplace le compte
// administrateur si ADMIN_LOGIN et ADMIN_PASSWORD sont définies, puis lance le serveur.
//
// Tout ce qui peut empêcher le démarrage est contrôlé AVANT la première connexion à la base : une configuration
// fausse ne doit pas laisser migrer la base avant de refuser de démarrer. Chemins résolus depuis ce fichier,
// pas depuis le dossier courant. Repris de Dépenses partagées.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

function refuse(message) {
  console.error(`start:render refusé : ${message} Aucune migration lancée.`);
  process.exit(1);
}

// a. Render pose exactement RENDER=true. Sans elle, ce n'est pas Render.
if (process.env.RENDER !== 'true') {
  refuse('réservé à Render (variable RENDER absente ou différente de "true"). En local, utilise npm start.');
}
// b. La CLI doit lire DATABASE_URL dans l'environnement de Render.
if (!process.env.DATABASE_URL) {
  refuse("DATABASE_URL est absente ou vide dans l'environnement.");
}
// c. Sinon la CLI de node-pg-migrate lirait ce .env, qui pointe vers la base Neon de développement.
if (existsSync(path('../.env'))) {
  refuse('un fichier .env existe à la racine de api/, la CLI de node-pg-migrate le lirait.');
}
// d. Importer la configuration la valide (process.env, sans dotenv) et prouve que dist/ existe.
try {
  await import('../dist/config/env.js');
} catch (error) {
  refuse(`configuration invalide ou dist/ absent (${error instanceof Error ? error.message : 'erreur inconnue'}).`);
}
// e. Le compte administrateur demandé est contrôlé maintenant : un identifiant ou un mot de passe refusé ne doit
//    pas se découvrir après les migrations. Aucune connexion n'est ouverte ici.
let credentials = null;
try {
  const { adminCredentialsFromEnv } = await import('../dist/admin-account.js');
  credentials = adminCredentialsFromEnv(process.env);
} catch (error) {
  refuse(error instanceof Error ? error.message : 'compte administrateur illisible.');
}

// --envPath /dev/null : la CLI appelle dotenv.config() et lirait sinon le .env de son dossier courant, fixé ici à la
// racine de api/ (celle que vérifie le contrôle c).
const migrate = spawnSync(
  process.execPath,
  [path('../node_modules/node-pg-migrate/bin/node-pg-migrate.js'), 'up', '--migrations-dir', path('../migrations'), '--envPath', '/dev/null'],
  { stdio: 'inherit', cwd: path('..') },
);
if (migrate.status !== 0) {
  console.error(`Migrations en échec : le serveur ne démarre pas.${migrate.error ? ` ${migrate.error.message}` : ''}`);
  process.exit(migrate.status ?? 1);
}

if (credentials) {
  try {
    const { setAdminAccount } = await import('../dist/admin-account.js');
    const outcome = await setAdminAccount(credentials);
    console.log(
      outcome === 'created'
        ? `Compte administrateur « ${credentials.login} » créé.`
        : `Compte administrateur remplacé par « ${credentials.login} ». Toutes les sessions sont fermées.`,
    );
    console.warn(
      'ADMIN_LOGIN et ADMIN_PASSWORD sont encore définies : retirez-les des variables de Render. ' +
        'Tant qu\'elles restent, chaque démarrage remet ce mot de passe et ferme les sessions.',
    );
  } catch (error) {
    // Le message d'une erreur PostgreSQL peut reprendre une valeur : on ne journalise que son code.
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'inconnu';
    console.error(`Compte administrateur : création en échec (code ${code}). Le serveur ne démarre pas.`);
    process.exit(1);
  }
}

// Le serveur démarre dans ce même processus. Avec npm run start:render, npm reçoit le SIGTERM de Render et le
// transmet à ce processus ; l'arrêt propre du serveur n'est pas géré.
await import('../dist/index.js');
