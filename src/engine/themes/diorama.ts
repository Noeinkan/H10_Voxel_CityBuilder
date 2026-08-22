import type { Theme } from './theme';

/**
 * Look principale: un modellino urbano caldo, leggibile e con ombre fredde.
 *
 * E' il tema che spinge piu' a fondo il modello: sole caldo e netto contro
 * cielo azzurro forte, cioe' la coppia che produce da sola le ombre azzurre.
 * Prima la stessa cosa si otteneva a mano con `lightTint`/`shadowTint`; ora e'
 * una conseguenza, non una correzione applicata sopra.
 *
 * Tilt-shift alto: e' il segnale percettivo che dice "modellino".
 */
export const diorama: Theme = {
  id: 'diorama',
  name: 'Warm Diorama',
  colors: [
    '#000000',
    '#59626a', '#68727a', '#424a50',
    '#b59f85', '#d0bba0', '#ead7ba', '#fff1d5',
    '#d1b67f', '#b9945c', '#806a4b', '#564638',
    '#6bb7c7', '#347e93', '#b8e2e7', '#24566c',
    '#d7684a', '#a94435', '#ef9470',
    '#79543b',
    '#73a85b', '#4f7e45', '#95c979', '#c6dfa2',
    '#48a9c2', '#266d91',
    '#e5b857', '#f4d68a', '#c27645', '#624f43',
    '#e8dfce', '#fff9e9',
  ],
  atmosphere: {
    background: '#b9dced',
    sun: { azimuth: 34, elevation: 42, color: '#ffdca6', intensity: 1.0, wrap: 0.24 },
    skyLight: { color: '#8fc0e8', intensity: 0.52 },
    bounceLight: { color: '#8a7a5e', intensity: 0.24 },
    aoStrength: 0.6,
    skyOcclusion: 0.55,
    colorJitter: 0.2,
    fog: {
      color: '#eadcc7',
      density: 0.00026,
      skyBlend: 0.5,
      heightBase: 24,
      heightFalloff: 0.0055,
      // Un plastico su un tavolo non ha foschia al suolo: il velo resta un accenno.
      altitudeLift: 0.06,
      sunTint: 0.45,
    },
    sky: {
      top: '#4f9ed4',
      horizon: '#f7e3c4',
      sunGlow: 0.6,
      cloudAmount: 0.5,
      cloudSpeed: 0.01,
      cloudTint: '#fffaf0',
    },
    shadow: { strength: 1.0, softness: 1.0 },
    bloom: { threshold: 1.3, strength: 0.32, radius: 0.55 },
    tilt: { strength: 0.55, focus: 0.5, width: 0.34 },
    glassTint: '#bdeaf2',
    glassLift: 0.18,
    water: {
      highlight: '#c7f3ea',
      strength: 0.18,
      scale: 0.12,
      speed: 0.55,
      shallowTint: '#f0dfae',
      calm: 0.5,
      // Un plastico non ha mare aperto vero: il riflesso resta un accenno.
      glitter: 0.35,
    },
    toneMapping: 'aces',
    exposure: 1,
  },
};
