import {
  Color,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { cloudDeckHelpers, cloudDeckUniforms } from './shaders/cloudDeck.glsl';
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
${cloudDeckUniforms}
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunColor;
uniform vec2 uSunScreen;
uniform float uSunFacing;
uniform float uSunGlow;
// Le bande dipinte del fondo — sky.cloud* nel tema — che sono un'altra cosa
// dallo strato di nuvole: quelle stanno in coordinate di schermo e non hanno una
// quota, questo e' un piano nel mondo. Il prefisso le tiene distinte anche
// quando le si legge una sotto l'altra.
uniform float uBandAmount;
uniform float uBandSpeed;
uniform vec3 uBandTint;
uniform float uAspect;
uniform float uTime;

/**
 * Dalla NDC al mondo: serve **solo** allo strato di nuvole.
 *
 * Il fondo e' un quad in NDC e non ha una posizione di mondo; lo strato invece
 * e' un piano a una quota vera, e per sapere dove il raggio lo taglia bisogna
 * uscire dallo schermo. Una matrice per frame, non un conto per pixel.
 */
uniform mat4 uInvViewProj;
uniform vec3 uViewDirection;

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
${cloudDeckHelpers}

void main() {
  // Il gradiente segue l'altezza di schermo, con la stessa curva con cui la
  // nebbia di VoxelMaterial tinge verso il cielo: sono due implementazioni
  // della stessa mappatura, e divergendo cucirebbero una riga proprio
  // all'orizzonte, dove il fondo e la geometria lontana si toccano.
  float screenY = vNdc.y * 0.5 + 0.5;
  vec3 color = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 1.0, screenY));

  // Le nuvole si schiacciano verso l'orizzonte: e' cio' che da' profondita' a
  // un cielo che non ha prospettiva.
  vec2 bandUv = vec2(vNdc.x * uAspect, vNdc.y * 2.2) * 1.6;
  bandUv.x += uTime * uBandSpeed;
  float band = fbm(bandUv);
  band = mix(band, fbm(bandUv * 2.1 - vec2(uTime * uBandSpeed * 0.6, 0.0)), 0.4);
  // Soglie morbide invece di una densita' continua: nuvole dipinte, non vapore.
  float painted = smoothstep(0.5, 0.78, band) * uBandAmount;
  // Si addensano a mezza altezza e si diradano allo zenit: un cielo carico
  // proprio in cima schiaccia la scena invece di aprirla.
  painted *= smoothstep(0.12, 0.5, screenY) * (1.0 - smoothstep(0.72, 1.0, screenY) * 0.55);
  color = mix(color, uBandTint, painted * 0.62);

  // Sole: il disco esiste solo se sta davanti alla camera, l'alone sempre.
  vec2 toSun = vec2((vNdc.x - uSunScreen.x) * uAspect, vNdc.y - uSunScreen.y);
  float distanceToSun = length(toSun);
  float glow = exp(-distanceToSun * (3.4 - uSunGlow * 2.0)) * uSunGlow;
  color += uSunColor * glow * 0.55;
  float disc = (1.0 - smoothstep(0.045, 0.075, distanceToSun)) * uSunFacing;
  color = mix(color, uSunColor * 1.6, disc * 0.9);

  // Lo strato di nuvole, dove non c'e' niente davanti a coprirlo. E' la stessa
  // nuvola del fragment del voxel — stesse celle, stessa rigatura, stesso
  // istante — e a farle combaciare sul filo dell'isola e' il fatto che il punto
  // di attraversamento sia calcolato sullo stesso piano di mondo.
  if (uCloudAmount > 0.0) {
    // Il punto sul piano vicino della camera: da li' cloudSkyTrace scende lungo
    // la direzione di vista fino alla lastra. Con una camera ortografica i raggi
    // sono paralleli, quindi la direzione e' una sola per tutto il fotogramma.
    vec4 nearPoint = uInvViewProj * vec4(vNdc, -1.0, 1.0);
    vec3 origin = nearPoint.xyz / nearPoint.w;
    vec2 cloud = cloudSkyTrace(origin, uViewDirection, uTime);

    if (cloudHatch(gl_FragCoord.xy) < cloud.x) {
      // Il fondo non ha una nebbia da cui prendere la tinta: senza una propria,
      // lo strato prende il cielo all'orizzonte, che e' cio' verso cui la
      // prospettiva aerea fa tendere la distanza dall'altra parte del filo.
      color = mix(uSkyHorizon, uCloudTint, uCloudTintBlend) * cloudShade(cloud.y);
    }
  }

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
  /**
   * La camera del fotogramma, per il solo strato di nuvole.
   *
   * Il fondo e' un quad in NDC e non saprebbe dire a quale punto del mondo
   * corrisponde un suo pixel: senza questa, lo strato si potrebbe disegnare solo
   * dove c'e' geometria, che e' il difetto da cui questa meta' e' nata.
   */
  setCamera(invViewProj: Matrix4, viewX: number, viewY: number, viewZ: number): void;
  /** Lo stesso interruttore del materiale dei voxel: e' una nuvola sola. */
  setClouds(on: boolean): void;
  dispose(): void;
}

export function createSkyBackground(atmosphere: Atmosphere): SkyBackgroundHandle {
  const skyTop = new Color();
  const skyHorizon = new Color();
  const sunColor = new Color();
  const bandTint = new Color();
  const deckTint = new Color();
  const sunScreen = new Vector2(0, 0.8);
  const invViewProj = new Matrix4();
  const viewDirection = new Vector3(0, 0, -1);

  /** Come sopra in `VoxelMaterial`: il tema dice quanto, il giocatore se. */
  let deckAmount = 0;
  let cloudsOn = true;

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
      uBandAmount: { value: 0 },
      uBandSpeed: { value: 0 },
      uBandTint: { value: bandTint },
      uAspect: { value: 1 },
      uTime: { value: 0 },

      uCloudHeight: { value: 0 },
      uCloudThickness: { value: 1 },
      uCloudAmount: { value: 0 },
      uCloudCoverage: { value: 0 },
      uCloudCellSize: { value: 1 },
      uCloudScale: { value: 1 },
      uCloudSpeed: { value: 0 },
      uCloudTint: { value: deckTint },
      uCloudTintBlend: { value: 0 },
      uInvViewProj: { value: invViewProj },
      uViewDirection: { value: viewDirection },
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
    bandTint.setStyle(next.sky.cloudTint, SRGBColorSpace);
    // Un minimo di intensita' resta anche di notte: senza, il disco solare
    // sparirebbe del tutto nel tema neon invece di diventare una luna.
    sunColor
      .setStyle(next.sun.color, SRGBColorSpace)
      .multiplyScalar(Math.max(0.35, next.sun.intensity));
    material.uniforms['uSunGlow'].value = next.sky.sunGlow;
    material.uniforms['uBandAmount'].value = next.sky.cloudAmount;
    material.uniforms['uBandSpeed'].value = next.sky.cloudSpeed;

    // Lo strato: gli stessi numeri che legge il materiale dei voxel, perche' e'
    // la stessa nuvola vista da due parti del filo della sagoma.
    const deck = next.cloudDeck;
    deckAmount = deck?.amount ?? 0;
    material.uniforms['uCloudHeight'].value = deck?.height ?? 0;
    material.uniforms['uCloudThickness'].value = deck?.thickness ?? 1;
    material.uniforms['uCloudAmount'].value = cloudsOn ? deckAmount : 0;
    material.uniforms['uCloudCoverage'].value = deck?.coverage ?? 0;
    material.uniforms['uCloudCellSize'].value = Math.max(1e-3, deck?.cellSize ?? 1);
    material.uniforms['uCloudScale'].value = Math.max(1e-3, deck?.scale ?? 1);
    material.uniforms['uCloudSpeed'].value = deck?.speed ?? 0;
    deckTint.setStyle(deck?.tint ?? '#ffffff', SRGBColorSpace);
    material.uniforms['uCloudTintBlend'].value = deck?.tint === undefined ? 0 : 1;
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
    setCamera(matrix: Matrix4, viewX: number, viewY: number, viewZ: number): void {
      invViewProj.copy(matrix);
      viewDirection.set(viewX, viewY, viewZ);
    },
    setClouds(on: boolean): void {
      cloudsOn = on;
      material.uniforms['uCloudAmount'].value = on ? deckAmount : 0;
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
