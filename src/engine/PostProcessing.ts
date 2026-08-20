import { HalfFloatType, Vector2, type Scene, type Camera, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Atmosphere } from './themes/theme';

/**
 * Catena di post-processing: bloom e tilt-shift, poi tone mapping.
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
 */

const tiltShiftShader = {
  name: 'TiltShift',
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new Vector2() },
    uStrength: { value: 0 },
    uFocus: { value: 0.5 },
    uWidth: { value: 0.4 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
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

export interface PostProcessingHandle {
  readonly composer: EffectComposer;
  setAtmosphere(atmosphere: Atmosphere): void;
  /** Il gating di qualita' accende e spegne i pass senza ricompilare nulla. */
  setQuality(options: { bloom: boolean; tilt: boolean; bloomScale: number }): void;
  setSize(width: number, height: number, pixelRatio: number): void;
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

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(size.clone(), 0.4, 0.6, 1.2);
  const tiltPass = new ShaderPass(tiltShiftShader);
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(tiltPass);
  composer.addPass(outputPass);

  // Due sorgenti indipendenti: cosa vuole il tema e cosa permette la qualita'.
  // Tenerle separate e' necessario, non pedanteria: se si scrivesse il risultato
  // dentro `pass.enabled`, un abbassamento di qualita' cancellerebbe la scelta
  // del tema e alzandola non tornerebbe piu' indietro.
  let themeBloom = false;
  let themeTilt = false;
  let qualityBloom = true;
  let qualityTilt = true;
  let bloomScale = 1;

  const syncEnabled = (): void => {
    bloomPass.enabled = themeBloom && qualityBloom;
    tiltPass.enabled = themeTilt && qualityTilt;
  };

  const applySize = (width: number, height: number, pixelRatio: number): void => {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    const bufferWidth = Math.max(1, Math.round(width * pixelRatio * bloomScale));
    const bufferHeight = Math.max(1, Math.round(height * pixelRatio * bloomScale));
    bloomPass.resolution.set(bufferWidth, bufferHeight);
    tiltPass.uniforms['uTexel'].value.set(
      1 / Math.max(1, width * pixelRatio),
      1 / Math.max(1, height * pixelRatio),
    );
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
      syncEnabled();
    },

    setQuality(options): void {
      // `enabled` a false salta il pass del tutto: nessun costo, nessun rebuild.
      qualityBloom = options.bloom;
      qualityTilt = options.tilt;
      bloomScale = options.bloomScale;
      syncEnabled();
    },

    setSize(width: number, height: number, pixelRatio: number): void {
      applySize(width, height, pixelRatio);
    },

    render(): void {
      composer.render();
    },

    dispose(): void {
      composer.dispose();
      bloomPass.dispose();
      tiltPass.dispose();
      outputPass.dispose();
    },
  };
}
