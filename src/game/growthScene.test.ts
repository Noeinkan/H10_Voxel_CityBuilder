import { describe, expect, it } from 'vitest';
import { testTerrain } from '../sim/testTerrain';
import { BUILDING_CLASS } from '../sim';
import { VoxelWorld } from '../world/VoxelWorld';
import { GrowthScene } from './growthScene';

describe('GrowthScene', () => {
  it('impone l’ordine del tutorial e registra una sola volta i settori', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);

    expect(scene.placeCatalyst(32, 16, BUILDING_CLASS.industrial)).toEqual({
      success: false,
      reason: 'onboarding-order',
    });
    expect(scene.placeCatalyst(16, 16, BUILDING_CLASS.residential).success).toBe(true);
    expect(scene.stats.onboarding.step).toBe('factory');
  });

  it('chiude il ciclo tick, costruzione e registrazione voxel', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);
    expect(scene.placeCatalyst(16, 16, BUILDING_CLASS.residential).success).toBe(true);
    expect(scene.placeCatalyst(32, 16, BUILDING_CLASS.industrial).success).toBe(true);
    for (let i = 0; i < 20; i++) scene.advance(0.1);
    expect(scene.stats.tick).toBe(20);
    expect(scene.stats.buildings).toBeGreaterThan(0);
    expect(scene.registry.count).toBe(scene.stats.buildings);
    expect(world.solidVoxelCount).toBeGreaterThan(0);
  });

  it('fa emergere usi misti e tipologie diverse da catalizzatori sovrapposti', () => {
    // E' la prova di fase 3 sul percorso vero: nessuno sceglie una zona, nessuno
    // sceglie una forma. Si piazzano tre catalizzatori sovrapposti e si guarda
    // cosa la citta' ne fa.
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 3, chunksY: 3, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 96, sizeY: 96 }, 4242);

    expect(scene.placeCatalyst(40, 40, 'market').success).toBe(true);
    expect(scene.placeCatalyst(52, 44, 'factory').success).toBe(true);
    expect(scene.placeCatalyst(44, 56, 'park').success).toBe(true);

    for (let i = 0; i < 600; i++) scene.advance(0.1);

    const stats = scene.stats;
    // Quattro usi vivi, non tre: il commerciale nasce da solo dove il mercato
    // arriva, senza che nessuno l'abbia chiesto.
    expect(stats.countsByClass[BUILDING_CLASS.commercial]).toBeGreaterThan(0);
    expect(stats.countsByClass[BUILDING_CLASS.residential]).toBeGreaterThan(0);

    // Isolati a uso misto dalla sovrapposizione dei campi.
    expect(stats.mixedByClass.reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);

    // E almeno due tipologie riconoscibili, scelte dal luogo e non dal seme.
    expect(stats.typologies.length).toBeGreaterThanOrEqual(2);
    for (const [, count] of stats.typologies) expect(count).toBeGreaterThan(0);
  });

  it('promuove gli edifici e produce crescita verticale osservabile', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);
    expect(scene.placeCatalyst(16, 16, BUILDING_CLASS.residential).success).toBe(true);
    expect(scene.placeCatalyst(32, 16, BUILDING_CLASS.industrial).success).toBe(true);

    for (let i = 0; i < 240; i++) scene.advance(0.1);

    expect(scene.stats.builder.upgraded).toBeGreaterThan(0);
    expect(scene.stats.levels.slice(1).some((count) => count > 0)).toBe(true);
  });

  it('rispetta pausa e velocita del ciclo di gioco', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 32, sizeY: 32 }, 9);
    scene.setPaused(true);
    scene.advance(1);
    expect(scene.stats.tick).toBe(0);
    scene.setPaused(false);
    scene.setSpeed(2);
    scene.advance(0.1);
    expect(scene.stats.tick).toBe(2);
  });
});
