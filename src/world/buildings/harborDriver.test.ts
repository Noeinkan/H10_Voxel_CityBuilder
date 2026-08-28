import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  addCatalyst,
  createSimState,
  tick,
  type SimState,
} from '../../sim';
import { catalystById } from '../../sim/catalysts';
import { testTerrain } from '../../sim/testTerrain';
import { GRADING } from '../grading/config';
import { HARBOR, HARBOR_ROLES } from '../harbor/config';
import { planHarborDistrict } from '../harbor/plan';
import { landmarkOf } from '../landmarks/config';
import { TERRAIN, WATER_IDS } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';
import { FACING, type Facing } from '../streets/streetGrid';
import { StreetNetwork } from '../streets/StreetNetwork';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import { BuildingRegistry, type BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { BUILDER } from './config';
import { GrowthQueue } from './growthQueue';
import { HarborDriver } from './harborDriver';
import { SurfaceQueue } from './surfaceQueue';

/**
 * Il distretto costiero arriva nel mondo: scavi, colmate, passeggiata e
 * edifici di settore.
 *
 * **Due livelli di verifica, come per il bacino della marina.** Il driver
 * da solo, su un contesto composto a mano, dice che i voxel giusti atterrano
 * nei punti giusti — canale allagato, sponda in muratura, frangiflutti col
 * suo cappello — e che le colonne scavate sono prenotate contro la crescita.
 * Il Builder completo dice che la macchina gira davvero: lo stadio del
 * landmark trascina il distretto, e il sito di settore diventa un edificio
 * con la tipologia del posto.
 *
 * **Il vincolo che questi test difendono e' il confine.** Il distretto e'
 * contenuto per costruzione — l'anello dichiarato, le misure dichiarate —
 * e niente di cio' che esce dal driver deve valicare quel confine: se un
 * giorno un canale si allunga da solo, e' qui che lo si scopre.
 */

// --- Il driver da solo -------------------------------------------------------

const LAKE = TERRAIN.seaLevel + 16;

/** Lago in quota: riva emersa a ovest, conca a est, con il proprio pelo. */
function lakeLand(): TerrainMap {
  return testTerrain({
    chunksX: 6,
    chunksY: 6,
    heightAt: (x) => (x < 64 ? LAKE + 4 : LAKE - 2),
    slopeAt: () => 0.1,
    waterTopAt: (x) => (x < 64 ? TERRAIN.seaLevel : LAKE),
  });
}

/** Contesto composto a mano: le stesse sei voci che il Builder da' ai driver. */
function contextAt(terrain: TerrainMap): {
  ctx: BuildContext;
  world: VoxelWorld;
  registry: BuildingRegistry;
  growth: GrowthQueue;
  surface: SurfaceQueue;
} {
  const world = new VoxelWorld();
  const registry = new BuildingRegistry();
  const streets = new StreetNetwork(4242);
  const growth = new GrowthQueue(world);
  const surface = new SurfaceQueue(world, terrain, streets, registry);
  return {
    ctx: { world, terrain, streets, registry, growth, surface, seed: 4242 },
    world,
    registry,
    growth,
    surface,
  };
}

function marinaRecord(level: number, waterZ: number): Omit<BuildingRecord, 'id'> {
  return {
    x: 40,
    y: 40,
    baseZ: LAKE - 2,
    footprint: 16,
    footprintY: 12,
    height: 14,
    class: BUILDING_CLASS.civic,
    level,
    seed: 4242,
    landmark: 'marina',
    facing: FACING.east,
    waterZ,
  };
}

/** Drena le due code finche' non resta niente da far comparire. */
function settlePieces(growth: GrowthQueue, surface: SurfaceQueue): void {
  let guard = 0;
  while ((growth.queued > 0 || surface.queued > 0) && guard++ < 20000) {
    growth.step();
    surface.step();
  }
}

describe('il driver del distretto costiero', () => {
  it('scava i canali, li allaga e ne mura le sponde, sul pelo della conca', () => {
    const { ctx, world, registry, growth, surface } = contextAt(lakeLand());
    registry.add(marinaRecord(3, LAKE));
    const driver = new HarborDriver(ctx);

    driver.pass();
    settlePieces(growth, surface);

    // Il canale di nord: colonne scavate nella riva emersa, allagate al pelo
    // della conca, con la terra di sopra tolta.
    const floor = LAKE - HARBOR.canalDepth;
    expect(world.getBlock(40, 55, floor)).toBe(WATER_IDS.surface);
    expect(world.getBlock(40, 55, floor + 1)).toBe(WATER_IDS.surface);
    expect(world.getBlock(40, 55, LAKE)).toBe(0);
    expect(world.getBlock(40, 55, LAKE + 3)).toBe(0);

    // La sponda in muratura sale dal fondo a un voxel sopra il pelo.
    expect(world.getBlock(40, 53, floor)).toBe(GRADING.quayWall);
    expect(world.getBlock(40, 53, floor + 1)).toBe(GRADING.quayWall);
    expect(world.getBlock(40, 53, LAKE)).toBe(GRADING.quayWall);
    expect(world.getBlock(40, 53, LAKE + 1)).toBe(0);

    // Le colonne scavate sono prenotate contro la crescita; la sponda no:
    // la casa sul canale e' il punto del distretto.
    expect(registry.isOccupied(40, 55)).toBe(true);
    expect(registry.isOccupied(40, 53)).toBe(false);
  });

  it('allarga l insenatura con l anello e chiude il frangiflutti staccato', () => {
    const { ctx, world, registry, growth, surface } = contextAt(lakeLand());
    registry.add(marinaRecord(3, LAKE));
    const driver = new HarborDriver(ctx);

    driver.pass();
    settlePieces(growth, surface);

    // L'insenatura davanti alla struttura: scavata e allagata al pelo.
    expect(world.getBlock(58, 45, LAKE - 1)).toBe(WATER_IDS.surface);
    expect(world.getBlock(58, 45, LAKE)).toBe(0);

    // Il frangiflutti: corpo di pietra e cappello sopra il pelo, staccato
    // dall'insenatura che protegge.
    expect(world.getBlock(65, 45, LAKE)).toBe(HARBOR.fillBody);
    expect(world.getBlock(65, 45, LAKE + 1)).toBe(HARBOR.fillCap);
  });

  it('dipinge la passeggiata sulla fascia nuova e lascia i canali scoperti', () => {
    const { ctx, world, growth, surface } = contextAt(lakeLand());
    ctx.registry.add(marinaRecord(3, LAKE));
    const driver = new HarborDriver(ctx);

    driver.pass();
    settlePieces(growth, surface);

    // Qualche colonna asciutta della fascia d'anello porta il calpestio del
    // distretto — non si conta *quale* colonna, perche' la maglia stradale
    // se ne dipinge alcune a priorita' superiore, ma la fascia non e' vuota.
    let painted = 0;
    for (let py = 32; py <= 60; py++) {
      for (let px = 32; px <= 64; px++) {
        if (world.getBlock(px, py, LAKE + 3) === HARBOR.promenadePalette) painted++;
      }
    }
    expect(painted).toBeGreaterThan(0);

    // Dentro il canale il calpestio non c'e': lo scavo vince sulla pittura.
    expect(world.getBlock(40, 55, LAKE + 3)).toBe(0);
  });

  it('accoda gli slot di settore in ordine di stadio e li consegna a richiesta', () => {
    const { ctx, registry } = contextAt(lakeLand());
    registry.add(marinaRecord(3, LAKE));
    const driver = new HarborDriver(ctx);

    driver.pass();
    expect(driver.pending).toBe(HARBOR_ROLES.marina!.sitesByStage[3]);

    const first = driver.drainSites(2);
    expect(first).toHaveLength(2);
    expect(first[0].class).toBe(BUILDING_CLASS.residential);
    expect(first[1].class).toBe(BUILDING_CLASS.commercial);
    expect(driver.pending).toBe(3);

    expect(driver.drainSites(10)).toHaveLength(3);
    expect(driver.pending).toBe(0);
  });
});

// --- Il Builder completo -----------------------------------------------------

// Sotto `beachMaxHeight`: la terra emersa resta bioma piano, e gli edifici
// ordinari del vicinato ci si posano — sopra, la classificazione la chiama
// roccia e `surveyGrade` la rifiuta.
const DRY = TERRAIN.beachMaxHeight - 4;
const SHELF = TERRAIN.seaLevel - 1;

/** Costa con un bassofondo largo, su cui la marina si posa e il distretto scava. */
function shelfCoast(): TerrainMap {
  return testTerrain({
    chunksX: 8,
    chunksY: 8,
    heightAt: (x) => {
      if (x < 96) return DRY;
      if (x < 116) return SHELF;
      return TERRAIN.seaLevel - 6;
    },
  });
}

function marinaOf(builder: Builder): BuildingRecord {
  for (const record of builder.registry.all) {
    if (record.landmark === 'marina') return record;
  }
  throw new Error('marina non piazzata');
}

function settle(builder: Builder): void {
  let guard = 0;
  while ((builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) && guard++ < 20000) {
    builder.step();
  }
}

describe('il distretto dentro il Builder', () => {
  it('lo stadio del landmark trascina il distretto, e il sito di settore nasce con la sua tipologia', () => {
    const terrain = shelfCoast();
    const world = new VoxelWorld();
    const builder = new Builder(world, terrain, 4242);
    builder.placeLandmark(84, 96, 'marina');
    settle(builder);

    const record = marinaOf(builder);
    expect(record.level).toBe(0);
    const definition = catalystById('marina');
    const recipe = landmarkOf('marina')!;

    let state: SimState = addCatalyst(createSimState(), {
      x: 84,
      y: 96,
      class: definition.class,
      kind: 'marina',
      strength: 255,
      radius: definition.radius,
    });

    // Vicini a ovest del fronte: fanno scattare gli stadi senza cadere ne'
    // sulla struttura ne' sui futuri canali.
    const neighbours: { x: number; y: number }[] = [];
    for (let d = 8; d <= 80 && neighbours.length < 24; d += 8) {
      for (const dy of [0, -16, 16, 32]) {
        const x = 84 - d;
        const y = 96 + dy;
        const before = builder.registry.count;
        builder.materialize([{ x, y, class: BUILDING_CLASS.residential }]);
        if (builder.registry.count > before) neighbours.push({ x, y });
      }
    }
    expect(neighbours.length).toBeGreaterThanOrEqual(recipe.stages[2]);

    // Avanza finche' il quartiere ha meritato lo stadio due: l'insenatura e
    // i canali del distretto sono nel piano.
    let guard = 0;
    while (marinaOf(builder).level < 2 && guard++ < 400) {
      state = tick(state, terrain);
      state = { ...state, tickCount: BUILDER.ticksPerUpgrade };
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    expect(marinaOf(builder).level).toBeGreaterThanOrEqual(2);
    settle(builder);

    // L'insenatura davanti alla struttura: il bassofondo scende al fondo
    // scavato, l'acqua lo riempie, e la colonna e' prenotata alla crescita.
    const inletX = record.x + 17;
    const inletY = record.y + 6;
    expect(terrain.heightAt(inletX, inletY)).toBe(SHELF);
    expect(builder.registry.isOccupied(inletX, inletY)).toBe(true);
    expect(world.getBlock(inletX, inletY, TERRAIN.seaLevel - 2)).toBe(WATER_IDS.surface);
    expect(world.getBlock(inletX, inletY, TERRAIN.seaLevel)).toBe(0);

    // Il canale di nord scava la riva emersa e la allaga al pelo.
    const canalX = record.x - 4;
    const canalY = record.y + 15;
    expect(terrain.heightAt(canalX, canalY)).toBe(DRY);
    expect(world.getBlock(canalX, canalY, TERRAIN.seaLevel - 2)).toBe(WATER_IDS.surface);
    expect(world.getBlock(canalX, canalY, TERRAIN.seaLevel)).toBe(0);

    // Gli slot di settore sbloccati diventano edifici con la tipologia del
    // posto: la casa sul canale nasce accanto allo slot che il piano ha
    // riservato — il rivolo del distretto passa dalla macchina ordinaria.
    const slotPlan = planHarborDistrict({
      kind: 'marina',
      facing: (record.facing ?? FACING.east) as Facing,
      x: record.x,
      y: record.y,
      stage: 1,
      waterZ: record.waterZ ?? TERRAIN.seaLevel,
      seed: record.seed,
    }, terrain);
    expect(slotPlan.sites).toHaveLength(1);
    const slot = slotPlan.sites[0];
    const grown = [...builder.registry.all].find((candidate) =>
      candidate.typology === 'canalHouse' &&
      Math.abs(candidate.x - slot.x) <= 6 &&
      Math.abs(candidate.y - slot.y) <= 6);
    expect(grown).toBeDefined();
  });
});
