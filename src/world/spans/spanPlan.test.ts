import { describe, expect, it } from 'vitest';
import { SPANS, SPAN_KIND, type SpanKind } from './config';
import {
  SPAN_HEIGHT,
  planSpan,
  spanBaseZ,
  type SpanProbe,
  type SpanResult,
  type SpanSupport,
} from './spanPlan';

/**
 * La regola delle campate, verificata senza mondo.
 *
 * E' il motivo per cui `spanPlan.ts` prende due predicati invece della
 * `TerrainMap` e del registry: qui il luogo si scrive in tre righe, e il gate
 * della fase — «poggiano sempre su appoggi reali» — diventa un'asserzione invece
 * che un giudizio a occhio su una citta' cresciuta.
 */

const GROUND_HEIGHT = 20;

interface Tower extends SpanSupport {
  /**
   * Quota da cui l'edificio si arretra, e di quanto per lato.
   *
   * Serve a riprodurre il fatto centrale del dominio: le fasce si restringono
   * salendo, quindi al filo dell'impronta la parete c'e' solo in basso. E' il
   * motivo per cui la campata cerca il corpo **rientrando** invece di attaccarsi
   * al bordo del riquadro.
   */
  readonly setbackFrom?: number;
  readonly setbackInset?: number;
}

function tower(over: Partial<Tower> = {}): Tower {
  return {
    id: 1,
    x: 0,
    y: 0,
    sizeX: 8,
    sizeY: 8,
    baseZ: GROUND_HEIGHT,
    height: 40,
    level: 4,
    baseBand: 0,
    ...over,
  };
}

/** Il luogo: terreno piano, le torri date, e la carreggiata dove si dice. */
function place(towers: readonly Tower[], pavement: (x: number, y: number) => boolean): SpanProbe {
  const inside = (t: Tower, x: number, y: number): boolean =>
    x >= t.x && x < t.x + t.sizeX && y >= t.y && y < t.y + t.sizeY;

  return {
    ground: (x, y) => ({
      height: GROUND_HEIGHT,
      pavement: pavement(x, y),
      free: !towers.some((t) => inside(t, x, y)),
    }),
    solid: (x, y, z) => towers.some((t) => {
      if (!inside(t, x, y)) return false;
      if (z < t.baseZ || z >= t.baseZ + t.height) return false;
      if (t.setbackFrom === undefined || z < t.setbackFrom) return true;
      // Sopra l'arretramento resta solo il nucleo.
      const inset = t.setbackInset ?? 2;
      return x >= t.x + inset && x < t.x + t.sizeX - inset &&
        y >= t.y + inset && y < t.y + t.sizeY - inset;
    }),
  };
}

/** Due torri affacciate lungo x, con la carreggiata nel mezzo. */
function facing(gap: number, over: Partial<Tower> = {}): { a: Tower; b: Tower; probe: SpanProbe } {
  const a = tower({ id: 1, x: 0, ...over });
  const b = tower({ id: 2, x: 8 + gap, ...over });
  return {
    a,
    b,
    probe: place([a, b], (x) => x >= 8 && x < 8 + gap),
  };
}

function plan(gap: number, over: Partial<Tower> = {}, kind: SpanKind = SPAN_KIND.bridge): SpanResult {
  const { a, b, probe } = facing(gap, over);
  return planSpan({ a, b, kind, ...probe });
}

function refusal(result: SpanResult): string {
  return result.ok ? 'accettata' : result.refusal;
}

describe('planSpan — quando due torri possono darsi un ponte', () => {
  it('due torri affacciate sopra una carreggiata ottengono la campata', () => {
    const result = plan(4);
    expect(refusal(result)).toBe('accettata');
    if (!result.ok) return;

    // L'ingombro e' il vuoto, non le torri: una campata non prende suolo, e non
    // prende nemmeno il volume degli appoggi.
    expect(result.plan.x).toBe(8);
    expect(result.plan.sizeX).toBe(4);
    expect(result.plan.sizeY).toBe(SPANS.rules[SPAN_KIND.bridge].width);
    expect(result.plan.supports).toEqual([1, 2]);
  });

  it('la carreggiata sta sotto il tetto piu basso, non sopra di esso', () => {
    const result = plan(4);
    if (!result.ok) throw new Error(refusal(result));

    const top = GROUND_HEIGHT + 40;
    expect(result.plan.deckZ).toBe(top - SPANS.deckDrop);
    // Le travi stanno sotto la carreggiata: e' la sezione che si vede di taglio.
    expect(spanBaseZ(result.plan.deckZ)).toBe(result.plan.deckZ - SPANS.girderDepth);
    expect(SPAN_HEIGHT).toBe(SPANS.girderDepth + 1);
  });

  it('la coppia si propone una volta sola, in ordine di id', () => {
    const { a, b, probe } = facing(4);
    const forward = planSpan({ a, b, kind: SPAN_KIND.bridge, ...probe });
    const backward = planSpan({ a: b, b: a, kind: SPAN_KIND.bridge, ...probe });

    if (!forward.ok || !backward.ok) throw new Error('entrambe dovevano passare');
    expect(forward.plan.supports).toEqual(backward.plan.supports);
    expect(forward.plan.deckZ).toBe(backward.plan.deckZ);
  });

  it('a parita di ingressi il piano e identico', () => {
    const first = plan(4);
    const second = plan(4);
    expect(first).toEqual(second);
  });
});

describe('planSpan — il gate: si poggia su appoggi veri', () => {
  it('atterra sull arretramento, e la campata esce piu lunga del vuoto', () => {
    // Le torri si arretrano di due per lato a partire da 50, cioe' proprio dove
    // la campata vorrebbe attaccarsi. Attaccarsi al filo dell'impronta la
    // lascerebbe nel vuoto; la regola rientra e trova il corpo, ed e' cosi' che
    // una passerella vera atterra — sull'arretramento, non sul basamento.
    const result = plan(4, { setbackFrom: 50 });
    if (!result.ok) throw new Error(refusal(result));

    const top = GROUND_HEIGHT + 40;
    expect(result.plan.deckZ).toBe(top - SPANS.deckDrop);
    // Il vuoto fra le impronte e' quattro; la campata parte dalle pareti vere,
    // che sono rientrate di due per lato.
    expect(result.plan.sizeX).toBe(4 + 2 + 2);
  });

  it('rinuncia se a quella quota il corpo e piu stretto dell impalcato', () => {
    // Arretrate di tre per lato da subito: sopra resta un nucleo largo due, e
    // un impalcato da quattro non ci si appoggia per intero da nessuna parte.
    expect(refusal(plan(4, { setbackFrom: GROUND_HEIGHT, setbackInset: 3 })))
      .toBe('noAbutment');
  });

  it('non si accontenta di mezza testata', () => {
    // La torre b e' profonda meta' del fronte: la campata poggerebbe su tre
    // colonne e sporgerebbe nel vuoto sulle altre tre.
    const a = tower({ id: 1, x: 0 });
    const b = tower({ id: 2, x: 12, sizeY: 3 });
    const probe = place([a, b], (x) => x >= 8 && x < 12);
    expect(refusal(planSpan({ a, b, kind: SPAN_KIND.bridge, ...probe }))).toBe('tooNarrow');
  });
});

describe('planSpan — i motivi di rifiuto', () => {
  it('il vuoto troppo stretto o troppo largo', () => {
    expect(refusal(plan(SPANS.minGap - 1))).toBe('badGap');
    expect(refusal(plan(SPANS.maxGap + 1))).toBe('badGap');
  });

  it('impronte in diagonale: non c e un fronte comune', () => {
    const a = tower({ id: 1, x: 0, y: 0 });
    const b = tower({ id: 2, x: 12, y: 12 });
    const probe = place([a, b], () => true);
    expect(refusal(planSpan({ a, b, kind: SPAN_KIND.bridge, ...probe }))).toBe('notFacing');
  });

  it('impronte sovrapposte in pianta: non c e un vuoto', () => {
    const a = tower({ id: 1, x: 0, y: 0 });
    const b = tower({ id: 2, x: 4, y: 4 });
    const probe = place([a, b], () => true);
    expect(refusal(planSpan({ a, b, kind: SPAN_KIND.bridge, ...probe }))).toBe('notFacing');
  });

  it('un edificio nel vuoto', () => {
    const a = tower({ id: 1, x: 0 });
    const b = tower({ id: 2, x: 20 });
    const between = tower({ id: 3, x: 10, sizeX: 4 });
    const probe = place([a, b, between], (x) => x >= 8 && x < 20);
    expect(refusal(planSpan({ a, b, kind: SPAN_KIND.bridge, ...probe }))).toBe('groundTaken');
  });

  it('un ponte che non scavalca niente', () => {
    const { a, b } = facing(4);
    const probe = place([a, b], () => false);
    expect(refusal(planSpan({ a, b, kind: SPAN_KIND.bridge, ...probe }))).toBe('wrongGround');
  });

  it('appoggi troppo bassi di livello', () => {
    const level = SPANS.rules[SPAN_KIND.bridge].minLevel - 1;
    expect(refusal(plan(4, { level }))).toBe('level');
  });

  it('torri troppo basse perche la campata stia sopra il franco', () => {
    // Alte otto: il tetto sta a 28, meno `deckDrop` fa 24, sotto il pavimento
    // che franco e slancio minimo impongono.
    const rule = SPANS.rules[SPAN_KIND.bridge];
    const floorZ = GROUND_HEIGHT + Math.max(rule.minRise, rule.clearance + SPANS.girderDepth);
    expect(GROUND_HEIGHT + 8 - SPANS.deckDrop).toBeLessThan(floorZ);
    expect(refusal(plan(4, { height: 8 }))).toBe('tooLow');
  });
});

describe('planSpan — le campate lunghe si spezzano', () => {
  it('un vuoto corto resta un segmento solo', () => {
    const result = plan(4);
    if (!result.ok) throw new Error(refusal(result));
    expect(result.plan.segments).toHaveLength(1);
  });

  it('un vuoto lungo si spezza al passo dichiarato', () => {
    const result = plan(12);
    if (!result.ok) throw new Error(refusal(result));

    const segments = result.plan.segments;
    expect(segments).toHaveLength(2);
    expect(segments[0].sizeX).toBe(SPANS.segmentLength);
    expect(segments[1].sizeX).toBe(12 - SPANS.segmentLength);

    // I segmenti coprono il vuoto esattamente: niente buchi, niente doppioni.
    const covered = segments.reduce((sum, s) => sum + s.sizeX, 0);
    expect(covered).toBe(result.plan.sizeX);
    expect(segments[1].x).toBe(segments[0].x + segments[0].sizeX);
  });

  it('nessun segmento supera il passo, comunque sia lungo il vuoto', () => {
    for (let gap = SPANS.minGap; gap <= SPANS.maxGap; gap++) {
      const result = plan(gap);
      if (!result.ok) continue;
      for (const segment of result.plan.segments) {
        expect(Math.max(segment.sizeX, segment.sizeY))
          .toBeLessThanOrEqual(SPANS.segmentLength);
      }
    }
  });
});

describe('planSpan — il mezzanino', () => {
  const rule = SPANS.rules[SPAN_KIND.mezzanine];

  /** Due membri della stessa fila, senza carreggiata nel mezzo. */
  function row(over: Partial<Tower> = {}): { a: Tower; b: Tower; probe: SpanProbe } {
    const shared = { cluster: 7, baseBand: 6, height: 40, ...over };
    const a = tower({ id: 1, x: 0, ...shared });
    const b = tower({ id: 2, x: 12, ...shared });
    return { a, b, probe: place([a, b], () => false) };
  }

  it('due membri della stessa fila si danno il mezzanino sul basamento condiviso', () => {
    const { a, b, probe } = row();
    const result = planSpan({ a, b, kind: SPAN_KIND.mezzanine, ...probe });
    if (!result.ok) throw new Error(refusal(result));

    // Una fascia sopra lo zoccolo che la fila gia' condivide, non il tetto: a
    // filo del basamento le travi non lascerebbero aria sopra il cortile.
    expect(result.plan.deckZ).toBe(GROUND_HEIGHT + 6 - 1 + SPANS.mezzanineRise);
    expect(result.plan.sizeY).toBe(rule.width);
  });

  it('fra due file diverse non e un mezzanino', () => {
    const { a, probe } = row();
    const b = tower({ id: 2, x: 12, cluster: 9, baseBand: 6 });
    expect(refusal(planSpan({ a, b, kind: SPAN_KIND.mezzanine, ...probe })))
      .toBe('notInRow');
  });

  it('senza basamento condiviso non c e niente su cui camminare', () => {
    const { a, b, probe } = row({ baseBand: 0 });
    expect(refusal(planSpan({ a, b, kind: SPAN_KIND.mezzanine, ...probe })))
      .toBe('notInRow');
  });

  it('sopra una carreggiata il mezzanino non ci sta', () => {
    const { a, b } = row();
    const probe = place([a, b], (x) => x >= 8 && x < 12);
    expect(refusal(planSpan({ a, b, kind: SPAN_KIND.mezzanine, ...probe })))
      .toBe('wrongGround');
  });
});
