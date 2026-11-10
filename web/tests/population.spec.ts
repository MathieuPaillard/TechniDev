import { expect, test } from '@playwright/test';
import {
  addPerson,
  addPlant,
  census,
  createWorld,
  dropCouple,
  seed2025,
  seededRandom,
  sow,
  tick,
  type World,
} from '../src/lib/labo/population/model';

function run(world: World, random: () => number, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(world, random);
}

test('le départ de 2025 : quatre couples de 18 ans et quatre plantes', () => {
  const world = createWorld(2540, 1350);
  seed2025(world, seededRandom(1));
  expect(census(world)).toEqual({ women: 4, men: 4, children: 0, couples: 0, hungry: 0, plants: 4 });
  expect(world.people.every((person) => person.age === 18)).toBe(true);
  expect(world.people.filter((person) => person.female).every((person) => person.lifeExpectancy === 97)).toBe(true);
  expect(world.people.filter((person) => !person.female).every((person) => person.lifeExpectancy === 107)).toBe(true);
});

test('la même graine rejoue la même histoire', () => {
  const play = (seed: number): string => {
    const random = seededRandom(seed);
    const world = createWorld(2540, 1350, 500);
    seed2025(world, random);
    run(world, random, 6_000);
    return JSON.stringify([census(world), world.births, world.deaths, world.eatenPlants]);
  };
  expect(play(11)).toBe(play(11));
  expect(play(11)).not.toBe(play(12));
});

test('un pas vaut un centième d’année', () => {
  const random = seededRandom(2);
  const world = createWorld(500, 500);
  const person = addPerson(world, random, true, 30, 90, 250, 250);
  run(world, random, 100);
  expect(world.years).toBeCloseTo(1, 9);
  expect(person.age).toBeCloseTo(31, 9);
  expect(person.rations).toBeCloseTo(19, 9);
});

test('un adulte affamé marche jusqu’à une plante et y prend 20 rations', () => {
  const random = seededRandom(3);
  const world = createWorld(500, 500);
  const person = addPerson(world, random, true, 30, 90, 100, 100);
  person.rations = 0;
  const plant = addPlant(world, 20, 900, 100, 140);
  plant.rations = 100;
  let ticks = 0;
  while (person.rations <= 0 && ticks < 5_000) {
    tick(world, random);
    ticks++;
  }
  expect(person.rations).toBeGreaterThan(19);
  expect(person.target).toBe(plant);
  // La plante a perdu 20 rations et en a regagné 0,06 par pas.
  expect(plant.rations).toBeCloseTo(100 - 20 + 0.06 * ticks, 6);
  expect(plant.alive).toBe(true);
});

test('une plante trop jeune ne survit pas à une bouchée, et ne nourrit plus ensuite', () => {
  const random = seededRandom(4);
  const world = createWorld(500, 500);
  const person = addPerson(world, random, false, 30, 90, 100, 100);
  person.rations = 0;
  const plant = addPlant(world, 0, 900, 100, 103); // 10 rations au départ
  let ticks = 0;
  while (plant.alive && ticks < 2_000) {
    tick(world, random);
    ticks++;
  }
  expect(plant.alive).toBe(false);
  expect(world.plants).toHaveLength(0);
  expect(world.eatenPlants).toBe(1);
  expect(person.rations).toBeGreaterThan(19);

  // Vingt ans plus tard, la faim revient : la plante disparue n'est plus une cible, et sans autre plante on jeûne.
  person.rations = 0;
  const lifeExpectancy = person.lifeExpectancy;
  run(world, random, 200);
  expect(person.target).toBeNull();
  expect(person.rations).toBeLessThanOrEqual(0);
  expect(person.lifeExpectancy).toBeCloseTo(lifeExpectancy - 0.2, 9);
});

test('quand sa plante disparaît, on en vise une autre', () => {
  const random = seededRandom(5);
  const world = createWorld(900, 500);
  const person = addPerson(world, random, true, 30, 90, 100, 100);
  person.rations = 0;
  const first = addPlant(world, 20, 900, 400, 100);
  first.rations = 100;
  first.seedTimer = 50; // pas de semis pendant le test : la liste des plantes reste celle que l'on pose ici
  tick(world, random);
  expect(person.target).toBe(first);
  first.lifeExpectancy = 0; // la plante meurt de vieillesse
  const second = addPlant(world, 20, 900, 130, 100);
  second.rations = 100;
  second.seedTimer = 50;
  run(world, random, 3);
  expect(first.alive).toBe(false);
  expect(person.target).toBe(second);
});

test('une plante se ressème à dix ans', () => {
  const random = seededRandom(6);
  const world = createWorld(500, 500);
  addPlant(world, 0, 900, 250, 250);
  run(world, random, 1_000);
  expect(world.plants).toHaveLength(1);
  run(world, random, 5);
  expect(world.plants).toHaveLength(2);
  const [parent, child] = world.plants;
  expect(Math.abs(child!.x - parent!.x)).toBeLessThanOrEqual(50);
  expect(Math.abs(child!.y - parent!.y)).toBeLessThanOrEqual(50);
  expect(child!.lifeExpectancy).toBeLessThan(200);
});

test('au-delà de cent plantes, il n’en naît plus', () => {
  const random = seededRandom(7);
  const world = createWorld(2_000, 2_000);
  for (let i = 0; i < 101; i++) addPlant(world, 20, 900, (i % 11) * 150, Math.floor(i / 11) * 150);
  run(world, random, 2_000);
  expect(world.plants).toHaveLength(101);
});

test('un homme seul finit par former un couple, et le couple est réciproque', () => {
  const random = seededRandom(8);
  const world = createWorld(1_000, 1_000);
  const man = addPerson(world, random, false, 25, 90, 500, 500);
  for (let i = 0; i < 2_000; i++) addPerson(world, random, true, 25, 90, 500, 500);
  // Chance par pas avec 2 000 femmes seules : 1 − 0,999^2000 ≈ 86 %.
  run(world, random, 12);
  expect(man.partner).not.toBeNull();
  expect(man.partner!.partner).toBe(man);
  expect(man.partner!.female).toBe(true);
  expect(census(world).couples).toBe(1);
});

test('les enfants et les personnes déjà en couple ne sont pas choisis', () => {
  const random = seededRandom(9);
  const world = createWorld(1_000, 1_000);
  const man = addPerson(world, random, false, 25, 90, 500, 500);
  for (let i = 0; i < 3_000; i++) addPerson(world, random, true, 5, 90, 500, 500);
  run(world, random, 50);
  expect(man.partner).toBeNull();
});

test('un couple réuni a des enfants, qui naissent près de leur mère', () => {
  const random = seededRandom(10);
  const world = createWorld(600, 600);
  dropCouple(world, random, 300, 300);
  const [man, woman] = world.people;
  man!.partner = woman!;
  woman!.partner = man!;
  run(world, random, 1_500);
  expect(world.births).toBeGreaterThan(0);
  const children = world.people.filter((person) => person.mother === woman);
  expect(children.length).toBeGreaterThan(0);
  for (const child of children) {
    expect(child.age).toBeLessThan(15);
    expect(Math.hypot(child.x - woman!.x, child.y - woman!.y)).toBeLessThan(60);
  }
  expect(woman!.children).toBeGreaterThanOrEqual(world.births);
});

test('à la mort de l’un, l’autre redevient seul', () => {
  const random = seededRandom(11);
  const world = createWorld(600, 600);
  const man = addPerson(world, random, false, 30, 30.05, 300, 300);
  const woman = addPerson(world, random, true, 30, 90, 300, 300);
  man.partner = woman;
  woman.partner = man;
  run(world, random, 10);
  expect(man.alive).toBe(false);
  expect(world.people).toEqual([woman]);
  expect(woman.partner).toBeNull();
  expect(world.deaths).toBe(1);
});

test('au-delà du plafond, une femme n’a plus qu’un enfant', () => {
  const random = seededRandom(12);
  const world = createWorld(600, 600, 1);
  const woman = addPerson(world, random, true, 30, 90, 300, 300);
  addPerson(world, random, false, 30, 90, 300, 300);
  expect(woman.maxChildren).toBe(20);
  tick(world, random);
  expect(woman.maxChildren).toBe(1);
});

test('personne ne sort du monde', () => {
  const random = seededRandom(13);
  const world = createWorld(120, 80, 300);
  seed2025(world, random);
  run(world, random, 8_000);
  expect(world.people.length).toBeGreaterThan(0);
  for (const person of world.people) {
    expect(person.x).toBeGreaterThanOrEqual(0);
    expect(person.x).toBeLessThanOrEqual(120);
    expect(person.y).toBeGreaterThanOrEqual(0);
    expect(person.y).toBeLessThanOrEqual(80);
  }
  for (const plant of world.plants) {
    expect(plant.x).toBeGreaterThanOrEqual(0);
    expect(plant.x).toBeLessThanOrEqual(120);
  }
});

test('semer ajoute une plante à l’endroit choisi', () => {
  const random = seededRandom(14);
  const world = createWorld(600, 600);
  const plant = sow(world, random, 123, 456);
  expect(world.plants).toEqual([plant]);
  expect(plant).toMatchObject({ x: 123, y: 456, age: 0, alive: true });
  expect(plant.lifeExpectancy).toBeGreaterThanOrEqual(60);
  expect(plant.lifeExpectancy).toBeLessThan(200);
});
