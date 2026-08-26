import { describe, expect, it } from 'vitest';
import { CHUNK } from './chunkCoords';
import {
  MAX_OVERHANG,
  SCALE,
  arcologySpanOf,
  coastalRadiusOf,
  levelCapsOf,
  maxDirtyChunksPerBuildingOf,
  maxTowerHeightOf,
  minBandSideOf,
  minFootprintOf,
  segmentSideOf,
  skylineCapsOf,
  startLevelCdfOf,
  streetPitchOf,
} from './scale';

/**
 * La rete che mancava: ogni accoppiamento di scala e' una derivazione, e qui si
 * verifica che le derivate reggano **per qualunque coppia di manopole**, non
 * solo per quella corrente. Il cuore della ripetibilita' e' il secondo blocco:
 * una coppia "ordine di grandezza" (24 / 40) che nessun test di dominio copre,
 * e che deve passare girando le stesse manopole.
 *
 * I vincoli qui sotto sono gli stessi gia' sparsi in `generate.test.ts`,
 * `tiers.test.ts` e `overhang.test.ts`, raccolti in un punto solo: se uno salta
 * al prossimo cambio di scala, questo file lo dice prima che lo dica la citta'.
 */

const CELL_SIZE = 2;

/** La coppia corrente e una coppia "ordine di grandezza" di prova. */
const PAIRS = [
  { module: SCALE.moduleFootprint, maxLevel: SCALE.maxLevel },
  { module: 24, maxLevel: 40 },
] as const;

describe('le due manopole', () => {
  it('il modulo e la sua meta restano interi e pari', () => {
    for (const { module } of PAIRS) {
      expect(module % 2).toBe(0);
      expect(minFootprintOf(module)).toBe(module / 2);
      expect(minBandSideOf(module)).toBe(module / 2);
    }
  });
});

describe('levelCapsOf', () => {
  it('ha una voce per livello, e le fasce sono monotone', () => {
    for (const { module, maxLevel } of PAIRS) {
      const caps = levelCapsOf(module, maxLevel);
      expect(caps).toHaveLength(maxLevel + 1);

      let prevMinFootprint = 0;
      let prevMaxFootprint = 0;
      let prevMinBands = 0;
      let prevMaxBands = 0;
      for (let level = 0; level < caps.length; level++) {
        const cap = caps[level];
        expect(cap.minFootprint).toBeLessThanOrEqual(cap.maxFootprint);
        expect(cap.minBands).toBeLessThanOrEqual(cap.maxBands);
        // L'impronta non scende mai, e il tetto resta dentro il modulo.
        expect(cap.maxFootprint).toBeLessThanOrEqual(module);
        expect(cap.minFootprint).toBeGreaterThanOrEqual(prevMinFootprint);
        expect(cap.maxFootprint).toBeGreaterThanOrEqual(prevMaxFootprint);
        expect(cap.minBands).toBeGreaterThanOrEqual(prevMinBands);
        expect(cap.maxBands).toBeGreaterThanOrEqual(prevMaxBands);
        prevMinFootprint = cap.minFootprint;
        prevMaxFootprint = cap.maxFootprint;
        prevMinBands = cap.minBands;
        prevMaxBands = cap.maxBands;
      }
    }
  });

  it('in cima l impronta satura a meta modulo, mai al lato pieno', () => {
    for (const { module, maxLevel } of PAIRS) {
      const top = levelCapsOf(module, maxLevel)[maxLevel];
      const mid = module / 2 + module / 4;
      expect(top.minFootprint).toBe(mid);
      expect(top.maxFootprint).toBe(mid);
      expect(top.maxFootprint).toBeLessThan(module);
      const below = levelCapsOf(module, maxLevel)[maxLevel - 1];
      expect(top.minBands).toBeGreaterThan(below.minBands);
      expect(top.maxBands).toBeGreaterThan(below.maxBands);
    }
  });

  it('con le manopole di partenza l impronta ordinaria satura a meta modulo', () => {
    // Il lato pieno del modulo resta agli assemblaggi: con modulo 8 e 12 livelli
    // il tetto d'impronta satura a 6 (meta modulo) e mai a 8. Le fasce non
    // cambiano rispetto alla tabella storica.
    expect(levelCapsOf(8, 12)).toEqual([
      { minFootprint: 4, maxFootprint: 6, minBands: 1, maxBands: 2 },
      { minFootprint: 4, maxFootprint: 6, minBands: 2, maxBands: 3 },
      { minFootprint: 4, maxFootprint: 6, minBands: 3, maxBands: 4 },
      { minFootprint: 6, maxFootprint: 6, minBands: 4, maxBands: 5 },
      { minFootprint: 6, maxFootprint: 6, minBands: 5, maxBands: 6 },
      { minFootprint: 6, maxFootprint: 6, minBands: 6, maxBands: 7 },
      { minFootprint: 6, maxFootprint: 6, minBands: 7, maxBands: 8 },
      { minFootprint: 6, maxFootprint: 6, minBands: 8, maxBands: 9 },
      { minFootprint: 6, maxFootprint: 6, minBands: 9, maxBands: 10 },
      { minFootprint: 6, maxFootprint: 6, minBands: 10, maxBands: 11 },
      { minFootprint: 6, maxFootprint: 6, minBands: 11, maxBands: 12 },
      { minFootprint: 6, maxFootprint: 6, minBands: 13, maxBands: 15 },
      { minFootprint: 6, maxFootprint: 6, minBands: 16, maxBands: 19 },
    ]);
  });
});

describe('startLevelCdfOf', () => {
  it('ha una voce per livello, non decresce e chiude a uno', () => {
    for (const { maxLevel } of PAIRS) {
      const cdf = startLevelCdfOf(maxLevel);
      expect(cdf).toHaveLength(maxLevel + 1);
      for (let i = 1; i < cdf.length; i++) {
        expect(cdf[i]).toBeGreaterThanOrEqual(cdf[i - 1]);
      }
      expect(cdf[cdf.length - 1]).toBe(1);
      // Coda lunga: il livello base resta il caso comune.
      expect(cdf[0]).toBeGreaterThan(0.6);
      expect(cdf[0]).toBeLessThan(0.9);
    }
  });
});

describe('skylineCapsOf', () => {
  it('il massimo teorico coincide con il livello massimo', () => {
    for (const { maxLevel } of PAIRS) {
      const caps = skylineCapsOf(maxLevel);
      expect(caps.levelCap).toHaveLength(3);
      expect(caps.levelCap[0]).toBeLessThan(caps.levelCap[1]);
      expect(caps.levelCap[1]).toBeLessThan(caps.levelCap[2]);
      expect(caps.levelCap[2] + caps.coneBonus + caps.peakBonus).toBe(maxLevel);
    }
  });
});

describe('i vincoli duri in pianta', () => {
  it('l inviluppo massimo resta sotto CHUNK', () => {
    for (const { module } of PAIRS) {
      expect(module + MAX_OVERHANG).toBeLessThan(CHUNK);
    }
  });

  it('l inviluppo massimo sta dentro il lato del segmento', () => {
    for (const { module } of PAIRS) {
      expect(module + MAX_OVERHANG).toBeLessThanOrEqual(segmentSideOf(module));
    }
  });

  it('il segmento sta sopra il modulo e resta pari', () => {
    for (const { module } of PAIRS) {
      expect(segmentSideOf(module)).toBeGreaterThanOrEqual(module + MAX_OVERHANG);
      expect(segmentSideOf(module) % 2).toBe(0);
    }
  });
});

describe('maxDirtyChunksPerBuildingOf', () => {
  it('cresce con il livello massimo e copre la torre piu alta', () => {
    for (const { module, maxLevel } of PAIRS) {
      const tower = maxTowerHeightOf(module, maxLevel);
      // Due colonne per asse, i piani della torre piu' i due di bordo.
      const worst = 2 * 2 * (Math.ceil(tower / CHUNK) + 2);
      expect(maxDirtyChunksPerBuildingOf(module, maxLevel)).toBeGreaterThanOrEqual(worst);
      expect(maxTowerHeightOf(module, maxLevel)).toBeGreaterThan(0);
    }
  });
});

describe('streetPitchOf', () => {
  it('l isolato piu stretto regge il modulo piu largo piu due cubi', () => {
    for (const { module } of PAIRS) {
      const { pitch, jitter } = streetPitchOf(module, CELL_SIZE);
      expect(pitch - 2 * jitter).toBeGreaterThanOrEqual(module + 2 * CELL_SIZE);
      // Lo scostamento resta sotto meta' passo: due assi non si toccano mai.
      expect(jitter * 2).toBeLessThan(pitch);
      // Entrambi multipli di cella, per l'allineamento dei lotti.
      expect(pitch % CELL_SIZE).toBe(0);
      expect(jitter % CELL_SIZE).toBe(0);
    }
  });
});

describe('coastalRadiusOf e arcologySpanOf', () => {
  it('la costa vede il modulo e l arcologia lo supera', () => {
    for (const { module } of PAIRS) {
      expect(coastalRadiusOf(module, CELL_SIZE)).toBeGreaterThan(module);
      expect(arcologySpanOf(module)).toBeGreaterThan(module);
      expect(arcologySpanOf(module)).toBeLessThanOrEqual(segmentSideOf(module));
    }
  });
});
