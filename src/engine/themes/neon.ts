import type { Theme } from './theme';

/**
 * Citta' notturna al neon: volumi freddi e desaturati, accenti elettrici sui
 * vetri e sui metalli.
 *
 * Unico tema senza tone mapping: ACES lava proprio i ciano e i magenta che qui
 * fanno tutto il lavoro. Il "sole" e' una luna: intensita' bassa e tenuta alta
 * nel cielo, cosi' i tetti restano leggibili e la scena la illuminano di fatto
 * gli emissivi, che il bloom raccoglie.
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
    sun: { azimuth: 42, elevation: 62, color: '#9fc4ff', intensity: 0.3, wrap: 0.28 },
    skyLight: { color: '#243a63', intensity: 0.44 },
    // Rimbalzo magenta: e' l'asfalto bagnato che rimanda le insegne verso l'alto.
    bounceLight: { color: '#5c1f47', intensity: 0.3 },
    aoStrength: 0.7,
    // Il buio sotto gli impalcati e' il tema: e' li' che la citta' a livelli si
    // legge come tale invece che come un unico volume.
    skyOcclusion: 0.7,
    colorJitter: 0.22,
    fog: {
      color: '#131c33',
      density: 0.00048,
      skyBlend: 0.4,
      heightBase: 18,
      heightFalloff: 0.004,
      // Lo smog al suolo e' il tema: e' il velo piu' forte dei sette.
      altitudeLift: 0.16,
      sunTint: 0.12,
    },
    sky: {
      top: '#05070f',
      horizon: '#1d2b4d',
      sunGlow: 0.22,
      cloudAmount: 0.3,
      cloudSpeed: 0.006,
      cloudTint: '#2a3a5c',
    },
    // Banchi piu' bassi e piu' fitti degli altri due: qui lo smog sale, e le
    // quote abitate piu' ardite ci entrano dentro invece di stargli sotto. La
    // tinta e' il viola che l'asfalto bagnato rimanda in alto, non il grigio
    // della nebbia.
    cloudDeck: {
      height: 106,
      thickness: 36,
      amount: 0.85,
      coverage: 0.46,
      cellSize: 6,
      scale: 72,
      speed: 0.006,
      tint: '#3b2f4a',
    },
    shadow: { strength: 0.55, softness: 1.8 },
    bloom: { threshold: 0.9, strength: 1.1, radius: 0.75 },
    tilt: { strength: 0.3, focus: 0.5, width: 0.45 },
    glassTint: '#62f7ff',
    glassLift: 0.24,
    emissiveStrength: 1.15,
    water: {
      highlight: '#38d7ff',
      strength: 0.12,
      scale: 0.35,
      speed: 0.35,
      // Non sabbia: di notte il bassofondo e' la citta' che si vede sotto.
      shallowTint: '#1f6f8f',
      // I canali sono specchi, ed e' meta' del look.
      calm: 0.75,
      // Il sole e' una luna: poco da riflettere.
      glitter: 0.25,
    },
    toneMapping: 'none',
    exposure: 1,
  },
};
