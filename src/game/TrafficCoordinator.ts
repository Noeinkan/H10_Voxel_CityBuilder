import type { CatalystId, SimState } from '../sim';
import type { Builder } from '../world/buildings/Builder';
import type { BuildingRecord } from '../world/buildings/BuildingRegistry';
import { landmarkWaterColumn } from '../world/landmarks/generate';
import type { Facing } from '../world/streets/streetGrid';
import { BIOME, WATER_IDS } from '../world/terrain/config';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { TRAFFIC, fleetOf } from '../world/traffic/config';
import { puffsAt, type SmokePuff } from '../world/traffic/plume';
import { posesAt, type VehiclePose } from '../world/traffic/poses';
import { planRopewayRoutes } from '../world/traffic/ropewayRoutes';
import { planTraffic, type TrafficRoute, type TrafficStructure } from '../world/traffic/routes';
import { wakeAt, type WakeMark } from '../world/traffic/wake';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { RopewayRide } from '../world/buildings/ropewayDriver';

type CatalystAt = (
  record: BuildingRecord,
  kind: CatalystId,
) => { readonly x: number; readonly y: number } | null;

/** Tiene rotte e firma di invalidazione fra un frame e l'altro. */
export class TrafficCoordinator {
  private routes: readonly TrafficRoute[] = [];
  private rides: readonly RopewayRide[] = [];
  private routeKey = '';
  private routeStamp = -1;
  private waterEpoch = 0;
  private harborWorks = 0;
  private queuesBusy = false;

  constructor(
    private readonly builder: Builder,
    private readonly map: TerrainMap,
    private readonly world: VoxelWorld,
    private readonly catalystAt: CatalystAt,
  ) {}

  /** Dopo restore il registry cambia senza cambiare necessariamente la firma. */
  invalidate(): void {
    this.routeKey = '';
    this.routeStamp = -1;
  }

  poses(state: SimState, clock: number): readonly VehiclePose[] {
    this.sync(state);
    return posesAt(this.routes, clock);
  }

  puffs(state: SimState, clock: number): readonly SmokePuff[] {
    this.sync(state);
    return puffsAt(this.routes, clock);
  }

  wake(state: SimState, clock: number): readonly WakeMark[] {
    this.sync(state);
    return wakeAt(this.routes, clock);
  }

  private sync(state: SimState): void {
    const rides = this.builder.ropewayRides;
    // La quota cambia a scaglioni; il numero di mezzi e' gia' quantizzato.
    const skyline = this.builder.registry.count >> 6;
    const fleets = this.fleets(state);
    let stages = 0;
    for (const catalyst of state.catalysts) stages += catalyst.strength;
    const stamp = this.builder.registry.landmarkCount * 1024 + state.catalysts.length
      + skyline * 1_048_576 + (fleets.cargo * 8 + fleets.ferry) * 1_073_741_824
      + stages * 68_719_476_736 + this.settleWater() * 274_877_906_944;
    if (stamp === this.routeStamp && rides === this.rides) return;
    this.routeStamp = stamp;

    const structures = this.structures(fleets);
    const key = `${skyline}|${structures
      .map((item) => `${item.id}@${item.cx},${item.cy}:${item.facing}:${item.form ?? 'ground'}`
        + `:${item.fleet ?? 1}:${item.stage ?? 0}@${item.x},${item.y}`)
      .join('|')}`;
    if (key === this.routeKey && rides === this.rides) return;
    this.routeKey = key;
    this.rides = rides;
    this.routes = [
      ...planTraffic(
        structures,
        (x, y) => this.isOpenWater(x, y),
        (x, y) => this.ceilingAt(x, y),
      ),
      ...planRopewayRoutes(rides),
    ];
  }

  /** La rotta scavalca sia i record sia il terreno. */
  private ceilingAt(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const ground = this.map.has(cx, cy) ? this.map.heightAt(cx, cy) : 0;
    return Math.max(this.builder.registry.supportAt(cx, cy).z, ground);
  }

  /** Il bioma non vede i bacini scavati, e non si naviga fuori dal mondo caricato. */
  private isOpenWater(x: number, y: number): boolean {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (!this.map.has(cx, cy)) return false;
    if (this.map.biomeAt(cx, cy) === BIOME.ocean) return true;
    return this.world.getBlock(cx, cy, this.map.waterTopAt(cx, cy) - 1) === WATER_IDS.surface;
  }

  /** Il mare cambia per le rotte solo dopo che le opere accodate sono comparse. */
  private settleWater(): number {
    const works = this.builder.harborWorks;
    const busy = this.builder.stats.growing > 0 || this.builder.stats.surfaceQueued > 0;
    if (this.queuesBusy && !busy && works !== this.harborWorks) {
      this.harborWorks = works;
      this.waterEpoch++;
    }
    this.queuesBusy = busy;
    return this.waterEpoch;
  }

  private fleets(state: SimState): { readonly cargo: number; readonly ferry: number } {
    const trade = state.trade;
    return {
      cargo: fleetOf(trade.food + trade.materials + trade.materialsIn, TRAFFIC.cargoFullLoad),
      ferry: fleetOf(state.population.stock, TRAFFIC.ferryFullLoad),
    };
  }

  private structures(
    fleets: { readonly cargo: number; readonly ferry: number },
  ): readonly TrafficStructure[] {
    const out: TrafficStructure[] = [];
    for (const record of this.builder.registry.all) {
      const kind = record.landmark;
      if (kind === undefined) continue;
      const catalyst = this.catalystAt(record, kind);
      if (catalyst === null) continue;
      const column = landmarkWaterColumn(
        kind,
        (record.facing ?? 0) as Facing,
        record.x,
        record.y,
        record.landmarkForm,
        record.level,
      );
      out.push({
        id: record.id,
        kind,
        class: record.class,
        cx: catalyst.x,
        cy: catalyst.y,
        x: record.x,
        y: record.y,
        facing: (record.facing ?? 0) as Facing,
        z: record.baseZ,
        form: record.landmarkForm,
        stage: record.level,
        waterZ: record.waterZ
          ?? (column === null ? undefined : this.map.waterTopAt(column.x, column.y)),
        fleet: kind === 'port' ? fleets.cargo : kind === 'ferry' ? fleets.ferry : undefined,
      });
    }
    return out;
  }
}
