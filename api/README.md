# API de TechniDev

Le back du livre d'or : les visiteurs laissent un message, l'administrateur relit, publie, répond ou supprime. Node.js, Express 5, TypeScript strict, PostgreSQL. Le contrat et les règles sont dans [`docs/SPEC.md`](../docs/SPEC.md), partie B.

Le site n'en dépend jamais : sans cette API, toutes les pages et toutes les démos fonctionnent, seul le livre d'or attend.

## Démarrer en local

Node 24. Une base PostgreSQL de **développement** en UTF8 (un projet Neon à part, jamais celle de production).

```bash
cd api
npm install
cp .env.example .env
```

Renseigner `DATABASE_URL` dans `.env`, puis créer les tables :

```bash
npm run migrate up
```

Créer le compte administrateur : ajouter `ADMIN_LOGIN` et `ADMIN_PASSWORD` (12 caractères au moins) dans `.env`, lancer la commande, puis retirer les deux lignes.

```bash
npm run create-admin
```

Lancer l'API :

```bash
npm run dev
```

Elle écoute sur <http://localhost:3000>. Le serveur de développement du site (`web/`, port 4321) lui transmet tout ce qui commence par `/api`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | `tsx watch src/index.ts` : relance à chaque sauvegarde |
| `npm run typecheck` | `tsc --noEmit` sur `src/`, `tests/` et la configuration des tests |
| `npm test` | Vitest : démarre une base PGlite en mémoire, applique les migrations, lance les tests |
| `npm run test:watch` | la même chose, relancée à chaque sauvegarde |
| `npm run build` | vide `dist/`, puis compile `src/` |
| `npm start` | `node dist/index.js` : ne migre jamais |
| `npm run start:render` | Render seulement : contrôles, migrations, compte administrateur, serveur |
| `npm run migrate up` / `down` | `node-pg-migrate` sur la base de `.env` |
| `npm run create-admin` | crée ou remplace le compte administrateur, ferme toutes les sessions |
| `npx node-pg-migrate create <nom>` | crée une migration dans `migrations/` |

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | chaîne de connexion PostgreSQL. En production, elle doit contenir `sslmode=verify-full`, une seule fois |
| `FRONT_URL` | adresse du site : seule origine acceptée pour une requête qui modifie quelque chose. En production, en `https://` |
| `NETLIFY_SIGNATURE` | secret partagé avec Netlify (`API_SIGNATURE_TOKEN` de son côté). Obligatoire en production |
| `NODE_ENV` | `development`, `test` ou `production` |
| `PORT` | 3000 par défaut ; Render fournit le sien |
| `ADMIN_LOGIN`, `ADMIN_PASSWORD` | seulement le temps de créer ou de remplacer le compte administrateur |

Le fichier `.env` n'est jamais committé. `.env.example` en donne le modèle, sans valeur réelle.

## Tests

```bash
npm test
```

199 tests (Vitest et Supertest). Ils tournent sur PGlite, un PostgreSQL embarqué en mémoire : rien à installer, et jamais la base Neon. `tests/helpers.ts` refuse de vider des tables si `DATABASE_URL` n'est pas celle des tests.

Un fichier par domaine : `socle` (santé, format d'erreur), `config`, `proxy` (signature de Netlify, origine, limite globale), `admin-account`, `admin-auth`, `text` (règles de texte), `messages`, `admin-messages`, `migrations` (montée, descente, contraintes).

PGlite n'a qu'une session : il ne peut pas montrer que deux envois simultanés respectent le plafond. Ce point a été vérifié à part, sur un PostgreSQL 16 local, le 13 novembre 2026 : toute la suite y passe (les tests des migrations gardent leur propre PGlite), et le test des envois simultanés échoue dès qu'on retire le verrou.

## Organisation du code

```
migrations/             une migration par évolution, jamais modifiée une fois appliquée
scripts/start-render.mjs  démarrage sur Render : contrôles, migrations, compte, serveur
src/
  index.ts              point d'entrée : charge .env, écoute sur PORT
  app.ts                createApp({ config, limits }) : l'application, importée par les tests
  config/env.ts         lecture et contrôle des variables d'environnement
  db.ts                 pool pg, query(), transaction()
  errors.ts             AppError, format d'erreur de la SPEC, traduction des erreurs PostgreSQL
  validation.ts         parseBody, parseQuery, parseId ; messages de Zod en français
  contract.ts           types échangés avec le site (SPEC §B6.3)
  serializers.ts        réponses construites champ par champ
  text.ts               mise au propre et contrôle du pseudo, du texte et des réponses
  pages.ts              ce à quoi un message peut être rattaché
  admin-account.ts      création et remplacement du compte administrateur
  create-admin.ts       la commande npm run create-admin
  middleware/           corps JSON seulement, journal des requêtes, en-têtes
  security/             proxy signé, contrôle d'origine, sessions, mots de passe, limites
  routes/               health, admin-auth, messages, admin-messages
tests/                  Vitest et Supertest sur PGlite
```

## Ajouter une démo ou un projet au livre d'or

La liste des rattachements acceptés est dans `src/pages.ts`. Elle reprend les `slug` de `web/src/data/demos.ts` et de `web/src/data/projects.ts`. Si les deux s'écartent, `npm test` échoue dans `web/` (`tests/guestbook-pages.spec.ts`).

## Mettre en ligne

À faire par Mathieu : les sessions de Claude Code dans le nuage n'ont accès ni à Neon ni à Render. Rien de cette section n'a pu être vérifié en ligne.

### 1. Neon

1. Créer un projet à Francfort pour la **production**, et un autre (ou une autre base) pour le **développement**.
2. Vérifier l'encodage : `SHOW server_encoding;` doit répondre `UTF8`. Les longueurs des messages en dépendent ; la migration 2 refuse toute autre base.
3. Copier la chaîne de connexion **directe** (pas celle du « pooler ») : les migrations prennent un verrou de session. Lui ajouter `sslmode=verify-full` si elle porte un autre `sslmode`.

### 2. Render

Nouveau service web, relié à ce dépôt :

| Réglage | Valeur |
|---|---|
| Dossier racine | `api` |
| Région | Francfort |
| Offre | gratuite |
| Construction | `npm ci --include=dev && npm run build` |
| Démarrage | `npm run start:render` |
| Contrôle de santé | `/api/health` |

Node 24 est fixé par `engines` dans `package.json`.

Variables : `NODE_ENV=production`, `DATABASE_URL`, `FRONT_URL` (l'adresse du site sur Netlify), `NETLIFY_SIGNATURE`. Pour ce dernier, un secret tiré au hasard :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Pour créer le compte administrateur, ajouter `ADMIN_LOGIN` et `ADMIN_PASSWORD`, laisser Render redémarrer, se connecter une fois sur `/admin`, **puis retirer les deux variables**. Tant qu'elles restent, chaque démarrage remet ce mot de passe et ferme les sessions ; et sur l'offre gratuite, chaque réveil est un démarrage.

À chaque démarrage, `start:render` vérifie d'abord la configuration, puis applique les migrations, puis lance le serveur. Une migration poussée sur `main` s'applique donc en production au démarrage suivant : la tester d'abord (`npm test`) et la relire.

### 3. Netlify

1. Dans les variables du site, ajouter `API_SIGNATURE_TOKEN`, avec la même valeur que `NETLIFY_SIGNATURE`.
2. Dans `netlify.toml`, à la racine du dépôt, activer le bloc `[[redirects]]` déjà écrit en commentaire, en y mettant l'adresse du service Render.
3. Redéployer le site.

### 4. Vérifier en ligne

- `https://<service>.onrender.com/api/health` répond `{"status":"ok"}`.
- `https://<service>.onrender.com/api/messages` répond `403` : l'API ne parle qu'au site.
- `https://<site>/api/messages` répond `200`.
- Le journal de Render contient, une fois, « Première signature Netlify acceptée ».
- Envoyer un message depuis le livre d'or, le publier depuis `/admin`, y répondre, le supprimer.
- Retirer `ADMIN_LOGIN` et `ADMIN_PASSWORD` de Render.

## Sécurité, en bref

- En production, toute requête doit porter la signature de Netlify, sauf le contrôle de santé.
- Une requête qui modifie quelque chose doit venir du site (en-tête `Origin`), en JSON.
- Mot de passe haché avec bcrypt ; jeton de session tiré au hasard, dont seule l'empreinte est en base ; cookie `httpOnly`, `Secure` en production, `SameSite=Lax`, limité à `/api/admin`, 12 heures.
- Requêtes SQL paramétrées, entrées validées avec Zod, champs inconnus refusés.
- Le journal ne contient ni message, ni pseudo, ni adresse, ni jeton.
- Rien d'autre qu'un pseudo, un texte, un rattachement et une date n'est enregistré avec un message.
