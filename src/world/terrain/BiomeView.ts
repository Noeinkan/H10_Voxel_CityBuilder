import { CHUNK } from '../chunkCoords';
import type { VoxelWorld } from '../VoxelWorld';
import { paletteForDepth } from './biomes';
import { columnLocalX, columnLocalY, COLUMNS_PER_CHUNK } from './columnBlock';
import { BIOME_DEBUG_IDS, TERRAIN, WATER_IDS } from './config';
import type { TerrainColumnChunk, TerrainMap } from './TerrainMap';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';

/**
 * Toggle di debug: ricolora il voxel visibile in cima a ogni colonna con la
 * tinta piatta del suo bioma, e lo rimette a posto quando si spegne.
 *
 * Riscrive solo la cella di superficie — una per colonna — quindi non tocca la
 * forma dell'isola: il mesher rifa' le stesse geometrie con indici diversi.
 * Anche questo lavoro e' a budget, perche' 65 536 colonne cambiate in un frame
 * sforerebbero la soglia da sole.
 */

/** Colonne ricolorate fra due controlli del budget. */
const COLUMN_BATCH = 512;

export class BiomeView {
  private readonly world: VoxelWorld;
  private readonly map: TerrainMap;

  private on = false;
  private queue: TerrainColumnChunk[] = [];
  private cursor = 0;

  constructor(world: VoxelWorld, map: TerrainMap) {
    this.world = world;
    this.map = map;
  }

  get enabled(): boolean {
    return this.on;
  }

  /** true quando c'e' ancora da ridipingere. */
  get busy(): boolean {
    return this.queue.length > 0;
  }

  /** Inverte lo stato e rimette in coda tutte le colonne conosciute. */
  toggle(): void {
    this.setEnabled(!this.on);
  }

  setEnabled(value: boolean): void {
    if (value === this.on && this.queue.length === 0) return;
    this.on = value;
    this.queue = Array.from(this.map.chunks.values());
    this.cursor = 0;
  }

  step(budgetMs: number): boolean {
    if (this.queue.length === 0) return true;
    const start = performance.now();

    while (this.queue.length > 0) {
      const chunk = this.queue[0];
      const baseX = chunk.ccx * CHUNK;
      const baseY = chunk.ccy * CHUNK;

      while (this.cursor < COLUMNS_PER_CHUNK) {
        const end = Math.min(COLUMNS_PER_CHUNK, this.cursor + COLUMN_BATCH);
        for (let i = this.cursor; i < end; i++) {
          const biome = chunk.biomes[i];
          const height = chunk.heights[i];
          const submerged = height < TERRAIN.seaLevel;

          // Sott'acqua il voxel che si vede e' il pelo dell'acqua, non il fondale.
          const z = submerged ? TERRAIN.seaLevel - 1 : height - 1;
          if (z < 0) continue;

          const id = this.on
            ? BIOME_DEBUG_IDS[biome]
            : submerged
              ? WATER_IDS.surface
              : paletteForDepth(biome, 0);

          // Ripristinando l'acqua va rimessa anche la sua classe, o il pelo
          // tornerebbe mare aperto ovunque: per un voxel d'acqua i bit di
          // superficie sono `WATER_CLASS`, non un linguaggio di facciata.
          const surface = !this.on && submerged ? (chunk.water[i] as SurfaceKind) : SURFACE_KIND.plain;

          this.world.setBlock(baseX + columnLocalX(i), baseY + columnLocalY(i), z, id, surface);
        }
        this.cursor = end;
        if (performance.now() - start >= budgetMs) break;
      }

      if (this.cursor < COLUMNS_PER_CHUNK) return false;
      this.queue.shift();
      this.cursor = 0;
      if (performance.now() - start >= budgetMs) break;
    }

    return this.queue.length === 0;
  }
}
