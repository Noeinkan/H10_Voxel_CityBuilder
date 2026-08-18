import type { Theme } from './theme';

/**
 * Bosco incantato: cielo lilla, verdi-turchese, terra viola, oro caldo.
 * Nebbia leggera ma molto colorata: e' quella che tiene insieme il tema.
 */
export const enchanted: Theme = {
  id: 'enchanted',
  name: 'Incantato',
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
    fogColor: '#e4d5f5',
    fogDensity: 0.00022,
    faceLight: [0.94, 0.7, 0.84, 0.62, 1.0, 0.5],
    aoStrength: 0.48,
    toneMapping: 'aces',
    exposure: 1.12,
  },
};
