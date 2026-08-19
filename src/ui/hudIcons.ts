export type HudIcon =
  | 'funds' | 'population' | 'food' | 'materials' | 'satisfaction'
  | 'residential' | 'production' | 'civic' | 'expansion' | 'policies'
  | 'pause' | 'play' | 'help' | 'close';

const PATHS: Readonly<Record<HudIcon, string>> = {
  funds: '<circle cx="12" cy="12" r="8"/><path d="M9 10.2c0-1.1 1.2-2 3-2s3 .9 3 2-1.2 1.8-3 1.8-3 .9-3 2 1.2 2 3 2 3-.9 3-2M12 6v12"/>',
  population: '<path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 11a3 3 0 0 0 0-6M21 20v-2a4 4 0 0 0-3-3.9"/>',
  food: '<path d="M12 22V9M7 3c3 0 5 2 5 5-3 0-5-2-5-5ZM17 5c-3 0-5 2-5 5 3 0 5-2 5-5ZM6 14c3 0 6 2 6 5-3 0-6-2-6-5Z"/>',
  materials: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  satisfaction: '<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 14c1 3 7 3 8 0"/>',
  residential: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/>',
  production: '<path d="M3 21V9l6 3V9l6 3V5h4v16H3ZM7 17h2M12 17h2M17 17h2"/>',
  civic: '<path d="m3 9 9-6 9 6M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M3 21h18"/>',
  expansion: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M3 8l6 6M21 8l-6 6M3 16l6-6M21 16l-6-6"/>',
  policies: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.2 2.3c-1 .6-1.7 1.1-1.7 2.2M12 17h.01"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

export function createHudIcon(name: HudIcon): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hud-icon');
  svg.innerHTML = PATHS[name];
  return svg;
}
