// Le livre d'or rattache un message à une démo ou à un projet (SPEC §B3). L'API tient sa propre liste des
// identifiants acceptés, dans api/src/pages.ts : ce test échoue dès qu'elle s'écarte de ce que le site affiche.
import { expect, test } from '@playwright/test';
import { DEMO_SLUGS, KNOWN_PAGES, PROJECT_SLUGS } from '../../api/src/pages';
import { DEMOS } from '../src/data/demos';
import { PROJECTS } from '../src/data/projects';

test.describe('rattachements du livre d\'or', () => {
  test('l\'API connaît exactement les démos du site', () => {
    expect([...DEMO_SLUGS].sort()).toEqual(DEMOS.map((demo) => demo.slug).sort());
  });

  test('l\'API connaît exactement les projets du site', () => {
    expect([...PROJECT_SLUGS].sort()).toEqual(PROJECTS.map((project) => project.slug).sort());
  });

  test('chaque identifiant est unique et tient dans la colonne', () => {
    expect(KNOWN_PAGES.size).toBe(DEMOS.length + PROJECTS.length);
    for (const page of KNOWN_PAGES) {
      expect(page).toMatch(/^(demo|project):[a-z0-9-]+$/);
      expect(page.length).toBeLessThanOrEqual(60);
    }
  });
});
