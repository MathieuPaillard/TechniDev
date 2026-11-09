// Les démos du labo : chacune reprend un programme d'origine, porté dans le navigateur.
import type { PictoName } from '../components/pictos';

export interface Demo {
  slug: string;
  name: string;
  picto: PictoName;
  /** Ce que l'on fait dans la démo, en une phrase. */
  pitch: string;
  /** Le programme d'origine. */
  origin: string;
  year: number;
}

export const DEMOS: Demo[] = [
  {
    slug: 'gravite',
    name: 'Gravité',
    picto: 'gravity',
    pitch: 'Lâcher des astres et les regarder tomber les uns vers les autres.',
    origin: 'Gravity, écrit en Java',
    year: 2020,
  },
  {
    slug: 'ondes',
    name: 'Ondes',
    picto: 'waves',
    pitch: 'Poser des sources, croiser leurs ondes, en lancer une plus vite que sa propre onde.',
    origin: 'Sources d’ondes, écrit en Java avec JavaFX',
    year: 2025,
  },
  {
    slug: 'population',
    name: 'Population',
    picto: 'population',
    pitch: 'Une population qui grandit tant que les plantes suivent.',
    origin: 'Croissance d’une population, écrit en Java avec JavaFX',
    year: 2025,
  },
  {
    slug: 'masse-molaire',
    name: 'Masse molaire',
    picto: 'molar',
    pitch: 'Écrire une formule chimique, lire sa masse molaire et sa composition.',
    origin: 'Calcul Masse Molaire, appli Android',
    year: 2022,
  },
  {
    slug: 'pgcd',
    name: 'PGCD',
    picto: 'gcd',
    pitch: 'Le plus grand diviseur commun de deux nombres, découpé en carrés.',
    origin: 'PGCD, appli Android',
    year: 2023,
  },
  {
    slug: 'qui-doit-quoi',
    name: 'Qui doit quoi',
    picto: 'scale',
    pitch: 'Noter qui a payé, voir qui doit combien à qui.',
    origin: 'Dépenses partagées, application web',
    year: 2026,
  },
];

export function demoBySlug(slug: string): Demo {
  const demo = DEMOS.find((candidate) => candidate.slug === slug);
  if (!demo) throw new Error(`Démo inconnue : ${slug}`);
  return demo;
}
