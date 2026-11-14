// Le livre d'or n'existe sur le site que si l'API est branchée (SPEC §0 : le site ne dépend jamais du back).
// Sans API, aucune page ne l'appelle : pas de lien, pas de bloc sous les démos, pas d'attente inutile.
// La décision se prend une fois, à la construction (astro.config.mjs). Testé dans tests/guestbook-flag.spec.ts.

/** netlify.toml redirige-t-il /api/* ? Un bloc en commentaire ne compte pas. */
export function redirectsApi(netlifyToml) {
  return /^[ \t]*from[ \t]*=[ \t]*"\/api\/\*"/m.test(netlifyToml);
}

/**
 * - GUESTBOOK=on ou off force la réponse (tests de bout en bout) ;
 * - en développement (astro dev), oui : l'API tourne à côté, sur le port 3000 ;
 * - à la construction, oui si netlify.toml redirige /api/* vers l'API.
 * @param {{ forced: string | undefined, dev: boolean, netlifyToml: string }} options
 */
export function guestbookEnabled({ forced, dev, netlifyToml }) {
  if (forced === 'on') return true;
  if (forced === 'off') return false;
  if (forced !== undefined && forced !== '') throw new Error('GUESTBOOK doit valoir "on" ou "off".');
  return dev || redirectsApi(netlifyToml);
}
