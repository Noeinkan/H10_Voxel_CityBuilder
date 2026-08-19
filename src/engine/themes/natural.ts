import { paletteHex } from '../palette';
import type { Theme } from './theme';

/**
 * Tema di default: diorama diurno, cielo chiaro, verdi saturi.
 *
 * E' l'unico tema che prende i colori da `palette.json` invece che da questo
 * file. Cosi' l'hot reload del JSON continua a servire a qualcosa, e la palette
 * di riferimento resta un dato editabile senza ricompilare.
 */
export const natural: Theme = {
  id: 'natural',
  name: 'Natural Diorama',
  colors: paletteHex,
  atmosphere: {
    background: '#bfe4f5',
    fogColor: '#cfe9f7',
    fogDensity: 0.00018,
    // Sole verso +X, leggermente da +Y: i due lati che la camera vede a yaw 45°
    // ricevono luci diverse, ed e' quello che da' il volume.
    faceLight: [0.95, 0.66, 0.82, 0.58, 1.0, 0.46],
    aoStrength: 0.55,
    toneMapping: 'aces',
    exposure: 1.05,
  },
};
