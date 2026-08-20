import { describe, expect, it } from 'vitest';
import { Mesh, type LineBasicMaterial, type MeshBasicMaterial } from 'three';
import { PlacementCursor } from './PlacementCursor';

type Tinted = MeshBasicMaterial | LineBasicMaterial;

const materialsOf = (cursor: PlacementCursor): Tinted[] =>
  cursor.group.children.map((child) => (child as Mesh).material as Tinted);

describe('PlacementCursor', () => {
  it('parte nascosto e si mostra sulla colonna scelta', () => {
    const cursor = new PlacementCursor();
    expect(cursor.group.visible).toBe(false);

    cursor.show(4, -7, 12, true);

    expect(cursor.group.visible).toBe(true);
    // Centro della cella, quota della superficie: e' li' che finira' il click.
    expect(cursor.group.position.toArray()).toEqual([4.5, -6.5, 12]);

    cursor.hide();
    expect(cursor.group.visible).toBe(false);
  });

  it('colora ogni parte con lo stato del sito', () => {
    const cursor = new PlacementCursor();

    cursor.show(0, 0, 0, true);
    const valid = materialsOf(cursor).map((material) => material.color.getHex());
    cursor.show(0, 0, 0, false);
    const invalid = materialsOf(cursor).map((material) => material.color.getHex());

    expect(valid).not.toHaveLength(0);
    expect(new Set(valid).size).toBe(1);
    expect(new Set(invalid).size).toBe(1);
    expect(valid[0]).not.toBe(invalid[0]);
  });

  it('resta fuori dalla profondita’, cosi’ nessun rilievo lo nasconde', () => {
    const cursor = new PlacementCursor();

    for (const material of materialsOf(cursor)) {
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
    }
    for (const child of cursor.group.children) expect(child.renderOrder).toBe(30);
  });

  it('anima solo quando e’ a schermo', () => {
    const cursor = new PlacementCursor();
    const halo = cursor.group.children.find(
      (child) => child instanceof Mesh && child.geometry.type === 'RingGeometry',
    ) as Mesh;

    cursor.update(0.5);
    expect(halo.scale.x).toBe(1);

    cursor.show(0, 0, 0, true);
    cursor.update(0.5);
    const spread = halo.scale.x;
    expect(spread).toBeGreaterThan(1);

    // L'onda e' ciclica: dopo un periodo intero torna dov'era, non cresce.
    cursor.update(1.5);
    expect(halo.scale.x).toBeCloseTo(spread, 5);
  });
});
