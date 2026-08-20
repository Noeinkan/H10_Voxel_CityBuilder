import type { Theme } from './theme';

/**
 * Bosco incantato: cielo lilla, verdi-turchese, terra viola, oro caldo.
 *
 * Nebbia leggera ma molto colorata: e' quella che tiene insieme il tema. Il
 * cielo illumina piu' del sole (`skyLight` sopra `sun.intensity`), che e' il
 * modo di ottenere una luce diffusa da sottobosco senza spegnere il volume.
 */
export const enchanted: Theme = {
  id: 'enchanted',
  name: 'Enchanted',
  colors: [
    '#000000', // empty
    // sentieri
    '#6a5a7c', '#7e6d92', '#4e4160',
    // pietra chiara lunare
    '#9a90b5', '#b9b0d0', '#d7d1e6', '#f3f0fa',
    // terra violacea e sabbia rosata
    '#e6c9d6', '#c9a3ba', '#9b7290', '#6b4a68',
    // cristalli
    '#6fe3d8', '#2fadb0', '#bff7f0', '#1d7f8c',
    // funghi e fiori
    '#e2557f', '#b03259', '#ff92ae',
    '#6d4a5c', // wood
    // fogliame
    '#4fc98f', '#2f9b6d', '#8ae8ae', '#c8f5cf',
    // acqua incantata
    '#59b8d8', '#2d6f9c',
    // oro
    '#ffd98a', '#fff0c2', '#d98f5a', '#7a5a56',
    // tetti
    '#f0e4f5', '#fffdff',
  ],
  atmosphere: {
    background: '#d9c7ee',
    sun: { azimuth: 52, elevation: 54, color: '#ffe9c4', intensity: 0.66, wrap: 0.5 },
    skyLight: { color: '#c4b0e8', intensity: 0.68 },
    bounceLight: { color: '#7a5c86', intensity: 0.36 },
    aoStrength: 0.48,
    colorJitter: 0.2,
    fog: {
      color: '#e4d5f5',
      density: 0.00022,
      skyBlend: 0.65,
      heightBase: 10,
      heightFalloff: 0.026,
      sunTint: 0.36,
    },
    sky: {
      top: '#8f6fc9',
      horizon: '#f2e2fa',
      sunGlow: 0.68,
      cloudAmount: 0.42,
      cloudSpeed: 0.009,
      cloudTint: '#fdf2ff',
    },
    shadow: { strength: 0.6, softness: 2.4 },
    bloom: { threshold: 1.1, strength: 0.55, radius: 0.7 },
    tilt: { strength: 0.42, focus: 0.52, width: 0.4 },
    emissiveStrength: 0.7,
    water: { highlight: '#bff2ff', strength: 0.16, scale: 0.22, speed: 0.45 },
    toneMapping: 'aces',
    exposure: 1.12,
  },
};
