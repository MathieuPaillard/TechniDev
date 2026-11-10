// Démo « Ondes » : la scène, le pointeur et les commandes. La physique est dans physics.ts.
import { refreshRanges } from '../../ui/controls';
import { announce, byId, checkedValue } from '../../ui/dom';
import { createGlowSprite, drawGlow } from '../../ui/glow';
import { startLoop } from '../../ui/loop';
import { createStage, type Stage } from '../../ui/stage';
import { mix, onThemeChange, prefersReducedMotion, readPalette, rgba, tubesOn, type Palette } from '../../ui/theme';
import {
  advance,
  createSource,
  createWorld,
  DEFAULT_PARAMS,
  machAngle,
  machNumber,
  ORIGINAL_G,
  preset,
  PRESET_LABELS,
  removeEscaped,
  ringStrength,
  sourceRadius,
  type PresetName,
  type Ring,
  type Source,
  type WaveParams,
  type WaveWorld,
} from './physics';

const MAX_SOURCES = 40;
const ESCAPE_LIMIT = 4_000;
/** Vitesse donnée par pixel de recul, en px/s. */
const SLING = 1.6;
/** Demi-étendue du monde visible, selon le scénario. */
const SPANS: Record<PresetName, { x: number; y: number }> = {
  pair: { x: 430, y: 280 },
  doppler: { x: 430, y: 280 },
  mach: { x: 430, y: 280 },
  ballet: { x: 1180, y: 700 },
  empty: { x: 430, y: 280 },
};

const canvas = byId('waves-canvas', HTMLCanvasElement);
const stageElement = byId('waves-stage', HTMLDivElement);
const status = byId('waves-status', HTMLParagraphElement);
const hint = byId('waves-hint', HTMLParagraphElement);
const countOutput = byId('waves-count', HTMLElement);
const ringsOutput = byId('waves-rings', HTMLElement);
const machOutput = byId('waves-mach', HTMLElement);
const sourceSpeedInput = byId('waves-source-speed', HTMLInputElement);
const sourceSpeedOutput = byId('waves-source-speed-value', HTMLElement);
const speedInput = byId('waves-speed', HTMLInputElement);
const speedOutput = byId('waves-speed-value', HTMLElement);
const periodInput = byId('waves-period', HTMLInputElement);
const periodOutput = byId('waves-period-value', HTMLElement);
const massInput = byId('waves-mass', HTMLInputElement);
const massOutput = byId('waves-mass-value', HTMLElement);
const gravityInput = byId('waves-gravity', HTMLInputElement);
const playButton = byId('waves-play', HTMLButtonElement);
const clearButton = byId('waves-clear', HTMLButtonElement);

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let world: WaveWorld = createWorld();
let params: WaveParams = { ...DEFAULT_PARAMS };
let presetName: PresetName = 'pair';

let palette: Palette = readPalette();
let nativeGlow = createGlowSprite(palette.core, palette.tube, palette.halo);
let launchedGlow = createGlowSprite(palette.core, palette.phosphor, palette.phosphor);
let paletteSettlesAt = 0;

let fieldCanvas: HTMLCanvasElement | null = null;
let fieldImage: ImageData | null = null;

let aim: { x: number; y: number; toX: number; toY: number; pointerId: number } | null = null;

function zoom(stage: Stage): number {
  const span = SPANS[presetName];
  return Math.min(stage.width / (2 * span.x), stage.height / (2 * span.y));
}

function toScreen(stage: Stage, x: number, y: number): { x: number; y: number } {
  const z = zoom(stage);
  return { x: stage.width / 2 + x * z, y: stage.height / 2 + y * z };
}

function toWorld(stage: Stage, x: number, y: number): { x: number; y: number } {
  const z = zoom(stage);
  return { x: (x - stage.width / 2) / z, y: (y - stage.height / 2) / z };
}

/** La masse suit le curseur sur une échelle logarithmique : de 1 à 100 000. */
function chosenMass(): number {
  const mass = 10 ** ((Number(massInput.value) / 100) * 5);
  const magnitude = 10 ** Math.floor(Math.log10(mass));
  return Math.max(1, Math.round(mass / (magnitude / 10)) * (magnitude / 10));
}

function refreshPalette(): void {
  palette = readPalette();
  nativeGlow = createGlowSprite(palette.core, palette.tube, palette.halo);
  launchedGlow = createGlowSprite(palette.core, palette.phosphor, palette.phosphor);
}

/** Le curseur « vitesse de la source » ne pilote que les scénarios en boîte (Doppler, mur du son). */
function steerable(): boolean {
  return params.bounds !== null;
}

function applySourceSpeed(): void {
  if (!steerable()) return;
  const speed = Number(sourceSpeedInput.value) * params.waveSpeed;
  for (const source of world.sources) {
    if (source.launched) continue;
    const current = Math.hypot(source.vx, source.vy);
    // Une source arrêtée repart vers la droite.
    const ux = current > 1e-9 ? source.vx / current : 1;
    const uy = current > 1e-9 ? source.vy / current : 0;
    source.vx = ux * speed;
    source.vy = uy * speed;
  }
}

function syncOutputs(): void {
  sourceSpeedOutput.textContent = steerable() ? `Mach ${twoDecimals.format(Number(sourceSpeedInput.value))}` : 'libre';
  speedOutput.textContent = `${integer.format(Number(speedInput.value))} px/s`;
  periodOutput.textContent = `${twoDecimals.format(Number(periodInput.value))} s`;
  massOutput.textContent = integer.format(chosenMass());
  sourceSpeedInput.disabled = !steerable();
}

function loadPreset(name: PresetName): void {
  const loaded = preset(name);
  presetName = name;
  world = createWorld(loaded.sources);
  params = loaded.params;
  aim = null;
  // Les commandes reprennent les réglages du scénario.
  speedInput.value = String(params.waveSpeed);
  periodInput.value = String(params.period);
  gravityInput.checked = params.gravity;
  const first = world.sources[0];
  if (steerable() && first) sourceSpeedInput.value = String(machNumber(first, params.waveSpeed).toFixed(2));
  refreshRanges();
  syncOutputs();
  announce(status, `Scénario : ${PRESET_LABELS[name]}. ${world.sources.length} sources.`);
}

function simulate(dt: number): void {
  advance(world, dt, params);
  if (!params.bounds) removeEscaped(world, ESCAPE_LIMIT);
}

// Dessin

/** Les fronts sont rangés par éclat : un seul tracé par tranche, au lieu d'un par front. */
const RING_BUCKETS = 8;

function drawRings(stage: Stage, lit: boolean): void {
  const { ctx } = stage;
  const z = zoom(stage);
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  const groups: Ring[][][] = [[], []];
  for (const ring of world.rings) {
    const strength = ringStrength(ring.radius, params.maxRadius);
    if (strength <= 0.01 || ring.radius * z < 0.5) continue;
    const bucket = Math.min(RING_BUCKETS - 1, Math.floor(strength * RING_BUCKETS));
    const group = groups[ring.launched ? 1 : 0]!;
    (group[bucket] ??= []).push(ring);
  }

  ctx.globalCompositeOperation = lit ? 'lighter' : 'source-over';
  for (const launched of [false, true]) {
    const group = groups[launched ? 1 : 0]!;
    const color = lit ? (launched ? palette.phosphor : palette.tube) : palette.frost;
    for (let bucket = 0; bucket < RING_BUCKETS; bucket++) {
      const rings = group[bucket];
      if (!rings || rings.length === 0) continue;
      const strength = (bucket + 0.5) / RING_BUCKETS;
      ctx.beginPath();
      for (const ring of rings) {
        const x = cx + ring.x * z;
        const y = cy + ring.y * z;
        const radius = ring.radius * z;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      if (lit && strength > 0.3) {
        // Le halo, large et discret, sous le cœur du tube.
        ctx.lineWidth = 6;
        ctx.strokeStyle = rgba(launched ? palette.phosphor : palette.halo, strength * 0.2);
        ctx.stroke();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(lit ? mix(color, palette.core, strength * 0.5) : color, strength * (lit ? 0.9 : 0.6));
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawField(stage: Stage): void {
  const cell = world.sources.length > 6 ? 6 : 4;
  const cols = Math.ceil(stage.width / cell);
  const rows = Math.ceil(stage.height / cell);
  if (!fieldCanvas || fieldCanvas.width !== cols || fieldCanvas.height !== rows) {
    fieldCanvas = document.createElement('canvas');
    fieldCanvas.width = cols;
    fieldCanvas.height = rows;
    fieldImage = null;
  }
  const fieldCtx = fieldCanvas.getContext('2d');
  if (!fieldCtx) return;
  fieldImage ??= fieldCtx.createImageData(cols, rows);

  const z = zoom(stage);
  const sources = world.sources;
  const count = sources.length;
  const wavelength = params.waveSpeed * params.period;
  // Les sources, en coordonnées de cellule ; la phase à la source et la portée, en cellules.
  const sx = new Float64Array(count);
  const sy = new Float64Array(count);
  const phase = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const source = sources[i]!;
    sx[i] = (stage.width / 2 + source.x * z) / cell;
    sy[i] = (stage.height / 2 + source.y * z) / cell;
    phase[i] = (source.clock / params.period) * Math.PI * 2;
  }
  const perCell = ((cell / z) / wavelength) * Math.PI * 2;
  const reach = (params.maxRadius * z) / cell;
  const normal = 1 / Math.max(1, Math.min(count, 3));

  const data = fieldImage.data;
  const [wr, wg, wb] = palette.wall;
  const [hr, hg, hb] = palette.halo;
  const [tr, tg, tb] = palette.tube;
  const [cr, cg, cb] = palette.core;
  let offset = 0;
  for (let row = 0; row < rows; row++) {
    const y = row + 0.5;
    for (let col = 0; col < cols; col++) {
      const x = col + 0.5;
      let total = 0;
      for (let i = 0; i < count; i++) {
        const dx = x - sx[i]!;
        const dy = y - sy[i]!;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > reach) continue;
        total += Math.cos(d * perCell - phase[i]!) * (1 - d / reach);
      }
      // Crête : vers la couleur du tube puis son cœur ; creux : le mur. Entre les deux, le halo.
      const height = Math.max(-1, Math.min(1, total * normal));
      const up = height > 0 ? height : 0;
      const glow = up * up;
      const hot = up > 0.82 ? (up - 0.82) / 0.18 : 0;
      const dim = 0.1 + 0.1 * height;
      data[offset] = wr + (hr - wr) * dim + (tr - wr) * glow * 0.85 + (cr - tr) * hot * 0.7;
      data[offset + 1] = wg + (hg - wg) * dim + (tg - wg) * glow * 0.85 + (cg - tg) * hot * 0.7;
      data[offset + 2] = wb + (hb - wb) * dim + (tb - wb) * glow * 0.85 + (cb - tb) * hot * 0.7;
      data[offset + 3] = 255;
      offset += 4;
    }
  }
  fieldCtx.putImageData(fieldImage, 0, 0);
  stage.ctx.imageSmoothingEnabled = true;
  stage.ctx.imageSmoothingQuality = 'high';
  stage.ctx.drawImage(fieldCanvas, 0, 0, cols * cell, rows * cell);
}

/** Le cône de Mach prévu par le calcul, en pointillés derrière une source plus rapide que son onde. */
function drawMachCone(stage: Stage, source: Source): void {
  const angle = machAngle(machNumber(source, params.waveSpeed));
  if (angle === null) return;
  const { ctx } = stage;
  const p = toScreen(stage, source.x, source.y);
  const heading = Math.atan2(source.vy, source.vx) + Math.PI;
  const length = Math.max(stage.width, stage.height);
  const half = (angle * Math.PI) / 180;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(heading + side * half) * length, p.y + Math.sin(heading + side * half) * length);
  }
  ctx.setLineDash([3, 8]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(palette.phosphor, 0.75);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSources(stage: Stage, lit: boolean): void {
  const { ctx } = stage;
  const z = zoom(stage);
  if (lit) {
    ctx.globalCompositeOperation = 'lighter';
    for (const source of world.sources) {
      const p = toScreen(stage, source.x, source.y);
      drawGlow(ctx, source.launched ? launchedGlow : nativeGlow, p.x, p.y, Math.max(9, source.radius * z * 3.2));
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const source of world.sources) {
    const p = toScreen(stage, source.x, source.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, source.radius * z), 0, Math.PI * 2);
    ctx.fillStyle = lit ? rgba(palette.core) : rgba(source.launched ? palette.chalk : palette.frost);
    ctx.fill();
  }
}

function drawAim(stage: Stage): void {
  if (!aim) return;
  const { ctx } = stage;
  const start = toScreen(stage, aim.x, aim.y);
  const pull = toScreen(stage, aim.toX, aim.toY);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(pull.x, pull.y);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(palette.chalkSoft, 0.7);
  ctx.stroke();
  // La flèche du lancer : à l'opposé du recul.
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(start.x * 2 - pull.x, start.y * 2 - pull.y);
  ctx.setLineDash([2, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(palette.phosphor, 0.85);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(start.x, start.y, Math.max(3, sourceRadius(chosenMass()) * zoom(stage)), 0, Math.PI * 2);
  ctx.fillStyle = rgba(palette.phosphor);
  ctx.fill();
}

function draw(stage: Stage): void {
  const { ctx } = stage;
  const lit = tubesOn();
  if (performance.now() < paletteSettlesAt) refreshPalette();

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba(palette.wall);
  ctx.fillRect(0, 0, stage.width, stage.height);

  if (checkedValue('waves-view') === 'field' && world.sources.length > 0) drawField(stage);
  else drawRings(stage, lit);

  if (steerable()) {
    for (const source of world.sources) drawMachCone(stage, source);
  }
  drawSources(stage, lit);
  drawAim(stage);
}

let hudFrame = 0;

function updateHud(force = false): void {
  hudFrame++;
  if (!force && hudFrame % 12 !== 0) return;
  countOutput.textContent = integer.format(world.sources.length);
  ringsOutput.textContent = integer.format(world.rings.length);
  const mach = world.sources.reduce((max, source) => Math.max(max, machNumber(source, params.waveSpeed)), 0);
  machOutput.textContent = oneDecimal.format(mach);
}

// La scène se redessine quand son cadre change de taille ; la boucle n'existe qu'après la scène.
const hooks = { redraw: (): void => {} };
const stage = createStage(canvas, () => hooks.redraw());

const loop = startLoop({
  element: stageElement,
  startPaused: prefersReducedMotion(),
  frame(dt) {
    if (dt > 0) simulate(dt);
    draw(stage);
    updateHud(dt === 0);
  },
});

hooks.redraw = () => loop.redraw();

// Poser ou lancer une source au pointeur

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const p = stage.pointer(event);
  const point = toWorld(stage, p.x, p.y);
  aim = { x: point.x, y: point.y, toX: point.x, toY: point.y, pointerId: event.pointerId };
  canvas.setPointerCapture(event.pointerId);
  hint.hidden = true;
  loop.redraw();
});

canvas.addEventListener('pointermove', (event) => {
  if (!aim || event.pointerId !== aim.pointerId) return;
  const p = stage.pointer(event);
  const point = toWorld(stage, p.x, p.y);
  aim.toX = point.x;
  aim.toY = point.y;
  loop.redraw();
});

function release(event: PointerEvent, cancelled: boolean): void {
  if (!aim || event.pointerId !== aim.pointerId) return;
  if (!cancelled) {
    if (world.sources.length >= MAX_SOURCES) {
      announce(status, `La scène est pleine : ${MAX_SOURCES} sources au plus.`);
    } else {
      const dx = aim.x - aim.toX;
      const dy = aim.y - aim.toY;
      const dragged = Math.hypot(dx, dy) * zoom(stage) > 8;
      const mass = chosenMass();
      world.sources.push(createSource(mass, aim.x, aim.y, dragged ? dx * SLING : 0, dragged ? dy * SLING : 0, true));
      announce(status, `Source posée. ${world.sources.length} sources.`);
    }
  }
  aim = null;
  loop.redraw();
  updateHud(true);
}

canvas.addEventListener('pointerup', (event) => release(event, false));
canvas.addEventListener('pointercancel', (event) => release(event, true));

// Commandes

function syncPlayButton(): void {
  playButton.textContent = loop.playing ? 'Pause' : 'Lancer';
  playButton.setAttribute('aria-pressed', String(!loop.playing));
}

sourceSpeedInput.addEventListener('input', () => {
  applySourceSpeed();
  syncOutputs();
  loop.redraw();
});

speedInput.addEventListener('input', () => {
  params.waveSpeed = Number(speedInput.value);
  // Le nombre de Mach affiché reste celui du curseur : la source suit la nouvelle vitesse de l'onde.
  applySourceSpeed();
  syncOutputs();
  loop.redraw();
});

periodInput.addEventListener('input', () => {
  params.period = Number(periodInput.value);
  syncOutputs();
  loop.redraw();
});

massInput.addEventListener('input', syncOutputs);

gravityInput.addEventListener('change', () => {
  params.gravity = gravityInput.checked;
});

document.querySelectorAll<HTMLInputElement>('input[name="waves-preset"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    loadPreset(input.value as PresetName);
    loop.redraw();
    updateHud(true);
  });
});

document.querySelectorAll<HTMLInputElement>('input[name="waves-view"]').forEach((input) => {
  input.addEventListener('change', () => loop.redraw());
});

playButton.addEventListener('click', () => {
  loop.toggle();
  syncPlayButton();
  updateHud(true);
});

clearButton.addEventListener('click', () => {
  world = createWorld();
  announce(status, 'Scène vidée.');
  loop.redraw();
  updateHud(true);
});

onThemeChange(() => {
  paletteSettlesAt = performance.now() + 1100;
  refreshPalette();
  if (!loop.playing) {
    const follow = (): void => {
      loop.redraw();
      if (performance.now() < paletteSettlesAt) requestAnimationFrame(follow);
    };
    follow();
  }
});

// La gravité d'origine vaut G = 10 : rappelée ici pour que la constante reste visible depuis la démo.
void ORIGINAL_G;

loadPreset((checkedValue('waves-preset') as PresetName | null) ?? 'pair');
syncPlayButton();
if (prefersReducedMotion()) hint.textContent = 'Animation en pause : appuyer sur « Lancer » pour la démarrer.';
