import { Color, FrontSide, ShaderMaterial, SRGBColorSpace } from 'three';
import { PALETTE_SIZE, toPaletteArray } from './palette';
import type { Atmosphere } from './themes/theme';

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
 *
 * Cambiare tema riscrive solo uniform: nessuna geometria viene toccata, nessun
 * programma viene ricompilato.
 */

/** Luminosita' per orientamento finche' un tema non ne impone un'altra. */
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
attribute float aAO;

uniform vec3 uPalette[${PALETTE_SIZE}];
uniform float uFaceLight[6];
uniform float uVoxelSize;
uniform float uAoStrength;

varying vec3 vColor;
varying float vAO;
varying float vFogDepth;

void main() {
  // position arriva come Uint16 in coordinate locali di chunk (0..32).
  int paletteIndex = int(aPalette + 0.5);
  int faceIndex = int(aFace + 0.5);
  vColor = uPalette[paletteIndex] * uFaceLight[faceIndex];
  vAO = mix(1.0 - uAoStrength, 1.0, aAO / 3.0);

  vec4 mvPosition = modelViewMatrix * vec4(position * uVoxelSize, 1.0);
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec3 vColor;
varying float vAO;
varying float vFogDepth;

void main() {
  // La nebbia si miscela in spazio lineare, prima del tone mapping: dopo, il
  // colore di sfumatura non corrisponderebbe piu' a quello dichiarato dal tema.
  float fog = 1.0 - exp(-uFogDensity * vFogDepth);
  gl_FragColor = vec4(mix(vColor * vAO, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);

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
  /**
   * Riscrive luce per faccia, nebbia e forza dell'AO. Come `setPalette`, e' un
   * aggiornamento di soli uniform.
   */
  setAtmosphere(atmosphere: Atmosphere): void;
}

export function createVoxelMaterial(hexColors: readonly string[], voxelSize: number): VoxelMaterialHandle {
  const paletteArray = toPaletteArray(hexColors);
  const faceLightArray = new Float32Array(FACE_LIGHT);
  const fogColor = new Color(1, 1, 1);

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uPalette: { value: paletteArray },
      uFaceLight: { value: faceLightArray },
      uVoxelSize: { value: voxelSize },
      uFogColor: { value: fogColor },
      uFogDensity: { value: 0 },
      // Forza dell'occlusione ambientale per-vertice, controllata dal tema.
      uAoStrength: { value: 0 },
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
    setAtmosphere(atmosphere: Atmosphere): void {
      if (atmosphere.faceLight.length !== 6) {
        throw new Error(`faceLight deve avere 6 valori, trovati ${atmosphere.faceLight.length}`);
      }
      faceLightArray.set(atmosphere.faceLight);
      // setStyle con SRGBColorSpace porta il colore in spazio lineare, come i
      // colori della palette: la miscela nel fragment shader avviene li'.
      fogColor.setStyle(atmosphere.fogColor, SRGBColorSpace);
      material.uniforms['uFogDensity'].value = atmosphere.fogDensity;
      material.uniforms['uAoStrength'].value = atmosphere.aoStrength;
    },
  };
}
