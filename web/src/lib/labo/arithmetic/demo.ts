// Démo « PGCD » : la saisie, le découpage en carrés et le détail du calcul. Les fonctions sont dans gcd.ts.
import { announce, byId, h } from '../../ui/dom';
import { setNixie } from '../../ui/nixie';
import { createStage, type Stage } from '../../ui/stage';
import { onThemeChange, prefersReducedMotion, readPalette, rgba, tubesOn, type Palette } from '../../ui/theme';
import {
  commonFactors,
  euclidSteps,
  factorize,
  formatFactors,
  formatInteger,
  gcd,
  gcdMany,
  lcmMany,
  MAX_VALUE,
  parseInteger,
  reduceFraction,
  squareTiling,
  subtractionCount,
  type PrimePower,
  type SquareTiling,
} from './gcd';

const MAX_NUMBERS = 5;
/** Durée de l'apparition des carrés, en millisecondes. */
const REVEAL_MS = 1_400;

const fields = [...document.querySelectorAll<HTMLElement>('[data-gcd-field]')];
const inputs = fields.map((field) => field.querySelector<HTMLInputElement>('.gcd-input')!);
const errors = fields.map((field) => field.querySelector<HTMLElement>('.field-error')!);
const nixie = byId('gcd-nixie', HTMLElement);
const lcmOutput = byId('gcd-lcm', HTMLElement);
const fractionOutput = byId('gcd-fraction', HTMLElement);
const status = byId('gcd-status', HTMLParagraphElement);
const caption = byId('gcd-caption', HTMLElement);
const stepsList = byId('gcd-steps', HTMLOListElement);
const countsOutput = byId('gcd-counts', HTMLParagraphElement);
const factorsList = byId('gcd-factors', HTMLUListElement);
const commonOutput = byId('gcd-common', HTMLParagraphElement);
const canvas = byId('gcd-canvas', HTMLCanvasElement);
const addButton = byId('gcd-add', HTMLButtonElement);
const removeButton = byId('gcd-remove', HTMLButtonElement);
const replayButton = byId('gcd-replay', HTMLButtonElement);

let palette: Palette = readPalette();
let visibleFields = 2;
let tiling: SquareTiling | null = null;
let tilingKey = '';
let divisor = 0;
let revealStart = 0;
let animation = 0;

// Le découpage en carrés

function drawTiling(stage: Stage, now: number): boolean {
  const { ctx } = stage;
  const lit = tubesOn();
  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.fillStyle = rgba(palette.wall);
  ctx.fillRect(0, 0, stage.width, stage.height);
  if (!tiling) return false;

  const pad = 14;
  const scale = Math.min((stage.width - 2 * pad) / tiling.width, (stage.height - 2 * pad) / tiling.height);
  const left = (stage.width - tiling.width * scale) / 2;
  const top = (stage.height - tiling.height * scale) / 2;

  // Les carrés apparaissent l'un après l'autre ; chacun met un instant à atteindre son éclat.
  const elapsed = prefersReducedMotion() ? Infinity : now - revealStart;
  const count = tiling.squares.length;
  const perSquare = REVEAL_MS / Math.max(1, count);
  const fade = Math.max(120, perSquare * 1.5);
  let moving = false;

  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  tiling.squares.forEach((square, index) => {
    const age = elapsed - index * perSquare;
    if (age <= 0) {
      moving = true;
      return;
    }
    const alpha = Math.min(1, age / fade);
    if (alpha < 1) moving = true;
    const last = square.size === divisor;
    const stroke = lit ? (last ? palette.phosphor : palette.tube) : last ? palette.chalk : palette.frost;
    const x = left + square.x * scale;
    const y = top + square.y * scale;
    const size = square.size * scale;
    const inset = Math.min(1.5, size / 4);

    ctx.fillStyle = rgba(stroke, (last ? 0.2 : 0.07) * alpha);
    ctx.fillRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset);
    if (lit && size > 6) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = rgba(last ? palette.phosphor : palette.halo, 0.22 * alpha);
      ctx.strokeRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset);
    }
    ctx.lineWidth = size > 6 ? 1.6 : 1;
    ctx.strokeStyle = rgba(stroke, alpha);
    ctx.strokeRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset);

    // Le côté s'écrit dans les carrés assez grands pour le contenir.
    const label = formatInteger(square.size);
    const fontSize = Math.min(22, size / (label.length * 0.62 + 0.6));
    if (fontSize >= 10) {
      ctx.font = `600 ${fontSize}px "Atkinson Mono", ui-monospace, monospace`;
      ctx.fillStyle = rgba(last && lit ? palette.phosphor : palette.chalk, alpha);
      ctx.fillText(label, x + size / 2, y + size / 2 + 1);
    }
  });
  return moving;
}

const hooks = { redraw: (): void => {} };
const stage = createStage(canvas, () => hooks.redraw());

function animate(): void {
  cancelAnimationFrame(animation);
  const frame = (now: number): void => {
    if (drawTiling(stage, now)) animation = requestAnimationFrame(frame);
  };
  animation = requestAnimationFrame(frame);
}

function replay(): void {
  revealStart = performance.now();
  animate();
}

hooks.redraw = animate;

// Le calcul et son détail

function factorNodes(factors: PrimePower[], common: PrimePower[]): (Node | string)[] {
  if (factors.length === 0) return ['1'];
  const nodes: (Node | string)[] = [];
  factors.forEach((factor, index) => {
    if (index > 0) nodes.push(' × ');
    const shared = common.some((candidate) => candidate.prime === factor.prime);
    nodes.push(
      h('span', { class: shared ? 'gcd-factor is-common' : 'gcd-factor', text: formatFactors([factor]) }),
    );
  });
  return nodes;
}

function update(animateTiling: boolean): void {
  const values: number[] = [];
  let invalid = false;
  for (let i = 0; i < visibleFields; i++) {
    const input = inputs[i]!;
    const text = input.value.trim();
    const optional = i >= 2;
    if (text === '' && optional) {
      input.setAttribute('aria-invalid', 'false');
      errors[i]!.textContent = '';
      continue;
    }
    const value = parseInteger(text);
    if (value === null) {
      invalid = true;
      input.setAttribute('aria-invalid', 'true');
      errors[i]!.textContent = text === '' ? 'Il manque ce nombre.' : `Un entier de 1 à ${formatInteger(MAX_VALUE)}.`;
    } else {
      input.setAttribute('aria-invalid', 'false');
      errors[i]!.textContent = '';
      values.push(value);
    }
  }

  if (invalid || values.length < 2) {
    setNixie(nixie, '?');
    lcmOutput.textContent = '';
    fractionOutput.textContent = '';
    caption.textContent = 'Deux nombres entiers suffisent pour commencer.';
    stepsList.replaceChildren();
    factorsList.replaceChildren();
    countsOutput.textContent = '';
    commonOutput.textContent = '';
    tiling = null;
    tilingKey = '';
    animate();
    return;
  }

  const [a, b] = [values[0]!, values[1]!];
  const result = gcdMany(values);
  setNixie(nixie, formatInteger(result));
  lcmOutput.textContent = formatInteger(lcmMany(values));
  const reduced = reduceFraction(a, b);
  fractionOutput.textContent =
    reduced.divisor === 1
      ? `${formatInteger(a)} / ${formatInteger(b)}, déjà réduite`
      : `${formatInteger(a)} / ${formatInteger(b)} = ${formatInteger(reduced.numerator)} / ${formatInteger(reduced.denominator)}`;

  // Les divisions, pour les deux premiers nombres.
  const steps = euclidSteps(a, b);
  stepsList.replaceChildren(
    ...steps.map((step, index) =>
      h('li', {
        class: index === steps.length - 1 ? 'is-last' : '',
        text: `${formatInteger(step.a)} = ${formatInteger(step.b)} × ${formatInteger(step.q)} + ${formatInteger(step.r)}`,
      }),
    ),
  );
  const subtractions = subtractionCount(a, b);
  const pair = gcd(a, b);
  countsOutput.textContent =
    `PGCD de ${formatInteger(a)} et ${formatInteger(b)} : ${formatInteger(pair)}, le dernier diviseur. ` +
    `${steps.length} division${steps.length > 1 ? 's' : ''} ici, contre ${formatInteger(subtractions)} soustraction${subtractions > 1 ? 's' : ''} avec la méthode de l'appli.`;

  // Les facteurs premiers de chaque nombre, les communs allumés.
  const factorizations = values.map(factorize);
  const common = commonFactors(factorizations);
  factorsList.replaceChildren(
    ...values.map((value, index) =>
      h('li', {}, [`${formatInteger(value)} = `, ...factorNodes(factorizations[index]!, common)]),
    ),
  );
  commonOutput.textContent =
    common.length === 0
      ? 'Aucun facteur commun : ces nombres sont premiers entre eux, leur PGCD vaut 1.'
      : `Facteurs communs : ${formatFactors(common)} = ${formatInteger(result)}.`;

  // Le découpage, pour les deux premiers nombres.
  const key = `${a}:${b}`;
  divisor = pair;
  if (key !== tilingKey) {
    tiling = squareTiling(a, b);
    tilingKey = key;
    if (animateTiling) revealStart = performance.now();
  }
  const shown = tiling!.squares.length;
  const total = tiling!.total;
  caption.textContent =
    (total > shown
      ? `${formatInteger(total)} carrés en tout : seuls les ${formatInteger(shown)} premiers sont dessinés, les autres seraient invisibles. `
      : `${formatInteger(total)} carré${total > 1 ? 's' : ''}. `) +
    `Les plus petits ont ${formatInteger(pair)} de côté : c'est le PGCD de ${formatInteger(a)} et ${formatInteger(b)}.` +
    (values.length > 2 ? ' Le dessin ne montre que les deux premiers nombres.' : '');
  animate();

  announce(
    status,
    `PGCD de ${values.map((value) => formatInteger(value)).join(', ')} : ${formatInteger(result)}.`,
  );
}

function syncFields(): void {
  fields.forEach((field, index) => {
    field.hidden = index >= visibleFields;
  });
  addButton.disabled = visibleFields >= MAX_NUMBERS;
  removeButton.disabled = visibleFields <= 2;
}

inputs.forEach((input) => input.addEventListener('input', () => update(true)));

document.querySelectorAll<HTMLButtonElement>('[data-gcd-step]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = button.closest('.gcd-stepper')?.querySelector<HTMLInputElement>('.gcd-input');
    if (!input) return;
    const current = parseInteger(input.value) ?? 1;
    const next = Math.min(MAX_VALUE, Math.max(1, current + Number(button.dataset.gcdStep)));
    input.value = String(next);
    // Pas à pas, le dessin suit sans rejouer son apparition.
    update(false);
  });
});

addButton.addEventListener('click', () => {
  if (visibleFields >= MAX_NUMBERS) return;
  visibleFields++;
  syncFields();
  inputs[visibleFields - 1]!.focus();
});

removeButton.addEventListener('click', () => {
  if (visibleFields <= 2) return;
  inputs[visibleFields - 1]!.value = '';
  visibleFields--;
  syncFields();
  update(false);
});

replayButton.addEventListener('click', replay);

document.querySelectorAll<HTMLButtonElement>('[data-gcd-example]').forEach((button) => {
  button.addEventListener('click', () => {
    const values = (button.dataset.gcdExample ?? '').split(',');
    visibleFields = Math.max(2, values.length);
    inputs.forEach((input, index) => {
      input.value = values[index] ?? '';
    });
    syncFields();
    update(true);
  });
});

onThemeChange(() => {
  // Les couleurs glissent pendant une seconde : le dessin les suit.
  const until = performance.now() + 1100;
  const follow = (): void => {
    palette = readPalette();
    drawTiling(stage, performance.now());
    if (performance.now() < until) requestAnimationFrame(follow);
    else animate();
  };
  follow();
});

syncFields();
revealStart = performance.now();
update(true);
