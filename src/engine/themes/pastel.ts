import type { Theme } from './theme';

/**
 * Metropoli pastello in controluce: cielo caldo e pallido, volumi color crema e
 * blu-grigio, accenti arancio a spezzare. Il tema piu' vicino alla scena `city`.
 */
export const pastel: Theme = {
  id: 'pastel',
  name: 'Sunny Pastel',
  colors: [
    '#000000', // empty
    // asfalto: azzurro polveroso, non nero
    '#8d9aa6', '#a3b0bb', '#6e7b87',
    // corpi chiari
    '#c3cdd4', '#dbe3e8', '#edf2f5', '#fbfdfe',
    // pietra e sabbia, molto sbiancate
    '#e8dfcd', '#d5c7ad', '#b7a68c', '#8d7f6a',
    // vetro: azzurro freddo
    '#9fc6dd', '#6d9db9', '#d3e9f4', '#4a7794',
    // accento arancio, il segno distintivo del riferimento
    '#e8794a', '#c25730', '#ffa06b',
    '#a87a5c', // wood
    // verdi tenui
    '#8fb583', '#6d9463', '#aecfa0', '#cde3bd',
    // acqua
    '#7fb8c9', '#4e8ba3',
    // metalli caldi
    '#f0c98a', '#ffe4b5', '#d98c56', '#9a6c4a',
    // tetti
    '#f2ece0', '#ffffff',
  ],
  atmosphere: {
    background: '#dfe9e6',
    fogColor: '#e8efeb',
    fogDensity: 0.0002,
    faceLight: [0.98, 0.72, 0.86, 0.64, 1.0, 0.52],
    aoStrength: 0.42,
    toneMapping: 'aces',
    exposure: 1.15,
  },
};
