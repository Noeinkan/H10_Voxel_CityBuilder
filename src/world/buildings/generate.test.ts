import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, type BuildingClass } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { BUILDER, CLASS_PROFILE, LEVEL_CAPS, MAX_FOOTPRINT } from './config';
import { generateBuilding, startLevel } from './generate';
import { anchoredVoxel, STAMP_EMPTY, bandCount, solidCount, type VoxelStamp } from './stamp';
import { SURFACE_KIND } from '../visualBlock';

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
  it('trasforma l\'ancora locale in una coordinata voxel 3D', () => {
    const stamp = generateBuilding(ALL_CLASSES[0], 0, 13);
    const world = anchoredVoxel({ x: 40, y: -7, z: 23 }, stamp, stamp.anchorX, stamp.anchorY, stamp.anchorZ);
    expect(world).toEqual({ x: 40, y: -7, z: 23 });
  });

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
        expect(b.anchorZ).toBe(a.anchorZ);
        expect(Array.from(b.voxels)).toEqual(Array.from(a.voxels));
        expect(Array.from(b.surfaces)).toEqual(Array.from(a.surfaces));
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
      expect(stamp.sizeX).toBeGreaterThanOrEqual(caps.minFootprint);
      expect(stamp.sizeX).toBeLessThanOrEqual(Math.min(caps.maxFootprint, MAX_FOOTPRINT));

      // Fasce del corpo, coronamento e unico dettaglio sul tetto.
      expect(bandCount(stamp)).toBeGreaterThanOrEqual(caps.minBands + 2);
      expect(bandCount(stamp)).toBeLessThanOrEqual(caps.maxBands + 2);
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

  it('un upgrade puo allargarsi ma non restringe mai l\'impronta esistente', () => {
    for (const cls of ALL_CLASSES) {
      for (let level = 1; level <= BUILDER.maxLevel; level++) {
        for (let seed = 0; seed < 32; seed++) {
          const previous = generateBuilding(cls, level - 1, seed);
          const upgraded = generateBuilding(cls, level, seed, MAX_FOOTPRINT, previous.sizeX);
          expect(upgraded.sizeX).toBeGreaterThanOrEqual(previous.sizeX);
        }
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
      expect(stamp.surfaces.length).toBe(stamp.voxels.length);
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

  it('assegna una grammatica sci-fi a ogni voxel edilizio', () => {
    const expected = [SURFACE_KIND.habitat, SURFACE_KIND.industrial, SURFACE_KIND.civic];
    for (const { stamp, cls } of everyStamp(8)) {
      const used = new Set<number>();
      for (let i = 0; i < stamp.voxels.length; i++) {
        if (stamp.voxels[i] === STAMP_EMPTY) {
          expect(stamp.surfaces[i]).toBe(SURFACE_KIND.plain);
        } else {
          used.add(stamp.surfaces[i]);
          expect(stamp.surfaces[i]).toBeGreaterThan(SURFACE_KIND.plain);
          expect(stamp.surfaces[i]).toBeLessThanOrEqual(SURFACE_KIND.utility);
        }
      }
      expect(used.has(expected[cls])).toBe(true);
      expect(used.has(SURFACE_KIND.roofTech)).toBe(true);
      expect(used.has(SURFACE_KIND.utility)).toBe(true);
    }
  });

  it('ha un unico dettaglio di tetto coerente con la classe', () => {
    let checked = 0;
    for (const { stamp, cls } of everyStamp(12)) {
      const top = stamp.sizeZ - 1;
      const topIds: number[] = [];
      for (let i = 0; i < stamp.sizeX * stamp.sizeY; i++) {
        const id = stamp.voxels[i + stamp.sizeX * stamp.sizeY * top];
        if (id !== STAMP_EMPTY) topIds.push(id);
      }
      expect(topIds).toEqual([CLASS_PROFILE[cls].roofProp]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('produce uno skyline alto ma non filiforme ai livelli alti', () => {
    let tallest = 0;
    for (let seed = 0; seed < 64; seed++) {
      const stamp = generateBuilding(ALL_CLASSES[2], BUILDER.maxLevel, seed);
      tallest = Math.max(tallest, stamp.sizeZ);
      expect(stamp.sizeX).toBe(4);
      expect(stamp.sizeZ / stamp.sizeX).toBeLessThanOrEqual(10);
    }
    expect(tallest).toBeGreaterThanOrEqual(30);
    expect(tallest).toBeLessThanOrEqual(40);
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
      const plane = stamp.sizeX * stamp.sizeY;
      for (let i = 0; i < plane; i++) {
        const id = stamp.voxels[i + plane];
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
