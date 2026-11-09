// Curseurs : la partie parcourue du fil s'allume. Chromium et Safari n'ont pas de pseudo-élément pour elle,
// alors la position est donnée au style par la variable --fill.

function updateFill(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--fill', `${Math.min(100, Math.max(0, percent))}%`);
}

/** À rappeler après avoir changé la valeur d'un curseur par le code. */
export function refreshRanges(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(updateFill);
}

document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === 'range') updateFill(event.target);
});

refreshRanges();
