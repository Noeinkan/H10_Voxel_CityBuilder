import {
  createSimState,
  tick,
  type BuildingClass,
  type CatalystId,
  type PolicyId,
  type SimState,
  type TradeMode,
} from '../sim';
import type { ScenarioRegion } from '../sim/scenario';
import { Builder, type BuilderStats } from '../world/buildings/Builder';
import type { ReadonlyBuildingRegistry } from '../world/buildings/BuildingRegistry';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { FixedStepLoop } from './loop';
import {
  buyExpansion,
  catalystFailure,
  changeTradeMode,
  chooseDecision,
  expansionFailure,
  placeCatalyst,
  togglePolicy,
  type ActionFailure,
  type ActionResult,
} from './actions';
import { cityCondition, isSelfSufficient, type CityCondition } from './cityCondition';
import { onboardingAllows, onboardingOf, type OnboardingState } from './onboarding';

const TICK_RATE = 10;
export interface GrowthStats {
  readonly ready: true;
  readonly tick: number;
  readonly tickMs: number;
  readonly buildings: number;
  readonly countsByClass: readonly number[];
  /** Edifici che ospitano un uso come secondo, per indice di uso. */
  readonly mixedByClass: readonly number[];
  /** Edifici per tipologia, dalla piu' comune alla piu' rara. */
  readonly typologies: readonly (readonly [string, number])[];
  readonly levels: readonly number[];
  readonly builder: BuilderStats;
  readonly state: SimState;
  readonly paused: boolean;
  readonly speed: number;
  readonly message: string;
  readonly onboarding: OnboardingState;
  readonly condition: CityCondition;
  readonly unlockedSectors: readonly string[];
}

/** Cablaggio esclusivo di `?grow=1`: la scena sim normale non costruisce voxel. */
export class GrowthScene {
  private state: SimState;
  private readonly builder: Builder;
  private readonly loop = new FixedStepLoop(TICK_RATE, TICK_RATE);
  private lastTickMs = 0;
  private paused = false;
  private speed = 1;
  private healthyTicks = 0;
  private readonly unlocked = new Set<string>();
  private message = 'Choose a catalyst and place it on the island.';

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
      this.healthyTicks = isSelfSufficient(this.state) ? this.healthyTicks + 1 : 0;
      this.lastTickMs = performance.now() - start;
    });
    this.builder.step();
  }

  placeCatalyst(x: number, y: number, target: BuildingClass | CatalystId): ActionResult {
    if (!onboardingAllows(this.state, target)) {
      return { success: false, reason: 'onboarding-order' };
    }
    const result = placeCatalyst(this.state, this.map, x, y, target);
    if (result.success) {
      const placed = result.state.catalysts[result.state.catalysts.length - 1];
      if (placed !== undefined) this.builder.decorateCatalyst(x, y, placed.class);
    }
    return this.apply(result, 'Catalyst placed.');
  }

  catalystFailure(x: number, y: number, target: BuildingClass | CatalystId): ActionFailure | null {
    if (!onboardingAllows(this.state, target)) return 'onboarding-order';
    return catalystFailure(this.state, this.map, x, y, target);
  }

  togglePolicy(id: PolicyId): ActionResult {
    const active = !this.state.policies.includes(id);
    return this.apply(togglePolicy(this.state, id), active ? 'Policy activated.' : 'Policy deactivated.');
  }

  chooseDecision(optionId: string): ActionResult {
    return this.apply(chooseDecision(this.state, optionId), 'Decision applied to the city.');
  }

  setTradeMode(mode: TradeMode): ActionResult {
    return this.apply(changeTradeMode(this.state, mode), 'Trade strategy updated.');
  }

  buyExpansion(sectorId: string): ActionResult {
    const result = buyExpansion(this.state, this.unlocked.has(sectorId));
    if (result.success) this.unlocked.add(sectorId);
    return this.apply(result, 'Coastal sector purchased.');
  }

  expansionFailure(sectorId: string): ActionFailure | null {
    return expansionFailure(this.state, this.unlocked.has(sectorId));
  }

  markSectorReady(): void {
    this.message = 'Coastal sector ready. The new land can support city growth.';
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

  get statusMessage(): string {
    return this.message;
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
      mixedByClass: [...this.builder.registry.mixedByClass],
      typologies: [...this.builder.registry.typologyHistogram]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      levels: [...this.builder.registry.levelHistogram],
      builder: this.builder.stats,
      state: this.state,
      paused: this.paused,
      speed: this.speed,
      message: this.message,
      onboarding: onboardingOf(this.state),
      condition: cityCondition(this.state, this.healthyTicks),
      unlockedSectors: [...this.unlocked],
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
