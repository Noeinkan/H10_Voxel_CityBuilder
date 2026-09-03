import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  addCatalyst,
  coverageReportOf,
  createSimState,
  tick,
  type SimState,
} from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import type { BuildingRecord } from './BuildingRegistry';
import { BUILDER } from './config';

/** Gli edifici veri: il registry ospita anche landmark, campate e citta' in quota. */
function buildingsOf(builder: Builder): readonly BuildingRecord[] {
  return [...builder.registry.all].filter((record) =>
    record.landmark === undefined &&
    record.span === undefined &&
    record.aerial === undefined);
}

/** Una citta' cresciuta attorno a un mercato, con la sua popolazione. */
function grownCity(): { builder: Builder; state: SimState } {
  const world = new VoxelWorld();
  const terrain = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
  const builder = new Builder(world, terrain, 1337);
  let state = addCatalyst(createSimState(), {
    x: 60,
    y: 60,
    class: BUILDING_CLASS.residential,
    strength: 255,
    radius: 24,
  });

  for (let i = 0; i < BUILDER.ticksPerBuild * 30; i++) {
    state = tick(state, terrain);
    state = builder.onTick(state);
    while (builder.stats.growing > 0) builder.step();
  }
  return { builder, state };
}

/**
 * Avanza senza `tick`: il fronte e la copertura restano quelli che il test ha
 * messo in mano al driver, invece di essere riscritti dal bilancio a ogni giro.
 */
function drive(builder: Builder, state: SimState, ticks: number): SimState {
  let next = state;
  for (let i = 0; i < ticks; i++) {
    next = { ...next, tickCount: next.tickCount + 1 };
    next = builder.onTick(next);
    while (builder.stats.growing > 0) builder.step();
  }
  return next;
}

/** Nessun servizio da nessuna parte: la quota cittadina e' zero. */
const UNSERVED = coverageReportOf({ population: 1000, civic: 0, funded: 1, services: 0 });

describe('DecayDriver', () => {
  it('a fronte disarmato non porta via niente, per quanto la citta’ sia scoperta', () => {
    const { builder, state } = grownCity();
    const before = buildingsOf(builder).length;
    expect(before).toBeGreaterThan(4);

    const after = drive(
      builder,
      { ...state, decayPressure: 0, coverageReport: UNSERVED },
      BUILDER.ticksPerDecay * 40,
    );

    // Uno scoperto da solo non basta: senza il fronte la citta' continua a
    // crescere, ed e' proprio quello che deve fare finche' il bilancio non
    // dichiara l'affanno. Il numero da guardare e' l'altro.
    expect(builder.stats.abandoned).toBe(0);
    expect(buildingsOf(builder).length).toBeGreaterThanOrEqual(before);
    expect(after.buildings).toHaveLength(buildingsOf(builder).length);
  });

  it('a fronte armato la citta’ arretra, e stato e registro restano d’accordo', () => {
    const { builder, state } = grownCity();
    const before = buildingsOf(builder).length;

    const after = drive(
      builder,
      { ...state, decayPressure: 1, coverageReport: UNSERVED },
      BUILDER.ticksPerDecay * 40,
    );

    expect(buildingsOf(builder).length).toBeLessThan(before);
    // Il difetto che il driver puo' introdurre non e' perdere un edificio: e'
    // perderlo da una parte sola. Un record senza la sua voce nella simulazione
    // mangia cibo che nessuno produce; una voce senza record e' una casa
    // invisibile che continua a contare.
    expect(after.buildings).toHaveLength(buildingsOf(builder).length);
  });

  it('una citta’ in affanno smette di fondare prima di cominciare a perdere', () => {
    const { builder, state } = grownCity();
    const armed = { ...state, decayPressure: 1, coverageReport: UNSERVED };
    const placed = builder.stats.placed;

    drive(builder, armed, BUILDER.ticksPerBuild * 20);

    // `placed` conta i piazzamenti da inizio partita e non scende mai: se la
    // crescita fosse continuata durante l'affanno, sarebbe salito.
    expect(builder.stats.placed).toBe(placed);
  });

  it('il catalizzatore sopravvive al quartiere che gli muore intorno', () => {
    const { builder, state } = grownCity();
    const landmarks = [...builder.registry.all].filter((r) => r.landmark !== undefined).length;

    drive(
      builder,
      { ...state, decayPressure: 1, coverageReport: UNSERVED },
      BUILDER.ticksPerDecay * 40,
    );

    // E' la leva con cui il giocatore risolve: farla sparire proprio mentre
    // serve toglierebbe la risposta insieme al problema.
    expect([...builder.registry.all].filter((r) => r.landmark !== undefined))
      .toHaveLength(landmarks);
  });

  it('una citta’ servita non perde niente nemmeno con il fronte armato', () => {
    const { builder, state } = grownCity();
    const before = buildingsOf(builder).length;

    const after = drive(
      builder,
      {
        ...state,
        decayPressure: 1,
        coverageReport: coverageReportOf({ population: 100, civic: 20, funded: 1, services: 0 }),
      },
      BUILDER.ticksPerDecay * 40,
    );

    expect(buildingsOf(builder)).toHaveLength(before);
    expect(after.buildings).toHaveLength(before);
  });
});
