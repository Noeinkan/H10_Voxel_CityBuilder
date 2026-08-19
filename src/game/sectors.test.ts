import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../world/terrain/config';
import { classifyBiome, isBuildable } from '../world/terrain/biomes';
import { HeightField } from '../world/terrain/heightField';
import { shapeFromRegion } from '../world/terrain/region';
import { coastalSectorAt, shapeWithSector } from './sectors';

const BASE = { minX: 0, minY: 0, sizeX: 256, sizeY: 256 };

describe('settori costieri', () => {
  it('assegna identificatori stabili ai quattro lati e ai segmenti', () => {
    expect(coastalSectorAt(20, 250, BASE, 64).id).toBe('north-0');
    expect(coastalSectorAt(250, 90, BASE, 64).id).toBe('east-1');
    expect(coastalSectorAt(180, 2, BASE, 64).id).toBe('south-2');
    expect(coastalSectorAt(1, 220, BASE, 64).id).toBe('west-3');
  });

  it('aggiunge terra utile fuori dal bordo con raccordo continuo', () => {
    const sector = coastalSectorAt(32, 250, BASE, 64);
    const shape = shapeWithSector(shapeFromRegion(BASE), sector);
    const field = new HeightField(1337, shape);
    let land = 0;
    let buildable = 0;
    let worst = 0;

    for (let y = sector.generationRegion.minY; y < sector.region.minY + sector.region.sizeY; y++) {
      for (let x = sector.region.minX; x < sector.region.minX + sector.region.sizeX; x++) {
        const height = field.heightAt(x, y);
        if (y >= sector.region.minY && height >= TERRAIN.beachMaxHeight) {
          land++;
          const slope = Math.max(
            Math.abs(field.heightAt(x + 1, y) - height),
            Math.abs(field.heightAt(x - 1, y) - height),
            Math.abs(field.heightAt(x, y + 1) - height),
            Math.abs(field.heightAt(x, y - 1) - height),
          );
          const biome = classifyBiome(Math.floor(height), slope);
          if (isBuildable(biome, slope)) buildable++;
        }
        worst = Math.max(worst, Math.abs(field.heightAt(x, y + 1) - height));
      }
    }

    expect(land).toBeGreaterThan(100);
    expect(buildable).toBeGreaterThan(50);
    expect(worst).toBeLessThan(1);
  });

  it('non duplica la stessa estensione nella maschera', () => {
    const sector = coastalSectorAt(32, 250, BASE, 64);
    const once = shapeWithSector(shapeFromRegion(BASE), sector);
    expect(shapeWithSector(once, sector)).toBe(once);
  });
});
