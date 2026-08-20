import {
  Box3,
  DepthFormat,
  DepthTexture,
  Matrix4,
  NearestFilter,
  OrthographicCamera,
  ShaderMaterial,
  UnsignedIntType,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { MESH_UNITS_PER_VOXEL } from './mesher/meshTypes';

/**
 * Shadow map ortografica allineata al sole.
 *
 * Una sola pass di profondita' sui chunk visibili, con un materiale che ripete
 * *esattamente* la trasformazione di vertice del materiale principale: se le due
 * divergono, le ombre si staccano dalla geometria. E' l'unico punto in cui il
 * `MESH_UNITS_PER_VOXEL` va tenuto allineato a mano.
 *
 * Il frustum si adatta all'AABB dei chunk visibili, che `ChunkRenderer` gia'
 * tiene per il culling: nessuna scansione di vertici. Gli estremi vengono
 * agganciati alla griglia dei texel, altrimenti muovendo la camera il bordo
 * delle ombre striscia da un texel all'altro e si vede.
 *
 * Il bias e' *normal-offset*: si sposta il punto campionato lungo la normale
 * prima di proiettarlo. Su geometria allineata agli assi come questa funziona
 * quasi perfettamente, e non produce il distacco alla base che darebbe un bias
 * solo in profondita'.
 */

const depthVertexShader = /* glsl */ `
uniform float uVoxelSize;

void main() {
  // Stessa trasformazione di VoxelMaterial: position e' Int16 in sedicesimi.
  vec4 worldPosition = modelMatrix * vec4(position * (uVoxelSize / ${MESH_UNITS_PER_VOXEL}.0), 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const depthFragmentShader = /* glsl */ `
void main() {
  // Interessa solo il depth buffer; il colore viene scartato.
  gl_FragColor = vec4(1.0);
}
`;

export interface SunShadowStats {
  readonly size: number;
  readonly enabled: boolean;
  readonly lastPassMs: number;
  readonly meshesDrawn: number;
}

export interface SunShadowHandle {
  /** Materiale di profondita', prestato a `ChunkRenderer` per la pass. */
  readonly depthMaterial: ShaderMaterial;
  readonly camera: OrthographicCamera;
  /** Da mondo a coordinate di shadow map, gia' con il bias in [0,1]. */
  readonly matrix: Matrix4;
  readonly texture: DepthTexture;
  readonly stats: SunShadowStats;
  /** Texel in unita' di mondo: serve a dimensionare il bias e il raggio PCF. */
  readonly worldTexelSize: number;
  /**
   * Riadatta il frustum al volume illuminato. Da chiamare solo quando la camera
   * si e' mossa o sono arrivati chunk, non a ogni frame.
   */
  fit(bounds: Box3, sunDirection: Vector3): void;
  begin(renderer: WebGLRenderer): void;
  end(renderer: WebGLRenderer, elapsedMs: number, meshesDrawn: number): void;
  setSize(size: number): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

const UP = new Vector3(0, 0, 1);
const FALLBACK_UP = new Vector3(0, 1, 0);

export function createSunShadow(voxelSize: number, size = 2048): SunShadowHandle {
  let currentSize = size;
  let enabled = true;
  let lastPassMs = 0;
  let meshes = 0;
  let worldTexelSize = 1;

  const depthMaterial = new ShaderMaterial({
    vertexShader: depthVertexShader,
    fragmentShader: depthFragmentShader,
    uniforms: { uVoxelSize: { value: voxelSize } },
  });

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.up.copy(UP);

  // Three tipizza `target.depthTexture` come nullable: ne teniamo il
  // riferimento a parte, cosi' il resto del file non lo deve richiedere ogni volta.
  const { target, depth } = createTarget(currentSize);
  const matrix = new Matrix4();

  const centre = new Vector3();
  const eye = new Vector3();
  const corner = new Vector3();
  let previousTarget: WebGLRenderTarget | null = null;

  return {
    depthMaterial,
    camera,
    matrix,
    get texture(): DepthTexture {
      return depth;
    },
    get stats(): SunShadowStats {
      return { size: currentSize, enabled, lastPassMs, meshesDrawn: meshes };
    },
    get worldTexelSize(): number {
      return worldTexelSize;
    },

    fit(bounds: Box3, sunDirection: Vector3): void {
      if (bounds.isEmpty()) return;
      bounds.getCenter(centre);
      const radius = bounds.getSize(corner).length() * 0.5;
      if (radius <= 0) return;

      // La camera del sole guarda il centro del volume da abbastanza lontano da
      // contenerlo tutto: e' ortografica, quindi la distanza non cambia la scala.
      eye.copy(sunDirection).multiplyScalar(radius * 2 + 1).add(centre);
      // Con il sole allo zenit `up` e la direzione sarebbero paralleli e lookAt
      // degenererebbe: si ripiega su un altro asse.
      camera.up.copy(Math.abs(sunDirection.z) > 0.999 ? FALLBACK_UP : UP);
      camera.position.copy(eye);
      camera.lookAt(centre);
      camera.updateMatrixWorld();

      // Estensione del volume in spazio sole, dai soli 8 vertici dell'AABB.
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < 8; i++) {
        corner.set(
          (i & 1) === 0 ? bounds.min.x : bounds.max.x,
          (i & 2) === 0 ? bounds.min.y : bounds.max.y,
          (i & 4) === 0 ? bounds.min.z : bounds.max.z,
        );
        corner.applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y);
        maxY = Math.max(maxY, corner.y);
        // In spazio vista la camera guarda lungo -Z: le profondita' sono negative.
        minZ = Math.min(minZ, -corner.z);
        maxZ = Math.max(maxZ, -corner.z);
      }

      // Aggancio alla griglia dei texel: senza, il bordo delle ombre striscia
      // da un texel all'altro mentre la camera si muove, e si vede come sfarfallio.
      worldTexelSize = Math.max(maxX - minX, maxY - minY) / currentSize;
      const snap = (value: number): number => Math.floor(value / worldTexelSize) * worldTexelSize;
      minX = snap(minX);
      minY = snap(minY);
      maxX = snap(maxX) + worldTexelSize;
      maxY = snap(maxY) + worldTexelSize;

      camera.left = minX;
      camera.right = maxX;
      camera.bottom = minY;
      camera.top = maxY;
      camera.near = Math.max(0.05, minZ - worldTexelSize);
      camera.far = maxZ + worldTexelSize;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // Da clip [-1,1] a coordinate di texture [0,1].
      matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      matrix.multiply(camera.projectionMatrix);
      matrix.multiply(camera.matrixWorldInverse);
    },

    begin(renderer: WebGLRenderer): void {
      previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.clear(true, true, false);
    },

    end(renderer: WebGLRenderer, elapsedMs: number, meshesDrawn: number): void {
      renderer.setRenderTarget(previousTarget);
      previousTarget = null;
      lastPassMs = elapsedMs;
      meshes = meshesDrawn;
    },

    setSize(next: number): void {
      if (next === currentSize) return;
      currentSize = next;
      target.setSize(next, next);
      depth.image.width = next;
      depth.image.height = next;
      depth.needsUpdate = true;
    },

    setEnabled(next: boolean): void {
      enabled = next;
      if (!next) {
        lastPassMs = 0;
        meshes = 0;
      }
    },

    dispose(): void {
      depth.dispose();
      target.dispose();
      depthMaterial.dispose();
    },
  };
}

function createTarget(size: number): { target: WebGLRenderTarget; depth: DepthTexture } {
  const target = new WebGLRenderTarget(size, size);
  target.texture.minFilter = NearestFilter;
  target.texture.magFilter = NearestFilter;
  target.texture.generateMipmaps = false;
  target.stencilBuffer = false;
  // La profondita' va in una texture campionabile: e' tutto cio' che ci serve,
  // il colore e' un attachment obbligato che non leggiamo mai.
  const depth = new DepthTexture(size, size);
  depth.format = DepthFormat;
  depth.type = UnsignedIntType;
  depth.minFilter = NearestFilter;
  depth.magFilter = NearestFilter;
  target.depthTexture = depth;
  return { target, depth };
}
