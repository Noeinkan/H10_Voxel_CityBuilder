import {
  Color,
  FrontSide,
  Matrix4,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type DepthTexture,
} from 'three';
import { PALETTE_SIZE, toPaletteArray } from './palette';
import { PALETTE_SLOTS } from './paletteSlots';
import { MESH_UNITS_PER_VOXEL } from './mesher/meshTypes';
import { FACE_NORMALS, sunDirection } from './lighting';
import type { Atmosphere } from './themes/theme';
import { SURFACE_KIND } from '../world/visualBlock';

/**
 * Unico ShaderMaterial condiviso da tutti i chunk.
 *
 * Il colore arriva esclusivamente dalla palette: gli attributi di vertice
 * portano l'indice (`aPalette`) e la direzione della faccia (`aFace`), mai un
 * colore RGB. Nessun materiale PBR, nessuna texture, nessuna luce di Three.
 *
 * La luce si calcola nel **fragment shader**, non nel vertex: serve cosi' per
 * l'ombra proiettata e per il jitter per voxel, che sono entrambi per-pixel. Lo
 * shading resta comunque piatto, perche' indice di palette e di faccia sono
 * costanti sui quattro vertici di un quad e i varying non interpolano nulla.
 *
 * La normale non e' un attributo di vertice: si legge da `uFaceNormal[aFace]`.
 * E' il motivo per cui aggiungere un sole vero non ha richiesto di toccare il
 * mesher ne' di ricostruire una sola geometria.
 *
 * Cambiare tema riscrive solo uniform.
 */

const vertexShader = /* glsl */ `
attribute float aFace;
attribute float aPalette;
attribute float aSurface;
attribute float aAO;

uniform float uVoxelSize;
uniform float uAoStrength;

varying float vAO;
varying float vFogDepth;
varying float vPaletteIndex;
varying float vFaceIndex;
varying float vSurfaceIndex;
varying vec2 vWorldXY;
varying vec3 vWorldPosition;

void main() {
  // position arriva come Int16 in sedicesimi di voxel, incluse le sporgenze.
  vAO = mix(1.0 - uAoStrength, 1.0, aAO / 3.0);

  vec4 worldPosition = modelMatrix * vec4(position * (uVoxelSize / ${MESH_UNITS_PER_VOXEL}.0), 1.0);
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
uniform vec3 uPalette[${PALETTE_SIZE}];
uniform vec3 uFaceNormal[6];
uniform float uVoxelSize;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunWrap;
uniform vec3 uSkyColor;
uniform vec3 uBounceColor;
uniform float uColorJitter;

uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogSkyBlend;
uniform float uFogHeightBase;
uniform float uFogHeightFalloff;
uniform float uFogSunTint;
uniform vec3 uSkyTopColor;
uniform vec3 uSkyHorizonColor;
uniform vec3 uViewDirection;
uniform vec2 uResolution;

uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowStrength;
uniform float uShadowTexel;
uniform float uShadowNormalBias;
uniform float uShadowSoftness;

uniform vec3 uGlassTint;
uniform float uGlassLift;
uniform float uTime;
uniform vec3 uWaterHighlight;
uniform float uWaterStrength;
uniform float uWaterScale;
uniform float uWaterSpeed;
uniform float uEmissiveStrength;

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

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float boxMask(vec2 p, vec2 low, vec2 high) {
  vec2 enter = smoothstep(low, low + vec2(0.045), p);
  vec2 leave = 1.0 - smoothstep(high - vec2(0.045), high, p);
  return enter.x * enter.y * leave.x * leave.y;
}

/**
 * Ombra proiettata del sole.
 *
 * Il bias e' normal-offset: si sposta il punto lungo la normale prima di
 * proiettarlo. Su facce allineate agli assi toglie l'acne senza staccare
 * l'ombra dalla base degli oggetti, come farebbe un bias in profondita'.
 */
float sampleShadow(vec3 worldPosition, vec3 n) {
  if (uShadowStrength <= 0.0) return 1.0;

  vec4 coord = uShadowMatrix * vec4(worldPosition + n * uShadowNormalBias, 1.0);
  vec3 uvz = coord.xyz / coord.w;
  // Fuori dalla mappa non si sa nulla: meglio illuminato che un bordo netto.
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;

  float lit = 0.0;
  if (uShadowSoftness <= 0.0) {
    lit = step(uvz.z, texture2D(uShadowMap, uvz.xy).r);
  } else {
    float radius = uShadowTexel * uShadowSoftness;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y)) * radius;
        lit += step(uvz.z, texture2D(uShadowMap, uvz.xy + offset).r);
      }
    }
    lit /= 9.0;
  }
  return mix(1.0, lit, uShadowStrength);
}

vec2 faceUv(int faceIndex, vec3 position) {
  if (faceIndex < 2) return position.yz;
  if (faceIndex < 4) return position.xz;
  return position.xy;
}

void main() {
  int paletteIndex = int(vPaletteIndex + 0.5);
  int faceIndex = int(vFaceIndex + 0.5);
  int surfaceIndex = int(vSurfaceIndex + 0.5);
  vec3 n = uFaceNormal[faceIndex];

  vec3 albedo = uPalette[paletteIndex];
  bool isGlass = paletteIndex >= ${PALETTE_SLOTS.glass} && paletteIndex <= ${PALETTE_SLOTS.glassDark};
  if (isGlass) albedo = mix(albedo, uGlassTint, uGlassLift);

  // Variazione cromatica per voxel: senza, ogni voxel di uno slot ha esattamente
  // lo stesso colore, ed e' la prima causa di piattezza. Il rientro di mezzo
  // voxel lungo la normale serve a disambiguare la cella: sulla faccia la
  // posizione mondo cade esatta sul confine e floor() sfarfallerebbe fra due.
  vec3 cell = floor((vWorldPosition - n * uVoxelSize * 0.5) / uVoxelSize);
  float jitter = hash31(cell) * 2.0 - 1.0;
  albedo *= 1.0 + jitter * uColorJitter;
  albedo = mix(albedo, albedo * uSunColor, max(0.0, jitter) * uColorJitter * 0.5);

  vec3 detailed = albedo;
  vec3 emission = vec3(0.0);

  if (surfaceIndex != ${SURFACE_KIND.plain}) {
    vec2 uv = faceUv(faceIndex, vWorldPosition);
    vec2 cellUv = fract(uv + vec2(0.0001));
    vec2 edgeDistance = min(cellUv, 1.0 - cellUv);
    float panelEdge = 1.0 - smoothstep(0.045, 0.085, min(edgeDistance.x, edgeDistance.y));
    float variation = hash21(floor(uv) + vec2(float(surfaceIndex) * 17.0, float(paletteIndex)));
    bool lateral = faceIndex < 4;

    if (surfaceIndex == ${SURFACE_KIND.habitat}) {
      float pane = lateral ? boxMask(cellUv, vec2(0.16, 0.22), vec2(0.84, 0.78)) : 0.0;
      float light = step(0.72, variation) * pane;
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDeep}] * 0.72, pane * 0.68);
      detailed *= 1.0 - panelEdge * 0.16;
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * light * 0.38;
    } else if (surfaceIndex == ${SURFACE_KIND.industrial}) {
      float rib = 1.0 - smoothstep(0.035, 0.075, abs(cellUv.x - 0.5));
      float vent = lateral ? boxMask(cellUv, vec2(0.18, 0.3), vec2(0.82, 0.68)) : 0.0;
      float louvers = step(0.52, fract(cellUv.y * 8.0)) * vent;
      detailed *= 1.0 - panelEdge * 0.24;
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.72, max(rib * 0.32, louvers * 0.3));
    } else if (surfaceIndex == ${SURFACE_KIND.civic}) {
      float glassPanel = lateral ? boxMask(cellUv, vec2(0.1, 0.12), vec2(0.9, 0.88)) : 0.0;
      float spine = 1.0 - smoothstep(0.045, 0.09, abs(cellUv.x - 0.5));
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glass}] * 0.82, glassPanel * 0.62);
      detailed *= 1.0 - panelEdge * 0.12;
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * spine * glassPanel * 0.16;
    } else if (surfaceIndex == ${SURFACE_KIND.luminous}) {
      float band = lateral
        ? 1.0 - smoothstep(0.055, 0.12, abs(cellUv.y - 0.5))
        : 1.0 - smoothstep(0.055, 0.12, abs(cellUv.x - 0.5));
      float pulse = 0.82 + 0.18 * sin(uTime * 0.85 + variation * 6.28318);
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDeep}], 0.42 + band * 0.26);
      // Il bagliore tinge con lo slot del voxel invece di essere sempre pallido:
      // e' cio' che rende un'insegna commerciale d'ottone diversa da una spina
      // civica in vetro, che prima emettevano la stessa luce. Il residuo di
      // pallido non e' timidezza: uno slot scuro spegnerebbe la fascia, e
      // l'accento sparirebbe proprio dove serve, cioe' di notte e da lontano.
      vec3 glow = mix(uPalette[${PALETTE_SLOTS.glassPale}], uPalette[paletteIndex], 0.7);
      emission += glow * band * pulse * 0.72;
    } else if (surfaceIndex == ${SURFACE_KIND.portal}) {
      float portal = lateral ? boxMask(cellUv, vec2(0.12, 0.05), vec2(0.88, 0.95)) : 0.0;
      float core = lateral ? boxMask(cellUv, vec2(0.23, 0.08), vec2(0.77, 0.88)) : 0.0;
      float frame = max(0.0, portal - core);
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDark}] * 0.62, core * 0.86);
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * frame * (0.72 + 0.12 * sin(uTime * 1.1));
    } else if (surfaceIndex == ${SURFACE_KIND.roofTech}) {
      float circuitX = 1.0 - smoothstep(0.025, 0.065, abs(cellUv.x - 0.5));
      float circuitY = 1.0 - smoothstep(0.025, 0.065, abs(cellUv.y - 0.5));
      float circuit = faceIndex == 4 ? max(circuitX, circuitY) : circuitY;
      detailed *= 1.0 - panelEdge * 0.2;
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.75, circuit * 0.34);
      emission += uPalette[${PALETTE_SLOTS.metalBrass}] * circuit * step(0.58, variation) * 0.18;
    } else {
      // utility e' metallo strutturale uniforme: la forma arriva dalla mesh,
      // non da un warning pattern dipinto sulla superficie.
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.78, 0.28);
    }
  }

  float shadow = sampleShadow(vWorldPosition, n);

  // Ambiente emisferico piu' sole avvolgente. L'ambiente non e' moltiplicato per
  // l'ombra: e' cio' che lascia azzurre le facce in ombra invece che nere.
  vec3 ambient = mix(uBounceColor, uSkyColor, n.z * 0.5 + 0.5);
  float wrapped = clamp((dot(n, uSunDirection) + uSunWrap) / (1.0 + uSunWrap), 0.0, 1.0);
  vec3 light = ambient + uSunColor * wrapped * shadow;

  vec3 shaded = detailed * light * vAO + emission * uEmissiveStrength;

  bool isWater = paletteIndex == ${PALETTE_SLOTS.water} || paletteIndex == ${PALETTE_SLOTS.waterDeep};
  if (isWater && faceIndex == 4 && uWaterStrength > 0.0) {
    float phase = uTime * uWaterSpeed;
    float waveA = sin((vWorldXY.x + vWorldXY.y) * uWaterScale + phase);
    float waveB = sin((vWorldXY.x - vWorldXY.y) * uWaterScale * 0.73 - phase * 0.61);
    float shimmer = 0.5 + 0.25 * (waveA + waveB);
    shaded = mix(shaded, uWaterHighlight, clamp(shimmer * uWaterStrength, 0.0, 1.0));
  }

  // Prospettiva aerea. La nebbia si miscela in spazio lineare, prima del tone
  // mapping: dopo, il colore di sfumatura non corrisponderebbe piu' a quello
  // dichiarato dal tema. La densita' decade con la quota, cosi' le valli si
  // impastano mentre le cime restano nitide, e la tinta tende al cielo alla
  // stessa altezza di schermo del frammento, cosi' la distanza vi si scioglie.
  float heightFalloff = exp(-max(0.0, vWorldPosition.z - uFogHeightBase) * uFogHeightFalloff);
  float fogAmount = 1.0 - exp(-uFogDensity * vFogDepth * heightFalloff);

  float screenY = clamp(gl_FragCoord.y / max(1.0, uResolution.y), 0.0, 1.0);
  vec3 skyTint = mix(uSkyHorizonColor, uSkyTopColor, screenY);
  vec3 fogTint = mix(uFogColor, skyTint, uFogSkyBlend);
  float towardSun = max(0.0, dot(uViewDirection, uSunDirection));
  fogTint = mix(fogTint, uSunColor, pow(towardSun, 4.0) * uFogSunTint);

  gl_FragColor = vec4(mix(shaded, fogTint, clamp(fogAmount, 0.0, 1.0)), 1.0);
  // Nessun tone mapping qui: si scrive HDR lineare e ci pensa OutputPass.
  // Ecco perche' un cambio di tema non ricompila piu' nessun materiale di scena.
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
   * Riscrive luce, nebbia, cielo e forza dell'AO. Come `setPalette`, e' un
   * aggiornamento di soli uniform.
   */
  setAtmosphere(atmosphere: Atmosphere): void;
  /** Aggiorna la sola fase di acqua ed emissivi; non invalida geometrie. */
  setTime(seconds: number): void;
  /**
   * Direzione di vista, per lo scattering della nebbia verso il sole.
   *
   * E' un uniform e non una derivata per-pixel perche' la camera e' ortografica:
   * tutti i raggi di vista sono paralleli, quindi un solo vettore per frame e'
   * esatto e non un'approssimazione.
   */
  setViewDirection(x: number, y: number, z: number): void;
  /** Dimensione del target, per ancorare il gradiente di nebbia al cielo. */
  setResolution(width: number, height: number): void;
  /**
   * Aggancia la shadow map. `strength` a 0 spegne il campionamento senza
   * ricompilare il programma: e' cosi' che il gating di qualita' puo' togliere
   * le ombre a runtime.
   */
  setShadow(options: {
    texture: DepthTexture | null;
    matrix: Matrix4;
    strength: number;
    texelSize: number;
    normalBias: number;
    softness: number;
  }): void;
}

export function createVoxelMaterial(hexColors: readonly string[], voxelSize: number): VoxelMaterialHandle {
  const paletteArray = toPaletteArray(hexColors);
  const faceNormals = FACE_NORMALS.map(([x, y, z]) => new Vector3(x, y, z));

  const sunDir = new Vector3(0, 0, 1);
  const sunColor = new Color(1, 1, 1);
  const skyColor = new Color(1, 1, 1);
  const bounceColor = new Color(1, 1, 1);
  const fogColor = new Color(1, 1, 1);
  const skyTopColor = new Color(1, 1, 1);
  const skyHorizonColor = new Color(1, 1, 1);
  const glassTint = new Color(1, 1, 1);
  const waterHighlight = new Color(1, 1, 1);
  const viewDirection = new Vector3(0, 0, -1);
  const resolution = new Vector2(1, 1);
  const shadowMatrix = new Matrix4();

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uPalette: { value: paletteArray },
      uFaceNormal: { value: faceNormals },
      uVoxelSize: { value: voxelSize },

      uSunDirection: { value: sunDir },
      uSunColor: { value: sunColor },
      uSunWrap: { value: 0.3 },
      uSkyColor: { value: skyColor },
      uBounceColor: { value: bounceColor },
      uColorJitter: { value: 0 },

      uFogColor: { value: fogColor },
      uFogDensity: { value: 0 },
      uFogSkyBlend: { value: 0 },
      uFogHeightBase: { value: 0 },
      uFogHeightFalloff: { value: 0 },
      uFogSunTint: { value: 0 },
      uSkyTopColor: { value: skyTopColor },
      uSkyHorizonColor: { value: skyHorizonColor },
      uViewDirection: { value: viewDirection },
      uResolution: { value: resolution },

      uShadowMap: { value: null },
      uShadowMatrix: { value: shadowMatrix },
      uShadowStrength: { value: 0 },
      uShadowTexel: { value: 1 / 2048 },
      uShadowNormalBias: { value: 0 },
      uShadowSoftness: { value: 1 },

      // Forza dell'occlusione ambientale per-vertice, controllata dal tema.
      uAoStrength: { value: 0 },
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
      const [sx, sy, sz] = sunDirection(atmosphere.sun.azimuth, atmosphere.sun.elevation);
      sunDir.set(sx, sy, sz);

      // setStyle con SRGBColorSpace porta il colore in spazio lineare, come i
      // colori della palette: la miscela nel fragment shader avviene li'.
      // L'intensita' e' premoltiplicata nel colore, cosi' lo shader ha un solo
      // vettore per termine invece di un colore piu' uno scalare.
      sunColor.setStyle(atmosphere.sun.color, SRGBColorSpace).multiplyScalar(atmosphere.sun.intensity);
      skyColor
        .setStyle(atmosphere.skyLight.color, SRGBColorSpace)
        .multiplyScalar(atmosphere.skyLight.intensity);
      bounceColor
        .setStyle(atmosphere.bounceLight.color, SRGBColorSpace)
        .multiplyScalar(atmosphere.bounceLight.intensity);
      material.uniforms['uSunWrap'].value = atmosphere.sun.wrap;
      material.uniforms['uColorJitter'].value = atmosphere.colorJitter;

      fogColor.setStyle(atmosphere.fog.color, SRGBColorSpace);
      skyTopColor.setStyle(atmosphere.sky.top, SRGBColorSpace);
      skyHorizonColor.setStyle(atmosphere.sky.horizon, SRGBColorSpace);
      material.uniforms['uFogDensity'].value = atmosphere.fog.density;
      material.uniforms['uFogSkyBlend'].value = atmosphere.fog.skyBlend;
      material.uniforms['uFogHeightBase'].value = atmosphere.fog.heightBase;
      material.uniforms['uFogHeightFalloff'].value = atmosphere.fog.heightFalloff;
      material.uniforms['uFogSunTint'].value = atmosphere.fog.sunTint;

      glassTint.setStyle(atmosphere.glassTint ?? '#ffffff', SRGBColorSpace);
      waterHighlight.setStyle(atmosphere.water?.highlight ?? atmosphere.fog.color, SRGBColorSpace);
      material.uniforms['uAoStrength'].value = atmosphere.aoStrength;
      material.uniforms['uGlassLift'].value = atmosphere.glassLift ?? 0;
      material.uniforms['uWaterStrength'].value = atmosphere.water?.strength ?? 0;
      material.uniforms['uWaterScale'].value = atmosphere.water?.scale ?? 0.1;
      material.uniforms['uWaterSpeed'].value = atmosphere.water?.speed ?? 0;
      material.uniforms['uEmissiveStrength'].value = atmosphere.emissiveStrength ?? 0.35;
    },
    setTime(seconds: number): void {
      material.uniforms['uTime'].value = seconds;
    },
    setViewDirection(x: number, y: number, z: number): void {
      viewDirection.set(x, y, z);
    },
    setResolution(width: number, height: number): void {
      resolution.set(width, height);
    },
    setShadow(options): void {
      material.uniforms['uShadowMap'].value = options.texture;
      shadowMatrix.copy(options.matrix);
      material.uniforms['uShadowStrength'].value = options.strength;
      material.uniforms['uShadowTexel'].value = options.texelSize;
      material.uniforms['uShadowNormalBias'].value = options.normalBias;
      material.uniforms['uShadowSoftness'].value = options.softness;
    },
  };
}
