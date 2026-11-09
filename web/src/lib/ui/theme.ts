// Gaz des tubes et interrupteur général. L'état vit sur <html> (data-gas, data-tubes), il est retenu dans le
// navigateur (localStorage) et annoncé par des événements : les simulations se recolorent quand le gaz change.

export const GASES = ['he', 'ne', 'ar', 'kr', 'xe'] as const;
export type Gas = (typeof GASES)[number];

export interface GasInfo {
  symbol: string;
  name: string;
  number: number;
}

export const GAS_INFO: Record<Gas, GasInfo> = {
  he: { symbol: 'He', name: 'Hélium', number: 2 },
  ne: { symbol: 'Ne', name: 'Néon', number: 10 },
  ar: { symbol: 'Ar', name: 'Argon', number: 18 },
  kr: { symbol: 'Kr', name: 'Krypton', number: 36 },
  xe: { symbol: 'Xe', name: 'Xénon', number: 54 },
};

export const DEFAULT_GAS: Gas = 'ar';

const GAS_KEY = 'technidev.gas';
const TUBES_KEY = 'technidev.tubes';
const THEME_EVENT = 'technidev:theme';

export function isGas(value: unknown): value is Gas {
  return typeof value === 'string' && (GASES as readonly string[]).includes(value);
}

/** Le gaz qui suit dans l'ordre du tableau périodique, en boucle. */
export function nextGas(gas: Gas): Gas {
  const index = GASES.indexOf(gas);
  return GASES[(index + 1) % GASES.length] ?? DEFAULT_GAS;
}

export function currentGas(): Gas {
  const value = document.documentElement.dataset.gas;
  return isGas(value) ? value : DEFAULT_GAS;
}

export function tubesOn(): boolean {
  return document.documentElement.dataset.tubes !== 'off';
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : le choix vaut pour cette page seulement.
  }
}

function announce(): void {
  document.dispatchEvent(new CustomEvent(THEME_EVENT));
}

export function setGas(gas: Gas): void {
  if (gas === currentGas()) return;
  const root = document.documentElement;
  root.dataset.gas = gas;
  remember(GAS_KEY, gas);
  // Le tube se vide puis se rallume : les éléments marqués rejouent leur amorçage (voir neon.css, classe regas).
  root.classList.remove('regas');
  void root.offsetWidth;
  root.classList.add('regas');
  window.setTimeout(() => root.classList.remove('regas'), 900);
  announce();
}

export function setTubes(on: boolean): void {
  if (on === tubesOn()) return;
  const root = document.documentElement;
  if (on) delete root.dataset.tubes;
  else root.dataset.tubes = 'off';
  remember(TUBES_KEY, on ? 'on' : 'off');
  announce();
}

/** Prévient à chaque changement de gaz ou d'interrupteur. Renvoie la fonction qui arrête l'écoute. */
export function onThemeChange(listener: () => void): () => void {
  document.addEventListener(THEME_EVENT, listener);
  return () => document.removeEventListener(THEME_EVENT, listener);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type Rgb = [number, number, number];

export interface Palette {
  wall: Rgb;
  plate: Rgb;
  glass: Rgb;
  frost: Rgb;
  tube: Rgb;
  halo: Rgb;
  core: Rgb;
  chalk: Rgb;
  chalkSoft: Rgb;
  phosphor: Rgb;
  /** Les cinq gaz, dans l'ordre He, Ne, Ar, Kr, Xe : couleurs des séries multiples. */
  gases: Rgb[];
}

const PALETTE_VARS: Record<Exclude<keyof Palette, 'gases'>, string> = {
  wall: '--wall',
  plate: '--plate',
  glass: '--glass',
  frost: '--frost',
  tube: '--tube',
  halo: '--halo',
  core: '--core',
  chalk: '--chalk',
  chalkSoft: '--chalk-soft',
  phosphor: '--phosphor',
};

let probe: HTMLSpanElement | null = null;

/** Lit une couleur CSS (variable comprise) et la rend en rouge, vert, bleu. */
function resolveColor(value: string): Rgb {
  if (!probe) {
    probe = document.createElement('span');
    probe.hidden = true;
    document.body.append(probe);
  }
  probe.style.color = value;
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(getComputedStyle(probe).color);
  if (!match) return [255, 255, 255];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Les couleurs du gaz courant, pour dessiner dans un canvas. À relire après chaque changement de gaz. */
export function readPalette(): Palette {
  const read = (name: string): Rgb => resolveColor(`var(${name})`);
  return {
    wall: read(PALETTE_VARS.wall),
    plate: read(PALETTE_VARS.plate),
    glass: read(PALETTE_VARS.glass),
    frost: read(PALETTE_VARS.frost),
    tube: read(PALETTE_VARS.tube),
    halo: read(PALETTE_VARS.halo),
    core: read(PALETTE_VARS.core),
    chalk: read(PALETTE_VARS.chalk),
    chalkSoft: read(PALETTE_VARS.chalkSoft),
    phosphor: read(PALETTE_VARS.phosphor),
    gases: GASES.map((gas) => read(`--gas-${gas}`)),
  };
}

/** « rgb(r g b / a) » pour le canvas. */
export function rgba(color: Rgb, alpha = 1): string {
  return `rgb(${color[0]} ${color[1]} ${color[2]} / ${alpha})`;
}

/** Mélange linéaire de deux couleurs (t = 0 : a, t = 1 : b). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
