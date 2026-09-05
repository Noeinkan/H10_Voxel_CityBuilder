import type { WebGLRenderer } from 'three';
import type { AtmosphereControl } from '../engine/AtmosphereControl';
import type { ChunkRenderer } from '../engine/ChunkRenderer';
import type { FrameTiming } from '../engine/FrameTiming';
import type { IsoCameraController } from '../engine/IsoCameraController';
import type { QualityProfile, RenderQualityController } from '../engine/RenderQuality';
import type { SunShadowHandle } from '../engine/SunShadow';
import { DAYLIGHT_MODE } from '../engine/daylight';
import type { OverlayFrame } from '../ui/DebugOverlay';
import type { PerfFrame } from '../ui/PerfOverlay';
import type { TerrainOverlayFrame } from '../ui/TerrainOverlay';
import type { SceneKind } from '../world/scenes/cityScene';
import type { SceneGenerator } from '../world/scenes/cityScene';
import type { BiomeView } from '../world/terrain/BiomeView';
import type { TerrainStreamer } from '../world/terrain/TerrainStreamer';
import type { VoxelWorld } from '../world/VoxelWorld';

/**
 * Le letture di misura, in un posto solo.
 *
 * Sono traduzioni e non decisioni: prendono cio' che renderer, mesher e
 * controller sanno gia' e lo mettono nella forma che overlay, riepilogo console e
 * hook globali si aspettano. Stanno insieme perche' leggono tutte le stesse
 * fonti, e perche' una metrica nuova si aggiunge qui una volta invece che nelle
 * tre superfici che la mostrano — che e' la regola dell'harness.
 *
 * Non possiedono niente: ogni valore mutevole arriva come funzione, cosi' una
 * lettura presa al montaggio non invecchia.
 */
export interface FrameStatsDeps {
  readonly renderer: WebGLRenderer;
  readonly chunkRenderer: ChunkRenderer;
  readonly frameTiming: FrameTiming;
  readonly world: VoxelWorld;
  readonly camera: IsoCameraController;
  readonly sunShadow: SunShadowHandle;
  readonly daylight: AtmosphereControl;
  readonly renderQuality: RenderQualityController;
  readonly quality: () => QualityProfile;
  readonly generator: () => SceneGenerator;
  readonly biomeView: BiomeView | null;
  /** Millisecondi spesi ad applicare i blocchi del terreno, che li conta il ciclo. */
  readonly terrainApplyMs: () => number;
  readonly terrain: TerrainStreamer | null;
  readonly sceneKind: SceneKind;
  readonly seed: number;
  readonly terrainSeed: number;
  readonly terrainSize: number;
}

export interface EffectStats {
  readonly shadowMs: number;
  readonly shadowSize: number;
  readonly effects: string;
}

export interface FrameStats {
  /**
   * Metriche della pass d'ombra e del post-processing.
   *
   * Esiste per essere chiamata da entrambe le superfici di misura, overlay e
   * hook di console: una metrica si aggiunge qui una volta sola.
   */
  effects(): EffectStats;
  /**
   * I numeri della conversazione sulle prestazioni: overlay e riepilogo console
   * leggono questo oggetto, la fonte delle metriche remesh resta
   * `chunkRenderer.stats`.
   */
  perf(frameMs: number): PerfFrame;
  overlay(mainMs: number, mainMsMax: number, renderMs: number, frameMs: number): OverlayFrame;
  terrain(streamer: TerrainStreamer): TerrainOverlayFrame;
}

export function createFrameStats(deps: FrameStatsDeps): FrameStats {
  const { renderer, chunkRenderer, frameTiming, world, camera, daylight, renderQuality } = deps;

  function effects(): EffectStats {
    const shadow = deps.sunShadow.stats;
    const profile = deps.quality();
    const parts: string[] = [];
    if (shadow.enabled) parts.push('shadow');
    if (profile.bloom) parts.push('bloom');
    if (profile.tilt) parts.push('tilt');
    if (profile.grade) parts.push('grade');
    if (profile.godRays) parts.push('rays');
    if (profile.outline) parts.push('outline');
    return {
      shadowMs: shadow.lastPassMs,
      shadowSize: shadow.enabled ? shadow.size : 0,
      effects: parts.length === 0 ? 'none' : parts.join('+'),
    };
  }

  function perf(frameMs: number): PerfFrame {
    const stats = chunkRenderer.stats;
    return {
      fps: frameTiming.snapshot().fps,
      frameMs,
      remeshMs: stats.remeshMs,
      remeshedChunks: stats.remeshedChunks,
      qualityMode: renderQuality.mode,
      pixelRatio: renderer.getPixelRatio(),
      effects: effects().effects,
    };
  }

  return {
    effects,
    perf,

    overlay(mainMs: number, mainMsMax: number, renderMs: number, frameMs: number): OverlayFrame {
      const stats = chunkRenderer.stats;
      const mesher = chunkRenderer.mesherPool.stats;
      const timing = frameTiming.snapshot();
      const generator = deps.generator();

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
        ...effects(),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometryBytes: stats.geometryBytes,
        chunksAllocated: stats.chunksAllocated,
        chunksNonEmpty: stats.chunksNonEmpty,
        chunksWithMesh: stats.chunksWithMesh,
        chunksVisible: stats.chunksVisible,
        chunksFalling: stats.chunksFalling,
        queued: stats.queued,
        inFlight: stats.inFlight,
        quads: stats.quads,
        detailQuads: stats.detailQuads,
        solidVoxels: world.solidVoxelCount,
        mesherLastMs: mesher.lastMs,
        mesherAvgMs: mesher.avgMs,
        mesherMaxMs: mesher.maxMs,
        mesherPoolSize: mesher.poolSize,
        remeshApplyMs: stats.remeshApplyMs,
        remeshDispatchMs: stats.remeshDispatchMs,
        remeshApplyMaxMs: stats.remeshApplyMaxMs,
        remeshDispatchMaxMs: stats.remeshDispatchMaxMs,
        generationProgress: generator.done ? 1 : generator.progress,
        scene: deps.terrain === null ? deps.sceneKind : 'terrain',
        seed: deps.terrain === null ? deps.seed : deps.terrainSeed,
        theme: daylight.theme.name,
        hour: daylight.hour,
        // Fermo e' fermo, che sia il modo scelto dal giocatore o un `?hour=`: al
        // pannello serve sapere che l'orologio non cammina, non da quale delle due
        // strade e' arrivato. Il modo lo dice comunque, subito accanto.
        hourMode: daylight.mode,
        hourPinned: daylight.pinned || daylight.mode !== DAYLIGHT_MODE.cycle,
        quality: renderQuality.mode,
        pixelRatio: renderer.getPixelRatio(),
        zoom: camera.zoom,
        yawDegrees: camera.yawDegrees,
        pitchDegrees: camera.pitchDegrees,
      };
    },

    terrain(streamer: TerrainStreamer): TerrainOverlayFrame {
      return {
        fps: frameTiming.snapshot().fps,
        generationMs: streamer.generationMs,
        applyMs: deps.terrainApplyMs(),
        blocksApplied: streamer.blocksApplied,
        blocksTotal: streamer.blocksTotal,
        columns: streamer.map.columnCount,
        buildableColumns: streamer.buildableColumns,
        histogram: Array.from(streamer.map.biomeHistogram()),
        biomeView: deps.biomeView?.enabled ?? false,
        seed: deps.terrainSeed,
        regionSize: deps.terrainSize,
      };
    },
  };
}
