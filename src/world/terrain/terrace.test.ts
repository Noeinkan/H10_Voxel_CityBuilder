import { describe, expect, it } from 'vitest';
import { TERRACE, TERRAIN } from './config';
import { cellFloor, isCliff, terraceAt, terraceOf, terraceStepAt } from './terrace';

/** Tutte le quote intere che l'isola sappia produrre. */
const HEIGHTS = Array.from({ length: TERRAIN.maxHeight + 1 }, (_, z) => z);

describe('la scala delle quote', () => {
  it('e’ monotona: salire nel campo non fa mai scendere il terreno', () => {
    for (let z = 1; z <= TERRAIN.maxHeight; z++) {
      expect(terraceOf(z)).toBeGreaterThanOrEqual(terraceOf(z - 1));
    }
  });

  it('posa sempre su un multiplo della cella, e mai sopra la quota vera', () => {
    for (const z of HEIGHTS) {
      const posed = terraceOf(z);
      expect(posed % TERRAIN.cellSize).toBe(0);
      expect(posed).toBeLessThanOrEqual(z);
      expect(z - posed).toBeLessThan(TERRACE.maxStep);
    }
  });

  it('sotto la spiaggia il passo resta la cella: la pianura non si terrazza', () => {
    for (let z = 0; z < TERRACE.fromHeight; z++) {
      expect(terraceOf(z)).toBe(cellFloor(z));
    }
  });

  it('l’alzata sta fra una cella e il tetto dichiarato, e ne e’ un multiplo', () => {
    expect(TERRACE.maxStep % TERRAIN.cellSize).toBe(0);
    for (const z of HEIGHTS) {
      const step = terraceStepAt(z);
      expect(step).toBeGreaterThanOrEqual(TERRAIN.cellSize);
      expect(step).toBeLessThanOrEqual(TERRACE.maxStep);
      expect(step % TERRAIN.cellSize).toBe(0);
    }
  });

  /**
   * La proprieta' su cui si regge il terreno a celle, ora che salta di piu' di
   * un cubo. Il campo continuo tiene il dislivello fra due celle contigue sotto
   * i due voxel (`heightField.test.ts` misura meno di 0,8 per colonna, quindi
   * meno di 1,6 su due), e ogni pedata e' larga almeno `cellSize`: due quote
   * cosi' vicine non possono percio' scavallare piu' di un'alzata.
   *
   * Verificarlo qui e non solo sull'isola e' il punto: e' una proprieta' della
   * scala, vale per **qualunque** campo che rispetti il vincolo di Lipschitz, e
   * non dipende dal seed di riferimento.
   */
  it('due quote vicine come due celle contigue non saltano piu’ di un’alzata', () => {
    const reach = TERRAIN.cellSize;
    for (const z of HEIGHTS) {
      for (let delta = 0; delta <= reach; delta += 0.1) {
        const gap = Math.abs(terraceOf(z) - terraceOf(Math.min(TERRAIN.maxHeight, z + delta)));
        expect(gap, `da ${z} a ${z + delta}`).toBeLessThanOrEqual(TERRACE.maxStep);
      }
    }
  });

  it('la montagna sale davvero: in fascia rocciosa l’alzata e’ il tetto', () => {
    // Non e' un dettaglio di taratura ma cio' che si e' chiesto al terreno: sopra
    // la soglia della roccia il gradone deve valere quattro cubi, non uno.
    expect(terraceStepAt(TERRAIN.rockMinHeight)).toBe(TERRACE.maxStep);
    expect(terraceStepAt(TERRAIN.hillMinHeight)).toBeGreaterThan(TERRAIN.cellSize);
    expect(terraceStepAt(TERRAIN.beachMaxHeight - TERRAIN.cellSize)).toBe(TERRAIN.cellSize);
  });
});

describe('la quota scossa', () => {
  /**
   * Il dislivello massimo fra due celle contigue: meno di 0,8 per colonna
   * (`heightField.test.ts`), quindi meno di 1,6 su due.
   */
  const CELL_DELTA = 1.6;

  it('in pianura non scuote niente: il terreno resta quello di prima', () => {
    for (let z = 0; z < TERRACE.fromHeight; z++) {
      for (let cell = 0; cell < 40; cell++) {
        expect(terraceAt(1337, cell, cell * 3, z)).toBe(terraceOf(z));
      }
    }
  });

  it('e’ una funzione pura di (seed, cella): due blocchi ne leggono la stessa', () => {
    for (let cell = 0; cell < 32; cell++) {
      expect(terraceAt(1337, cell, 7, 52.3)).toBe(terraceAt(1337, cell, 7, 52.3));
    }
    // Seed diverso, isola diversa: il disturbo non e' una tabella fissa.
    let differences = 0;
    for (let cell = 0; cell < 64; cell++) {
      if (terraceAt(1337, cell, 7, 52.3) !== terraceAt(1338, cell, 7, 52.3)) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  /**
   * **L'invariante del terreno a celle**, e l'unica ragione per cui l'ampiezza
   * e' una frazione dell'alzata invece di un numero di voxel: due celle contigue
   * cadono ancora o sulla stessa pedata o su due contigue, quindi il dirupo
   * peggiore resta un'alzata. Vale per qualunque campo che rispetti Lipschitz,
   * non solo per il seed di riferimento.
   */
  it('due celle contigue non saltano piu’ di un’alzata, comunque cada il disturbo', () => {
    for (const seed of [1337, 7, 99991]) {
      for (let base = 0; base <= TERRAIN.maxHeight; base += 0.5) {
        for (let cell = 0; cell < 24; cell++) {
          const here = terraceAt(seed, cell, 3, Math.min(TERRAIN.maxHeight, base));
          for (const delta of [-CELL_DELTA, 0, CELL_DELTA]) {
            const next = Math.max(0, Math.min(TERRAIN.maxHeight, base + delta));
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
              const there = terraceAt(seed, cell + dx, 3 + dy, next);
              const gap = Math.abs(here - there);
              expect(gap, `da ${base} a ${next} sulla cella ${cell}`)
                .toBeLessThanOrEqual(terraceStepAt(Math.min(here, there)));
            }
          }
        }
      }
    }
  });

  /**
   * E' il difetto che il disturbo esiste per togliere: senza, il ciglio cade
   * dove il campo attraversa una quota tonda, cioe' su una curva di livello
   * esatta. Su un fianco a pendenza costante quella curva e' una retta.
   */
  it('sul fianco il ciglio non cade piu’ sulla stessa colonna', () => {
    // Un versante che sale di mezzo voxel per cella, in fascia rocciosa.
    const heightAt = (cell: number): number => 50 + cell * 0.5;
    const edges: number[] = [];
    for (let row = 0; row < 24; row++) {
      let previous = terraceAt(1337, 0, row, heightAt(0));
      for (let cell = 1; cell < 40; cell++) {
        const here = terraceAt(1337, cell, row, heightAt(cell));
        if (here !== previous) edges.push(cell);
        previous = here;
      }
    }
    // Senza disturbo il ciglio cadrebbe sulla stessa cella in ogni riga.
    expect(new Set(edges).size).toBeGreaterThan(2);
  });
});

describe('il ciglio', () => {
  it('e’ il salto che supera un cubo, non quello che lo raggiunge', () => {
    expect(isCliff(0)).toBe(false);
    expect(isCliff(TERRAIN.cellSize)).toBe(false);
    expect(isCliff(TERRAIN.cellSize + 1)).toBe(true);
    expect(isCliff(TERRACE.maxStep)).toBe(true);
  });
});
