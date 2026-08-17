import { Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { ChunkRenderer } from './engine/ChunkRenderer';
import { IsoCameraController } from './engine/IsoCameraController';
import { onPaletteChanged, paletteHex } from './engine/palette';
import { createVoxelMaterial } from './engine/VoxelMaterial';
import { DebugOverlay, type OverlayFrame } from './ui/DebugOverlay';
import { CHUNK } from './world/chunkCoords';
import { createScene, type SceneGenerator, type SceneKind } from './world/scenes/cityScene';
import { VoxelWorld } from './world/VoxelWorld';

/**
 * Bootstrap del motore e harness di performance.
 *
 * Il lavoro sul main thread e' contenuto in un budget per frame: generazione
 * della scena e upload delle geometrie si fermano appena lo esauriscono, cosi'
 * il frame resta sotto la soglia anche durante il popolamento iniziale.
 */

/** Millisecondi di lavoro non-render concessi per frame, sotto il limite di 4 ms. */
const FRAME_BUDGET_MS = 3;

/** Quota del budget riservata alla generazione della scena. */
const GENERATION_BUDGET_MS = 1.5;

const VOXEL_SIZE = 1;

const params = new URLSearchParams(window.location.search);
const debugEnabled = params.get('debug') === '1';
const sceneKind = parseSceneKind(params.get('scene'));
const seed = parseInt(params.get('seed') ?? '1337', 10) || 1337;
const worldSize = clampInt(params.get('size'), 512, 32, 4096);
const worldHeight = clampInt(params.get('height'), 64, 32, 256);

const container = document.getElementById('app');
if (container === null) throw new Error('manca il contenitore #app');

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.setClearColor(0x0d1014, 1);
container.appendChild(renderer.domElement);

const scene = new Scene();
const world = new VoxelWorld();
const paletteHandle = createVoxelMaterial(paletteHex, VOXEL_SIZE);
const chunkRenderer = new ChunkRenderer(world, paletteHandle.material, VOXEL_SIZE);
scene.add(chunkRenderer.group);

const camera = new IsoCameraController(world, window.innerWidth, window.innerHeight, {
  voxelSize: VOXEL_SIZE,
  targetHeight: 6,
});
camera.attach(renderer.domElement);

let generator: SceneGenerator = createScene(world, {
  kind: sceneKind,
  seed,
  originX: 0,
  originY: 0,
  sizeX: worldSize,
  sizeY: worldSize,
  sizeZ: worldHeight,
});

// Prima passata subito, cosi' il primo frame ha gia' qualcosa da disegnare.
generator.step(8);

// L'inquadratura si basa sulla dimensione richiesta, non sull'AABB corrente: a
// questo punto la scena e' generata solo in parte. Meta' lato perche' inquadrare
// tutta la citta' metterebbe nel frustum tutti i suoi chunk.
camera.frameRegion(worldSize / 2, worldSize / 2, worldSize / 2, worldSize / 2, worldHeight);

const overlay = debugEnabled ? new DebugOverlay(container) : null;
if (debugEnabled) {
  window.addEventListener('keydown', onDebugKey);

  // Hook per misure da console o da strumenti headless: stessa fonte dell'overlay.
  const debugGlobals = globalThis as Record<string, unknown>;
  debugGlobals['__voxelStats'] = (): Record<string, unknown> => {
    const timing = frameTiming();
    const stats = chunkRenderer.stats;
    const mesher = chunkRenderer.mesherPool.stats;
    return {
      fps: timing.fps,
      fpsLow: timing.fpsLow,
      mainMsMax,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometryBytes: stats.geometryBytes,
      chunksAllocated: stats.chunksAllocated,
      chunksWithMesh: stats.chunksWithMesh,
      chunksVisible: stats.chunksVisible,
      queued: stats.queued,
      inFlight: stats.inFlight,
      solidVoxels: world.solidVoxelCount,
      mesherAvgMs: mesher.avgMs,
      mesherMaxMs: mesher.maxMs,
      generationDone: generator.done,
    };
  };
  debugGlobals['__voxelReset'] = (): void => {
    mainMsMax = 0;
    frameSamples = 0;
    frameCursor = 0;
    chunkRenderer.mesherPool.resetStats();
  };
  debugGlobals['__voxelExpand'] = (): void => expandWorld();
  debugGlobals['__voxelRebuildAll'] = (): void => world.markAllDirty();
}

const frameDurations = new Float64Array(120);
let frameCursor = 0;
let frameSamples = 0;
let mainMsMax = 0;
let previousTime = performance.now();

renderer.setAnimationLoop(onFrame);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setViewport(window.innerWidth, window.innerHeight);
});

onPaletteChanged((hexColors) => {
  paletteHandle.setPalette(hexColors);
  console.info('[palette] colori aggiornati a caldo, nessun rebuild di mesh');
});

function onFrame(time: number): void {
  const dt = Math.min(0.1, (time - previousTime) / 1000);
  previousTime = time;

  const workStart = performance.now();

  camera.update(dt);

  if (!generator.done) {
    generator.step(GENERATION_BUDGET_MS);
  }

  const elapsed = performance.now() - workStart;
  chunkRenderer.update(camera.camera, Math.max(0.5, FRAME_BUDGET_MS - elapsed));
  chunkRenderer.cull(camera.camera);

  const mainMs = performance.now() - workStart;
  if (mainMs > mainMsMax) mainMsMax = mainMs;

  const renderStart = performance.now();
  renderer.render(scene, camera.camera);
  const renderMs = performance.now() - renderStart;

  const frameMs = performance.now() - workStart;
  frameDurations[frameCursor] = frameMs;
  frameCursor = (frameCursor + 1) % frameDurations.length;
  if (frameSamples < frameDurations.length) frameSamples++;

  if (overlay !== null && overlay.needsPaint(time)) {
    overlay.update(buildOverlayFrame(mainMs, renderMs, frameMs), time);
  }
}

function buildOverlayFrame(mainMs: number, renderMs: number, frameMs: number): OverlayFrame {
  const stats = chunkRenderer.stats;
  const mesher = chunkRenderer.mesherPool.stats;
  const timing = frameTiming();

  return {
    fps: timing.fps,
    fpsLow: timing.fpsLow,
    frameMs,
    mainMs,
    mainMsMax,
    renderMs,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometryBytes: stats.geometryBytes,
    chunksAllocated: stats.chunksAllocated,
    chunksNonEmpty: stats.chunksNonEmpty,
    chunksWithMesh: stats.chunksWithMesh,
    chunksVisible: stats.chunksVisible,
    queued: stats.queued,
    inFlight: stats.inFlight,
    quads: stats.quads,
    solidVoxels: world.solidVoxelCount,
    mesherLastMs: mesher.lastMs,
    mesherAvgMs: mesher.avgMs,
    mesherMaxMs: mesher.maxMs,
    mesherPoolSize: mesher.poolSize,
    generationProgress: generator.done ? 1 : generator.progress,
    scene: sceneKind,
    seed,
    zoom: camera.zoom,
    yawDegrees: camera.yawDegrees,
  };
}

/** fps medio e 1% low sulla finestra di campioni. */
function frameTiming(): { fps: number; fpsLow: number } {
  if (frameSamples === 0) return { fps: 0, fpsLow: 0 };

  const samples = Array.from(frameDurations.subarray(0, frameSamples));
  let sum = 0;
  for (const value of samples) sum += value;
  samples.sort((a, b) => a - b);
  const worst = samples[Math.max(0, Math.floor(samples.length * 0.99) - 1)];

  return {
    fps: 1000 / (sum / samples.length),
    fpsLow: worst > 0 ? 1000 / worst : 0,
  };
}

function onDebugKey(event: KeyboardEvent): void {
  if (event.code === 'KeyG') {
    expandWorld();
    return;
  }
  if (event.code === 'KeyR') {
    // Stress di rebuild: tutti i chunk tornano sporchi e ripassano dai worker.
    world.markAllDirty();
    return;
  }
  if (event.code === 'KeyC') {
    // Azzera i picchi: serve per misurare il regime, non lo startup.
    mainMsMax = 0;
    frameSamples = 0;
    frameCursor = 0;
    chunkRenderer.mesherPool.resetStats();
  }
}

/**
 * Aggiunge esattamente 64 chunk oltre il bordo nord del mondo e ne genera il
 * contenuto. I chunk esistenti non vengono toccati: la mappa sparsa cresce e le
 * loro geometrie restano quelle di prima.
 */
function expandWorld(): void {
  const b = world.bounds;
  if (b.empty) return;

  const columns = b.maxCx - b.minCx + 1;
  const layers = b.maxCz - b.minCz + 1;
  const rows = Math.max(1, Math.ceil(64 / (columns * layers)));

  const cyStart = b.maxCy + 1;
  let added = 0;
  for (let row = 0; row < rows; row++) {
    for (let cz = b.minCz; cz <= b.maxCz; cz++) {
      for (let cx = b.minCx; cx <= b.maxCx; cx++) {
        world.ensureChunk(cx, cyStart + row, cz);
        added++;
      }
    }
  }

  // La griglia urbana della striscia riparte dal proprio angolo: la cucitura con
  // la citta' esistente non e' allineata, ma qui interessa la crescita a runtime.
  generator = createScene(world, {
    kind: sceneKind,
    seed: seed + cyStart,
    originX: b.minCx * CHUNK,
    originY: cyStart * CHUNK,
    sizeX: columns * CHUNK,
    sizeY: rows * CHUNK,
    sizeZ: layers * CHUNK,
  });

  console.info(`[harness] aggiunti ${added} chunk, ora ${world.chunkCount} allocati`);
}

function parseSceneKind(value: string | null): SceneKind {
  if (value === 'noise' || value === 'slab' || value === 'city') return value;
  return 'city';
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
