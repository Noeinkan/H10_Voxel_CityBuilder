import { bench, describe } from 'vitest';
import { catalystById } from './catalysts';
import { previewDistrict } from './districtPreview';
import { ReachCache } from './reach';

const reach = new ReachCache();
const kinds = ['port', 'market', 'factory', 'park', 'transport', 'university'] as const;
const catalysts = kinds.map((kind, index) => {
  const role = catalystById(kind);
  return {
    kind,
    class: role.class,
    strength: role.strength,
    radius: role.radius,
    x: index * 24,
    y: index % 2 === 0 ? 0 : 16,
  };
});
const sources = { catalysts, policies: [], charters: [], reach };
const radius = catalystById('market').radius;
const formed = reach.get(32, 16, radius);
const distant = reach.get(139, 0, radius);

describe('anteprima quartiere sul movimento del cursore', () => {
  bench('coppia formata tra piu landmark', () => { previewDistrict(sources, 'market', formed); });
  bench('sito senza coppia formata', () => { previewDistrict(sources, 'market', distant); });
});
