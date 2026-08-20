/**
 * Modello di luce del motore, in TypeScript puro.
 *
 * Non importa Three e non tocca il DOM: gira nei test in ambiente node ed e' la
 * fonte unica da cui prendono i numeri il materiale (GLSL), il cielo e la pass
 * d'ombra. Il fragment shader riscrive le stesse formule in GLSL; il test
 * `lighting.test.ts` e' cio' che tiene allineate le due copie.
 *
 * Il modello e' volutamente non fisico. Tre termini:
 *
 *   ambiente = mix(rimbalzo, cielo, n.z)     — emisferico, mai occluso dal sole
 *   diretta  = sole * wrap(n . direzione)    — occlusa dalla shadow map
 *   luce     = ambiente + diretta
 *
 * L'ambiente non viene moltiplicato per l'ombra: e' esattamente cio' che rende
 * le facce in ombra azzurre invece che nere, perche' restano illuminate dal solo
 * cielo. Non e' un effetto aggiunto dopo, e' una conseguenza della struttura.
 */

/** Normali canoniche indicizzate da `FACE_*` di chunkCoords: +X, -X, +Y, -Y, +Z, -Z. */
export const FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Sole direzionale fisso nel mondo, descritto in gradi invece che come vettore. */
export interface SunLight {
  /** Gradi sul piano di terra: 0 punta verso +X (est), 90 verso +Y (nord). */
  readonly azimuth: number;
  /**
   * Gradi sopra l'orizzonte. Sotto i ~30 gradi una parete illuminata supera in
   * luminosita' il tetto e il diorama perde leggibilita': vedi `faceLuminance`.
   */
  readonly elevation: number;
  readonly color: string;
  readonly intensity: number;
  /**
   * Ammorbidisce il terminatore. 0 e' un N.L netto, 1 avvolge fino al lato
   * opposto. E' la manopola che fa sembrare la luce dipinta invece che calcolata.
   */
  readonly wrap: number;
}

/** Termine ambientale costante su un emisfero. */
export interface AmbientLight {
  readonly color: string;
  readonly intensity: number;
}

/** Il sottoinsieme di `Atmosphere` che descrive la luce. */
export interface LightingModel {
  readonly sun: SunLight;
  /** Cielo: domina le facce rivolte in alto. */
  readonly skyLight: AmbientLight;
  /** Rimbalzo dal terreno: domina le facce rivolte in basso. */
  readonly bounceLight: AmbientLight;
}

const DEG = Math.PI / 180;

/**
 * Versore che punta *verso* il sole, in coordinate mondo Z-up.
 *
 * Il sole e' fisso nel mondo e non nella camera: ruotando la vista con Q/E il
 * lato illuminato cambia, ed e' voluto.
 */
export function sunDirection(azimuth: number, elevation: number): [number, number, number] {
  const az = azimuth * DEG;
  const el = elevation * DEG;
  const horizontal = Math.cos(el);
  return [horizontal * Math.cos(az), horizontal * Math.sin(az), Math.sin(el)];
}

/** Diffusa avvolgente. `wrap` a 0 degenera in un clamp di N.L. */
export function wrapDiffuse(nDotL: number, wrap: number): number {
  const w = Math.max(0, wrap);
  return clamp01((nDotL + w) / (1 + w));
}

/** Da esadecimale `#rrggbb` a RGB lineare, come fa `Color.setStyle(hex, SRGBColorSpace)`. */
export function hexToLinear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    srgbToLinear(((value >> 16) & 0xff) / 255),
    srgbToLinear(((value >> 8) & 0xff) / 255),
    srgbToLinear((value & 0xff) / 255),
  ];
}

/** Luminanza relativa Rec. 709 di un colore gia' in spazio lineare. */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Luce che riceve una faccia orientata come `normal`, senza ombra proiettata.
 * Restituisce RGB lineare, la stessa quantita' che il fragment shader chiama
 * `light`.
 */
export function faceLight(
  model: LightingModel,
  normal: readonly [number, number, number],
): [number, number, number] {
  const sky = hexToLinear(model.skyLight.color);
  const bounce = hexToLinear(model.bounceLight.color);
  const sun = hexToLinear(model.sun.color);
  const direction = sunDirection(model.sun.azimuth, model.sun.elevation);

  const hemisphere = normal[2] * 0.5 + 0.5;
  const nDotL = normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2];
  const direct = wrapDiffuse(nDotL, model.sun.wrap) * model.sun.intensity;

  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const ambient =
      bounce[i] * model.bounceLight.intensity * (1 - hemisphere) +
      sky[i] * model.skyLight.intensity * hemisphere;
    out[i] = ambient + sun[i] * direct;
  }
  return out;
}

/**
 * Luminanza delle sei facce canoniche, nell'ordine di `FACE_*`.
 *
 * Esiste per il test: la faccia superiore deve restare la piu' illuminata,
 * perche' e' cio' che rende leggibile un diorama visto dall'alto. Prima questo
 * vincolo era scritto a mano in ogni tema come `faceLight[4] = 1.0`; ora e' una
 * conseguenza del sole e dell'ambiente, e va verificata invece che dichiarata.
 */
export function faceLuminance(model: LightingModel): number[] {
  return FACE_NORMALS.map((normal) => relativeLuminance(faceLight(model, normal)));
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
