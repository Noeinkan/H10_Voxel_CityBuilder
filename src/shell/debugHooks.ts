import type { Vector3, WebGLRenderer } from 'three';
import type { AtmosphereControl } from '../engine/AtmosphereControl';
import type { ChunkRenderer } from '../engine/ChunkRenderer';
import type { FrameTiming } from '../engine/FrameTiming';
import type { InspectView } from '../engine/InspectView';
import type { RenderQualityController } from '../engine/RenderQuality';
import type { VoxelMaterialHandle } from '../engine/VoxelMaterial';
import { DAYLIGHT, dayPhase, resolveDaylightMode, withHour } from '../engine/daylight';
import { INSPECT_MODES, INSPECT_NAMES, parseInspectMode } from '../engine/inspect';
import { faceLuminance } from '../engine/lighting';
import { seasonMood } from '../engine/season';
import { THEMES } from '../engine/themes';
import type { GrowthScene } from '../game/growthScene';
import type { SimScene } from '../game/simScene';
import { SIM_SITE_COUNT } from '../game/simScene';
import { BALANCE } from '../sim/balance';
import { CLASS_COUNT, CLASS_NAMES, type BuildingClass } from '../sim/classes';
import { isInfoViewKind } from '../sim/infoViews';
import type { BuildSite } from '../sim/nextBuildSites';
import { isPolicyId } from '../sim/policies';
import { harvestFactorAt, SEASON_NAMES, seasonAt } from '../sim/seasons';
import type { InspectOverlayFrame } from '../ui/InspectOverlay';
import { CHUNK } from '../world/chunkCoords';
import type { SceneGenerator } from '../world/scenes/cityScene';
import { SWATCH_FOCUSES, swatchExtent, swatchSubjectAt } from '../world/scenes/swatchCatalog';
import type { BiomeView } from '../world/terrain/BiomeView';
import { expandIsland } from '../world/terrain/IslandGenerator';
import type { TerrainStreamer } from '../world/terrain/TerrainStreamer';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { EntryDrop } from './entryDrop';
import type { FrameStats } from './frameStats';
import type { InfoViewScene } from './infoViewScene';
import { swatchDetailOf, type SwatchScene } from './swatchScene';

/**
 * Gli hook globali dell'harness, tutti in un posto.
 *
 * Sono la superficie con cui uno strumento headless o una console interrogano la
 * scena, e la regola che li tiene onesti e' una sola: **stessa fonte
 * dell'overlay**. Nessuno di loro calcola niente per conto proprio — ogni numero
 * arriva dai `frameStats`, dalla scena o dal controller che lo possiede gia' —
 * perche' due letture separate divergono al primo refactor, e una diagnosi che
 * non si riproduce e' peggio di una metrica che manca.
 *
 * Stanno fuori dalla radice perche' non partecipano al montaggio: si registrano
 * una volta e da li' in poi leggono. Chi aggiunge una metrica la aggiunge qui e
 * nell'overlay che la mostra, non in un terzo posto.
 */
export interface DebugHooksDeps {
  readonly debugEnabled: boolean;
  readonly perfEnabled: boolean;
  readonly simEnabled: boolean;
  readonly growEnabled: boolean;

  readonly renderer: WebGLRenderer;
  readonly chunkRenderer: ChunkRenderer;
  readonly frameTiming: FrameTiming;
  readonly world: VoxelWorld;
  readonly paletteHandle: VoxelMaterialHandle;
  readonly daylight: AtmosphereControl;
  readonly renderQuality: RenderQualityController;
  readonly inspect: InspectView;
  readonly stats: FrameStats;
  /** Il picco di lavoro sul main thread, che lo tiene il ciclo di frame. */
  readonly mainMsMax: () => number;
  /** Azzera picchi e finestre di misura: serve a misurare il regime, non lo startup. */
  readonly resetPeaks: () => void;
  readonly generator: () => SceneGenerator;
  readonly inspectFrame: () => InspectOverlayFrame;
  /** Il sole in spazio vista: dice dove il cielo lo disegna a schermo. */
  readonly sunView: Vector3;

  readonly expandWorld: () => void;
  readonly entryDrop: EntryDrop;
  readonly swatch: SwatchScene | null;
  readonly infoViews: InfoViewScene | null;

  readonly terrain: TerrainStreamer | null;
  readonly terrainSeed: number;
  readonly terrainSize: number;
  readonly terrainApplyMs: () => number;
  readonly biomeView: BiomeView | null;
  readonly toggleBiomeView: () => void;

  readonly simScene: () => SimScene | null;
  readonly growthScene: () => GrowthScene | null;
}

export function installDebugHooks(deps: DebugHooksDeps): void {
  const { renderer, chunkRenderer, frameTiming, world, daylight, renderQuality, inspect } = deps;
  const debugGlobals = globalThis as Record<string, unknown>;

  if (deps.debugEnabled || deps.perfEnabled) {
    // Hook per misure da console o da strumenti headless: stessa fonte dell'overlay.
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
        mainMsMax: deps.mainMsMax(),
        ...deps.stats.effects(),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometryBytes: stats.geometryBytes,
        chunksAllocated: stats.chunksAllocated,
        chunksWithMesh: stats.chunksWithMesh,
        chunksVisible: stats.chunksVisible,
        chunksFalling: stats.chunksFalling,
        queued: stats.queued,
        inFlight: stats.inFlight,
        solidVoxels: world.solidVoxelCount,
        mesherAvgMs: mesher.avgMs,
        mesherMaxMs: mesher.maxMs,
        generationDone: deps.generator().done,
        theme: daylight.theme.id,
        quality: renderQuality.mode,
        pixelRatio: renderer.getPixelRatio(),
        remeshMs: stats.remeshMs,
        remeshedChunks: stats.remeshedChunks,
        remeshApplyMs: stats.remeshApplyMs,
        remeshDispatchMs: stats.remeshDispatchMs,
        remeshApplyMaxMs: stats.remeshApplyMaxMs,
        remeshDispatchMaxMs: stats.remeshDispatchMaxMs,
      };
    };
  }

  if (!deps.debugEnabled) return;

  // Gli altri hook restano dietro il gate del debug: ?perf=1 misura la scena,
  // non la comanda.
  debugGlobals['__voxelReset'] = (): void => deps.resetPeaks();
  debugGlobals['__voxelExpand'] = (): void => deps.expandWorld();
  // Rimanda in cielo quello che c'e' gia': i numeri di `introDrop` e `dropRain`
  // si tarano guardandoli, e ricaricare la pagina rigenererebbe anche l'isola.
  debugGlobals['__voxelDrop'] = (): Record<string, unknown> => ({ ...deps.entryDrop.replay() });
  debugGlobals['__voxelRebuildAll'] = (): void => world.markAllDirty();
  debugGlobals['__voxelTheme'] = (id?: string): Record<string, unknown> => {
    if (id !== undefined) {
      const found = THEMES.findIndex((candidate) => candidate.id === id);
      if (found < 0) console.warn(`[theme] unknown id: ${id}`);
      else daylight.cycleTheme(found);
    }
    const current = daylight.theme;
    return { id: current.id, name: current.name, available: THEMES.map((t) => t.id) };
  };
  // Sposta il sole senza ricaricare: serve ad autorare i temi guardando il
  // risultato invece che immaginandolo. Non persiste, il tema resta la fonte.
  debugGlobals['__voxelSun'] = (azimuth?: number, elevation?: number): Record<string, unknown> => {
    // Il look e non il tema: qui si riscrive l'atmosfera nel materiale, e
    // ripartire da quella del tema riporterebbe i prati d'estate a gennaio.
    const atmosphere = daylight.look.atmosphere;
    const sun = atmosphere.sun;
    const next = {
      ...sun,
      azimuth: azimuth ?? sun.azimuth,
      elevation: elevation ?? sun.elevation,
    };
    deps.paletteHandle.setAtmosphere({ ...atmosphere, sun: next });
    return {
      azimuth: next.azimuth,
      elevation: next.elevation,
      faceLuminance: faceLuminance({ ...atmosphere, sun: next }),
      // Dove il cielo disegna il sole: xy in NDC, `facing` false se sta dietro
      // la camera e quindi resta solo l'alone.
      screen: { x: deps.sunView.x * 1.35, y: deps.sunView.y * 1.35, facing: deps.sunView.z < 0 },
    };
  };
  // L'orologio. Convive con `__voxelSun`, che resta l'override manuale per
  // autorare un tema: quello scrive una posizione e basta, questo la ricava
  // dall'ora e continua a ricavarla finche' il ciclo cammina.
  debugGlobals['__voxelHour'] = (next?: number | string): Record<string, unknown> => {
    // Un numero e' un'ora, una stringa e' un modo: sono la stessa manopola vista
    // da due lati, e due hook separati vorrebbero dire ricordarsi quale chiama
    // quale mentre si guarda una notte che non passa.
    if (typeof next === 'number') daylight.setHour(next);
    else if (typeof next === 'string') daylight.setMode(resolveDaylightMode(next));
    const hour = daylight.hour;
    const atmosphere = withHour(daylight.theme.atmosphere, hour);
    return {
      hour,
      mode: daylight.mode,
      pinned: daylight.pinned,
      day: dayPhase(hour, daylight.theme.atmosphere.sun.elevation),
      azimuth: atmosphere.sun.azimuth,
      elevation: atmosphere.sun.elevation,
      sunIntensity: atmosphere.sun.intensity,
      emissiveStrength: atmosphere.emissiveStrength,
      dayLengthSeconds: DAYLIGHT.daySeconds,
    };
  };
  /**
   * L'anno, dallo stesso lato da cui si guarda l'ora.
   *
   * Un numero inchioda la fase — 0 primavera, 0,375 estate, 0,625 autunno, 0,875
   * inverno — e `null` la restituisce alla simulazione. Torna anche il
   * moltiplicatore del raccolto, che e' il modo per verificare che il colore e la
   * resa stiano nello stesso mese: sono la stessa fase, e se un giorno
   * divergessero si vedrebbe qui prima che a schermo.
   */
  debugGlobals['__voxelSeason'] = (phase?: number | null): Record<string, unknown> => {
    if (phase !== undefined) daylight.pinSeason(phase);
    const current = daylight.season;
    const tick = deps.growthScene()?.simState.tickCount ?? 0;
    return {
      phase: current,
      pinned: daylight.seasonPinned,
      season: SEASON_NAMES[seasonAt(Math.round(current * BALANCE.seasons.yearTicks))],
      harvestFactor: harvestFactorAt(Math.round(current * BALANCE.seasons.yearTicks)),
      mood: seasonMood(current),
      simTick: tick,
      yearTicks: BALANCE.seasons.yearTicks,
    };
  };
  // Stessa fonte del pannello: due letture separate divergerebbero al primo
  // refactor, ed e' la regola dell'harness.
  debugGlobals['__voxelInspect'] = (mode?: string, z?: number): Record<string, unknown> => {
    if (mode !== undefined) inspect.setMode(parseInspectMode(mode));
    if (z !== undefined) inspect.setSliceZ(z);
    const frame = deps.inspectFrame();
    return {
      ...frame,
      mode: INSPECT_NAMES[frame.mode],
      available: INSPECT_MODES.map((candidate) => INSPECT_NAMES[candidate]),
    };
  };

  const swatch = deps.swatch;
  if (swatch !== null) {
    // Con `x` e `y` interroga una colonna qualsiasi del campionario senza
    // muovere il mouse: e' cosi' che uno strumento headless verifica che un
    // soggetto ci sia. Senza argomenti riporta cio' che il cursore indica; le
    // fasce disponibili escono dalla stessa fonte del pannello.
    debugGlobals['__voxelSwatch'] = (x?: number, y?: number): Record<string, unknown> => {
      const frame = swatch.frame();
      const subject = x === undefined || y === undefined
        ? frame.subject
        : swatchSubjectAt(x, y);
      return {
        extent: swatchExtent(),
        subject,
        selection: frame.selection,
        voxel: frame.voxel,
        detail: swatchDetailOf(subject),
        focus: frame.focus,
        focuses: SWATCH_FOCUSES,
      };
    };
  }

  const terrain = deps.terrain;
  if (terrain === null) return;

  debugGlobals['__terrainStats'] = (): Record<string, unknown> => ({
    seed: deps.terrainSeed,
    size: deps.terrainSize,
    workerMs: terrain.generationMs,
    applyMs: deps.terrainApplyMs(),
    blocksApplied: terrain.blocksApplied,
    blocksTotal: terrain.blocksTotal,
    columns: terrain.map.columnCount,
    buildableColumns: terrain.buildableColumns,
    biomeHistogram: Array.from(terrain.map.biomeHistogram()),
    biomeView: deps.biomeView?.enabled ?? false,
    done: terrain.done,
  });
  debugGlobals['__terrainBiomeView'] = (): void => deps.toggleBiomeView();

  if (deps.simEnabled) {
    // Stessa fonte dell'overlay, per misurare la simulazione da console o da
    // uno strumento headless senza passare dai pulsanti.
    debugGlobals['__simStats'] = (): Record<string, unknown> => {
      const sim = deps.simScene();
      if (sim === null) return { ready: false };
      const state = sim.simState;
      return {
        ready: true,
        tick: state.tickCount,
        auto: sim.autoEnabled,
        tickMs: sim.tickMs,
        population: state.population,
        food: state.food,
        materials: state.materials,
        funds: state.funds,
        satisfaction: state.satisfaction,
        buildingCounts: state.buildingCounts,
        mixedCounts: state.mixedCounts,
        // I produttori di cibo passano **sia** di qui sia dall'overlay, come
        // ogni metrica: leggono la stessa fonte, e una delle due che manca e'
        // il modo in cui una diagnosi diventa impossibile da riprodurre.
        farmCounts: state.farmCounts,
        harvest: state.harvest,
        commerce: state.commerce,
        catalysts: state.catalysts.length,
        policies: state.policies,
        selectedClass: CLASS_NAMES[state.selectedClass],
        fieldChunks: state.field.chunkCount,
        recomputedCells: state.field.totalRecomputedCells,
        dataCells: sim.dataCells,
      };
    };
    debugGlobals['__simTick'] = (count = 1): number => {
      const sim = deps.simScene();
      sim?.step(Math.max(1, Math.floor(count)));
      return sim?.simState.tickCount ?? 0;
    };
    debugGlobals['__simSites'] = (count = SIM_SITE_COUNT): readonly BuildSite[] =>
      deps.simScene()?.sitesAt(count) ?? [];
    debugGlobals['__simClass'] = (cls: number): void => {
      if (cls >= 0 && cls < CLASS_COUNT) deps.simScene()?.selectClass(cls as BuildingClass);
    };
    debugGlobals['__simPolicy'] = (id: string): void => {
      if (isPolicyId(id)) deps.simScene()?.togglePolicy(id);
    };
  }

  const infoViews = deps.infoViews;
  if (deps.growEnabled && infoViews !== null) {
    debugGlobals['__growStats'] = (): Record<string, unknown> => {
      const scene = deps.growthScene();
      return scene === null ? { ready: false } : { ...scene.stats };
    };
    // Stessa fonte dell'overlay informativo: cambia la vista attiva o interroga
    // una colonna senza muovere il mouse, per uno strumento headless.
    debugGlobals['__voxelInfo'] = (view?: string, x?: number, y?: number): Record<string, unknown> => {
      if (view !== undefined) {
        if (!isInfoViewKind(view)) return { view: infoViews.kind, error: `unknown view: ${view}` };
        infoViews.setView(view);
      }
      if (x !== undefined && y !== undefined) {
        const value = infoViews.sample(x, y);
        if (value !== null) {
          return { view: infoViews.kind, x: Math.round(x), y: Math.round(y), value };
        }
      }
      return { view: infoViews.kind };
    };
  }

  // L'espansione qui e' solo una funzione chiamabile: nessun input di gioco la
  // attiva. Aggiunge la striscia a nord riusando seed e maschera dell'isola,
  // quindi la costa continua invece di ricominciare.
  debugGlobals['__terrainExpand'] = (): Record<string, unknown> => {
    const result = expandIsland(
      world,
      deps.terrainSeed,
      { minX: 0, minY: deps.terrainSize, sizeX: deps.terrainSize, sizeY: CHUNK * 2 },
      { map: terrain.map },
    );
    return { blocks: result.blocks, voxels: result.voxelsWritten, ms: result.generationMs };
  };
}
