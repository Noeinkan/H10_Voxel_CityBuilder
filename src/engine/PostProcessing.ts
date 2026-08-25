import {
  DepthFormat,
  DepthTexture,
  HalfFloatType,
  NearestFilter,
  UnsignedIntType,
  Vector2,
  type Scene,
  type Camera,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Atmosphere } from './themes/theme';

/**
 * Catena di post-processing: contorno delle sagome, bloom, raggi del sole,
 * tilt-shift, tone mapping e ritocco finale di colore.
 *
 * Il composer e' **sempre attivo**. Alternare fra render diretto e composer
 * significherebbe accendere e spegnere il tone mapping dentro i materiali, cioe'
 * ricompilarne il programma a ogni cambio di qualita': esattamente la cosa che
 * l'architettura dei temi e' fatta per evitare. Il gating agisce sui singoli
 * pass con `enabled`, che non costa nulla.
 *
 * Di conseguenza `VoxelMaterial` e `SkyBackground` scrivono HDR **lineare** e non
 * includono piu' i chunk di tone mapping: se ne occupa `OutputPass`, che si
 * ricompila da solo quando cambia `renderer.toneMapping`. Nessun materiale di
 * scena viene mai ricompilato da un cambio di tema.
 *
 * L'ordine dei pass conta:
 *
 *   scena -> contorno -> bloom -> raggi -> tilt-shift -> tone mapping -> ritocco
 *
 * Il contorno legge la **profondita'** della scena prima che qualunque pass a
 * schermo pieno la sovrascriva; il ritocco vive **dopo** il tone mapping, in
 * sRGB, dove saturazione e contrasto hanno un significato visivo stabile.
 */

/** Vertice condiviso da tutti i pass a schermo pieno: un quad in NDC. */
const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const tiltShiftShader = {
  name: 'TiltShift',
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new Vector2() },
    uStrength: { value: 0 },
    uFocus: { value: 0.5 },
    uWidth: { value: 0.4 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uStrength;
    uniform float uFocus;
    uniform float uWidth;
    varying vec2 vUv;

    void main() {
      // Sfocatura fuori da una banda orizzontale a fuoco: e' il segnale che
      // dice "modellino". Su una camera ortografica un DOF corretto per
      // profondita' direbbe molto meno, perche' non c'e' convergenza.
      float fromBand = abs(vUv.y - uFocus);
      float coc = smoothstep(uWidth, uWidth + 0.32, fromBand) * uStrength;
      if (coc <= 0.002) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec3 sum = vec3(0.0);
      // Disco ad angolo aureo: niente array di offset, che in GLSL ES 1.00
      // non si possono inizializzare in modo costante.
      for (int i = 0; i < 12; i++) {
        float t = float(i);
        float angle = t * 2.399963;
        float radius = sqrt((t + 0.5) / 12.0);
        vec2 offset = vec2(cos(angle), sin(angle)) * radius * coc * 14.0 * uTexel;
        sum += texture2D(tDiffuse, vUv + offset).rgb;
      }
      gl_FragColor = vec4(sum / 12.0, 1.0);
    }
  `,
};

/**
 * Ritocco finale: saturazione, contrasto e vignettatura, in spazio sRGB.
 *
 * Vive **dopo** `OutputPass` perche' sono operazioni di visualizzazione, non di
 * luce: applicarle in HDR lineare farebbe dipendere l'effetto dal tone mapping,
 * che e' esattamente la cosa da cui questo pass e' separato. L'aspect entra
 * nella vignettatura perche' gli angoli devono restare tondi su uno schermo
 * largo.
 */
const gradeShader = {
  name: 'Grade',
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1 },
    uContrast: { value: 0 },
    uVignette: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      // Saturazione attorno alla luminanza: 1 e' il neutro, e' qui che un tema
      // chiede colori piu' vivi senza toccare la palette.
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      // Contrasto attorno al grigio medio, in sRGB: e' la scala in cui si legge.
      color = (color - 0.5) * (1.0 + uContrast) + 0.5;
      // Vignettatura circolare: il raggio usa l'aspect per restare tondo.
      vec2 centered = vUv - 0.5;
      centered.x *= uAspect;
      float radius = length(centered);
      float vig = 1.0 - smoothstep(0.45, 0.9, radius) * uVignette;
      color *= vig;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/**
 * Raggi del sole in spazio schermo.
 *
 * Una pass sola: per ogni pixel si risale verso la posizione del sole e si
 * accumulano i campioni chiari con un decadimento. Solo il sole e il suo alone
 * superano la soglia di luminanza, quindi le finestre accese non generano raggi
 * propri. Il decadimento e il peso sono le costanti classiche dell'effetto,
 * esposte come uniform perche' il tema tara la sola `uStrength`.
 */
const godRaysShader = {
  name: 'GodRays',
  uniforms: {
    tDiffuse: { value: null },
    uSunScreen: { value: new Vector2(0.5, 0.8) },
    uSunFacing: { value: 1 },
    uAspect: { value: 1 },
    uStrength: { value: 0 },
    uWeight: { value: 0.02 },
    uDecay: { value: 0.985 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunScreen;
    uniform float uSunFacing;
    uniform float uAspect;
    uniform float uStrength;
    uniform float uWeight;
    uniform float uDecay;
    varying vec2 vUv;

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      // Direzione radiale dal sole, corretta per l'aspect: il disco solare e'
      // tondo sullo schermo e i raggi devono irradiare come lui. Lo stesso
      // trattamento che SkyBackground riserva alla distanza dal disco.
      vec2 delta = vec2((vUv.x - uSunScreen.x) * uAspect, vUv.y - uSunScreen.y);
      delta *= 0.5 / 16.0;
      vec2 uv = vUv;
      float decay = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 16; i++) {
        uv -= delta;
        // "sample" e' una parola riservata di GLSL: niente variabile con quel
        // nome, o il programma non compila e la scena sparisce.
        vec3 tap = texture2D(tDiffuse, uv).rgb;
        // Solo il disco solare e il suo alone alimentano i raggi: la soglia e'
        // alta apposta, perche' il cielo chiaro altrimenti velerebbe tutta
        // l'inquadratura di una foschia (era il difetto della prima taratura).
        float lum = dot(tap, vec3(0.2126, 0.7152, 0.0722));
        acc += tap * smoothstep(0.9, 1.8, lum) * decay * uWeight;
        decay *= uDecay;
      }
      gl_FragColor = vec4(base + acc * uStrength * uSunFacing, 1.0);
    }
  `,
};

/**
 * Contorno scuro delle sagome, dal gradiente di profondita'.
 *
 * Con una camera ortografica tutti i raggi sono paralleli: dentro l'edificato la
 * profondita' non cambia quasi, quindi il gradiente esiste solo dove una sagoma
 * si staglia sul cielo o su un'altra quota. Il Sobel sulla profondita' marca
 * esattamente quei profili e nient'altro — e' il contorno "cartoon" senza linee
 * interne.
 */
const outlineShader = {
  name: 'Outline',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new Vector2() },
    uStrength: { value: 0 },
    uEdgeThreshold: { value: 0.04 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uStrength;
    uniform float uEdgeThreshold;
    varying vec2 vUv;

    float depthAt(vec2 uv) {
      return texture2D(tDepth, uv).r;
    }

    void main() {
      vec2 t = uTexel;
      float d0 = depthAt(vUv + vec2(-t.x, -t.y));
      float d1 = depthAt(vUv + vec2(0.0, -t.y));
      float d2 = depthAt(vUv + vec2(t.x, -t.y));
      float d3 = depthAt(vUv + vec2(-t.x, 0.0));
      float d4 = depthAt(vUv + vec2(t.x, 0.0));
      float d5 = depthAt(vUv + vec2(-t.x, t.y));
      float d6 = depthAt(vUv + vec2(0.0, t.y));
      float d7 = depthAt(vUv + vec2(t.x, t.y));
      float gx = -d0 - 2.0 * d3 - d5 + d2 + 2.0 * d4 + d7;
      float gy = -d0 - 2.0 * d1 - d2 + d5 + 2.0 * d6 + d7;
      float edge = smoothstep(uEdgeThreshold, uEdgeThreshold * 2.0, clamp(length(vec2(gx, gy)), 0.0, 1.0));
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      color *= 1.0 - edge * uStrength * 0.7;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/**
 * `ShaderPass` che campiona anche la profondita' del buffer di lettura.
 *
 * Il composer alterna i suoi due render target, quindi la profondita' giusta non
 * e' un riferimento fisso: va letta dal `readBuffer` del fotogramma, esattamente
 * come `ShaderPass` fa con il colore in `tDiffuse`.
 */
class DepthEdgePass extends ShaderPass {
  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    this.uniforms['tDepth'].value = readBuffer.depthTexture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

/**
 * Ritocco di colore di default: vale per i temi che non ne dichiarano uno.
 *
 * La saturazione sopra 1 e' la risposta alla richiesta di colori piu' vivi, e
 * resta dentro il ritocco invece che dentro la palette: cosi' un tema puo'
 * tornare al proprio look scrivendo `grade`, senza ridisegnare i 32 colori. Il
 * contrasto e' un filo sopra lo zero per dare spigolo ai colori, la vignettatura
 * e' tenuta bassa per non scurire gli angoli fino a farli sembrare foschia.
 */
const DEFAULT_GRADE = { saturation: 1.12, contrast: 0.06, vignette: 0.2 };
/** Raggi del sole di default: visibili, ma senza rubare la scena al diorama. */
const DEFAULT_GOD_RAYS = { strength: 0.32 };
/** Contorno di default: un profilo scuro leggibile, non una linea d'inchiostro. */
const DEFAULT_OUTLINE = { strength: 0.45 };

export interface PostProcessingHandle {
  readonly composer: EffectComposer;
  setAtmosphere(atmosphere: Atmosphere): void;
  /** Il gating di qualita' accende e spegne i pass senza ricompilare nulla. */
  setQuality(options: {
    bloom: boolean;
    tilt: boolean;
    grade: boolean;
    godRays: boolean;
    outline: boolean;
    bloomScale: number;
  }): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  /**
   * Posizione del sole a schermo, in NDC come la calcola `main.ts` per il cielo.
   *
   * E' la stessa coppia che riceve `SkyBackground`: cosi' i raggi irradiano
   * esattamente dal disco disegnato, e la correzione d'aspect avviene nello
   * shader come la'. `facing` spegne i raggi quando il sole e' dietro la camera.
   */
  setSunScreen(x: number, y: number, facing: boolean): void;
  render(): void;
  dispose(): void;
}

export function createPostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): PostProcessingHandle {
  const size = renderer.getDrawingBufferSize(new Vector2());

  // HalfFloat: la scena esce in HDR lineare, e il bloom ha bisogno dei valori
  // sopra 1 per distinguere gli emissivi dal bianco.
  const composer = new EffectComposer(renderer);
  composer.renderTarget1.texture.type = HalfFloatType;
  composer.renderTarget2.texture.type = HalfFloatType;

  // La profondita' della scena serve al contorno: si attacca una texture di
  // profondita' a entrambi i buffer del composer, perche' il contorno legge
  // quello che di volta in volta e' il `readBuffer`. Le dimensioni vanno
  // ricalcolate a mano a ogni `setSize`, come fa `SunShadow`.
  composer.renderTarget1.depthTexture = createDepthTexture(size.x, size.y);
  composer.renderTarget2.depthTexture = createDepthTexture(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  const outlinePass = new DepthEdgePass(outlineShader);
  const bloomPass = new UnrealBloomPass(size.clone(), 0.4, 0.6, 1.2);
  const godRaysPass = new ShaderPass(godRaysShader);
  const tiltPass = new ShaderPass(tiltShiftShader);
  const outputPass = new OutputPass();
  const gradePass = new ShaderPass(gradeShader);

  composer.addPass(renderPass);
  composer.addPass(outlinePass);
  composer.addPass(bloomPass);
  composer.addPass(godRaysPass);
  composer.addPass(tiltPass);
  composer.addPass(outputPass);
  composer.addPass(gradePass);

  // Due sorgenti indipendenti: cosa vuole il tema e cosa permette la qualita'.
  // Tenerle separate e' necessario, non pedanteria: se si scrivesse il risultato
  // dentro `pass.enabled`, un abbassamento di qualita' cancellerebbe la scelta
  // del tema e alzandola non tornerebbe piu' indietro.
  let themeBloom = false;
  let themeTilt = false;
  let themeGodRays = false;
  let themeOutline = false;
  let qualityBloom = true;
  let qualityTilt = true;
  let qualityGrade = true;
  let qualityGodRays = true;
  let qualityOutline = true;
  let bloomScale = 1;

  const syncEnabled = (): void => {
    bloomPass.enabled = themeBloom && qualityBloom;
    tiltPass.enabled = themeTilt && qualityTilt;
    godRaysPass.enabled = themeGodRays && qualityGodRays;
    outlinePass.enabled = themeOutline && qualityOutline;
    // Il ritocco e' sempre voluto: disabilitarlo e' scrivere saturazione 1,
    // contrasto 0 e vignettatura 0, non spegnere la pass. Resta solo il gating
    // di qualita', per il modo `performance` che toglie ogni pass in piu'.
    gradePass.enabled = qualityGrade;
  };

  const applySize = (width: number, height: number, pixelRatio: number): void => {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    const bufferWidth = Math.max(1, Math.round(width * pixelRatio));
    const bufferHeight = Math.max(1, Math.round(height * pixelRatio));
    const aspect = width / Math.max(1, height);
    const texelX = 1 / bufferWidth;
    const texelY = 1 / bufferHeight;

    bloomPass.resolution.set(
      Math.max(1, Math.round(width * pixelRatio * bloomScale)),
      Math.max(1, Math.round(height * pixelRatio * bloomScale)),
    );
    tiltPass.uniforms['uTexel'].value.set(texelX, texelY);
    outlinePass.uniforms['uTexel'].value.set(texelX, texelY);
    gradePass.uniforms['uAspect'].value = aspect;
    godRaysPass.uniforms['uAspect'].value = aspect;

    resizeDepthTexture(composer.renderTarget1.depthTexture, bufferWidth, bufferHeight);
    resizeDepthTexture(composer.renderTarget2.depthTexture, bufferWidth, bufferHeight);
  };

  return {
    composer,

    setAtmosphere(atmosphere: Atmosphere): void {
      const bloom = atmosphere.bloom;
      themeBloom = bloom !== undefined && bloom.strength > 0;
      if (bloom !== undefined) {
        bloomPass.threshold = bloom.threshold;
        bloomPass.strength = bloom.strength;
        bloomPass.radius = bloom.radius;
      }

      const tilt = atmosphere.tilt;
      themeTilt = tilt !== undefined && tilt.strength > 0;
      if (tilt !== undefined) {
        tiltPass.uniforms['uStrength'].value = tilt.strength;
        tiltPass.uniforms['uFocus'].value = tilt.focus;
        tiltPass.uniforms['uWidth'].value = tilt.width;
      }

      // Il ritocco: il default sopra 1 in saturazione e' il colore piu' vivo.
      const grade = atmosphere.grade;
      gradePass.uniforms['uSaturation'].value = grade?.saturation ?? DEFAULT_GRADE.saturation;
      gradePass.uniforms['uContrast'].value = grade?.contrast ?? DEFAULT_GRADE.contrast;
      gradePass.uniforms['uVignette'].value = grade?.vignette ?? DEFAULT_GRADE.vignette;

      // Raggi e contorno: il default li accende, un tema li spegne con `strength: 0`.
      const rays = atmosphere.godRays;
      godRaysPass.uniforms['uStrength'].value = rays?.strength ?? DEFAULT_GOD_RAYS.strength;
      themeGodRays = (rays?.strength ?? DEFAULT_GOD_RAYS.strength) > 0;

      const outline = atmosphere.outline;
      outlinePass.uniforms['uStrength'].value = outline?.strength ?? DEFAULT_OUTLINE.strength;
      themeOutline = (outline?.strength ?? DEFAULT_OUTLINE.strength) > 0;

      syncEnabled();
    },

    setQuality(options): void {
      // `enabled` a false salta il pass del tutto: nessun costo, nessun rebuild.
      qualityBloom = options.bloom;
      qualityTilt = options.tilt;
      qualityGrade = options.grade;
      qualityGodRays = options.godRays;
      qualityOutline = options.outline;
      bloomScale = options.bloomScale;
      syncEnabled();
    },

    setSize(width: number, height: number, pixelRatio: number): void {
      applySize(width, height, pixelRatio);
    },

    setSunScreen(x: number, y: number, facing: boolean): void {
      godRaysPass.uniforms['uSunScreen'].value.set(x * 0.5 + 0.5, y * 0.5 + 0.5);
      godRaysPass.uniforms['uSunFacing'].value = facing ? 1 : 0;
    },

    render(): void {
      composer.render();
    },

    dispose(): void {
      composer.dispose();
      outlinePass.dispose();
      bloomPass.dispose();
      godRaysPass.dispose();
      tiltPass.dispose();
      outputPass.dispose();
      gradePass.dispose();
      composer.renderTarget1.depthTexture?.dispose();
      composer.renderTarget2.depthTexture?.dispose();
    },
  };
}

function createDepthTexture(width: number, height: number): DepthTexture {
  const depth = new DepthTexture(width, height);
  depth.format = DepthFormat;
  depth.type = UnsignedIntType;
  depth.minFilter = NearestFilter;
  depth.magFilter = NearestFilter;
  depth.generateMipmaps = false;
  return depth;
}

/**
 * Il composer ridimensiona i colori dei render target ma non le texture di
 * profondita': le si riallinea a mano, con lo stesso gesto di `SunShadow.setSize`.
 */
function resizeDepthTexture(depth: DepthTexture | null, width: number, height: number): void {
  if (depth === null) return;
  if (depth.image.width === width && depth.image.height === height) return;
  depth.image.width = width;
  depth.image.height = height;
  depth.needsUpdate = true;
}
