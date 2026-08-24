import { describe, expect, it } from 'vitest';
import type { BufferAttribute, Mesh } from 'three';
import { RopewayView, type CableLine } from './RopewayView';
import type { LightingModel } from './lighting';

/**
 * La fune dal lato della geometria.
 *
 * **Il verso delle facce non lo dice nessun tipo.** Una fune con i quad avvolti
 * al contrario nasce con le normali rivolte all'interno, il culling la scarta
 * tutta, e a schermo non c'e' niente da vedere: e' il difetto che questo file
 * esiste per prendere, ed e' anche l'unico di questa classe che un test in
 * ambiente `node` puo' verificare senza una GPU.
 */

const LINE: CableLine = {
  id: 1,
  path: [
    { x: 0, y: 0, z: 20 },
    { x: 12, y: 0, z: 17 },
    { x: 24, y: 0, z: 20 },
  ],
};

/** Un modello di luce qualunque: qui conta che i colori vengano scritti. */
const LIGHT: LightingModel = {
  sun: { azimuth: 135, elevation: 45, color: '#ffffff', intensity: 1, wrap: 0.4 },
  skyLight: { color: '#8899bb', intensity: 0.4 },
  bounceLight: { color: '#665544', intensity: 0.2 },
};

function meshOf(view: RopewayView): Mesh {
  const mesh = view.group.children[0] as Mesh | undefined;
  if (mesh === undefined) throw new Error('la vista non ha costruito nessuna mesh');
  return mesh;
}

describe('RopewayView', () => {
  it('costruisce una mesh sola per tutte le funi', () => {
    const view = new RopewayView();
    view.setLines([LINE]);
    expect(view.group.children).toHaveLength(1);
  });

  it('ogni faccia guarda in fuori: una fune avvolta al contrario sparirebbe', () => {
    const view = new RopewayView();
    view.setLines([LINE]);
    const geometry = meshOf(view).geometry;
    const position = geometry.getAttribute('position') as BufferAttribute;
    const index = geometry.getIndex()!;

    for (let t = 0; t < index.count; t += 3) {
      const a = vertexAt(position, index.getX(t));
      const b = vertexAt(position, index.getX(t + 1));
      const c = vertexAt(position, index.getX(t + 2));

      const normal = cross(sub(b, a), sub(c, a));
      const centre = scale(add(add(a, b), c), 1 / 3);
      // Il punto della fune sotto questo triangolo: e' l'asse del concio, e la
      // normale deve allontanarsene invece di puntarci contro.
      const axis = nearestOnPath(LINE, centre);
      expect(dot(normal, sub(centre, axis))).toBeGreaterThan(0);
    }
  });

  it('lo stesso array non ricostruisce niente, uno nuovo si', () => {
    const view = new RopewayView();
    const lines = [LINE];
    view.setLines(lines);
    const first = meshOf(view).geometry;

    view.setLines(lines);
    expect(meshOf(view).geometry).toBe(first);

    view.setLines([LINE, { id: 2, path: LINE.path }]);
    expect(meshOf(view).geometry).not.toBe(first);
  });

  it('senza linee non lascia niente in scena', () => {
    const view = new RopewayView();
    view.setLines([LINE]);
    view.setLines([]);
    expect(view.group.children).toHaveLength(0);
  });

  it('la luce scrive un colore per vertice, e non lo lascia nero', () => {
    const view = new RopewayView();
    view.setLines([LINE]);
    view.setLighting(new Array(32).fill('#cc9944'), LIGHT);

    const colours = meshOf(view).geometry.getAttribute('color') as BufferAttribute;
    let sum = 0;
    for (let i = 0; i < colours.count; i++) sum += colours.getX(i);
    expect(sum).toBeGreaterThan(0);
  });
});

type Vec = readonly [number, number, number];

function vertexAt(attribute: BufferAttribute, i: number): Vec {
  return [attribute.getX(i), attribute.getY(i), attribute.getZ(i)];
}

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vec, b: Vec): Vec {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vec, k: number): Vec {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function cross(a: Vec, b: Vec): Vec {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Il punto della spezzata piu' vicino a `point`: l'asse su cui il concio e' infilato. */
function nearestOnPath(line: CableLine, point: Vec): Vec {
  let best: Vec = [line.path[0].x, line.path[0].y, line.path[0].z];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i + 1 < line.path.length; i++) {
    const from: Vec = [line.path[i].x, line.path[i].y, line.path[i].z];
    const to: Vec = [line.path[i + 1].x, line.path[i + 1].y, line.path[i + 1].z];
    const span = sub(to, from);
    const t = Math.max(0, Math.min(1, dot(sub(point, from), span) / dot(span, span)));
    const spot = add(from, scale(span, t));
    const distance = dot(sub(point, spot), sub(point, spot));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = spot;
    }
  }
  return best;
}
