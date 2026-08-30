// Dalla sorgente senza Three, non da `palette.ts`: e' cio' che rende la tabella
// dei temi importabile dal titolo, che si disegna prima che il mondo esista.
import { paletteHex } from '../paletteHex';
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
    // Sole verso est-nordest: i due lati che la camera vede a yaw 45 ricevono
    // luci diverse, ed e' quello che da' il volume. Sotto i ~30 gradi di
    // elevazione una parete supererebbe il tetto e il diorama si appiattirebbe.
    sun: { azimuth: 36, elevation: 48, color: '#fff2d6', intensity: 0.86, wrap: 0.34 },
    skyLight: { color: '#a9cdf2', intensity: 0.5 },
    // Il rimbalzo e' verde perche' sotto c'e' il prato: le facce basse lo prendono.
    bounceLight: { color: '#7d8a63', intensity: 0.26 },
    aoStrength: 0.55,
    skyOcclusion: 0.5,
    colorJitter: 0.2,
    fog: {
      color: '#cfe9f7',
      density: 0.0003,
      skyBlend: 0.55,
      heightBase: 24,
      heightFalloff: 0.005,
      altitudeLift: 0.1,
      sunTint: 0.3,
    },
    sky: {
      top: '#5ba3dd',
      horizon: '#dceffb',
      sunGlow: 0.5,
      cloudAmount: 0.45,
      cloudSpeed: 0.01,
      cloudTint: '#ffffff',
    },
    // I banchi che avvolgono le cime. Il cuore sta a 120, cioe' sopra le quote
    // abitate della 4.9 e in mezzo alle sole torri: la lastra va da 100 a 140 e
    // il tessuto ordinario le resta tutto sotto, pulito. Senza tinta propria —
    // prende quella della nebbia, che segue il cielo e l'ora.
    cloudDeck: {
      height: 120,
      thickness: 40,
      amount: 0.8,
      coverage: 0.4,
      cellSize: 6,
      scale: 80,
      speed: 0.01,
    },
    shadow: { strength: 0.9, softness: 1.4 },
    bloom: { threshold: 1.25, strength: 0.3, radius: 0.5 },
    tilt: { strength: 0.35, focus: 0.5, width: 0.42 },
    water: {
      highlight: '#d6f4ff',
      strength: 0.15,
      scale: 0.22,
      speed: 0.5,
      shallowTint: '#e8dcb0',
      calm: 0.55,
      glitter: 0.5,
    },
    toneMapping: 'aces',
    exposure: 1.05,
  },
};
