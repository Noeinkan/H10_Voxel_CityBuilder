import type { Theme } from './theme';

/**
 * Distretto industriale: cielo di smog, ocra e ruggine, verdi ingrigiti.
 *
 * La nebbia e' densa apposta, e' meta' del carattere del tema. Il sole e' basso
 * e filtrato: intensita' ridotta e cielo molto presente, come sotto una foschia
 * che diffonde tutto.
 */
export const industrial: Theme = {
  id: 'industrial',
  name: 'Industrial',
  colors: [
    '#000000', // empty
    // asfalto consumato
    '#4a453d', '#5c564b', '#332f29',
    // cemento sporco
    '#7d7669', '#968e7e', '#b3aa98', '#cfc6b2',
    // terra e sabbia compatte
    '#a8905f', '#8a7146', '#6b5735', '#4c3f28',
    // vetro industriale, verdastro
    '#7f9a8e', '#5b7268', '#a8c2b6', '#3d4f47',
    // mattone e ruggine
    '#a34d33', '#7a3523', '#c9724f',
    '#6b4a2f', // wood
    // verdi ingrigiti
    '#6f7d45', '#535f34', '#8c9a5c', '#adb97e',
    // acqua torbida
    '#4f6b63', '#2f423d',
    // metalli
    '#d1a13c', '#e8c877', '#b35c22', '#5e4a2a',
    // tetti in lamiera
    '#c2b8a4', '#e0d8c8',
  ],
  atmosphere: {
    background: '#b6ab96',
    sun: { azimuth: 28, elevation: 44, color: '#ffe1a8', intensity: 0.6, wrap: 0.46 },
    skyLight: { color: '#bdb49f', intensity: 0.58 },
    bounceLight: { color: '#7a6a4e', intensity: 0.34 },
    aoStrength: 0.6,
    colorJitter: 0.24,
    fog: {
      color: '#c2b7a2',
      density: 0.00028,
      skyBlend: 0.5,
      heightBase: 8,
      heightFalloff: 0.018,
      sunTint: 0.42,
    },
    sky: {
      top: '#9a917c',
      horizon: '#d8caae',
      sunGlow: 0.7,
      cloudAmount: 0.68,
      cloudSpeed: 0.005,
      cloudTint: '#cfc4ac',
    },
    shadow: { strength: 0.5, softness: 2.6 },
    bloom: { threshold: 1.35, strength: 0.28, radius: 0.55 },
    tilt: { strength: 0.32, focus: 0.5, width: 0.44 },
    emissiveStrength: 0.48,
    toneMapping: 'aces',
    exposure: 1,
  },
};
