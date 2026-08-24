import { describe, expect, it } from 'vitest';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { solidCount, STAMP_EMPTY, stampIndex } from '../buildings/stamp';
import { BIOME } from '../terrain/config';
import { FLORA, TREE_SHAPES, TREE_SPECIES } from '../terrain/flora';
import { FARMS } from './config';
import { orchardStamp, orchardTrees } from './orchard';
import { planPlot, PLOT_KIND, type FarmPlot, type FarmPlotQuery } from './plotPlan';

function query(biome: number, overrides: Partial<FarmPlotQuery> = {}): FarmPlotQuery {
  return {
    x: 0,
    y: 0,
    seed: 1337,
    biomeAt: () => biome,
    slopeAt: () => 0,
    occupied: () => false,
    builtNear: () => 0,
    ...overrides,
  };
}

function plotOn(biome: number): FarmPlot {
  const plan = planPlot(query(biome));
  if (!plan.ok) throw new Error(`atteso un lotto, rifiutato per ${plan.reason}`);
  return plan.plot;
}

describe('la specie da frutto', () => {
  it('non cresce da sola: non compare in nessuna riga di FLORA', () => {
    // E' quello che le permette una sagoma potata — bassa, tonda, larga uguale —
    // senza che compaia in mezzo a un bosco vero.
    for (const flora of FLORA) {
      for (const entry of flora.species) {
        expect(entry.species).not.toBe(TREE_SPECIES.fruit);
      }
    }
  });

  it('ha una chioma abbastanza stretta da stare sul reticolo', () => {
    // E' l'invariante che tiene separate due chiome contigue: se il profilo
    // cresce senza allargare il passo, il frutteto diventa una siepe.
    const shape = TREE_SHAPES[TREE_SPECIES.fruit];
    const radius = shape.canopy.reduce((widest, level) => Math.max(widest, level.radius), 0);
    expect(radius).toBe(2);
  });

  it('porta il frutto in cima, nello stesso slot del grano maturo', () => {
    const shape = TREE_SHAPES[TREE_SPECIES.fruit];
    expect(shape.tones).toContain(PALETTE_SLOTS.metalBrass);
  });
});

describe('planPlot — cosa si pianta lo dice il bioma', () => {
  it('sul prato un campo, nel bosco e in collina un frutteto', () => {
    expect(plotOn(BIOME.plain).kind).toBe(PLOT_KIND.field);
    expect(plotOn(BIOME.forest).kind).toBe(PLOT_KIND.orchard);
    expect(plotOn(BIOME.hill).kind).toBe(PLOT_KIND.orchard);
  });

  it('decide sulla maggioranza delle colonne, non sull’angolo', () => {
    const side = FARMS.plotSide;
    // Un quadrato per tre quarti bosco resta un frutteto anche se l'angolo da
    // cui parte la scansione e' prato.
    const mostlyWood = planPlot(query(BIOME.plain, {
      biomeAt: (x) => (x < side * 0.75 ? BIOME.forest : BIOME.plain),
    }));
    expect(mostlyWood.ok && mostlyWood.plot.kind).toBe(PLOT_KIND.orchard);

    const mostlyGrass = planPlot(query(BIOME.plain, {
      biomeAt: (x) => (x < side * 0.25 ? BIOME.forest : BIOME.plain),
    }));
    expect(mostlyGrass.ok && mostlyGrass.plot.kind).toBe(PLOT_KIND.field);
  });
});

describe('orchardTrees — il reticolo', () => {
  it('gli alberi stanno dentro il lotto, bordo compreso', () => {
    const plot = plotOn(BIOME.forest);
    for (const tree of orchardTrees(plot, 7)) {
      expect(tree.x).toBeGreaterThanOrEqual(0);
      expect(tree.y).toBeGreaterThanOrEqual(0);
      expect(tree.x).toBeLessThan(plot.side);
      expect(tree.y).toBeLessThan(plot.side);
    }
  });

  it('due chiome non si toccano mai', () => {
    // Raggio 2 per specie piu' un voxel di jitter per lato: due alberi devono
    // restare a piu' di quattro colonne di distanza su almeno un asse.
    const plot = plotOn(BIOME.forest);
    const trees = orchardTrees(plot, 7);
    expect(trees.length).toBeGreaterThan(1);

    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const dx = Math.abs(trees[i].x - trees[j].x);
        const dy = Math.abs(trees[i].y - trees[j].y);
        expect({ pair: `${i}-${j}`, gap: Math.max(dx, dy) > 4 })
          .toEqual({ pair: `${i}-${j}`, gap: true });
      }
    }
  });

  it('e’ un reticolo, non un tiro di dado', () => {
    // Il jitter vale un voxel: gli alberi restano allineati in colonne
    // riconoscibili, ed e' quella regolarita' a dire «coltivato».
    const plot = plotOn(BIOME.forest);
    const trees = orchardTrees(plot, 7);
    const columns = new Set(trees.map((tree) => Math.round(tree.x / 5)));
    expect(columns.size).toBeLessThanOrEqual(Math.ceil(plot.side / 5));
  });

  it('e’ deterministico a parita’ di seme e di lotto', () => {
    const plot = plotOn(BIOME.forest);
    expect(orchardTrees(plot, 7)).toEqual(orchardTrees(plot, 7));
    expect(orchardTrees(plot, 7)).not.toEqual(orchardTrees(plot, 8));
  });
});

describe('orchardStamp — il volume', () => {
  it('sta dentro l’impronta del lotto e contiene alberi veri', () => {
    const plot = plotOn(BIOME.forest);
    const stamp = orchardStamp(plot, 7);

    expect(stamp.sizeX).toBe(plot.side);
    expect(stamp.sizeY).toBe(plot.side);
    expect(stamp.sizeZ).toBeGreaterThan(4);
    expect(solidCount(stamp)).toBeGreaterThan(0);
  });

  it('ha del tronco al suolo e della chioma sopra', () => {
    const plot = plotOn(BIOME.forest);
    const stamp = orchardStamp(plot, 7);

    const atLevel = (z: number): Set<number> => {
      const found = new Set<number>();
      for (let y = 0; y < stamp.sizeY; y++) {
        for (let x = 0; x < stamp.sizeX; x++) {
          const palette = stamp.voxels[stampIndex(stamp, x, y, z)];
          if (palette !== STAMP_EMPTY) found.add(palette);
        }
      }
      return found;
    };

    expect(atLevel(0).has(PALETTE_SLOTS.wood)).toBe(true);
    // In cima non c'e' piu' legno: e' tutta chioma.
    expect(atLevel(stamp.sizeZ - 1).has(PALETTE_SLOTS.wood)).toBe(false);
    expect(atLevel(stamp.sizeZ - 1).size).toBeGreaterThan(0);
  });

  it('compare per quote, come un edificio', () => {
    // Una fascia per z: la coda della crescita lo fa salire dal basso invece di
    // scaricarlo tutto in un frame.
    const stamp = orchardStamp(plotOn(BIOME.forest), 7);
    expect(stamp.bandStarts).toHaveLength(stamp.sizeZ + 1);
    expect(stamp.bandStarts[0]).toBe(0);
    expect(stamp.bandStarts.at(-1)).toBe(stamp.sizeZ);
  });

  it('e’ deterministico: due chiamate danno lo stesso volume', () => {
    const plot = plotOn(BIOME.forest);
    expect([...orchardStamp(plot, 7).voxels]).toEqual([...orchardStamp(plot, 7).voxels]);
  });
});
