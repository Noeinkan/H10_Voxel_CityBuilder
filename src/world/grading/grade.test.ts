import { describe, expect, it } from 'vitest';
import { BIOME, TERRAIN } from '../terrain/config';
import { BUILD_WEIGHT, GRADING } from './config';
import {
  GROUND,
  WORKS,
  buildWeightOf,
  footprintWeightOf,
  groundKindOf,
  planGrade,
  rampField,
  type GroundColumn,
} from './grade';

/**
 * Le opere sono una funzione pura di quote e classificazioni, quindi si
 * verificano scrivendo le quote a mano. Le soglie si rileggono da `GRADING`
 * invece di essere ricopiate: un test che fissasse "due voxel" continuerebbe a
 * passare dopo una ritaratura che ha cambiato proprio la regola che verifica.
 */

/** Impronta tutta della stessa quota e dello stesso tipo. */
function even(kind: GroundColumn['kind'], height: number, count = 4): GroundColumn[] {
  return Array.from({ length: count }, () => ({ kind, height }));
}

describe('groundKindOf — cosa serve per costruire', () => {
  it('la roccia si paga invece di essere vietata: decide la pendenza', () => {
    // Una mesa larga e piana era l'unico rifiuto che non si riusciva a leggere
    // sullo schermo: `classifyBiome` chiama roccia tutto cio' che sta sopra
    // `rockMinHeight` anche a pendenza zero. Ora la roccia e' un prezzo.
    expect(groundKindOf(BIOME.rock, 0, 30)).toBe(GROUND.rock);
    expect(groundKindOf(BIOME.rock, GRADING.maxTerraceSlope, 30)).toBe(GROUND.refused);
  });

  it('la battigia e il bassofondo chiedono una banchina', () => {
    expect(groundKindOf(BIOME.beach, 0, TERRAIN.seaLevel)).toBe(GROUND.shore);
    expect(groundKindOf(BIOME.ocean, 0, TERRAIN.seaLevel - GRADING.maxQuayDepth))
      .toBe(GROUND.shore);
  });

  it('oltre il pescaggio massimo il mare torna a essere mare', () => {
    expect(groundKindOf(BIOME.ocean, 0, TERRAIN.seaLevel - GRADING.maxQuayDepth - 1))
      .toBe(GROUND.refused);
  });

  it('la pendenza divide il terrapieno dal terreno gia piano', () => {
    expect(groundKindOf(BIOME.plain, 0, 14)).toBe(GROUND.flat);
    // Esattamente la soglia oltre cui il terreno smette di essere `buildable`:
    // e' la colonna che prima della 4.2 veniva persa e ora chiede un muro.
    expect(groundKindOf(BIOME.hill, TERRAIN.buildableMaxSlope, 22)).toBe(GROUND.sloped);
    expect(groundKindOf(BIOME.hill, GRADING.maxTerraceSlope, 22)).toBe(GROUND.refused);
  });
});

describe('planGrade — il piano finito', () => {
  it('terreno piano e senza scarto non chiede nessuna opera', () => {
    const plan = planGrade(even(GROUND.flat, 14));
    expect(plan).not.toBeNull();
    expect(plan?.works).toBe(WORKS.none);
    expect(plan?.padZ).toBe(14);
    expect(plan?.fill).toBe(0);
  });

  it('la quota finita e il massimo, mai la media: si riempie e non si scava', () => {
    const plan = planGrade([
      { kind: GROUND.flat, height: 14 },
      { kind: GROUND.flat, height: 16 },
      { kind: GROUND.flat, height: 15 },
      { kind: GROUND.flat, height: 15 },
    ]);
    expect(plan?.padZ).toBe(16);
    expect(plan?.footZ).toBe(14);
    // Nessuna colonna scende: il riempimento e' la somma degli scarti verso l'alto.
    expect(plan?.fill).toBe(2 + 0 + 1 + 1);
  });

  it('uno scarto di un voxel resta terra, due diventano muro', () => {
    const shallow = planGrade([
      { kind: GROUND.flat, height: 14 },
      { kind: GROUND.flat, height: 15 },
      { kind: GROUND.flat, height: 15 },
      { kind: GROUND.flat, height: 15 },
    ]);
    expect(shallow?.works).toBe(WORKS.none);

    const deep = planGrade([
      { kind: GROUND.flat, height: 14 },
      { kind: GROUND.flat, height: 14 + GRADING.terraceMinStep },
      { kind: GROUND.flat, height: 15 },
      { kind: GROUND.flat, height: 15 },
    ]);
    expect(deep?.works).toBe(WORKS.terrace);
  });

  it('una colonna in pendenza chiede il muro anche senza scarto sotto l impronta', () => {
    const plan = planGrade(even(GROUND.sloped, 20));
    expect(plan?.works).toBe(WORKS.terrace);
    expect(plan?.fill).toBe(0);
  });

  it('una sola colonna di battigia porta tutta l impronta sulla banchina', () => {
    const plan = planGrade([
      { kind: GROUND.shore, height: TERRAIN.seaLevel },
      { kind: GROUND.flat, height: TERRAIN.seaLevel + 1 },
      { kind: GROUND.flat, height: TERRAIN.seaLevel + 1 },
      { kind: GROUND.flat, height: TERRAIN.seaLevel + 1 },
    ]);
    expect(plan?.works).toBe(WORKS.quay);
    expect(plan?.padZ).toBe(GRADING.quayLevel);
  });

  it('la banchina non abbassa un fronte che sta gia piu in alto', () => {
    const plan = planGrade([
      { kind: GROUND.shore, height: TERRAIN.seaLevel },
      { kind: GROUND.flat, height: GRADING.quayLevel + 3 },
      { kind: GROUND.flat, height: GRADING.quayLevel + 3 },
      { kind: GROUND.flat, height: GRADING.quayLevel + 2 },
    ]);
    expect(plan?.padZ).toBe(GRADING.quayLevel + 3);
  });

  it('una colonna rifiutata rifiuta l intera impronta', () => {
    expect(planGrade([
      { kind: GROUND.flat, height: 14 },
      { kind: GROUND.refused, height: 14 },
    ])).toBeNull();
  });

  it('oltre il tetto strutturale non c e opera che tenga', () => {
    expect(planGrade([
      { kind: GROUND.flat, height: 14 },
      { kind: GROUND.flat, height: 14 + GRADING.maxWorksStep },
    ])).not.toBeNull();
    expect(planGrade([
      { kind: GROUND.flat, height: 14 },
      { kind: GROUND.flat, height: 15 + GRADING.maxWorksStep },
    ])).toBeNull();
  });

  it('il caso peggiore vero — la banchina sul fondale — sta nel tetto', () => {
    // E' il numero da cui `maxWorksStep` e' tarato: se questa smette di
    // passare, nessuna banchina profonda viene piu' costruita e la costa torna
    // a essere un bordo.
    const plan = planGrade(even(GROUND.shore, TERRAIN.seaLevel - GRADING.maxQuayDepth));
    expect(plan).not.toBeNull();
    expect(plan?.works).toBe(WORKS.quay);
  });
});

describe('rampField — la rampa', () => {
  /** Massimo dislivello fra due celle vicine, diagonali comprese. */
  function maxStep(level: Int32Array, width: number, height: number): number {
    let worst = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const here = level[y * width + x];
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          worst = Math.max(worst, Math.abs(level[ny * width + nx] - here));
        }
      }
    }
    return worst;
  }

  it('un picco isolato diventa un cono a pendenza uno', () => {
    const level = new Int32Array(9 * 9);
    level[4 * 9 + 4] = 6;
    rampField(level, 9, 9);

    expect(maxStep(level, 9, 9)).toBeLessThanOrEqual(1);
    // La distanza e' di Chebyshev: la diagonale scende come l'ortogonale.
    expect(level[4 * 9 + 0]).toBe(2);
    expect(level[0 * 9 + 0]).toBe(2);
  });

  it('non abbassa mai una cella: la rampa riempie, non scava', () => {
    const before = Int32Array.from([5, 0, 0, 9, 0, 0, 0, 3, 0]);
    const after = Int32Array.from(before);
    rampField(after, 3, 3);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBeGreaterThanOrEqual(before[i]);
    }
  });

  it('un campo gia continuo resta identico a se stesso', () => {
    const flat = Int32Array.from([12, 12, 12, 12, 13, 12, 12, 12, 12]);
    const expected = Int32Array.from(flat);
    rampField(flat, 3, 3);
    expect([...flat]).toEqual([...expected]);
  });
});

describe('buildWeightOf — il prezzo del terreno', () => {
  it('il terreno di listino e il piano, e nessun altro', () => {
    expect(buildWeightOf(GROUND.flat)).toBe(1);
    for (const kind of [GROUND.sloped, GROUND.shore, GROUND.rock] as const) {
      expect(buildWeightOf(kind)).toBeGreaterThan(1);
    }
  });

  it('cio che nessuna opera raddrizza non ha un prezzo, ha un rifiuto', () => {
    expect(Number.isFinite(buildWeightOf(GROUND.refused))).toBe(false);
  });

  it('la tabella e allineata a GROUND: ogni tipo pesa il suo numero', () => {
    // Due elenchi ordinati a mano — le costanti e i pesi — che scivolerebbero
    // in silenzio: qui uno sfasamento di un indice fa cadere il test invece di
    // far pagare la banchina al prezzo del terrapieno.
    expect(buildWeightOf(GROUND.sloped)).toBe(BUILD_WEIGHT.sloped);
    expect(buildWeightOf(GROUND.shore)).toBe(BUILD_WEIGHT.shore);
    expect(buildWeightOf(GROUND.rock)).toBe(BUILD_WEIGHT.rock);
  });

  it("un'impronta pesa quanto la sua colonna peggiore, non quanto la media", () => {
    const half = [GROUND.flat, GROUND.flat, GROUND.flat, GROUND.shore] as const;
    expect(footprintWeightOf(half)).toBe(BUILD_WEIGHT.shore);
    expect(footprintWeightOf([])).toBe(0);
  });
});
