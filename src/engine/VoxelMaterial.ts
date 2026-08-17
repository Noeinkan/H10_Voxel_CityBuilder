import { FrontSide, ShaderMaterial } from 'three';
import { PALETTE_SIZE, toPaletteArray } from './palette';

/**
 * Unico ShaderMaterial condiviso da tutti i chunk.
 *
 * Il colore arriva esclusivamente dalla palette: gli attributi di vertice
 * portano l'indice (`aPalette`) e la direzione della faccia (`aFace`), mai un
 * colore RGB. Nessun materiale PBR, nessuna texture, nessuna luce dinamica.
 *
 * Il lookup nell'array di uniform sta nel vertex shader, dove GLSL ES 1.0
 * garantisce l'indicizzazione dinamica. I quattro vertici di un quad condividono
 * indice e faccia, quindi il varying resta costante: shading piatto esatto.
 */

/** Tre livelli di luminosita' per orientamento, indicizzati da FACE_*. */
const FACE_LIGHT: readonly number[] = [
  0.8, // +X
  0.8, // -X
  0.62, // +Y
  0.62, // -Y
  1.0, // +Z, la faccia superiore
  0.62, // -Z
];

const vertexShader = /* glsl */ `
attribute float aFace;
attribute float aPalette;

uniform vec3 uPalette[${PALETTE_SIZE}];
uniform float uFaceLight[6];
uniform float uVoxelSize;

varying vec3 vColor;

void main() {
  // position arriva come Uint16 in coordinate locali di chunk (0..32).
  int paletteIndex = int(aPalette + 0.5);
  int faceIndex = int(aFace + 0.5);
  vColor = uPalette[paletteIndex] * uFaceLight[faceIndex];

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position * uVoxelSize, 1.0);
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface VoxelMaterialHandle {
  readonly material: ShaderMaterial;
  /**
   * Riscrive i colori nell'uniform. Le geometrie non vengono toccate: gli indici
   * di palette nei vertici restano validi.
   */
  setPalette(hexColors: readonly string[]): void;
}

export function createVoxelMaterial(hexColors: readonly string[], voxelSize: number): VoxelMaterialHandle {
  const paletteArray = toPaletteArray(hexColors);

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uPalette: { value: paletteArray },
      uFaceLight: { value: new Float32Array(FACE_LIGHT) },
      uVoxelSize: { value: voxelSize },
    },
    side: FrontSide,
    transparent: false,
  });

  return {
    material,
    setPalette(next: readonly string[]): void {
      // Scrittura in place: Three confronta con la propria cache e ricarica
      // l'uniform, senza ricompilare il programma ne toccare le geometrie.
      paletteArray.set(toPaletteArray(next));
    },
  };
}
