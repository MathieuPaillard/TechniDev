// Démo « Population » : la scène, les courbes et les commandes. Le modèle est dans model.ts.
import { announce, byId, checkedValue } from '../../ui/dom';
import { startLoop } from '../../ui/loop';
import { createStage, type Stage } from '../../ui/stage';
import { mix, onThemeChange, prefersReducedMotion, readPalette, rgba, tubesOn, type Palette } from '../../ui/theme';
import {
  ADULT_AGE,
  census,
  createWorld,
  dropCouple,
  ORIGINAL_HEIGHT,
  ORIGINAL_WIDTH,
  seed2025,
  seededRandom,
  sow,
  tick,
  TICK_YEARS,
  type Random,
  type World,
} from './model';

/** Temps de calcul accordé au modèle par image, en millisecondes : au-delà, la simulation ralentit d'elle-même. */
const TICK_BUDGET_MS = 9;
/** Un point de courbe toutes les 50 pas (une demi-année). */
const SAMPLE_EVERY = 50;
const MAX_SAMPLES = 2_400;

interface Sample {
  years: number;
  people: number;
  plants: number;
}

const canvas = byId('population-canvas', HTMLCanvasElement);
const chartCanvas = byId('population-chart', HTMLCanvasElement);
const stageElement = byId('population-stage', HTMLDivElement);
const status = byId('population-status', HTMLParagraphElement);
const hint = byId('population-hint', HTMLParagraphElement);
const yearOutput = byId('population-year', HTMLElement);
const countOutput = byId('population-count', HTMLElement);
const couplesOutput = byId('population-couples', HTMLElement);
const plantsOutput = byId('population-plants', HTMLElement);
const legendPeople = byId('population-legend-people', HTMLElement);
const legendPlants = byId('population-legend-plants', HTMLElement);
const birthsOutput = byId('population-births', HTMLElement);
const deathsOutput = byId('population-deaths', HTMLElement);
const eatenOutput = byId('population-eaten', HTMLElement);
const speedInput = byId('population-speed', HTMLInputElement);
const speedOutput = byId('population-speed-value', HTMLElement);
const capInput = byId('population-cap', HTMLInputElement);
const capOutput = byId('population-cap-value', HTMLElement);
const overviewInput = byId('population-overview', HTMLInputElement);
const playButton = byId('population-play', HTMLButtonElement);
const resetButton = byId('population-reset', HTMLButtonElement);
const cutButton = byId('population-cut', HTMLButtonElement);

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

let palette: Palette = readPalette();
let paletteSettlesAt = 0;
let random: Random = seededRandom(Date.now());
let world: World = createWorld(ORIGINAL_WIDTH, ORIGINAL_HEIGHT);
let samples: Sample[] = [];
let ticks = 0;

/** Le monde garde les distances du programme d'origine ; sa taille suit celle de l'écran. */
function newWorld(stage: Stage): void {
  const scale = Math.min(1, Math.max(0.42, stage.width / 1000));
  const width = ORIGINAL_WIDTH * scale;
  const height = width * (stage.height / stage.width);
  random = seededRandom(Date.now());
  world = createWorld(width, height, Number(capInput.value));
  seed2025(world, random);
  samples = [];
  ticks = 0;
  record();
}

function record(): void {
  samples.push({ years: world.years, people: world.people.length, plants: world.plants.length });
  // Trop de points : on n'en garde qu'un sur deux, la courbe reste la même à l'œil.
  if (samples.length > MAX_SAMPLES) samples = samples.filter((_, index) => index % 2 === 0);
}

function simulate(): void {
  const wanted = Number(speedInput.value);
  const started = performance.now();
  for (let i = 0; i < wanted; i++) {
    tick(world, random);
    ticks++;
    if (ticks % SAMPLE_EVERY === 0) record();
    if (performance.now() - started > TICK_BUDGET_MS) break;
  }
}

// Cadrage : la vue suit la population (elle se regroupe autour des plantes, et le reste du monde est vide),
// ou montre le monde entier si le visiteur le demande.

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** La partie du monde affichée, en coordonnées du monde. */
const frame: Frame = { x: 0, y: 0, width: ORIGINAL_WIDTH, height: ORIGINAL_HEIGHT };

function targetFrame(stage: Stage): Frame {
  const aspect = stage.width / stage.height;
  let minX = 0;
  let minY = 0;
  let maxX = world.width;
  let maxY = world.height;
  const everyone = [...world.people, ...world.plants];
  if (!overviewInput.checked && everyone.length > 0) {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    for (const item of everyone) {
      if (item.x < minX) minX = item.x;
      if (item.x > maxX) maxX = item.x;
      if (item.y < minY) minY = item.y;
      if (item.y > maxY) maxY = item.y;
    }
    const margin = Math.max(70, 0.12 * Math.max(maxX - minX, maxY - minY));
    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;
  }
  // Même proportions que la scène, et jamais plus serré que 460 unités de large.
  let width = Math.max(460, maxX - minX);
  let height = Math.max(460 / aspect, maxY - minY);
  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;
  return { x: (minX + maxX) / 2 - width / 2, y: (minY + maxY) / 2 - height / 2, width, height };
}

function followFrame(stage: Stage, instantly = false): void {
  const target = targetFrame(stage);
  const k = instantly ? 1 : 0.05;
  frame.x += (target.x - frame.x) * k;
  frame.y += (target.y - frame.y) * k;
  frame.width += (target.width - frame.width) * k;
  frame.height += (target.height - frame.height) * k;
}

// Dessin de la scène

function view(stage: Stage): { zoom: number; left: number; top: number } {
  const zoom = stage.width / frame.width;
  return { zoom, left: -frame.x * zoom, top: -frame.y * zoom };
}

function drawWorld(stage: Stage): void {
  const { ctx } = stage;
  const lit = tubesOn();
  if (performance.now() < paletteSettlesAt) palette = readPalette();
  followFrame(stage);
  const { zoom, left, top } = view(stage);
  const scale = Math.max(0.95, zoom * 1.9);

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba(palette.wall);
  ctx.fillRect(0, 0, stage.width, stage.height);

  // Les bords du monde.
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(palette.glass, 0.8);
  ctx.strokeRect(left + 0.5, top + 0.5, world.width * zoom, world.height * zoom);

  // Les plantes : des triangles, comme dans le programme d'origine, qui grandissent avec l'âge.
  ctx.beginPath();
  for (const plant of world.plants) {
    const size = Math.min(7, 1.6 + plant.age / 12) * scale;
    const x = left + plant.x * zoom;
    const y = top + plant.y * zoom;
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.9, y + size * 0.7);
    ctx.lineTo(x - size * 0.9, y + size * 0.7);
    ctx.closePath();
  }
  ctx.fillStyle = rgba(lit ? palette.phosphor : palette.frost, lit ? 0.9 : 0.55);
  ctx.fill();

  // Les individus : le rayon suit l'âge. Femmes en clair, hommes en sombre.
  const women = lit ? mix(palette.tube, palette.core, 0.6) : palette.chalk;
  const men = lit ? palette.halo : palette.frost;
  for (const female of [false, true]) {
    if (lit) {
      // La lueur : le même point, plus large et très léger.
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      for (const person of world.people) {
        if (person.female !== female) continue;
        const radius = Math.min(5, Math.max(0.9, person.age / 15)) * scale * 2.6;
        const x = left + person.x * zoom;
        const y = top + person.y * zoom;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = rgba(female ? palette.tube : palette.halo, 0.16);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.beginPath();
    for (const person of world.people) {
      if (person.female !== female) continue;
      const radius = Math.min(5, Math.max(0.9, person.age / 15)) * scale;
      const x = left + person.x * zoom;
      const y = top + person.y * zoom;
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fillStyle = rgba(female ? women : men);
    ctx.fill();
  }

  if (world.people.length === 0) {
    ctx.fillStyle = rgba(palette.chalk);
    ctx.font = '600 16px "Atkinson Next", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Plus personne. Déposer un couple pour repartir.', stage.width / 2, stage.height / 2);
    ctx.textAlign = 'start';
  }
}

// Dessin des courbes

function drawChart(chart: Stage): void {
  const { ctx } = chart;
  const lit = tubesOn();
  ctx.clearRect(0, 0, chart.width, chart.height);
  if (samples.length < 2) return;

  const padLeft = 4;
  const padRight = 4;
  const padTop = 6;
  const padBottom = 18;
  const width = chart.width - padLeft - padRight;
  const height = chart.height - padTop - padBottom;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const span = Math.max(1, last.years - first.years);
  const peak = Math.max(10, ...samples.map((sample) => Math.max(sample.people, sample.plants)));
  const x = (years: number): number => padLeft + ((years - first.years) / span) * width;
  const y = (value: number): number => padTop + height - (value / peak) * height;

  // Repères : la ligne de base et le plus haut atteint.
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(palette.glass, 0.7);
  ctx.beginPath();
  ctx.moveTo(padLeft, y(0) + 0.5);
  ctx.lineTo(padLeft + width, y(0) + 0.5);
  ctx.moveTo(padLeft, y(peak) + 0.5);
  ctx.lineTo(padLeft + width, y(peak) + 0.5);
  ctx.stroke();

  ctx.font = '12px "Atkinson Mono", ui-monospace, monospace';
  ctx.fillStyle = rgba(palette.chalkSoft);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'start';
  ctx.fillText(`an ${integer.format(Math.floor(first.years))}`, padLeft, chart.height - 4);
  ctx.textAlign = 'end';
  ctx.fillText(`an ${integer.format(Math.floor(last.years))}`, padLeft + width, chart.height - 4);
  ctx.fillText(integer.format(peak), padLeft + width, padTop + 13);
  ctx.textAlign = 'start';

  const trace = (pick: (sample: Sample) => number): void => {
    ctx.beginPath();
    samples.forEach((sample, index) => {
      if (index === 0) ctx.moveTo(x(sample.years), y(pick(sample)));
      else ctx.lineTo(x(sample.years), y(pick(sample)));
    });
  };

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Les plantes en pointillé, la population en trait plein : la forme du trait les distingue, pas seulement la couleur.
  trace((sample) => sample.plants);
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(lit ? palette.phosphor : palette.frost);
  ctx.stroke();
  ctx.setLineDash([]);

  trace((sample) => sample.people);
  if (lit) {
    ctx.lineWidth = 7;
    ctx.strokeStyle = rgba(palette.halo, 0.28);
    ctx.stroke();
  }
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = rgba(lit ? mix(palette.tube, palette.core, 0.35) : palette.chalk);
  ctx.stroke();
}

let hudFrame = 0;

function updateHud(force = false): void {
  hudFrame++;
  if (!force && hudFrame % 10 !== 0) return;
  const counts = census(world);
  const people = counts.women + counts.men;
  yearOutput.textContent = integer.format(Math.floor(world.years));
  countOutput.textContent = integer.format(people);
  couplesOutput.textContent = integer.format(counts.couples);
  plantsOutput.textContent = integer.format(counts.plants);
  legendPeople.textContent = integer.format(people);
  legendPlants.textContent = integer.format(counts.plants);
  birthsOutput.textContent = integer.format(world.births);
  deathsOutput.textContent = integer.format(world.deaths);
  eatenOutput.textContent = integer.format(world.eatenPlants);
}

function summary(): string {
  const counts = census(world);
  return `An ${Math.floor(world.years)} : ${counts.women + counts.men} individus, dont ${counts.children} enfants, et ${counts.plants} plantes.`;
}

// La scène et les courbes se redessinent quand leur cadre change de taille ; la boucle n'existe qu'après elles.
const hooks = { redraw: (): void => {} };
const stage = createStage(canvas, () => hooks.redraw());
const chart = createStage(chartCanvas, () => hooks.redraw());

newWorld(stage);
followFrame(stage, true);

const loop = startLoop({
  element: stageElement,
  startPaused: prefersReducedMotion(),
  frame(dt) {
    if (dt > 0) simulate();
    drawWorld(stage);
    drawChart(chart);
    updateHud(dt === 0);
  },
});

hooks.redraw = () => loop.redraw();

// Semer ou déposer au pointeur

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const p = stage.pointer(event);
  const { zoom, left, top } = view(stage);
  const x = Math.min(world.width, Math.max(0, (p.x - left) / zoom));
  const y = Math.min(world.height, Math.max(0, (p.y - top) / zoom));
  if (checkedValue('population-tool') === 'couple') {
    dropCouple(world, random, x, y);
    announce(status, `Couple déposé. ${summary()}`);
  } else {
    sow(world, random, x, y);
    announce(status, `Plante semée. ${summary()}`);
  }
  hint.hidden = true;
  loop.redraw();
  updateHud(true);
});

// Commandes

function syncOutputs(): void {
  const years = Number(speedInput.value) * TICK_YEARS * 60;
  speedOutput.textContent = `${integer.format(Math.max(1, Math.round(years)))} ans par seconde`;
  capOutput.textContent = integer.format(Number(capInput.value));
}

function syncPlayButton(): void {
  playButton.textContent = loop.playing ? 'Pause' : 'Lancer';
  playButton.setAttribute('aria-pressed', String(!loop.playing));
}

function syncHint(): void {
  hint.textContent =
    checkedValue('population-tool') === 'couple' ? 'Cliquer pour déposer un couple.' : 'Cliquer pour semer une plante.';
}

speedInput.addEventListener('input', syncOutputs);

overviewInput.addEventListener('change', () => {
  // En pause, la vue rejoint son nouveau cadre en quelques images.
  if (loop.playing) return;
  let frames = 0;
  const settle = (): void => {
    loop.redraw();
    if (++frames < 90) requestAnimationFrame(settle);
  };
  settle();
});

capInput.addEventListener('input', () => {
  world.populationCap = Number(capInput.value);
  syncOutputs();
});

document.querySelectorAll<HTMLInputElement>('input[name="population-tool"]').forEach((input) => {
  input.addEventListener('change', syncHint);
});

playButton.addEventListener('click', () => {
  loop.toggle();
  syncPlayButton();
  updateHud(true);
  announce(status, loop.playing ? 'Simulation relancée.' : `En pause. ${summary()}`);
});

resetButton.addEventListener('click', () => {
  newWorld(stage);
  followFrame(stage, true);
  hint.hidden = false;
  syncHint();
  announce(status, `Nouveau départ : quatre couples de ${ADULT_AGE + 1} ans et quatre plantes.`);
  loop.redraw();
  updateHud(true);
});

cutButton.addEventListener('click', () => {
  for (const plant of world.plants) plant.alive = false;
  world.plants.length = 0;
  announce(status, `Toutes les plantes sont coupées. ${summary()}`);
  loop.redraw();
  updateHud(true);
});

onThemeChange(() => {
  paletteSettlesAt = performance.now() + 1100;
  palette = readPalette();
  if (!loop.playing) {
    const follow = (): void => {
      loop.redraw();
      if (performance.now() < paletteSettlesAt) requestAnimationFrame(follow);
    };
    follow();
  }
});

syncOutputs();
syncPlayButton();
syncHint();
if (prefersReducedMotion()) hint.textContent = 'Animation en pause : appuyer sur « Lancer » pour la démarrer.';
