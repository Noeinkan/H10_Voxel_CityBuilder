import { describe, expect, it } from 'vitest';
import { SKYLINE } from '../skyline/config';
import { TIER } from '../skyline/tiers';
import { FACING } from '../streets/streetGrid';
import { arcologyForBlock } from './catalog';
import {
  ARCOLOGY,
  ARCOLOGY_RECIPES,
  SUNKEN_ARCOLOGY_RECIPES,
  TALL_ARCOLOGY_RECIPES,
} from './config';
import { arcologySpan } from './generate';
import {
  ARCOLOGY_REFUSALS,
  arcologyAnchor,
  arcologyQuota,
  arcologyReady,
  earthscraperReady,
  type ArcologyQuery,
  type SunkenQuery,
} from './siting';

/** Un centro maturo e saturo sulla cresta del cono: il caso che passa. */
function ready(over: Partial<ArcologyQuery> = {}): ArcologyQuery {
  return {
    existing: 0,
    buildings: 0,
    tier: TIER.core,
    heightBonus: SKYLINE.coneBonus,
    blockRect: { x0: 0, y0: 0, x1: 19, y1: 19 },
    spanX: 20,
    spanY: 20,
    builtNeighbours: ARCOLOGY.minBuilt,
    cappedNeighbours: ARCOLOGY.minCapped,
    ...over,
  };
}

/**
 * Lo stesso centro, sulla **spalla** del cono: dove si scava invece di salire.
 *
 * Resta `core`, e non e' un dettaglio della fixture: e' li' che la famiglia
 * interrata vive, perche' e' l'unica fascia che offra i vicini che una
 * megastruttura chiede.
 */
function digReady(over: Partial<SunkenQuery> = {}): SunkenQuery {
  return {
    ...ready({ heightBonus: SKYLINE.coneBonus - 1 }),
    availableDepth: 26,
    requiredDepth: 22,
    dryRim: true,
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

describe('earthscraperReady', () => {
  it('accetta la spalla del cono, densa e satura, con roccia a sufficienza', () => {
    expect(earthscraperReady(digReady())).toBeNull();
    expect(earthscraperReady(digReady({ heightBonus: 0 }))).toBeNull();
  });

  it('rifiuta la cresta: li la gerarchia concentra altezza, quindi si sale', () => {
    // **E' la coppia di righe che tiene torri e crateri su isolati diversi**,
    // senza che il driver debba arbitrare: sullo stesso isolato le due
    // condizioni non possono essere vere insieme.
    expect(earthscraperReady(digReady({ heightBonus: SKYLINE.coneBonus }))).toBe('tooHigh');
    expect(arcologyReady(ready({ heightBonus: SKYLINE.coneBonus }))).toBeNull();
  });

  it('non chiede una fascia propria, e la misura ha smentito il progetto', () => {
    // La prima versione chiedeva `tier !== core`, e non aveva siti: il tessuto
    // denso di una citta' cresciuta e' **tutto** `core`, e cio' che sta fuori e'
    // rado e costiero, cioe' senza vicini e non scavabile. Il centro resta
    // percio' ammesso, ed e' il bonus di quota a distinguere dentro di esso.
    expect(earthscraperReady(digReady({ tier: TIER.core }))).toBeNull();
    expect(earthscraperReady(digReady({ tier: TIER.fringe }))).toBeNull();
  });

  it('rifiuta dove la roccia non basta', () => {
    expect(earthscraperReady(digReady({ availableDepth: 21, requiredDepth: 22 })))
      .toBe('tooShallow');
    expect(earthscraperReady(digReady({ availableDepth: 22, requiredDepth: 22 })))
      .toBeNull();
  });

  it('rifiuta dove l acqua arriva troppo vicino, per quanto profondo sia', () => {
    // Il pozzo scende sotto il livello del mare, e la roccia attorno e' tutto
    // cio' che lo tiene asciutto.
    expect(earthscraperReady(digReady({ dryRim: false, availableDepth: 99 })))
      .toBe('tooShallow');
  });

  it('condivide con l arcologia le domande che non cambiano', () => {
    expect(earthscraperReady(digReady({ existing: arcologyQuota(0) }))).toBe('enough');
    expect(earthscraperReady(digReady({ builtNeighbours: ARCOLOGY.minBuilt - 1 }))).toBe('thin');
    expect(earthscraperReady(digReady({ cappedNeighbours: ARCOLOGY.minCapped - 1 })))
      .toBe('notCapped');
    expect(earthscraperReady(digReady({ blockRect: { x0: 0, y0: 0, x1: 14, y1: 19 } })))
      .toBe('blockTooSmall');
  });

  it('l ordine delle domande e parte della regola: la quota viene prima della cresta', () => {
    expect(earthscraperReady(digReady({
      existing: arcologyQuota(0),
      heightBonus: SKYLINE.coneBonus,
    }))).toBe('enough');
    // E la profondita' viene prima delle due misure care sul registry: chi
    // interroga venti isolati in fila non deve pagarle dove la roccia gia' manca.
    expect(earthscraperReady(digReady({ availableDepth: 0, builtNeighbours: 0 })))
      .toBe('tooShallow');
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
      'craterRing',
    ]));
    for (const recipe of multi) {
      expect(Math.max(recipe.span[0], recipe.span[1])).toBeGreaterThan(20);
    }
  });

  it('sugli isolati larghi rende raggiungibile ogni forma della famiglia chiesta', () => {
    const reachable = (family: 'tall' | 'sunken'): Set<string> => {
      const kinds = new Set<string>();
      for (let kx = 0; kx < 256; kx++) {
        kinds.add(arcologyForBlock(4242, kx, 0, FACING.east, family).recipe.kind);
      }
      return kinds;
    };
    expect(reachable('tall')).toEqual(new Set(TALL_ARCOLOGY_RECIPES.map((r) => r.kind)));
    expect(reachable('sunken')).toEqual(new Set(SUNKEN_ARCOLOGY_RECIPES.map((r) => r.kind)));
  });

  it('non mescola le due famiglie: la gerarchia sceglie, non la fortuna', () => {
    // E' la riga che tiene torri e crateri su isolati diversi. Senza, una volta
    // su cinque la cresta del cono si sarebbe presa un pozzo e la spalla una
    // guglia — in entrambi i casi la megastruttura che ignora la ragione per cui
    // esiste.
    for (let kx = 0; kx < 64; kx++) {
      expect(arcologyForBlock(4242, kx, 0, FACING.east, 'tall').recipe.sunken).toBeUndefined();
      expect(arcologyForBlock(4242, kx, 0, FACING.east, 'sunken').recipe.sunken).toBeDefined();
    }
  });

  it('salta le ricette piu profonde di quanta roccia il sito offra', () => {
    // Lo stesso scorrimento in avanti che gia' salta le forme troppo larghe.
    // Con sedici quote disponibili resta soltanto la corte, che e' la ragione
    // per cui il catalogo interrato ne ha una bassa.
    for (let kx = 0; kx < 64; kx++) {
      const pick = arcologyForBlock(4242, kx, 0, FACING.east, 'sunken', 16);
      expect(pick.recipe.sunken!.depth, pick.recipe.kind).toBeLessThanOrEqual(16);
    }
  });

  it('la scelta resta deterministica', () => {
    expect(arcologyForBlock(1337, 4, -2, FACING.north)).toEqual(
      arcologyForBlock(1337, 4, -2, FACING.north),
    );
  });
});
