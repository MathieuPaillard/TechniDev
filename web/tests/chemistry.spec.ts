import { expect, test } from '@playwright/test';
import { ELEMENTS, elementBySymbol, gridPosition } from '../src/lib/labo/chemistry/elements';
import { formatMass, molarMass, normalizeFormula, parseFormula } from '../src/lib/labo/chemistry/formula';

function massOf(formula: string): number {
  const result = parseFormula(formula);
  if (!result.ok) throw new Error(`${formula} : ${result.message}`);
  return molarMass(result.atoms).total;
}

function errorOf(formula: string): { message: string; position: number } {
  const result = parseFormula(formula);
  if (result.ok) throw new Error(`${formula} aurait dû être refusée`);
  return { message: result.message, position: result.position };
}

test('la table compte 118 éléments, sans doublon', () => {
  expect(ELEMENTS).toHaveLength(118);
  expect(new Set(ELEMENTS.map((element) => element.symbol)).size).toBe(118);
  expect(new Set(ELEMENTS.map((element) => element.name)).size).toBe(118);
  ELEMENTS.forEach((element, index) => expect(element.number).toBe(index + 1));
  expect(elementBySymbol('Au')).toMatchObject({ number: 79, name: 'Or', mass: 196.97, nominal: false });
  expect(elementBySymbol('Tc')).toMatchObject({ number: 43, mass: 97, nominal: true });
  expect(elementBySymbol('Xx')).toBeUndefined();
});

test('les masses croissent avec le numéro atomique, sauf les inversions connues', () => {
  const inversions = new Set(['Ar', 'Co', 'Te', 'Th', 'U', 'Pu', 'Bk', 'Og']);
  // Argon/potassium, cobalt/nickel, tellure/iode, thorium/protactinium, uranium/neptunium… et les égalités
  // de nombres de masse (Cm/Bk, Ts/Og).
  for (let i = 0; i < ELEMENTS.length - 1; i++) {
    const current = ELEMENTS[i]!;
    const next = ELEMENTS[i + 1]!;
    if (inversions.has(current.symbol) || inversions.has(next.symbol)) continue;
    expect(next.mass, `${current.symbol} → ${next.symbol}`).toBeGreaterThan(current.mass);
  }
});

test('chaque élément a sa case, aucune case en double', () => {
  const seen = new Set<string>();
  for (const element of ELEMENTS) {
    const key = `${element.row}:${element.column}`;
    expect(seen.has(key), `${element.symbol} en ${key}`).toBe(false);
    seen.add(key);
    expect(element.row).toBeGreaterThanOrEqual(1);
    expect(element.row).toBeLessThanOrEqual(9);
    expect(element.column).toBeGreaterThanOrEqual(1);
    expect(element.column).toBeLessThanOrEqual(18);
  }
  expect(gridPosition(1)).toEqual({ row: 1, column: 1 });
  expect(gridPosition(2)).toEqual({ row: 1, column: 18 });
  expect(gridPosition(6)).toEqual({ row: 2, column: 14 }); // carbone
  expect(gridPosition(26)).toEqual({ row: 4, column: 8 }); // fer
  expect(gridPosition(57)).toEqual({ row: 8, column: 3 }); // lanthane
  expect(gridPosition(71)).toEqual({ row: 8, column: 17 }); // lutécium
  expect(gridPosition(72)).toEqual({ row: 6, column: 4 }); // hafnium
  expect(gridPosition(79)).toEqual({ row: 6, column: 11 }); // or
  expect(gridPosition(89)).toEqual({ row: 9, column: 3 }); // actinium
  expect(gridPosition(103)).toEqual({ row: 9, column: 17 }); // lawrencium
  expect(gridPosition(104)).toEqual({ row: 7, column: 4 }); // rutherfordium
  expect(gridPosition(118)).toEqual({ row: 7, column: 18 }); // oganesson
  // Les gaz nobles sont dans la colonne 18.
  for (const symbol of ['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og']) {
    expect(elementBySymbol(symbol)?.column).toBe(18);
  }
});

test('masses molaires de composés courants', () => {
  expect(massOf('H2O')).toBeCloseTo(18.015, 3);
  expect(massOf('NaCl')).toBeCloseTo(58.44, 3);
  expect(massOf('CO2')).toBeCloseTo(44.009, 3);
  expect(massOf('C6H12O6')).toBeCloseTo(180.156, 3);
  expect(massOf('H2SO4')).toBeCloseTo(98.072, 3);
  expect(massOf('O2')).toBeCloseTo(31.998, 3);
  expect(massOf('Au')).toBeCloseTo(196.97, 3);
});

test('parenthèses, crochets et hydrates', () => {
  expect(massOf('Ca(OH)2')).toBeCloseTo(74.092, 3);
  expect(massOf('Al2(SO4)3')).toBeCloseTo(342.132, 3);
  expect(massOf('Fe4[Fe(CN)6]3')).toBeCloseTo(7 * 55.845 + 18 * 12.011 + 18 * 14.007, 3);
  expect(massOf('CuSO4·5H2O')).toBeCloseTo(249.677, 3);
  expect(massOf('CuSO4.5H2O')).toBeCloseTo(249.677, 3);
  expect(massOf('CuSO4 * 5 H2O')).toBeCloseTo(249.677, 3);
  expect(massOf('2H2O')).toBeCloseTo(36.03, 3);
  expect(massOf('((CH3)3C)2O')).toBeCloseTo(8 * 12.011 + 18 * 1.008 + 15.999, 3);
});

test('les atomes sont comptés dans leur ordre d’apparition', () => {
  const result = parseFormula('CH3COOH');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.atoms.map(({ element, count }) => [element.symbol, count])).toEqual([
    ['C', 2],
    ['H', 4],
    ['O', 2],
  ]);
  const mass = molarMass(result.atoms);
  expect(mass.total).toBeCloseTo(60.052, 3);
  expect(mass.parts.reduce((sum, part) => sum + part.percent, 0)).toBeCloseTo(100, 9);
  expect(mass.parts[0]!.percent).toBeCloseTo((2 * 12.011 * 100) / 60.052, 6);
  expect(mass.approximate).toBe(false);
});

test('deux lettres : le symbole le plus long gagne quand il existe', () => {
  expect(massOf('Co')).toBeCloseTo(58.933, 3); // cobalt
  expect(massOf('CO')).toBeCloseTo(28.01, 3); // monoxyde de carbone
  expect(massOf('HF')).toBeCloseTo(20.006, 3);
  expect(massOf('Hf')).toBeCloseTo(178.49, 3);
  expect(massOf('NO')).toBeCloseTo(30.006, 3);
  expect(massOf('No')).toBeCloseTo(259, 3);
});

test('un élément radioactif rend le total indicatif', () => {
  const result = parseFormula('UO2');
  expect(result.ok && molarMass(result.atoms).approximate).toBe(false);
  const plutonium = parseFormula('PuO2');
  expect(plutonium.ok && molarMass(plutonium.atoms).approximate).toBe(true);
});

test('la formule est réécrite avec ses indices', () => {
  const display = (formula: string): string => {
    const result = parseFormula(formula);
    return result.ok ? result.display : result.message;
  };
  expect(display('C6H12O6')).toBe('C₆H₁₂O₆');
  expect(display('Al2(SO4)3')).toBe('Al₂(SO₄)₃');
  expect(display('CuSO4.5H2O')).toBe('CuSO₄ · 5H₂O');
  expect(display('Fe4[Fe(CN)6]3')).toBe('Fe₄[Fe(CN)₆]₃');
  expect(normalizeFormula(' C₆H₁₂O₆ ')).toBe('C6H12O6');
});

test('les erreurs disent quoi et où', () => {
  expect(errorOf('')).toEqual({ message: 'Écrire une formule, par exemple H2O.', position: 0 });
  expect(errorOf('   ')).toEqual({ message: 'Écrire une formule, par exemple H2O.', position: 0 });
  expect(errorOf('H2X')).toEqual({ message: "« X » n'est pas un élément.", position: 2 });
  expect(errorOf('Xx2')).toEqual({ message: "« Xx » n'est pas un élément.", position: 0 });
  expect(errorOf('Hx')).toEqual({ message: "« Hx » n'est pas un élément.", position: 0 });
  expect(errorOf('h2o')).toEqual({
    message: "Un symbole commence par une majuscule : « h » n'en est pas un.",
    position: 0,
  });
  expect(errorOf('Ca(OH2')).toEqual({ message: 'Parenthèse ouverte jamais refermée.', position: 6 });
  expect(errorOf('CaOH)2')).toEqual({ message: 'Parenthèse fermante en trop.', position: 4 });
  expect(errorOf('Fe[CN)6')).toEqual({ message: '« [ » se referme avec « ] », pas avec « ) ».', position: 5 });
  expect(errorOf('Ca()2')).toEqual({ message: 'Parenthèses vides.', position: 3 });
  expect(errorOf('H0')).toEqual({ message: 'Un indice vaut au moins 1.', position: 1 });
  expect(errorOf('H1000000')).toEqual({ message: 'Indice trop grand.', position: 1 });
  expect(errorOf('H2O-')).toEqual({ message: 'Caractère inattendu : « - ».', position: 3 });
  expect(errorOf('H2O·')).toEqual({ message: 'Il manque un élément ici.', position: 4 });
  expect(errorOf('5')).toEqual({ message: 'Il manque un élément ici.', position: 1 });
  expect(errorOf('(H999999)999999')).toMatchObject({ message: 'Formule trop grande.' });
});

test('affichage de la masse', () => {
  expect(formatMass(180.1559)).toBe('180,156');
  expect(formatMass(18.015)).toBe('18,015');
  expect(formatMass(2)).toBe('2,000');
});
