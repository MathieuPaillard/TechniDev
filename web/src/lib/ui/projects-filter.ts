// Page Projets : n'afficher que les projets écrits à la main, ou que ceux codés avec une IA.
// Sans script, la liste reste entière.
import { announce, byId } from './dom';

const status = byId('projects-status', HTMLParagraphElement);
const rows = [...document.querySelectorAll<HTMLElement>('[data-project]')];

document.querySelectorAll<HTMLInputElement>('input[name="making"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    let shown = 0;
    for (const row of rows) {
      const visible = input.value === 'all' || row.dataset.making === input.value;
      row.hidden = !visible;
      if (visible) shown++;
    }
    announce(status, `${shown} projet${shown > 1 ? 's' : ''} affiché${shown > 1 ? 's' : ''}.`);
  });
});
