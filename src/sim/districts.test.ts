import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from './classes';
import { CATALYSTS } from './catalysts';
import { urbanProfileAt } from './districts';
import type { Catalyst } from './DesirabilityField';

function source(kind: Catalyst['kind'], x = 0, y = 0): Catalyst {
  const definition = CATALYSTS.find((entry) => entry.id === kind);
  if (definition === undefined) throw new Error('fixture catalizzatore non valida');
  return {
    x,
    y,
    kind,
    class: definition.class,
    strength: definition.strength,
    radius: definition.radius,
  };
}

describe('distretti emergenti', () => {
  it('espone sette ruoli con effetti distinti', () => {
    expect(CATALYSTS).toHaveLength(7);
    expect(new Set(CATALYSTS.map((entry) => JSON.stringify(entry.effects))).size).toBe(7);
  });

  it('fa emergere un distretto solo dalla sovrapposizione dei campi', () => {
    expect(urbanProfileAt([source('market')], [], 0, 0).district).toBe('outskirts');
    expect(urbanProfileAt([source('market'), source('park')], [], 0, 0).district).toBe('garden');
    expect(urbanProfileAt([source('port'), source('factory')], [], 0, 0).district).toBe('harbor');
  });

  it('rende osservabile nello spazio l effetto delle policy', () => {
    const catalysts = [source('market'), source('transport')];
    const base = urbanProfileAt(catalysts, [], 0, 0);
    const dense = urbanProfileAt(catalysts, ['denseHousing'], 0, 0);
    expect(dense.density).toBeGreaterThan(base.density);

    const civic: Catalyst = {
      ...source('university'),
      class: BUILDING_CLASS.civic,
    };
    const normal = urbanProfileAt([civic], [], 0, 0);
    const austere = urbanProfileAt([civic], ['austerity'], 0, 0);
    expect(austere.satisfaction).toBeLessThan(normal.satisfaction);
  });
});
