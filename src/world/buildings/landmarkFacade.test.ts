import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { AERIAL_PART } from '../aerial/config';
import { SCALE } from '../scale';
import { Builder } from './Builder';
import { BuildingRegistry, footprintDepth } from './BuildingRegistry';
import { BUILDER } from './config';

describe('Builder — Skyport di facciata', () => {
  it('appende lo scalo fuori dalla torre e gli costruisce gli appoggi', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
    const builder = new Builder(world, map, 4242);
    // Lo Skyport corrente richiede una facciata mega: la fixture registra
    // direttamente un ospite largo, senza alterare la grammatica ordinaria per
    // farle superare il tetto di otto soltanto per questo test.
    const side = SCALE.megaFootprint;
    for (let z = 12; z < 108; z++) {
      for (let y = 40; y < 40 + side; y++) {
        for (let x = 40; x < 40 + side; x++) world.setBlock(x, y, z, 1);
      }
    }
    const host = (builder.registry as BuildingRegistry).add({
      x: 40,
      y: 40,
      baseZ: 12,
      footprint: side,
      height: 96,
      class: BUILDING_CLASS.residential,
      level: BUILDER.maxLevel,
      seed: 4242,
    });
    expect([host.footprint, footprintDepth(host)]).toEqual([side, side]);

    const verdict = builder.landmarkAloftSite(host.x, host.y, 'airport');
    expect(verdict.refusal).toBeNull();
    expect(verdict.site).not.toBeNull();
    if (verdict.site === null) return;

    const site = verdict.site;
    const hostDepth = footprintDepth(host);
    const outside = site.x + site.deck.rect.sizeX <= host.x ||
      site.x >= host.x + host.footprint ||
      site.y + site.deck.rect.sizeY <= host.y ||
      site.y >= host.y + hostDepth;
    expect(outside).toBe(true);
    expect(site.z).toBeLessThan(host.baseZ + host.height);
    expect(site.deck.piers.length).toBeGreaterThan(0);

    builder.placeLandmark(host.x, host.y, 'airport');
    const skyport = [...builder.registry.all].find(
      (record) => record.landmark === 'airport' && record.aloft === true,
    );
    expect(skyport).toBeDefined();
    expect(skyport?.supports?.[0]).toBe(host.id);

    const piers = skyport?.supports?.slice(1).map((id) => builder.registry.get(id)) ?? [];
    expect(piers.length).toBeGreaterThan(0);
    expect(piers.every((record) => record?.aerial === AERIAL_PART.pier)).toBe(true);
  });
});
