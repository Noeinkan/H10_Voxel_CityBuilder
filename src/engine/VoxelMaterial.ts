import { Color, FrontSide, ShaderMaterial, SRGBColorSpace } from 'three';
import { PALETTE_SIZE, toPaletteArray } from './palette';
import { PALETTE_SLOTS } from './paletteSlots';
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
uniform vec3 uLightTint;
uniform vec3 uShadowTint;
uniform vec3 uHeightTint;
uniform float uHeightStart;
uniform float uHeightEnd;
uniform float uHeightStrength;
uniform vec3 uGlassTint;
uniform float uGlassLift;

varying vec3 vColor;
varying float vAO;
varying float vFogDepth;
varying float vPaletteIndex;
varying float vFaceIndex;
varying vec2 vWorldXY;

void main() {
  // position arriva come Uint16 in coordinate locali di chunk (0..32).
  int paletteIndex = int(aPalette + 0.5);
  int faceIndex = int(aFace + 0.5);
  float faceLight = uFaceLight[faceIndex];
  vec3 faceTint = mix(vec3(1.0), mix(uShadowTint, uLightTint, faceLight), 0.28);
  vec3 color = uPalette[paletteIndex] * faceLight * faceTint;

  bool isGlass = paletteIndex >= ${PALETTE_SLOTS.glass} && paletteIndex <= ${PALETTE_SLOTS.glassDark};
  if (isGlass) color = mix(color, uGlassTint, uGlassLift);
  vAO = mix(1.0 - uAoStrength, 1.0, aAO / 3.0);

  vec4 worldPosition = modelMatrix * vec4(position * uVoxelSize, 1.0);
  float heightMix = smoothstep(uHeightStart, max(uHeightStart + 0.001, uHeightEnd), worldPosition.z);
  vColor = mix(color, color * uHeightTint, heightMix * uHeightStrength);
  vPaletteIndex = aPalette;
  vFaceIndex = aFace;
  vWorldXY = worldPosition.xy;

  vec4 mvPosition = viewMatrix * worldPosition;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform vec3 uWaterHighlight;
uniform float uWaterStrength;
uniform float uWaterScale;
uniform float uWaterSpeed;

varying vec3 vColor;
varying float vAO;
varying float vFogDepth;
varying float vPaletteIndex;
varying float vFaceIndex;
varying vec2 vWorldXY;

void main() {
  // La nebbia si miscela in spazio lineare, prima del tone mapping: dopo, il
  // colore di sfumatura non corrisponderebbe piu' a quello dichiarato dal tema.
  vec3 shaded = vColor * vAO;
  int paletteIndex = int(vPaletteIndex + 0.5);
  int faceIndex = int(vFaceIndex + 0.5);
  bool isWater = paletteIndex == ${PALETTE_SLOTS.water} || paletteIndex == ${PALETTE_SLOTS.waterDeep};
  if (isWater && faceIndex == 4 && uWaterStrength > 0.0) {
    float phase = uTime * uWaterSpeed;
    float waveA = sin((vWorldXY.x + vWorldXY.y) * uWaterScale + phase);
    float waveB = sin((vWorldXY.x - vWorldXY.y) * uWaterScale * 0.73 - phase * 0.61);
    float shimmer = 0.5 + 0.25 * (waveA + waveB);
    shaded = mix(shaded, uWaterHighlight, clamp(shimmer * uWaterStrength, 0.0, 1.0));
  }
  float fog = 1.0 - exp(-uFogDensity * vFogDepth);
  gl_FragColor = vec4(mix(shaded, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);

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
  /** Aggiorna la sola fase dell'acqua; non invalida geometrie o programmi. */
  setTime(seconds: number): void;
}

export function createVoxelMaterial(hexColors: readonly string[], voxelSize: number): VoxelMaterialHandle {
  const paletteArray = toPaletteArray(hexColors);
  const faceLightArray = new Float32Array(FACE_LIGHT);
  const fogColor = new Color(1, 1, 1);
  const lightTint = new Color(1, 1, 1);
  const shadowTint = new Color(1, 1, 1);
  const heightTint = new Color(1, 1, 1);
  const glassTint = new Color(1, 1, 1);
  const waterHighlight = new Color(1, 1, 1);

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
      uLightTint: { value: lightTint },
      uShadowTint: { value: shadowTint },
      uHeightTint: { value: heightTint },
      uHeightStart: { value: 0 },
      uHeightEnd: { value: 1 },
      uHeightStrength: { value: 0 },
      uGlassTint: { value: glassTint },
      uGlassLift: { value: 0 },
      uTime: { value: 0 },
      uWaterHighlight: { value: waterHighlight },
      uWaterStrength: { value: 0 },
      uWaterScale: { value: 0.1 },
      uWaterSpeed: { value: 0 },
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
      lightTint.setStyle(atmosphere.lightTint ?? '#ffffff', SRGBColorSpace);
      shadowTint.setStyle(atmosphere.shadowTint ?? '#ffffff', SRGBColorSpace);
      heightTint.setStyle(atmosphere.heightTint ?? '#ffffff', SRGBColorSpace);
      glassTint.setStyle(atmosphere.glassTint ?? '#ffffff', SRGBColorSpace);
      waterHighlight.setStyle(atmosphere.waterHighlight ?? atmosphere.fogColor, SRGBColorSpace);
      material.uniforms['uFogDensity'].value = atmosphere.fogDensity;
      material.uniforms['uAoStrength'].value = atmosphere.aoStrength;
      material.uniforms['uHeightStart'].value = atmosphere.heightStart ?? 0;
      material.uniforms['uHeightEnd'].value = atmosphere.heightEnd ?? 1;
      material.uniforms['uHeightStrength'].value = atmosphere.heightStrength ?? 0;
      material.uniforms['uGlassLift'].value = atmosphere.glassLift ?? 0;
      material.uniforms['uWaterStrength'].value = atmosphere.waterStrength ?? 0;
      material.uniforms['uWaterScale'].value = atmosphere.waterScale ?? 0.1;
      material.uniforms['uWaterSpeed'].value = atmosphere.waterSpeed ?? 0;
    },
    setTime(seconds: number): void {
      material.uniforms['uTime'].value = seconds;
    },
  };
}
