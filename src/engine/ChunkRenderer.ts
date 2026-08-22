import {
  Box3,
  BufferGeometry,
  Camera,
  Frustum,
  Group,
  Matrix4,
  Material,
  Mesh,
  ShaderMaterial,
  Sphere,
  Int16BufferAttribute,
  Uint32BufferAttribute,
  Uint8BufferAttribute,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { CHUNK } from '../world/chunkCoords';
import type { VoxelWorld } from '../world/VoxelWorld';
import { buildCeilingSlab, buildPaddedVolume } from './mesher/buildPaddedVolume';
import type { ChunkMeshResult } from './MesherPool';
import { MesherPool } from './MesherPool';

interface ChunkMeshEntry {
  readonly mesh: Mesh;
  geometry: BufferGeometry;
  /** AABB in coordinate di mondo, per il frustum culling. */
  readonly box: Box3;
  bytes: number;
  detailQuads: number;
  appliedJobId: number;
  /** Visibilita' da ripristinare dopo la pass d'ombra. */
  shadowVisible: boolean;
}

/** Voce della coda di rebuild: le coordinate sono tenute in chiaro per non riparsare la chiave. */
interface PendingChunk {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  score: number;
}

export interface ChunkRendererStats {
  readonly chunksAllocated: number;
  readonly chunksNonEmpty: number;
  readonly chunksWithMesh: number;
  readonly chunksVisible: number;
  readonly queued: number;
  readonly inFlight: number;
  readonly geometryBytes: number;
  readonly quads: number;
  readonly detailQuads: number;
}

/** Numero massimo di geometrie caricate per frame, oltre al budget di tempo. */
const MAX_UPLOADS_PER_FRAME = 12;

/** Frame tra due riordinamenti della coda quando la camera non si e' spostata. */
const RESCORE_INTERVAL = 15;

/**
 * Tiene una BufferGeometry per chunk e ne governa il ciclo di rebuild.
 *
 * Il lavoro sul main thread e' limitato da un budget in millisecondi: i chunk
 * sporchi entrano in una coda ordinata per distanza dalla camera, il meshing va
 * ai worker e i risultati vengono caricati poco per frame. Il culling e' fatto a
 * mano per chunk, cosi' il numero di draw call e' anche una statistica leggibile.
 */
export class ChunkRenderer {
  readonly group = new Group();

  private readonly world: VoxelWorld;
  private readonly material: ShaderMaterial;
  private readonly voxelSize: number;
  private readonly pool: MesherPool;

  private readonly entries = new Map<string, ChunkMeshEntry>();
  private readonly pending: PendingChunk[] = [];
  private readonly pendingSet = new Set<string>();

  private readonly frustum = new Frustum();
  private readonly shadowFrustum = new Frustum();
  /** AABB dei soli chunk visibili: e' il volume che la shadow map deve coprire. */
  private readonly visibleBox = new Box3();
  private readonly viewProjection = new Matrix4();
  private readonly cameraPosition = new Vector3();
  private readonly lastScorePosition = new Vector3(Infinity, Infinity, Infinity);
  private framesSinceRescore = 0;
  private needsResort = false;

  private geometryBytes = 0;
  private quadTotal = 0;
  private detailQuadTotal = 0;
  private visibleCount = 0;

  constructor(world: VoxelWorld, material: ShaderMaterial, voxelSize: number, pool = new MesherPool()) {
    this.world = world;
    this.material = material;
    this.voxelSize = voxelSize;
    this.pool = pool;
    this.group.matrixAutoUpdate = false;
  }

  get mesherPool(): MesherPool {
    return this.pool;
  }

  get stats(): ChunkRendererStats {
    let nonEmpty = 0;
    for (const chunk of this.world.chunks.values()) {
      if (!chunk.isEmpty) nonEmpty++;
    }
    return {
      chunksAllocated: this.world.chunkCount,
      chunksNonEmpty: nonEmpty,
      chunksWithMesh: this.entries.size,
      chunksVisible: this.visibleCount,
      queued: this.pending.length,
      inFlight: this.pool.inFlight,
      geometryBytes: this.geometryBytes,
      quads: this.quadTotal,
      detailQuads: this.detailQuadTotal,
    };
  }

  /** true quando non c'e' piu' nulla da meshare. */
  get isIdle(): boolean {
    return this.pending.length === 0 && this.pool.inFlight === 0 && this.pool.pendingResults === 0;
  }

  /**
   * Raccoglie i chunk sporchi, dispaccia il meshing e carica i risultati pronti
   * senza superare il budget di tempo assegnato.
   */
  update(camera: Camera, budgetMs: number): void {
    const start = performance.now();

    this.collectDirty();
    this.rescoreIfNeeded(camera);

    this.dispatch();

    let uploads = 0;
    while (uploads < MAX_UPLOADS_PER_FRAME && performance.now() - start < budgetMs) {
      const result = this.pool.poll();
      if (result === undefined) break;
      this.applyResult(result);
      uploads++;
      // Un worker si e' liberato: rimettiamolo subito al lavoro.
      this.dispatch();
    }
  }

  /** Frustum culling per chunk: imposta `visible` e aggiorna il conteggio. */
  cull(camera: Camera): void {
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);

    let visible = 0;
    this.visibleBox.makeEmpty();
    for (const entry of this.entries.values()) {
      const inside = this.frustum.intersectsBox(entry.box);
      entry.mesh.visible = inside;
      if (inside) {
        visible++;
        this.visibleBox.union(entry.box);
      }
    }
    this.visibleCount = visible;
  }

  /** Volume dei chunk visibili, aggiornato dall'ultima `cull`. */
  get visibleBounds(): Box3 {
    return this.visibleBox;
  }

  /**
   * Disegna i chunk nella shadow map con un materiale di sola profondita'.
   *
   * La visibilita' qui e' diversa da quella della vista: un chunk fuori dallo
   * schermo puo' comunque proiettare ombra dentro, quindi si ricalcola sul
   * frustum del sole. Lo stato precedente viene ripristinato, cosi' il chiamante
   * non deve rifare `cull` prima del render principale.
   *
   * Restituisce il numero di mesh disegnate.
   */
  renderShadow(renderer: WebGLRenderer, camera: Camera, depthMaterial: Material): number {
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.shadowFrustum.setFromProjectionMatrix(this.viewProjection);

    const restored: ChunkMeshEntry[] = [];
    let drawn = 0;
    for (const entry of this.entries.values()) {
      restored.push(entry);
      const inside = this.shadowFrustum.intersectsBox(entry.box);
      entry.shadowVisible = entry.mesh.visible;
      entry.mesh.visible = inside;
      if (inside) {
        entry.mesh.material = depthMaterial;
        drawn++;
      }
    }

    renderer.render(this.group, camera);

    for (const entry of restored) {
      entry.mesh.material = this.material;
      entry.mesh.visible = entry.shadowVisible;
    }
    return drawn;
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.group.remove(entry.mesh);
      entry.geometry.dispose();
    }
    this.entries.clear();
    this.pending.length = 0;
    this.pendingSet.clear();
    this.geometryBytes = 0;
    this.quadTotal = 0;
    this.detailQuadTotal = 0;
    this.pool.dispose();
  }

  private collectDirty(): void {
    const keys = this.world.flush();
    if (keys.length === 0) return;
    for (const key of keys) {
      if (this.pendingSet.has(key)) continue;
      const chunk = this.world.chunks.get(key);
      if (chunk === undefined) continue;
      this.pendingSet.add(key);
      this.pending.push({ key, cx: chunk.cx, cy: chunk.cy, cz: chunk.cz, score: 0 });
    }
    this.needsResort = true;
  }

  /**
   * Riordina la coda per distanza decrescente dalla camera, cosi' `pop()` prende
   * sempre il chunk piu' vicino in tempo costante.
   */
  private rescoreIfNeeded(camera: Camera): void {
    this.framesSinceRescore++;
    if (this.pending.length === 0) return;

    camera.getWorldPosition(this.cameraPosition);
    const moved = this.cameraPosition.distanceToSquared(this.lastScorePosition);
    const chunkWorld = CHUNK * this.voxelSize;
    if (!this.needsResort && this.framesSinceRescore < RESCORE_INTERVAL && moved < chunkWorld * chunkWorld) {
      return;
    }

    this.needsResort = false;
    this.framesSinceRescore = 0;
    this.lastScorePosition.copy(this.cameraPosition);

    const cam = this.cameraPosition;
    const half = chunkWorld * 0.5;
    for (const item of this.pending) {
      const dx = item.cx * chunkWorld + half - cam.x;
      const dy = item.cy * chunkWorld + half - cam.y;
      const dz = item.cz * chunkWorld + half - cam.z;
      item.score = dx * dx + dy * dy + dz * dz;
    }
    this.pending.sort((a, b) => b.score - a.score);
  }

  private dispatch(): void {
    while (this.pool.idleCount > 0 && this.pending.length > 0) {
      const item = this.pending.pop();
      if (item === undefined) return;
      const key = item.key;
      this.pendingSet.delete(key);

      const chunk = this.world.chunks.get(key);
      if (chunk === undefined) continue;

      // Un chunk svuotato non ha bisogno del worker: si butta la geometria.
      if (chunk.isEmpty) {
        this.removeEntry(key);
        continue;
      }

      const padded = this.pool.acquirePadded();
      buildPaddedVolume(this.world, chunk, padded);
      const ceiling = this.pool.acquireCeiling();
      buildCeilingSlab(this.world, chunk, ceiling);
      this.pool.submit(key, padded, ceiling, [chunk.cx * CHUNK, chunk.cy * CHUNK, chunk.cz * CHUNK]);
    }
  }

  private applyResult(result: ChunkMeshResult): void {
    const existing = this.entries.get(result.key);
    // Un rebuild piu' recente ha gia' vinto: questo risultato e' superato.
    if (existing !== undefined && existing.appliedJobId > result.jobId) return;

    if (result.quadCount === 0) {
      this.removeEntry(result.key);
      return;
    }

    const chunk = this.world.chunks.get(result.key);
    if (chunk === undefined) return;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Int16BufferAttribute(result.positions, 3));
    geometry.setAttribute('aFace', new Uint8BufferAttribute(result.faces, 1));
    geometry.setAttribute('aPalette', new Uint8BufferAttribute(result.palettes, 1));
    geometry.setAttribute('aSurface', new Uint8BufferAttribute(result.surfaces, 1));
    geometry.setAttribute('aShade', new Uint8BufferAttribute(result.shade, 1));
    geometry.setIndex(new Uint32BufferAttribute(result.indices, 1));

    const bytes =
      result.positions.byteLength +
      result.faces.byteLength +
      result.palettes.byteLength +
      result.surfaces.byteLength +
      result.shade.byteLength +
      result.indices.byteLength;

    const scale = this.voxelSize;
    const originX = chunk.cx * CHUNK * scale;
    const originY = chunk.cy * CHUNK * scale;
    const originZ = chunk.cz * CHUNK * scale;

    // AABB locale dal mesher, sufficiente per il culling e per evitare che Three
    // debba calcolare a mano la bounding sphere scandendo i vertici.
    const localMin = new Vector3(result.min[0] * scale, result.min[1] * scale, result.min[2] * scale);
    const localMax = new Vector3(result.max[0] * scale, result.max[1] * scale, result.max[2] * scale);
    geometry.boundingBox = new Box3(localMin.clone(), localMax.clone());
    geometry.boundingSphere = new Sphere(
      localMin.clone().add(localMax).multiplyScalar(0.5),
      localMin.distanceTo(localMax) * 0.5,
    );

    if (existing === undefined) {
      const mesh = new Mesh(geometry, this.material);
      mesh.frustumCulled = false; // il culling per chunk lo facciamo noi
      mesh.matrixAutoUpdate = false;
      mesh.position.set(originX, originY, originZ);
      mesh.updateMatrix();

      const box = new Box3(
        localMin.clone().add(mesh.position),
        localMax.clone().add(mesh.position),
      );
      this.group.add(mesh);
      this.entries.set(result.key, {
        mesh,
        geometry,
        box,
        bytes,
        detailQuads: result.detailQuadCount,
        appliedJobId: result.jobId,
        shadowVisible: true,
      });
      this.geometryBytes += bytes;
      this.quadTotal += result.quadCount;
      this.detailQuadTotal += result.detailQuadCount;
      return;
    }

    const previousQuads = existing.geometry.index === null ? 0 : existing.geometry.index.count / 6;
    existing.geometry.dispose();
    existing.mesh.geometry = geometry;
    existing.geometry = geometry;
    existing.box.set(localMin.add(existing.mesh.position), localMax.add(existing.mesh.position));
    this.geometryBytes += bytes - existing.bytes;
    this.quadTotal += result.quadCount - previousQuads;
    this.detailQuadTotal += result.detailQuadCount - existing.detailQuads;
    existing.bytes = bytes;
    existing.detailQuads = result.detailQuadCount;
    existing.appliedJobId = result.jobId;
  }

  private removeEntry(key: string): void {
    const entry = this.entries.get(key);
    if (entry === undefined) return;

    const quads = entry.geometry.index === null ? 0 : entry.geometry.index.count / 6;
    this.group.remove(entry.mesh);
    entry.geometry.dispose();
    this.entries.delete(key);
    this.geometryBytes -= entry.bytes;
    this.quadTotal -= quads;
    this.detailQuadTotal -= entry.detailQuads;
  }
}
