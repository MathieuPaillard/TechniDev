// Garde-fous communs : un test échoue sur une erreur JavaScript, une erreur de la console (dont une violation
// de la politique de sécurité), une requête qui échoue ou une réponse 4xx ou 5xx inattendue.
import { expect, test as base } from '@playwright/test';

export const PAGES = [
  { path: '/', title: 'TechniDev · Mathieu Paillard' },
  { path: '/labo', title: 'Le labo · TechniDev' },
  { path: '/labo/gravite', title: 'Gravité · TechniDev' },
  { path: '/labo/ondes', title: 'Ondes · TechniDev' },
  { path: '/labo/population', title: 'Population · TechniDev' },
  { path: '/labo/masse-molaire', title: 'Masse molaire · TechniDev' },
  { path: '/labo/pgcd', title: 'PGCD · TechniDev' },
  { path: '/labo/qui-doit-quoi', title: 'Qui doit quoi · TechniDev' },
  { path: '/projets', title: 'Les projets · TechniDev' },
] as const;

interface Guards {
  /** Adresses dont une réponse 404 est attendue par le test. */
  allowNotFound: (pattern: RegExp) => void;
}

export const test = base.extend<{ guards: Guards }>({
  guards: [
    async ({ page }, use) => {
      const problems: string[] = [];
      const allowed: RegExp[] = [];
      page.on('pageerror', (error) => problems.push(`erreur JavaScript : ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // Le navigateur signale lui-même une réponse 404 : elle est jugée plus bas, avec son adresse.
        if (/Failed to load resource/.test(message.text())) return;
        problems.push(`console : ${message.text()}`);
      });
      page.on('requestfailed', (request) => {
        problems.push(`requête en échec : ${request.url()} (${request.failure()?.errorText ?? 'raison inconnue'})`);
      });
      page.on('response', (response) => {
        if (response.status() < 400) return;
        if (allowed.some((pattern) => pattern.test(response.url()))) return;
        problems.push(`réponse ${response.status()} : ${response.url()}`);
      });
      await use({ allowNotFound: (pattern) => allowed.push(pattern) });
      expect(problems, 'aucune erreur pendant le test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Texte sans espaces insécables ni espaces fines : plus simple à comparer. */
export function plain(text: string | null): string {
  return (text ?? '').replace(/[  ]/g, ' ');
}
