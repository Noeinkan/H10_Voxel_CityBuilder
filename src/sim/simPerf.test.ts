import { describe, expect, it } from 'vitest';
import type { BuildingClass } from './classes';
import { addBuilding, addCatalyst, createSimState, type SimState } from './SimState';
import { testTerrain } from './testTerrain';
import { tick } from './tick';

/**
 * Il criterio di costo del tick.
 *
 * La misura e' una media su molti tick, non un singolo campione: un tick da solo
 * dura molto meno della risoluzione dell'orologio, e il primo paga la
 * compilazione JIT. La soglia e' quella della specifica, 3 ms; il valore vero
 * sta a diversi ordini di grandezza sotto, ed e' cosi' per costruzione — il tick
 * legge tre contatori di edifici e un contatore di colonne edificabili, non
 * scorre ne' la mappa ne' il campo.
 */

const MAP_SIDE_CHUNKS = 8; //  8 x 32 = 256 celle di lato
const CATALYSTS = 50;
const BUILDINGS = 400;
const TICK_BUDGET_MS = 3;

function cityOf256(): SimState {
  let state = createSimState();

  // Catalizzatori sparsi con un passo primo rispetto al lato: si distribuiscono
  // senza allinearsi ai bordi di chunk.
  for (let i = 0; i < CATALYSTS; i++) {
    state = addCatalyst(state, {
      x: (i * 37) % 250,
      y: (i * 61) % 250,
      class: (i % 3) as BuildingClass,
      strength: 120 + ((i * 13) % 130),
      radius: 12 + (i % 9),
    });
  }

  for (let i = 0; i < BUILDINGS; i++) {
    state = addBuilding(state, {
      x: (i * 7) % 250,
      y: (i * 11) % 250,
      class: (i % 3) as BuildingClass,
    });
  }

  return state;
}

describe('costo del tick', () => {
  it('un tick su 256x256 con 50 catalizzatori sta sotto i 3 ms', () => {
    const terrainMap = testTerrain({ chunksX: MAP_SIDE_CHUNKS, chunksY: MAP_SIDE_CHUNKS });
    let state = cityOf256();

    expect(state.catalysts).toHaveLength(CATALYSTS);
    expect(state.buildings.length).toBeGreaterThan(BUILDINGS / 2);
    expect(state.field.chunkCount).toBeGreaterThan(MAP_SIDE_CHUNKS * MAP_SIDE_CHUNKS - 1);

    // Riscaldamento: il primo tick paga la compilazione.
    for (let i = 0; i < 200; i++) state = tick(state, terrainMap);

    const runs = 5000;
    const start = performance.now();
    for (let i = 0; i < runs; i++) state = tick(state, terrainMap);
    const perTick = (performance.now() - start) / runs;

    expect(perTick).toBeLessThan(TICK_BUDGET_MS);
    expect(state.tickCount).toBe(200 + runs);
  });

  it('il tick non ricalcola nemmeno una cella del campo', () => {
    const terrainMap = testTerrain({ chunksX: MAP_SIDE_CHUNKS, chunksY: MAP_SIDE_CHUNKS });
    let state = cityOf256();
    state.field.resetCounters();

    for (let i = 0; i < 1000; i++) state = tick(state, terrainMap);

    // E' la ragione per cui il costo del tick non dipende dalla mappa.
    expect(state.field.totalRecomputedCells).toBe(0);
  });

  it('il costo del tick non cresce con la mappa', () => {
    const small = testTerrain({ chunksX: 2, chunksY: 2 });
    const large = testTerrain({ chunksX: 32, chunksY: 32 });

    expect(averageTickMs(cityOf256(), small)).toBeLessThan(TICK_BUDGET_MS);
    expect(averageTickMs(cityOf256(), large)).toBeLessThan(TICK_BUDGET_MS);
  });
});

function averageTickMs(state: SimState, terrainMap: ReturnType<typeof testTerrain>): number {
  let current = state;
  for (let i = 0; i < 200; i++) current = tick(current, terrainMap);

  const runs = 2000;
  const start = performance.now();
  for (let i = 0; i < runs; i++) current = tick(current, terrainMap);
  return (performance.now() - start) / runs;
}
