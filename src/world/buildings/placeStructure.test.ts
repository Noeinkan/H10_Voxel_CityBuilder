import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { StreetNetwork } from '../streets/StreetNetwork';
import { BuildingRegistry } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { GrowthQueue } from './growthQueue';
import {
  placeStructure,
  structureFits,
  wholeFootprint,
  writeStructure,
  type StructureRecord,
} from './placeStructure';
import { SurfaceQueue } from './surfaceQueue';
import { EMPTY_STAMP } from './stamp';

/**
 * Il protocollo di piazzamento, senza un dominio intorno.
 *
 * Un contesto montato a mano invece di un `Builder`: qui non serve una citta',
 * servono un registry e una coda veri per vedere che il record entra e i voxel
 * si accodano. E' anche l'unica copertura diretta della strada a un pezzo solo —
 * quella del montante — che oggi passa da un test rosso per un'altra ragione.
 */
const SEED = 1337;

function context(): BuildContext {
  const world = new VoxelWorld();
  const terrain = testTerrain({ chunksX: 4, chunksY: 4, heightAt: () => 20 });
  const streets = new StreetNetwork(SEED);
  const registry = new BuildingRegistry();
  return {
    world,
    terrain,
    streets,
    registry,
    growth: new GrowthQueue(world),
    surface: new SurfaceQueue(world, terrain, streets, registry),
    seed: SEED,
  };
}

function tower(x: number, y: number): StructureRecord {
  return { x, y, baseZ: 20, footprint: 4, footprintY: 4, height: 10 };
}

function spec(record: StructureRecord, maxDirtyChunks = 64) {
  return { record, maxDirtyChunks, segments: wholeFootprint(record, () => EMPTY_STAMP) };
}

describe('placeStructure', () => {
  it('scrive il record e accoda i voxel', () => {
    const ctx = context();
    const record = placeStructure(ctx, spec(tower(8, 8)));

    expect(record).not.toBeNull();
    expect(ctx.registry.get(record!.id)).not.toBeNull();
    expect(ctx.growth.queued).toBe(1);
  });

  it('mette i tre default che i driver ripetevano a mano', () => {
    const ctx = context();
    const record = placeStructure(ctx, spec(tower(8, 8)))!;

    // Civico e zero: `tally` salta comunque queste strutture, e il campo non
    // entra in nessun istogramma.
    expect(record.class).toBe(BUILDING_CLASS.civic);
    expect(record.level).toBe(0);
    // Il seme viene dalla colonna, quindi due strutture diverse nello stesso
    // punto lo hanno uguale e la stessa struttura altrove no.
    expect(record.seed).toBe(placeStructure(context(), spec(tower(8, 8)))!.seed);
    expect(record.seed).not.toBe(placeStructure(context(), spec(tower(40, 8)))!.seed);
  });

  it('un dominio puo\' dire altro al posto dei default', () => {
    const ctx = context();
    const record = placeStructure(ctx, spec({
      ...tower(8, 8),
      class: BUILDING_CLASS.industrial,
      level: 3,
      seed: 99,
    }))!;

    expect(record.class).toBe(BUILDING_CLASS.industrial);
    expect(record.level).toBe(3);
    expect(record.seed).toBe(99);
  });

  it('rifiuta chi sfora il tetto di chunk, e non scrive niente', () => {
    const ctx = context();
    expect(placeStructure(ctx, spec(tower(8, 8), 0))).toBeNull();
    expect(ctx.registry.count).toBe(0);
    expect(ctx.growth.queued).toBe(0);
  });

  it('rifiuta chi si sovrappone a cio\' che c\'e\' gia\'', () => {
    const ctx = context();
    expect(placeStructure(ctx, spec(tower(8, 8)))).not.toBeNull();
    expect(placeStructure(ctx, spec(tower(8, 8)))).toBeNull();
    expect(ctx.registry.count).toBe(1);
  });

  it('non conta come collisione cio\' a cui la struttura e\' attaccata', () => {
    const ctx = context();
    const host = placeStructure(ctx, spec(tower(8, 8)))!;

    const attached = placeStructure(ctx, {
      ...spec(tower(8, 8)),
      exempt: [host.id],
    });
    expect(attached).not.toBeNull();
  });

  it('genera la sagoma solo dopo aver passato le verifiche', () => {
    const ctx = context();
    let asked = 0;
    const record = tower(8, 8);
    const refused = {
      record,
      maxDirtyChunks: 0,
      segments: [{
        x: record.x,
        y: record.y,
        sizeX: record.footprint,
        sizeY: record.footprint,
        stamp: () => {
          asked++;
          return EMPTY_STAMP;
        },
      }],
    };

    expect(placeStructure(ctx, refused)).toBeNull();
    // **E' la ragione per cui lo stamp e' una funzione.** Con una sagoma gia'
    // pronta ogni struttura rifiutata l'avrebbe pagata per niente.
    expect(asked).toBe(0);
  });
});

describe('structureFits e writeStructure', () => {
  it('verificare tutto e poi scrivere tutto non e\' verificare-e-scrivere', () => {
    const ctx = context();
    const first = spec(tower(8, 8));
    const second = spec(tower(8, 8));

    // I due tempi della funivia: le due torri si guardano prima che ne sia
    // scritta una, quindi entrambe passano anche se occupano lo stesso posto.
    expect(structureFits(ctx, first)).toBe(true);
    expect(structureFits(ctx, second)).toBe(true);

    writeStructure(ctx, first);
    // Adesso la prima c'e', e la stessa domanda risponde di no: e' esattamente
    // la differenza che i due tempi esistono per conservare.
    expect(structureFits(ctx, second)).toBe(false);
  });

  it('writeStructure scrive senza richiedere niente', () => {
    const ctx = context();
    writeStructure(ctx, spec(tower(8, 8)));
    // Sfora il tetto di chunk, e viene scritta lo stesso: la verifica e' di chi
    // chiama, ed e' il contratto che permette i due tempi.
    const forced = writeStructure(ctx, spec(tower(8, 8), 0));

    expect(ctx.registry.get(forced.id)).not.toBeNull();
    expect(ctx.registry.count).toBe(2);
  });
});
