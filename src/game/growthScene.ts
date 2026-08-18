import {
  createSimState,
  tick,
  type BuildingClass,
  type PolicyId,
  type SimState,
} from '../sim';
import type { ScenarioRegion } from '../sim/scenario';
import { Builder, type BuilderStats } from '../world/buildings/Builder';
import type { ReadonlyBuildingRegistry } from '../world/buildings/BuildingRegistry';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { FixedStepLoop } from './loop';
import {
  buyExpansion,
  placeCatalyst,
  togglePolicy,
  type ActionResult,
} from './actions';

const TICK_RATE = 10;
export interface GrowthStats {
  readonly ready: true;
  readonly tick: number;
  readonly tickMs: number;
  readonly buildings: number;
  readonly countsByClass: readonly number[];
  readonly levels: readonly number[];
  readonly builder: BuilderStats;
  readonly state: SimState;
  readonly paused: boolean;
  readonly speed: number;
  readonly message: string;
}

/** Cablaggio esclusivo di `?grow=1`: la scena sim normale non costruisce voxel. */
export class GrowthScene {
  private state: SimState;
  private readonly builder: Builder;
  private readonly loop = new FixedStepLoop(TICK_RATE, TICK_RATE);
  private lastTickMs = 0;
  private paused = false;
  private speed = 1;
  private message = 'Scegli un catalizzatore e piazzalo sull’isola.';

  constructor(
    world: VoxelWorld,
    private readonly map: TerrainMap,
    _region: ScenarioRegion,
    seed: number,
  ) {
    this.state = createSimState({ rngState: seed });
    this.builder = new Builder(world, map, seed);
  }

  advance(dt: number): void {
    if (!this.paused) this.loop.advance(dt * this.speed, () => {
      const start = performance.now();
      this.state = tick(this.state, this.map);
      this.state = this.builder.onTick(this.state);
      this.lastTickMs = performance.now() - start;
    });
    this.builder.step();
  }

  placeCatalyst(x: number, y: number, cls: BuildingClass): ActionResult {
    return this.apply(placeCatalyst(this.state, this.map, x, y, cls), 'Catalizzatore piazzato.');
  }

  togglePolicy(id: PolicyId): ActionResult {
    const active = !this.state.policies.includes(id);
    return this.apply(togglePolicy(this.state, id), active ? 'Policy attivata.' : 'Policy disattivata.');
  }

  buyExpansion(): ActionResult {
    return this.apply(buyExpansion(this.state), 'Settore costiero acquistato.');
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setSpeed(speed: number): void {
    this.speed = speed === 2 || speed === 4 ? speed : 1;
  }

  setMessage(message: string): void {
    this.message = message;
  }

  get simState(): SimState {
    return this.state;
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
      state: this.state,
      paused: this.paused,
      speed: this.speed,
      message: this.message,
    };
  }

  private apply(result: ActionResult, successMessage: string): ActionResult {
    if (result.success) {
      this.state = result.state;
      this.message = successMessage;
    }
    return result;
  }
}
