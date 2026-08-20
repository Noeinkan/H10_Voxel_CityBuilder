import { Color, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector2 } from 'three';
import type { Atmosphere } from './themes/theme';

/**
 * Fondo procedurale: gradiente, disco solare con alone, nuvole a bande.
 *
 * E' un quad che copre l'NDC e ignora le matrici della camera, disegnato per
 * primo con `depthTest` spento. Non e' una cupola: con una camera ortografica
 * tutti i raggi di vista sono paralleli, quindi una cupola vera darebbe una
 * tinta piatta e nient'altro.
 *
 * Il gradiente va per **altezza di schermo**, non per elevazione del raggio, e
 * non e' una scorciatoia: la camera guarda in basso di 35 gradi, quindi ogni
 * raggio virtuale cade sotto l'orizzonte e un cielo "fisico" mostrerebbe terreno
 * dappertutto. La stessa mappatura la usa la nebbia in `VoxelMaterial`, ed e'
 * cio' che fa sciogliere la distanza dentro al cielo invece che stagliarcisi
 * contro.
 *
 * Il sole invece e' posizionato dalla direzione vera portata in spazio vista:
 * ruotando con Q/E si sposta insieme alle facce illuminate.
 */

const vertexShader = /* glsl */ `
varying vec2 vNdc;

void main() {
  vNdc = position.xy;
  // Niente model/view/projection: il quad e' gia' in coordinate NDC.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunColor;
uniform vec2 uSunScreen;
uniform float uSunFacing;
uniform float uSunGlow;
uniform float uCloudAmount;
uniform float uCloudSpeed;
uniform vec3 uCloudTint;
uniform float uAspect;
uniform float uTime;

varying vec2 vNdc;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * valueNoise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  // Il gradiente segue l'altezza di schermo, come la nebbia del materiale.
  float screenY = vNdc.y * 0.5 + 0.5;
  vec3 color = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 1.0, screenY));

  // Le nuvole si schiacciano verso l'orizzonte: e' cio' che da' profondita' a
  // un cielo che non ha prospettiva.
  vec2 cloudUv = vec2(vNdc.x * uAspect, vNdc.y * 2.2) * 1.6;
  cloudUv.x += uTime * uCloudSpeed;
  float band = fbm(cloudUv);
  band = mix(band, fbm(cloudUv * 2.1 - vec2(uTime * uCloudSpeed * 0.6, 0.0)), 0.4);
  // Soglie morbide invece di una densita' continua: nuvole dipinte, non vapore.
  float cloud = smoothstep(0.5, 0.78, band) * uCloudAmount;
  // Si addensano a mezza altezza e si diradano allo zenit: un cielo carico
  // proprio in cima schiaccia la scena invece di aprirla.
  cloud *= smoothstep(0.12, 0.5, screenY) * (1.0 - smoothstep(0.72, 1.0, screenY) * 0.55);
  color = mix(color, uCloudTint, cloud * 0.62);

  // Sole: il disco esiste solo se sta davanti alla camera, l'alone sempre.
  vec2 toSun = vec2((vNdc.x - uSunScreen.x) * uAspect, vNdc.y - uSunScreen.y);
  float distanceToSun = length(toSun);
  float glow = exp(-distanceToSun * (3.4 - uSunGlow * 2.0)) * uSunGlow;
  color += uSunColor * glow * 0.55;
  float disc = (1.0 - smoothstep(0.045, 0.075, distanceToSun)) * uSunFacing;
  color = mix(color, uSunColor * 1.6, disc * 0.9);

  gl_FragColor = vec4(color, 1.0);
  // Nessun tone mapping qui: si scrive HDR lineare e ci pensa OutputPass.
  // Ecco perche' un cambio di tema non ricompila piu' nessun materiale di scena.
}
`;

export interface SkyBackgroundHandle {
  /** Da aggiungere alla scena. Si disegna per primo e non scrive profondita'. */
  readonly mesh: Mesh;
  setAtmosphere(atmosphere: Atmosphere): void;
  /**
   * Posizione del sole in NDC e se sta davanti alla camera.
   *
   * La calcola `main.ts` dalla direzione del sole portata in spazio vista: con
   * una camera ortografica un punto all'infinito non ha proiezione utile, quindi
   * si parte dalla direzione e non dalla posizione.
   */
  setSunScreen(x: number, y: number, facing: boolean): void;
  setAspect(aspect: number): void;
  setTime(seconds: number): void;
  dispose(): void;
}

export function createSkyBackground(atmosphere: Atmosphere): SkyBackgroundHandle {
  const skyTop = new Color();
  const skyHorizon = new Color();
  const sunColor = new Color();
  const cloudTint = new Color();
  const sunScreen = new Vector2(0, 0.8);

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSkyTop: { value: skyTop },
      uSkyHorizon: { value: skyHorizon },
      uSunColor: { value: sunColor },
      uSunScreen: { value: sunScreen },
      uSunFacing: { value: 1 },
      uSunGlow: { value: 0.5 },
      uCloudAmount: { value: 0 },
      uCloudSpeed: { value: 0 },
      uCloudTint: { value: cloudTint },
      uAspect: { value: 1 },
      uTime: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });

  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  // Disegnato prima di tutto il resto; senza profondita' non occlude nulla.
  mesh.renderOrder = -1;

  const setAtmosphere = (next: Atmosphere): void => {
    skyTop.setStyle(next.sky.top, SRGBColorSpace);
    skyHorizon.setStyle(next.sky.horizon, SRGBColorSpace);
    cloudTint.setStyle(next.sky.cloudTint, SRGBColorSpace);
    // Un minimo di intensita' resta anche di notte: senza, il disco solare
    // sparirebbe del tutto nel tema neon invece di diventare una luna.
    sunColor
      .setStyle(next.sun.color, SRGBColorSpace)
      .multiplyScalar(Math.max(0.35, next.sun.intensity));
    material.uniforms['uSunGlow'].value = next.sky.sunGlow;
    material.uniforms['uCloudAmount'].value = next.sky.cloudAmount;
    material.uniforms['uCloudSpeed'].value = next.sky.cloudSpeed;
  };

  setAtmosphere(atmosphere);

  return {
    mesh,
    setAtmosphere,
    setSunScreen(x: number, y: number, facing: boolean): void {
      sunScreen.set(x, y);
      material.uniforms['uSunFacing'].value = facing ? 1 : 0;
    },
    setAspect(aspect: number): void {
      material.uniforms['uAspect'].value = aspect;
    },
    setTime(seconds: number): void {
      material.uniforms['uTime'].value = seconds;
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
