// Démo « Gravité » : la scène, le pointeur et les commandes. La physique est dans physics.ts.
import { announce, byId, checkedValue } from '../../ui/dom';
import { createGlowSprite, drawGlow } from '../../ui/glow';
import { startLoop } from '../../ui/loop';
import { createStage, type Stage } from '../../ui/stage';
import { onThemeChange, prefersReducedMotion, readPalette, rgba, tubesOn, type Palette } from '../../ui/theme';
import {
  accelerationAt,
  advance,
  circularVelocity,
  createBody,
  DISTANCE_SCALE,
  dominantBody,
  ORIGINAL_G,
  preset,
  PRESET_LABELS,
  radiusOf,
  removeEscaped,
  type Body,
  type PresetName,
} from './physics';

const MAX_BODIES = 220;
/** Au-delà de cette distance au centre (en pixels du monde), un astre est perdu. */
const ESCAPE_LIMIT = 6_000;
/** Pas du programme d'origine joués par seconde quand la vitesse du temps vaut 1. */
const STEPS_PER_SECOND = 60;
/** Vitesse donnée par pixel de recul du lance-pierre. */
const SLING = 0.035;
const TRAIL_LENGTH = 150;
const TRAIL_BUCKETS = 5;
/** Côté d'une cellule du champ, en pixels CSS (davantage quand les astres sont nombreux). */
const FIELD_CELL = 4;
/** Nombre de lignes de niveau par décade d'intensité. */
const FIELD_BANDS = 4;

interface Trail {
  xs: Float32Array;
  ys: Float32Array;
  head: number;
  count: number;
  launched: boolean;
  /** L'astre a disparu : sa traînée raccourcit jusqu'à s'effacer. */
  orphan: boolean;
}

const canvas = byId('gravity-canvas', HTMLCanvasElement);
const stageElement = byId('gravity-stage', HTMLDivElement);
const status = byId('gravity-status', HTMLParagraphElement);
const hint = byId('gravity-hint', HTMLParagraphElement);
const countOutput = byId('gravity-count', HTMLElement);
const timeOutput = byId('gravity-time', HTMLElement);
const mergesOutput = byId('gravity-merges', HTMLElement);
const massInput = byId('gravity-mass', HTMLInputElement);
const massOutput = byId('gravity-mass-value', HTMLElement);
const speedInput = byId('gravity-speed', HTMLInputElement);
const speedOutput = byId('gravity-speed-value', HTMLElement);
const zoomInput = byId('gravity-zoom', HTMLInputElement);
const zoomOutput = byId('gravity-zoom-value', HTMLElement);
const fieldInput = byId('gravity-field', HTMLInputElement);
const trailsInput = byId('gravity-trails', HTMLInputElement);
const orbitInput = byId('gravity-orbit', HTMLInputElement);
const playButton = byId('gravity-play', HTMLButtonElement);
const stepButton = byId('gravity-step', HTMLButtonElement);
const randomButton = byId('gravity-random', HTMLButtonElement);
const clearButton = byId('gravity-clear', HTMLButtonElement);

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let bodies: Body[] = [];
let time = 0;
let merges = 0;
const trails = new Map<number, Trail>();

let palette: Palette = readPalette();
let nativeGlow = createGlowSprite(palette.core, palette.tube, palette.halo);
let launchedGlow = createGlowSprite(palette.core, palette.phosphor, palette.phosphor);
/** Après un changement de gaz, les couleurs glissent pendant une seconde : on les relit à chaque image. */
let paletteSettlesAt = 0;

let fieldCanvas: HTMLCanvasElement | null = null;
let fieldImage: ImageData | null = null;
let fieldLevels = new Float32Array(0);
let fieldFrame = 0;

/** Lancer en cours : point de départ (monde) et position du pointeur (monde). */
let aim: { x: number; y: number; toX: number; toY: number; pointerId: number } | null = null;

// Repère : l'origine du monde est au centre de la scène.

function zoom(stage: Stage): number {
  return Math.min(stage.width / 1000, stage.height / 800) * Number(zoomInput.value);
}

function toScreen(stage: Stage, x: number, y: number): { x: number; y: number } {
  const z = zoom(stage);
  return { x: stage.width / 2 + x * z, y: stage.height / 2 + y * z };
}

function toWorld(stage: Stage, x: number, y: number): { x: number; y: number } {
  const z = zoom(stage);
  return { x: (x - stage.width / 2) / z, y: (y - stage.height / 2) / z };
}

/** La masse suit le curseur sur une échelle logarithmique : de 10 à 100 000. */
function chosenMass(): number {
  const exponent = 1 + (Number(massInput.value) / 100) * 4;
  const mass = 10 ** exponent;
  const magnitude = 10 ** Math.floor(Math.log10(mass));
  return Math.round(mass / (magnitude / 10)) * (magnitude / 10);
}

function refreshPalette(): void {
  palette = readPalette();
  nativeGlow = createGlowSprite(palette.core, palette.tube, palette.halo);
  launchedGlow = createGlowSprite(palette.core, palette.phosphor, palette.phosphor);
}

function loadPreset(name: PresetName): void {
  bodies = preset(name);
  trails.clear();
  time = 0;
  merges = 0;
  aim = null;
  announce(status, `Scénario : ${PRESET_LABELS[name]}. ${bodies.length} astres.`);
}

function addBody(body: Body): boolean {
  if (bodies.length >= MAX_BODIES) {
    announce(status, `La scène est pleine : ${MAX_BODIES} astres au plus.`);
    return false;
  }
  bodies.push(body);
  return true;
}

function recordTrails(): void {
  const alive = new Set<number>();
  for (const body of bodies) {
    alive.add(body.id);
    let trail = trails.get(body.id);
    if (!trail) {
      trail = {
        xs: new Float32Array(TRAIL_LENGTH),
        ys: new Float32Array(TRAIL_LENGTH),
        head: 0,
        count: 0,
        launched: body.launched,
        orphan: false,
      };
      trails.set(body.id, trail);
    }
    trail.xs[trail.head] = body.x;
    trail.ys[trail.head] = body.y;
    trail.head = (trail.head + 1) % TRAIL_LENGTH;
    trail.count = Math.min(TRAIL_LENGTH, trail.count + 1);
  }
  for (const [id, trail] of trails) {
    if (alive.has(id)) continue;
    trail.orphan = true;
    trail.count -= 5;
    if (trail.count <= 1) trails.delete(id);
  }
}

function simulate(dtSeconds: number): void {
  const steps = dtSeconds * STEPS_PER_SECOND * Number(speedInput.value);
  merges += advance(bodies, steps);
  removeEscaped(bodies, ESCAPE_LIMIT);
  time += steps;
  if (trailsInput.checked) recordTrails();
  else trails.clear();
}

// Dessin

/** Taille des cellules du champ : elle grossit quand le calcul coûte trop cher sur cet appareil, et revient ensuite. */
let fieldCell = FIELD_CELL;
/** Temps moyen du calcul du champ, en millisecondes (moyenne glissante). */
let fieldCost = 0;

function drawField(stage: Stage): void {
  // Au-delà de 7 ms par image, les cellules grossissent ; sous 2,5 ms, elles s'affinent de nouveau.
  if (fieldCost > 7 && fieldCell < 10) {
    fieldCell += 2;
    fieldCost = 3.5;
  } else if (fieldCost < 2.5 && fieldCost > 0 && fieldCell > FIELD_CELL) {
    fieldCell -= 2;
    fieldCost = 4;
  }
  const cell = fieldCell;
  const started = performance.now();
  const cols = Math.ceil(stage.width / cell);
  const rows = Math.ceil(stage.height / cell);
  if (!fieldCanvas || fieldCanvas.width !== cols || fieldCanvas.height !== rows) {
    fieldCanvas = document.createElement('canvas');
    fieldCanvas.width = cols;
    fieldCanvas.height = rows;
    fieldImage = null;
    fieldLevels = new Float32Array(cols * rows);
  }
  const fieldCtx = fieldCanvas.getContext('2d');
  if (!fieldCtx) return;
  fieldImage ??= fieldCtx.createImageData(cols, rows);

  // Avec beaucoup d'astres, le champ n'est recalculé qu'une image sur deux.
  fieldFrame++;
  if (bodies.length <= 45 || fieldFrame % 2 === 0) {
    const z = zoom(stage);
    const count = bodies.length;
    // Les astres, en coordonnées de cellule : la distance au carré se calcule sans conversion.
    const bx = new Float64Array(count);
    const by = new Float64Array(count);
    const bm = new Float64Array(count);
    // G·m / d², d en unités d'origine : d = distance en cellules × (cellule / zoom) × 10.
    const unit = (cell / z) * DISTANCE_SCALE;
    const factor = ORIGINAL_G / (unit * unit);
    for (let i = 0; i < count; i++) {
      const body = bodies[i]!;
      bx[i] = (stage.width / 2 + body.x * z) / cell;
      by[i] = (stage.height / 2 + body.y * z) / cell;
      bm[i] = body.mass * factor;
    }

    // Premier passage : l'intensité du champ dans chaque cellule, sur une échelle logarithmique (elle varie
    // de un à un million entre le large et la surface d'un astre), comptée en lignes de niveau.
    const levels = fieldLevels;
    let offset = 0;
    for (let row = 0; row < rows; row++) {
      const cy = row + 0.5;
      for (let col = 0; col < cols; col++) {
        const cx = col + 0.5;
        let strength = 0;
        for (let i = 0; i < count; i++) {
          const dx = bx[i]! - cx;
          const dy = by[i]! - cy;
          strength += bm[i]! / (dx * dx + dy * dy + 0.05);
        }
        levels[offset++] = Math.log10(1 + strength * 40) * FIELD_BANDS;
      }
    }

    // Second passage : une ligne là où l'intensité franchit un niveau. La pente locale donne la distance à la
    // ligne en cellules : le trait garde la même épaisseur partout, et s'efface là où les lignes se touchent.
    const data = fieldImage.data;
    const [hr, hg, hb] = palette.halo;
    const [tr, tg, tb] = palette.tube;
    offset = 0;
    for (let row = 0; row < rows; row++) {
      const up = row > 0 ? -cols : 0;
      const down = row < rows - 1 ? cols : 0;
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const scaled = levels[index]!;
        const left = col > 0 ? -1 : 0;
        const right = col < cols - 1 ? 1 : 0;
        const gx = (levels[index + right]! - levels[index + left]!) / (right - left || 1);
        const gy = (levels[index + down]! - levels[index + up]!) / ((down - up) / cols || 1);
        const slope = Math.hypot(gx, gy);
        const frac = scaled - Math.floor(scaled);
        const toLine = Math.min(frac, 1 - frac) / Math.max(slope, 1e-4);
        let line = toLine < 1 ? 1 - toLine : 0;
        if (slope > 0.4) line *= Math.max(0, 1 - (slope - 0.4) / 0.35);
        const level = scaled / FIELD_BANDS;
        const wash = Math.min(1, level / 5) * 0.36;
        const ink = line * (0.3 + 0.7 * Math.min(1, level / 2.5)) * 0.7;
        data[offset] = hr * wash + tr * ink;
        data[offset + 1] = hg * wash + tg * ink;
        data[offset + 2] = hb * wash + tb * ink;
        data[offset + 3] = 255;
        offset += 4;
      }
    }
    fieldCtx.putImageData(fieldImage, 0, 0);
    const spent = performance.now() - started;
    fieldCost = fieldCost === 0 ? spent : fieldCost * 0.9 + spent * 0.1;
  }
  stage.ctx.imageSmoothingEnabled = true;
  stage.ctx.imageSmoothingQuality = 'high';
  stage.ctx.drawImage(fieldCanvas, 0, 0, cols * cell, rows * cell);
}

function drawTrails(stage: Stage, lit: boolean): void {
  const { ctx } = stage;
  const z = zoom(stage);
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const launched of [false, true]) {
    const color = lit ? (launched ? palette.phosphor : palette.tube) : palette.frost;
    for (let bucket = 0; bucket < TRAIL_BUCKETS; bucket++) {
      ctx.beginPath();
      let drawn = false;
      for (const trail of trails.values()) {
        if (trail.launched !== launched || trail.count < 2) continue;
        // Du plus récent (âge 0) au plus ancien.
        const from = Math.floor((bucket * TRAIL_LENGTH) / TRAIL_BUCKETS);
        const to = Math.min(trail.count - 1, Math.floor(((bucket + 1) * TRAIL_LENGTH) / TRAIL_BUCKETS));
        if (from >= trail.count - 1) continue;
        for (let age = from; age <= to; age++) {
          const index = (trail.head - 1 - age + TRAIL_LENGTH * 2) % TRAIL_LENGTH;
          const x = cx + trail.xs[index]! * z;
          const y = cy + trail.ys[index]! * z;
          if (age === from) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        drawn = true;
      }
      if (!drawn) continue;
      ctx.strokeStyle = rgba(color, (1 - bucket / TRAIL_BUCKETS) * (lit ? 0.75 : 0.5));
      ctx.stroke();
    }
  }
}

function drawBodies(stage: Stage, lit: boolean): void {
  const { ctx } = stage;
  const z = zoom(stage);
  if (lit) {
    ctx.globalCompositeOperation = 'lighter';
    for (const body of bodies) {
      const p = toScreen(stage, body.x, body.y);
      drawGlow(ctx, body.launched ? launchedGlow : nativeGlow, p.x, p.y, Math.max(7, body.radius * z * 3.4));
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const body of bodies) {
    const p = toScreen(stage, body.x, body.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.3, body.radius * z), 0, Math.PI * 2);
    ctx.fillStyle = lit ? rgba(palette.core) : rgba(body.launched ? palette.chalk : palette.frost);
    ctx.fill();
  }
}

/** Le lancer en cours : l'élastique du lance-pierre, l'astre à venir et sa trajectoire prévue. */
function drawAim(stage: Stage): void {
  if (!aim) return;
  const { ctx } = stage;
  const z = zoom(stage);
  const mass = chosenMass();
  const start = toScreen(stage, aim.x, aim.y);
  const pull = toScreen(stage, aim.toX, aim.toY);
  const velocity = launchVelocity();

  // Trajectoire prévue : l'astre seul avance, les autres sont figés (une estimation, pas une promesse).
  const ghost = createBody(mass, aim.x, aim.y, velocity.vx, velocity.vy, true);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < 260; i++) {
    const { ax, ay } = accelerationAt(ghost.x, ghost.y, bodies);
    ghost.vx += ax;
    ghost.vy += ay;
    ghost.x += ghost.vx;
    ghost.y += ghost.vy;
    const p = toScreen(stage, ghost.x, ghost.y);
    ctx.lineTo(p.x, p.y);
    if (bodies.some((body) => Math.hypot(body.x - ghost.x, body.y - ghost.y) < body.radius + ghost.radius)) break;
  }
  ctx.setLineDash([2, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(palette.phosphor, 0.85);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(pull.x, pull.y);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(palette.chalkSoft, 0.7);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(start.x, start.y, Math.max(2, radiusOf(mass) * z), 0, Math.PI * 2);
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
  if (fieldInput.checked && lit && bodies.length > 0) drawField(stage);

  ctx.globalCompositeOperation = lit ? 'lighter' : 'source-over';
  if (trailsInput.checked) drawTrails(stage, lit);
  ctx.globalCompositeOperation = 'source-over';
  drawBodies(stage, lit);
  drawAim(stage);
}

let hudFrame = 0;

function updateHud(force = false): void {
  hudFrame++;
  if (!force && hudFrame % 12 !== 0) return;
  countOutput.textContent = integer.format(bodies.length);
  timeOutput.textContent = integer.format(Math.floor(time));
  mergesOutput.textContent = integer.format(merges);
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

// Lancer un astre au pointeur

function launchVelocity(): { vx: number; vy: number } {
  if (!aim) return { vx: 0, vy: 0 };
  const dx = aim.x - aim.toX;
  const dy = aim.y - aim.toY;
  const dragged = Math.hypot(dx, dy) * zoom(stage) > 8;
  if (dragged) return { vx: dx * SLING, vy: dy * SLING };
  if (orbitInput.checked) {
    const center = dominantBody(aim.x, aim.y, bodies);
    if (center) return circularVelocity(aim.x, aim.y, center);
  }
  return { vx: 0, vy: 0 };
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const p = stage.pointer(event);
  const world = toWorld(stage, p.x, p.y);
  aim = { x: world.x, y: world.y, toX: world.x, toY: world.y, pointerId: event.pointerId };
  canvas.setPointerCapture(event.pointerId);
  hint.hidden = true;
  loop.redraw();
});

canvas.addEventListener('pointermove', (event) => {
  if (!aim || event.pointerId !== aim.pointerId) return;
  const p = stage.pointer(event);
  const world = toWorld(stage, p.x, p.y);
  aim.toX = world.x;
  aim.toY = world.y;
  loop.redraw();
});

function release(event: PointerEvent, cancelled: boolean): void {
  if (!aim || event.pointerId !== aim.pointerId) return;
  if (!cancelled) {
    const velocity = launchVelocity();
    const mass = chosenMass();
    if (addBody(createBody(mass, aim.x, aim.y, velocity.vx, velocity.vy, true))) {
      announce(status, `Astre de masse ${integer.format(mass)} lâché. ${bodies.length} astres.`);
    }
  }
  aim = null;
  loop.redraw();
  updateHud(true);
}

canvas.addEventListener('pointerup', (event) => release(event, false));
canvas.addEventListener('pointercancel', (event) => release(event, true));

// Commandes

function syncOutputs(): void {
  massOutput.textContent = integer.format(chosenMass());
  speedOutput.textContent = `× ${decimal.format(Number(speedInput.value))}`;
  zoomOutput.textContent = `× ${decimal.format(Number(zoomInput.value))}`;
}

function syncPlayButton(): void {
  playButton.textContent = loop.playing ? 'Pause' : 'Lancer';
  playButton.setAttribute('aria-pressed', String(!loop.playing));
  stepButton.disabled = loop.playing;
}

for (const input of [massInput, speedInput, zoomInput]) {
  input.addEventListener('input', () => {
    syncOutputs();
    loop.redraw();
  });
}

for (const input of [fieldInput, trailsInput]) {
  input.addEventListener('change', () => loop.redraw());
}

document.querySelectorAll<HTMLInputElement>('input[name="gravity-preset"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    loadPreset(input.value as PresetName);
    loop.redraw();
    updateHud(true);
  });
});

playButton.addEventListener('click', () => {
  loop.toggle();
  syncPlayButton();
  updateHud(true);
});

stepButton.addEventListener('click', () => {
  simulate(1 / STEPS_PER_SECOND / Number(speedInput.value));
  loop.redraw();
  updateHud(true);
});

randomButton.addEventListener('click', () => {
  const distance = 130 + Math.random() * 260;
  const angle = Math.random() * Math.PI * 2;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  const center = dominantBody(x, y, bodies);
  const velocity = center ? circularVelocity(x, y, center) : { vx: 0, vy: 0 };
  const mass = chosenMass();
  if (addBody(createBody(mass, x, y, velocity.vx, velocity.vy, true))) {
    announce(status, `Astre de masse ${integer.format(mass)} lâché au hasard. ${bodies.length} astres.`);
  }
  loop.redraw();
  updateHud(true);
});

clearButton.addEventListener('click', () => {
  bodies = [];
  trails.clear();
  merges = 0;
  time = 0;
  announce(status, 'Scène vidée.');
  loop.redraw();
  updateHud(true);
});

onThemeChange(() => {
  paletteSettlesAt = performance.now() + 1100;
  refreshPalette();
  // En pause, rien ne redessine : on suit le glissement des couleurs à la main.
  if (!loop.playing) {
    const follow = (): void => {
      loop.redraw();
      if (performance.now() < paletteSettlesAt) requestAnimationFrame(follow);
    };
    follow();
  }
});

loadPreset((checkedValue('gravity-preset') as PresetName | null) ?? 'original');
syncOutputs();
syncPlayButton();
if (prefersReducedMotion()) hint.textContent = 'Animation en pause : appuyer sur « Lancer » pour la démarrer.';
