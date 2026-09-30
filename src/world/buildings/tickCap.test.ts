import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addCatalyst, createSimState, tick } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import { BUILDER } from './config';

/**
 * Il tetto al tick visto dal `Builder`: l'infornata si ferma sul budget, riprende
 * al tick dopo, e la citta' non se ne accorge.
 *
 * Il calendario e la coda si verificano con passate finte in
 * `passSchedule.test.ts`; qui c'e' la parte che le passate finte non hanno — la
 * ricerca del lotto sospesa a meta', il memo che si riallinea, i posti in coda
 * prenotati.
 */

/** Un nucleo che si satura: e' li' che la ricerca costa, e il tetto lavora. */
function grow(budget: number, builds = 40): Builder {
  const world = new VoxelWorld();
  const terrain = testTerrain({ chunksX: 4, chunksY: 4, height: 24 });
  const builder = new Builder(world, terrain, 1337);
  let state = addCatalyst(createSimState(), {
    x: 64,
    y: 64,
    class: BUILDING_CLASS.residential,
    strength: 255,
    radius: 48,
  });
  for (let i = 0; i < builds * BUILDER.ticksPerBuild; i++) {
    state = tick(state, terrain);
    state = builder.onTick(state, budget);
    while (builder.stats.growing > 0) builder.step();
  }
  return builder;
}

/**
 * Di quanto un giro puo' passare il tetto: il metro si guarda fra un quadrato e
 * l'altro, quindi il quadrato in lettura e la posa dell'edificio trovato
 * arrivano dopo il controllo. Misurato su questa fixture: 60 letture.
 */
const OVERSHOOT = 500;
const BUDGET = BUILDER.workPerTick;

describe('il tetto al tick nel Builder', () => {
  it('l infornata si ferma sul budget, e nessun giro lo supera', () => {
    const builder = grow(BUDGET);
    const build = builder.profile.readings().find((reading) => reading.name === 'build')!;

    // Quaranta infornate: se i giri fossero quaranta, non si sarebbe mai fermata.
    expect(build.calls).toBeGreaterThan(40);
    expect(build.maxWork.budgetWork).toBeLessThanOrEqual(BUDGET + OVERSHOOT);
  }, 120_000);

  it('senza tetto la stessa infornata lavora molte volte il tetto in un giro solo', () => {
    // E' cio' che rende significativo il test sopra: su una fixture in cui
    // l'infornata stesse gia' sotto il tetto, il tetto non proverebbe niente.
    // Misurato: 66.000 letture nel giro peggiore.
    const builder = grow(Number.POSITIVE_INFINITY);
    const build = builder.profile.readings().find((reading) => reading.name === 'build')!;
    expect(build.calls).toBe(40);
    expect(build.maxWork.budgetWork).toBeGreaterThan(8 * BUDGET);
  }, 120_000);

  it('la citta non rallenta piu di quanto il suo costo imponga', () => {
    // **Questo nucleo e' il caso peggiore, e lo e' apposta.** Saturo su una
    // fixture piatta, qui un'infornata costa in media 28.500 letture, sette volte il
    // tetto: nessun calendario puo' farle stare tutte nel loro giro, e la citta'
    // cresce del 10% piu' piano — misurato, 71 edifici contro 80. Sulla citta'
    // della 6.2, dove un'infornata costa 16.000 letture, il ritmo e' identico:
    // 268 contro 268. Sotto l'85% vorrebbe dire che il tetto costa ritmo anche
    // dove il lavoro ci starebbe, ed e' il difetto che prenotazioni e recupero
    // dei giri esistono per togliere.
    const capped = grow(BUDGET).stats.placed;
    const free = grow(Number.POSITIVE_INFINITY).stats.placed;
    expect(capped).toBeGreaterThanOrEqual(Math.floor(free * 0.85));
  }, 240_000);
});
