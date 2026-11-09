// Ce qui tourne sur toutes les pages : le choix du gaz, l'interrupteur des tubes, la lumière qui suit le
// pointeur sur le mur, et la fin de l'amorçage du premier chargement.
import './controls';
import {
  currentGas,
  GAS_INFO,
  isGas,
  nextGas,
  onThemeChange,
  prefersReducedMotion,
  setGas,
  setTubes,
  tubesOn,
} from './theme';

const root = document.documentElement;

function syncControls(): void {
  const gas = currentGas();
  const info = GAS_INFO[gas];
  const on = tubesOn();

  document.querySelectorAll<HTMLElement>('[data-gas-cycle-number]').forEach((node) => {
    node.textContent = String(info.number);
  });
  document.querySelectorAll<HTMLElement>('[data-gas-cycle-symbol]').forEach((node) => {
    node.textContent = info.symbol;
  });
  document.querySelectorAll<HTMLElement>('[data-gas-cycle-label]').forEach((node) => {
    node.textContent = `Gaz des tubes : ${info.name}. Passer au gaz suivant.`;
  });
  document.querySelectorAll<HTMLInputElement>('[data-gas-choice]').forEach((input) => {
    input.checked = input.value === gas;
  });
  document.querySelectorAll<HTMLElement>('[data-tubes-switch]').forEach((button) => {
    button.setAttribute('aria-checked', String(on));
  });

  // La barre du navigateur (téléphone) prend la couleur du mur.
  const wall = getComputedStyle(root).getPropertyValue('--wall').trim();
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor && wall) themeColor.content = wall;
}

document.querySelectorAll<HTMLButtonElement>('[data-gas-cycle]').forEach((button) => {
  button.addEventListener('click', () => setGas(nextGas(currentGas())));
});

document.querySelectorAll<HTMLInputElement>('[data-gas-choice]').forEach((input) => {
  input.addEventListener('change', () => {
    if (input.checked && isGas(input.value)) setGas(input.value);
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-tubes-switch]').forEach((button) => {
  button.addEventListener('click', () => setTubes(!tubesOn()));
});

onThemeChange(syncControls);
syncControls();

// La lumière sur le mur suit le pointeur (souris ou stylet seulement : au doigt, elle reste où elle est).
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion()) {
  let frame = 0;
  let x = 0;
  let y = 0;
  window.addEventListener(
    'pointermove',
    (event) => {
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        document.body.style.setProperty('--px', `${x}px`);
        document.body.style.setProperty('--py', `${y}px`);
      });
    },
    { passive: true },
  );
}

// L'amorçage ne se joue qu'une fois par visite : la classe posée par public/init.js est retirée à la fin.
if (root.classList.contains('ignite')) {
  try {
    sessionStorage.setItem('technidev.ignited', '1');
  } catch {
    // Sans stockage, l'amorçage se rejouera à la page suivante : sans gravité.
  }
  window.setTimeout(() => root.classList.remove('ignite'), 3200);
}
