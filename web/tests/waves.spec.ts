import { expect, test } from '@playwright/test';
import {
  advance,
  amplitudeAt,
  createSource,
  createWorld,
  DEFAULT_PARAMS,
  machAngle,
  machNumber,
  preset,
  removeEscaped,
  ringStrength,
  sourceRadius,
  type WaveParams,
} from '../src/lib/labo/waves/physics';

const still: WaveParams = { ...DEFAULT_PARAMS, waveSpeed: 100, period: 0.5, maxRadius: 400, gravity: false };

test('le rayon d’une source suit sa masse, jamais moins de 1', () => {
  expect(sourceRadius(100_000)).toBeCloseTo(Math.cbrt(300_000 / (4 * Math.PI)) / 2, 10);
  expect(sourceRadius(1)).toBe(1);
});

test('une source immobile émet un front par période, tous centrés sur elle', () => {
  const world = createWorld([createSource(10, 50, -20)]);
  advance(world, 2.25, still);
  // Fronts émis à 0,5 s, 1 s, 1,5 s et 2 s : rayons 175, 125, 75 et 25 à t = 2,25 s.
  expect(world.rings).toHaveLength(4);
  expect(world.rings.map((ring) => Math.round(ring.radius))).toEqual([175, 125, 75, 25]);
  for (const ring of world.rings) {
    expect(ring.x).toBeCloseTo(50, 9);
    expect(ring.y).toBeCloseTo(-20, 9);
  }
  expect(world.time).toBeCloseTo(2.25, 9);
});

test('les fronts disparaissent au rayon maximal', () => {
  const world = createWorld([createSource(10, 0, 0)]);
  advance(world, 20, still);
  // Durée de vie d'un front : 400 / 100 = 4 s, soit 8 périodes.
  expect(world.rings.length).toBeLessThanOrEqual(8);
  expect(Math.max(...world.rings.map((ring) => ring.radius))).toBeLessThanOrEqual(400);
});

test('effet Doppler : devant une source en mouvement, les fronts se serrent', () => {
  const speed = 60; // 0,6 fois la vitesse de l'onde
  const world = createWorld([createSource(10, 0, 0, speed, 0)]);
  advance(world, 3, still);
  const rings = [...world.rings].sort((a, b) => a.radius - b.radius);
  const [inner, outer] = [rings[0]!, rings[1]!];
  // Écart entre deux fronts successifs sur l'axe du mouvement : (c − v)·T devant, (c + v)·T derrière.
  const ahead = outer.x + outer.radius - (inner.x + inner.radius);
  const behind = inner.x - inner.radius - (outer.x - outer.radius);
  expect(ahead).toBeCloseTo((100 - speed) * 0.5, 6);
  expect(behind).toBeCloseTo((100 + speed) * 0.5, 6);
});

test('mur du son : une source plus rapide que son onde sort de tous ses fronts', () => {
  const source = createSource(10, 0, 0, 170, 0);
  const world = createWorld([source]);
  // 3,1 s : un dixième de seconde après la dernière émission (à l'instant même, front et source se confondent).
  advance(world, 3.1, still);
  expect(world.rings.length).toBeGreaterThan(3);
  expect(machNumber(source, still.waveSpeed)).toBeCloseTo(1.7, 10);
  for (const ring of world.rings) {
    expect(Math.hypot(source.x - ring.x, source.y - ring.y)).toBeGreaterThan(ring.radius);
  }
  expect(machAngle(1.7)).toBeCloseTo(36.03, 2);
  expect(machAngle(2)).toBeCloseTo(30, 9);
  expect(machAngle(0.6)).toBeNull();
});

test('la gravité fait tourner une source légère autour d’une lourde', () => {
  // Vitesse circulaire à 200 px d'une masse de 100 000 : √(G·M / r) = √(10 × 100 000 / 200) ≈ 70,7 px/s.
  const heavy = createSource(100_000, 0, 0);
  const light = createSource(1, 200, 0, 0, Math.sqrt((10 * 100_000) / 200));
  const world = createWorld([heavy, light]);
  const params: WaveParams = { ...DEFAULT_PARAMS, gravity: true };
  let min = Infinity;
  let max = 0;
  for (let i = 0; i < 600; i++) {
    advance(world, 1 / 60, params);
    const distance = Math.hypot(light.x - heavy.x, light.y - heavy.y);
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }
  expect(min).toBeGreaterThan(196);
  expect(max).toBeLessThan(204);
});

test('sans gravité, une source va tout droit', () => {
  const source = createSource(10, 0, 0, 30, -40);
  const world = createWorld([createSource(100_000, 100, 100), source]);
  advance(world, 2, still);
  expect(source.x).toBeCloseTo(60, 9);
  expect(source.y).toBeCloseTo(-80, 9);
});

test('dans une boîte, la source rebondit sur les bords', () => {
  const source = createSource(10, 0, 0, 100, 0);
  const world = createWorld([source]);
  advance(world, 5, { ...still, bounds: { x: 150, y: 100 } });
  expect(Math.abs(source.x)).toBeLessThanOrEqual(150);
  // 500 px parcourus : 150 à l'aller, 300 au retour jusqu'à −150, puis 50 vers la droite.
  expect(source.x).toBeCloseTo(-100, 0);
  expect(source.vx).toBe(100);
});

test('l’éclat d’un front décroît avec son rayon', () => {
  expect(ringStrength(0, 400)).toBe(1);
  expect(ringStrength(100, 400)).toBeCloseTo(0.75, 10);
  expect(ringStrength(400, 400)).toBe(0);
  expect(ringStrength(900, 400)).toBe(0);
});

test('interférences : crêtes en phase sur la médiatrice, opposition à une demi-longueur d’onde d’écart', () => {
  // Longueur d'onde : 100 × 0,5 = 50 px. Sources à ±100 px, en phase.
  const sources = [createSource(10, -100, 0), createSource(10, 100, 0)];
  const far: WaveParams = { ...still, maxRadius: 1e9 };
  // Sur la médiatrice, les deux ondes arrivent ensemble : l'amplitude est le double d'une seule.
  expect(amplitudeAt(0, 150, sources, far)).toBeCloseTo(2 * amplitudeAt(0, 150, [sources[0]!], far), 9);
  // Point où les distances diffèrent d'une demi-longueur d'onde (112,5 et 87,5 px) : les ondes s'annulent
  // (à l'atténuation près, infime avec un rayon maximal aussi grand).
  expect(amplitudeAt(12.5, 0, sources, far)).toBeCloseTo(0, 6);
  // Différence d'une longueur d'onde entière (125 et 75 px) : elles s'ajoutent de nouveau.
  expect(Math.abs(amplitudeAt(25, 0, sources, far))).toBeCloseTo(2, 6);
});

test('le ballet de 2025 : dix-sept sources, toutes les planètes plus rapides que leur onde', () => {
  const { sources, params } = preset('ballet');
  expect(sources).toHaveLength(17);
  expect(params.waveSpeed).toBe(30);
  expect(params.period).toBe(0.5);
  expect(params.maxRadius).toBe(400);
  expect(sources[0]!.mass).toBe(100_000);
  for (const source of sources.slice(1)) expect(machNumber(source, params.waveSpeed)).toBeGreaterThan(1);
});

test('les sources parties trop loin sont retirées', () => {
  const world = createWorld([createSource(1, 0, 0), createSource(1, 9_000, 0)]);
  expect(removeEscaped(world, 5_000)).toBe(1);
  expect(world.sources).toHaveLength(1);
});
