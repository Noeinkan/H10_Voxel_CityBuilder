import { describe, expect, it } from 'vitest';

import type { BuildingRecord, ReadonlyBuildingRegistry } from '../world/buildings/BuildingRegistry';
import type { TerrainColumn, TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { INSPECT, INSPECT_MODE, type InspectMode } from './inspect';
import { createInspectView, type FocusCell, type InspectView } from './InspectView';
import type { IsoCameraController } from './IsoCameraController';
import type { VoxelMaterialHandle } from './VoxelMaterial';

/**
 * `InspectView` non importa Three ne' tocca il DOM — le sue dipendenze pesanti
 * entrano tutte come `import type` — e questo file lo verifica girando in node.
 * Gli stub portano solo cio' che la vista legge davvero: la camera un perno, il
 * materiale un metodo che non fa niente, il terreno una quota per colonna.
 */

/** Quota del suolo al centro dell'inquadratura, dove ripiega chi non punta niente. */
const CENTRE_HEIGHT = 12;

/** Quota di una collina qualunque, distinta dalla precedente perche' si vedano. */
const HILL_HEIGHT = 30;

/** Una seconda collina, per provare che la fetta **non** ci sale dietro. */
const FAR_HEIGHT = 60;

const VIEW: readonly [number, number, number] = [0.5, 0.5, -0.7];

const world = { bounds: { empty: true, maxZ: 0 } } as unknown as VoxelWorld;

const camera = { targetPosition: { x: 0, y: 0, z: 0 } } as unknown as IsoCameraController;

const paletteHandle = { setInspect: () => {} } as unknown as VoxelMaterialHandle;

const map = {
  columnAt: (x: number, y: number): TerrainColumn => ({
    height: x === 0 && y === 0 ? CENTRE_HEIGHT : HILL_HEIGHT,
    biome: 0,
    slope: 0,
    buildable: true,
  }),
} as unknown as TerrainMap;

interface Harness {
  readonly view: InspectView;
  /** Cosa c'e' sotto il cursore; `null` e' il raggio che manca l'isola. */
  point(cell: FocusCell | null): void;
}

function makeView(
  options: {
    sliceZ?: number;
    sliceFromUrl?: boolean;
    mode?: InspectMode;
    registry?: () => ReadonlyBuildingRegistry | undefined;
  } = {},
): Harness {
  let pointed: FocusCell | null = null;
  const view = createInspectView({
    world,
    camera,
    paletteHandle,
    guides: null,
    streets: null,
    map: () => map,
    registry: options.registry ?? (() => undefined),
    pointedCellAt: () => pointed,
    toolActive: () => false,
    mode: options.mode ?? INSPECT_MODE.slice,
    sliceZ: options.sliceZ ?? INSPECT.defaultSliceZ,
    sliceFromUrl: options.sliceFromUrl ?? false,
  });
  return {
    view,
    point(cell: FocusCell | null): void {
      pointed = cell;
    },
  };
}

/** Il cursore sulla canvas, su una colonna nota. */
function hover(harness: Harness, cell: FocusCell): void {
  harness.point(cell);
  harness.view.onPointerMove(10, 10);
}

describe('InspectView, quota della fetta', () => {
  it('si arma sul suolo sotto il cursore', () => {
    const harness = makeView();
    hover(harness, { x: 4, y: 4, z: HILL_HEIGHT });
    harness.view.apply(VIEW);

    expect(harness.view.sliceZ).toBe(HILL_HEIGHT + INSPECT.sliceCoarse);
  });

  it('aperta senza il cursore sulla canvas si arma sul centro dell inquadratura', () => {
    const harness = makeView();
    harness.view.apply(VIEW);

    expect(harness.view.sliceZ).toBe(CENTRE_HEIGHT + INSPECT.sliceCoarse);
  });

  it('non insegue il cursore dopo essersi armata', () => {
    const harness = makeView();
    hover(harness, { x: 4, y: 4, z: HILL_HEIGHT });
    harness.view.apply(VIEW);

    // Il difetto: la citta' si apriva e si richiudeva da sola muovendo il mouse.
    hover(harness, { x: 40, y: 40, z: FAR_HEIGHT });
    harness.view.apply(VIEW);

    expect(harness.view.sliceZ).toBe(HILL_HEIGHT + INSPECT.sliceCoarse);
  });

  it('non salta al centro dell inquadratura quando il raggio manca l isola', () => {
    const harness = makeView();
    hover(harness, { x: 4, y: 4, z: HILL_HEIGHT });
    harness.view.apply(VIEW);

    // L'altra meta' dello stesso difetto: fuori dall'isola `pointedCellAt` non
    // risponde, e la quota si inchiodava sul centro dell'inquadratura.
    harness.point(null);
    harness.view.apply(VIEW);

    expect(harness.view.sliceZ).toBe(HILL_HEIGHT + INSPECT.sliceCoarse);
  });

  it('non riscrive una quota scelta a mano', () => {
    const harness = makeView();
    harness.view.setSliceZ(CENTRE_HEIGHT);
    hover(harness, { x: 4, y: 4, z: HILL_HEIGHT });
    harness.view.apply(VIEW);

    expect(harness.view.sliceZ).toBe(CENTRE_HEIGHT);
  });

  it('con ?slice= resta alla quota chiesta', () => {
    const harness = makeView({ sliceZ: CENTRE_HEIGHT, sliceFromUrl: true });
    hover(harness, { x: 4, y: 4, z: HILL_HEIGHT });
    harness.view.apply(VIEW);

    expect(harness.view.sliceZ).toBe(CENTRE_HEIGHT);
  });

  it('si ri-arma uscendo da Levels e rientrando', () => {
    const harness = makeView();
    hover(harness, { x: 4, y: 4, z: HILL_HEIGHT });
    harness.view.apply(VIEW);

    harness.view.setMode(INSPECT_MODE.off);
    harness.view.setMode(INSPECT_MODE.slice);
    hover(harness, { x: 40, y: 40, z: FAR_HEIGHT });
    harness.view.apply(VIEW);

    expect(harness.view.sliceZ).toBe(FAR_HEIGHT + INSPECT.sliceCoarse);
  });
});

describe('InspectView, la ricerca del landmark', () => {
  function landmark(x: number, y: number, extra: Partial<BuildingRecord> = {}): BuildingRecord {
    return {
      id: 1,
      x,
      y,
      baseZ: 12,
      footprint: 4,
      height: 20,
      class: 0,
      level: 1,
      seed: 0,
      landmark: 'market',
      ...extra,
    };
  }

  function building(x: number, y: number): BuildingRecord {
    return {
      id: 2,
      x,
      y,
      baseZ: 12,
      footprint: 4,
      height: 40,
      class: 0,
      level: 3,
      seed: 0,
    };
  }

  function registryOf(records: BuildingRecord[]): ReadonlyBuildingRegistry {
    return {
      all: records[Symbol.iterator](),
      at: (x: number, y: number) => records.filter((record) => {
        const depth = record.footprintY ?? record.footprint;
        return x >= record.x && x < record.x + record.footprint
          && y >= record.y && y < record.y + depth;
      }),
    } as unknown as ReadonlyBuildingRegistry;
  }

  it('punta il landmark piu’ vicino e lo accende, non l’edificio sotto il cursore', () => {
    const lm = landmark(100, 100);
    const harness = makeView({
      mode: INSPECT_MODE.xray,
      registry: () => registryOf([building(90, 90), lm]),
    });
    hover(harness, { x: 104, y: 104, z: 40 });
    harness.view.apply(VIEW);

    // La lente guarda il landmark anche se il cursore sta su una colonna di
    // confine: e' cio' che i raggi X esistono per trovare, non l'edificio alto.
    const lens = harness.view.payload;
    expect(lens.lensMin[0]).toBeLessThanOrEqual(lm.x);
    expect(lens.glowMin).toEqual([100, 100, 12]);
    expect(lens.glowMax).toEqual([104, 104, 32]);
    expect(lens.glowMax[0]).toBeGreaterThan(lens.glowMin[0]);
  });

  it('fuori portata lascia l’edificio sotto il cursore e non accende niente', () => {
    const harness = makeView({
      mode: INSPECT_MODE.xray,
      registry: () => registryOf([landmark(200, 200), building(90, 90)]),
    });
    hover(harness, { x: 92, y: 92, z: 40 });
    harness.view.apply(VIEW);

    const lens = harness.view.payload;
    expect(lens.glowMax[0]).toBeLessThanOrEqual(lens.glowMin[0]);
    // La lente resta l'edificio puntato: il pavimento e' la sua base.
    expect(lens.lensMin[3]).toBe(12);
  });

  it('misura la distanza dall’impronta, non dal solo angolo minimo', () => {
    // Una struttura lineare — footprint lungo y — aggancia il cursore sul
    // fianco, dove l'angolo minimo e' lontano ma la struttura passa vicino.
    const pier = landmark(100, 100, { footprintY: 40 });
    const harness = makeView({
      mode: INSPECT_MODE.xray,
      registry: () => registryOf([pier]),
    });
    hover(harness, { x: 102, y: 130, z: 12 });
    harness.view.apply(VIEW);

    expect(harness.view.payload.glowMax[0]).toBeGreaterThan(harness.view.payload.glowMin[0]);
  });

  it('senza registro non c’e’ nessun landmark da accendere', () => {
    const harness = makeView({ mode: INSPECT_MODE.xray });
    hover(harness, { x: 92, y: 92, z: 40 });
    harness.view.apply(VIEW);

    expect(harness.view.payload.glowMax[0]).toBeLessThanOrEqual(harness.view.payload.glowMin[0]);
  });
});
