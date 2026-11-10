// Qui doit quoi : partage égal, soldes, remboursements suggérés. Fonctions pures, centimes entiers.
// Mêmes règles que Dépenses partagées : `equalShares` vient de depenses-front/src/lib/expenses.ts et
// `computeSettlements` de depenses-api/src/balances.ts.
import type { Cents } from './cents';

export interface Share {
  memberId: number;
  amount: Cents;
}

export interface Expense {
  id: number;
  label: string;
  amount: Cents;
  paidBy: number;
  shares: Share[];
}

export interface BalanceLine {
  memberId: number;
  /** Ce que le membre a payé, moins ce qu'il doit : positif, on lui doit ; négatif, il doit. */
  balance: Cents;
  paid: Cents;
  owed: Cents;
}

export interface Settlement {
  from: number;
  to: number;
  amount: Cents;
}

/**
 * Partage égal : le reste de la division va, à raison d'un centime chacun, aux premiers participants dans
 * l'ordre de la liste. Renvoie une part par participant.
 */
export function equalShares(total: Cents, count: number): Cents[] {
  if (count <= 0) return [];
  const remainder = total % count;
  const base = (total - remainder) / count; // division entière exacte, sans passer par un décimal
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** Une dépense partagée à parts égales entre `participants`, dans l'ordre de la liste des membres. */
export function splitEqually(
  id: number,
  label: string,
  amount: Cents,
  paidBy: number,
  participants: readonly number[],
): Expense {
  const parts = equalShares(amount, participants.length);
  return {
    id,
    label,
    amount,
    paidBy,
    shares: participants.map((memberId, index) => ({ memberId, amount: parts[index] ?? 0 })),
  };
}

/** Vrai si la dépense est cohérente : parts positives, un participant au plus une fois, somme = montant. */
export function isValidExpense(expense: Expense, memberIds: readonly number[]): boolean {
  if (!Number.isInteger(expense.amount) || expense.amount < 1) return false;
  if (!memberIds.includes(expense.paidBy) || expense.shares.length === 0) return false;
  const seen = new Set<number>();
  let sum = 0;
  for (const share of expense.shares) {
    if (!memberIds.includes(share.memberId) || seen.has(share.memberId)) return false;
    if (!Number.isInteger(share.amount) || share.amount < 1) return false;
    seen.add(share.memberId);
    sum += share.amount;
  }
  return sum === expense.amount;
}

/** Solde de chaque membre, dans l'ordre de la liste. La somme des soldes vaut toujours 0. */
export function computeBalances(memberIds: readonly number[], expenses: readonly Expense[]): BalanceLine[] {
  const paid = new Map<number, Cents>(memberIds.map((id) => [id, 0]));
  const owed = new Map<number, Cents>(memberIds.map((id) => [id, 0]));
  for (const expense of expenses) {
    paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + expense.amount);
    for (const share of expense.shares) {
      owed.set(share.memberId, (owed.get(share.memberId) ?? 0) + share.amount);
    }
  }
  return memberIds.map((memberId) => {
    const p = paid.get(memberId) ?? 0;
    const o = owed.get(memberId) ?? 0;
    return { memberId, balance: p - o, paid: p, owed: o };
  });
}

/**
 * Remboursements suggérés : le plus gros débiteur rembourse le plus gros créancier, du plus petit des deux
 * montants, et on recommence jusqu'à ce que tout soit à zéro. Égalités départagées par l'ordre de `lines`.
 * Au plus n − 1 virements pour n soldes non nuls. Lève une erreur si la somme des soldes n'est pas nulle.
 */
export function computeSettlements(lines: readonly Pick<BalanceLine, 'memberId' | 'balance'>[]): Settlement[] {
  // Des soldes dont la somme n'est pas nulle trahissent des données incohérentes : mieux vaut échouer que se taire.
  if (lines.reduce((total, line) => total + line.balance, 0) !== 0) {
    throw new Error('Soldes de somme non nulle : suggestions impossibles');
  }
  const remaining = lines.map((line) => ({ memberId: line.memberId, balance: line.balance }));
  const settlements: Settlement[] = [];

  for (;;) {
    let debtor: (typeof remaining)[number] | undefined;
    let creditor: (typeof remaining)[number] | undefined;
    // Comparaison stricte : à égalité, le premier de la liste garde la place.
    for (const line of remaining) {
      if (line.balance < 0 && (!debtor || line.balance < debtor.balance)) debtor = line;
      if (line.balance > 0 && (!creditor || line.balance > creditor.balance)) creditor = line;
    }
    if (!debtor || !creditor) return settlements;

    const amount = Math.min(-debtor.balance, creditor.balance);
    settlements.push({ from: debtor.memberId, to: creditor.memberId, amount });
    debtor.balance += amount;
    creditor.balance -= amount;
  }
}
