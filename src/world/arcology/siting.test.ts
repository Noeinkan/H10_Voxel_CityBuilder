import { describe, expect, it } from 'vitest';
import { TIER } from '../skyline/tiers';
import { FACING } from '../streets/streetGrid';
import { arcologyForBlock } from './catalog';
import { ARCOLOGY, ARCOLOGY_RECIPES } from './config';
import { arcologySpan } from './generate';
import {
  ARCOLOGY_REFUSALS,
  arcologyAnchor,
  arcologyQuota,
  arcologyReady,
  type ArcologyQuery,
} from './siting';

/** Un centro maturo e saturo su un isolato eletto: il caso che passa. */
function ready(over: Partial<ArcologyQuery> = {}): ArcologyQuery {
  return {
    existing: 0,
    buildings: 0,
    tier: TIER.core,
    blockRect: { x0: 0, y0: 0, x1: 19, y1: 19 },
    spanX: 20,
    spanY: 20,
    builtNeighbours: ARCOLOGY.minBuilt,
    cappedNeighbours: ARCOLOGY.minCapped,
    ...over,
  };
}

describe('arcologyQuota', () => {
  it('parte da due anche senza edifici, e cresce con la citta', () => {
    expect(arcologyQuota(0)).toBe(2);
    expect(arcologyQuota(ARCOLOGY.buildingsPerArcology)).toBe(2);
    expect(arcologyQuota(ARCOLOGY.buildingsPerArcology * 2 + 1)).toBe(3);
    expect(arcologyQuota(ARCOLOGY.buildingsPerArcology * 4)).toBe(4);
  });
});

describe('arcologyReady', () => {
  it('accetta il centro denso e saturo di un isolato eletto', () => {
    expect(arcologyReady(ready())).toBeNull();
  });

  it('rifiuta quando la citta ne ha gia quante ne ammette', () => {
    expect(arcologyReady(ready({ existing: arcologyQuota(0) }))).toBe('enough');
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
    expect(arcologyReady(ready({ blockRect: { x0: 3, y0: 7, x1: 22, y1: 26 } }))).toBeNull();
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

  it('l ordine delle domande e parte della regola: la quota d isola viene per prima', () => {
    // Un'isola piena risponde «enough» anche dove tutto il resto sarebbe
    // sbagliato: e' l'informazione utile, e le altre non cambierebbero niente.
    const hopeless = ready({
      existing: arcologyQuota(0),
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
    // e' la quota — un numero derivato dagli edifici — non una probabilita'.
    expect(ARCOLOGY_REFUSALS).not.toContain('notPeak');
  });
});

describe('arcologyAnchor', () => {
  it('cade al centro dell isolato, cosi l ingombro ci sta simmetrico', () => {
    expect(arcologyAnchor({ x0: 0, y0: 0, x1: 19, y1: 19 })).toEqual({ x: 9, y: 9 });
    expect(arcologyAnchor({ x0: 10, y0: 4, x1: 25, y1: 21 })).toEqual({ x: 17, y: 12 });
  });
});

describe('catalogo sul reticolo reale', () => {
  it('sceglie una forma il cui ingombro entra nel riquadro restituito', () => {
    for (let seed = 0; seed < 8; seed++) {
      for (let kx = 0; kx < 24; kx++) {
        const pick = arcologyForBlock(seed, kx, 0, FACING.east);
        const span = arcologySpan(pick.recipe, FACING.east);
        expect(span.sizeX).toBeLessThanOrEqual(pick.rect.x1 - pick.rect.x0 + 1);
        expect(span.sizeY).toBeLessThanOrEqual(pick.rect.y1 - pick.rect.y0 + 1);
      }
    }
  });

  it('le multi-blocco dichiarano un cluster e un ingombro oltre l isolato', () => {
    const multi = ARCOLOGY_RECIPES.filter((r) => r.blocks[0] > 1 || r.blocks[1] > 1);
    // Elencate per nome: un conteggio direbbe «quante» e resterebbe verde anche
    // se una variante avesse preso il posto della propria matrice.
    expect(new Set(multi.map((recipe) => recipe.kind))).toEqual(new Set([
      'doubleBar',
      'stackPair',
      'quadCluster',
      'triSpan',
      'steppedBar',
      'courtCascade',
    ]));
    for (const recipe of multi) {
      expect(Math.max(recipe.span[0], recipe.span[1])).toBeGreaterThan(20);
    }
  });

  it('sugli isolati larghi rende raggiungibile ogni forma del catalogo', () => {
    const kinds = new Set<string>();
    for (let kx = 0; kx < 256; kx++) {
      kinds.add(arcologyForBlock(4242, kx, 0, FACING.east).recipe.kind);
    }
    expect(kinds).toEqual(new Set(ARCOLOGY_RECIPES.map((recipe) => recipe.kind)));
  });

  it('la scelta resta deterministica', () => {
    expect(arcologyForBlock(1337, 4, -2, FACING.north)).toEqual(
      arcologyForBlock(1337, 4, -2, FACING.north),
    );
  });
});
