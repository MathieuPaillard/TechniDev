// Ce à quoi un message peut être rattaché (SPEC §B3) : une démo du labo ou un projet du site.
// Ces deux listes reprennent les « slug » de web/src/data/demos.ts et de web/src/data/projects.ts.
// Un test du site (web/tests/guestbook-pages.spec.ts) échoue si elles s'en écartent.

export const DEMO_SLUGS = ['gravite', 'ondes', 'population', 'masse-molaire', 'pgcd', 'qui-doit-quoi'] as const;

export const PROJECT_SLUGS = [
  'depenses',
  'sondage',
  'compo-foot',
  'atelier',
  'emilie',
  'notes',
  'heures',
  'masse-molaire',
  'pgcd',
  'gravity',
  'ondes',
  'population',
  'site',
] as const;

/** Identifiants acceptés dans `page` : `demo:<slug>` ou `project:<slug>`. */
export const KNOWN_PAGES: ReadonlySet<string> = new Set([
  ...DEMO_SLUGS.map((slug) => `demo:${slug}`),
  ...PROJECT_SLUGS.map((slug) => `project:${slug}`),
]);
