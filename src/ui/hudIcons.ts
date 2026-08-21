export type HudIcon =
  | 'funds' | 'population' | 'food' | 'materials' | 'satisfaction'
  | 'residential' | 'production' | 'civic' | 'expansion' | 'policies'
  | 'market' | 'factory' | 'park' | 'port' | 'airport' | 'transport' | 'university' | 'monument'
  | 'pause' | 'play' | 'theme' | 'view' | 'help' | 'close';

const PATHS: Readonly<Record<HudIcon, string>> = {
  funds: '<circle cx="12" cy="12" r="8"/><path d="M9 10.2c0-1.1 1.2-2 3-2s3 .9 3 2-1.2 1.8-3 1.8-3 .9-3 2 1.2 2 3 2 3-.9 3-2M12 6v12"/>',
  population: '<path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 11a3 3 0 0 0 0-6M21 20v-2a4 4 0 0 0-3-3.9"/>',
  food: '<path d="M12 22V9M7 3c3 0 5 2 5 5-3 0-5-2-5-5ZM17 5c-3 0-5 2-5 5 3 0 5-2 5-5ZM6 14c3 0 6 2 6 5-3 0-6-2-6-5Z"/>',
  materials: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  satisfaction: '<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 14c1 3 7 3 8 0"/>',
  residential: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/>',
  production: '<path d="M3 21V9l6 3V9l6 3V5h4v16H3ZM7 17h2M12 17h2M17 17h2"/>',
  civic: '<path d="m3 9 9-6 9 6M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M3 21h18"/>',
  market: '<path d="M4 10h16l-2-6H6l-2 6ZM5 10v10h14V10M9 20v-6h6v6M4 10c1 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0"/>',
  factory: '<path d="M3 21V9l6 3V9l6 3V5h4v16H3ZM7 17h2M12 17h2M17 17h2"/>',
  park: '<path d="M12 21v-7M7 14h10l-2-3h2l-5-8-5 8h2l-2 3ZM5 21h14"/>',
  port: '<path d="M12 3v14M8 7h8M5 12c0 5 3 8 7 9 4-1 7-4 7-9M3 12h4M17 12h4"/>',
  airport: '<path d="M12 3c.8 0 1.4.9 1.4 2v4.2l7.1 4v2.1l-7.1-2.2v4.3l2.1 1.6v1.6L12 19.6l-3.5 1V19l2.1-1.6v-4.3l-7.1 2.2v-2.1l7.1-4V5c0-1.1.6-2 1.4-2Z"/>',
  transport: '<path d="M6 18h12M7 18l-2 3M17 18l2 3M5 15V7c0-3 14-3 14 0v8H5ZM8 11h.01M16 11h.01M7 15h10"/>',
  university: '<path d="m3 9 9-6 9 6-9 4-9-4ZM6 11v6M18 11v6M4 20h16M9 12v5M15 12v5"/>',
  monument: '<path d="M8 21h8M9 18h6M10 18V9h4v9M8 9h8l-4-6-4 6Z"/>',
  expansion: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M3 8l6 6M21 8l-6 6M3 16l6-6M21 16l-6-6"/>',
  policies: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  theme: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 1 1 0-4h3a6 6 0 0 0 6-6c0-2.2-4-4-9-4Z"/><path d="M7.5 9h.01M10 6.5h.01M14 6.5h.01M17 9h.01"/>',
  // Tre piani sovrapposti visti di taglio: e' la sagoma che le viste hanno in
  // comune — guardare la citta' un livello alla volta. La 7.2 ridisegnera' tutte
  // le icone su due pesi, questa serve a essere riconoscibile intanto.
  view: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m4 12.5 8 4.5 8-4.5M4 17l8 4.5 8-4.5"/>',
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
