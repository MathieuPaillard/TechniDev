# TechniDev : spécification

> Document de référence du dépôt. Toute évolution du contrat (base de données, API, règles) passe d'abord par ce fichier.
>
> Version 0.1 du 12 novembre 2026. **Le site (partie A) est construit. Le back (partie B) est une proposition : rien n'est codé, tout reste à valider.**

---

## 0. En bref

- TechniDev est la vitrine personnelle de Mathieu Paillard : ses projets, et un labo de démos jouables.
- **Partie A, en place** : un site statique (Astro, TypeScript), hébergé sur Netlify. Aucun serveur, aucune donnée enregistrée.
- **Partie B, proposée** : un livre d'or modéré et une connexion administrateur. API Node.js, Express et TypeScript sur Render ; base PostgreSQL sur Neon. Même architecture que Dépenses partagées.
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

# Partie B : le back (proposé, à valider)

## B1. Périmètre

### Inclus en v1

- **Livre d'or** : un visiteur laisse un message (un pseudo et un texte), sans compte. Le message n'apparaît qu'après relecture par l'administrateur.
- Un message peut être rattaché à une démo ou à un projet, ou rester général.
- **Administrateur** (un seul compte, celui de Mathieu) : connexion, liste des messages en attente, publication, suppression, réponse sous un message, déconnexion.

### Hors v1 (envisageable ensuite)

- Comptes pour les visiteurs, envoi d'e-mails, notifications.
- Mot de passe oublié (le compte se recrée par script).
- Compteur anonyme « j'aime » par démo (question Q2).
- Carnet rédigé depuis l'administration et publié sur le site (question Q8).
- Statistiques de visite.

## B2. Rôles et parcours

| Action | Visiteur | Administrateur connecté |
|---|---|---|
| Lire les messages publiés | oui | oui |
| Écrire un message | oui | non (il répond, il n'écrit pas dans le fil) |
| Voir les messages en attente | non | oui |
| Publier ou supprimer un message | non | oui |
| Répondre sous un message publié, modifier ou retirer sa réponse | non | oui |

Parcours :

1. Un visiteur ouvre le livre d'or ou le bloc « Laisser un mot » d'une démo. Les messages publiés s'affichent, les plus récents d'abord.
2. Il écrit un pseudo et un texte, puis envoie. Le site répond : « Merci. Votre message attend d'être relu avant d'apparaître. »
3. Mathieu se connecte à `/admin`. Il voit les messages en attente, du plus ancien au plus récent.
4. Il publie un message, ou le supprime. Un message publié peut encore être supprimé.
5. Il peut répondre sous un message publié ; la réponse s'affiche avec la mention « Mathieu ».

## B3. Règles de gestion

- **Message** : pseudo de 2 à 24 caractères, texte de 1 à 600 caractères, après retrait des espaces de début et de fin. Texte brut : il est affiché tel quel, échappé, avec ses retours à la ligne. Aucune mise en forme, aucun lien cliquable.
- **Liens** (question Q4) : un texte qui contient `http://`, `https://` ou `www.` est refusé, avec un message clair.
- **États** : `pending` (en attente) puis `published` (publié). Un message refusé est **supprimé** : rien n'est conservé.
- **Rattachement** : `page` vaut `null` (général) ou l'un des identifiants connus (les démos et les projets du site). Une valeur inconnue est refusée.
- **Aucune donnée technique n'est enregistrée avec un message** : ni adresse IP, ni navigateur. La date est gardée.
- **Limites d'envoi**, par adresse du visiteur (transmise par Netlify, gardée en mémoire seulement) : 3 messages par heure, 10 par jour.
- **Plafonds** : 200 messages en attente et 2 000 messages publiés. Au-delà, l'envoi est refusé (« Le livre d'or est plein pour le moment »).
- **Pot de miel** : le formulaire contient un champ caché, `website`. S'il est rempli, l'API répond comme si tout allait bien, sans rien enregistrer.
- **Réponse de l'administrateur** : un texte de 1 à 600 caractères par message, modifiable et supprimable.
- **Compte administrateur** : un seul, créé ou réinitialisé par un script à partir de variables d'environnement. Aucune inscription, aucune route pour en créer un. Mot de passe de 12 caractères au moins.
- **Session** : un cookie `httpOnly`, `Secure`, `SameSite=Lax`, valable 12 heures. Seule l'empreinte du jeton est en base. La déconnexion supprime la session.
- **Connexion** : 5 essais par quart d'heure et par adresse. Même réponse et même durée que le compte existe ou non.
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
- En développement, le serveur Astro redirige `/api` vers `http://localhost:3000`.

## B5. Modèle de données

Migrations `node-pg-migrate` (API JavaScript, fichiers `.js` ESM), une migration par évolution, jamais modifiée une fois appliquée.

**`admins`**

| Colonne | Type | Règle |
|---|---|---|
| `id` | `serial` | clé primaire |
| `login` | `text` | unique, non nul |
| `password_hash` | `text` | non nul |
| `created_at` | `timestamptz` | non nul, défaut `statement_timestamp()` |

**`sessions`**

| Colonne | Type | Règle |
|---|---|---|
| `id` | `serial` | clé primaire |
| `admin_id` | `integer` | non nul, référence `admins(id)`, `ON DELETE CASCADE` |
| `token_hash` | `text` | unique, non nul |
| `created_at` | `timestamptz` | non nul, défaut `statement_timestamp()` |
| `expires_at` | `timestamptz` | non nul |

**`messages`**

| Colonne | Type | Règle |
|---|---|---|
| `id` | `serial` | clé primaire |
| `page` | `text` | nul pour un message général |
| `author` | `text` | non nul, 2 à 24 caractères |
| `body` | `text` | non nul, 1 à 600 caractères |
| `status` | `text` | non nul, `pending` ou `published` (contrainte `CHECK`) |
| `created_at` | `timestamptz` | non nul, défaut `statement_timestamp()` |
| `published_at` | `timestamptz` | nul tant que le message attend |
| `reply` | `text` | nul sans réponse, 1 à 600 caractères sinon |
| `replied_at` | `timestamptz` | nul sans réponse |

Index : `messages (status, created_at)`.

## B6. API

Préfixe `/api`. Corps en JSON, 8 ko au plus. Champs inconnus refusés.

### B6.1 Format d'erreur

```json
{ "error": { "code": "VALIDATION", "message": "Le texte est trop long.", "details": [{ "path": "body", "message": "600 caractères au plus." }] } }
```

Codes : `VALIDATION` (400), `UNAUTHENTICATED` (401), `FORBIDDEN_ORIGIN` (403), `NOT_FOUND` (404), `INVALID_STATE` (409), `RATE_LIMITED` (429), `INTERNAL` (500). Messages en français, destinés à l'affichage.

### B6.2 Routes

| Méthode et chemin | Qui | Effet |
|---|---|---|
| `GET /api/health` | tous | `200 { "status": "ok" }` |
| `GET /api/messages?page=…&before=…` | tous | messages publiés, les plus récents d'abord, 30 au plus ; `before` (identifiant) pour la page suivante |
| `POST /api/messages` | tous | crée un message en attente ; `201 { "status": "pending" }` |
| `POST /api/admin/login` | tous | ouvre une session ; `204` et le cookie |
| `POST /api/admin/logout` | admin | ferme la session ; `204` |
| `GET /api/admin/me` | admin | `200 { "login": "…" }` |
| `GET /api/admin/messages?status=pending` | admin | les messages dans cet état |
| `POST /api/admin/messages/:id/publish` | admin | publie ; `409` si le message l'est déjà |
| `DELETE /api/admin/messages/:id` | admin | supprime définitivement ; `204` |
| `PUT /api/admin/messages/:id/reply` | admin | pose ou remplace la réponse |
| `DELETE /api/admin/messages/:id/reply` | admin | retire la réponse ; `204` |

### B6.3 Types échangés

```ts
interface Message {
  id: number;
  page: string | null;
  author: string;
  body: string;
  publishedAt: string; // ISO 8601
  reply: { body: string; repliedAt: string } | null;
}

/** Vue de l'administrateur : en plus, l'état et la date d'envoi. */
interface AdminMessage extends Omit<Message, 'publishedAt'> {
  status: 'pending' | 'published';
  createdAt: string;
  publishedAt: string | null;
}
```

Les réponses sont construites champ par champ : jamais une ligne SQL brute.

## B7. Sécurité

- **Proxy signé** : Netlify signe chaque requête transmise (`X-Nf-Sign`). En production, l'API refuse toute requête sans signature valide, sauf `GET /api/health`. L'adresse du visiteur n'est crue que sur une requête signée.
- **Contrôle d'origine** sur toute requête qui modifie quelque chose.
- Requêtes SQL toujours paramétrées. Entrées validées côté serveur (Zod, `z.strictObject`).
- Mots de passe hachés (question Q5). Jetons de session tirés au hasard (32 octets), seule leur empreinte SHA-256 est stockée.
- `sslmode=verify-full` exigé au démarrage en production.
- Journal sans contenu de message, sans pseudo, sans adresse, sans jeton.
- En-têtes de sécurité, limites de débit toujours actives.
- **Le dépôt est public** : le code du back le sera aussi. Aucun secret dans le dépôt ; un `.env.example` décrit les variables.
- Les tests tournent sur PGlite, jamais sur Neon.

## B8. Front

- `/livre-d-or` : les messages publiés et le formulaire.
- Sous chaque démo : « Laisser un mot », avec les trois derniers messages de cette démo et un lien vers le livre d'or.
- `/admin` : connexion, puis les messages en attente (publier, supprimer), puis les messages publiés (répondre, supprimer).
- États à dessiner : réveil du serveur ; liste vide (« Personne n'a encore écrit. Le premier mot est pour vous. ») ; envoi réussi ; erreur de saisie, champ par champ ; limite atteinte ; serveur injoignable (« Le livre d'or ne répond pas. Le reste du site fonctionne. »).
- Sous le formulaire, ce qui est enregistré : un pseudo, un texte et une date. Pas d'e-mail, pas d'adresse IP. Comment faire retirer un message (question Q6).
- Aucune donnée ne passe par `innerHTML`.

## B9. Tests attendus

- API : Vitest et Supertest sur PGlite. Chaque route, chaque règle du §B3, chaque code d'erreur, les limites de débit, le pot de miel, la signature du proxy.
- Front : les états du §B8 dans les tests de bout en bout, contre l'API lancée depuis ses sources sur une PGlite à part.
- Le contrôle des mots interdits s'étend aux pages nouvelles.

## B10. Déploiement

- **Neon** : une base de développement et une base de production, à part de celles des autres projets (question Q7).
- **Render** : service `api/`, Francfort, offre gratuite ; migrations appliquées au démarrage, puis serveur ; contrôle de santé sur `/api/health`.
- **Netlify** : redirection de `/api/*` vers Render, signée.
- Variables : `DATABASE_URL`, `NETLIFY_SIGNATURE` (Render) et `API_SIGNATURE_TOKEN` (Netlify, même valeur), `FRONT_URL`, puis `ADMIN_LOGIN` et `ADMIN_PASSWORD` pour le script de création du compte (à retirer ensuite).
- Les sessions de Claude Code dans le nuage n'ont pas accès à Neon : Mathieu applique les migrations et déploie.

## B11. Découpage en étapes

Aucune étape n'est faite en parallèle d'une autre, sauf mention contraire.

| Étape | Contenu | Fichiers | Vérification |
|---|---|---|---|
| 1 | Squelette de l'API : configuration, application, santé, format d'erreur, proxy signé, contrôle d'origine | `api/src/app.ts`, `config/`, `errors.ts`, `security/`, `routes/health.ts` | types, tests de la santé, de la signature et de l'origine |
| 2 | Migration 1 (`admins`, `sessions`), script de création du compte, connexion, déconnexion, `me` | `api/migrations/`, `scripts/`, `routes/admin-auth.ts`, `security/sessions.ts` | tests : connexion bonne et mauvaise, limite d'essais, expiration |
| 3 | Migration 2 (`messages`), lecture et envoi publics, limites, pot de miel, plafonds | `routes/messages.ts`, `security/limits.ts` | tests de chaque règle du §B3 |
| 4 | Modération : liste, publication, suppression, réponse | `routes/admin-messages.ts` | tests des droits et des états |
| 5 | Front : livre d'or et blocs « Laisser un mot » (peut se faire en parallèle de l'étape 4, le contrat étant figé) | `web/src/pages/livre-d-or.astro`, `web/src/lib/guestbook/` | tests de bout en bout des états du §B8 |
| 6 | Front : administration | `web/src/pages/admin.astro`, `web/src/lib/admin/` | tests de bout en bout : se connecter, publier, répondre, supprimer |
| 7 | Mise en ligne par Mathieu, puis vérifications en ligne (requête directe sur Render refusée, signature acceptée) | `netlify.toml`, `render.yaml` | liste du §B7, sur le site réel |

## B12. Questions ouvertes (décisions de Mathieu)

| | Question | Réponse proposée |
|---|---|---|
| Q1 | Un seul fil, ou des messages rattachés à une démo ou à un projet ? | Rattachement facultatif |
| Q2 | Un compteur anonyme « j'aime » par démo ? | Non en v1 |
| Q3 | Une réponse de l'administrateur sous un message ? | Oui |
| Q4 | Les liens dans un message : refusés, ou acceptés sans être cliquables ? | Refusés |
| Q5 | Hachage du mot de passe : `scrypt` de Node (aucune dépendance) ou `bcrypt` (comme Dépenses partagées) ? | `scrypt` |
| Q6 | Par où demander le retrait d'un message ? Il faut un moyen de contact public. | Pas de proposition : je ne peux pas l'inventer |
| Q7 | Reste-t-il de la place dans l'offre gratuite de Neon pour deux bases de plus ? | Je ne sais pas : à vérifier dans ton compte |
| Q8 | Un carnet que tu rédiges depuis l'administration et qui s'affiche sur le site ? | Plus tard |
| Q9 | Le code du back sera public, comme le reste du dépôt. D'accord ? | Oui, ou passer le dépôt en privé |

Dépendances proposées pour `api/`, à valider avec le reste : `express`, `pg`, `zod`, `node-pg-migrate`, `cookie-parser`, `express-rate-limit`, `dotenv` ; pour le développement : `typescript`, `tsx`, `vitest`, `supertest`, `@electric-sql/pglite`, `@electric-sql/pglite-socket`, `dotenv-cli` et les types. Ce sont celles de Dépenses partagées, moins `bcrypt` si Q5 retient `scrypt`.

## B13. Décisions prises (et pourquoi)

1. **Le site d'abord, le back en option.** Le site ne dépend jamais de l'API : une offre gratuite qui s'endort ne doit pas casser une vitrine.
2. **Pas de compte pour les visiteurs.** Pas d'e-mail à gérer, pas de mot de passe à protéger, moins de données personnelles.
3. **Rien n'apparaît sans relecture.** Un livre d'or ouvert attire le spam et les propos que l'on ne veut pas signer de son nom.
4. **Un message refusé est supprimé.** On ne garde pas ce que l'on ne publie pas.
5. **Même architecture que Dépenses partagées.** Elle est déjà auditée, et Mathieu la connaît.
6. **Un seul dépôt** : `web/` et `api/` côte à côte, chacun avec ses dépendances.

## B14. Risques restants

- **Modération** : c'est un travail récurrent. Sans passage régulier, les messages attendent.
- **Spam** : les limites et le pot de miel arrêtent le tout-venant, pas un envoi ciblé. Les plafonds bornent les dégâts.
- **Offres gratuites** : le réveil de Render retarde le premier affichage du livre d'or ; les quotas de Neon et de Render se partagent avec les autres projets du compte.
- **Dépôt public** : la route de connexion est connue de tous. Le mot de passe doit être long et propre à ce site.
