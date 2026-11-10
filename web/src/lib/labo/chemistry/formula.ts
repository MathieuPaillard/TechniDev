// Lecture d'une formule brute et calcul de la masse molaire. Fonctions pures.
//
// Portage de l'appli Android Calcul Masse Molaire (2022), qui lisait la formule caractère par caractère.
// Ici, un petit analyseur accepte en plus les parenthèses imbriquées, les crochets, les hydrates
// (CuSO4·5H2O, le point se tape aussi « . » ou « * ») et dit où se trouve l'erreur.
import { elementBySymbol, type Element } from './elements';

export interface AtomCount {
  element: Element;
  count: number;
}

export interface FormulaError {
  ok: false;
  message: string;
  /** Position du problème dans la saisie nettoyée (voir `normalizeFormula`). */
  position: number;
}

export interface FormulaSuccess {
  ok: true;
  /** Les éléments dans l'ordre de leur première apparition, avec leur nombre total d'atomes. */
  atoms: AtomCount[];
  /** La formule réécrite avec ses indices en petits chiffres. */
  display: string;
}

export type FormulaResult = FormulaSuccess | FormulaError;

const MAX_INDEX = 999_999;
const MAX_ATOMS = 1_000_000_000;

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

/** Saisie nettoyée : sans espaces, indices en chiffres ordinaires, un seul signe « · » pour les hydrates. */
export function normalizeFormula(input: string): string {
  return input
    .replace(/\s+/g, '')
    .replace(/[₀-₉]/g, (digit) => String(SUBSCRIPTS.indexOf(digit)))
    .replace(/[.*•∙⋅]/g, '·');
}

function subscript(value: number): string {
  return [...String(value)].map((digit) => SUBSCRIPTS[Number(digit)]).join('');
}

class Reader {
  position = 0;
  constructor(readonly text: string) {}

  peek(): string {
    return this.text[this.position] ?? '';
  }

  done(): boolean {
    return this.position >= this.text.length;
  }

  /** Lit un entier s'il y en a un. Renvoie null sinon. */
  number(): number | null {
    const match = /^\d+/.exec(this.text.slice(this.position));
    if (!match) return null;
    const start = this.position;
    this.position += match[0].length;
    const value = Number(match[0]);
    if (value < 1) throw fail('Un indice vaut au moins 1.', start);
    if (value > MAX_INDEX) throw fail('Indice trop grand.', start);
    return value;
  }
}

class FormulaFailure extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
  }
}

function fail(message: string, position: number): FormulaFailure {
  return new FormulaFailure(message, position);
}

type Counts = Map<string, number>;

function addInto(target: Counts, source: Counts, factor: number, position: number): void {
  for (const [symbol, count] of source) {
    const total = (target.get(symbol) ?? 0) + count * factor;
    if (total > MAX_ATOMS) throw fail('Formule trop grande.', position);
    target.set(symbol, total);
  }
}

const CLOSERS: Record<string, string> = { '(': ')', '[': ']' };

/** Une suite d'éléments et de groupes entre parenthèses, chacun suivi d'un indice facultatif. */
function readSequence(reader: Reader, closer: string | null): { counts: Counts; display: string } {
  const counts: Counts = new Map();
  let display = '';
  let units = 0;

  for (;;) {
    const char = reader.peek();
    const start = reader.position;

    if (char === '(' || char === '[') {
      reader.position++;
      const expected = CLOSERS[char]!;
      const inner = readSequence(reader, expected);
      const index = reader.number() ?? 1;
      addInto(counts, inner.counts, index, start);
      display += `${char}${inner.display}${expected}${index > 1 ? subscript(index) : ''}`;
      units++;
      continue;
    }

    if (char === ')' || char === ']') {
      if (closer === null) throw fail('Parenthèse fermante en trop.', start);
      if (char !== closer) {
        throw fail(`« ${closer === ')' ? '(' : '['} » se referme avec « ${closer} », pas avec « ${char} ».`, start);
      }
      if (units === 0) throw fail('Parenthèses vides.', start);
      reader.position++;
      return { counts, display };
    }

    if (/[A-Z]/.test(char)) {
      // Un symbole : une majuscule, puis une minuscule si les deux lettres forment un élément.
      const next = reader.text[start + 1] ?? '';
      const two = /[a-z]/.test(next) ? char + next : '';
      const element = (two && elementBySymbol(two)) || elementBySymbol(char);
      if (!element) throw fail(`« ${two || char} » n'est pas un élément.`, start);
      reader.position += element.symbol.length;
      // Une minuscule de trop (« Hx », « Cla ») : mieux vaut le dire que l'ignorer.
      if (/[a-z]/.test(reader.peek())) {
        const word = /^[A-Za-z][a-z]*/.exec(reader.text.slice(start))?.[0] ?? char;
        throw fail(`« ${word} » n'est pas un élément.`, start);
      }
      const index = reader.number() ?? 1;
      addInto(counts, new Map([[element.symbol, 1]]), index, start);
      display += `${element.symbol}${index > 1 ? subscript(index) : ''}`;
      units++;
      continue;
    }

    if (/[a-z]/.test(char)) {
      throw fail(`Un symbole commence par une majuscule : « ${char} » n'en est pas un.`, start);
    }

    // Fin de la suite : fin de la saisie, ou séparateur d'hydrate.
    if (closer !== null) {
      if (char === '' || char === '·') throw fail('Parenthèse ouverte jamais refermée.', start);
      throw fail(`Caractère inattendu : « ${char} ».`, start);
    }
    if (/\d/.test(char)) throw fail("Un nombre doit suivre un élément ou une parenthèse.", start);
    if (char !== '' && char !== '·') throw fail(`Caractère inattendu : « ${char} ».`, start);
    if (units === 0) throw fail('Il manque un élément ici.', start);
    return { counts, display };
  }
}

/** Lit une formule brute : « H2O », « Ca(OH)2 », « Fe4[Fe(CN)6]3 », « CuSO4·5H2O ». */
export function parseFormula(input: string): FormulaResult {
  const text = normalizeFormula(input);
  if (text === '') return { ok: false, message: 'Écrire une formule, par exemple H2O.', position: 0 };

  const reader = new Reader(text);
  const counts: Counts = new Map();
  const displays: string[] = [];

  try {
    for (;;) {
      const start = reader.position;
      // Un nombre en tête d'un terme multiplie tout le terme : « 5H2O ».
      const coefficient = reader.number() ?? 1;
      const term = readSequence(reader, null);
      addInto(counts, term.counts, coefficient, start);
      displays.push(`${coefficient > 1 ? coefficient : ''}${term.display}`);
      if (reader.done()) break;
      reader.position++; // le séparateur « · »
    }
  } catch (error) {
    if (error instanceof FormulaFailure) return { ok: false, message: error.message, position: error.position };
    throw error;
  }

  const atoms: AtomCount[] = [];
  for (const [symbol, count] of counts) {
    const element = elementBySymbol(symbol);
    if (element) atoms.push({ element, count });
  }
  return { ok: true, atoms, display: displays.join(' · ') };
}

export interface MassPart {
  element: Element;
  count: number;
  /** Masse apportée par cet élément, en g/mol. */
  mass: number;
  /** Part de la masse totale, de 0 à 100. */
  percent: number;
}

export interface MolarMass {
  /** Masse molaire en g/mol. */
  total: number;
  parts: MassPart[];
  /** Vrai si un élément n'a qu'un nombre de masse : le total est alors indicatif. */
  approximate: boolean;
}

export function molarMass(atoms: readonly AtomCount[]): MolarMass {
  const masses = atoms.map(({ element, count }) => element.mass * count);
  const total = masses.reduce((sum, mass) => sum + mass, 0);
  return {
    total,
    parts: atoms.map(({ element, count }, index) => ({
      element,
      count,
      mass: masses[index]!,
      percent: total > 0 ? (masses[index]! / total) * 100 : 0,
    })),
    approximate: atoms.some(({ element }) => element.nominal),
  };
}

const massFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const percentFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** « 180,156 » : trois décimales, virgule française. */
export function formatMass(mass: number): string {
  return massFormat.format(mass);
}

export function formatPercent(percent: number): string {
  return percentFormat.format(percent);
}
