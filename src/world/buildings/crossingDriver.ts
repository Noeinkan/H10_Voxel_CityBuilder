import { BUILDING_CLASS } from '../../sim';
import { CROSSINGS } from '../crossings/config';
import { generateCrossing } from '../crossings/generate';
import {
  CROSSING_HEIGHT,
  crossingBaseZ,
  type CrossingPlan,
  type CrossingProbe,
  type CrossingTower,
} from '../crossings/crossingPlan';
import { chooseSecondaryBridge } from '../crossings/secondaryBridgePlan';
import { dirtyChunkCount } from './chunkBudget';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { MAX_FOOTPRINT } from './config';
import { SPAN_KIND } from '../spans/config';
import { hashCoords } from '../rng';
import type { Region } from '../terrain/region';
import { BIOME } from '../terrain/config';
import { STAMP_EMPTY } from './stamp';
import { traitsOf } from './structureKind';

interface SecondaryRegion {
  readonly id: string;
  readonly region: Region;
  recordId: number | null;
}

/**
 * I ponti automatici fra la citta' primaria e i settori secondari maturi.
 *
 * Il record usa la semantica di una campata — non prende suolo e cade quando
 * cambia uno dei due appoggi — mentre la sagoma viene da `crossings/`, che e'
 * fatta per luci lunghe. Questa distinzione evita un nuovo indice nel registry:
 * dal punto di vista dell'occupazione un ponte in quota lungo e uno corto hanno
 * esattamente lo stesso contratto.
 */
export class CrossingDriver {
  private readonly regions = new Map<string, SecondaryRegion>();
  private readonly probe: CrossingProbe;

  constructor(
    private readonly ctx: BuildContext,
    private readonly primary: Region | null,
  ) {
    this.probe = {
      ground: (x, y) => ctx.terrain.heightAt(x, y),
      land: (x, y) => ctx.terrain.biomeAt(x, y) !== BIOME.ocean,
      occupied: (x, y) => ctx.registry.isOccupied(x, y),
      solid: (x, y, z) => ctx.world.getBlock(x, y, z) !== STAMP_EMPTY,
    };
  }

  /** Un settore si registra quando viene acquistato; il terreno puo' arrivare dopo. */
  register(id: string, region: Region): void {
    if (this.regions.has(id)) return;
    this.regions.set(id, { id, region, recordId: null });
  }

  /** Collegamenti vivi adesso. Una campata caduta non continua a dare il bonus. */
  get count(): number {
    let count = 0;
    for (const entry of this.regions.values()) {
      if (entry.recordId === null) continue;
      if (this.ctx.registry.get(entry.recordId) === null) entry.recordId = null;
      else count++;
    }
    return count;
  }

  /** Costruisce al massimo un ponte: comparsa e costo restano limitati per giro. */
  pass(): void {
    if (this.primary === null) return;

    for (const entry of this.regions.values()) {
      if (entry.recordId !== null && this.ctx.registry.get(entry.recordId) !== null) continue;
      entry.recordId = null;

      const towers = this.towersFor(entry.region);
      const plan = chooseSecondaryBridge({
        primary: this.primary,
        secondary: entry.region,
        towers,
        probe: this.probe,
      });
      if (plan === null) continue;

      const record = this.build(plan);
      if (record === null) continue;
      entry.recordId = record.id;
      return;
    }
  }

  /**
   * Torri del settore e possibili compagni sul bordo primario.
   *
   * Due query locali invece di una scansione della citta' intera: il costo resta
   * legato alla frontiera che puo' davvero coprire `maxLength`, non al numero di
   * edifici che l'isola ha accumulato altrove.
   */
  private towersFor(region: Region): CrossingTower[] {
    const centreX = region.minX + (region.sizeX >> 1);
    const centreY = region.minY + (region.sizeY >> 1);
    const radius = Math.ceil(Math.max(region.sizeX, region.sizeY) / 2) + MAX_FOOTPRINT;
    const busy = this.ctx.growth.busyIds();
    const records = new Map<number, BuildingRecord>();

    for (const record of this.ctx.registry.withinRadius(centreX, centreY, radius)) {
      if (inside(region, record)) records.set(record.id, record);
    }

    const secondary = [...records.values()]
      .filter((record) => canAnchor(record, busy))
      .sort((a, b) => b.height - a.height || a.id - b.id)
      .slice(0, CROSSINGS.automatic.towersPerRegion);

    const reach = CROSSINGS.maxLength + MAX_FOOTPRINT;
    for (const record of secondary) {
      for (const partner of this.ctx.registry.withinRadius(record.x, record.y, reach)) {
        if (!inside(this.primary as Region, partner) || !canAnchor(partner, busy)) continue;
        records.set(partner.id, partner);
      }
    }

    return [...records.values()].filter((record) => canAnchor(record, busy)).map(towerOf);
  }

  private build(plan: CrossingPlan): BuildingRecord | null {
    const baseZ = crossingBaseZ(plan.deckZ);
    if (this.ctx.registry.overlaps(
      plan.x,
      plan.y,
      plan.sizeX,
      baseZ,
      CROSSING_HEIGHT,
      plan.sizeY,
      plan.supports,
    )) return null;

    for (const segment of plan.segments) {
      const dirty = dirtyChunkCount(
        segment.x,
        segment.y,
        segment.sizeX,
        baseZ,
        baseZ + CROSSING_HEIGHT,
        segment.sizeY,
      );
      if (dirty > CROSSINGS.automatic.maxDirtyChunks) return null;
    }

    const record = this.ctx.registry.add({
      x: plan.x,
      y: plan.y,
      baseZ,
      footprint: plan.sizeX,
      footprintY: plan.sizeY,
      height: CROSSING_HEIGHT,
      class: BUILDING_CLASS.civic,
      level: 0,
      seed: hashCoords(this.ctx.seed, plan.x, plan.y),
      // Per il registry e' una campata: non prende suolo e segue i due appoggi.
      span: SPAN_KIND.bridge,
      supports: plan.supports,
    });

    for (const segment of plan.segments) {
      this.ctx.growth.enqueue(
        record.id,
        { x: segment.x, y: segment.y, z: baseZ },
        generateCrossing(plan, segment),
      );
    }
    return record;
  }
}

function inside(region: Region, record: Pick<BuildingRecord, 'x' | 'y'>): boolean {
  return record.x >= region.minX && record.x < region.minX + region.sizeX &&
    record.y >= region.minY && record.y < region.minY + region.sizeY;
}

function canAnchor(record: BuildingRecord, busy: ReadonlySet<number>): boolean {
  if (busy.has(record.id)) return false;
  // La lista di sei esclusioni che stava qui e' la colonna `hostsCrossing`: un
  // ponte fra settori si ancora solo a un edificio ordinario, ed e' la piu'
  // stretta delle tre domande sull'appoggio.
  if (!traitsOf(record).hostsCrossing) return false;
  return record.height >= CROSSINGS.minSkyRise + CROSSINGS.skyDeckDrop + 1;
}

function towerOf(record: BuildingRecord): CrossingTower {
  return {
    id: record.id,
    x: record.x,
    y: record.y,
    sizeX: record.footprint,
    sizeY: footprintDepth(record),
    baseZ: record.baseZ,
    height: record.height,
  };
}
