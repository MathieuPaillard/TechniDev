// Petits outils pour brancher les commandes d'une démo.

/** L'élément portant cet identifiant, du type attendu. Lève une erreur claire s'il manque. */
export function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Élément #${id} introuvable ou d'un autre type`);
  return element;
}

/** Crée un élément avec ses classes, son texte et ses attributs, sans passer par innerHTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.class) element.className = options.class;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

/** La valeur du bouton radio coché dans un groupe. */
export function checkedValue(name: string, root: ParentNode = document): string | null {
  return root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? null;
}

/** Annonce un message aux lecteurs d'écran, sans déplacer le focus. */
export function announce(region: HTMLElement, message: string): void {
  region.textContent = '';
  // Un texte identique deux fois de suite ne serait pas relu : on laisse passer une image.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}
