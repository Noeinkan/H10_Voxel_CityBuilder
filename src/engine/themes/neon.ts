import type { Theme } from './theme';

/**
 * Citta' notturna al neon: volumi freddi e desaturati, accenti elettrici sui
 * vetri e sui metalli.
 *
 * Unico tema senza tone mapping: ACES lava proprio i ciano e i magenta che qui
 * fanno tutto il lavoro.
 */
export const neon: Theme = {
  id: 'neon',
  name: 'Night Neon',
  colors: [
    '#000000', // empty
    // asfalto bagnato
    '#1b2130', '#28303f', '#12161f',
    // corpi: grigi bluastri, volutamente spenti
    '#39445a', '#4d5a72', '#6b7a92', '#93a2b8',
    // pietra e sabbia in luce lunare
    '#5a5f70', '#474d5e', '#343a49', '#222733',
    // vetro: e' qui che vive il neon
    '#2ce8f0', '#0f9fb5', '#a8fbff', '#0a6d85',
    // insegne magenta
    '#ff3d81', '#c01f5c', '#ff7fb0',
    '#3a2f33', // wood
    // verdi acidi
    '#3ce07a', '#1f9b52', '#7dff9f', '#c6ffcf',
    // acqua che riflette le insegne
    '#12496e', '#0a2b45',
    // metalli
    '#ffd23f', '#ffee9c', '#e0722a', '#5c4a2e',
    // tetti
    '#7a879c', '#c3cede',
  ],
  atmosphere: {
    background: '#0b1020',
    fogColor: '#131c33',
    fogDensity: 0.0003,
    faceLight: [0.88, 0.6, 0.74, 0.52, 1.0, 0.4],
    aoStrength: 0.7,
    glassTint: '#62f7ff',
    glassLift: 0.24,
    emissiveStrength: 1.15,
    toneMapping: 'none',
    exposure: 1,
  },
};
