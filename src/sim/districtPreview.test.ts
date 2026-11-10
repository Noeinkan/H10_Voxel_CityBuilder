import { describe, expect, it } from 'vitest';
import { catalystById, type CatalystId } from './catalysts';
import { previewDistrict } from './districtPreview';
import { urbanFieldAt } from './districts';
import { ReachCache } from './reach';

function placed(kind: CatalystId, x: number, y = 0) {
  const definition = catalystById(kind);
  return { kind, x, y, class: definition.class, strength: definition.strength, radius: definition.radius };
}

function preview(kind: CatalystId, x: number, existing: readonly ReturnType<typeof placed>[]) {
  const reach = new ReachCache();
  const sources = { catalysts: existing, policies: [], charters: [], reach };
  const field = reach.get(x, 0, catalystById(kind).radius);
  return { result: previewDistrict(sources, kind, field), sources };
}

describe('previewDistrict', () => {
  it('promette il quartiere solo dove la simulazione lo forma', () => {
    const { result, sources } = preview('market', 30, [placed('port', 0)]);
    expect(result).toMatchObject({ status: 'formed', district: 'harbor' });
    expect(urbanFieldAt({ ...sources, catalysts: [...sources.catalysts, placed('market', 30)] }, 15, 0).district)
      .toBe('harbor');
  });

  it('distingue un partner vicino ma senza sovrapposizione sufficiente', () => {
    expect(preview('market', 140, [placed('port', 0)]).result)
      .toMatchObject({ status: 'near', district: 'harbor' });
    expect(preview('market', 200, [placed('port', 0)]).result).toBeNull();
  });

  it('indica il partner piu vicino quando nessuna coppia supera la soglia', () => {
    const result = preview('market', 0, [placed('port', -140), placed('port', 120)]).result;
    expect(result).toMatchObject({ status: 'near', partner: { x: 120 } });
    expect(result?.partners).toHaveLength(2);
  });

  it('non promette il garden quarter quando il porto impone quello harbor', () => {
    const { result } = preview('park', 0, [placed('market', 0), placed('port', 0)]);
    expect(result).toMatchObject({ status: 'blocked', district: 'garden', competing: 'harbor' });
  });

  it('non inventa una coppia per un ruolo senza regola di quartiere', () => {
    expect(preview('school', 0, [placed('market', 0)]).result).toBeNull();
  });
});
