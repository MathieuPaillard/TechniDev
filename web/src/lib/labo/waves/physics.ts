// Ondes : des sources qui émettent des fronts d'onde circulaires, et qui peuvent s'attirer. Fonctions pures.
//
// Portage de simulationSourceEmission (Java et JavaFX, 2025). Repris du programme d'origine :
// - une onde part de l'endroit où se trouvait la source à l'émission, grandit à vitesse constante
//   (30 px/s) et s'efface en s'éloignant (elle disparaît à 400 px) ;
// - les sources s'attirent selon Newton, avec G = 10 et une distance au carré plafonnée à 100 par le bas ;
// - le rayon d'une source vaut la moitié de ∛(3·masse / 4π), jamais moins de 1.
// Une source plus rapide que son onde la rattrape : les fronts s'empilent en cône (le « mur du son »).

export const ORIGINAL_WAVE_SPEED = 30;
export const ORIGINAL_MAX_RADIUS = 400;
export const ORIGINAL_PERIOD = 0.5;
export const ORIGINAL_G = 10;
/** Plancher de la distance au carré dans la force : deux sources très proches ne s'éjectent pas. */
export const MIN_DISTANCE_SQUARED = 100;

export interface Source {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  /** Temps écoulé depuis la dernière émission, en secondes. */
  clock: number;
  /** Posée par le visiteur (dessinée dans la seconde teinte) ou présente dans le scénario. */
  launched: boolean;
}

export interface Ring {
  x: number;
  y: number;
  radius: number;
  launched: boolean;
}

export interface WaveWorld {
  sources: Source[];
  rings: Ring[];
  time: number;
}

export interface WaveParams {
  /** Vitesse de l'onde, en px/s. */
  waveSpeed: number;
  /** Durée entre deux fronts, en secondes. */
  period: number;
  /** Rayon auquel un front disparaît. */
  maxRadius: number;
  /** Les sources s'attirent-elles ? */
  gravity: boolean;
  /** Demi-largeur et demi-hauteur d'une boîte sur les bords de laquelle les sources rebondissent, ou null. */
  bounds: { x: number; y: number } | null;
}

export const DEFAULT_PARAMS: WaveParams = {
  waveSpeed: ORIGINAL_WAVE_SPEED,
  period: ORIGINAL_PERIOD,
  maxRadius: ORIGINAL_MAX_RADIUS,
  gravity: true,
  bounds: null,
};

export function sourceRadius(mass: number): number {
  return Math.max(1, Math.cbrt((mass * 3) / (4 * Math.PI)) / 2);
}

let nextId = 1;

export function createSource(mass: number, x: number, y: number, vx = 0, vy = 0, launched = false): Source {
  return { id: nextId++, x, y, vx, vy, mass, radius: sourceRadius(mass), clock: 0, launched };
}

export function createWorld(sources: Source[] = []): WaveWorld {
  return { sources, rings: [], time: 0 };
}

/** Nombre de Mach d'une source : sa vitesse rapportée à celle de l'onde. Au-delà de 1, elle dépasse ses ondes. */
export function machNumber(source: Source, waveSpeed: number): number {
  return waveSpeed > 0 ? Math.hypot(source.vx, source.vy) / waveSpeed : 0;
}

/** Demi-angle du cône de Mach, en degrés, ou null si la source est plus lente que son onde. */
export function machAngle(mach: number): number | null {
  return mach > 1 ? (Math.asin(1 / mach) * 180) / Math.PI : null;
}

function gravityStep(sources: Source[], dt: number): void {
  // Comme dans le programme d'origine : les vitesses changent d'abord, d'après les positions du début du pas.
  const ax = new Float64Array(sources.length);
  const ay = new Float64Array(sources.length);
  for (let i = 0; i < sources.length; i++) {
    const a = sources[i]!;
    for (let j = i + 1; j < sources.length; j++) {
      const b = sources[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = Math.max(MIN_DISTANCE_SQUARED, dx * dx + dy * dy);
      const distance = Math.sqrt(d2);
      const pull = ORIGINAL_G / (d2 * distance);
      ax[i] = ax[i]! + dx * pull * b.mass;
      ay[i] = ay[i]! + dy * pull * b.mass;
      ax[j] = ax[j]! - dx * pull * a.mass;
      ay[j] = ay[j]! - dy * pull * a.mass;
    }
  }
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    source.vx += ax[i]! * dt;
    source.vy += ay[i]! * dt;
  }
}

/**
 * Avance le monde de dt secondes, en sous-pas d'au plus maxStep. Chaque source se déplace, émet un front à
 * chaque période écoulée, et les fronts grandissent puis disparaissent.
 */
export function advance(world: WaveWorld, dt: number, params: WaveParams, maxStep = 1 / 120): void {
  if (!(dt > 0)) return;
  const steps = Math.max(1, Math.ceil(dt / maxStep));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    // Les fronts déjà émis grandissent d'abord : ceux qui naissent pendant ce sous-pas reçoivent leur rayon exact.
    for (const ring of world.rings) ring.radius += params.waveSpeed * h;
    if (params.gravity) gravityStep(world.sources, h);
    for (const source of world.sources) {
      source.x += source.vx * h;
      source.y += source.vy * h;
      if (params.bounds) {
        // Rebond : ce qui a dépassé le bord est rendu de l'autre côté, la vitesse s'inverse.
        if (Math.abs(source.x) > params.bounds.x) {
          source.x = Math.sign(source.x) * (2 * params.bounds.x - Math.abs(source.x));
          source.vx = -source.vx;
        }
        if (Math.abs(source.y) > params.bounds.y) {
          source.y = Math.sign(source.y) * (2 * params.bounds.y - Math.abs(source.y));
          source.vy = -source.vy;
        }
      }
      source.clock += h;
      if (source.clock >= params.period) {
        source.clock -= params.period;
        // Le front est né il y a `clock` secondes : il a déjà ce rayon.
        world.rings.push({
          x: source.x - source.vx * source.clock,
          y: source.y - source.vy * source.clock,
          radius: params.waveSpeed * source.clock,
          launched: source.launched,
        });
      }
    }
    world.time += h;
  }
  let kept = 0;
  for (const ring of world.rings) {
    if (ring.radius <= params.maxRadius) world.rings[kept++] = ring;
  }
  world.rings.length = kept;
}

/** Éclat d'un front selon son rayon : plein à l'émission, nul au rayon maximal (comme en 2025). */
export function ringStrength(radius: number, maxRadius: number): number {
  return Math.max(0, 1 - radius / maxRadius);
}

/**
 * Hauteur de l'onde au point (x, y) : la somme des ondes de chaque source, chacune valant 1 sur ses crêtes
 * et −1 dans ses creux. Les sources sont prises là où elles sont maintenant : c'est exact pour des sources
 * immobiles, approché pour des sources lentes.
 */
export function amplitudeAt(x: number, y: number, sources: readonly Source[], params: WaveParams): number {
  const wavelength = params.waveSpeed * params.period;
  let total = 0;
  for (const source of sources) {
    const distance = Math.hypot(x - source.x, y - source.y);
    if (distance > params.maxRadius) continue;
    const phase = distance / wavelength - source.clock / params.period;
    total += Math.cos(2 * Math.PI * phase) * ringStrength(distance, params.maxRadius);
  }
  return total;
}

/** Retire les sources parties trop loin. Renvoie leur nombre. */
export function removeEscaped(world: WaveWorld, limit: number): number {
  const before = world.sources.length;
  world.sources = world.sources.filter((source) => Math.abs(source.x) <= limit && Math.abs(source.y) <= limit);
  return before - world.sources.length;
}

export type PresetName = 'pair' | 'doppler' | 'mach' | 'ballet' | 'empty';

export const PRESET_LABELS: Record<PresetName, string> = {
  pair: 'Deux sources',
  doppler: 'Effet Doppler',
  mach: 'Mur du son',
  ballet: 'Ballet de 2025',
  empty: 'Vide',
};

export interface Preset {
  sources: Source[];
  params: WaveParams;
}

export function preset(name: PresetName): Preset {
  switch (name) {
    case 'pair':
      // Deux sources immobiles : leurs fronts se croisent et dessinent des lignes d'interférence.
      return {
        sources: [createSource(40, -110, 0), createSource(40, 110, 0)],
        params: { ...DEFAULT_PARAMS, waveSpeed: 90, period: 0.6, maxRadius: 620, gravity: false },
      };
    case 'doppler':
      // Une source à 60 % de la vitesse de l'onde : les fronts se serrent devant, s'espacent derrière.
      return {
        sources: [createSource(40, -360, 0, 54, 0)],
        params: { ...DEFAULT_PARAMS, waveSpeed: 90, period: 0.45, maxRadius: 620, gravity: false, bounds: { x: 380, y: 240 } },
      };
    case 'mach':
      // Une source 1,7 fois plus rapide que son onde : les fronts s'empilent en cône derrière elle.
      return {
        sources: [createSource(40, -360, 0, 153, 0)],
        params: { ...DEFAULT_PARAMS, waveSpeed: 90, period: 0.3, maxRadius: 620, gravity: false, bounds: { x: 380, y: 240 } },
      };
    case 'ballet':
      // Le système du programme de 2025, replacé autour du centre : une source lourde, des planètes qui
      // filent toutes plus vite que leur onde (30 px/s), et au large un astre avec ses cinq lunes.
      return {
        sources: [
          createSource(100_000, 0, 0, 0, 0),
          createSource(10, -70, 0, 0, -100),
          createSource(10, -170, 0, 0, -80),
          createSource(10, 130, 0, 0, 90),
          createSource(10, 230, 0, 0, 70),
          createSource(130, 380, 0, 0, 55),
          createSource(200, 0, -295, 55, 0),
          createSource(1, 30, 0, 0, 170),
          createSource(1_000, 0, -625, 40, 0),
          createSource(1, 0, -630, 40, 20),
          createSource(1, 0, -620, 45, 0),
          createSource(3_890, -870, 0, 0, -37),
          createSource(2, -870, -10, 50, -37),
          createSource(2, -870, 20, 45, -37),
          createSource(2, -870, -30, 40, -37),
          createSource(2, -870, 40, 35, -37),
          createSource(2, -870, -50, 30, -37),
        ],
        params: { ...DEFAULT_PARAMS },
      };
    case 'empty':
      return { sources: [], params: { ...DEFAULT_PARAMS, waveSpeed: 90, period: 0.5, maxRadius: 620, gravity: true } };
  }
}
