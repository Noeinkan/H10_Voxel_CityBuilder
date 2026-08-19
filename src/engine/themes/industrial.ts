import type { Theme } from './theme';

/**
 * Distretto industriale: cielo di smog, ocra e ruggine, verdi ingrigiti.
 * La nebbia e' densa apposta, e' meta' del carattere del tema.
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
    fogColor: '#c2b7a2',
    fogDensity: 0.00028,
    faceLight: [0.9, 0.68, 0.8, 0.6, 1.0, 0.5],
    aoStrength: 0.6,
    emissiveStrength: 0.48,
    toneMapping: 'aces',
    exposure: 1,
  },
};
