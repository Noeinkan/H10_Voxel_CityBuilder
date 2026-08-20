import {
  ACESFilmicToneMapping,
  Color,
  NoToneMapping,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ChunkRenderer } from './engine/ChunkRenderer';
import { InfluenceOverlay } from './engine/InfluenceOverlay';
import { PlacementCursor } from './engine/PlacementCursor';
import { FrameTiming } from './engine/FrameTiming';
import { IsoCameraController } from './engine/IsoCameraController';
import { faceLuminance, sunDirection } from './engine/lighting';
import { onPaletteChanged } from './engine/palette';
import {
  RenderQualityController,
  parseQualityMode,
  type QualityProfile,
} from './engine/RenderQuality';
import { createSkyBackground } from './engine/SkyBackground';
import { createPostProcessing } from './engine/PostProcessing';
import { createSunShadow } from './engine/SunShadow';
import { resolveTheme, THEMES, type Theme } from './engine/themes';
import { createVoxelMaterial } from './engine/VoxelMaterial';
import { GrowthScene } from './game/growthScene';
import { resolveLaunchMode } from './game/launchMode';
import { pickSurfaceCell, type SurfaceCell } from './game/surfacePick';
import { FixedStepLoop } from './game/loop';
import { coastalSectorAt, shapeWithSector, type CoastalSector } from './game/sectors';
import type { ActionFailure, SiteCost } from './game/actions';
import { BALANCE } from './sim/balance';
import { catalystById, defaultCatalystOfClass } from './sim/catalysts';
import { CLASS_COUNT, CLASS_LABELS, CLASS_NAMES, type BuildingClass } from './sim/classes';
import { typologiesForUses } from './world/buildings/typology';
import { writeDesirabilityData } from './sim/debugData';
import { nextBuildSites, type BuildSite } from './sim/nextBuildSites';
import { isPolicyId, type PolicyId } from './sim/policies';
import { createScenarioState } from './sim/scenario';
import { setPolicyActive, setSelectedClass, type SimState } from './sim/SimState';
import { tick } from './sim/tick';
import './ui/hud.css';
import { DebugOverlay, type OverlayFrame } from './ui/DebugOverlay';
import { GameHud, type GameTool } from './ui/GameHud';
import { GrowthOverlay } from './ui/GrowthOverlay';
import { SimOverlay, type SimOverlayFrame } from './ui/SimOverlay';
import { TerrainOverlay, type TerrainOverlayFrame } from './ui/TerrainOverlay';
import { CHUNK } from './world/chunkCoords';
import { GROUND, type GroundKind } from './world/grading/grade';
import { createScene, type SceneGenerator, type SceneKind } from './world/scenes/cityScene';
import { BiomeView } from './world/terrain/BiomeView';
import { expandIsland } from './world/terrain/IslandGenerator';
import { TerrainStreamer } from './world/terrain/TerrainStreamer';
import type { IslandShape } from './world/terrain/region';
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

/** Lato della shadow map. Il gating di qualita' puo' abbassarlo a runtime. */
const SHADOW_SIZE = 2048;

/** Quota del budget riservata alla generazione della scena. */
const GENERATION_BUDGET_MS = 1.5;

const VOXEL_SIZE = 1;

/**
 * Lato dell'isola della scena di debug del terreno, in voxel.
 *
 * Raddoppiato insieme alla scala del contenuto. Un edificio ora e' largo il
 * doppio, quindi a parita' di lato ce ne stavano un quarto e l'isola si leggeva
 * come uno scoglio: 512 riporta la citta' alla capacita' che aveva, con il
 * dettaglio nuovo. Il terreno costa quattro volte in colonne, ma le celle piatte
 * si fondono nel greedy mesher molto meglio delle colonne a quota libera di
 * prima — la spesa vera va misurata, non dedotta.
 */
const TERRAIN_SIZE = 512;

const params = new URLSearchParams(window.location.search);
const { debugEnabled, growEnabled, simEnabled } = resolveLaunchMode(params);
let debugVisible = debugEnabled;
const sceneKind = parseSceneKind(params.get('scene'));
const seed = parseInt(params.get('seed') ?? '1337', 10) || 1337;
const worldSize = clampInt(params.get('size'), 512, 32, 4096);
const worldHeight = clampInt(params.get('height'), 64, 32, 256);
const qualityMode = parseQualityMode(params.get('quality'));

/**
 * Le ombre si possono togliere da URL con `shadows=0`; in Fase 5 anche il gating
 * automatico di qualita' scrivera' qui.
 */
const shadowsAllowedByUrl = params.get('shadows') !== '0';

/** `?terrain=<seed>` sostituisce la scena urbana con l'isola procedurale. */
const terrainParam = params.get('terrain');
const terrainSeed = terrainParam === null ? seed : parseInt(terrainParam, 10) || seed;

/** Tick al secondo del passo automatico della scena di simulazione. */
const SIM_TICK_RATE = 10;

/** Candidati mostrati dall'overlay. */
const SIM_SITE_COUNT = 10;

const container = document.getElementById('app');
if (container === null) throw new Error('missing #app container');

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const renderQuality = new RenderQualityController(qualityMode, window.devicePixelRatio);
renderer.setPixelRatio(renderQuality.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new Scene();
const world = new VoxelWorld();

/** `?theme=<id>` sceglie il look; in assenza vale il diorama caldo. */
let theme: Theme = resolveTheme(params.get('theme'));

const paletteHandle = createVoxelMaterial(theme.colors, VOXEL_SIZE);
const chunkRenderer = new ChunkRenderer(world, paletteHandle.material, VOXEL_SIZE);
scene.add(chunkRenderer.group);
const skyBackground = createSkyBackground(theme.atmosphere);
scene.add(skyBackground.mesh);
const sunShadow = createSunShadow(VOXEL_SIZE, SHADOW_SIZE);

/** Direzione del sole nel mondo, e la stessa portata in spazio vista. */
const sunWorld = new Vector3();
const sunView = new Vector3();


// uResolution lavora su gl_FragCoord, che e' in pixel del drawing buffer:
// va letta da li' e non da innerWidth, altrimenti con pixelRatio != 1 il
// gradiente di nebbia si stacca da quello del cielo.
const drawingBuffer = new Vector2();
function syncResolution(): void {
  renderer.getDrawingBufferSize(drawingBuffer);
  paletteHandle.setResolution(drawingBuffer.x, drawingBuffer.y);
}
syncResolution();

/** Direzione di sguardo, riusata ogni frame per lo scattering della nebbia. */
const viewDirection = new Vector3();

const camera = new IsoCameraController(world, window.innerWidth, window.innerHeight, {
  voxelSize: VOXEL_SIZE,
  targetHeight: 12,
});
camera.attach(renderer.domElement);

// Il composer ha bisogno di scena e camera, quindi nasce qui; e `applyTheme`
// ne imposta bloom e tilt, percio' la prima applicazione del tema viene dopo.
const post = createPostProcessing(renderer, scene, camera.camera);
// Con il composer ogni pass interna azzererebbe 'renderer.info', e l'overlay
// finirebbe per misurare solo l'ultimo quad fullscreen. Azzerandolo a mano una
// volta per frame il conteggio torna a essere il totale vero: scena, ombra e post.
renderer.info.autoReset = false;
post.setSize(window.innerWidth, window.innerHeight, renderQuality.pixelRatio);

/**
 * Profilo di effetti in vigore. Lo decide `RenderQuality`, che lo fa scendere
 * insieme al pixel ratio quando il frame non tiene: spegnere bloom e ombre
 * restituisce piu' millisecondi che togliere un quarto di risoluzione, e si
 * nota molto meno.
 */
let qualityProfile = renderQuality.profile;

function applyQualityProfile(profile: QualityProfile): void {
  qualityProfile = profile;
  if (profile.shadowSize > 0) sunShadow.setSize(profile.shadowSize);
  post.setQuality({
    bloom: profile.bloom,
    tilt: profile.tilt,
    bloomScale: profile.bloomScale,
  });
}

applyQualityProfile(renderQuality.profile);

applyTheme(theme);

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
let islandShape: IslandShape | null = terrain?.shape ?? null;
let expansionInFlight: CoastalSector | null = null;

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
  camera.frameRegion(TERRAIN_SIZE / 2, TERRAIN_SIZE / 2, 420, 420, 240);
} else {
  // L'isola invece si guarda intera: 512 di lato stanno in poche centinaia di chunk.
  camera.frameRegion(TERRAIN_SIZE / 2, TERRAIN_SIZE / 2, TERRAIN_SIZE, TERRAIN_SIZE, 160);
}

const overlay = new DebugOverlay(container);
const terrainOverlay =
  terrain !== null && !simEnabled && !growEnabled
    ? new TerrainOverlay(container, toggleBiomeView)
    : null;
overlay.setVisible(debugVisible);
terrainOverlay?.setVisible(debugVisible);
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
const growthOverlay = growEnabled ? new GrowthOverlay(container) : null;
simOverlay?.setVisible(debugVisible);
growthOverlay?.setVisible(debugVisible);
let selectedTool: GameTool = { kind: 'none' };
let gameHud: GameHud | null = null;
if (growEnabled) {
  gameHud = new GameHud(container, {
    onTool: (tool) => {
      selectedTool = tool;
      preview.hide();
      influenceOverlay?.hideCursor();
    },
      onPolicy: (id) => {
        const result = growthScene?.togglePolicy(id);
        if (result !== undefined && !result.success) gameHud?.showFailure(result.reason);
      },
      onTrade: (mode) => {
        const result = growthScene?.setTradeMode(mode);
        if (result !== undefined && !result.success) gameHud?.showFailure(result.reason);
      },
      onDecision: (optionId) => {
        const result = growthScene?.chooseDecision(optionId);
        if (result !== undefined && !result.success) gameHud?.showFailure(result.reason);
      },
    onPause: (paused) => growthScene?.setPaused(paused),
    onSpeed: (speed) => growthScene?.setSpeed(speed),
    onTheme: (id) => {
      const index = THEMES.findIndex((candidate) => candidate.id === id);
      if (index >= 0) cycleTheme(index);
    },
    onCancelTool: () => {
      selectedTool = { kind: 'none' };
      preview.hide();
      influenceOverlay?.hideCursor();
      gameHud?.updateCursor(0, 0, null);
    },
  }, THEMES.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    swatches: [
      candidate.atmosphere.background,
      candidate.colors[5] ?? candidate.atmosphere.fog.color,
      candidate.colors[12] ?? candidate.atmosphere.fog.color,
    ],
  })), theme.id);
}

const picker = new Raycaster();
const pointer = new Vector2();
const preview = new PlacementCursor();
scene.add(preview.group);

const influenceOverlay = terrain !== null && growEnabled ? new InfluenceOverlay(terrain.map) : null;
if (influenceOverlay !== null) scene.add(influenceOverlay.group);

if (growEnabled) {
  renderer.domElement.addEventListener('pointermove', onGamePointerMove, { capture: true });
  renderer.domElement.addEventListener('pointerdown', onGamePointerDown, { capture: true });
  renderer.domElement.addEventListener('pointerleave', () => {
    preview.hide();
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(0, 0, null);
  });
}

window.addEventListener('keydown', onUiKey);

if (debugEnabled) {
  // Hook per misure da console o da strumenti headless: stessa fonte dell'overlay.
  const debugGlobals = globalThis as Record<string, unknown>;
  debugGlobals['__voxelStats'] = (): Record<string, unknown> => {
    const timing = frameTiming.snapshot();
    const stats = chunkRenderer.stats;
    const mesher = chunkRenderer.mesherPool.stats;
    return {
      fps: timing.fps,
      fpsLow: timing.fpsLow,
      frameP95Ms: timing.p95Ms,
      frameP99Ms: timing.p99Ms,
      jankRatio: timing.jankRatio,
      mainMsMax,
      ...effectStats(),
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
      quality: renderQuality.mode,
      pixelRatio: renderer.getPixelRatio(),
    };
  };
  debugGlobals['__voxelReset'] = (): void => {
    mainMsMax = 0;
    frameTiming.reset();
    chunkRenderer.mesherPool.resetStats();
  };
  debugGlobals['__voxelExpand'] = (): void => expandWorld();
  debugGlobals['__voxelRebuildAll'] = (): void => world.markAllDirty();
  debugGlobals['__voxelTheme'] = (id?: string): Record<string, unknown> => {
    if (id !== undefined) {
      const found = THEMES.findIndex((candidate) => candidate.id === id);
      if (found < 0) console.warn(`[theme] unknown id: ${id}`);
      else cycleTheme(found);
    }
    return { id: theme.id, name: theme.name, available: THEMES.map((t) => t.id) };
  };
  // Sposta il sole senza ricaricare: serve ad autorare i temi guardando il
  // risultato invece che immaginandolo. Non persiste, il tema resta la fonte.
  debugGlobals['__voxelSun'] = (azimuth?: number, elevation?: number): Record<string, unknown> => {
    const sun = theme.atmosphere.sun;
    const next = {
      ...sun,
      azimuth: azimuth ?? sun.azimuth,
      elevation: elevation ?? sun.elevation,
    };
    paletteHandle.setAtmosphere({ ...theme.atmosphere, sun: next });
    return {
      azimuth: next.azimuth,
      elevation: next.elevation,
      faceLuminance: faceLuminance({ ...theme.atmosphere, sun: next }),
      // Dove il cielo disegna il sole: xy in NDC, `facing` false se sta dietro
      // la camera e quindi resta solo l'alone.
      screen: { x: sunView.x * 1.35, y: sunView.y * 1.35, facing: sunView.z < 0 },
    };
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
          mixedCounts: sim.mixedCounts,
          commerce: sim.commerce,
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

const frameTiming = new FrameTiming(600);
let mainMsMax = 0;
/** Vero finche' la scena si sta ancora popolando: vedi `observeQuality`. */
let generating = true;
let previousTime = performance.now();

renderer.setAnimationLoop(onFrame);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setViewport(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight, renderQuality.pixelRatio);
  syncResolution();
  skyBackground.setAspect(window.innerWidth / Math.max(1, window.innerHeight));
});

onPaletteChanged((hexColors) => {
  // `palette.json` appartiene al tema natural: gli altri hanno una palette propria.
  if (theme.id !== 'natural') return;
  paletteHandle.setPalette(hexColors);
  console.info('[palette] colors updated live, no mesh rebuild');
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
  post.setAtmosphere(next.atmosphere);
  skyBackground.setAtmosphere(next.atmosphere);
  skyBackground.setAspect(window.innerWidth / Math.max(1, window.innerHeight));
  sunWorld.fromArray(sunDirection(next.atmosphere.sun.azimuth, next.atmosphere.sun.elevation));

  const background = new Color().setStyle(next.atmosphere.background, SRGBColorSpace);
  renderer.setClearColor(background, 1);

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
  gameHud?.setTheme(next.id);
  console.info(`[theme] ${next.name} (${next.id}), no mesh rebuild`);
}

/**
 * Pass d'ombra: profondita' dei chunk vista dal sole.
 *
 * Sta dentro `renderStart` e non nel lavoro non-render, perche' e' spesa sulla
 * GPU e non sul main thread: il budget di 3 ms non la riguarda, la si legge in
 * `renderMs`. Un tema senza `shadow` la salta del tutto.
 */
function drawShadowPass(): void {
  const settings = theme.atmosphere.shadow;
  if (settings === undefined || !shadowsAllowedByUrl || qualityProfile.shadowSize === 0) {
    sunShadow.setEnabled(false);
    paletteHandle.setShadow({
      texture: null,
      matrix: sunShadow.matrix,
      strength: 0,
      texelSize: 1,
      normalBias: 0,
      softness: 0,
    });
    return;
  }

  sunShadow.setEnabled(true);
  const start = performance.now();
  sunShadow.fit(chunkRenderer.visibleBounds, sunWorld);
  sunShadow.begin(renderer);
  const drawn = chunkRenderer.renderShadow(renderer, sunShadow.camera, sunShadow.depthMaterial);
  sunShadow.end(renderer, performance.now() - start, drawn);

  paletteHandle.setShadow({
    texture: sunShadow.texture,
    matrix: sunShadow.matrix,
    strength: settings.strength,
    texelSize: 1 / sunShadow.stats.size,
    // Un texel e mezzo lungo la normale: sotto compare l'acne, sopra l'ombra
    // si stacca dalla base di cio' che la proietta.
    normalBias: sunShadow.worldTexelSize * 1.5,
    // Il profilo puo' portare la morbidezza a 0, e il campionamento degrada
    // a un solo tap invece di nove.
    softness: settings.softness * qualityProfile.shadowSoftness,
  });
}
function onFrame(time: number): void {
  frameTiming.sample(time, document.visibilityState === 'visible');
  const dt = Math.min(0.1, (time - previousTime) / 1000);
  previousTime = time;

  const workStart = performance.now();
  renderer.info.reset();

  camera.update(dt);
  preview.update(dt);

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
  drawShadowPass();
  paletteHandle.setTime(time / 1000);
  camera.camera.getWorldDirection(viewDirection);
  paletteHandle.setViewDirection(viewDirection.x, viewDirection.y, viewDirection.z);
  // Il sole in spazio vista da' la sua posizione a schermo. Con una camera
  // ortografica un punto all'infinito non si proietta, quindi si usa la
  // direzione: la componente xy dice dove sta, la z se e' davanti o dietro.
  sunView.copy(sunWorld).transformDirection(camera.camera.matrixWorldInverse);
  skyBackground.setSunScreen(sunView.x * 1.35, sunView.y * 1.35, sunView.z < 0);
  skyBackground.setTime(time / 1000);
  post.render();
  const renderMs = performance.now() - renderStart;

  const frameMs = performance.now() - workStart;
  observeQuality(time);

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
  if (gameHud !== null && growthScene !== null && gameHud.needsPaint(time)) {
    gameHud.update(growthScene.stats, time);
  }
}

/**
 * Gating di qualita', ma solo a regime.
 *
 * Il popolamento della scena non e' il regime: dura pochi secondi e salta dei
 * frame per costruzione, mentre risalire di un gradino costa dieci secondi
 * stabili. Misurato li', il controller scendeva quasi sempre entro i primi
 * quattro secondi e non risaliva piu' — e il primo gradino che si perde e' anche
 * il piu' visibile, perche' dimezza la shadow map. Quindi si misura solo a
 * generazione ferma, ripartendo da una finestra pulita.
 *
 * Per la stessa ragione la finestra riparte a ogni cambio applicato: la
 * decisione successiva deve misurare il profilo appena messo in opera, non
 * quello di prima. Senza, un cambio ne innescava un altro sugli stessi campioni.
 */
function observeQuality(time: number): void {
  if (!generator.done) {
    generating = true;
    return;
  }
  if (generating) {
    generating = false;
    frameTiming.reset();
    return;
  }

  const quality = renderQuality.observe(frameTiming.snapshot(), time);
  if (!quality.changed || quality.reason === 'initial') return;

  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight, quality.pixelRatio);
  applyQualityProfile(quality.profile);
  syncResolution();
  frameTiming.reset();
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
    console.info(`[sim] ${sim.catalysts.length} catalysts placed by script`);
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
    influenceOverlay?.refreshCatalysts(growthScene.simState.catalysts);
    console.info('[growth] automatic scene ready');
    return;
  }
  // La TerrainMap arriva prima dei voxel: durante un'espansione la crescita
  // riparte solo quando il settore e' stato applicato per intero.
  if (!generator.done) return;
  if (expansionInFlight !== null) {
    growthScene.markSectorReady();
    expansionInFlight = null;
  }
  growthScene.advance(dt);
}

function onGamePointerMove(event: PointerEvent): void {
  if (selectedTool.kind === 'none' || growthScene === null || terrain === null) {
    preview.hide();
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(0, 0, null);
    return;
  }
  const cell = surfaceCellAt(event);
  if (cell === null) {
    preview.hide();
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(event.clientX, event.clientY, {
      title: 'No surface',
      details: 'Move the cursor over the island.',
      valid: false,
      reason: 'No selectable column.',
    });
    return;
  }
  let valid = false;
  if (selectedTool.kind === 'catalyst') {
    const catalyst = catalystById(selectedTool.id ?? defaultCatalystOfClass(selectedTool.class));
    const failure = growthScene.catalystFailure(cell.x, cell.y, catalyst.id);
    const radius = catalyst.radius;
    const site = growthScene.catalystSiteCost(cell.x, cell.y, catalyst.id);
    const cost = site === null ? catalyst.cost : site.cost;
    valid = failure === null;
    influenceOverlay?.showCursor(cell.x, cell.y, radius, valid);
    gameHud?.updateCursor(event.clientX, event.clientY, {
      title: catalyst.label,
      details: `${cost} funds${groundNote(site)} · radius ${radius} · mainly ${classLabel(catalyst.class)}`,
      favours: catalyst.favours.map(classLabel),
      penalises: catalyst.penalises.map(classLabel),
      typologies: typologiesForUses(catalyst.favours),
      valid,
      reason: failure === null ? 'Valid position.' : actionFailureLabel(failure),
    });
  } else {
    const sector = coastalSectorAt(cell.x, cell.y, terrainRegion, BALANCE.gameplay.expansion.size);
    const failure = generator.done
      ? growthScene.expansionFailure(sector.id)
      : 'terrain-loading';
    valid = failure === null;
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(event.clientX, event.clientY, {
      title: `Sector ${sector.id}`,
      details: `${BALANCE.gameplay.expansion.cost} funds · ${sector.region.sizeX}×${sector.region.sizeY} voxels`,
      valid,
      reason: failure === null ? 'New buildable land connected to the coast.' : actionFailureLabel(failure),
    });
  }
  preview.show(cell.x, cell.y, cell.z, valid);
}

function onGamePointerDown(event: PointerEvent): void {
  if (event.button !== 0 || selectedTool.kind === 'none') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (growthScene === null || terrain === null) return;
  const cell = surfaceCellAt(event);
  if (cell === null) {
    gameHud?.showPickingFailure();
    return;
  }

  if (selectedTool.kind === 'catalyst') {
    const result = growthScene.placeCatalyst(
      cell.x,
      cell.y,
      selectedTool.id ?? defaultCatalystOfClass(selectedTool.class),
    );
    if (!result.success) gameHud?.showFailure(result.reason);
    else {
      gameHud?.clearFeedback();
      influenceOverlay?.refreshCatalysts(growthScene.simState.catalysts);
      selectedTool = { kind: 'none' };
      gameHud?.setTool(selectedTool);
      preview.hide();
      influenceOverlay?.hideCursor();
      gameHud?.updateCursor(0, 0, null);
    }
    return;
  }

  if (!generator.done) {
    gameHud?.showFailure('terrain-loading');
    return;
  }
  const sector = coastalSectorAt(cell.x, cell.y, terrainRegion, BALANCE.gameplay.expansion.size);
  const paid = growthScene.buyExpansion(sector.id);
  if (!paid.success) {
    gameHud?.showFailure(paid.reason);
    return;
  }
  beginCoastalExpansion(sector);
}

function surfaceCellAt(event: PointerEvent): SurfaceCell | null {
  if (terrain === null) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  picker.setFromCamera(pointer, camera.camera);
  const origin = picker.ray.origin;
  const direction = picker.ray.direction;
  return pickSurfaceCell(
    { origin: [origin.x, origin.y, origin.z], direction: [direction.x, direction.y, direction.z] },
    terrain.map,
  );
}

function beginCoastalExpansion(sector: CoastalSector): void {
  if (terrain === null || growthScene === null || islandShape === null) return;
  islandShape = shapeWithSector(islandShape, sector);
  generator = new TerrainStreamer(
    world,
    terrainSeed,
    sector.generationRegion,
    islandShape,
    terrain.map,
  );
  expansionInFlight = sector;
  influenceOverlay?.addSector(sector.region);
  growthScene.setMessage('Generating the new coastal sector…');
  selectedTool = { kind: 'none' };
  gameHud?.setTool(selectedTool);
  preview.hide();
  influenceOverlay?.hideCursor();
  gameHud?.updateCursor(0, 0, null);
}

function classLabel(cls: BuildingClass): string {
  return CLASS_LABELS[cls] ?? 'urban';
}

const GROUND_LABELS: Readonly<Record<GroundKind, string>> = {
  [GROUND.flat]: 'flat ground',
  [GROUND.sloped]: 'terraced slope',
  [GROUND.shore]: 'quay',
  [GROUND.rock]: 'rock',
  [GROUND.refused]: 'unworkable',
};

/**
 * Il perche' del sovrapprezzo, accanto al prezzo.
 *
 * Su terreno di listino non compare nulla: un `×1` accanto a ogni cartellino
 * insegnerebbe a ignorare la riga proprio dove invece cambia.
 */
function groundNote(site: SiteCost | null): string {
  if (site === null || site.ground === GROUND.flat) return '';
  if (site.ground === GROUND.refused) return ` · ${GROUND_LABELS[site.ground]}`;
  return ` · ${GROUND_LABELS[site.ground]} ×${site.weight}`;
}

function actionFailureLabel(reason: ActionFailure): string {
  const labels: Readonly<Record<ActionFailure, string>> = {
    'terrain-loading': 'The terrain is still being generated.',
    'not-buildable': 'No earthwork holds here: cliff or deep water.',
    'too-close': 'Too close to a catalyst of the same class.',
    'insufficient-funds': 'Not enough funds.',
    'population-required': `Requires ${BALANCE.gameplay.expansion.population} residents.`,
    'already-active': 'This action is already active.',
    'already-unlocked': 'This sector is already unlocked.',
    'onboarding-order': 'Complete the current tutorial step first.',
    'policy-incompatible': 'This policy conflicts with one that is already active.',
    'decision-option-invalid': 'This decision option is no longer available.',
  };
  return labels[reason];
}

function buildTerrainFrame(streamer: TerrainStreamer): TerrainOverlayFrame {
  return {
    fps: frameTiming.snapshot().fps,
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

/**
 * Metriche della pass d'ombra e del post-processing.
 *
 * Esiste per essere chiamata da entrambe le superfici di misura, overlay e
 * hook di console: una metrica si aggiunge qui una volta sola.
 */
function effectStats(): { shadowMs: number; shadowSize: number; effects: string } {
  const shadow = sunShadow.stats;
  const parts: string[] = [];
  if (shadow.enabled) parts.push('shadow');
  if (qualityProfile.bloom) parts.push('bloom');
  if (qualityProfile.tilt) parts.push('tilt');
  return {
    shadowMs: shadow.lastPassMs,
    shadowSize: shadow.enabled ? shadow.size : 0,
    effects: parts.length === 0 ? 'none' : parts.join('+'),
  };
}

function buildOverlayFrame(mainMs: number, renderMs: number, frameMs: number): OverlayFrame {
  const stats = chunkRenderer.stats;
  const mesher = chunkRenderer.mesherPool.stats;
  const timing = frameTiming.snapshot();

  return {
    fps: timing.fps,
    fpsLow: timing.fpsLow,
    frameP95Ms: timing.p95Ms,
    frameP99Ms: timing.p99Ms,
    jankRatio: timing.jankRatio,
    frameMs,
    mainMs,
    mainMsMax,
    renderMs,
    ...effectStats(),
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
    detailQuads: stats.detailQuads,
    solidVoxels: world.solidVoxelCount,
    mesherLastMs: mesher.lastMs,
    mesherAvgMs: mesher.avgMs,
    mesherMaxMs: mesher.maxMs,
    mesherPoolSize: mesher.poolSize,
    generationProgress: generator.done ? 1 : generator.progress,
    scene: terrain === null ? sceneKind : 'terrain',
    seed: terrain === null ? seed : terrainSeed,
    theme: theme.name,
    quality: renderQuality.mode,
    pixelRatio: renderer.getPixelRatio(),
    zoom: camera.zoom,
    yawDegrees: camera.yawDegrees,
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
    frameTiming.reset();
    chunkRenderer.mesherPool.resetStats();
  }
}

function onUiKey(event: KeyboardEvent): void {
  if (event.code === 'F3') {
    event.preventDefault();
    setDebugVisible(!debugVisible);
    return;
  }
  if (event.code === 'Escape' && gameHud?.handleEscape()) {
    event.preventDefault();
    return;
  }
  if (debugVisible) onDebugKey(event);
}

function setDebugVisible(visible: boolean): void {
  debugVisible = visible;
  overlay.setVisible(visible);
  terrainOverlay?.setVisible(visible);
  simOverlay?.setVisible(visible);
  growthOverlay?.setVisible(visible);
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

  console.info(`[harness] added ${added} chunks, ${world.chunkCount} now allocated`);
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
