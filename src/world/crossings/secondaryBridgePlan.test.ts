import { describe, expect, it } from 'vitest';
import type { Region } from '../terrain/region';
import {
  type CrossingProbe,
  type CrossingTower,
} from './crossingPlan';
import { chooseSecondaryBridge } from './secondaryBridgePlan';

const PRIMARY: Region = { minX: -40, minY: -20, sizeX: 60, sizeY: 40 };
const SECONDARY: Region = { minX: 20, minY: -20, sizeX: 60, sizeY: 40 };

function tower(id: number, x: number, height = 64): CrossingTower {
  return { id, x, y: 0, sizeX: 8, sizeY: 8, baseZ: 20, height };
}

function channel(towers: readonly CrossingTower[], wet = true): CrossingProbe {
  return {
    ground: (x) => x >= 8 && x < 30 ? 8 : 20,
    land: (x) => !wet || x < 8 || x >= 30,
    occupied: () => false,
    solid: (x, y, z) => towers.some((entry) =>
      x >= entry.x && x < entry.x + entry.sizeX &&
      y >= entry.y && y < entry.y + entry.sizeY &&
      z >= entry.baseZ && z < entry.baseZ + entry.height),
  };
}

describe('ponte automatico verso un settore secondario', () => {
  it('unisce una torre secondaria matura alla primaria sopra acqua vera', () => {
    const towers = [tower(1, 0), tower(2, 30)];
    const plan = chooseSecondaryBridge({
      primary: PRIMARY,
      secondary: SECONDARY,
      towers,
      probe: channel(towers),
    });

    expect(plan).not.toBeNull();
    expect(plan?.supports).toEqual([1, 2]);
    expect(plan?.piers).toHaveLength(0);
  });

  it('non premia come collegamento fra isole due torri con terra sotto', () => {
    const towers = [tower(1, 0), tower(2, 30)];
    expect(chooseSecondaryBridge({
      primary: PRIMARY,
      secondary: SECONDARY,
      towers,
      probe: channel(towers, false),
    })).toBeNull();
  });

  it('aspetta che anche il settore secondario abbia un edificio abbastanza alto', () => {
    const towers = [tower(1, 0), tower(2, 30, 20)];
    expect(chooseSecondaryBridge({
      primary: PRIMARY,
      secondary: SECONDARY,
      towers,
      probe: channel(towers),
    })).toBeNull();
  });

  it('non collega due torri che appartengono entrambe alla citta primaria', () => {
    const towers = [tower(1, -30), tower(2, 0)];
    expect(chooseSecondaryBridge({
      primary: PRIMARY,
      secondary: SECONDARY,
      towers,
      probe: channel(towers),
    })).toBeNull();
  });
});
