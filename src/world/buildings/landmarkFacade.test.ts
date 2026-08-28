import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { AERIAL_PART } from '../aerial/config';
import { AERIAL_FACE } from '../aerial/terracePlan';
import { SCALE } from '../scale';
import { FACING } from '../streets/streetGrid';
import { Builder } from './Builder';
import { BuildingRegistry, footprintDepth, type BuildingRecord } from './BuildingRegistry';
import { BUILDER } from './config';

/**
 * Un ospite largo registrato a mano, per i ruoli che chiedono la facciata mega.
 *
 * Lo Skyport corrente richiede una facciata mega: la fixture registra
 * direttamente un ospite largo, senza alterare la grammatica ordinaria per
 * farle superare il tetto di otto soltanto per questi test. `facing` dichiara
 * il fronte strada, o lo lascia assente.
 */
function megaHost(world: VoxelWorld, builder: Builder, facing?: number): BuildingRecord {
  const side = SCALE.megaFootprint;
  for (let z = 12; z < 108; z++) {
    for (let y = 40; y < 40 + side; y++) {
      for (let x = 40; x < 40 + side; x++) world.setBlock(x, y, z, 1);
    }
  }
  return (builder.registry as BuildingRegistry).add({
    x: 40,
    y: 40,
    baseZ: 12,
    footprint: side,
    height: 96,
    class: BUILDING_CLASS.residential,
    level: BUILDER.maxLevel,
    seed: 4242,
    facing,
  });
}

describe('Builder — Skyport di facciata', () => {
  it('appende lo scalo fuori dalla torre e gli costruisce gli appoggi', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
    const builder = new Builder(world, map, 4242);
    const host = megaHost(world, builder);
    expect([host.footprint, footprintDepth(host)]).toEqual([SCALE.megaFootprint, SCALE.megaFootprint]);

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

describe('Builder — la faccia sotto il puntatore', () => {
  it('la faccia preferita vince sul fronte strada, se regge', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
    const builder = new Builder(world, map, 4242);
    const host = megaHost(world, builder, FACING.east);

    const verdict = builder.landmarkAloftSite(host.x, host.y, 'airport', AERIAL_FACE.south);
    expect(verdict.refusal).toBeNull();
    expect(verdict.site?.facing).toBe(AERIAL_FACE.south);
  });

  it('senza faccia preferita resta il fronte strada', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
    const builder = new Builder(world, map, 4242);
    const host = megaHost(world, builder, FACING.east);

    const verdict = builder.landmarkAloftSite(host.x, host.y, 'airport');
    expect(verdict.site?.facing).toBe(FACING.east);
  });

  it('la mensola si appende alla faccia preferita, se regge', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
    const builder = new Builder(world, map, 4242);
    const host = megaHost(world, builder);

    const result = builder.terraceSite(host.x, host.y, AERIAL_FACE.south);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.face).toBe(AERIAL_FACE.south);
  });
});
