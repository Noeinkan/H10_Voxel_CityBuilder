import { describe, expect, it } from 'vitest';
import { GROWTH_PASSES, growthPassTick } from './growthCadence';
import {
  PassScheduler,
  WorkMeter,
  isDue,
  nextDueTick,
  staggerOffsets,
  type PassCadence,
  type ScheduledPass,
} from './passSchedule';

/**
 * Il calendario si verifica con passate finte: un nome, un periodo, un lavoro
 * che alza un contatore. Niente mondo e niente simulazione — lo stato e' la
 * lista di chi ha girato.
 */

function coincidences(cadences: readonly PassCadence[], offsets: ReadonlyMap<string, number>, span: number) {
  const perTick: string[][] = [];
  for (let t = 0; t < span; t++) {
    perTick.push(cadences
      .filter((cadence) => isDue(t, cadence.period, offsets.get(cadence.name)!))
      .map((cadence) => cadence.name));
  }
  return perTick;
}

describe('staggerOffsets', () => {
  it('separa le passate dello stesso periodo', () => {
    const cadences = [
      { name: 'a', period: 10 },
      { name: 'b', period: 10 },
      { name: 'c', period: 10 },
    ];
    const offsets = staggerOffsets(cadences);
    for (const names of coincidences(cadences, offsets, 60)) expect(names.length).toBeLessThanOrEqual(1);
  });

  it('tiene lontane le care anche quando l avido le avrebbe fatte incontrare', () => {
    // Periodo 24 contro due periodi 10: si incontrano se lo sfasamento ha la
    // stessa parita', quindi i due da 10 devono averla uguale fra loro.
    const cadences = [
      { name: 'build', period: 10, heavy: true },
      { name: 'upgrades', period: 10, heavy: true },
      { name: 'routes', period: 24, heavy: true },
    ];
    const offsets = staggerOffsets(cadences);
    for (const names of coincidences(cadences, offsets, 120)) expect(names.length).toBeLessThanOrEqual(1);
  });

  it('chi condivide il tick cade sempre insieme al compagno', () => {
    const cadences = [
      { name: 'arcologies', period: 20, anchor: { pass: 'upgrades', lag: 0 } },
      { name: 'upgrades', period: 10 },
      { name: 'build', period: 10 },
    ];
    const offsets = staggerOffsets(cadences);
    for (const names of coincidences(cadences, offsets, 200)) {
      if (names.includes('arcologies')) expect(names).toContain('upgrades');
    }
  });

  it('a ritardo positivo la legata cade sempre quei tick dopo il compagno', () => {
    const cadences = [
      { name: 'build', period: 10, heavy: true },
      { name: 'upgrades', period: 10, heavy: true, anchor: { pass: 'build', lag: 2 } },
    ];
    const offsets = staggerOffsets(cadences);
    const perTick = coincidences(cadences, offsets, 100);
    for (let t = 2; t < 100; t++) {
      if (perTick[t].includes('upgrades')) expect(perTick[t - 2]).toContain('build');
    }
  });

  it('rifiuta un tavolo che non puo mantenere l ordine', () => {
    expect(() => staggerOffsets([
      { name: 'a', period: 15, anchor: { pass: 'b', lag: 0 } },
      { name: 'b', period: 10 },
    ])).toThrow(/multiple/);
    expect(() => staggerOffsets([
      { name: 'b', period: 10 },
      { name: 'a', period: 20, anchor: { pass: 'b', lag: 0 } },
    ])).toThrow(/before/);
    expect(() => staggerOffsets([
      { name: 'a', period: 10, anchor: { pass: 'b', lag: 1 } },
      { name: 'b', period: 10, anchor: { pass: 'a', lag: 1 } },
    ])).toThrow(/cycle/);
  });

  it('e deterministico', () => {
    expect([...staggerOffsets(GROWTH_PASSES)]).toEqual([...staggerOffsets(GROWTH_PASSES)]);
  });
});

describe('il calendario del Builder', () => {
  it('le passate care non girano mai nello stesso tick', () => {
    const offsets = staggerOffsets(GROWTH_PASSES);
    const heavy = GROWTH_PASSES.filter((cadence) => cadence.heavy === true);
    for (const names of coincidences(heavy, offsets, 1200)) expect(names.length).toBeLessThanOrEqual(1);
  });

  it('nessun tick porta piu di due passate', () => {
    // Prima dello sfasamento, al tick 120 ne cadevano undici.
    const offsets = staggerOffsets(GROWTH_PASSES);
    const worst = Math.max(...coincidences(GROWTH_PASSES, offsets, 1200).map((names) => names.length));
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('growthPassTick indica un tick in cui la passata gira', () => {
    const offsets = staggerOffsets(GROWTH_PASSES);
    for (const cadence of GROWTH_PASSES) {
      const tick = growthPassTick(cadence.name, 37);
      expect(tick).toBeGreaterThanOrEqual(37);
      expect(tick).toBeLessThan(37 + cadence.period);
      expect(isDue(tick, cadence.period, offsets.get(cadence.name)!)).toBe(true);
    }
    expect(nextDueTick(20, 10, 0)).toBe(20);
  });
});
interface FakePass {
  readonly name: string;
  readonly period: number;
  readonly cost: number;
  /** Giri che servono per finire: piu' di uno e' una passata che si ferma sul budget. */
  readonly slices?: number;
  readonly anchor?: { readonly pass: string; readonly lag: number };
}

/**
 * Un calendario di passate finte che costano `cost` letture a giro. Il registro
 * scrive il nome a ogni giro, e `nome!` quando la passata ha finito.
 */
function harness(passes: readonly FakePass[]) {
  let work = 0;
  const log: string[] = [];
  const left = new Map(passes.map((pass) => [pass.name, pass.slices ?? 1]));
  const scheduled: ScheduledPass<number>[] = passes.map((pass) => ({
    name: pass.name,
    period: pass.period,
    anchor: pass.anchor,
    run: (state) => {
      work += pass.cost;
      const remaining = left.get(pass.name)! - 1;
      const done = remaining === 0;
      left.set(pass.name, done ? pass.slices ?? 1 : remaining);
      log.push(done ? `${pass.name}!` : pass.name);
      return { state: state + 1, done };
    },
  }));
  const scheduler = new PassScheduler(scheduled);
  const meter = new WorkMeter(() => work);
  const tick = (tickCount: number, budget: number): readonly string[] => {
    log.length = 0;
    meter.begin(budget);
    scheduler.tick(0, tickCount, meter);
    return [...log];
  };
  return { scheduler, tick };
}

describe('PassScheduler', () => {
  it('con budget largo fa girare le dovute nell ordine del tavolo', () => {
    const { tick, scheduler } = harness([
      { name: 'a', period: 1, cost: 10 },
      { name: 'b', period: 1, cost: 10 },
    ]);
    expect(tick(0, Infinity)).toEqual(['a!', 'b!']);
    expect(scheduler.pending).toEqual([]);
  });

  // Periodo cento e tick zero per tutte: lo sfasamento le sposta, quindi i test
  // che vogliono tre passate dovute insieme le legano a ritardo zero.
  it('a budget speso ferma la coda e riprende dalla successiva al tick dopo', () => {
    const { tick, scheduler } = harness([
      { name: 'a', period: 100, cost: 50, anchor: { pass: 'c', lag: 0 } },
      { name: 'b', period: 100, cost: 50, anchor: { pass: 'c', lag: 0 } },
      { name: 'c', period: 100, cost: 50 },
    ]);
    const start = firstDue(scheduler, 'c');
    expect(tick(start, 60)).toEqual(['a!', 'b!']);
    expect(scheduler.pending).toEqual(['c']);
    expect(tick(start + 1, 60)).toEqual(['c!']);
    expect(scheduler.pending).toEqual([]);
  });

  it('almeno una passata per tick, anche piu cara del budget', () => {
    const { tick, scheduler } = harness([
      { name: 'a', period: 100, cost: 500, anchor: { pass: 'b', lag: 0 } },
      { name: 'b', period: 100, cost: 500 },
    ]);
    const start = firstDue(scheduler, 'b');
    expect(tick(start, 0)).toEqual(['a!']);
    expect(tick(start + 1, 0)).toEqual(['b!']);
  });

  it('chi si ferma sul budget va in fondo, ma non scavalca chi e legato a lui', () => {
    // «a» ha bisogno di tre giri. «b», dovuta insieme, costa quasi niente e non
    // deve aspettarli tutti. «c» deve girare dopo entrambe nello stesso tick:
    // aspetta «a» anche quando «a» si prende tre tick.
    const { tick, scheduler } = harness([
      { name: 'a', period: 100, cost: 100, slices: 3, anchor: { pass: 'c', lag: 0 } },
      { name: 'b', period: 100, cost: 1, anchor: { pass: 'c', lag: 0 } },
      { name: 'c', period: 100, cost: 1 },
    ]);
    const start = firstDue(scheduler, 'c');
    expect(tick(start, 10)).toEqual(['a']);
    expect(scheduler.pending).toEqual(['b', 'c', 'a']);
    expect(tick(start + 1, 10)).toEqual(['b!', 'a']);
    expect(tick(start + 2, 10)).toEqual(['a!']);
    expect(tick(start + 3, 10)).toEqual(['c!']);
    expect(scheduler.pending).toEqual([]);
  });

  it('un giro saltato si recupera appena la passata finisce', () => {
    // Cinque giri di lavoro, dovuta ogni due tick: il giro del tick 2 cade mentre
    // e' ancora in coda. Senza recupero la seconda ripartirebbe al tick 6, il
    // prossimo in cui e' dovuta; con il recupero riparte subito, al 5.
    const { tick, scheduler } = harness([{ name: 'a', period: 2, cost: 100, slices: 5 }]);
    const done: number[] = [];
    for (let t = 0; t < 10; t++) {
      if (tick(t, 10).includes('a!')) done.push(t);
      expect(scheduler.pending.length).toBeLessThanOrEqual(1);
    }
    expect(done).toEqual([4, 9]);
  });

  it('clear svuota coda e debiti', () => {
    const { tick, scheduler } = harness([{ name: 'a', period: 1, cost: 100, slices: 3 }]);
    tick(0, 10);
    tick(1, 10);
    scheduler.clear();
    expect(scheduler.pending).toEqual([]);
    expect(tick(2, 10)).toHaveLength(1);
  });
});

/** Il primo tick in cui la passata finta cade, con lo sfasamento che le e' toccato. */
function firstDue(scheduler: PassScheduler<number>, name: string): number {
  const offset = scheduler.offsets.get(name)!;
  return nextDueTick(0, 100, offset);
}
