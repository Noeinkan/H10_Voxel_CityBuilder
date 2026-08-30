import { describe, expect, it } from 'vitest';
import { ARCOLOGY } from './config';
import {
  arcologyGaps,
  arcologyStanding,
  compareProspects,
  nextQuotaAt,
  prospectProgress,
  sunkenGaps,
  type ArcologyGap,
  type ArcologyProspect,
} from './prospect';
import {
  arcologyQuota,
  ARCOLOGY_REFUSALS,
  arcologyReady,
  earthscraperReady,
  type ArcologyQuery,
  type BlockBounds,
  type SunkenQuery,
} from './siting';

/** Le stesse fixture di `siting.test.ts`: il caso che passa, e la sua spalla. */
function ready(over: Partial<ArcologyQuery> = {}): ArcologyQuery {
  return {
    existing: 0,
    buildings: 0,
    blockRect: { x0: 0, y0: 0, x1: 19, y1: 19 },
    spanX: 20,
    spanY: 20,
    builtNeighbours: ARCOLOGY.minBuilt,
    cappedNeighbours: ARCOLOGY.minCapped,
    ...over,
  };
}

function digReady(over: Partial<SunkenQuery> = {}): SunkenQuery {
  return {
    ...ready(),
    availableDepth: 26,
    requiredDepth: 22,
    dryRim: true,
    ...over,
  };
}

const FITS: BlockBounds = { x0: 0, y0: 0, x1: 19, y1: 19 };
const NARROW: BlockBounds = { x0: 0, y0: 0, x1: 14, y1: 19 };
const SHALLOW: BlockBounds = { x0: 0, y0: 0, x1: 19, y1: 14 };

/**
 * Tutte le combinazioni delle condizioni, una per volta e tutte insieme.
 *
 * Centoquattro casi non sono tanti quanto sembrano — sono cinque domande con
 * due o tre risposte ciascuna — e sono l'unico modo di provare che due funzioni
 * che leggono le stesse soglie dicano davvero la stessa cosa. Un pugno di casi
 * scelti a mano proverebbe che concordano *li'*.
 */
function everyQuery(): readonly ArcologyQuery[] {
  const out: ArcologyQuery[] = [];
  for (const existing of [0, arcologyQuota(0)]) {
    for (const blockRect of [FITS, NARROW, SHALLOW]) {
      for (const builtNeighbours of [ARCOLOGY.minBuilt, ARCOLOGY.minBuilt - 1]) {
        for (const cappedNeighbours of [ARCOLOGY.minCapped, ARCOLOGY.minCapped - 1, 0]) {
          out.push(ready({ existing, blockRect, builtNeighbours, cappedNeighbours }));
        }
      }
    }
  }
  return out;
}

function everySunkenQuery(): readonly SunkenQuery[] {
  const out: SunkenQuery[] = [];
  for (const base of everyQuery()) {
    for (const dryRim of [true, false]) {
      for (const availableDepth of [26, 21]) {
        out.push({ ...base, dryRim, availableDepth, requiredDepth: 22 });
      }
    }
  }
  return out;
}

/** Come la lacuna si legge in un messaggio di fallimento. */
function label(gaps: readonly ArcologyGap[]): string {
  return gaps.map((gap) => `${gap.refusal} ${gap.have ?? '-'}/${gap.need ?? '-'}`).join(', ');
}

describe('arcologyGaps', () => {
  it('non ha lacune esattamente dove il predicato accetta', () => {
    expect(arcologyGaps(ready())).toEqual([]);
    expect(arcologyReady(ready())).toBeNull();
  });

  /**
   * **E' l'invariante che tiene insieme i due file.** Il driver decide con
   * `arcologyReady` e l'interfaccia racconta con `arcologyGaps`: se le due
   * divergessero, il pannello prometterebbe una megastruttura che la passata poi
   * rifiuta — che e' lo stesso difetto dei due raggi di `isCoastal`, e li' era
   * costato una fase intera.
   */
  it('la prima lacuna e sempre il rifiuto del predicato, e viceversa', () => {
    for (const query of everyQuery()) {
      const gaps = arcologyGaps(query);
      expect(gaps[0]?.refusal ?? null, label(gaps)).toBe(arcologyReady(query));
    }
  });

  it('elenca tutte le condizioni mancanti, non solo la prima', () => {
    // La differenza fra questo elenco e il predicato: `arcologyReady` dice
    // `blockTooSmall` e si ferma, quindi da solo non puo' dire se dopo
    // l'ingombro resterebbero due passi o nessuno.
    const gaps = arcologyGaps(ready({
      blockRect: NARROW,
      builtNeighbours: 4,
      cappedNeighbours: 0,
    }));
    expect(gaps.map((gap) => gap.refusal)).toEqual(['blockTooSmall', 'thin', 'notCapped']);
  });

  it('porta have e need dove misurano qualcosa che si vede salire', () => {
    // I numeri si derivano dalle soglie invece di scriverli: con `minBuilt` a
    // mano il test si e' gia' fatto rosso da solo quando la soglia e' scesa.
    const short = ARCOLOGY.minBuilt - 1;
    const gaps = arcologyGaps(ready({ builtNeighbours: short, cappedNeighbours: 1 }));
    expect(gaps).toEqual([
      { refusal: 'thin', have: short, need: ARCOLOGY.minBuilt },
      { refusal: 'notCapped', have: 1, need: ARCOLOGY.minCapped },
    ]);
  });

  it('tace sui numeri dove la domanda e booleana', () => {
    // «0 su 1» accanto al contorno bagnato insegnerebbe a saltare la riga, ed e'
    // la stessa scelta di `prospectRows`, che non stampa una prospettiva dove
    // non c'e' niente di vero da dire.
    expect(sunkenGaps(digReady({ dryRim: false }))).toEqual([{ refusal: 'tooShallow' }]);
  });

  /**
   * **La fascia non entra piu' nella condizione, ed e' misurato.** Su seed 4242
   * con cinque poli il nucleo `core` e' un blocco contiguo di sette isolati:
   * `tier !== core` piu' `minSpacing: 2` lasciavano passare due candidati su
   * tutta l'isola. A dire «qui c'e' un quartiere» resta la densita' costruita,
   * che e' una misura del luogo invece di un'etichetta.
   */
  it('non chiede piu una fascia: a decidere dove e la citta costruita', () => {
    expect(ARCOLOGY_REFUSALS).not.toContain('notCore');
    expect(arcologyGaps(ready())).toEqual([]);
  });

  it('l ingombro riporta il solo asse che manca per primo', () => {
    expect(arcologyGaps(ready({ blockRect: NARROW })))
      .toEqual([{ refusal: 'blockTooSmall', have: 15, need: 20 }]);
    expect(arcologyGaps(ready({ blockRect: SHALLOW })))
      .toEqual([{ refusal: 'blockTooSmall', have: 15, need: 20 }]);
  });

  it('la quota piena porta il traguardo invece del divieto', () => {
    // E' l'unica lacuna che dice «continua cosi'»: la citta' ne ha quante ne
    // ammette, e altri edifici ne ammettono una in piu'.
    // «Piena» si costruisce dalla quota, non da un numero: e' l'unico modo di
    // restare vero quando `buildingsPerArcology` cambia.
    const buildings = 200;
    const full = arcologyQuota(buildings);
    expect(arcologyGaps(ready({ existing: full, buildings })))
      .toEqual([{ refusal: 'enough', have: buildings, need: nextQuotaAt(full) }]);
  });
});

describe('arcologyStanding', () => {
  it('dice la quota anche dove non c e nessun candidato', () => {
    // E' il caso dell'isola piena: la passata non guarda un isolato, quindi non
    // c'e' un prospect — ed e' proprio il momento in cui il giocatore ha piu'
    // bisogno di sapere quanti edifici aprono la prossima.
    const standing = arcologyStanding(300, 2, null);
    expect(standing).toEqual({
      allowed: arcologyQuota(300),
      existing: 2,
      buildings: 300,
      nextQuotaAt: nextQuotaAt(2),
      prospect: null,
    });
  });
});

describe('nextQuotaAt', () => {
  it('e la soglia esatta a cui la citta guadagna l arcologia successiva', () => {
    // Derivata invertendo `arcologyQuota`, non riscritta: se un giorno la quota
    // cambia formula, e' questo test a dirlo invece di un messaggio che sballa.
    for (let existing = 2; existing <= 8; existing++) {
      const at = nextQuotaAt(existing);
      expect(arcologyQuota(at), `existing ${existing}`).toBeGreaterThan(existing);
      expect(arcologyQuota(at - 1), `existing ${existing}`).toBeLessThanOrEqual(existing);
    }
  });
});

describe('sunkenGaps', () => {
  it('non ha lacune esattamente dove il predicato accetta', () => {
    expect(sunkenGaps(digReady())).toEqual([]);
    expect(earthscraperReady(digReady())).toBeNull();
  });

  it('la prima lacuna e sempre il rifiuto del predicato, e viceversa', () => {
    for (const query of everySunkenQuery()) {
      const gaps = sunkenGaps(query);
      expect(gaps[0]?.refusal ?? null, label(gaps)).toBe(earthscraperReady(query));
    }
  });

  it('non oppone piu la cresta alla spalla: a separarle e la roccia', () => {
    // Il veto `tooHigh` e' stato tolto perche' la misura lo ha svuotato: cinque
    // poli sovrapposti riempiono il cono su tutto il nucleo, quindi ogni isolato
    // candidato era cresta e la famiglia interrata non aveva mai un sito. Ora la
    // domanda e' se sotto c'e' roccia asciutta, e le due famiglie convivono.
    expect(ARCOLOGY_REFUSALS).not.toContain('tooHigh');
    for (const query of everySunkenQuery()) {
      expect(sunkenGaps(query).map((gap) => gap.refusal)).not.toContain('tooHigh');
    }
  });

  it('sulla roccia insufficiente cita le due quote, sull acqua vicina no', () => {
    expect(sunkenGaps(digReady({ availableDepth: 21 })))
      .toEqual([{ refusal: 'tooShallow', have: 21, need: 22 }]);
    // Con il contorno bagnato la profondita' non e' la ragione, e citarla
    // manderebbe a cercare roccia dove il problema e' il mare.
    expect(sunkenGaps(digReady({ dryRim: false, availableDepth: 99 })))
      .toEqual([{ refusal: 'tooShallow' }]);
  });
});

describe('compareProspects', () => {
  const at = (gaps: readonly ArcologyGap[]): ArcologyProspect => ({
    x: 0,
    y: 0,
    kind: 'twinStem',
    gaps,
  });

  it('preferisce chi ha meno condizioni aperte, non chi e piu vicino a una', () => {
    // Un isolato a cui resta la sola densita' e' piu' avanti di uno che deve
    // anche allargarsi, anche se quest'ultimo ha quasi i vicini.
    const one = at([{ refusal: 'thin', have: 1, need: 64 }]);
    const two = at([{ refusal: 'blockTooSmall', have: 15, need: 20 },
      { refusal: 'thin', have: 63, need: 64 }]);
    expect(compareProspects(one, two)).toBeLessThan(0);
  });

  it('a parita di condizioni decide quanto manca alla prima', () => {
    const near = at([{ refusal: 'thin', have: 60, need: 64 }]);
    const far = at([{ refusal: 'thin', have: 10, need: 64 }]);
    expect(compareProspects(near, far)).toBeLessThan(0);
    expect(prospectProgress(near)).toBeGreaterThan(prospectProgress(far));
  });

  it('un candidato senza lacune e completo', () => {
    expect(prospectProgress(at([]))).toBe(1);
  });

  it('le domande booleane non si avvicinano: valgono zero', () => {
    expect(prospectProgress(at([{ refusal: 'tooShallow' }]))).toBe(0);
  });
});
