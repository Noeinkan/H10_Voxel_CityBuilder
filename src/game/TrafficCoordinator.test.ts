import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimState } from '../sim';
import type { Builder } from '../world/buildings/Builder';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { planTraffic } from '../world/traffic/routes';
import { TrafficCoordinator } from './TrafficCoordinator';

vi.mock('../world/traffic/routes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../world/traffic/routes')>();
  return { ...actual, planTraffic: vi.fn(() => []) };
});

const state = {
  catalysts: [],
  trade: { food: 0, materials: 0, materialsIn: 0 },
  population: { stock: 0 },
} as unknown as SimState;

function coordinator(): TrafficCoordinator {
  const builder = {
    ropewayRides: [],
    registry: { count: 0, landmarkCount: 0, all: [] },
    harborWorks: 0,
    stats: { growing: 0, surfaceQueued: 0 },
  } as unknown as Builder;
  return new TrafficCoordinator(
    builder,
    {} as TerrainMap,
    {} as VoxelWorld,
    () => null,
  );
}

describe('TrafficCoordinator', () => {
  beforeEach(() => vi.mocked(planTraffic).mockClear());

  it('condivide la stessa rotta fra pose, fumo e scia e la invalida al caricamento', () => {
    const traffic = coordinator();
    expect(traffic.poses(state, 0)).toEqual([]);
    expect(traffic.puffs(state, 1)).toEqual([]);
    expect(traffic.wake(state, 2)).toEqual([]);
    expect(planTraffic).toHaveBeenCalledTimes(1);

    traffic.invalidate();
    traffic.poses(state, 3);
    expect(planTraffic).toHaveBeenCalledTimes(2);
  });
});
