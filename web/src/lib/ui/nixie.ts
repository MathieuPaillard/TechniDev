// Afficheur à tubes : chaque chiffre dans son ampoule. Le texte lisible par un lecteur d'écran est tenu à part
// (région aria-live voisine) : l'afficheur lui-même est décoratif.
import { h } from './dom';

/**
 * Écrit une valeur dans un afficheur. Les chiffres qui changent battent un instant, comme un tube qui s'amorce.
 * `unit` s'affiche en petit après la valeur.
 */
export function setNixie(display: HTMLElement, value: string, unit = ''): void {
  const previous = display.dataset.value ?? '';
  if (previous === value && display.dataset.unit === unit) return;
  display.dataset.value = value;
  display.dataset.unit = unit;

  const nodes: HTMLElement[] = [];
  // Alignés par la droite : le chiffre des unités reste comparé à celui des unités.
  const offset = previous.length - value.length;
  [...value].forEach((char, index) => {
    if (/\d/.test(char)) {
      const changed = previous[index + offset] !== char;
      nodes.push(h('span', { class: changed ? 'nixie-digit is-changed' : 'nixie-digit', text: char }));
    } else if (char.trim() === '') {
      nodes.push(h('span', { class: 'nixie-gap' }));
    } else {
      nodes.push(h('span', { class: 'nixie-sep', text: char }));
    }
  });
  if (unit) nodes.push(h('span', { class: 'nixie-unit', text: unit }));
  display.replaceChildren(...nodes);
}
