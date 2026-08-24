import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addCatalyst, createSimState, tick } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { StreetNetwork } from '../streets/StreetNetwork';
import { Builder } from './Builder';
import { BUILDER } from './config';
import type { BuildingRecord } from './BuildingRegistry';
import { styleAt } from './style';

/**
 * Lo stile visto dal capo del Builder: non la regola, ma cio' che finisce nei
 * record di una citta' vera.
 *
 * Vive fuori da `Builder.test.ts` perche' quel file e' a milleottocento righe ed
 * e' il piu' conteso del progetto: la fixture che serve qui e' una collina
 * piatta e un catalizzatore, non le sue macchine per costa, quota e sventramento.
 */

const SEED = 1337;

/** Solo edifici veri: landmark, campate e citta' in quota non hanno uno stile. */
function buildingsOf(builder: Builder): readonly BuildingRecord[] {
  return [...builder.registry.all].filter((record) =>
    record.landmark === undefined && record.span === undefined && record.aerial === undefined);
}

function grow(builds: number): { builder: Builder; records: readonly BuildingRecord[] } {
  const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
  const world = new VoxelWorld();
  const builder = new Builder(world, terrain, SEED);

  let state = createSimState();
  // Tre mercati sovrapposti: e' la stessa ragione di `denseCity` in
  // `Builder.test.ts` — un catalizzatore solo non porta la densita' abbastanza in
  // alto perche' la citta' si infittisca, e con pochi edifici sparsi la
  // coerenza d'isolato non si misura.
  for (const [x, y] of [[100, 100], [120, 100], [110, 120]] as const) {
    state = addCatalyst(state, {
      x, y, kind: 'market', class: BUILDING_CLASS.commercial, strength: 255, radius: 60,
    });
  }

  for (let i = 0; i < builds * BUILDER.ticksPerBuild; i++) {
    state = tick(state, terrain);
    state = builder.onTick(state);
    while (builder.stats.growing > 0) builder.step();
  }
  while (builder.stats.surfaceQueued > 0) builder.step();

  return { builder, records: buildingsOf(builder) };
}

describe('lo stile arriva ai record', () => {
  it('ogni edificio nasce con uno stile registrato', () => {
    // Senza il campo sul record, `recordStamp` rigenererebbe la sagoma con il
    // tessuto neutro e la cancellazione lascerebbe voxel orfani.
    const { records } = grow(40);
    expect(records.length).toBeGreaterThan(20);
    for (const record of records) {
      expect(record.style, `${record.x},${record.y}`).toBeDefined();
    }
  });

  it('gli edifici di uno stesso isolato portano lo stesso stile', () => {
    // E' la proprieta' per cui la fase esiste, misurata dove conta: non sulla
    // funzione pura, ma sui record che la citta' ha davvero scritto.
    const { records } = grow(40);
    const streets = new StreetNetwork(SEED);
    const byBlock = new Map<string, string>();

    for (const record of records) {
      const block = streets.blockAt(record.x, record.y);
      const key = `${block.kx},${block.ky}`;
      const seen = byBlock.get(key);
      if (seen === undefined) byBlock.set(key, record.style as string);
      else expect(record.style, `isolato ${key}`).toBe(seen);
    }

    expect(byBlock.size).toBeGreaterThan(1);
  });

  it('lo stile del record e quello che la regola dice per quell isolato', () => {
    // Il record non deve poter divergere dalla funzione pura: se divergesse,
    // sarebbe uno stato — e questa fase esiste per non averne uno.
    const { records } = grow(40);
    const streets = new StreetNetwork(SEED);
    for (const record of records) {
      const expected = styleAt(SEED, streets.blockAt(record.x, record.y)).id;
      expect(record.style, `${record.x},${record.y}`).toBe(expected);
    }
  });

  it('una citta abbastanza larga mostra piu di un tessuto', () => {
    // Una tabella che a schermo dà sempre lo stesso quartiere non si distingue
    // da nessuna tabella.
    const { records } = grow(40);
    expect(new Set(records.map((record) => record.style)).size).toBeGreaterThan(1);
  });
});
