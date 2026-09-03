import { describe, expect, it } from 'vitest';
import { ARCH } from './config/arch';
import { ARCH_REFUSALS, planArch, type ArchSide } from './archPlan';

/**
 * Le fasce di un corpo alto quaranta voxel.
 *
 * Le sommita' utili sono 16 e 26: sotto c'e' il corso di base, che sta sotto il
 * franco minimo, e sopra c'e' la cima meno `crownDrop`.
 */
const BANDS = [0, 6, 16, 26, 36, 40];

/** Un corpo pieno: un parallelepipedo di lato `footprint` alto `height`. */
function box(over: Partial<ArchSide> & { id: number; x: number; y: number }): ArchSide {
  const footprint = over.footprint ?? 8;
  const depth = over.footprintY ?? footprint;
  const height = over.height ?? 40;
  const baseZ = over.baseZ ?? 0;
  return {
    footprint,
    height,
    baseZ,
    level: ARCH.minLevel,
    bands: BANDS,
    solid: (x, y, z) =>
      x >= over.x && x < over.x + footprint &&
      y >= over.y && y < over.y + depth &&
      z >= baseZ && z < baseZ + height,
    ...over,
  };
}

/** Due dirimpettai sull'asse x, separati da `gap` voxel di carreggiata. */
function facing(gap: number): { a: ArchSide; b: ArchSide } {
  return {
    a: box({ id: 1, x: 0, y: 0, facing: 0 }),
    b: box({ id: 2, x: 8 + gap, y: 0, facing: 1 }),
  };
}

describe('planArch', () => {
  it('divide il vuoto in due bracci che si incontrano', () => {
    const { a, b } = facing(4);
    const result = planArch({ a, b, groundZ: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pair.a.reach + result.pair.b.reach).toBe(4);
    expect(result.pair.a.z).toBe(result.pair.b.z);
    expect(result.pair.a.across).toBe(result.pair.b.across);
    expect(result.pair.a.width).toBe(result.pair.b.width);
    expect(result.pair.a.mate).toBe(b.id);
    expect(result.pair.b.mate).toBe(a.id);
  });

  it('da il voxel di resto a chi ha l’id minore', () => {
    const { a, b } = facing(5);
    const result = planArch({ a, b, groundZ: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pair.a.reach).toBe(3);
    expect(result.pair.b.reach).toBe(2);
    // Lo stesso vuoto letto dall'altro verso da' la stessa divisione: e' cio'
    // che rende la sagoma indipendente dall'ordine della passata.
    const mirrored = planArch({ a: b, b: a, groundZ: 0 });
    expect(mirrored.ok).toBe(true);
    if (!mirrored.ok) return;
    expect(mirrored.pair.b.reach).toBe(3);
  });

  it('prende la quota di fascia piu’ alta che i due hanno in comune', () => {
    const { a, b } = facing(4);
    const result = planArch({ a, b, groundZ: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pair.a.z).toBe(26);
  });

  it('accetta uno scarto di fascia entro la tolleranza, e prende la piu’ bassa', () => {
    const { a } = facing(4);
    const b = box({
      id: 2,
      x: 12,
      y: 0,
      facing: 1,
      bands: [0, 6, 16, 26 + ARCH.plumb, 36, 40],
    });
    const result = planArch({ a, b, groundZ: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pair.a.z).toBe(26);
  });

  it('rifiuta due corpi le cui fasce non si incontrano mai', () => {
    const { a } = facing(4);
    const b = box({
      id: 2,
      x: 12,
      y: 0,
      facing: 1,
      bands: [0, 6, 16 + ARCH.plumb + 1, 26 + ARCH.plumb + 1, 36, 40],
    });
    const result = planArch({ a, b, groundZ: 0 });

    expect(result).toEqual({ ok: false, refusal: ARCH_REFUSALS.noCommonBand });
  });

  it('non chiede al dirimpettaio di guardare la stessa strada', () => {
    // **E' la meta' della regola che ha dovuto cedere.** Chiedendo `facing`
    // opposto su tutti e due, quarantacinque coppie su quarantanove di una
    // citta' cresciuta cadevano qui: in questa maglia il fronte strada e' la
    // strada piu' vicina, e due corpi affacciati sullo stesso vuoto stanno
    // spesso su due assi diversi. Un arco e' un fatto del vuoto.
    const a = box({ id: 1, x: 0, y: 0, facing: 0 });
    const b = box({ id: 2, x: 12, y: 0, facing: 2 });
    const result = planArch({ a, b, groundZ: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pair.b.face).toBe(1);
  });

  it('rifiuta chi apre la coppia senza un fronte strada', () => {
    const a = box({ id: 1, x: 0, y: 0 });
    const b = box({ id: 2, x: 12, y: 0, facing: 1 });

    expect(planArch({ a, b, groundZ: 0 }))
      .toEqual({ ok: false, refusal: ARCH_REFUSALS.notFacing });
  });

  it('rifiuta chi non e’ cresciuto abbastanza', () => {
    const { a, b } = facing(4);
    const young = { ...b, level: ARCH.minLevel - 1 };

    expect(planArch({ a, b: young, groundZ: 0 }))
      .toEqual({ ok: false, refusal: ARCH_REFUSALS.tooLow });
  });

  it('rifiuta chi ha gia’ un braccio', () => {
    const { a, b } = facing(4);
    const arched = {
      ...b,
      arch: { face: 1, reach: 2, inset: 0, z: 26, rise: 3, across: 0, width: 8, mate: 9 },
    };

    expect(planArch({ a, b: arched, groundZ: 0 }))
      .toEqual({ ok: false, refusal: ARCH_REFUSALS.alreadyArched });
  });

  it('rifiuta il vuoto troppo stretto e quello troppo largo', () => {
    const tight = facing(ARCH.minGap - 1);
    expect(planArch({ ...tight, groundZ: 0 }))
      .toEqual({ ok: false, refusal: ARCH_REFUSALS.badGap });

    const wide = facing(ARCH.maxGap + 1);
    expect(planArch({ ...wide, groundZ: 0 }))
      .toEqual({ ok: false, refusal: ARCH_REFUSALS.badGap });
  });

  it('rifiuta due fronti che si guardano di sbieco', () => {
    const a = box({ id: 1, x: 0, y: 0, facing: 0 });
    const b = box({ id: 2, x: 12, y: 6, facing: 1 });

    expect(planArch({ a, b, groundZ: 0 }))
      .toEqual({ ok: false, refusal: ARCH_REFUSALS.noOverlap });
  });

  it('rifiuta un arco che passerebbe troppo vicino al terreno', () => {
    const { a, b } = facing(4);

    expect(planArch({ a, b, groundZ: 30 }))
      .toEqual({ ok: false, refusal: ARCH_REFUSALS.noCommonBand });
  });

  it('rientra fino al muro quando la fascia si e’ arretrata', () => {
    const { a } = facing(4);
    // Il corpo di fronte e' rastremato: alla quota dell'arco la parete sta due
    // voxel dentro il filo dell'impronta.
    const b = box({
      id: 2,
      x: 12,
      y: 0,
      facing: 1,
      solid: (x, y, z) => x >= 14 && x < 20 && y >= 0 && y < 8 && z >= 0 && z < 40,
    });
    const result = planArch({ a, b, groundZ: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pair.a.inset).toBe(0);
    expect(result.pair.b.inset).toBe(2);
  });

  it('rifiuta quando a quella quota non c’e’ piu’ parete dentro l’impronta', () => {
    const { a } = facing(4);
    const hollow = box({ id: 2, x: 12, y: 0, facing: 1, solid: () => false });

    expect(planArch({ a, b: hollow, groundZ: 0 }))
      .toEqual({ ok: false, refusal: ARCH_REFUSALS.noWall });
  });

  it('centra il braccio sul tratto in cui i due fronti si guardano', () => {
    const a = box({ id: 1, x: 0, y: 0, facing: 0, footprint: 8 });
    // Un dirimpettaio piu' largo: il tratto in comune resta quello di `a`, e il
    // braccio si centra dentro invece di accostarsi a un capo.
    const b = box({ id: 2, x: 12, y: -4, facing: 1, footprint: 8, footprintY: 16 });
    const result = planArch({ a, b, groundZ: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pair.a.width).toBe(ARCH.maxWidth);
    expect(result.pair.a.across).toBe(0);
  });
});
