import { describe, expect, it } from 'vitest';
import { AERIAL, AERIAL_PART } from './config';
import { planDeck, type DeckPlan, type DeckRect } from './deckPlan';
import { generateDeck } from './generate';
import { TestGround } from './testProbe';
import { STAMP_EMPTY, type VoxelStamp } from '../buildings/stamp';

/**
 * Il generatore in quota, verificato su cio' che si vede da fuori: la **sezione**.
 *
 * I predicati della forma li copre `terraceForm.test.ts`; qui si controlla che
 * arrivino fino ai voxel, e che arrivino **solo alla mensola** — un tratto di
 * percorso e un nodo devono restare l'impalcato simmetrico che erano.
 */

/** Una parete alta, e la mensola che le si appende accanto senza chiedere gambe. */
function ledge(depth = AERIAL.reach): DeckPlan {
  const ground = new TestGround(4).box(10, 20, 1, 6, 4, 31, 7);
  const rect: DeckRect = { x: 11, y: 20, sizeX: depth, sizeY: 6 };
  const anchor: DeckRect = { x: 10, y: 20, sizeX: 1, sizeY: 6 };

  const result = planDeck({ rect, deckZ: 30, anchors: [anchor], ...ground });
  if (!result.ok) throw new Error(`il caso di prova non regge: ${result.refusal}`);
  // Senza gambe la sezione e' solo quella della mensola: `overPier` non ci mette
  // nervature in mezzo, e cio' che si misura e' la rastremazione e basta.
  expect(result.plan.piers).toHaveLength(0);
  return result.plan;
}

/** Voxel pieni di una colonna dello stamp, dal basso in alto. */
function columnHeight(stamp: VoxelStamp, lx: number, ly: number): number {
  let count = 0;
  for (let lz = 0; lz < stamp.sizeZ; lz++) {
    if (stamp.voxels[lx + stamp.sizeX * (ly + stamp.sizeY * lz)] !== STAMP_EMPTY) count++;
  }
  return count;
}

describe('generateDeck — la sezione di una mensola', () => {
  it('cala dalla parete alla punta invece di essere spessa uguale', () => {
    const plan = ledge();
    const stamp = generateDeck(plan, AERIAL_PART.terrace, plan.segments[0]);
    const mid = 3;

    // All'attacco la travatura c'e' tutta; all'estremo resta il solo piano.
    expect(columnHeight(stamp, 0, mid)).toBe(AERIAL.girderDepth + 1);
    expect(columnHeight(stamp, stamp.sizeX - 1, mid)).toBe(1);
  });

  it('gli angoli esterni sono smussati, quelli contro la parete no', () => {
    const plan = ledge();
    const stamp = generateDeck(plan, AERIAL_PART.terrace, plan.segments[0]);
    const tip = stamp.sizeX - 1;

    expect(columnHeight(stamp, tip, 0)).toBe(0);
    expect(columnHeight(stamp, tip, stamp.sizeY - 1)).toBe(0);
    expect(columnHeight(stamp, 0, 0)).toBeGreaterThan(0);
    expect(columnHeight(stamp, 0, stamp.sizeY - 1)).toBeGreaterThan(0);
  });

  it('un tratto di percorso resta l impalcato simmetrico di sempre', () => {
    // **La rastremazione e' della mensola, non degli impalcati.** Un tratto sta
    // in aria appeso ai propri capi: non ha un davanti rispetto a cui calare, e
    // assottigliargli un lato lo lascerebbe storto senza motivo.
    const plan = ledge();
    const stamp = generateDeck(plan, AERIAL_PART.walk, plan.segments[0]);
    const mid = 3;

    expect(columnHeight(stamp, 0, mid)).toBe(AERIAL.girderDepth + 1);
    expect(columnHeight(stamp, stamp.sizeX - 1, mid)).toBe(AERIAL.girderDepth + 1);
    expect(columnHeight(stamp, stamp.sizeX - 1, 0)).toBe(AERIAL.girderDepth + 1);
  });
});
