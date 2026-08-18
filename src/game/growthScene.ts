import { addCatalyst, createSimState, scenarioCatalysts, tick, type SimState } from '../sim';
import type { ScenarioRegion } from '../sim/scenario';
import { Builder, type BuilderStats } from '../world/buildings/Builder';
import type { ReadonlyBuildingRegistry } from '../world/buildings/BuildingRegistry';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { FixedStepLoop } from './loop';

const TICK_RATE = 10;
const CATALYST_LATTICE = 10;

export interface GrowthStats {
  readonly ready: true;
  readonly tick: number;
  readonly tickMs: number;
  readonly buildings: number;
  readonly countsByClass: readonly number[];
  readonly levels: readonly number[];
  readonly builder: BuilderStats;
}

/** Cablaggio esclusivo di `?grow=1`: la scena sim normale non costruisce voxel. */
export class GrowthScene {
  private state: SimState;
  private readonly builder: Builder;
  private readonly loop = new FixedStepLoop(TICK_RATE, TICK_RATE);
  private lastTickMs = 0;

  constructor(
    world: VoxelWorld,
    private readonly map: TerrainMap,
    region: ScenarioRegion,
    seed: number,
  ) {
    let state = createSimState();
    for (const catalyst of scenarioCatalysts(map, region, { lattice: CATALYST_LATTICE })) {
      state = addCatalyst(state, catalyst);
    }
    this.state = state;
    this.builder = new Builder(world, map, seed);
  }

  advance(dt: number): void {
    this.loop.advance(dt, () => {
      const start = performance.now();
      this.state = tick(this.state, this.map);
      this.state = this.builder.onTick(this.state);
      this.lastTickMs = performance.now() - start;
    });
    this.builder.step();
  }

  get registry(): ReadonlyBuildingRegistry {
    return this.builder.registry;
  }

  get stats(): GrowthStats {
    return {
      ready: true,
      tick: this.state.tickCount,
      tickMs: this.lastTickMs,
      buildings: this.builder.registry.count,
      countsByClass: [...this.builder.registry.countsByClass],
      levels: [...this.builder.registry.levelHistogram],
      builder: this.builder.stats,
    };
  }
}
