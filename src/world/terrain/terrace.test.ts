import { describe, expect, it } from 'vitest';
import { TERRACE, TERRAIN } from './config';
import { cellFloor, isCliff, terraceOf, terraceStepAt } from './terrace';

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

describe('il ciglio', () => {
  it('e’ il salto che supera un cubo, non quello che lo raggiunge', () => {
    expect(isCliff(0)).toBe(false);
    expect(isCliff(TERRAIN.cellSize)).toBe(false);
    expect(isCliff(TERRAIN.cellSize + 1)).toBe(true);
    expect(isCliff(TERRACE.maxStep)).toBe(true);
  });
});
