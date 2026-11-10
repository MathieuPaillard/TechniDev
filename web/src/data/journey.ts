// Le parcours, de 2020 à aujourd'hui. Les dates viennent de l'historique des dépôts.

export interface JourneyStep {
  when: string;
  title: string;
  text: string;
}

export const JOURNEY: JourneyStep[] = [
  {
    when: '2020',
    title: 'Java, pour comprendre',
    text: 'Gravity : des astres qui s’attirent, et une image calculée pour chaque pas de temps.',
  },
  {
    when: '2022',
    title: 'Une appli sur le Play Store',
    text: 'Calcul Masse Molaire, ma première appli Android, publiée en décembre.',
  },
  {
    when: '2023',
    title: 'Une deuxième',
    text: 'PGCD, puis sa version 2 avec la décomposition en facteurs premiers.',
  },
  {
    when: '2025',
    title: 'Le web, par le commencement',
    text: 'HTML et CSS en formation, JavaScript, un premier serveur Express. Et, à côté, deux simulations en Java : des ondes, puis une population.',
  },
  {
    when: 'Début 2026',
    title: 'Une application de bout en bout',
    text: 'Astro et TypeScript, puis Notes : une API, une base PostgreSQL, des comptes, une mise en ligne.',
  },
  {
    when: 'Fin 2026',
    title: 'Piloter une IA',
    text: 'Je cadre, je décide, je relis ; Claude Code écrit. Sondage anonyme, Dépenses partagées, Compo Foot et ce site sont nés ainsi.',
  },
];

export interface MethodStep {
  title: string;
  text: string;
}

/** La façon de travailler avec une IA : une vraie suite d'étapes, d'où la numérotation. */
export const METHOD: MethodStep[] = [
  {
    title: 'Cadrer',
    text: 'Avant toute ligne de code, une spécification : ce que l’application fait, ce qu’elle ne fait pas, ses données, ses règles, ses cas limites.',
  },
  {
    title: 'Construire par étapes',
    text: 'Chaque étape arrive avec ses tests. Les types sont vérifiés et les tests sont au vert avant de passer à la suite.',
  },
  {
    title: 'Faire relire',
    text: 'Un second agent relit le changement d’un œil neuf. Un troisième cherche les failles quand le sujet est sensible.',
  },
  {
    title: 'Décider',
    text: 'Je relis par lots. Ce qui touche au produit, aux données et à la mise en ligne reste ma décision.',
  },
];
