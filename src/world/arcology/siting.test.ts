import { describe, expect, it } from 'vitest';
import { TIER } from '../skyline/tiers';
import { FACING } from '../streets/streetGrid';
import { arcologyForBlock } from './catalog';
import { ARCOLOGY, ARCOLOGY_KIND, ARCOLOGY_RECIPES } from './config';
import {
  ARCOLOGY_REFUSALS,
  arcologyAnchor,
  arcologyReady,
  type ArcologyQuery,
} from './siting';

/** Un centro maturo e saturo su un isolato eletto: il caso che passa. */
function ready(over: Partial<ArcologyQuery> = {}): ArcologyQuery {
  return {
    existing: 0,
    tier: TIER.core,
    blockRect: { x0: 0, y0: 0, x1: 19, y1: 19 },
    spanX: 16,
    spanY: 16,
    builtNeighbours: ARCOLOGY.minBuilt,
    cappedNeighbours: ARCOLOGY.minCapped,
    ...over,
  };
}

describe('arcologyReady', () => {
  it('accetta il centro denso e saturo di un isolato eletto', () => {
    expect(arcologyReady(ready())).toBeNull();
  });

  it('rifiuta quando l isola ne ha gia abbastanza', () => {
    expect(arcologyReady(ready({ existing: ARCOLOGY.maxPerIsland }))).toBe('enough');
  });

  it('rifiuta fuori dal centro: la corona e il tessuto intermedio non ne hanno', () => {
    expect(arcologyReady(ready({ tier: TIER.fringe }))).toBe('notCore');
    expect(arcologyReady(ready({ tier: TIER.middle }))).toBe('notCore');
  });

  it('rifiuta l isolato che non contiene l ingombro, su tutti e due gli assi', () => {
    expect(arcologyReady(ready({ blockRect: { x0: 0, y0: 0, x1: 14, y1: 19 } })))
      .toBe('blockTooSmall');
    expect(arcologyReady(ready({ blockRect: { x0: 0, y0: 0, x1: 19, y1: 14 } })))
      .toBe('blockTooSmall');
  });

  it('accetta un isolato largo esattamente quanto l ingombro', () => {
    expect(arcologyReady(ready({ blockRect: { x0: 3, y0: 7, x1: 18, y1: 22 } }))).toBeNull();
  });

  it('rifiuta dove non c e abbastanza citta costruita', () => {
    expect(arcologyReady(ready({ builtNeighbours: ARCOLOGY.minBuilt - 1 }))).toBe('thin');
  });

  it('rifiuta dove la citta sta ancora crescendo da sola', () => {
    // E' la condizione della fase: non «qui c'e' molta citta'» ma «qui la citta'
    // non ha piu' niente da diventare». Un quartiere denso che sta ancora
    // salendo di livello non la vuole.
    expect(arcologyReady(ready({ cappedNeighbours: ARCOLOGY.minCapped - 1 }))).toBe('notCapped');
  });

  it('l ordine delle domande e parte della regola: il tetto d isola viene per primo', () => {
    // Un'isola piena risponde «enough» anche dove tutto il resto sarebbe
    // sbagliato: e' l'informazione utile, e le altre non cambierebbero niente.
    const hopeless = ready({
      existing: ARCOLOGY.maxPerIsland,
      tier: TIER.fringe,
      builtNeighbours: 0,
      cappedNeighbours: 0,
    });
    expect(arcologyReady(hopeless)).toBe('enough');
  });

  it('non chiede un isolato eletto a picco, ed e una misura e non un gusto', () => {
    // Con quella riga in piu' non nasceva **nessuna** arcologia su nessun seed:
    // due terzi degli isolati eletti sono piu' stretti dell'ingombro e il centro
    // e' piccolo, quindi l'intersezione era vuota. La governance dell'eccezione
    // e' `maxPerIsland`, che e' un numero esatto invece di una probabilita'.
    expect(ARCOLOGY_REFUSALS).not.toContain('notPeak');
    expect(ARCOLOGY.maxPerIsland).toBeLessThanOrEqual(2);
  });
});

describe('arcologyAnchor', () => {
  it('cade al centro dell isolato, cosi l ingombro ci sta simmetrico', () => {
    expect(arcologyAnchor({ x0: 0, y0: 0, x1: 19, y1: 19 })).toEqual({ x: 9, y: 9 });
    expect(arcologyAnchor({ x0: 10, y0: 4, x1: 25, y1: 21 })).toEqual({ x: 17, y: 12 });
  });
});

describe('catalogo sul reticolo reale', () => {
  it('su un isolato da quattordici sceglie una forma che entra', () => {
    const rect = { x0: 0, y0: 0, x1: 13, y1: 13 };
    for (let seed = 0; seed < 32; seed++) {
      const recipe = arcologyForBlock(seed, 0, 0, rect, FACING.east);
      expect(recipe.kind).not.toBe(ARCOLOGY_KIND.twinStem);
      expect(recipe.span[0]).toBeLessThanOrEqual(14);
      expect(recipe.span[1]).toBeLessThanOrEqual(14);
    }
  });

  it('sugli isolati larghi rende raggiungibile ogni forma del catalogo', () => {
    const rect = { x0: 0, y0: 0, x1: 19, y1: 19 };
    const kinds = new Set<string>();
    for (let kx = 0; kx < 64; kx++) {
      kinds.add(arcologyForBlock(4242, kx, 0, rect, FACING.east).kind);
    }
    expect(kinds).toEqual(new Set(ARCOLOGY_RECIPES.map((recipe) => recipe.kind)));
  });

  it('la scelta resta deterministica', () => {
    const rect = { x0: 10, y0: 20, x1: 29, y1: 39 };
    expect(arcologyForBlock(1337, 4, -2, rect, FACING.north)).toBe(
      arcologyForBlock(1337, 4, -2, rect, FACING.north),
    );
  });
});
