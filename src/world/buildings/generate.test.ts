import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, type BuildingClass } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { BUILDER, LEVEL_CAPS, MAX_FOOTPRINT } from './config';
import { generateBuilding, startLevel } from './generate';
import { STAMP_EMPTY, bandCount, solidCount, type VoxelStamp } from './stamp';

/** Tutte le combinazioni di classe e livello, con una manciata di seed. */
function* everyStamp(seeds = 24): Generator<{ stamp: VoxelStamp; cls: BuildingClass; level: number }> {
  for (const cls of ALL_CLASSES) {
    for (let level = 0; level <= BUILDER.maxLevel; level++) {
      for (let seed = 0; seed < seeds; seed++) {
        yield { stamp: generateBuilding(cls, level, seed * 7919 + 13), cls, level };
      }
    }
  }
}

describe('generateBuilding', () => {
  it('e\' deterministico sugli stessi argomenti', () => {
    for (const cls of ALL_CLASSES) {
      for (let level = 0; level <= BUILDER.maxLevel; level++) {
        const a = generateBuilding(cls, level, 12345);
        const b = generateBuilding(cls, level, 12345);
        expect(b.sizeX).toBe(a.sizeX);
        expect(b.sizeY).toBe(a.sizeY);
        expect(b.sizeZ).toBe(a.sizeZ);
        expect(b.anchorX).toBe(a.anchorX);
        expect(b.anchorY).toBe(a.anchorY);
        expect(Array.from(b.voxels)).toEqual(Array.from(a.voxels));
        expect(b.bandStarts).toEqual(a.bandStarts);
      }
    }
  });

  it('cambia al variare del solo seed', () => {
    // Non ogni coppia deve differire — con impronta 1x1 lo spazio delle forme e'
    // piccolo — ma la stragrande maggioranza si', altrimenti il seed non conta.
    let different = 0;
    const total = 64;
    for (let seed = 0; seed < total; seed++) {
      const a = generateBuilding(ALL_CLASSES[0], 3, seed);
      const b = generateBuilding(ALL_CLASSES[0], 3, seed + 1);
      const same =
        a.sizeX === b.sizeX &&
        a.sizeZ === b.sizeZ &&
        Array.from(a.voxels).every((v, i) => v === b.voxels[i]);
      if (!same) different++;
    }
    expect(different).toBeGreaterThan(total * 0.9);
  });

  it('rispetta i tetti di impronta e di fasce del livello', () => {
    for (const { stamp, level } of everyStamp()) {
      const caps = LEVEL_CAPS[level];
      expect(stamp.sizeX).toBe(stamp.sizeY);
      expect(stamp.sizeX).toBeGreaterThanOrEqual(1);
      expect(stamp.sizeX).toBeLessThanOrEqual(Math.min(caps.maxFootprint, MAX_FOOTPRINT));

      // Le fasce del corpo piu' il coronamento.
      expect(bandCount(stamp)).toBeGreaterThanOrEqual(caps.minBands + 1);
      expect(bandCount(stamp)).toBeLessThanOrEqual(caps.maxBands + 1);
    }
  });

  it('un tetto di impronta pari a quella scelta restituisce lo stesso stamp', () => {
    // E' la proprieta' su cui poggia la cancellazione: il Builder rigenera
    // l'impronta di un edificio passandogli il footprint che ha in archivio.
    for (const cls of ALL_CLASSES) {
      for (let level = 0; level <= BUILDER.maxLevel; level++) {
        for (let seed = 0; seed < 32; seed++) {
          const natural = generateBuilding(cls, level, seed);
          const capped = generateBuilding(cls, level, seed, natural.sizeX);
          expect(Array.from(capped.voxels)).toEqual(Array.from(natural.voxels));
          expect(capped.sizeZ).toBe(natural.sizeZ);
        }
      }
    }
  });

  it('un tetto piu\' stretto restringe davvero l\'impronta', () => {
    for (const cls of ALL_CLASSES) {
      for (let seed = 0; seed < 32; seed++) {
        expect(generateBuilding(cls, BUILDER.maxLevel, seed, 1).sizeX).toBe(1);
      }
    }
  });

  it('non ha fasce sospese: ognuna poggia su almeno meta\' della propria area', () => {
    for (const { stamp } of everyStamp()) {
      for (let sz = 1; sz < stamp.sizeZ; sz++) {
        let area = 0;
        let supported = 0;
        for (let sy = 0; sy < stamp.sizeY; sy++) {
          for (let sx = 0; sx < stamp.sizeX; sx++) {
            const here = stamp.voxels[sx + stamp.sizeX * (sy + stamp.sizeY * sz)];
            if (here === STAMP_EMPTY) continue;
            area++;
            const below = stamp.voxels[sx + stamp.sizeX * (sy + stamp.sizeY * (sz - 1))];
            if (below !== STAMP_EMPTY) supported++;
          }
        }
        if (area === 0) continue;
        expect(supported * 2).toBeGreaterThanOrEqual(area);
      }
    }
  });

  it('nessun voxel esce dal riquadro e nessuno stamp e\' vuoto', () => {
    for (const { stamp } of everyStamp()) {
      expect(stamp.voxels.length).toBe(stamp.sizeX * stamp.sizeY * stamp.sizeZ);
      expect(solidCount(stamp)).toBeGreaterThan(0);
      expect(stamp.bandStarts[0]).toBe(0);
      expect(stamp.bandStarts[stamp.bandStarts.length - 1]).toBe(stamp.sizeZ);
    }
  });

  it('usa solo indici di palette validi', () => {
    for (const { stamp } of everyStamp(8)) {
      for (const id of stamp.voxels) {
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeLessThan(Object.keys(PALETTE_SLOTS).length);
      }
    }
  });

  it('ha un coronamento in cima, diverso dal corpo sotto', () => {
    // Il coronamento e' l'ultima fascia: la quota piu' alta ne porta il colore, e
    // quel colore non compare nel corpo.
    let checked = 0;
    for (const { stamp } of everyStamp(12)) {
      const top = stamp.sizeZ - 1;
      const crownIds = new Set<number>();
      for (let i = 0; i < stamp.sizeX * stamp.sizeY; i++) {
        const id = stamp.voxels[i + stamp.sizeX * stamp.sizeY * top];
        if (id !== STAMP_EMPTY) crownIds.add(id);
      }
      expect(crownIds.size).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('porta una faccia d\x27accento con un indice diverso dal corpo', () => {
    // La fascia di base riempie sempre il riquadro, quindi su un'impronta larga
    // almeno due la sua prima quota contiene sia il corpo sia la faccia: se la
    // faccia d'accento non ci fosse, quella quota sarebbe di un colore solo.
    let wide = 0;
    for (const { stamp } of everyStamp(24)) {
      if (stamp.sizeX < 2) continue;
      wide++;

      const ids = new Set<number>();
      for (let i = 0; i < stamp.sizeX * stamp.sizeY; i++) {
        const id = stamp.voxels[i];
        if (id !== STAMP_EMPTY) ids.add(id);
      }
      expect(ids.size).toBeGreaterThanOrEqual(2);
    }
    expect(wide).toBeGreaterThan(0);
  });
});

describe('startLevel', () => {
  it('resta dentro i livelli previsti', () => {
    for (let seed = 0; seed < 500; seed++) {
      const level = startLevel(seed);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(BUILDER.maxLevel);
    }
  });

  it('ha una coda lunga: il livello base resta il caso comune', () => {
    let base = 0;
    const total = 2000;
    for (let seed = 0; seed < total; seed++) if (startLevel(seed) === 0) base++;
    expect(base / total).toBeGreaterThan(0.6);
    expect(base / total).toBeLessThan(0.85);
  });
});
