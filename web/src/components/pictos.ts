// Pictogrammes en trait continu, dessinés comme des tubes pliés (grille de 64 unités, bouts arrondis).
// Chaque entrée est une suite d'éléments SVG, rendue deux fois par Picto.astro : le verre, puis la lumière.

export type PictoName = 'gravity' | 'waves' | 'population' | 'molar' | 'gcd' | 'scale';

export const PICTOS: Record<PictoName, string> = {
  // Un astre, son orbite inclinée, une lune.
  gravity:
    '<circle cx="32" cy="32" r="8"/><ellipse cx="32" cy="32" rx="27" ry="11" transform="rotate(-24 32 32)"/><circle cx="56.5" cy="21" r="2.6"/>',
  // Une source et trois fronts d'onde.
  waves:
    '<circle cx="15" cy="32" r="3.2"/><path d="M24 21a15 15 0 0 1 0 22"/><path d="M33 13a26 26 0 0 1 0 38"/><path d="M42 6a37 37 0 0 1 0 52"/>',
  // Trois individus d'âges différents (le rayon suit l'âge, comme dans le programme d'origine) et une plante.
  population:
    '<circle cx="19" cy="23" r="8"/><circle cx="43" cy="17" r="5"/><circle cx="16" cy="48" r="3.2"/><path d="M45 32l11 22H34z"/>',
  // Un cycle à six côtés.
  molar: '<path d="M32 7l21.6 12.5v25L32 57 10.4 44.5v-25z"/><circle cx="32" cy="32" r="10.5"/>',
  // Un rectangle découpé en carrés de plus en plus petits : l'algorithme d'Euclide.
  gcd: '<rect x="6" y="16" width="52" height="32" rx="2"/><path d="M38 16v32M38 36h20M50 36v12M50 44h8"/>',
  // Une balance.
  scale:
    '<path d="M32 12v40M21 52h22M12 21h40"/><path d="M12 21L5 38a7.6 7.6 0 0 0 14 0z"/><path d="M52 21l-7 17a7.6 7.6 0 0 0 14 0z"/>',
};
