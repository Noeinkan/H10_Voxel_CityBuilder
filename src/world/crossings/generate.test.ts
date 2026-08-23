import { describe, expect, it } from 'vitest';
import { PALETTE_SIZE } from '../../engine/paletteSlots';
import { STAMP_EMPTY } from '../buildings/stamp';
import { CROSSINGS } from './config';
import { chooseCrossing, crossingBaseZ, type CrossingPlan, type CrossingProbe } from './crossingPlan';
import { generateCrossing, generateCrossingPier } from './generate';

const SHORE_TOP = 20;
const SEA_FLOOR = 8;

function channel(from: number, to: number): CrossingProbe {
  const wet = (x: number): boolean => x >= from && x <= to;
  return {
    ground: (x) => (wet(x) ? SEA_FLOOR : SHORE_TOP),
    land: (x) => !wet(x),
    occupied: () => false,
    solid: () => false,
  };
}

function groundPlan(): CrossingPlan {
  const result = chooseCrossing({ ...channel(20, 49), x: 15, y: 100 });
  if (!result.ok) throw new Error(`atteso un piano, rifiutato per ${result.refusal}`);
  return result.plan;
}

/** Voxel della carreggiata di un segmento, indicizzati per colonna di mondo. */
function deckColumns(plan: CrossingPlan): Set<string> {
  const out = new Set<string>();
  for (const segment of plan.segments) {
    const stamp = generateCrossing(plan, segment);
    for (let ly = 0; ly < segment.sizeY; ly++) {
      for (let lx = 0; lx < segment.sizeX; lx++) {
        const index = lx + segment.sizeX * (ly + segment.sizeY * CROSSINGS.girderDepth);
        if (stamp.voxels[index] !== STAMP_EMPTY) out.add(`${segment.x + lx},${segment.y + ly}`);
      }
    }
  }
  return out;
}

describe('generatore degli attraversamenti', () => {
  it('la carreggiata e continua: i segmenti la ricompongono senza buchi', () => {
    // E' la proprieta' per cui i segmenti esistono, e l'unica che spezzare una
    // corsa puo' rompere: un voxel mancante al confine fra due tratti sarebbe un
    // buco in mezzo al ponte, invisibile finche' non ci si passa sopra.
    const plan = groundPlan();
    const columns = deckColumns(plan);

    expect(columns.size).toBe(plan.sizeX * plan.sizeY);
    for (let x = plan.x; x < plan.x + plan.sizeX; x++) {
      for (let y = plan.y; y < plan.y + plan.sizeY; y++) {
        expect(columns.has(`${x},${y}`), `${x},${y}`).toBe(true);
      }
    }
  });

  it('di taglio ha travi ai bordi e vuoto in mezzo', () => {
    const plan = groundPlan();
    // Un tratto centrale, lontano dalle mensole e dalle pile: e' li' che la
    // travatura deve mostrare le due correnti e l'aria fra loro.
    const middle = plan.segments.find(
      (segment) =>
        segment.x > plan.x + CROSSINGS.corbel + CROSSINGS.pierSpacing &&
        !plan.piers.some((pier) => pier.x < segment.x + segment.sizeX && pier.x + pier.sizeX > segment.x),
    );
    expect(middle).toBeDefined();

    const stamp = generateCrossing(plan, middle!);
    const girderRow = (ly: number): number =>
      stamp.voxels[0 + middle!.sizeX * (ly + middle!.sizeY * 0)];

    expect(girderRow(0)).not.toBe(STAMP_EMPTY);
    expect(girderRow(middle!.sizeY - 1)).not.toBe(STAMP_EMPTY);
    for (let ly = 1; ly < middle!.sizeY - 1; ly++) {
      expect(girderRow(ly), `filare ${ly}`).toBe(STAMP_EMPTY);
    }
  });

  it('sopra una pila la travatura si richiude', () => {
    // Una pila che incontrasse l'aria fra le due correnti reggerebbe il vuoto.
    const plan = groundPlan();
    const pier = plan.piers.find((p) => p.sizeY === CROSSINGS.pierSide);
    expect(pier).toBeDefined();

    const segment = plan.segments.find(
      (s) => pier!.x >= s.x && pier!.x < s.x + s.sizeX,
    )!;
    const stamp = generateCrossing(plan, segment);
    const lx = pier!.x - segment.x;
    const ly = pier!.y - segment.y;
    expect(stamp.voxels[lx + segment.sizeX * ly]).not.toBe(STAMP_EMPTY);
  });

  it('una pila e piena dal fondale alla trave, con il coronamento in cima', () => {
    const plan = groundPlan();
    const pier = plan.piers.find((p) => p.sizeY === CROSSINGS.pierSide)!;
    const stamp = generateCrossingPier(pier);

    expect(stamp.sizeZ).toBe(crossingBaseZ(plan.deckZ) - SEA_FLOOR);
    for (const id of stamp.voxels) {
      expect(id).not.toBe(STAMP_EMPTY);
      expect(id).toBeLessThan(PALETTE_SIZE);
    }

    const top = pier.sizeX * pier.sizeY * (pier.height - 1);
    expect(stamp.voxels[top]).toBe(CROSSINGS.pierCoping);
    expect(stamp.voxels[0]).toBe(CROSSINGS.girderPalette);
  });

  it('un ponte in quota non genera nessuna pila', () => {
    const towers = [
      { id: 1, x: 0, y: 0, sizeX: 8, sizeY: 8, baseZ: SHORE_TOP, height: 60 },
      { id: 2, x: 30, y: 0, sizeX: 8, sizeY: 8, baseZ: SHORE_TOP, height: 70 },
    ];
    const result = chooseCrossing({
      ground: () => SHORE_TOP,
      land: () => true,
      occupied: () => false,
      solid: (x, y, z) =>
        towers.some(
          (t) =>
            x >= t.x && x < t.x + t.sizeX &&
            y >= t.y && y < t.y + t.sizeY &&
            z >= t.baseZ && z < t.baseZ + t.height,
        ),
      x: 4,
      y: 4,
      from: towers[0],
      towers,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.piers).toHaveLength(0);
    // Senza pile la travatura resta aperta in mezzo su tutta la corsa: e'
    // l'invariante «il vuoto sotto e' il contenuto», la stessa delle campate.
    const columns = deckColumns(result.plan);
    expect(columns.size).toBe(result.plan.sizeX * result.plan.sizeY);
  });
});
