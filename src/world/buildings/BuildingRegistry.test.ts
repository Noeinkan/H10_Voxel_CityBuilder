import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { BuildingRegistry, type BuildingRecord } from './BuildingRegistry';

function record(
  x: number,
  y: number,
  baseZ: number,
  footprint = 1,
  height = 4,
): Omit<BuildingRecord, 'id'> {
  return { x, y, baseZ, footprint, height, class: BUILDING_CLASS.residential, level: 0, seed: 1 };
}

describe('BuildingRegistry', () => {
  it('rileva la sovrapposizione di due impronte alla stessa quota', () => {
    const registry = new BuildingRegistry();
    registry.add(record(10, 10, 12, 3));

    expect(registry.overlaps(10, 10, 1, 12, 4)).toBe(true);
    expect(registry.overlaps(12, 12, 1, 12, 4)).toBe(true);
    expect(registry.overlaps(13, 10, 1, 12, 4)).toBe(false);
    expect(registry.overlaps(9, 9, 2, 12, 4)).toBe(true);
  });

  it('lascia convivere due volumi sulla stessa colonna a quote disgiunte', () => {
    // E' la condizione della crescita verticale: senza, un edificio non potrebbe
    // mai poggiare sul tetto di un altro.
    const registry = new BuildingRegistry();
    registry.add(record(4, 4, 12, 1, 6)); // occupa z 12..17

    expect(registry.overlaps(4, 4, 1, 18, 5)).toBe(false);
    expect(registry.overlaps(4, 4, 1, 17, 5)).toBe(true);
    expect(registry.overlaps(4, 4, 1, 8, 4)).toBe(false);
    expect(registry.overlaps(4, 4, 1, 8, 5)).toBe(true);
  });

  it('topOf da\' la prima quota libera sopra la colonna', () => {
    const registry = new BuildingRegistry();
    expect(registry.topOf(4, 4)).toBe(0);

    registry.add(record(4, 4, 12, 2, 6));
    expect(registry.topOf(4, 4)).toBe(18);
    expect(registry.topOf(5, 5)).toBe(18);
    expect(registry.topOf(6, 6)).toBe(0);
  });

  it('withinRadius coincide con una scansione lineare', () => {
    const registry = new BuildingRegistry();
    const all: BuildingRecord[] = [];
    for (let i = 0; i < 400; i++) {
      all.push(registry.add(record((i * 37) % 200, (i * 61) % 200, 12)));
    }

    for (const [cx, cy, r] of [[50, 50, 10], [0, 0, 40], [199, 199, 5], [100, 100, 64]]) {
      const found = registry.withinRadius(cx, cy, r).map((b) => b.id).sort((a, b) => a - b);
      const expected = all
        .filter((b) => Math.abs(b.x - cx) <= r && Math.abs(b.y - cy) <= r)
        .map((b) => b.id)
        .sort((a, b) => a - b);
      expect(found).toEqual(expected);
    }
  });

  it('remove pulisce entrambi gli indici', () => {
    const registry = new BuildingRegistry();
    const stored = registry.add(record(20, 20, 12, 3));

    expect(registry.count).toBe(1);
    expect(registry.remove(stored.id)).toBe(true);
    expect(registry.count).toBe(0);
    expect(registry.at(21, 21)).toHaveLength(0);
    expect(registry.withinRadius(20, 20, 8)).toHaveLength(0);
    expect(registry.overlaps(20, 20, 3, 12, 4)).toBe(false);
    expect(registry.countsByClass[BUILDING_CLASS.residential]).toBe(0);
  });

  it('replace conserva l\'id e aggiorna gli indici', () => {
    const registry = new BuildingRegistry();
    const stored = registry.add(record(30, 30, 12, 1, 4));

    const grown = registry.replace(stored.id, { ...record(30, 30, 12, 3, 9), level: 1 });
    expect(grown).not.toBeNull();
    expect(grown?.id).toBe(stored.id);
    expect(registry.count).toBe(1);

    // Le colonne nuove dell'impronta allargata sono coperte, e la vecchia quota
    // non e' rimasta indietro.
    expect(registry.at(32, 32)).toHaveLength(1);
    expect(registry.topOf(30, 30)).toBe(21);
    expect(registry.levelHistogram[0]).toBe(0);
    expect(registry.levelHistogram[1]).toBe(1);
  });
});
