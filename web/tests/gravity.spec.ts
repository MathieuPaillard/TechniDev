import { expect, test } from '@playwright/test';
import {
  advance,
  circularVelocity,
  createBody,
  dominantBody,
  fieldStrength,
  G_EFFECTIVE,
  mergeCollisions,
  momentum,
  preset,
  radiusOf,
  removeEscaped,
  seededRandom,
  totalEnergy,
  totalMass,
} from '../src/lib/labo/gravity/physics';

test('le rayon suit la masse comme dans le programme de 2020 (densité 5)', () => {
  // volume = 1 000 000 / 5 ; rayon = ∛(3·volume / 4π)
  expect(radiusOf(1_000_000)).toBeCloseTo(Math.cbrt(600_000 / (4 * Math.PI)), 10);
  expect(radiusOf(8_000) / radiusOf(1_000)).toBeCloseTo(2, 10);
});

test('la constante effective vaut G / 1000', () => {
  expect(G_EFFECTIVE).toBeCloseTo(0.0066742, 10);
});

test('une orbite circulaire reste circulaire', () => {
  const sun = createBody(1_000_000, 0, 0);
  const v = circularVelocity(200, 0, sun);
  const planet = createBody(1, 200, 0, v.vx, v.vy);
  const bodies = [sun, planet];
  let min = Infinity;
  let max = 0;
  for (let i = 0; i < 2_000; i++) {
    advance(bodies, 1);
    const distance = Math.hypot(bodies[1]!.x - bodies[0]!.x, bodies[1]!.y - bodies[0]!.y);
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }
  expect(bodies).toHaveLength(2);
  expect(min).toBeGreaterThan(198);
  expect(max).toBeLessThan(202);
});

test("l'énergie et la quantité de mouvement se conservent sans collision", () => {
  const sun = createBody(1_000_000, 0, 0);
  const a = createBody(1_000, 0, -150, 7, 0);
  const b = createBody(100, 0, -350, 4, 0);
  const bodies = [sun, a, b];
  const energy = totalEnergy(bodies);
  const before = momentum(bodies);
  for (let i = 0; i < 1_500; i++) advance(bodies, 1);
  expect(bodies).toHaveLength(3);
  expect(Math.abs((totalEnergy(bodies) - energy) / energy)).toBeLessThan(0.01);
  const after = momentum(bodies);
  expect(after.px).toBeCloseTo(before.px, 6);
  expect(after.py).toBeCloseTo(before.py, 6);
});

test('deux astres qui se touchent fusionnent : masse et quantité de mouvement conservées', () => {
  const heavy = createBody(8_000, 0, 0, 1, 0);
  const light = createBody(2_000, 5, 0, -4, 2);
  const bodies = [heavy, light];
  const before = momentum(bodies);
  expect(mergeCollisions(bodies)).toBe(1);
  expect(bodies).toHaveLength(1);
  const merged = bodies[0]!;
  expect(merged.id).toBe(heavy.id);
  expect(merged.mass).toBe(10_000);
  expect(merged.x).toBeCloseTo(1, 10); // centre de masse : (0·8000 + 5·2000) / 10000
  expect(merged.radius).toBeCloseTo(radiusOf(10_000), 10);
  const after = momentum(bodies);
  expect(after.px).toBeCloseTo(before.px, 9);
  expect(after.py).toBeCloseTo(before.py, 9);
});

test('des astres éloignés ne fusionnent pas', () => {
  const bodies = [createBody(1_000, 0, 0), createBody(1_000, 100, 0)];
  expect(mergeCollisions(bodies)).toBe(0);
  expect(bodies).toHaveLength(2);
});

test('une chaîne de collisions se résout en un seul astre', () => {
  // Rayon d'un astre de 5 000 : 6,2 px. Espacés de 6 px, chacun touche le suivant, même après que l'amas a grossi.
  const bodies = [createBody(5_000, 0, 0), createBody(5_000, 6, 0), createBody(5_000, 12, 0), createBody(5_000, 18, 0)];
  expect(mergeCollisions(bodies)).toBe(3);
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.mass).toBe(20_000);
});

test('deux astres immobiles tombent l’un vers l’autre et fusionnent', () => {
  const bodies = [createBody(50_000, -60, 0), createBody(50_000, 60, 0)];
  let merged = 0;
  for (let i = 0; i < 3_000 && bodies.length > 1; i++) merged += advance(bodies, 1);
  expect(merged).toBe(1);
  expect(bodies[0]!.mass).toBe(100_000);
  expect(bodies[0]!.x).toBeCloseTo(0, 6);
  expect(bodies[0]!.vx).toBeCloseTo(0, 6);
});

test("la figure en huit ramène chaque astre près de son point de départ après une période", () => {
  const bodies = preset('eight');
  const start = bodies.map((body) => ({ x: body.x, y: body.y }));
  // Période de la solution : 6,3259 unités de temps ; une unité vaut longueur / vitesse = 190 / √(G·m / 190).
  const period = (6.32591398 * 190) / Math.sqrt((G_EFFECTIVE * 20_000) / 190);
  const steps = 4_000;
  for (let i = 0; i < steps; i++) advance(bodies, period / steps, 0.25);
  expect(bodies).toHaveLength(3);
  bodies.forEach((body, index) => {
    expect(Math.hypot(body.x - start[index]!.x, body.y - start[index]!.y)).toBeLessThan(4);
  });
});

test("le système de 2020 : la planète proche tourne presque en rond autour du soleil", () => {
  const bodies = preset('original');
  expect(bodies).toHaveLength(5);
  expect(totalMass(bodies)).toBe(1_053_140);
  const sun = bodies[0]!;
  const planet = bodies[1]!;
  // Vitesse circulaire à 150 px : √(G·M / 150) ≈ 6,67 ; le programme d'origine donnait 7.
  const circular = circularVelocity(planet.x, planet.y, sun);
  expect(Math.hypot(circular.vx, circular.vy)).toBeCloseTo(6.67, 2);
});

test('le nuage est reproductible avec une graine', () => {
  const a = preset('cloud', seededRandom(42));
  const b = preset('cloud', seededRandom(42));
  expect(a).toHaveLength(90);
  expect(a.map((body) => [body.x, body.y, body.mass])).toEqual(b.map((body) => [body.x, body.y, body.mass]));
});

test("l'astre dominant est celui qui tire le plus fort, pas le plus proche", () => {
  const sun = createBody(1_000_000, 0, 0);
  const moon = createBody(5_000, 190, 0);
  // À 70 px de la lune et 260 px du soleil, le soleil l'emporte encore : 1 000 000 / 260² > 5 000 / 70².
  expect(dominantBody(260, 0, [sun, moon])?.id).toBe(sun.id);
  expect(dominantBody(195, 0, [sun, moon])?.id).toBe(moon.id);
  expect(dominantBody(0, 0, [])).toBeNull();
});

test('le champ additionne les intensités, comme en 2020', () => {
  const a = createBody(1_000, -10, 0);
  const b = createBody(1_000, 10, 0);
  // Au milieu, les deux attractions s'annulent en vecteur mais leurs intensités s'ajoutent.
  const single = fieldStrength(0, 0, [a]);
  expect(fieldStrength(0, 0, [a, b])).toBeCloseTo(2 * single, 10);
  expect(single).toBeCloseTo((6.6742 * 1_000) / 100 ** 2, 10);
});

test('les astres partis trop loin sont retirés', () => {
  const bodies = [createBody(1, 0, 0), createBody(1, 5_000, 0), createBody(1, 0, -9_000)];
  expect(removeEscaped(bodies, 4_000)).toBe(2);
  expect(bodies).toHaveLength(1);
});
