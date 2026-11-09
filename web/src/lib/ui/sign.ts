// L'enseigne de l'accueil : elle s'incline vers le pointeur (la police Tilt Neon tourne sur deux axes),
// chaque lettre s'éteint ou se rallume d'un clic, et un tube fatigué bat de temps en temps.
import { onThemeChange, prefersReducedMotion, tubesOn } from './theme';

const MAX_Y_ROTATION = 26;
const MAX_X_ROTATION = 18;
/** Pose de repos : légèrement tournée, comme une enseigne vue de côté. */
const REST = { x: -8, y: 14 };

const sign = document.querySelector<HTMLElement>('[data-sign]');

if (sign) {
  const letters = [...sign.querySelectorAll<HTMLElement>('[data-sign-letter]')];
  const still = prefersReducedMotion();

  const falter = (letter: HTMLElement): void => {
    if (still || !tubesOn()) return;
    letter.classList.remove('is-faltering');
    void letter.offsetWidth;
    letter.classList.add('is-faltering');
    window.setTimeout(() => letter.classList.remove('is-faltering'), 520);
  };

  sign.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const letter = event.target.closest<HTMLElement>('[data-sign-letter]');
    if (!letter) return;
    const nowOff = letter.classList.toggle('is-off');
    if (!nowOff) falter(letter);
  });

  // Inclinaison : la cible suit le pointeur, la pose la rattrape en douceur.
  const pose = { ...REST };
  const target = { ...REST };
  let frame = 0;

  const apply = (): void => {
    sign.style.setProperty('--xrot', pose.x.toFixed(2));
    sign.style.setProperty('--yrot', pose.y.toFixed(2));
  };

  const step = (): void => {
    pose.x += (target.x - pose.x) * 0.12;
    pose.y += (target.y - pose.y) * 0.12;
    apply();
    frame = Math.abs(target.x - pose.x) + Math.abs(target.y - pose.y) > 0.05 ? requestAnimationFrame(step) : 0;
  };

  apply();

  if (!still && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener(
      'pointermove',
      (event) => {
        const box = sign.getBoundingClientRect();
        const nx = (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
        const ny = (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2);
        target.y = Math.max(-1, Math.min(1, nx)) * MAX_Y_ROTATION;
        target.x = Math.max(-1, Math.min(1, -ny)) * MAX_X_ROTATION;
        if (!frame) frame = requestAnimationFrame(step);
      },
      { passive: true },
    );
  }

  // Le tube fatigué : une lettre allumée, tirée au hasard, bat toutes les 7 à 15 secondes.
  if (!still) {
    const scheduleFalter = (): void => {
      window.setTimeout(
        () => {
          const lit = letters.filter((letter) => !letter.classList.contains('is-off'));
          const letter = lit[Math.floor(Math.random() * lit.length)];
          if (letter && !document.hidden) falter(letter);
          scheduleFalter();
        },
        7000 + Math.random() * 8000,
      );
    };
    scheduleFalter();
  }

  onThemeChange(apply);
}
