// Montants en centimes entiers : lecture d'une saisie et affichage. Fonctions pures.
// Reprises de Dépenses partagées (depenses-front/src/lib/format.ts), où la règle est la même : aucun nombre
// à virgule n'entre dans un calcul d'argent.

/** Un montant en centimes (entier). */
export type Cents = number;

/** Plafond d'une dépense : 100 000 €. */
export const MAX_CENTS = 10_000_000;

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/**
 * « 1250 » → « 12,50 € ». La chaîne décimale est composée à partir d'entiers : aucune division flottante.
 */
export function formatEuros(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const decimal = `${sign}${(abs - (abs % 100)) / 100}.${String(abs % 100).padStart(2, '0')}` as `${number}`;
  return euros.format(decimal);
}

/**
 * Convertit une saisie en euros en centimes, en analysant le texte : aucun nombre décimal n'intervient.
 * Accepté : « 12,50 », « 12.5 », « 12 », « 1 250,50 ». Le séparateur de milliers (espace, espace insécable
 * ou espace fine insécable) n'est admis qu'entre groupes de trois chiffres : « 12 50 » est refusé.
 * Renvoie null si la saisie est invalide ou hors de 1 centime à 100 000 €.
 */
export function parseAmount(input: string): Cents | null {
  const match = /^(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const digits = (match[1] ?? '').replace(/[   ]/g, '');
  if (digits.length > 8) return null;
  const fraction = Number((match[2] ?? '').padEnd(2, '0')); // « 5 » → 50
  const cents = Number(digits) * 100 + fraction;
  return cents >= 1 && cents <= MAX_CENTS ? cents : null;
}
