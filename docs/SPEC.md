# TechniDev : spécification

> Document de référence du dépôt. Toute évolution du contrat (base de données, API, règles) passe d'abord par ce fichier.
>
> Version 0.2 du 13 novembre 2026. **Le site (partie A) est construit. Le back (partie B) a été validé par Mathieu le 12 novembre 2026 ; l'avancement de son code est au §B11.** Les propositions du §B15 attendent une confirmation.

---

## 0. En bref

- TechniDev est la vitrine personnelle de Mathieu Paillard : ses projets, et un labo de démos jouables.
- **Partie A, en place** : un site statique (Astro, TypeScript), hébergé sur Netlify. Aucun serveur, aucune donnée enregistrée.
- **Partie B, validée** : un livre d'or modéré et une connexion administrateur. API Node.js, Express et TypeScript sur Render ; base PostgreSQL sur Neon. Même architecture que Dépenses partagées.
- Règle qui tient les deux ensemble : **le site ne dépend jamais du back**. Si l'API dort ou tombe, toutes les pages et toutes les démos fonctionnent ; seul le livre d'or attend.

---

# Partie A : le site (en place)

## A1. Pages

| Adresse | Contenu |
|---|---|
| `/` | l'enseigne, le choix du gaz, les six démos, une bande Gravité jouable, six projets mis en avant, le parcours, « Comment c'est fait » |
| `/labo` | les six démos, leur origine et leur année |
| `/labo/gravite`, `/labo/ondes`, `/labo/population` | simulations en canvas |
| `/labo/masse-molaire`, `/labo/pgcd`, `/labo/qui-doit-quoi` | outils |
| `/projets` | tous les projets, avec filtre |
| page 404 | toute autre adresse |

## A2. Règles du contenu

- Chaque projet porte son **état réel** (en ligne, publié sur le Play Store, usage privé, prototype) et sa **fabrication** (écrit à la main, ou conçu et piloté puis codé avec une IA). Quand la fabrication n'est pas connue, aucune étiquette n'est affichée.
- **Aucune trace d'un employeur** : un outil fait pour le travail est décrit en termes généraux, sans nom, sans lien, sans capture, avec des données inventées.
- Un site n'est cité que si Mathieu l'a demandé.
- Chaque démo dit d'où elle vient, ce qu'elle fait et ce qui a changé par rapport au programme d'origine.
- Aucun tiret cadratin dans les textes.

## A3. Règles du design

- Un seul gaz éclaire le site à la fois (`data-gas` sur `<html>` : `he`, `ne`, `ar`, `kr`, `xe` ; argon par défaut). Le choix est retenu dans le navigateur (`localStorage`, clé `technidev.gas`).
- L'interrupteur éteint les tubes (`data-tubes="off"`, clé `technidev.tubes`) : plus de lueur ni d'amorçage ; les simulations se dessinent sans halo.
- Allumé veut dire vivant, en ligne ou que l'on peut toucher. Le texte courant ne brille jamais.
- L'amorçage de l'enseigne se joue une fois par visite (`sessionStorage`), jamais avec « réduire les animations ». Dans ce cas, les simulations démarrent en pause.
- Les simulations s'arrêtent quand l'onglet est caché ou qu'elles sortent de l'écran.
- Rien d'autre n'est enregistré dans le navigateur.

## A4. Exigences techniques

- Politique de sécurité (`netlify.toml`) : `default-src 'self'`, sans `unsafe-inline` ni `unsafe-eval`. Donc aucun script ni style en ligne dans le HTML, aucune ressource d'un autre site, polices auto-hébergées.
- Chaque page tient sans défilement horizontal à 320 px de large.
- La logique de chaque démo est une fonction pure, testée sans navigateur.
- Vérifications avant tout commit : `npm run check`, `npm test`, `npm run e2e`.

---

# Partie B : le back (validé le 12 novembre 2026)

## B1. Périmètre

### Inclus en v1

- **Livre d'or** : un visiteur laisse un message (un pseudo et un texte), sans compte. Le message n'apparaît qu'après relecture par l'administrateur.
- Un message peut être rattaché à une démo ou à un projet, ou rester général.
- **Administrateur** (un seul compte, celui de Mathieu) : connexion, liste des messages en attente, publication, suppression, réponse sous un message, déconnexion.

### Hors v1 (envisageable ensuite)

- Comptes pour les visiteurs, envoi d'e-mails, notifications.
- Mot de passe oublié (le compte se recrée par script).
- Compteur anonyme « j'aime » par démo.
- Carnet rédigé depuis l'administration et publié sur le site.
- Notes sur 10, compteur de visites, export des messages : proposés au §B15, **à confirmer avant tout code**.

## B2. Rôles et parcours

| Action | Visiteur | Administrateur connecté |
|---|---|---|
| Lire les messages publiés | oui | oui |
| Écrire un message | oui | non (il répond, il n'écrit pas dans le fil) |
| Voir les messages en attente | non | oui |
| Publier ou supprimer un message | non | oui |
| Répondre sous un message publié, modifier ou retirer sa réponse | non | oui |

Parcours :

1. Un visiteur ouvre le livre d'or, ou suit le lien « Laisser un mot » d'une démo. Les messages publiés s'affichent, les plus récents d'abord.
2. Il écrit un pseudo et un texte, puis envoie. Le site répond : « Merci. Votre message attend d'être relu avant d'apparaître. »
3. Mathieu se connecte à `/admin`. Il voit les messages en attente, du plus ancien au plus récent.
4. Il publie un message, ou le supprime. Un message publié peut encore être supprimé.
5. Il peut répondre sous un message publié ; la réponse s'affiche avec la mention « Mathieu ».
6. Pour faire retirer un message, on l'écrit dans le livre d'or : la demande arrive dans la file de Mathieu, qui supprime les deux messages.

## B3. Règles de gestion

- **Message** : pseudo de 2 à 24 caractères, texte de 1 à 600 caractères. Un caractère est un point de code Unicode (un émoji simple compte pour un) : l'API et la base mesurent de la même façon.
- **Mise au propre, avant tout contrôle** : forme Unicode NFC ; tabulations changées en espaces ; espaces de début et de fin retirés. Dans le pseudo, une suite d'espaces devient une seule espace. Dans le texte, les retours à la ligne sont gardés (`\r\n` et `\r` deviennent `\n`) ; trois retours ou plus à la suite sont ramenés à deux.
- **Caractères refusés** : les caractères de contrôle (sauf le retour à la ligne, dans le texte seulement), les séparateurs U+2028 et U+2029, et les caractères qui changent le sens d'écriture (U+061C, U+200E, U+200F, U+202A à U+202E, U+2066 à U+2069). Ils servent à maquiller un texte.
- **Texte brut** : affiché tel quel, échappé, avec ses retours à la ligne. Aucune mise en forme, aucun lien cliquable.
- **Liens** : un pseudo ou un texte qui contient `http://`, `https://` ou `www.` (en majuscules comme en minuscules) est refusé, avec un message clair.
- **États** : `pending` (en attente) puis `published` (publié). Un message refusé est **supprimé** : rien n'est conservé.
- **Rattachement** : `page` vaut `null` (général) ou l'un des identifiants connus, `demo:<slug>` pour une démo du labo et `project:<slug>` pour un projet. Une valeur inconnue est refusée. La liste vit dans `api/src/pages.ts` ; un test du site échoue si elle s'écarte des démos et des projets affichés.
- **Doublon** : un message identique à un message déjà en attente (même pseudo, même texte, même rattachement) n'est pas enregistré une seconde fois. La réponse est la même que pour un premier envoi.
- **Aucune donnée technique n'est enregistrée avec un message** : ni adresse IP, ni navigateur. La date est gardée.
- **Limites d'envoi**, par adresse du visiteur (transmise par Netlify, gardée en mémoire seulement) : 3 messages par heure, 10 par jour. Tout envoi valide compte, enregistré ou non. Les compteurs repartent de zéro quand le serveur redémarre.
- **Plafonds** : 200 messages en attente et 2 000 messages publiés, vérifiés à l'envoi. Au-delà, l'envoi est refusé (« Le livre d'or est plein pour le moment »). Deux envois simultanés ne peuvent pas dépasser le plafond (verrou).
- **Pot de miel** : le formulaire contient un champ caché, `website`. S'il est rempli, l'API répond comme si tout allait bien, sans rien enregistrer ni compter.
- **Réponse de l'administrateur** : un texte de 1 à 600 caractères par message **publié**, modifiable et supprimable. Même mise au propre et mêmes caractères refusés que le texte d'un message ; les adresses y sont permises (elles ne sont pas cliquables).
- **Compte administrateur** : un seul, et la base n'en accepte pas un second. Il est créé ou remplacé par un script à partir des variables `ADMIN_LOGIN` et `ADMIN_PASSWORD`. Aucune inscription, aucune route pour en créer un. Remplacer le compte ferme toutes les sessions. Identifiant : 3 à 40 caractères parmi les lettres sans accent, les chiffres, le point, le tiret et le tiret bas ; il est gardé en minuscules. Mot de passe : 12 caractères au moins, 72 octets au plus (au-delà, bcrypt ignorerait la fin).
- **Session** : un cookie `technidev_admin`, `httpOnly`, `Secure` en production, `SameSite=Lax`, envoyé seulement vers `/api/admin`, valable 12 heures. Seule l'empreinte du jeton est en base. La déconnexion supprime la session. Les sessions expirées sont effacées à chaque connexion.
- **Connexion** : 5 échecs par quart d'heure et par adresse ; une connexion réussie ne compte pas. Même réponse et même durée que l'identifiant existe ou non.
- **Horodatages** : `statement_timestamp()`, jamais `now()`.

## B4. Architecture

```
Navigateur ──HTTPS──▶ Netlify : site statique (web/)
                        │  /api/*  redirigé (proxy signé) : même origine pour le navigateur
                        ▼
                     Render : API Express (api/), Francfort, offre gratuite
                        │  SSL vérifié (verify-full)
                        ▼
                     Neon : PostgreSQL, Francfort, offre gratuite
```

- Le front appelle `/api/...` en chemin relatif. Pas de CORS, et le cookie de session n'est pas « tiers ».
- **Veille de Render** : après environ 15 minutes sans requête, le serveur s'endort ; le réveil prend 30 à 60 secondes. Seules les pages qui ont besoin de l'API l'appellent (livre d'or, blocs « Laisser un mot », `/admin`), et seulement quand leur bloc arrive à l'écran. Elles affichent « Réveil du serveur… » en interrogeant `GET /api/health` toutes les 3 secondes, 90 secondes au plus.
- `GET /api/health` ne touche pas la base : le contrôle de santé de Render ne doit pas tenir Neon éveillé.
- En développement, le serveur Astro redirige `/api` vers `http://localhost:3000`.

## B5. Modèle de données

Migrations `node-pg-migrate` (API JavaScript, fichiers `.js` ESM), une migration par évolution, jamais modifiée une fois appliquée.

**`admins`** (migration 1)

| Colonne | Type | Règle |
|---|---|---|
| `id` | `serial` | clé primaire |
| `login` | `text` | unique, non nul |
| `password_hash` | `text` | non nul |
| `created_at` | `timestamptz` | non nul, défaut `statement_timestamp()` |

Index unique `admins_single_row_idx` sur la constante `true` : la table ne peut contenir qu'une ligne.

**`sessions`** (migration 1)

| Colonne | Type | Règle |
|---|---|---|
| `id` | `serial` | clé primaire |
| `admin_id` | `integer` | non nul, référence `admins(id)`, `ON DELETE CASCADE` |
| `token_hash` | `text` | unique, non nul |
| `created_at` | `timestamptz` | non nul, défaut `statement_timestamp()` |
| `expires_at` | `timestamptz` | non nul |

**`messages`** (migration 2)

| Colonne | Type | Règle |
|---|---|---|
| `id` | `serial` | clé primaire |
| `page` | `text` | nul pour un message général ; 1 à 60 caractères sinon |
| `author` | `text` | non nul, 2 à 24 caractères |
| `body` | `text` | non nul, 1 à 600 caractères |
| `status` | `text` | non nul, `pending` ou `published`, `pending` par défaut |
| `created_at` | `timestamptz` | non nul, défaut `statement_timestamp()` |
| `published_at` | `timestamptz` | nul tant que le message attend, renseigné dès qu'il est publié |
| `reply` | `text` | nul sans réponse, 1 à 600 caractères sinon |
| `replied_at` | `timestamptz` | nul sans réponse, renseigné avec elle |

Chaque règle de la colonne de droite est une contrainte `CHECK`. Index : `messages (status, id)`, qui sert les deux listes (l'ordre des messages est celui de leur identifiant).

## B6. API

Préfixe `/api`. Corps en JSON, 8 ko au plus, jamais compressé. Champs inconnus refusés, dans les corps comme dans les paramètres d'adresse.

### B6.1 Format d'erreur

```json
{ "error": { "code": "VALIDATION", "message": "Certaines données sont invalides.", "details": [{ "path": "body", "message": "600 caractères au plus." }] } }
```

| Code | Statut | Quand |
|---|---|---|
| `VALIDATION` | 400 | donnée refusée ; `details` donne un message par champ, 20 au plus |
| `UNAUTHENTICATED` | 401 | route réservée à l'administrateur, sans session valide |
| `INVALID_CREDENTIALS` | 401 | identifiant ou mot de passe incorrect |
| `ORIGIN_REJECTED` | 403 | requête qui ne vient pas du site |
| `NOT_FOUND` | 404 | route ou message introuvable |
| `INVALID_STATE` | 409 | action impossible dans l'état du message |
| `GUESTBOOK_FULL` | 409 | plafond du livre d'or atteint |
| `TOO_MANY_REQUESTS` | 429 | limite de débit atteinte |
| `INTERNAL_ERROR` | 500 | le reste, sans détail |

Messages en français, destinés à l'affichage. Ce sont les codes de Dépenses partagées, plus `GUESTBOOK_FULL`.

### B6.2 Routes

| Méthode et chemin | Qui | Effet |
|---|---|---|
| `GET /api/health` | tous | `200 { "status": "ok" }` |
| `GET /api/messages?page=…&before=…` | tous | `200 MessageList` : messages publiés, les plus récents d'abord, 30 au plus. `page` limite à un rattachement ; `before` (identifiant) donne la suite |
| `POST /api/messages` | tous | corps `{ author, body, page?, website? }` ; crée un message en attente ; `201 { "status": "pending" }` |
| `POST /api/admin/login` | tous | corps `{ login, password }` ; ouvre une session ; `204` et le cookie |
| `POST /api/admin/logout` | admin | ferme la session ; `204` |
| `GET /api/admin/me` | admin | `200 { "login": "…" }` |
| `GET /api/admin/messages?status=…&before=…` | admin | `200 AdminMessageList`. `status=pending` : tous, du plus ancien au plus récent. `status=published` : 50 au plus, les plus récents d'abord, `before` pour la suite |
| `POST /api/admin/messages/:id/publish` | admin | publie ; `200 AdminMessage` ; `409` si le message l'est déjà |
| `DELETE /api/admin/messages/:id` | admin | supprime définitivement ; `204` |
| `PUT /api/admin/messages/:id/reply` | admin | corps `{ body }` ; pose ou remplace la réponse ; `200 AdminMessage` ; `409` si le message attend encore |
| `DELETE /api/admin/messages/:id/reply` | admin | retire la réponse, s'il y en a une ; `204` |

### B6.3 Types échangés

```ts
interface Message {
  id: number;
  page: string | null;
  author: string;
  body: string;
  createdAt: string; // date d'écriture, ISO 8601
  reply: { body: string; repliedAt: string } | null;
}

interface MessageList {
  messages: Message[];
  /** Identifiant à passer dans `before` pour la suite ; null s'il n'y en a pas. */
  nextBefore: number | null;
}

/** Vue de l'administrateur : en plus, l'état et la date de publication. */
interface AdminMessage extends Message {
  status: 'pending' | 'published';
  publishedAt: string | null;
}

interface AdminMessageList {
  messages: AdminMessage[];
  nextBefore: number | null;
  counts: { pending: number; published: number };
}
```

Les réponses sont construites champ par champ : jamais une ligne SQL brute. Les types sont écrits dans `api/src/contract.ts`.

## B7. Sécurité

- **Proxy signé** : Netlify signe chaque requête transmise (`X-Nf-Sign`). En production, l'API refuse toute requête sans signature valide, sauf `GET /api/health`. L'adresse du visiteur n'est crue que sur une requête signée.
- **Contrôle d'origine** sur toute requête qui modifie quelque chose.
- Requêtes SQL toujours paramétrées. Entrées validées côté serveur (Zod, `z.strictObject`).
- Mots de passe hachés avec `bcrypt`, coût 10. Jetons de session tirés au hasard (32 octets), seule leur empreinte SHA-256 est stockée.
- `sslmode=verify-full` exigé au démarrage en production.
- Journal sans contenu de message, sans pseudo, sans adresse, sans jeton.
- En-têtes de sécurité, limites de débit toujours actives.
- **Le dépôt est public** : le code du back l'est aussi. Aucun secret dans le dépôt ; un `.env.example` décrit les variables.
- Les tests tournent sur PGlite, jamais sur Neon.

## B8. Front

- `/livre-d-or` : les messages publiés et le formulaire.
- Sous chaque démo : « Laisser un mot », avec les trois derniers messages de cette démo et un lien vers le formulaire du livre d'or, la démo déjà choisie.
- `/admin` : connexion, puis les messages en attente (publier, supprimer), puis les messages publiés (répondre, supprimer). La page n'est liée depuis aucune autre.
- États à dessiner : réveil du serveur ; liste vide (« Personne n'a encore écrit. Le premier mot est pour vous. ») ; envoi réussi ; erreur de saisie, champ par champ ; limite atteinte ; serveur injoignable (« Le livre d'or ne répond pas. Le reste du site fonctionne. »).
- Sous le formulaire, ce qui est enregistré : un pseudo, un texte et une date. Pas d'e-mail, pas d'adresse IP. Et comment faire retirer un message (§B2, point 6).
- Aucune donnée ne passe par `innerHTML`.

## B9. Tests attendus

- API : Vitest et Supertest sur PGlite. Chaque route, chaque règle du §B3, chaque code d'erreur, les limites de débit, le pot de miel, la signature du proxy.
- Front : les états du §B8 dans les tests de bout en bout, contre l'API lancée depuis ses sources sur une PGlite à part.
- Le contrôle des mots interdits s'étend aux pages nouvelles.

## B10. Déploiement

- **Neon** : une base de développement et une base de production, à part de celles des autres projets.
- **Render** : service dont le dossier racine est `api/`, Francfort, offre gratuite, Node 24. Construction : `npm ci --include=dev && npm run build`. Démarrage : `npm run start:render`, qui vérifie la configuration, applique les migrations, crée ou remplace le compte administrateur si `ADMIN_LOGIN` et `ADMIN_PASSWORD` sont présentes, puis lance le serveur. Contrôle de santé : `/api/health`.
- **Netlify** : redirection de `/api/*` vers Render, signée.
- Variables : `DATABASE_URL`, `NETLIFY_SIGNATURE` (Render) et `API_SIGNATURE_TOKEN` (Netlify, même valeur), `FRONT_URL`, `NODE_ENV=production` ; puis `ADMIN_LOGIN` et `ADMIN_PASSWORD`, le temps de créer le compte. **Tant qu'elles restent, chaque démarrage remet ce mot de passe et ferme les sessions** : les retirer dès que la connexion fonctionne.
- Les sessions de Claude Code dans le nuage n'ont pas accès à Neon : Mathieu applique les migrations et déploie.
- Le détail, pas à pas, est dans `api/README.md`.

## B11. Découpage en étapes

Aucune étape n'est faite en parallèle d'une autre, sauf mention contraire.

| Étape | Contenu | Fichiers | Vérification | État |
|---|---|---|---|---|
| 1 | Squelette de l'API : configuration, application, santé, format d'erreur, proxy signé, contrôle d'origine | `api/src/app.ts`, `config/`, `errors.ts`, `security/`, `routes/health.ts` | types, tests de la santé, de la signature et de l'origine | à faire |
| 2 | Migration 1 (`admins`, `sessions`), script de création du compte, connexion, déconnexion, `me` | `api/migrations/`, `scripts/`, `routes/admin-auth.ts`, `security/sessions.ts` | tests : connexion bonne et mauvaise, limite d'essais, expiration | à faire |
| 3 | Migration 2 (`messages`), lecture et envoi publics, limites, pot de miel, plafonds | `routes/messages.ts`, `security/limits.ts` | tests de chaque règle du §B3 | à faire |
| 4 | Modération : liste, publication, suppression, réponse | `routes/admin-messages.ts` | tests des droits et des états | à faire |
| 5 | Front : livre d'or et blocs « Laisser un mot » | `web/src/pages/livre-d-or.astro`, `web/src/lib/guestbook/` | tests de bout en bout des états du §B8 | à faire |
| 6 | Front : administration | `web/src/pages/admin.astro`, `web/src/lib/admin/` | tests de bout en bout : se connecter, publier, répondre, supprimer | à faire |
| 7 | Mise en ligne par Mathieu, puis vérifications en ligne (requête directe sur Render refusée, signature acceptée) | `netlify.toml`, réglages de Render | liste du §B7, sur le site réel | à faire, par Mathieu |
| 8 | Propositions du §B15, une fois confirmées | migration 3, routes, front | à écrire avec les règles confirmées | en attente de confirmation |

## B12. Questions posées et réponses

Mathieu a validé la partie B le 12 novembre 2026, avec les réponses proposées.

| | Question | Réponse |
|---|---|---|
| Q1 | Un seul fil, ou des messages rattachés à une démo ou à un projet ? | Rattachement facultatif |
| Q2 | Un compteur anonyme « j'aime » par démo ? | Non en v1 |
| Q3 | Une réponse de l'administrateur sous un message ? | Oui |
| Q4 | Les liens dans un message : refusés, ou acceptés sans être cliquables ? | Refusés |
| Q5 | Hachage du mot de passe : `scrypt` de Node ou `bcrypt` ? | `bcrypt` : Mathieu le connaît et l'utilise dans Dépenses partagées, il pourra relire ce code |
| Q6 | Par où demander le retrait d'un message ? | Par le livre d'or lui-même (§B2, point 6) : aucune adresse à publier. Proposé le 12 novembre, appliqué par défaut, **à confirmer** |
| Q7 | Reste-t-il de la place dans l'offre gratuite de Neon pour deux bases de plus ? | **Ouverte** : à vérifier par Mathieu dans son compte |
| Q8 | Un carnet rédigé depuis l'administration et affiché sur le site ? | Plus tard |
| Q9 | Le code du back sera public, comme le reste du dépôt. D'accord ? | Oui, tant que le dépôt reste public |

Dépendances de `api/`, validées avec le reste : `express`, `pg`, `zod`, `node-pg-migrate`, `cookie-parser`, `express-rate-limit`, `dotenv`, `bcrypt` ; pour le développement : `typescript`, `tsx`, `vitest`, `supertest`, `@electric-sql/pglite`, `@electric-sql/pglite-socket`, `dotenv-cli` et les types. Ce sont celles de Dépenses partagées. Aucun ajout sans accord.

## B13. Décisions prises (et pourquoi)

1. **Le site d'abord, le back en option.** Le site ne dépend jamais de l'API : une offre gratuite qui s'endort ne doit pas casser une vitrine.
2. **Pas de compte pour les visiteurs.** Pas d'e-mail à gérer, pas de mot de passe à protéger, moins de données personnelles.
3. **Rien n'apparaît sans relecture.** Un livre d'or ouvert attire le spam et les propos que l'on ne veut pas signer de son nom.
4. **Un message refusé est supprimé.** On ne garde pas ce que l'on ne publie pas.
5. **Même architecture que Dépenses partagées.** Elle est déjà auditée, et Mathieu la connaît. Le socle de l'API (proxy signé, contrôle d'origine, sessions, format d'erreur, accès à la base) en est repris.
6. **Un seul dépôt** : `web/` et `api/` côte à côte, chacun avec ses dépendances.
7. **La date affichée est celle de l'écriture**, et l'ordre est celui des identifiants. La version 0.1 donnait la date de publication : un message relu tard serait passé devant les autres avec une date qui n'est pas la sienne. La suite d'une liste se demande avec un identifiant, ce qui reste juste quand un message est supprimé entre deux pages.
8. **Les limites d'envoi comptent les envois valides**, pas les erreurs de saisie : trois fautes de frappe ne doivent pas bloquer quelqu'un une heure. Elles comptent l'envoi dès qu'il est valide, sans attendre la réponse : un client qui coupe la connexion avant la réponse ne récupère pas son essai.
9. **Un seul administrateur, garanti par la base.** Une règle écrite seulement dans le code se contourne par un oubli.
10. **Le compte se crée au démarrage de Render**, à partir de deux variables retirées ensuite : l'offre gratuite de Render n'a pas de console, et la chaîne de connexion de production n'a pas à passer par un poste de travail.
11. **Le cookie de session ne part que vers `/api/admin`** : il ne voyage pas avec les requêtes du livre d'or.
12. **Des caractères sont refusés** (contrôle, sens d'écriture) : ils ne servent qu'à maquiller un texte, et la relecture ne les voit pas.

## B14. Risques restants

- **Modération** : c'est un travail récurrent. Sans passage régulier, les messages attendent.
- **Spam** : les limites et le pot de miel arrêtent le tout-venant, pas un envoi ciblé depuis beaucoup d'adresses. Les plafonds bornent les dégâts : au pire, la file d'attente est pleine jusqu'au prochain passage de Mathieu.
- **Offres gratuites** : le réveil de Render retarde le premier affichage du livre d'or ; les quotas de Neon et de Render se partagent avec les autres projets du compte. Les limites d'envoi sont en mémoire : elles repartent de zéro à chaque réveil.
- **Dépôt public** : la route de connexion est connue de tous. Le mot de passe doit être long et propre à ce site. Rien ne limite les essais venus de beaucoup d'adresses à la fois ; un verrou global permettrait à n'importe qui de bloquer la connexion de Mathieu.
- **Données personnelles** : un pseudo et un texte libre peuvent en contenir, et l'adresse du visiteur est traitée en mémoire le temps des limites. Le site dit ce qui est enregistré et comment faire retirer un message. Ce n'est pas un avis juridique.

## B15. Propositions à confirmer

Rien de ce paragraphe n'est codé. Les deux premières idées sont de Mathieu (12 novembre 2026), les règles sont une proposition : il faut les confirmer ou les corriger. Elles demandent une migration et changent le contrat.

### B15.1 Notes sur 10

- Une note est un entier de 1 à 10, **facultative**, donnée **avec** un message : jamais seule. Elle porte sur ce à quoi le message est rattaché (le site, une démo, un projet).
- Elle n'est visible qu'une fois le message publié. Supprimer le message supprime la note.
- La moyenne ne compte que les messages publiés, et le site le dit (« moyenne des avis publiés »). Elle s'affiche à partir de 3 notes, avec leur nombre ; en dessous, seules les notes de chaque message se voient.
- Schéma (migration 3) : `messages.rating smallint`, nul sans note, `CHECK (rating BETWEEN 1 AND 10)`.
- Contrat : `rating: number | null` dans `Message` et dans le corps de `POST /api/messages` ; `ratings: { count: number; sum: number }` dans `MessageList`, pour le rattachement demandé. Le front calcule la moyenne.
- Limites à connaître : Mathieu choisit ce qui est publié, donc la moyenne n'est pas neutre ; une même personne peut envoyer plusieurs avis (3 par heure) ; avec peu d'avis, le chiffre apprend moins que les textes.

### B15.2 Compteur de visites

- Une visite est une session de navigateur : à la première page vue, le site envoie `POST /api/visits`, une seule fois (témoin dans `sessionStorage`, sans cookie).
- Rien n'identifie le visiteur. La base garde un nombre par jour : table `visits (day date PRIMARY KEY, count integer)`. Aucune adresse, aucun identifiant, aucune page.
- Une limite par adresse, en mémoire, freine le gonflage volontaire.
- `GET /api/visits` donne le total et les 30 derniers jours ; à décider : chiffre public ou réservé à l'administration.
- **Deux effets à peser.** Le chiffre est un minimum : un visiteur qui repart avant le réveil du serveur n'est pas compté, et un robot qui n'exécute pas le JavaScript non plus. Et chaque visite réveille le serveur, alors qu'aujourd'hui seules les pages du livre d'or l'appellent : le temps d'éveil de Render compte dans l'offre gratuite, partagée entre tous les services du compte (750 heures par mois de mémoire, **non vérifié** : la documentation de Render n'est pas joignable depuis la session).
- Autre voie, sans réveiller le serveur : ne compter que les visites des pages qui appellent déjà l'API. Le chiffre mesurerait alors l'intérêt pour le livre d'or, pas la fréquentation du site.

### B15.3 Export des messages

- `GET /api/admin/export` : tous les messages et leurs réponses dans un fichier JSON, pour l'administrateur. C'est la sauvegarde de Mathieu : l'offre gratuite de Neon garde peu d'historique.
- Aucun changement de schéma.
