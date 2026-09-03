import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { ARCH } from './config/arch';
import { boundsOf, BuildingRegistry, envelopeOf, plotOf } from './BuildingRegistry';
import { recordStamp } from './recordStamp';
import { stampSolidAt } from './stamp';

/** Due sedimi da otto con quattro voxel di carreggiata in mezzo. */
const PART = { x: 12, y: 0, sizeX: 8, sizeY: 8 };

const PARTED = {
  id: 1,
  x: 0,
  y: 0,
  baseZ: 0,
  footprint: 8,
  height: 60,
  class: BUILDING_CLASS.residential,
  level: 16,
  seed: 4242,
  facing: 0,
  parts: [PART],
  arch: { face: 0, reach: 5, inset: 0, z: 26, rise: ARCH.rise, across: 0, width: 8, mate: 0 },
};

describe('plotOf', () => {
  it('e’ l’inviluppo, e basta, per chi ha un sedime solo', () => {
    const single = { ...PARTED, parts: undefined, arch: undefined };
    expect(plotOf(single)).toEqual([envelopeOf(single)]);
  });

  it('elenca i sedimi separati invece del riquadro che li contiene', () => {
    const plots = plotOf(PARTED);
    expect(plots).toHaveLength(2);
    expect(plots[1]).toEqual(PART);
    // **I due sedimi non sono il riquadro che li contiene**, ed e' l'unica cosa
    // che questa lista esiste per dire: `boundsOf` va da un capo all'altro,
    // strada compresa, e serve solo a chi misura un ingombro.
    const bounds = boundsOf(PARTED);
    expect(bounds).toEqual({ x: 0, y: 0, sizeX: PART.x + PART.sizeX, sizeY: 8 });
    expect(plots[0].sizeX).toBeLessThan(bounds.sizeX);
  });
});

describe('il registry di un edificio a due sedimi', () => {
  it('prende il suolo dei due lotti e non quello della strada', () => {
    const registry = new BuildingRegistry();
    const record = registry.add(PARTED);

    expect(registry.isOccupied(0, 0)).toBe(true);
    expect(registry.isOccupied(PART.x, 0)).toBe(true);
    // Fra i due c'e' la carreggiata: il braccio la scavalca — quindi `columns`
    // la conosce — ma il suolo resta pubblico.
    expect(registry.isOccupied(9, 0)).toBe(false);
    expect(registry.at(9, 0).some((other) => other.id === record.id)).toBe(true);

    // Niente si costruisce dentro il secondo sedime.
    expect(registry.overlaps(PART.x, PART.y, 4, record.baseZ, 10)).toBe(true);
    registry.remove(record.id);
    expect(registry.overlaps(PART.x, PART.y, 4, record.baseZ, 10)).toBe(false);
    expect(registry.isOccupied(0, 0)).toBe(false);
  });
});

describe('partedStamp', () => {
  it('disegna i due corpi e li lascia separati a terra', () => {
    const stamp = recordStamp(PARTED);
    const anchor = { x: PARTED.x, y: PARTED.y, z: PARTED.baseZ };

    expect(stamp.sizeX).toBe(boundsOf(PARTED).sizeX);
    // Alla base i due corpi sono pieni e la strada e' vuota: e' la stessa
    // affermazione degli indici, letta nei voxel.
    expect(stampSolidAt(stamp, anchor, 3, 3, PARTED.baseZ)).toBe(true);
    expect(stampSolidAt(stamp, anchor, PART.x + 3, 3, PARTED.baseZ)).toBe(true);
    expect(stampSolidAt(stamp, anchor, 9, 4, PARTED.baseZ)).toBe(false);
  });

  it('unisce i due corpi con un arco che ha una spalla per capo', () => {
    const stamp = recordStamp(PARTED);
    const anchor = { x: PARTED.x, y: PARTED.y, z: PARTED.baseZ };
    const z = PARTED.arch.z;

    // Il corso attraversa tutta la strada.
    for (let x = 8; x < PART.x; x++) {
      expect(stampSolidAt(stamp, anchor, x, PARTED.arch.across, z + 1)).toBe(true);
    }
    // **Il rinfianco si specchia**, perche' qui l'arco non incontra il braccio
    // di un altro ma il proprio secondo sedime: la spalla si allarga a tutti e
    // due i capi, e in mezzo l'intradosso e' alto.
    const under = z - ARCH.haunch;
    expect(stampSolidAt(stamp, anchor, 7, PARTED.arch.across, under)).toBe(true);
    expect(stampSolidAt(stamp, anchor, PART.x, PARTED.arch.across, under)).toBe(true);
    expect(stampSolidAt(stamp, anchor, 10, PARTED.arch.across, under)).toBe(false);
  });
});
