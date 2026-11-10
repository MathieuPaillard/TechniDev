// PGCD, facteurs premiers, réduction de fractions. Fonctions pures, entiers seulement.
//
// Portage de l'appli Android PGCD (2023). L'appli calculait le PGCD par soustractions successives
// (la forme la plus ancienne de l'algorithme d'Euclide) : elle est gardée ici pour compter ses étapes,
// à côté de la version par divisions, qui arrive au même résultat en bien moins de coups.

/** Plus grand entier accepté : mille milliards. Les calculs restent exacts (bien en dessous de 2^53). */
export const MAX_VALUE = 1_000_000_000_000;

export function isValidInput(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_VALUE;
}

/** PGCD par divisions euclidiennes. pgcd(n, 0) = n. */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function gcdMany(values: readonly number[]): number {
  return values.reduce((acc, value) => gcd(acc, value), 0);
}

/** PPCM de plusieurs entiers. Il peut dépasser ce qu'un nombre ordinaire représente exactement : BigInt. */
export function lcmMany(values: readonly number[]): bigint {
  let result = 1n;
  for (const value of values) {
    if (value === 0) return 0n;
    const big = BigInt(Math.abs(value));
    let x = result;
    let y = big;
    while (y !== 0n) {
      [x, y] = [y, x % y];
    }
    result = (result / x) * big;
  }
  return result;
}

export interface DivisionStep {
  /** a = b × q + r */
  a: number;
  b: number;
  q: number;
  r: number;
}

/** Les divisions successives de l'algorithme d'Euclide, de (a, b) jusqu'au reste nul. */
export function euclidSteps(a: number, b: number): DivisionStep[] {
  const steps: DivisionStep[] = [];
  let x = Math.max(a, b);
  let y = Math.min(a, b);
  while (y !== 0) {
    const r = x % y;
    steps.push({ a: x, b: y, q: (x - r) / y, r });
    x = y;
    y = r;
  }
  return steps;
}

/**
 * Nombre de soustractions qu'il faut à la méthode de l'appli d'origine (on retire le plus petit du plus
 * grand jusqu'à l'égalité). Il se déduit des quotients, sans dérouler la boucle : pour 1 000 000 000 000 et 1,
 * elle tournerait mille milliards de fois.
 */
export function subtractionCount(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  // Chaque division de quotient q remplace q soustractions ; la dernière s'arrête à l'égalité, une soustraction plus tôt.
  return euclidSteps(a, b).reduce((sum, step) => sum + step.q, 0) - 1;
}

export interface PrimePower {
  prime: number;
  power: number;
}

/** Décomposition en facteurs premiers, par divisions d'essai (au plus un million d'essais pour 10^12). */
export function factorize(value: number): PrimePower[] {
  const factors: PrimePower[] = [];
  let rest = value;
  if (rest < 2) return factors;
  const take = (prime: number): void => {
    let power = 0;
    while (rest % prime === 0) {
      rest /= prime;
      power++;
    }
    if (power > 0) factors.push({ prime, power });
  };
  take(2);
  take(3);
  // Tous les premiers au-delà de 3 s'écrivent 6k − 1 ou 6k + 1.
  for (let candidate = 5; candidate * candidate <= rest; candidate += 6) {
    take(candidate);
    take(candidate + 2);
  }
  if (rest > 1) factors.push({ prime: rest, power: 1 });
  return factors;
}

/** Les facteurs premiers communs à tous les nombres, à leur plus petite puissance : leur produit est le PGCD. */
export function commonFactors(factorizations: readonly PrimePower[][]): PrimePower[] {
  const [first, ...others] = factorizations;
  if (!first) return [];
  const common: PrimePower[] = [];
  for (const { prime, power } of first) {
    let lowest = power;
    for (const other of others) {
      lowest = Math.min(lowest, other.find((factor) => factor.prime === prime)?.power ?? 0);
    }
    if (lowest > 0) common.push({ prime, power: lowest });
  }
  return common;
}

export interface ReducedFraction {
  numerator: number;
  denominator: number;
  divisor: number;
}

export function reduceFraction(numerator: number, denominator: number): ReducedFraction {
  const divisor = gcd(numerator, denominator);
  if (divisor === 0) return { numerator, denominator, divisor: 0 };
  return { numerator: numerator / divisor, denominator: denominator / divisor, divisor };
}

export interface Square {
  /** Coin haut gauche et côté, dans le repère du rectangle (largeur = le plus grand nombre). */
  x: number;
  y: number;
  size: number;
  /** Rang de la division qui a produit ce carré (0 pour la première). */
  step: number;
}

export interface SquareTiling {
  width: number;
  height: number;
  squares: Square[];
  /** Nombre total de carrés du découpage ; `squares` peut en contenir moins (limite de dessin). */
  total: number;
}

/**
 * L'algorithme d'Euclide en image : un rectangle a × b découpé en carrés, chaque fois les plus grands
 * possibles. Le côté du plus petit carré est le PGCD. Au-delà de `limit` carrés, le dessin s'arrête
 * (ils deviendraient invisibles), mais `total` les compte tous.
 */
export function squareTiling(a: number, b: number, limit = 400): SquareTiling {
  const width = Math.max(a, b);
  const height = Math.min(a, b);
  const squares: Square[] = [];
  let total = 0;
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let step = 0;
  while (w > 0 && h > 0) {
    if (w >= h) {
      const count = Math.floor(w / h);
      for (let i = 0; i < count && squares.length < limit; i++) squares.push({ x: x + i * h, y, size: h, step });
      total += count;
      x += count * h;
      w -= count * h;
    } else {
      const count = Math.floor(h / w);
      for (let i = 0; i < count && squares.length < limit; i++) squares.push({ x, y: y + i * w, size: w, step });
      total += count;
      y += count * w;
      h -= count * w;
    }
    step++;
  }
  return { width, height, squares, total };
}

/** « 2³ × 3 × 5² » */
export function formatFactors(factors: readonly PrimePower[]): string {
  if (factors.length === 0) return '1';
  const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const exponent = (power: number): string =>
    power === 1 ? '' : [...String(power)].map((digit) => superscripts[Number(digit)]).join('');
  return factors.map(({ prime, power }) => `${formatInteger(prime)}${exponent(power)}`).join(' × ');
}

const integerFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** « 1 000 000 » (espaces fines insécables, comme le veut l'usage français). */
export function formatInteger(value: number | bigint): string {
  return integerFormat.format(value);
}

/**
 * Lit un entier saisi : chiffres, avec des espaces ou des points de séparation facultatifs.
 * Renvoie null si ce n'est pas un entier de 1 à MAX_VALUE.
 */
export function parseInteger(input: string): number | null {
  const compact = input.replace(/[\s  .]/g, '');
  if (!/^\d{1,13}$/.test(compact)) return null;
  const value = Number(compact);
  return isValidInput(value) ? value : null;
}
