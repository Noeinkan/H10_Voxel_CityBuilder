import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { FARM_KIND } from './farms';
import {
  capacityAtLevel,
  deferConstruction,
  spendConstructionMaterials,
  upgradeBuilding,
  upgradeMaterialCost,
} from './materials';
import {
  addBuilding,
  createSimState,
  reviveSimState,
  toSimStateData,
} from './SimState';
import { testTerrain } from './testTerrain';
import { effectiveCount, tick } from './tick';

describe('economia verticale', () => {
  it('aumenta la capacita gradualmente fino a quattro edifici base', () => {
    expect(capacityAtLevel(0)).toBe(1);
    expect(capacityAtLevel(4)).toBe(2);
    expect(capacityAtLevel(12)).toBe(4);
  });

  it('lascia gratuito il tessuto e rende progressivamente costosi i grattacieli', () => {
    expect(upgradeMaterialCost(6)).toBe(0);
    expect(upgradeMaterialCost(7)).toBe(BALANCE.materials.upgradeBaseCost);
    expect(upgradeMaterialCost(8)).toBe(BALANCE.materials.upgradeBaseCost * 4);
    expect(upgradeMaterialCost(12)).toBe(BALANCE.materials.upgradeBaseCost * 36);
  });

  it('una promozione aggiorna capacita, specializzazione e costo del cantiere', () => {
    const placed = addBuilding(createSimState(), {
      x: 4,
      y: 5,
      class: BUILDING_CLASS.industrial,
    });
    const cost = upgradeMaterialCost(7);
    const upgraded = upgradeBuilding(placed, {
      x: 4,
      y: 5,
      class: BUILDING_CLASS.industrial,
      level: 7,
      specialization: 'farming',
    }, cost);

    expect(effectiveCount(upgraded, BUILDING_CLASS.industrial)).toBe(2.75);
    expect(upgraded.farmCounts[FARM_KIND.tower]).toBe(2.75);
    expect(upgraded.materials.stock).toBe(BALANCE.start.materials - cost);
    expect(upgraded.materialFlows.construction).toBe(cost);

    const working = {
      ...upgraded,
      population: { stock: 100, delta: 0 },
    };
    const after = tick(working, testTerrain({ chunksX: 1, chunksY: 1 }));
    expect(after.harvest.grown[FARM_KIND.tower]).toBeGreaterThan(0);
    expect(after.materialFlows.produced).toBe(0);
  });

  it('non promuove ne spende quando il magazzino non copre il prezzo', () => {
    const placed = addBuilding(createSimState(), {
      x: 4,
      y: 5,
      class: BUILDING_CLASS.residential,
    });
    const empty = { ...placed, materials: { stock: 0, delta: 0 } };
    const refused = upgradeBuilding(empty, {
      x: 4,
      y: 5,
      class: BUILDING_CLASS.residential,
      level: 7,
    }, upgradeMaterialCost(7));
    expect(refused).toBe(empty);
  });

  it('le opere speciali consumano lo stesso magazzino e compaiono nel referto', () => {
    const state = createSimState();
    const waiting = deferConstruction(state, 400);
    const spent = spendConstructionMaterials(waiting, 40);
    expect(spent?.materials.stock).toBe(BALANCE.start.materials - 40);
    expect(spent?.materialFlows.construction).toBe(40);
    expect(spent?.materialFlows.waitingCost).toBe(400);
    expect(spendConstructionMaterials(state, BALANCE.start.materials + 1)).toBeNull();
  });

  it('ricostruisce capacita e referto dai salvataggi precedenti', () => {
    const built = addBuilding(createSimState(), {
      x: 2,
      y: 3,
      class: BUILDING_CLASS.commercial,
      mixed: BUILDING_CLASS.residential,
      level: 8,
    });
    const {
      capacityCounts: _capacityCounts,
      mixedCapacityCounts: _mixedCapacityCounts,
      materialFlows: _materialFlows,
      ...legacy
    } = toSimStateData(built);
    const revived = reviveSimState(legacy as ReturnType<typeof toSimStateData>);

    expect(effectiveCount(revived, BUILDING_CLASS.commercial)).toBe(capacityAtLevel(8));
    expect(effectiveCount(revived, BUILDING_CLASS.residential))
      .toBe(capacityAtLevel(8) * BALANCE.mixedUse.secondaryShare);
    expect(revived.materialFlows.construction).toBe(0);
  });
});
