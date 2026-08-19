import { Color, FrontSide, ShaderMaterial, SRGBColorSpace } from 'three';
import { PALETTE_SIZE, toPaletteArray } from './palette';
import { PALETTE_SLOTS } from './paletteSlots';
import type { Atmosphere } from './themes/theme';
import { SURFACE_KIND } from '../world/visualBlock';

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
attribute float aSurface;
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
varying float vSurfaceIndex;
varying vec2 vWorldXY;
varying vec3 vWorldPosition;

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
  vSurfaceIndex = aSurface;
  vWorldXY = worldPosition.xy;
  vWorldPosition = worldPosition.xyz;

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
uniform float uEmissiveStrength;

varying vec3 vColor;
varying float vAO;
varying float vFogDepth;
varying float vPaletteIndex;
varying float vFaceIndex;
varying float vSurfaceIndex;
varying vec2 vWorldXY;
varying vec3 vWorldPosition;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float boxMask(vec2 p, vec2 low, vec2 high) {
  vec2 enter = smoothstep(low, low + vec2(0.045), p);
  vec2 leave = 1.0 - smoothstep(high - vec2(0.045), high, p);
  return enter.x * enter.y * leave.x * leave.y;
}

vec2 faceUv(int faceIndex, vec3 position) {
  if (faceIndex < 2) return position.yz;
  if (faceIndex < 4) return position.xz;
  return position.xy;
}

void main() {
  // La nebbia si miscela in spazio lineare, prima del tone mapping: dopo, il
  // colore di sfumatura non corrisponderebbe piu' a quello dichiarato dal tema.
  int paletteIndex = int(vPaletteIndex + 0.5);
  int faceIndex = int(vFaceIndex + 0.5);
  int surfaceIndex = int(vSurfaceIndex + 0.5);
  vec3 detailed = vColor;
  vec3 emission = vec3(0.0);

  if (surfaceIndex != ${SURFACE_KIND.plain}) {
    vec2 uv = faceUv(faceIndex, vWorldPosition);
    vec2 cell = fract(uv + vec2(0.0001));
    vec2 edgeDistance = min(cell, 1.0 - cell);
    float panelEdge = 1.0 - smoothstep(0.045, 0.085, min(edgeDistance.x, edgeDistance.y));
    float variation = hash21(floor(uv) + vec2(float(surfaceIndex) * 17.0, float(paletteIndex)));
    bool lateral = faceIndex < 4;

    if (surfaceIndex == ${SURFACE_KIND.habitat}) {
      float pane = lateral ? boxMask(cell, vec2(0.16, 0.22), vec2(0.84, 0.78)) : 0.0;
      float light = step(0.72, variation) * pane;
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDeep}] * 0.72, pane * 0.68);
      detailed *= 1.0 - panelEdge * 0.16;
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * light * 0.38;
    } else if (surfaceIndex == ${SURFACE_KIND.industrial}) {
      float rib = 1.0 - smoothstep(0.035, 0.075, abs(cell.x - 0.5));
      float vent = lateral ? boxMask(cell, vec2(0.18, 0.3), vec2(0.82, 0.68)) : 0.0;
      float louvers = step(0.52, fract(cell.y * 8.0)) * vent;
      detailed *= 1.0 - panelEdge * 0.24;
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.72, max(rib * 0.32, louvers * 0.3));
    } else if (surfaceIndex == ${SURFACE_KIND.civic}) {
      float glassPanel = lateral ? boxMask(cell, vec2(0.1, 0.12), vec2(0.9, 0.88)) : 0.0;
      float spine = 1.0 - smoothstep(0.045, 0.09, abs(cell.x - 0.5));
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glass}] * 0.82, glassPanel * 0.62);
      detailed *= 1.0 - panelEdge * 0.12;
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * spine * glassPanel * 0.16;
    } else if (surfaceIndex == ${SURFACE_KIND.luminous}) {
      float band = lateral
        ? 1.0 - smoothstep(0.055, 0.12, abs(cell.y - 0.5))
        : 1.0 - smoothstep(0.055, 0.12, abs(cell.x - 0.5));
      float pulse = 0.82 + 0.18 * sin(uTime * 0.85 + variation * 6.28318);
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDeep}], 0.42 + band * 0.26);
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * band * pulse * 0.72;
    } else if (surfaceIndex == ${SURFACE_KIND.portal}) {
      float portal = lateral ? boxMask(cell, vec2(0.12, 0.05), vec2(0.88, 0.95)) : 0.0;
      float core = lateral ? boxMask(cell, vec2(0.23, 0.08), vec2(0.77, 0.88)) : 0.0;
      float frame = max(0.0, portal - core);
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDark}] * 0.62, core * 0.86);
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * frame * (0.72 + 0.12 * sin(uTime * 1.1));
    } else if (surfaceIndex == ${SURFACE_KIND.roofTech}) {
      float circuitX = 1.0 - smoothstep(0.025, 0.065, abs(cell.x - 0.5));
      float circuitY = 1.0 - smoothstep(0.025, 0.065, abs(cell.y - 0.5));
      float circuit = faceIndex == 4 ? max(circuitX, circuitY) : circuitY;
      detailed *= 1.0 - panelEdge * 0.2;
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.75, circuit * 0.34);
      emission += uPalette[${PALETTE_SLOTS.metalBrass}] * circuit * step(0.58, variation) * 0.18;
    } else {
      float warning = step(0.52, fract((uv.x + uv.y) * 4.0));
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.76, warning * 0.3);
      emission += uPalette[${PALETTE_SLOTS.metalBrass}] * panelEdge * 0.12;
    }
  }

  vec3 shaded = detailed * vAO + emission * uEmissiveStrength;
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
      uEmissiveStrength: { value: 0.35 },
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
        throw new Error(`faceLight must contain 6 values, found ${atmosphere.faceLight.length}`);
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
      material.uniforms['uEmissiveStrength'].value = atmosphere.emissiveStrength ?? 0.35;
    },
    setTime(seconds: number): void {
      material.uniforms['uTime'].value = seconds;
    },
  };
}
