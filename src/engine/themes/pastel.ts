import type { Theme } from './theme';

/**
 * Metropoli pastello in controluce: cielo caldo e pallido, volumi color crema e
 * blu-grigio, accenti arancio a spezzare. Il tema piu' vicino alla scena `city`.
 *
 * Il carattere sta nel contrasto basso: `wrap` alto e rimbalzo generoso, cosi'
 * nessuna faccia sprofonda. E' l'opposto di `diorama`.
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
    sun: { azimuth: 30, elevation: 52, color: '#fff6e4', intensity: 0.72, wrap: 0.52 },
    skyLight: { color: '#cfdfe6', intensity: 0.62 },
    bounceLight: { color: '#c9bda6', intensity: 0.4 },
    aoStrength: 0.42,
    skyOcclusion: 0.38,
    colorJitter: 0.14,
    fog: {
      color: '#e8efeb',
      density: 0.00034,
      skyBlend: 0.6,
      heightBase: 24,
      heightFalloff: 0.0045,
      altitudeLift: 0.12,
      sunTint: 0.34,
    },
    sky: {
      top: '#9dc3d8',
      horizon: '#fbf1e2',
      sunGlow: 0.62,
      cloudAmount: 0.5,
      cloudSpeed: 0.008,
      cloudTint: '#fffaf2',
    },
    shadow: { strength: 0.62, softness: 2.2 },
    bloom: { threshold: 1.3, strength: 0.34, radius: 0.6 },
    tilt: { strength: 0.4, focus: 0.52, width: 0.4 },
    toneMapping: 'aces',
    exposure: 1.15,
  },
};
