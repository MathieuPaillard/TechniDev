// Halo prêt à l'emploi : un disque lumineux dessiné une fois, puis collé autant de fois qu'il le faut.
// Bien moins coûteux que de demander au canvas une ombre floue pour chaque astre.
import { rgba, type Rgb } from './theme';

const SIZE = 96;

/** Un halo : cœur presque blanc, bord de la couleur du tube, lumière qui s'éteint vers l'extérieur. */
export function createGlowSprite(core: Rgb, tube: Rgb, halo: Rgb): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = SIZE;
  sprite.height = SIZE;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const half = SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, rgba(core, 1));
  gradient.addColorStop(0.14, rgba(core, 0.95));
  gradient.addColorStop(0.24, rgba(tube, 0.7));
  gradient.addColorStop(0.5, rgba(halo, 0.22));
  gradient.addColorStop(1, rgba(halo, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return sprite;
}

/** Colle un halo centré en (x, y), de rayon lumineux `radius`. */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
}
