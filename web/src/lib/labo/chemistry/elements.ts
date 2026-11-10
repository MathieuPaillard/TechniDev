// Les 118 éléments : symbole, nom français, masse atomique, place dans le tableau périodique.
//
// Masses : poids atomiques standard abrégés de l'IUPAC (cinq chiffres significatifs au plus). Pour les
// éléments sans isotope stable, la valeur est le nombre de masse de l'isotope le plus stable (`nominal`).
// L'appli Android de 2022 embarquait sa propre table, avec quelques valeurs plus anciennes et des zéros
// pour les éléments 114 à 118 ; celle-ci la remplace.

export interface Element {
  number: number;
  symbol: string;
  name: string;
  /** Masse atomique en g/mol. */
  mass: number;
  /** Vrai si la masse est un nombre de masse (élément radioactif sans composition isotopique naturelle). */
  nominal: boolean;
  /** Position dans la grille d'affichage : lignes 1 à 7, puis 8 (lanthanides) et 9 (actinides) ; colonnes 1 à 18. */
  row: number;
  column: number;
}

// [symbole, nom, masse], dans l'ordre des numéros atomiques. Une masse négative marque un nombre de masse.
const TABLE: ReadonlyArray<readonly [string, string, number]> = [
  ['H', 'Hydrogène', 1.008],
  ['He', 'Hélium', 4.0026],
  ['Li', 'Lithium', 6.94],
  ['Be', 'Béryllium', 9.0122],
  ['B', 'Bore', 10.81],
  ['C', 'Carbone', 12.011],
  ['N', 'Azote', 14.007],
  ['O', 'Oxygène', 15.999],
  ['F', 'Fluor', 18.998],
  ['Ne', 'Néon', 20.18],
  ['Na', 'Sodium', 22.99],
  ['Mg', 'Magnésium', 24.305],
  ['Al', 'Aluminium', 26.982],
  ['Si', 'Silicium', 28.085],
  ['P', 'Phosphore', 30.974],
  ['S', 'Soufre', 32.06],
  ['Cl', 'Chlore', 35.45],
  ['Ar', 'Argon', 39.95],
  ['K', 'Potassium', 39.098],
  ['Ca', 'Calcium', 40.078],
  ['Sc', 'Scandium', 44.956],
  ['Ti', 'Titane', 47.867],
  ['V', 'Vanadium', 50.942],
  ['Cr', 'Chrome', 51.996],
  ['Mn', 'Manganèse', 54.938],
  ['Fe', 'Fer', 55.845],
  ['Co', 'Cobalt', 58.933],
  ['Ni', 'Nickel', 58.693],
  ['Cu', 'Cuivre', 63.546],
  ['Zn', 'Zinc', 65.38],
  ['Ga', 'Gallium', 69.723],
  ['Ge', 'Germanium', 72.63],
  ['As', 'Arsenic', 74.922],
  ['Se', 'Sélénium', 78.971],
  ['Br', 'Brome', 79.904],
  ['Kr', 'Krypton', 83.798],
  ['Rb', 'Rubidium', 85.468],
  ['Sr', 'Strontium', 87.62],
  ['Y', 'Yttrium', 88.906],
  ['Zr', 'Zirconium', 91.224],
  ['Nb', 'Niobium', 92.906],
  ['Mo', 'Molybdène', 95.95],
  ['Tc', 'Technétium', -97],
  ['Ru', 'Ruthénium', 101.07],
  ['Rh', 'Rhodium', 102.91],
  ['Pd', 'Palladium', 106.42],
  ['Ag', 'Argent', 107.87],
  ['Cd', 'Cadmium', 112.41],
  ['In', 'Indium', 114.82],
  ['Sn', 'Étain', 118.71],
  ['Sb', 'Antimoine', 121.76],
  ['Te', 'Tellure', 127.6],
  ['I', 'Iode', 126.9],
  ['Xe', 'Xénon', 131.29],
  ['Cs', 'Césium', 132.91],
  ['Ba', 'Baryum', 137.33],
  ['La', 'Lanthane', 138.91],
  ['Ce', 'Cérium', 140.12],
  ['Pr', 'Praséodyme', 140.91],
  ['Nd', 'Néodyme', 144.24],
  ['Pm', 'Prométhium', -145],
  ['Sm', 'Samarium', 150.36],
  ['Eu', 'Europium', 151.96],
  ['Gd', 'Gadolinium', 157.25],
  ['Tb', 'Terbium', 158.93],
  ['Dy', 'Dysprosium', 162.5],
  ['Ho', 'Holmium', 164.93],
  ['Er', 'Erbium', 167.26],
  ['Tm', 'Thulium', 168.93],
  ['Yb', 'Ytterbium', 173.05],
  ['Lu', 'Lutécium', 174.97],
  ['Hf', 'Hafnium', 178.49],
  ['Ta', 'Tantale', 180.95],
  ['W', 'Tungstène', 183.84],
  ['Re', 'Rhénium', 186.21],
  ['Os', 'Osmium', 190.23],
  ['Ir', 'Iridium', 192.22],
  ['Pt', 'Platine', 195.08],
  ['Au', 'Or', 196.97],
  ['Hg', 'Mercure', 200.59],
  ['Tl', 'Thallium', 204.38],
  ['Pb', 'Plomb', 207.2],
  ['Bi', 'Bismuth', 208.98],
  ['Po', 'Polonium', -209],
  ['At', 'Astate', -210],
  ['Rn', 'Radon', -222],
  ['Fr', 'Francium', -223],
  ['Ra', 'Radium', -226],
  ['Ac', 'Actinium', -227],
  ['Th', 'Thorium', 232.04],
  ['Pa', 'Protactinium', 231.04],
  ['U', 'Uranium', 238.03],
  ['Np', 'Neptunium', -237],
  ['Pu', 'Plutonium', -244],
  ['Am', 'Américium', -243],
  ['Cm', 'Curium', -247],
  ['Bk', 'Berkélium', -247],
  ['Cf', 'Californium', -251],
  ['Es', 'Einsteinium', -252],
  ['Fm', 'Fermium', -257],
  ['Md', 'Mendélévium', -258],
  ['No', 'Nobélium', -259],
  ['Lr', 'Lawrencium', -262],
  ['Rf', 'Rutherfordium', -267],
  ['Db', 'Dubnium', -268],
  ['Sg', 'Seaborgium', -269],
  ['Bh', 'Bohrium', -270],
  ['Hs', 'Hassium', -277],
  ['Mt', 'Meitnérium', -278],
  ['Ds', 'Darmstadtium', -281],
  ['Rg', 'Roentgenium', -282],
  ['Cn', 'Copernicium', -285],
  ['Nh', 'Nihonium', -286],
  ['Fl', 'Flérovium', -289],
  ['Mc', 'Moscovium', -290],
  ['Lv', 'Livermorium', -293],
  ['Ts', 'Tennesse', -294],
  ['Og', 'Oganesson', -294],
];

/** Place d'un élément dans la grille : les lanthanides et les actinides sont rangés sous le tableau. */
export function gridPosition(number: number): { row: number; column: number } {
  if (number === 1) return { row: 1, column: 1 };
  if (number === 2) return { row: 1, column: 18 };
  if (number <= 4) return { row: 2, column: number - 2 };
  if (number <= 10) return { row: 2, column: number + 8 };
  if (number <= 12) return { row: 3, column: number - 10 };
  if (number <= 18) return { row: 3, column: number };
  if (number <= 36) return { row: 4, column: number - 18 };
  if (number <= 54) return { row: 5, column: number - 36 };
  if (number <= 56) return { row: 6, column: number - 54 };
  if (number <= 71) return { row: 8, column: number - 54 };
  if (number <= 86) return { row: 6, column: number - 68 };
  if (number <= 88) return { row: 7, column: number - 86 };
  if (number <= 103) return { row: 9, column: number - 86 };
  return { row: 7, column: number - 100 };
}

export const ELEMENTS: readonly Element[] = TABLE.map(([symbol, name, mass], index) => {
  const number = index + 1;
  return { number, symbol, name, mass: Math.abs(mass), nominal: mass < 0, ...gridPosition(number) };
});

const BY_SYMBOL = new Map(ELEMENTS.map((element) => [element.symbol, element]));

export function elementBySymbol(symbol: string): Element | undefined {
  return BY_SYMBOL.get(symbol);
}

/** Les gaz nobles qui remplissent les tubes du site, par symbole, vers le nom de leur couleur CSS. */
export const NOBLE_GAS_VARS: Readonly<Record<string, string>> = {
  He: '--gas-he',
  Ne: '--gas-ne',
  Ar: '--gas-ar',
  Kr: '--gas-kr',
  Xe: '--gas-xe',
};
