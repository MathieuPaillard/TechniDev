// Démo « Masse molaire » : la saisie, le tableau périodique qui sert de clavier, l'afficheur et la composition.
// L'analyse de la formule est dans formula.ts.
import { announce, byId, h } from '../../ui/dom';
import { setNixie } from '../../ui/nixie';
import { formatMass, formatPercent, molarMass, normalizeFormula, parseFormula } from './formula';

const input = byId('molar-input', HTMLInputElement);
const error = byId('molar-error', HTMLParagraphElement);
const display = byId('molar-display', HTMLParagraphElement);
const nixie = byId('molar-nixie', HTMLElement);
const note = byId('molar-note', HTMLParagraphElement);
const status = byId('molar-status', HTMLParagraphElement);
const rows = byId('molar-rows', HTMLTableSectionElement);
const table = byId('molar-table', HTMLTableElement);
const ptable = byId('molar-ptable', HTMLDivElement);
const backspace = byId('molar-backspace', HTMLButtonElement);
const clear = byId('molar-clear', HTMLButtonElement);

const cells = [...ptable.querySelectorAll<HTMLButtonElement>('.pcell')];
const cellBySymbol = new Map(cells.map((cell) => [cell.dataset.symbol ?? '', cell]));

const countFormat = new Intl.NumberFormat('fr-FR');

function lightCells(counts: Map<string, number>): void {
  for (const [symbol, cell] of cellBySymbol) {
    const count = counts.get(symbol) ?? 0;
    cell.classList.toggle('is-lit', count > 0);
    const badge = cell.querySelector('.pcell-count');
    if (badge) badge.textContent = count > 1 ? (count > 999 ? '999+' : String(count)) : '';
  }
}

function update(): void {
  const result = parseFormula(input.value);

  if (!result.ok) {
    const empty = normalizeFormula(input.value) === '';
    input.setAttribute('aria-invalid', String(!empty));
    error.textContent = empty ? '' : result.message;
    display.textContent = empty ? 'Une formule ?' : normalizeFormula(input.value);
    display.classList.add('is-invalid');
    setNixie(nixie, empty ? '0,000' : '?', 'g/mol');
    note.hidden = true;
    table.hidden = true;
    lightCells(new Map());
    if (empty) announce(status, 'Formule vide.');
    return;
  }

  const mass = molarMass(result.atoms);
  input.setAttribute('aria-invalid', 'false');
  error.textContent = '';
  display.textContent = result.display;
  display.classList.remove('is-invalid');
  setNixie(nixie, formatMass(mass.total), 'g/mol');
  note.hidden = !mass.approximate;
  table.hidden = false;
  lightCells(new Map(result.atoms.map(({ element, count }) => [element.symbol, count])));

  rows.replaceChildren(
    ...mass.parts.map((part) => {
      const fill = h('span', { class: 'molar-bar-fill' });
      const row = h('tr', {}, [
        h('th', { attrs: { scope: 'row' } }, [
          h('span', { class: 'molar-element' }, [h('b', { text: part.element.symbol }), part.element.name]),
        ]),
        h('td', { class: 'num', text: countFormat.format(part.count) }),
        h('td', { class: 'num', text: formatMass(part.mass) }),
        h('td', { class: 'num', text: `${formatPercent(part.percent)} %` }),
        h('td', { class: 'molar-bar-cell', attrs: { 'aria-hidden': 'true' } }, [h('span', { class: 'molar-bar' }, [fill])]),
      ]);
      // La largeur est posée une image plus tard : la barre glisse de zéro à sa valeur.
      requestAnimationFrame(() => fill.style.setProperty('width', `${Math.max(1, part.percent)}%`));
      return row;
    }),
  );

  announce(
    status,
    `${result.display} : ${formatMass(mass.total)} grammes par mole${mass.approximate ? ', valeur indicative' : ''}.`,
  );
}

/** Insère un texte à l'endroit du curseur si le champ a le focus, à la fin sinon. */
function insert(text: string): void {
  if (document.activeElement === input && input.selectionStart !== null && input.selectionEnd !== null) {
    input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
  } else {
    input.value += text;
  }
  update();
}

input.addEventListener('input', update);

ptable.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const cell = event.target.closest<HTMLButtonElement>('.pcell');
  if (cell?.dataset.symbol) insert(cell.dataset.symbol);
});

// Dans le tableau, les flèches déplacent le focus de case en case : une seule case est dans l'ordre de tabulation.
ptable.addEventListener('keydown', (event) => {
  if (!(event.target instanceof HTMLButtonElement)) return;
  const step: Record<string, [number, number]> = {
    ArrowRight: [0, 1],
    ArrowLeft: [0, -1],
    ArrowDown: [1, 0],
    ArrowUp: [-1, 0],
  };
  const move = step[event.key];
  if (!move) return;
  event.preventDefault();
  const row = Number(event.target.dataset.row);
  const column = Number(event.target.dataset.column);
  // La case la plus proche dans la direction demandée (le tableau a des trous).
  let best: HTMLButtonElement | null = null;
  let bestDistance = Infinity;
  for (const cell of cells) {
    const dr = Number(cell.dataset.row) - row;
    const dc = Number(cell.dataset.column) - column;
    const along = dr * move[0] + dc * move[1];
    const across = Math.abs(dr * move[1]) + Math.abs(dc * move[0]);
    if (along <= 0) continue;
    // Rester sur la même ligne (ou la même colonne) compte bien plus que la proximité.
    const distance = along + across * 12;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }
  if (!best) return;
  event.target.tabIndex = -1;
  best.tabIndex = 0;
  best.focus();
});

document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => {
  button.addEventListener('click', () => insert(button.dataset.key ?? ''));
});

document.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.example ?? '';
    update();
  });
});

backspace.addEventListener('click', () => {
  // Un symbole de deux lettres part d'un coup.
  input.value = input.value.replace(/([A-Z][a-z]?|.)$/u, '');
  update();
});

clear.addEventListener('click', () => {
  input.value = '';
  update();
});

update();
