// Le mur d'enseignes de l'accueil : chaque pictogramme brille davantage quand le pointeur s'en approche.
import { prefersReducedMotion } from './theme';

const wall = document.querySelector<HTMLElement>('[data-wall]');

if (wall && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion()) {
  const signs = [...wall.querySelectorAll<HTMLElement>('[data-wall-sign]')];
  /** Distance, en pixels, à partir de laquelle une enseigne commence à réagir. */
  const REACH = 320;
  const DIM = 0.5;
  let frame = 0;
  let x = 0;
  let y = 0;

  const update = (): void => {
    frame = 0;
    for (const sign of signs) {
      const box = sign.getBoundingClientRect();
      const distance = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
      const closeness = Math.max(0, 1 - distance / REACH);
      sign.style.setProperty('--lit', (DIM + (1 - DIM) * closeness * closeness).toFixed(3));
    }
  };

  window.addEventListener(
    'pointermove',
    (event) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(update);
    },
    { passive: true },
  );
}
