import { expect, test } from '@playwright/test';
import { formatEuros, MAX_CENTS, parseAmount } from '../src/lib/labo/money/cents';
import {
  computeBalances,
  computeSettlements,
  equalShares,
  isValidExpense,
  splitEqually,
  type Expense,
} from '../src/lib/labo/money/ledger';

test('lecture des montants saisis', () => {
  expect(parseAmount('12,50')).toBe(1250);
  expect(parseAmount('12.5')).toBe(1250);
  expect(parseAmount('12')).toBe(1200);
  expect(parseAmount(' 0,01 ')).toBe(1);
  expect(parseAmount('1 250,50')).toBe(125050);
  expect(parseAmount('1 250,50')).toBe(125050);
  expect(parseAmount('100000')).toBe(MAX_CENTS);
  expect(parseAmount('100000,01')).toBeNull();
  expect(parseAmount('0')).toBeNull();
  expect(parseAmount('12 50')).toBeNull();
  expect(parseAmount('12,505')).toBeNull();
  expect(parseAmount('-3')).toBeNull();
  expect(parseAmount('douze')).toBeNull();
  expect(parseAmount('')).toBeNull();
  // 0,1 + 0,2 : le piège classique des nombres à virgule n'existe pas en centimes.
  expect((parseAmount('0,10') ?? 0) + (parseAmount('0,20') ?? 0)).toBe(30);
});

test('affichage des montants', () => {
  const plain = (text: string): string => text.replace(/[  ]/g, ' ');
  expect(plain(formatEuros(1250))).toBe('12,50 €');
  expect(plain(formatEuros(5))).toBe('0,05 €');
  expect(plain(formatEuros(125050))).toBe('1 250,50 €');
  expect(plain(formatEuros(-1999))).toBe('-19,99 €');
  expect(plain(formatEuros(0))).toBe('0,00 €');
});

test('partage égal : les centimes de reste vont aux premiers', () => {
  expect(equalShares(1000, 3)).toEqual([334, 333, 333]);
  expect(equalShares(1001, 3)).toEqual([334, 334, 333]);
  expect(equalShares(900, 3)).toEqual([300, 300, 300]);
  expect(equalShares(2, 3)).toEqual([1, 1, 0]);
  expect(equalShares(500, 1)).toEqual([500]);
  expect(equalShares(500, 0)).toEqual([]);
  for (const [total, count] of [[9999, 7], [1, 2], [10_000_000, 6]] as const) {
    expect(equalShares(total, count).reduce((sum, part) => sum + part, 0)).toBe(total);
  }
});

const members = [1, 2, 3, 4];

function scenario(): Expense[] {
  return [
    splitEqually(1, 'Courses', 8460, 1, [1, 2, 3, 4]),
    splitEqually(2, 'Essence', 5000, 2, [1, 2, 3]),
    splitEqually(3, 'Restaurant', 9600, 3, [1, 2, 3, 4]),
    splitEqually(4, 'Café', 730, 4, [3, 4]),
  ];
}

test('une dépense partagée est cohérente', () => {
  for (const expense of scenario()) expect(isValidExpense(expense, members)).toBe(true);
  const broken = { ...splitEqually(9, 'Faux', 1000, 1, [1, 2]), amount: 999 };
  expect(isValidExpense(broken, members)).toBe(false);
  expect(isValidExpense(splitEqually(9, 'Inconnu', 1000, 7, [1, 2]), members)).toBe(false);
  expect(isValidExpense(splitEqually(9, 'Personne', 1000, 1, []), members)).toBe(false);
  // Deux centimes pour trois : un participant aurait une part nulle.
  expect(isValidExpense(splitEqually(9, 'Trop peu', 2, 1, [1, 2, 3]), members)).toBe(false);
});

test('la somme des soldes vaut zéro', () => {
  const balances = computeBalances(members, scenario());
  expect(balances.reduce((sum, line) => sum + line.balance, 0)).toBe(0);
  // Courses 8460/4 = 2115 ; essence 5000/3 = 1667, 1667, 1666 ; restaurant 9600/4 = 2400 ; café 730/2 = 365.
  expect(balances).toEqual([
    { memberId: 1, paid: 8460, owed: 2115 + 1667 + 2400, balance: 8460 - 6182 },
    { memberId: 2, paid: 5000, owed: 2115 + 1667 + 2400, balance: 5000 - 6182 },
    { memberId: 3, paid: 9600, owed: 2115 + 1666 + 2400 + 365, balance: 9600 - 6546 },
    { memberId: 4, paid: 730, owed: 2115 + 2400 + 365, balance: 730 - 4880 },
  ]);
});

test('les remboursements suggérés soldent le groupe en n − 1 virements au plus', () => {
  const balances = computeBalances(members, scenario());
  const settlements = computeSettlements(balances);
  expect(settlements.length).toBeLessThanOrEqual(members.length - 1);
  const after = new Map(balances.map((line) => [line.memberId, line.balance]));
  for (const { from, to, amount } of settlements) {
    expect(amount).toBeGreaterThan(0);
    after.set(from, (after.get(from) ?? 0) + amount);
    after.set(to, (after.get(to) ?? 0) - amount);
  }
  expect([...after.values()]).toEqual([0, 0, 0, 0]);
  // Le plus gros débiteur (4 : −4150) paie le plus gros créancier (3 : +3054).
  expect(settlements[0]).toEqual({ from: 4, to: 3, amount: 3054 });
});

test('égalités départagées par l’ordre des membres', () => {
  expect(
    computeSettlements([
      { memberId: 1, balance: -500 },
      { memberId: 2, balance: -500 },
      { memberId: 3, balance: 500 },
      { memberId: 4, balance: 500 },
    ]),
  ).toEqual([
    { from: 1, to: 3, amount: 500 },
    { from: 2, to: 4, amount: 500 },
  ]);
});

test('rien à rembourser quand tout le monde est à zéro', () => {
  expect(computeSettlements(computeBalances(members, []))).toEqual([]);
  expect(computeSettlements([])).toEqual([]);
});

test('des soldes incohérents sont refusés', () => {
  expect(() => computeSettlements([{ memberId: 1, balance: 100 }])).toThrow('somme non nulle');
});
