import { expect, test } from '@playwright/test';
import {
  commonFactors,
  euclidSteps,
  factorize,
  formatFactors,
  gcd,
  gcdMany,
  lcmMany,
  MAX_VALUE,
  parseInteger,
  reduceFraction,
  squareTiling,
  subtractionCount,
} from '../src/lib/labo/arithmetic/gcd';

test('PGCD de deux nombres', () => {
  expect(gcd(1071, 462)).toBe(21);
  expect(gcd(462, 1071)).toBe(21);
  expect(gcd(17, 5)).toBe(1);
  expect(gcd(12, 12)).toBe(12);
  expect(gcd(0, 9)).toBe(9);
  expect(gcd(9, 0)).toBe(9);
  expect(gcd(MAX_VALUE, 1)).toBe(1);
  expect(gcd(MAX_VALUE, 500_000_000_000)).toBe(500_000_000_000);
});

test('PGCD de plusieurs nombres', () => {
  expect(gcdMany([84, 126, 210])).toBe(42);
  expect(gcdMany([84, 126, 210, 5])).toBe(1);
  expect(gcdMany([36])).toBe(36);
  expect(gcdMany([])).toBe(0);
});

test('PPCM, y compris au-delà de 2^53', () => {
  expect(lcmMany([4, 6])).toBe(12n);
  expect(lcmMany([2, 3, 5, 7])).toBe(210n);
  expect(lcmMany([999_999_999_989, 999_999_999_961])).toBe(999_999_999_989n * 999_999_999_961n);
});

test("les divisions d'Euclide", () => {
  expect(euclidSteps(1071, 462)).toEqual([
    { a: 1071, b: 462, q: 2, r: 147 },
    { a: 462, b: 147, q: 3, r: 21 },
    { a: 147, b: 21, q: 7, r: 0 },
  ]);
  // L'ordre des deux nombres ne change rien.
  expect(euclidSteps(462, 1071)).toEqual(euclidSteps(1071, 462));
});

test("le nombre de soustractions de l'appli d'origine", () => {
  // 1071 − 462 − 462 = 147 ; 462 − 3 × 147 = 21 ; 147 − 6 × 21 = 21 : 2 + 3 + 6 = 11 soustractions.
  expect(subtractionCount(1071, 462)).toBe(11);
  expect(subtractionCount(12, 12)).toBe(0);
  expect(subtractionCount(7, 1)).toBe(6);
  expect(subtractionCount(MAX_VALUE, 1)).toBe(MAX_VALUE - 1);

  // Vérification contre la boucle elle-même, sur de petits nombres.
  const loop = (a: number, b: number): number => {
    let count = 0;
    while (a !== b) {
      if (a < b) b -= a;
      else a -= b;
      count++;
    }
    return count;
  };
  for (const [a, b] of [[48, 18], [100, 7], [35, 64], [1, 9], [240, 46]] as const) {
    expect(subtractionCount(a, b)).toBe(loop(a, b));
  }
});

test('décomposition en facteurs premiers', () => {
  expect(factorize(1)).toEqual([]);
  expect(factorize(2)).toEqual([{ prime: 2, power: 1 }]);
  expect(factorize(360)).toEqual([
    { prime: 2, power: 3 },
    { prime: 3, power: 2 },
    { prime: 5, power: 1 },
  ]);
  expect(factorize(97)).toEqual([{ prime: 97, power: 1 }]);
  expect(factorize(999_999_999_989)).toEqual([{ prime: 999_999_999_989, power: 1 }]);
  expect(factorize(MAX_VALUE)).toEqual([
    { prime: 2, power: 12 },
    { prime: 5, power: 12 },
  ]);
  // Le produit des facteurs redonne le nombre.
  for (const value of [84, 1001, 65_536, 123_456_789, 600_851_475_143]) {
    expect(factorize(value).reduce((product, { prime, power }) => product * prime ** power, 1)).toBe(value);
  }
});

test('les facteurs communs redonnent le PGCD', () => {
  const values = [84, 126, 210];
  const common = commonFactors(values.map(factorize));
  expect(common).toEqual([
    { prime: 2, power: 1 },
    { prime: 3, power: 1 },
    { prime: 7, power: 1 },
  ]);
  expect(common.reduce((product, { prime, power }) => product * prime ** power, 1)).toBe(gcdMany(values));
  expect(commonFactors([factorize(8), factorize(9)])).toEqual([]);
});

test('réduction de fraction', () => {
  expect(reduceFraction(84, 126)).toEqual({ numerator: 2, denominator: 3, divisor: 42 });
  expect(reduceFraction(7, 5)).toEqual({ numerator: 7, denominator: 5, divisor: 1 });
});

test('le découpage en carrés : le plus petit carré a le PGCD pour côté', () => {
  const tiling = squareTiling(1071, 462);
  expect(tiling.width).toBe(1071);
  expect(tiling.height).toBe(462);
  expect(tiling.total).toBe(12); // 2 + 3 + 7
  expect(tiling.squares).toHaveLength(12);
  expect(Math.min(...tiling.squares.map((square) => square.size))).toBe(21);
  // Les carrés couvrent exactement le rectangle.
  expect(tiling.squares.reduce((area, square) => area + square.size ** 2, 0)).toBe(1071 * 462);
  // Aucun carré ne déborde.
  for (const square of tiling.squares) {
    expect(square.x + square.size).toBeLessThanOrEqual(1071);
    expect(square.y + square.size).toBeLessThanOrEqual(462);
  }
});

test('le découpage plafonne le dessin sans fausser le compte', () => {
  const tiling = squareTiling(100_000, 1, 50);
  expect(tiling.total).toBe(100_000);
  expect(tiling.squares).toHaveLength(50);
});

test('écriture des facteurs', () => {
  expect(formatFactors(factorize(360))).toBe('2³ × 3² × 5');
  expect(formatFactors(factorize(1))).toBe('1');
  expect(formatFactors(factorize(2 ** 12))).toBe('2¹²');
});

test('lecture des entiers saisis', () => {
  expect(parseInteger('1071')).toBe(1071);
  expect(parseInteger(' 1 000 000 ')).toBe(1_000_000);
  expect(parseInteger('1.000.000')).toBe(1_000_000);
  expect(parseInteger('1000000000000')).toBe(MAX_VALUE);
  expect(parseInteger('1000000000001')).toBeNull();
  expect(parseInteger('0')).toBeNull();
  expect(parseInteger('-4')).toBeNull();
  expect(parseInteger('12,5')).toBeNull();
  expect(parseInteger('abc')).toBeNull();
  expect(parseInteger('')).toBeNull();
});
