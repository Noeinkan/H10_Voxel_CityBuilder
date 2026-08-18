import type { Theme } from './theme';

/**
 * Colonia sci-fi: bianchi freddi, teal e magenta, terreno minerale violaceo.
 * Il fondo e' scuro ma non nero, cosi' i bianchi restano bianchi.
 */
export const scifi: Theme = {
  id: 'scifi',
  name: 'Sci-fi',
  colors: [
    '#000000', // empty
    // piastre di atterraggio
    '#2b3440', '#3b4655', '#1d242d',
    // scafi bianchi
    '#7e8b9c', '#a4b2c2', '#ccd8e4', '#f2f7fb',
    // regolite
    '#8a7f96', '#6d6379', '#514859', '#38313e',
    // vetro teal
    '#4fd6d0', '#219f9f', '#b0f5f0', '#146e72',
    // accenti magenta
    '#e04c9a', '#a82f70', '#ff86c1',
    '#4a3f52', // wood
    // vegetazione aliena
    '#41c99a', '#249b74', '#7ee8bd', '#c2f7dd',
    // acqua
    '#1f7fa8', '#0f4a68',
    // leghe
    '#e8c04f', '#ffe193', '#c2643c', '#4f4356',
    // pannelli
    '#dfe7ef', '#ffffff',
  ],
  atmosphere: {
    background: '#151d2b',
    fogColor: '#1e2a3d',
    fogDensity: 0.00025,
    faceLight: [0.92, 0.64, 0.78, 0.56, 1.0, 0.44],
    aoStrength: 0.62,
    toneMapping: 'aces',
    exposure: 1.1,
  },
};
