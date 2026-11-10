import { LineSegments, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { catalystById, ReachCache } from '../sim';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { InfluenceOverlay } from './InfluenceOverlay';

const port = catalystById('port');
const market = catalystById('market');
const source = {
  kind: 'port' as const,
  class: port.class,
  strength: port.strength,
  radius: port.radius,
  x: 0,
  y: 0,
};

describe('InfluenceOverlay: anteprima del quartiere', () => {
  it('accende il partner e la zona comune, poi li spegne lasciando il colore originale', () => {
    const map = { heightAt: () => 0 } as unknown as TerrainMap;
    const reach = new ReachCache();
    const catalysts = [source, { ...source, x: 110 }];
    const overlay = new InfluenceOverlay(map);
    overlay.refreshCatalysts(catalysts, reach);

    const summary = overlay.showCursor(30, 0, market.radius, true, reach, 'market', {
      catalysts,
      policies: [],
      charters: [],
      reach,
    });
    expect(summary.pairing?.district).toBe('harbor');

    const existing = overlay.group.children[0];
    expect(existing.children[0]).toBeInstanceOf(LineSegments);
    const partner = existing.children[0] as LineSegments;
    expect(partner.renderOrder).toBe(23);
    expect(existing.children[1].renderOrder).toBe(19);

    const area = overlay.group.children[5];
    expect(area).toBeInstanceOf(Mesh);
    expect(area.visible).toBe(true);
    expect((area as Mesh).geometry.getAttribute('position').count).toBeGreaterThan(0);

    overlay.hideCursor();
    expect(area.visible).toBe(false);
    expect(partner.renderOrder).toBe(18);
    expect(existing.children[1].renderOrder).toBe(18);
  });
});
