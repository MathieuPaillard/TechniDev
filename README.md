# TechniDev

La vitrine personnelle de Mathieu Paillard : ses projets, et un labo de six démos jouables (gravité, ondes, population, masse molaire, PGCD, comptes entre amis).

Le site est statique : aucun serveur, aucun cookie, aucun traceur. Un back (connexion administrateur, livre d'or modéré) est décrit dans [`docs/SPEC.md`](docs/SPEC.md) ; il n'est pas encore codé.

## Ce qu'il y a dans le dépôt

| Emplacement | Rôle |
|---|---|
| `web/` | le site : Astro 7, TypeScript strict, aucun framework |
| `docs/SPEC.md` | la spécification, dont le back à venir |
| `netlify.toml` | construction du site et en-têtes de sécurité |
| `archive/` | exercices HTML et CSS de 2025, non publiés |

## Démarrer en local

Node 22.23.4 ou plus récent (Netlify construit avec Node 24).

```bash
cd web
npm install
npm run dev
```

Le site s'ouvre sur <http://localhost:4321>.

## Scripts

Tous se lancent depuis `web/`.

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run check` | vérification des types (`astro check`) |
| `npm test` | tests des fonctions pures, sans navigateur |
| `npm run e2e` | construit le site puis le teste dans un vrai navigateur |
| `npm run build` | vérifie les types puis construit dans `web/dist/` |
| `npm run preview` | aperçu du site construit |

## Tests

**`npm test`** : la logique des démos (physique, chimie, arithmétique, comptes), dans `web/tests/`. Un fichier par domaine.

**`npm run e2e`** : Chromium pilote le site construit, servi par `web/e2e/server.mjs` avec les en-têtes de `netlify.toml` (dont la politique de sécurité) et les mêmes adresses que Netlify. Trois tailles d'écran : bureau, téléphone, petit écran (320 px). La première fois : `npx playwright install chromium`.

Un test échoue sur une erreur JavaScript, une erreur de la console, une requête en échec, une réponse 4xx ou 5xx inattendue, ou une requête vers un autre site (`web/e2e/fixtures.ts`).

**Mots interdits.** Ce dépôt est public : certains noms ne doivent apparaître sur aucune page. Un test le vérifie, à partir d'une liste qui n'est pas dans le dépôt :

```bash
E2E_FORBIDDEN_WORDS="premier mot,second mot" npm run e2e
```

Sans cette variable, le test est sauté.

## Mettre en ligne

Netlify lit `netlify.toml` : dossier de base `web`, commande `npm run build`, dossier publié `dist`, Node 24, en-têtes de sécurité. Il suffit d'importer ce dépôt comme nouveau site. Le site n'a besoin d'aucune variable d'environnement.

La politique de sécurité n'autorise que les fichiers du site : pas de script ni de style en ligne, rien de chargé ailleurs. Les polices sont dans le dépôt.

Les pages portent `<meta name="robots" content="noindex">` (`web/src/layouts/Base.astro`) : à retirer pour apparaître dans les moteurs de recherche.

## Organisation du code

```
web/
  public/init.js            applique le gaz et l'état des tubes avant le premier affichage
  src/
    layouts/                Base (toutes les pages) et Demo (une démo du labo)
    components/             en-tête, pied de page, enseigne, choix du gaz, pictogrammes, ligne de projet
    data/                   projets, démos, parcours : le contenu du site
    styles/                 jetons (un jeu de couleurs par gaz), socle, tubes et commandes
    lib/ui/                 thème, scène, boucle d'animation, afficheur à tubes, enseigne
    lib/labo/<démo>/        la logique pure (testée) et l'affichage de chaque démo
    pages/                  accueil, labo et ses six démos, projets, 404
  tests/                    tests des fonctions pures
  e2e/                      tests dans le navigateur, serveur du site construit
```

Chaque démo a deux fichiers : la logique, sans navigateur (`physics.ts`, `model.ts`, `formula.ts`, `gcd.ts`, `ledger.ts`), et `demo.ts`, qui branche la scène et les commandes.

## Le design, en quelques règles

- Un seul gaz éclaire le site à la fois : hélium, néon, argon, krypton ou xénon. Le visiteur choisit ; le choix est retenu dans son navigateur.
- Allumé veut dire vivant, en ligne, ou que l'on peut toucher. Un tube éteint est inactif.
- Le texte courant ne brille jamais.
- L'interrupteur de l'en-tête éteint tous les tubes.
- Avec « réduire les animations », rien ne s'anime sans qu'on le demande : pas d'amorçage, simulations en pause.

## Règles du dépôt

- Dépôt public : ni secret, ni donnée d'un employeur, ni donnée personnelle réelle. Les outils faits pour le travail sont décrits sans nom et avec des données inventées (`web/src/data/projects.ts`).
- Les démos disent d'où elles viennent, et ce qui a changé par rapport au programme d'origine.
- Chaque projet porte son état réel et la façon dont son code a été écrit : à la main, ou conçu et piloté puis codé avec une IA.

## Polices

Tilt Neon, Atkinson Hyperlegible Next et Atkinson Hyperlegible Mono, sous licence SIL Open Font License 1.1. Les textes des licences sont dans `web/src/assets/fonts/`.
