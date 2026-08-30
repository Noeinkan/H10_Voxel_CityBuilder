import { Color, DoubleSide, ShaderMaterial } from 'three';
import { selectionFragmentShader, selectionVertexShader } from './shaders/selection.glsl';

/** Come dipingere una fascia: cambia il ruolo, non il programma. */
export interface SelectionMaterialOptions {
  /** Meta' larghezza del filo pieno, in unita' di `aRibbon.x`. */
  readonly core: number;
  /** Quanto il nucleo sfonda sopra 1, cioe' quanto bloom si porta dietro. */
  readonly boost: number;
  /** Intensita' della cometa; 0 la spegne. */
  readonly sweep: number;
  /** Periodo del giro della cometa, in secondi. */
  readonly sweepPeriod: number;
}

/**
 * Il materiale di una fascia di selezione.
 *
 * Sta **fuori dalla profondita'** come il segnaposto di piazzamento e le guide
 * di ispezione: un contorno che sparisce dietro la torre accanto smette di dire
 * quale cosa sia stata scelta, ed e' l'unico motivo per cui la selezione si
 * disegna sopra i tetti.
 *
 * Il colore arriva come esadecimale e passa da `Color`, quindi subisce la stessa
 * conversione sRGB -> lineare dei materiali di scena: la fascia vive nello
 * stesso spazio HDR del resto, ed e' per questo che il nucleo sopra 1 finisce
 * davvero nel bloom invece di essere tagliato a bianco.
 */
export function createSelectionMaterial(
  color: number,
  options: SelectionMaterialOptions,
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: selectionVertexShader,
    fragmentShader: selectionFragmentShader,
    uniforms: {
      uColor: { value: new Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uCore: { value: options.core },
      uBoost: { value: options.boost },
      uSweep: { value: options.sweep },
      uSweepPeriod: { value: options.sweepPeriod },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
}
