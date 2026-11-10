// Les projets présentés sur le site. Chaque fiche dit son état réel et la façon dont le code a été écrit.
// Rien ici ne doit permettre d'identifier un employeur : les outils faits pour le travail sont décrits en
// termes généraux, sans nom, sans lien et sans donnée réelle.

export type Status = 'online' | 'published' | 'private' | 'prototype';
/** « hand » : écrit à la main. « ai » : conçu et piloté, codé avec une IA. null : non précisé. */
export type Making = 'hand' | 'ai' | null;

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  slug: string;
  name: string;
  years: string;
  /** Ce que c'est, en une phrase. */
  summary: string;
  /** Deux à quatre faits, affichés sur la page Projets. */
  facts: string[];
  status: Status;
  making: Making;
  stack: string[];
  /** Adresse du site en ligne, s'il y en a un et qu'il peut être montré. */
  site?: string;
  /** Dépôt public du code. */
  code?: string;
  /** Démo du labo qui reprend ce projet. */
  demo?: string;
  /** Mis en avant sur la page d'accueil. */
  featured: boolean;
}

export const STATUS_LABELS: Record<Status, string> = {
  online: 'En ligne',
  published: 'Publié sur le Play Store',
  private: 'Usage privé',
  prototype: 'Prototype',
};

export const MAKING_LABELS: Record<Exclude<Making, null>, string> = {
  hand: 'Écrit à la main',
  ai: 'Conçu et piloté, codé avec une IA',
};

export const PROJECTS: Project[] = [
  {
    slug: 'depenses',
    name: 'Dépenses partagées',
    years: '2026',
    summary: 'Les comptes entre proches : qui a payé quoi, et qui doit combien à qui.',
    facts: [
      'Des groupes, des invitations, des dépenses ponctuelles ou récurrentes, des remboursements suggérés.',
      'Tous les montants sont en centimes entiers : aucun nombre à virgule dans les calculs.',
      'Une opération peut attendre l’accord des personnes qu’elle concerne avant de compter dans les soldes.',
      'Une spécification tenue décision par décision, des tests de l’API et des parcours joués dans un vrai navigateur.',
    ],
    status: 'online',
    making: 'ai',
    stack: ['Astro', 'TypeScript', 'Express', 'PostgreSQL'],
    site: 'https://hello-depenses.netlify.app',
    demo: 'qui-doit-quoi',
    featured: true,
  },
  {
    slug: 'sondage',
    name: 'Sondage anonyme',
    years: '2026',
    summary: 'Des sondages où personne ne peut savoir qui a répondu quoi.',
    facts: [
      'Chaque participant reçoit un ticket papier avec un QR code : il donne droit à une seule réponse, sans compte.',
      'Aucun lien n’est enregistré entre un ticket et une réponse.',
      'Neuf types de questions, des résultats en graphiques après la clôture, des exports CSV et PDF.',
    ],
    status: 'online',
    making: 'ai',
    stack: ['Astro', 'TypeScript', 'Express', 'PostgreSQL'],
    site: 'https://sondage-technidev.netlify.app',
    featured: true,
  },
  {
    slug: 'compo-foot',
    name: 'Compo Foot',
    years: '2026',
    summary: 'Le carnet d’un entraîneur de foot : compositions, présences, matchs et temps de jeu.',
    facts: [
      'Fonctionne sans connexion et s’installe sur le téléphone.',
      'Aucun serveur : les données restent sur l’appareil.',
      'Un chrono de bord de terrain, les remplacements, le temps de jeu de chacune.',
    ],
    status: 'online',
    making: 'ai',
    stack: ['HTML', 'CSS', 'JavaScript'],
    site: 'https://compo-foot.netlify.app',
    featured: true,
  },
  {
    slug: 'atelier',
    name: 'Suivi d’atelier en direct',
    years: '2026',
    summary: 'Un tableau de bord partagé pour suivre, ligne par ligne, une opération d’atelier qui revient chaque mois.',
    facts: [
      'Chaque ligne avance d’étape en étape ; chaque métier ne voit que les actions qui lui reviennent.',
      'Des comptes à rebours calés sur l’heure du serveur, identiques sur tous les écrans.',
      'Un mode télévision pour l’atelier et un journal horodaté de qui a fait quoi.',
    ],
    status: 'private',
    making: 'ai',
    stack: ['Astro', 'TypeScript', 'Express', 'PostgreSQL'],
    featured: true,
  },
  {
    slug: 'emilie',
    name: 'Le site d’Emilie, psychopraticienne',
    years: '2025 à 2026',
    summary: 'Le site professionnel de ma sœur, thérapeute à Besançon.',
    facts: [
      'Son approche, ses consultations, un blog.',
      'La prise de rendez-vous dès la page d’accueil.',
    ],
    status: 'online',
    making: null,
    stack: ['Astro'],
    site: 'https://emiliepaillard-therapie.fr',
    featured: true,
  },
  {
    slug: 'notes',
    name: 'Notes',
    years: '2026',
    summary: 'Ma première application complète mise en ligne : un compte, une connexion, des notes personnelles.',
    facts: [
      'Une API Express, des mots de passe hachés, des jetons de connexion.',
      'Une base PostgreSQL hébergée, avec des migrations versionnées.',
    ],
    status: 'online',
    making: 'hand',
    stack: ['JavaScript', 'Express', 'PostgreSQL'],
    site: 'https://notes-front-m.netlify.app',
    featured: true,
  },
  {
    slug: 'heures',
    name: 'Analyseur de feuilles d’heures',
    years: '2025 à 2026',
    summary: 'Lire un export de pointage et retrouver, semaine par semaine, ses heures supplémentaires et ses récupérations.',
    facts: [
      'Tout se calcule dans le navigateur : aucun fichier n’est envoyé.',
      'Lit les exports Excel et XML.',
    ],
    status: 'private',
    making: null,
    stack: ['JavaScript'],
    featured: false,
  },
  {
    slug: 'masse-molaire',
    name: 'Calcul Masse Molaire',
    years: '2022',
    summary: 'Une appli Android qui donne la masse molaire d’une formule chimique.',
    facts: [
      'Ma première appli publiée sur le Play Store, en décembre 2022.',
      'Traduite en plusieurs langues, tenue à jour jusqu’en 2025.',
    ],
    status: 'published',
    making: 'hand',
    stack: ['Java', 'Android'],
    code: 'https://github.com/MathieuPaillard/Calcul-Masse-Molaire',
    demo: 'masse-molaire',
    featured: false,
  },
  {
    slug: 'pgcd',
    name: 'PGCD',
    years: '2023',
    summary: 'Une appli Android : le PGCD de plusieurs nombres, leurs facteurs premiers, les fractions réduites.',
    facts: [
      'Publiée sur le Play Store début 2023.',
      'Une version 2 à la fin de l’année, avec la décomposition en facteurs premiers.',
    ],
    status: 'published',
    making: 'hand',
    stack: ['Java', 'Android'],
    demo: 'pgcd',
    featured: false,
  },
  {
    slug: 'gravity',
    name: 'Gravity',
    years: '2020',
    summary: 'Mon premier programme de physique : des astres, leur champ de gravité, des collisions.',
    facts: ['Il calculait une image par pas de temps et l’enregistrait sur le disque.'],
    status: 'prototype',
    making: 'hand',
    stack: ['Java'],
    code: 'https://github.com/MathieuPaillard/Gravity',
    demo: 'gravite',
    featured: false,
  },
  {
    slug: 'ondes',
    name: 'Sources d’ondes',
    years: '2025',
    summary: 'Des sources qui émettent des ondes circulaires et s’attirent entre elles.',
    facts: ['Parti des figures d’interférences, arrivé à un petit système planétaire.'],
    status: 'prototype',
    making: 'hand',
    stack: ['Java', 'JavaFX'],
    code: 'https://github.com/MathieuPaillard/simulationSourceEmission',
    demo: 'ondes',
    featured: false,
  },
  {
    slug: 'population',
    name: 'Croissance d’une population',
    years: '2025',
    summary: 'Des individus qui se déplacent, se rencontrent, se nourrissent et disparaissent.',
    facts: ['Des classes pour les individus et les plantes, puis des ressources sans lesquelles la population décline.'],
    status: 'prototype',
    making: 'hand',
    stack: ['Java', 'JavaFX'],
    code: 'https://github.com/MathieuPaillard/Croissance_Population',
    demo: 'population',
    featured: false,
  },
  {
    slug: 'site',
    name: 'Ce site',
    years: '2026',
    summary: 'La vitrine que vous lisez, et son labo de démos.',
    facts: [
      'Un seul gaz éclaire le site à la fois ; un interrupteur éteint les tubes.',
      'Chaque démo du labo reprend un de mes programmes, porté dans le navigateur.',
    ],
    status: 'online',
    making: 'ai',
    stack: ['Astro', 'TypeScript'],
    featured: false,
  },
];
