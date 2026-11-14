// Garde-fous communs : un test échoue sur une erreur JavaScript, une erreur de la console (dont une violation
// de la politique de sécurité), une requête qui échoue ou une réponse 4xx ou 5xx inattendue.
import { expect, test as base } from '@playwright/test';
import { fakeAddress } from './api';

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
  { path: '/livre-d-or', title: "Livre d'or · TechniDev" },
] as const;

interface Guards {
  /** Adresses dont une réponse 4xx ou 5xx est attendue par le test. */
  allowStatus: (pattern: RegExp) => void;
  /** Adresses dont l'échec (requête coupée par le test) est attendu. */
  allowFailure: (pattern: RegExp) => void;
}

export const test = base.extend<{ guards: Guards; clientAddress: string }>({
  guards: [
    async ({ page }, use) => {
      const problems: string[] = [];
      const allowedStatus: RegExp[] = [];
      const allowedFailure: RegExp[] = [];
      page.on('pageerror', (error) => problems.push(`erreur JavaScript : ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // Le navigateur signale lui-même une réponse en erreur ou une requête coupée : elles sont jugées plus bas,
        // avec leur adresse.
        if (/Failed to load resource/.test(message.text())) return;
        problems.push(`console : ${message.text()}`);
      });
      page.on('requestfailed', (request) => {
        if (allowedFailure.some((pattern) => pattern.test(request.url()))) return;
        problems.push(`requête en échec : ${request.url()} (${request.failure()?.errorText ?? 'raison inconnue'})`);
      });
      page.on('response', (response) => {
        if (response.status() < 400) return;
        if (allowedStatus.some((pattern) => pattern.test(response.url()))) return;
        problems.push(`réponse ${response.status()} : ${response.url()}`);
      });
      await use({
        allowStatus: (pattern) => allowedStatus.push(pattern),
        allowFailure: (pattern) => allowedFailure.push(pattern),
      });
      expect(problems, 'aucune erreur pendant le test').toEqual([]);
    },
    { auto: true },
  ],

  // Chaque test se présente à l'API sous sa propre adresse : les limites d'envoi (3 messages par heure et par
  // adresse) ne se partagent pas entre les tests. Le serveur de test transmet cet en-tête à l'API.
  clientAddress: [
    async ({ context }, use) => {
      const address = fakeAddress();
      await context.setExtraHTTPHeaders({ 'x-e2e-client': address });
      await use(address);
    },
    { auto: true },
  ],
});

export { expect };

// Espace insécable et espace fine insécable, écrites par leur numéro : invisibles, elles se perdent à la moindre recopie.
const SPECIAL_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, 'g');

/** Texte sans espaces insécables ni espaces fines : plus simple à comparer. */
export function plain(text: string | null): string {
  return (text ?? '').replace(SPECIAL_SPACES, ' ');
}
