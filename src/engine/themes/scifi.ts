import type { Theme } from './theme';

/**
 * Colonia sci-fi: bianchi freddi, teal e magenta, terreno minerale violaceo.
 * Il fondo e' scuro ma non nero, cosi' i bianchi restano bianchi.
 *
 * Sole netto (`wrap` basso) e ombre piene: e' il tema su cui si legge meglio la
 * microgeometria degli edifici.
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
    sun: { azimuth: 40, elevation: 46, color: '#eaf4ff', intensity: 0.92, wrap: 0.26 },
    skyLight: { color: '#4c6a91', intensity: 0.46 },
    // Rimbalzo violaceo: sotto c'e' regolite, non erba.
    bounceLight: { color: '#4a3f5e', intensity: 0.28 },
    aoStrength: 0.62,
    skyOcclusion: 0.6,
    colorJitter: 0.16,
    fog: {
      color: '#1e2a3d',
      density: 0.00042,
      skyBlend: 0.45,
      heightBase: 20,
      heightFalloff: 0.0048,
      altitudeLift: 0.14,
      sunTint: 0.2,
    },
    sky: {
      top: '#0d1524',
      horizon: '#3a5570',
      sunGlow: 0.4,
      cloudAmount: 0.35,
      cloudSpeed: 0.007,
      cloudTint: '#4a6280',
    },
    shadow: { strength: 0.92, softness: 1.2 },
    bloom: { threshold: 1.0, strength: 0.7, radius: 0.65 },
    tilt: { strength: 0.34, focus: 0.5, width: 0.44 },
    glassTint: '#83fff4',
    glassLift: 0.2,
    emissiveStrength: 0.95,
    toneMapping: 'aces',
    exposure: 1.1,
  },
};
