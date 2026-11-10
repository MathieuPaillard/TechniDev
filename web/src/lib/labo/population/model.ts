// Population : des individus qui vieillissent, se mettent en couple, ont des enfants, mangent des plantes et
// meurent. Fonctions pures : le hasard est fourni par l'appelant, pour pouvoir rejouer une histoire.
//
// Portage de Croissance_Population (Java et JavaFX, 2025). Les règles et les constantes sont celles du
// programme d'origine : un pas vaut un centième d'année ; on est adulte après 17 ans ; un homme seul a une
// chance sur mille par pas de former un couple avec chaque femme seule ; une grossesse dure 0,8 an ; chacun
// part avec 20 rations, en perd 0,01 par pas, et va chercher une plante quand il n'en a plus ; une plante
// gagne 0,06 ration par pas, se ressème à 10 ans puis tous les 50 ans, et il n'en naît plus au-delà de 100.
//
// Ce qui change :
// - dans le programme d'origine, on continuait à manger une plante disparue ; ici, une plante mangée ne
//   nourrit plus, et l'on en cherche une autre. La nourriture peut donc manquer ;
// - le monde a des bords (l'écran d'origine n'en avait pas) ;
// - le plafond de population (20 000 à l'origine), au-delà duquel une femme n'a plus qu'un enfant, se règle.

export const TICK_YEARS = 0.01;
export const ADULT_AGE = 17;
export const STARTING_RATIONS = 20;
/** Rations prises à une plante en une fois. */
export const BITE = 20;
/** Distance à laquelle on repère une plante ; au-delà, on vise la première de la liste. */
export const FOOD_SIGHT = 600;
export const GESTATION_YEARS = 0.8;
export const MAX_CHILDREN = 20;
/** Chance, par pas et par femme seule, qu'un homme seul forme un couple avec elle (0,1 × 0,01). */
export const PAIRING_CHANCE = 0.001;
/** Chance de conception par pas, quand les deux membres d'un couple sont proches. */
export const CONCEPTION_CHANCE = 0.01;
export const PLANT_CAP = 100;
export const ORIGINAL_POPULATION_CAP = 20_000;
/** Taille de la scène d'origine, en pixels. */
export const ORIGINAL_WIDTH = 2540;
export const ORIGINAL_HEIGHT = 1350;

export interface Plant {
  id: number;
  age: number;
  lifeExpectancy: number;
  x: number;
  y: number;
  rations: number;
  /** Années avant de pouvoir se ressemer. */
  seedTimer: number;
  alive: boolean;
}

export interface Person {
  id: number;
  female: boolean;
  age: number;
  lifeExpectancy: number;
  x: number;
  y: number;
  partner: Person | null;
  mother: Person | null;
  /** La plante vers laquelle on marche quand on a faim. */
  target: Plant | null;
  rations: number;
  /** Les hommes dérivent lentement dans une direction qui leur est propre. */
  driftX: number;
  driftY: number;
  pregnant: boolean;
  gestation: number;
  children: number;
  maxChildren: number;
  alive: boolean;
}

export interface World {
  width: number;
  height: number;
  people: Person[];
  plants: Plant[];
  years: number;
  births: number;
  deaths: number;
  /** Plantes mortes d'avoir été mangées. */
  eatenPlants: number;
  /** Au-delà de ce nombre d'individus, une femme n'a plus qu'un enfant. */
  populationCap: number;
  nextId: number;
}

export type Random = () => number;

export function createWorld(width: number, height: number, populationCap = ORIGINAL_POPULATION_CAP): World {
  return {
    width,
    height,
    people: [],
    plants: [],
    years: 0,
    births: 0,
    deaths: 0,
    eatenPlants: 0,
    populationCap,
    nextId: 1,
  };
}

export function addPerson(
  world: World,
  random: Random,
  female: boolean,
  age: number,
  lifeExpectancy: number,
  x: number,
  y: number,
  mother: Person | null = null,
): Person {
  const person: Person = {
    id: world.nextId++,
    female,
    age,
    lifeExpectancy,
    x,
    y,
    partner: null,
    mother,
    target: null,
    rations: STARTING_RATIONS,
    driftX: (random() - 0.5) / 5,
    driftY: (random() - 0.5) / 5,
    pregnant: false,
    gestation: 0,
    children: 0,
    maxChildren: MAX_CHILDREN,
    alive: true,
  };
  world.people.push(person);
  return person;
}

export function addPlant(world: World, age: number, lifeExpectancy: number, x: number, y: number): Plant {
  const plant: Plant = {
    id: world.nextId++,
    age,
    lifeExpectancy,
    x: clamp(x, 0, world.width),
    y: clamp(y, 0, world.height),
    rations: 10,
    seedTimer: 0,
    alive: true,
  };
  world.plants.push(plant);
  return plant;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Garde un individu dans le monde ; un homme qui touche un bord repart dans l'autre sens. */
function keepInside(world: World, person: Person): void {
  if (person.x < 0 || person.x > world.width) {
    person.x = clamp(person.x, 0, world.width);
    person.driftX = -person.driftX;
  }
  if (person.y < 0 || person.y > world.height) {
    person.y = clamp(person.y, 0, world.height);
    person.driftY = -person.driftY;
  }
}

/** Un pas au hasard : de −1 à 1 en largeur, de 1 à 1,41 en hauteur, vers le haut ou le bas. */
function wander(world: World, person: Person, random: Random): void {
  const dx = random() * 2 - 1;
  const dy = Math.hypot(1, dx) * (random() > 0.5 ? -1 : 1);
  person.x += dx + (person.female ? 0 : person.driftX);
  person.y += dy + (person.female ? 0 : person.driftY);
  keepInside(world, person);
}

/** Un pas de longueur 1 vers un point, dans une direction tirée au hasard du bon côté. */
function approach(world: World, person: Person, x: number, y: number, random: Random): void {
  let dx = random();
  let dy = Math.sqrt(1 - dx * dx);
  if (x - person.x < 0) dx = -dx;
  if (y - person.y < 0) dy = -dy;
  person.x += dx;
  person.y += dy;
  keepInside(world, person);
}

/** Un enfant rejoint sa mère (pas un peu plus long en hauteur, comme dans le programme d'origine). */
function approachMother(world: World, person: Person, mother: Person, random: Random): void {
  let dx = random();
  let dy = Math.hypot(1, dx);
  if (mother.x - person.x < 0) dx = -dx;
  if (mother.y - person.y < 0) dy = -dy;
  person.x += dx;
  person.y += dy;
  keepInside(world, person);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function seekFood(world: World, person: Person, random: Random): void {
  if (person.target && !person.target.alive) person.target = null;
  if (!person.target) {
    const plant = world.plants.find((candidate) => distance(candidate, person) < FOOD_SIGHT) ?? world.plants[0];
    if (!plant) return; // plus aucune plante : on reste sur place, le ventre vide
    person.target = plant;
    if (person.partner) person.partner.target = plant;
    else wander(world, person, random);
    return;
  }
  if (distance(person.target, person) < 1) {
    person.target.rations -= BITE;
    person.rations += BITE;
    return;
  }
  approach(world, person, person.target.x, person.target.y, random);
}

function couple(man: Person, woman: Person): void {
  man.partner = woman;
  woman.partner = man;
}

function act(world: World, person: Person, random: Random, singleWomen: () => Person[]): void {
  if (person.age > ADULT_AGE) {
    if (person.rations <= 0) {
      seekFood(world, person, random);
      return;
    }
    const partner = person.partner;
    if (partner) {
      if (distance(partner, person) < (person.female ? 10 : 20)) {
        if (
          !person.female &&
          random() > 1 - CONCEPTION_CHANCE &&
          !partner.pregnant &&
          partner.children < partner.maxChildren &&
          partner.age < 55 &&
          person.age < 65
        ) {
          partner.pregnant = true;
          partner.children++;
        }
        wander(world, person, random);
      } else {
        approach(world, person, partner.x, partner.y, random);
      }
      return;
    }
    if (!person.female) {
      // Chaque femme seule a une chance sur mille, dans l'ordre de la liste : le rang de la première
      // élue suit une loi géométrique, tirée en une fois plutôt qu'en parcourant toute la population.
      const candidates = singleWomen();
      const rank = Math.floor(Math.log(1 - random()) / Math.log(1 - PAIRING_CHANCE));
      const woman = candidates[rank];
      if (woman) {
        candidates.splice(rank, 1);
        couple(person, woman);
      }
    }
    wander(world, person, random);
    return;
  }
  // Enfant : il reste près de sa mère.
  const mother = person.mother;
  if (!mother || distance(mother, person) < (person.female ? 10 : 5)) wander(world, person, random);
  else approachMother(world, person, mother, random);
}

/** Avance le monde d'un pas : un centième d'année. */
export function tick(world: World, random: Random): void {
  world.years += TICK_YEARS;

  const people = world.people;
  const count = people.length;
  const crowded = count > world.populationCap;
  let singles: Person[] | null = null;
  const singleWomen = (): Person[] => {
    singles ??= people.filter((person) => person.female && !person.partner && person.age > ADULT_AGE);
    return singles;
  };

  for (let i = 0; i < count; i++) {
    const person = people[i]!;
    if (person.female && crowded) person.maxChildren = 1;
    person.age += TICK_YEARS;
    if (person.rations > 0) person.rations -= TICK_YEARS;
    else person.lifeExpectancy -= 0.001; // la faim use
    act(world, person, random, singleWomen);
    if (person.female) {
      if (person.pregnant) person.gestation += TICK_YEARS;
      if (person.gestation > GESTATION_YEARS) {
        person.pregnant = false;
        person.gestation = 0;
        const girl = random() > 0.5;
        addPerson(world, random, girl, 0, random() * (girl ? 80 : 70), person.x, person.y, person);
        world.births++;
      }
    }
  }

  let kept = 0;
  for (const person of people) {
    if (person.age > person.lifeExpectancy) {
      person.alive = false;
      world.deaths++;
      if (person.partner) {
        person.partner.partner = null;
        person.partner = null;
      }
    } else {
      people[kept++] = person;
    }
  }
  people.length = kept;

  const plants = world.plants;
  const plantCount = plants.length;
  const saturated = plantCount > PLANT_CAP;
  for (let i = 0; i < plantCount; i++) {
    const plant = plants[i]!;
    if (saturated) plant.seedTimer = 10;
    if (plant.rations > 0) plant.rations += 0.06;
    plant.age += TICK_YEARS;
    plant.seedTimer -= TICK_YEARS;
    if (plant.age > 10 && plant.seedTimer < 0 && plant.age < 100) {
      plant.seedTimer = 50;
      addPlant(world, 0, random() * 200, plant.x + random() * 100 - 50, plant.y + random() * 100 - 50);
    }
  }

  kept = 0;
  for (const plant of plants) {
    const eaten = plant.rations <= 0;
    if (eaten || plant.age > plant.lifeExpectancy) {
      plant.alive = false;
      if (eaten) world.eatenPlants++;
    } else {
      plants[kept++] = plant;
    }
  }
  plants.length = kept;
}

export interface Census {
  women: number;
  men: number;
  children: number;
  couples: number;
  hungry: number;
  plants: number;
}

export function census(world: World): Census {
  let women = 0;
  let men = 0;
  let children = 0;
  let coupled = 0;
  let hungry = 0;
  for (const person of world.people) {
    if (person.female) women++;
    else men++;
    if (person.age <= ADULT_AGE) children++;
    if (person.partner) coupled++;
    if (person.rations <= 0) hungry++;
  }
  return { women, men, children, couples: coupled / 2, hungry, plants: world.plants.length };
}

/**
 * Le départ du programme de 2025 : quatre couples de 18 ans (espérance de vie 97 ans pour les femmes, 107
 * pour les hommes) et quatre plantes, aux mêmes endroits, rapportés à la taille du monde.
 */
export function seed2025(world: World, random: Random): void {
  const sx = world.width / ORIGINAL_WIDTH;
  const sy = world.height / ORIGINAL_HEIGHT;
  for (const [x, y] of [
    [1200, 500],
    [1200, 700],
    [200, 100],
    [2100, 1000],
  ] as const) {
    addPerson(world, random, false, 18, 107, x * sx, y * sy);
    addPerson(world, random, true, 18, 97, x * sx, y * sy);
  }
  for (const [x, y] of [
    [1300, 600],
    [400, 200],
    [400, 1000],
    [2000, 300],
  ] as const) {
    addPlant(world, 0, 900, x * sx + random() * 100 - 50, y * sy + random() * 100 - 50);
  }
}

/** Dépose un couple d'adultes à un endroit (geste du visiteur). */
export function dropCouple(world: World, random: Random, x: number, y: number): void {
  addPerson(world, random, false, 18, 107, x, y);
  addPerson(world, random, true, 18, 97, x, y);
}

/** Sème une plante à un endroit (geste du visiteur) : elle vivra jusqu'à 200 ans au plus, comme une plante née d'une autre. */
export function sow(world: World, random: Random, x: number, y: number): Plant {
  return addPlant(world, 0, 60 + random() * 140, x, y);
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
