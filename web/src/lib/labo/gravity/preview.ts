// La gravité en petit, sur la page d'accueil : le système de 2020 tourne, chaque clic y met un astre en orbite.
// Version allégée de la démo (pas de champ, pas de commandes) : la physique est la même.
import { createGlowSprite, drawGlow } from '../../ui/glow';
import { startLoop } from '../../ui/loop';
import { createStage, type Stage } from '../../ui/stage';
import { onThemeChange, prefersReducedMotion, readPalette, rgba, tubesOn, type Palette } from '../../ui/theme';
import { advance, circularVelocity, createBody, dominantBody, preset, removeEscaped, type Body } from './physics';

const TRAIL_LENGTH = 110;
const MAX_LAUNCHED = 30;
/** Pas du programme d'origine joués par seconde. */
const STEPS_PER_SECOND = 32;

const canvas = document.querySelector<HTMLCanvasElement>('[data-gravity-preview]');

if (canvas) {
  let bodies: Body[] = preset('original');
  const trails = new Map<number, { x: number; y: number }[]>();
  let palette: Palette = readPalette();
  let nativeGlow = createGlowSprite(palette.core, palette.tube, palette.halo);
  let launchedGlow = createGlowSprite(palette.core, palette.phosphor, palette.phosphor);
  let paletteSettlesAt = 0;

  const zoom = (stage: Stage): number => Math.min(stage.height / 800, stage.width / 800);

  const refreshPalette = (): void => {
    palette = readPalette();
    nativeGlow = createGlowSprite(palette.core, palette.tube, palette.halo);
    launchedGlow = createGlowSprite(palette.core, palette.phosphor, palette.phosphor);
  };

  const draw = (stage: Stage): void => {
    const { ctx } = stage;
    const lit = tubesOn();
    if (performance.now() < paletteSettlesAt) refreshPalette();
    const z = zoom(stage);
    const cx = stage.width / 2;
    const cy = stage.height / 2;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, stage.width, stage.height);

    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = lit ? 'lighter' : 'source-over';
    for (const body of bodies) {
      const trail = trails.get(body.id);
      if (!trail || trail.length < 2) continue;
      const color = lit ? (body.launched ? palette.phosphor : palette.tube) : palette.frost;
      // Trois tronçons, du plus récent (vif) au plus ancien (éteint).
      for (let part = 0; part < 3; part++) {
        const from = Math.floor((part * trail.length) / 3);
        const to = Math.min(trail.length - 1, Math.floor(((part + 1) * trail.length) / 3));
        ctx.beginPath();
        for (let i = from; i <= to; i++) {
          const point = trail[trail.length - 1 - i]!;
          if (i === from) ctx.moveTo(cx + point.x * z, cy + point.y * z);
          else ctx.lineTo(cx + point.x * z, cy + point.y * z);
        }
        ctx.strokeStyle = rgba(color, (1 - part / 3) * 0.7);
        ctx.stroke();
      }
    }
    if (lit) {
      for (const body of bodies) {
        drawGlow(ctx, body.launched ? launchedGlow : nativeGlow, cx + body.x * z, cy + body.y * z, Math.max(7, body.radius * z * 3.4));
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const body of bodies) {
      ctx.beginPath();
      ctx.arc(cx + body.x * z, cy + body.y * z, Math.max(1.3, body.radius * z), 0, Math.PI * 2);
      ctx.fillStyle = rgba(lit ? palette.core : palette.frost);
      ctx.fill();
    }
  };

  const hooks = { redraw: (): void => {} };
  const stage = createStage(canvas, () => hooks.redraw());

  const loop = startLoop({
    element: canvas,
    startPaused: prefersReducedMotion(),
    frame(dt) {
      if (dt > 0) {
        advance(bodies, dt * STEPS_PER_SECOND);
        removeEscaped(bodies, 5_000);
        const alive = new Set<number>();
        for (const body of bodies) {
          alive.add(body.id);
          const trail = trails.get(body.id) ?? [];
          trail.push({ x: body.x, y: body.y });
          if (trail.length > TRAIL_LENGTH) trail.shift();
          trails.set(body.id, trail);
        }
        for (const id of trails.keys()) if (!alive.has(id)) trails.delete(id);
      }
      draw(stage);
    },
  });

  hooks.redraw = () => loop.redraw();

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const p = stage.pointer(event);
    const z = zoom(stage);
    const x = (p.x - stage.width / 2) / z;
    const y = (p.y - stage.height / 2) / z;
    const center = dominantBody(x, y, bodies);
    const velocity = center ? circularVelocity(x, y, center) : { vx: 0, vy: 0 };
    // Les astres lâchés ici restent en nombre raisonnable : le plus ancien cède sa place.
    const launched = bodies.filter((body) => body.launched);
    if (launched.length >= MAX_LAUNCHED) bodies = bodies.filter((body) => body !== launched[0]);
    bodies.push(createBody(300 + Math.random() * 2_500, x, y, velocity.vx, velocity.vy, true));
    loop.redraw();
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
}
