import {
  ACESFilmicToneMapping,
  Color,
  NoToneMapping,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { ChunkRenderer } from './engine/ChunkRenderer';
import { IsoCameraController } from './engine/IsoCameraController';
import { onPaletteChanged } from './engine/palette';
import { DEFAULT_THEME_ID, resolveTheme, THEMES, type Theme } from './engine/themes';
import { createVoxelMaterial } from './engine/VoxelMaterial';
import { GrowthScene } from './game/growthScene';
import { FixedStepLoop } from './game/loop';
import { CLASS_COUNT, CLASS_NAMES, type BuildingClass } from './sim/classes';
import { writeDesirabilityData } from './sim/debugData';
import { nextBuildSites, type BuildSite } from './sim/nextBuildSites';
import { isPolicyId, type PolicyId } from './sim/policies';
import { createScenarioState } from './sim/scenario';
import { setPolicyActive, setSelectedClass, type SimState } from './sim/SimState';
import { tick } from './sim/tick';
import { DebugOverlay, type OverlayFrame } from './ui/DebugOverlay';
import { GrowthOverlay } from './ui/GrowthOverlay';
import { SimOverlay, type SimOverlayFrame } from './ui/SimOverlay';
import { TerrainOverlay, type TerrainOverlayFrame } from './ui/TerrainOverlay';
import { CHUNK } from './world/chunkCoords';
import { createScene, type SceneGenerator, type SceneKind } from './world/scenes/cityScene';
import { BiomeView } from './world/terrain/BiomeView';
import { expandIsland } from './world/terrain/IslandGenerator';
import { TerrainStreamer } from './world/terrain/TerrainStreamer';
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

/** Lato dell'isola della scena di debug del terreno, in voxel. */
const TERRAIN_SIZE = 256;

const params = new URLSearchParams(window.location.search);
const debugEnabled = params.get('debug') === '1';
const sceneKind = parseSceneKind(params.get('scene'));
const seed = parseInt(params.get('seed') ?? '1337', 10) || 1337;
const worldSize = clampInt(params.get('size'), 512, 32, 4096);
const worldHeight = clampInt(params.get('height'), 64, 32, 256);

/** `?terrain=<seed>` sostituisce la scena urbana con l'isola procedurale. */
const terrainParam = params.get('terrain');
const terrainSeed = terrainParam === null ? seed : parseInt(terrainParam, 10) || seed;

/**
 * `?debug=1&sim=1` accende la scena di simulazione, che ha bisogno di un'isola:
 * il terreno si attiva da solo anche senza `?terrain=`.
 */
const simEnabled = debugEnabled && params.get('sim') === '1';
/** Crescita automatica separata dalla scena di sola simulazione. */
const growEnabled = params.get('grow') === '1';

/** Tick al secondo del passo automatico della scena di simulazione. */
const SIM_TICK_RATE = 10;

/** Candidati mostrati dall'overlay. */
const SIM_SITE_COUNT = 10;

const container = document.getElementById('app');
if (container === null) throw new Error('manca il contenitore #app');

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new Scene();
const world = new VoxelWorld();

/** `?theme=<id>` sceglie il look; la crescita usa il look urbano del riferimento. */
let theme: Theme = resolveTheme(params.get('theme') ?? (growEnabled ? 'pastel' : null));

const paletteHandle = createVoxelMaterial(theme.colors, VOXEL_SIZE);
const chunkRenderer = new ChunkRenderer(world, paletteHandle.material, VOXEL_SIZE);
scene.add(chunkRenderer.group);

applyTheme(theme);

const camera = new IsoCameraController(world, window.innerWidth, window.innerHeight, {
  voxelSize: VOXEL_SIZE,
  targetHeight: 6,
});
camera.attach(renderer.domElement);

// La scena di terreno arriva da un worker, quindi non e' pronta a costruttore:
// il primo blocco entra al primo `step` che trova qualcosa in coda.
const terrainRegion = { minX: 0, minY: 0, sizeX: TERRAIN_SIZE, sizeY: TERRAIN_SIZE };

const terrain: TerrainStreamer | null =
  terrainParam === null && !simEnabled && !growEnabled
    ? null
    : new TerrainStreamer(world, terrainSeed, terrainRegion);

let generator: SceneGenerator =
  terrain ??
  createScene(world, {
    kind: sceneKind,
    seed,
    originX: 0,
    originY: 0,
    sizeX: worldSize,
    sizeY: worldSize,
    sizeZ: worldHeight,
  });

const biomeView = terrain === null ? null : new BiomeView(world, terrain.map);

// Prima passata subito, cosi' il primo frame ha gia' qualcosa da disegnare.
generator.step(8);

// L'inquadratura si basa sulla dimensione richiesta, non sull'AABB corrente: a
// questo punto la scena e' generata solo in parte. Meta' lato perche' inquadrare
// tutta la citta' metterebbe nel frustum tutti i suoi chunk.
if (terrain === null) {
  camera.frameRegion(worldSize / 2, worldSize / 2, worldSize / 2, worldSize / 2, worldHeight);
} else if (growEnabled) {
  // La crescita deve leggersi come skyline, non come texture sull'intera isola:
  // si inquadra il nucleo centrale lasciando alle torri spazio verticale.
  camera.frameRegion(TERRAIN_SIZE / 2, TERRAIN_SIZE / 2, 112, 112, 96);
} else {
  // L'isola invece si guarda intera: 256 di lato stanno in poche centinaia di chunk.
  camera.frameRegion(TERRAIN_SIZE / 2, TERRAIN_SIZE / 2, TERRAIN_SIZE, TERRAIN_SIZE, 48);
}

const overlay = debugEnabled ? new DebugOverlay(container) : null;
const terrainOverlay =
  debugEnabled && terrain !== null && !simEnabled && !growEnabled
    ? new TerrainOverlay(container, toggleBiomeView)
    : null;
let terrainApplyMs = 0;

/**
 * Stato della scena di simulazione.
 *
 * Nasce null: i catalizzatori si piazzano su colonne edificabili, e l'isola
 * arriva dal worker un blocco alla volta. La simulazione parte quando il terreno
 * e' completo, non prima.
 */
let sim: SimState | null = null;

/** Il passo automatico parte acceso: una scena ferma non mostra un bilancio. */
let simAuto = true;
let simTickMs = 0;
let simSites: readonly BuildSite[] = [];
let simDataCells = 0;
let growthScene: GrowthScene | null = null;

/** Il loop possiede il debito di tick: non esiste un secondo accumulatore nel bootstrap. */
const simLoop = new FixedStepLoop(SIM_TICK_RATE, SIM_TICK_RATE);

const simOverlay = simEnabled
  ? new SimOverlay(container, {
      onTick: () => stepSim(1),
      onToggleAuto: () => {
        simAuto = !simAuto;
      },
      onSelectClass: selectSimClass,
      onTogglePolicy: toggleSimPolicy,
    })
  : null;
const growthOverlay = debugEnabled && growEnabled ? new GrowthOverlay(container) : null;

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
      theme: theme.id,
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
  debugGlobals['__voxelTheme'] = (id?: string): Record<string, unknown> => {
    if (id !== undefined) {
      const found = THEMES.findIndex((candidate) => candidate.id === id);
      if (found < 0) console.warn(`[tema] id sconosciuto: ${id}`);
      else cycleTheme(found);
    }
    return { id: theme.id, name: theme.name, available: THEMES.map((t) => t.id) };
  };

  if (terrain !== null) {
    debugGlobals['__terrainStats'] = (): Record<string, unknown> => ({
      seed: terrainSeed,
      size: TERRAIN_SIZE,
      workerMs: terrain.generationMs,
      applyMs: terrainApplyMs,
      blocksApplied: terrain.blocksApplied,
      blocksTotal: terrain.blocksTotal,
      columns: terrain.map.columnCount,
      buildableColumns: terrain.buildableColumns,
      biomeHistogram: Array.from(terrain.map.biomeHistogram()),
      biomeView: biomeView?.enabled ?? false,
      done: terrain.done,
    });
    debugGlobals['__terrainBiomeView'] = (): void => toggleBiomeView();

    if (simEnabled) {
      // Stessa fonte dell'overlay, per misurare la simulazione da console o da
      // uno strumento headless senza passare dai pulsanti.
      debugGlobals['__simStats'] = (): Record<string, unknown> => {
        if (sim === null) return { ready: false };
        return {
          ready: true,
          tick: sim.tickCount,
          auto: simAuto,
          tickMs: simTickMs,
          population: sim.population,
          food: sim.food,
          materials: sim.materials,
          funds: sim.funds,
          satisfaction: sim.satisfaction,
          buildingCounts: sim.buildingCounts,
          catalysts: sim.catalysts.length,
          policies: sim.policies,
          selectedClass: CLASS_NAMES[sim.selectedClass],
          fieldChunks: sim.field.chunkCount,
          recomputedCells: sim.field.totalRecomputedCells,
          dataCells: simDataCells,
        };
      };
      debugGlobals['__simTick'] = (count = 1): number => {
        stepSim(Math.max(1, Math.floor(count)));
        return sim?.tickCount ?? 0;
      };
      debugGlobals['__simSites'] = (count = SIM_SITE_COUNT): readonly BuildSite[] =>
        sim === null || terrain === null ? [] : nextBuildSites(sim, terrain.map, count);
      debugGlobals['__simClass'] = (cls: number): void => {
        if (cls >= 0 && cls < CLASS_COUNT) selectSimClass(cls as BuildingClass);
      };
      debugGlobals['__simPolicy'] = (id: string): void => {
        if (isPolicyId(id)) toggleSimPolicy(id);
      };
    }

    if (growEnabled) {
      debugGlobals['__growStats'] = (): Record<string, unknown> =>
        growthScene === null ? { ready: false } : { ...growthScene.stats };
    }

    // L'espansione qui e' solo una funzione chiamabile: nessun input di gioco la
    // attiva. Aggiunge la striscia a nord riusando seed e maschera dell'isola,
    // quindi la costa continua invece di ricominciare.
    debugGlobals['__terrainExpand'] = (): Record<string, unknown> => {
      const result = expandIsland(
        world,
        terrainSeed,
        { minX: 0, minY: TERRAIN_SIZE, sizeX: TERRAIN_SIZE, sizeY: CHUNK * 2 },
        { map: terrain.map },
      );
      return { blocks: result.blocks, voxels: result.voxelsWritten, ms: result.generationMs };
    };
  }
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
  // `palette.json` e' la tinta del solo tema di default: se ne e' attivo un
  // altro, l'hot reload non deve scavalcarlo.
  if (theme.id !== DEFAULT_THEME_ID) return;
  paletteHandle.setPalette(hexColors);
  console.info('[palette] colori aggiornati a caldo, nessun rebuild di mesh');
});

/**
 * Applica un tema: colori, atmosfera, fondo e tone mapping.
 *
 * Non tocca una sola geometria — i vertici portano l'indice di palette, non il
 * colore. Il conteggio di quad e i byte di geometria nell'overlay devono
 * restare fermi mentre si cambia tema: e' la verifica che l'invariante regge.
 */
function applyTheme(next: Theme): void {
  theme = next;

  paletteHandle.setPalette(next.colors);
  paletteHandle.setAtmosphere(next.atmosphere);

  const background = new Color().setStyle(next.atmosphere.background, SRGBColorSpace);
  renderer.setClearColor(background, 1);
  scene.background = background;

  const toneMapping =
    next.atmosphere.toneMapping === 'aces' ? ACESFilmicToneMapping : NoToneMapping;
  if (renderer.toneMapping !== toneMapping) {
    renderer.toneMapping = toneMapping;
    // Il tone mapping e' un define, non un uniform: cambiarlo ricompila il
    // programma. E' l'unica cosa che un cambio di tema ricostruisce, e non
    // tocca comunque una sola geometria.
    paletteHandle.material.needsUpdate = true;
  }
  renderer.toneMappingExposure = next.atmosphere.exposure;

  // Il fondo della pagina era duplicato a mano nel CSS: qui c'e' una sola fonte,
  // cosi' il primo frame non lampeggia con il colore di un altro tema.
  document.body.style.background = next.atmosphere.background;
}

function cycleTheme(index: number): void {
  const next = THEMES[index];
  if (next === undefined || next.id === theme.id) return;
  applyTheme(next);
  console.info(`[tema] ${next.name} (${next.id}), nessun rebuild di mesh`);
}

function onFrame(time: number): void {
  const dt = Math.min(0.1, (time - previousTime) / 1000);
  previousTime = time;

  const workStart = performance.now();

  camera.update(dt);

  if (!generator.done) {
    const generationStart = performance.now();
    generator.step(GENERATION_BUDGET_MS);
    terrainApplyMs += performance.now() - generationStart;
  } else if (biomeView !== null && biomeView.busy) {
    // Il ricolore per bioma usa lo stesso budget della generazione, e solo
    // quando la generazione ha finito: non competono mai per lo stesso frame.
    biomeView.step(GENERATION_BUDGET_MS);
  }

  updateSim(dt);
  updateGrowth(dt);

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
  if (terrainOverlay !== null && terrain !== null && terrainOverlay.needsPaint(time)) {
    terrainOverlay.update(buildTerrainFrame(terrain), time);
  }
  if (simOverlay !== null && sim !== null && simOverlay.needsPaint(time)) {
    simOverlay.update(buildSimFrame(sim), time);
  }
  if (growthOverlay !== null && growthOverlay.needsPaint(time)) {
    growthOverlay.update(growthScene?.stats ?? null, time);
  }
}

// --- Scena di simulazione ---------------------------------------------------

/**
 * Fa avanzare la simulazione.
 *
 * Il passo automatico e' a cadenza fissa (`SIM_TICK_RATE` tick al secondo) e non
 * legata al frame rate: la simulazione e' deterministica, e legarla al `dt`
 * significherebbe farne dipendere l'esito dalla macchina che la guarda. Se il
 * frame e' stato lungo si recuperano piu' tick, non un tick piu' grande.
 */
function updateSim(dt: number): void {
  if (!simEnabled || terrain === null) return;

  if (sim === null) {
    // L'isola arriva a blocchi: i catalizzatori aspettano che sia completa.
    if (!generator.done) return;
    sim = createScenarioState(terrain.map, terrainRegion);
    refreshSimDerived();
    console.info(`[sim] ${sim.catalysts.length} catalizzatori piazzati da script`);
    return;
  }

  if (!simAuto) return;

  simLoop.advance(dt, () => stepSim(1));
}

function stepSim(count: number): void {
  if (sim === null || terrain === null) return;

  const start = performance.now();
  let next = sim;
  for (let i = 0; i < count; i++) {
    next = tick(next, terrain.map);
  }
  simTickMs = (performance.now() - start) / count;
  sim = next;
}

function selectSimClass(cls: BuildingClass): void {
  if (sim === null) return;
  sim = setSelectedClass(sim, cls);
  refreshSimDerived();
}

function toggleSimPolicy(id: PolicyId): void {
  if (sim === null) return;
  sim = setPolicyActive(sim, id, !sim.policies.includes(id));
  refreshSimDerived();
}

/**
 * Ricalcola cio' che dipende dal campo: la lista dei candidati e la copia in
 * `VoxelWorld.data`.
 *
 * Non sta nel ciclo di frame perche' non ha motivo di starci. Il campo cambia
 * solo per un'azione del giocatore — una policy, un catalizzatore, un edificio —
 * mai per un tick, quindi rifare questi due passi a ogni frame sarebbe lavoro
 * garantito inutile.
 */
function refreshSimDerived(): void {
  if (sim === null || terrain === null) return;
  simSites = nextBuildSites(sim, terrain.map, SIM_SITE_COUNT);
  simDataCells = writeDesirabilityData(world, sim, terrain.map);
}

function buildSimFrame(state: SimState): SimOverlayFrame {
  return {
    state,
    sites: simSites,
    region: terrainRegion,
    auto: simAuto,
    tickRate: SIM_TICK_RATE,
    tickMs: simTickMs,
    dataCells: simDataCells,
    builder: null,
  };
}

/** Avanza esclusivamente la scena `grow=1`, dopo che l'isola e' completa. */
function updateGrowth(dt: number): void {
  if (!growEnabled || terrain === null) return;
  if (growthScene === null) {
    if (!generator.done) return;
    growthScene = new GrowthScene(world, terrain.map, terrainRegion, terrainSeed);
    console.info('[crescita] scena automatica pronta');
    return;
  }
  growthScene.advance(dt);
}

function buildTerrainFrame(streamer: TerrainStreamer): TerrainOverlayFrame {
  return {
    fps: frameTiming().fps,
    generationMs: streamer.generationMs,
    applyMs: terrainApplyMs,
    blocksApplied: streamer.blocksApplied,
    blocksTotal: streamer.blocksTotal,
    columns: streamer.map.columnCount,
    buildableColumns: streamer.buildableColumns,
    histogram: Array.from(streamer.map.biomeHistogram()),
    biomeView: biomeView?.enabled ?? false,
    seed: terrainSeed,
    regionSize: TERRAIN_SIZE,
  };
}

function toggleBiomeView(): void {
  if (biomeView === null) return;
  biomeView.toggle();
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
    scene: terrain === null ? sceneKind : 'terrain',
    seed: terrain === null ? seed : terrainSeed,
    theme: theme.name,
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
  if (simEnabled) {
    if (event.code === 'KeyT') {
      stepSim(1);
      return;
    }
    if (event.code === 'KeyP') {
      simAuto = !simAuto;
      return;
    }
    if (event.code === 'KeyM' && sim !== null) {
      selectSimClass(((sim.selectedClass + 1) % CLASS_COUNT) as BuildingClass);
      return;
    }
  }
  // Tasti 1..9: selezione diretta del tema. Le cifre erano libere e scalano con
  // la tabella, a differenza di un tasto che cicla.
  if (event.code.startsWith('Digit')) {
    const index = parseInt(event.code.slice(5), 10) - 1;
    if (index >= 0) {
      cycleTheme(index);
      return;
    }
  }
  if (event.code === 'KeyB') {
    toggleBiomeView();
    return;
  }
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
  // La scena di terreno ha la sua espansione, che passa da `expandIsland` e non
  // dalla griglia urbana: qui `G` non deve fare nulla.
  if (terrain !== null) return;

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
