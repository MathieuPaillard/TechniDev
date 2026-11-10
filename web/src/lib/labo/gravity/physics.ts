// Gravité : des astres qui s'attirent, se rentrent dedans et fusionnent. Fonctions pures, sans navigateur.
//
// Portage de Gravity (Java, 2020). Constantes et règles reprises du programme d'origine :
// - G = 6,6742, et un pixel vaut 10 unités de distance. Comme la direction y était elle aussi divisée par la
//   distance mise à l'échelle, l'accélération vaut G·m / (1000·d²), d en pixels ;
// - le rayon d'un astre se déduit de sa masse : volume = masse / densité (5), rayon = ∛(3·volume / 4π) ;
// - deux astres qui se touchent (distance inférieure à la somme des rayons) repartent ensemble, à la vitesse
//   qui conserve la quantité de mouvement.
// Ce qui change : le programme d'origine avançait d'un pas entier par image (Euler) et gardait deux objets
// collés après un choc ; ici le pas est découpé (schéma de Verlet, qui conserve mieux l'énergie) et les deux
// astres n'en font plus qu'un.

export const ORIGINAL_G = 6.6742;
export const DISTANCE_SCALE = 10;
export const DENSITY = 5;

/** Accélération = G_EFFECTIVE · masse / distance², en pixels par pas au carré. */
export const G_EFFECTIVE = ORIGINAL_G / DISTANCE_SCALE ** 3;

/** Adoucissement : évite une force infinie quand deux centres se confondent, juste avant la fusion. */
const SOFTENING_SQUARED = 1;

export interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  /** Lâché par le visiteur (dessiné dans la seconde teinte) ou présent dans le scénario. */
  launched: boolean;
}

export function radiusOf(mass: number): number {
  return Math.cbrt((3 * (mass / DENSITY)) / (4 * Math.PI));
}

let nextId = 1;

export function createBody(
  mass: number,
  x: number,
  y: number,
  vx = 0,
  vy = 0,
  launched = false,
): Body {
  return { id: nextId++, x, y, vx, vy, mass, radius: radiusOf(mass), launched };
}

/** Accélération subie par chaque astre : tableau [ax0, ay0, ax1, ay1, …]. */
export function accelerations(bodies: readonly Body[]): Float64Array {
  const result = new Float64Array(bodies.length * 2);
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]!;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + SOFTENING_SQUARED;
      const inv = G_EFFECTIVE / (d2 * Math.sqrt(d2));
      result[i * 2] = result[i * 2]! + dx * inv * b.mass;
      result[i * 2 + 1] = result[i * 2 + 1]! + dy * inv * b.mass;
      result[j * 2] = result[j * 2]! - dx * inv * a.mass;
      result[j * 2 + 1] = result[j * 2 + 1]! - dy * inv * a.mass;
    }
  }
  return result;
}

/**
 * Fusionne les astres qui se touchent. Le plus lourd garde son identité ; la masse s'additionne, la quantité
 * de mouvement est conservée, le nouvel astre se place au centre de masse. Renvoie le nombre de fusions.
 */
export function mergeCollisions(bodies: Body[]): number {
  let merged = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const reach = a.radius + b.radius;
      if (dx * dx + dy * dy >= reach * reach) continue;
      const keep = a.mass >= b.mass ? a : b;
      const mass = a.mass + b.mass;
      const merge: Body = {
        id: keep.id,
        x: (a.x * a.mass + b.x * b.mass) / mass,
        y: (a.y * a.mass + b.y * b.mass) / mass,
        vx: (a.vx * a.mass + b.vx * b.mass) / mass,
        vy: (a.vy * a.mass + b.vy * b.mass) / mass,
        mass,
        radius: radiusOf(mass),
        launched: keep.launched,
      };
      bodies[i] = merge;
      bodies.splice(j, 1);
      merged++;
      j = i; // l'astre grossi peut en toucher d'autres : on reprend ses voisins
    }
  }
  return merged;
}

/**
 * Avance le système d'une durée dt (en pas du programme d'origine), découpée en sous-pas d'au plus maxStep.
 * Modifie le tableau (positions, vitesses, fusions). Renvoie le nombre de fusions.
 */
export function advance(bodies: Body[], dt: number, maxStep = 0.25): number {
  if (!(dt > 0) || bodies.length === 0) return 0;
  const steps = Math.max(1, Math.ceil(dt / maxStep));
  const h = dt / steps;
  let merged = 0;
  let acc = accelerations(bodies);
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]!;
      body.vx += acc[i * 2]! * (h / 2);
      body.vy += acc[i * 2 + 1]! * (h / 2);
      body.x += body.vx * h;
      body.y += body.vy * h;
    }
    const fused = mergeCollisions(bodies);
    merged += fused;
    acc = accelerations(bodies);
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]!;
      body.vx += acc[i * 2]! * (h / 2);
      body.vy += acc[i * 2 + 1]! * (h / 2);
    }
  }
  return merged;
}

/** Vitesse d'une orbite circulaire autour de « center », pour un astre placé en (x, y). Sens direct. */
export function circularVelocity(x: number, y: number, center: Body): { vx: number; vy: number } {
  const dx = x - center.x;
  const dy = y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9) return { vx: center.vx, vy: center.vy };
  const speed = Math.sqrt((G_EFFECTIVE * center.mass) / distance);
  return { vx: center.vx - (dy / distance) * speed, vy: center.vy + (dx / distance) * speed };
}

/** L'astre dont l'attraction domine au point (x, y) : celui qui maximise masse / distance². */
export function dominantBody(x: number, y: number, bodies: readonly Body[]): Body | null {
  let best: Body | null = null;
  let bestPull = 0;
  for (const body of bodies) {
    const d2 = (body.x - x) ** 2 + (body.y - y) ** 2 + SOFTENING_SQUARED;
    const pull = body.mass / d2;
    if (pull > bestPull) {
      bestPull = pull;
      best = body;
    }
  }
  return best;
}

/**
 * Le « champ » du programme d'origine en un point : la somme des G·m / d² de chaque astre (somme des
 * intensités, pas des vecteurs), d en unités d'origine (10 par pixel) et plancher à 0,01 comme en 2020.
 */
export function fieldStrength(x: number, y: number, bodies: readonly Body[]): number {
  let total = 0;
  for (const body of bodies) {
    const dx = (body.x - x) * DISTANCE_SCALE;
    const dy = (body.y - y) * DISTANCE_SCALE;
    total += (ORIGINAL_G * body.mass) / Math.max(0.01, dx * dx + dy * dy);
  }
  return total;
}

export function totalMass(bodies: readonly Body[]): number {
  return bodies.reduce((sum, body) => sum + body.mass, 0);
}

export function momentum(bodies: readonly Body[]): { px: number; py: number } {
  let px = 0;
  let py = 0;
  for (const body of bodies) {
    px += body.mass * body.vx;
    py += body.mass * body.vy;
  }
  return { px, py };
}

/** Énergie totale : cinétique plus potentielle (avec le même adoucissement que les forces). */
export function totalEnergy(bodies: readonly Body[]): number {
  let energy = 0;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]!;
    energy += 0.5 * a.mass * (a.vx * a.vx + a.vy * a.vy);
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]!;
      const d2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 + SOFTENING_SQUARED;
      energy -= (G_EFFECTIVE * a.mass * b.mass) / Math.sqrt(d2);
    }
  }
  return energy;
}

/** Retire les astres partis trop loin du centre (ils ne reviendront pas à l'écran). Renvoie leur nombre. */
export function removeEscaped(bodies: Body[], limit: number): number {
  let removed = 0;
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i]!;
    if (Math.abs(body.x) > limit || Math.abs(body.y) > limit) {
      bodies.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

// Scénarios. L'origine du repère est au centre de la scène ; y augmente vers le bas, comme à l'écran.

export type PresetName = 'original' | 'binary' | 'cloud' | 'eight' | 'empty';

export const PRESET_LABELS: Record<PresetName, string> = {
  original: 'Système de 2020',
  binary: 'Deux soleils',
  cloud: 'Nuage',
  eight: 'Figure en huit',
  empty: 'Vide',
};

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function preset(name: PresetName, random: () => number = Math.random): Body[] {
  switch (name) {
    case 'original':
      // Les cinq astres nommés du programme de 2020, replacés autour du centre : un soleil d'un million,
      // deux planètes, puis un astre lourd et sa lune.
      return [
        createBody(1_000_000, 0, 0, 0, 0),
        createBody(1_000, 0, -150, 7, 0),
        createBody(100, 0, -350, 4, 0),
        createBody(50_500, 0, 250, -4, 0),
        createBody(1_540, 0, 240, 5, 0),
      ];
    case 'binary': {
      // Deux soleils de même masse en orbite circulaire l'un autour de l'autre, et trois planètes au large.
      const mass = 400_000;
      const half = 110;
      const speed = Math.sqrt((G_EFFECTIVE * mass) / (4 * half));
      const stars = [createBody(mass, -half, 0, 0, speed), createBody(mass, half, 0, 0, -speed)];
      const pair = createBody(2 * mass, 0, 0);
      const planets = [330, 430, 540].map((distance, index) => {
        const angle = index * 2.1;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const v = circularVelocity(x, y, pair);
        return createBody(300 + index * 400, x, y, v.vx, v.vy);
      });
      return [...stars, ...planets];
    }
    case 'cloud': {
      // Un nuage en rotation lente, qui s'effondre et s'agglomère.
      const bodies: Body[] = [];
      for (let i = 0; i < 90; i++) {
        const distance = 60 + Math.sqrt(random()) * 300;
        const angle = random() * Math.PI * 2;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const swirl = 0.0042 * distance;
        bodies.push(
          createBody(
            400 + random() * 5_000,
            x,
            y,
            -Math.sin(angle) * swirl + (random() - 0.5) * 0.3,
            Math.cos(angle) * swirl + (random() - 0.5) * 0.3,
          ),
        );
      }
      return bodies;
    }
    case 'eight': {
      // Trois astres de même masse qui se poursuivent sur un huit (solution de Chenciner et Montgomery, 2000).
      const mass = 20_000;
      const length = 190;
      const speed = Math.sqrt((G_EFFECTIVE * mass) / length);
      const px = 0.97000436 * length;
      const py = 0.24308753 * length;
      const vx = 0.93240737 * speed;
      const vy = 0.86473146 * speed;
      return [
        createBody(mass, px, -py, vx / 2, vy / 2),
        createBody(mass, -px, py, vx / 2, vy / 2),
        createBody(mass, 0, 0, -vx, -vy),
      ];
    }
    case 'empty':
      return [];
  }
}
