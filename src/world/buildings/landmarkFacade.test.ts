import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { AERIAL_PART } from '../aerial/config';
import { Builder } from './Builder';
import { footprintDepth } from './BuildingRegistry';

describe('Builder — Skyport di facciata', () => {
  it('appende lo scalo fuori dalla torre e gli costruisce gli appoggi', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
    const builder = new Builder(world, map, 4242);
    builder.materialize([{
      x: 40,
      y: 40,
      class: BUILDING_CLASS.residential,
      level: 8,
    }]);

    const host = [...builder.registry.all][0];
    expect(host).toBeDefined();
    if (host === undefined) return;
    expect([host.footprint, footprintDepth(host)]).toEqual([8, 8]);

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
