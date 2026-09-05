import type { Group } from 'three';
import type { AtmosphereControl } from '../engine/AtmosphereControl';
import type { ChunkRenderer } from '../engine/ChunkRenderer';
import { DropRainView } from '../engine/DropRainView';
import {
  advanceRain,
  clearRain,
  createRain,
  spawnOverChunk,
  type RainColumn,
} from '../engine/dropRain';
import { fallHeightFor } from '../engine/introDrop';
import type { IsoCameraController } from '../engine/IsoCameraController';
import { withHour } from '../engine/daylight';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';

/**
 * La comparsa della prima isola: i pezzi scendono dal cielo, con una pioggia di
 * cubetti davanti a loro.
 *
 * A cadere e' il **chunk** e non il voxel — a valle del greedy mesher il cubo
 * singolo non esiste piu' — quindi la caduta vive dentro `ChunkRenderer`, che le
 * mesh le possiede gia'. I cubetti sono invece cubetti veri, sopra la scena come
 * i mezzi: nel volume voxel non entra niente di tutto questo.
 *
 * Lo stato e' due valori — se l'effetto sta ancora animando e da quanto in alto
 * si parte — e li scrivono tre punti diversi: il montaggio, il ciclo di frame e
 * l'hook che rimanda tutto in cielo per riguardarlo. Il proprietario e' questo.
 */
export interface EntryDropDeps {
  readonly chunkRenderer: ChunkRenderer;
  readonly world: VoxelWorld;
  readonly camera: IsoCameraController;
  readonly daylight: AtmosphereControl;
  readonly map: () => TerrainMap | null;
  readonly generationDone: () => boolean;
  /** `?intro=0` toglie la caduta: l'effetto non parte, e il primo frame e' fermo. */
  readonly enabled: boolean;
}

export interface EntryDrop {
  readonly group: Group;
  /** Vero finche' la comparsa ha ancora qualcosa da animare. */
  readonly active: boolean;
  /**
   * Un frame della comparsa.
   *
   * `stepDrop` sta fra `update` e `cull`, per le ragioni scritte li'.
   *
   * **La finestra non si chiude su `generator.done`**, e questa e' la parte che si
   * sbaglia per prima: quando l'ultimo blocco e' scritto restano in coda centinaia
   * di chunk da meshare, e disarmando li' comparirebbero di colpo — cioe' proprio
   * il pop che la caduta esiste per togliere. Si chiude quando non c'e' piu' niente
   * da meshare, e l'effetto finisce quando anche l'ultimo pezzo e' atterrato e
   * l'ultimo cubetto e' sparito.
   */
  step(seconds: number): void;
  /**
   * Rimanda in cielo quello che c'e' gia'.
   *
   * I numeri di `introDrop` e `dropRain` si tarano guardandoli, e ricaricare la
   * pagina rigenererebbe anche l'isola. Rilegge l'inquadratura: se nel frattempo
   * si e' zoomato, la quota di partenza che era fuori schermo non lo sarebbe piu'.
   */
  replay(): { readonly fall: number; readonly chunks: number };
}

export function createEntryDrop(deps: EntryDropDeps): EntryDrop {
  const { chunkRenderer, world, camera, daylight } = deps;

  const view = new DropRainView();
  const rain = createRain();
  let active = deps.enabled;

  /**
   * Dove si posa un cubetto e di che colore e'.
   *
   * La `TerrainMap` adotta un blocco appena arriva dal worker, quindi la colonna e'
   * interrogabile prima ancora che i suoi voxel siano scritti; la tinta la da'
   * invece il voxel vero, cosi' un cubetto che cade sulla roccia non e' verde.
   * `heights` e `waterTop` sono estremi **esclusivi**: la superficie e' il voxel
   * sotto, e un lago o il mare la portano piu' in alto del terreno.
   */
  function rainProbe(x: number, y: number): RainColumn | null {
    const map = deps.map();
    if (map === null) return null;
    const column = map.columnAt(x, y);
    if (column === null) return null;

    const surfaceZ = Math.max(column.height, map.waterTopAt(x, y)) - 1;
    const palette = world.getBlock(x, y, surfaceZ);
    if (palette === 0) return null;
    return { z: surfaceZ, palette };
  }

  /**
   * Da quanto in alto partono i pezzi, in voxel.
   *
   * Non e' una costante: «dal cielo» vuol dire **da fuori schermo**, e quanto sia
   * lontano il bordo alto dipende da zoom e inclinazione. L'altezza visibile esce
   * dal frustum ortografico, che e' l'unico posto in cui quel numero esiste
   * davvero.
   */
  function fallHeight(): number {
    const ortho = camera.camera;
    return fallHeightFor((ortho.top - ortho.bottom) / ortho.zoom, camera.pitchDegrees);
  }

  /** Fissata all'apertura della finestra: durante il caricamento la camera sta ferma. */
  let fall = fallHeight();

  chunkRenderer.onChunkBorn = (cx, cy, cz, bornAt): void => {
    spawnOverChunk(rain, cx, cy, cz, bornAt, fall, rainProbe);
  };
  // Una volta sola e non per frame: la comparsa dura qualche secondo, e in quel
  // tratto il sole si sposta di un decimo di grado.
  view.setLighting(daylight.look.colors, withHour(daylight.look.atmosphere, daylight.hour));
  if (active) chunkRenderer.armDrop(performance.now() / 1000, fall);

  return {
    group: view.group,

    get active(): boolean {
      return active;
    },

    step(seconds: number): void {
      if (deps.generationDone() && chunkRenderer.isIdle) chunkRenderer.disarmDrop();
      const flying = chunkRenderer.stepDrop(seconds);
      advanceRain(rain, seconds);
      view.draw(rain.cubes);

      if (!chunkRenderer.dropIsArmed && !flying && rain.cubes.length === 0) {
        active = false;
        view.hide();
      }
    },

    replay(): { readonly fall: number; readonly chunks: number } {
      clearRain(rain);
      fall = fallHeight();
      chunkRenderer.replayDrop(performance.now() / 1000, fall);
      active = true;
      return { fall, chunks: chunkRenderer.stats.chunksFalling };
    },
  };
}
