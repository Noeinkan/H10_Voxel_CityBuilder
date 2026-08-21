import { describe, expect, it } from 'vitest';
import { SPANS, SPAN_KIND } from './config';
import { planPlaza, type CourtyardRect } from './plazaPlan';
import type { SpanProbe, SpanResult, SpanSupport } from './spanPlan';

/**
 * La piazza in quota, verificata senza mondo.
 *
 * Il fatto che questi test difendono e' che una piazza sia un **nodo** e non un
 * ponte largo: retta da tre o piu' edifici su lati diversi, sopra il cuore che
 * la 4.1 lascia libero apposta in mezzo a ogni isolato.
 */

const GROUND_HEIGHT = 20;

interface Tower extends SpanSupport {
  readonly setbackFrom?: number;
}

function tower(over: Partial<Tower> & Pick<Tower, 'id'>): Tower {
  return {
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
      return x >= t.x + 2 && x < t.x + t.sizeX - 2 &&
        y >= t.y + 2 && y < t.y + t.sizeY - 2;
    }),
  };
}

const BLOCK: CourtyardRect = { x0: 0, y0: 0, x1: 31, y1: 31 };

/** Un isolato chiuso sui quattro lati, con il cuore libero in mezzo. */
function ring(over: Partial<Tower> = {}): readonly Tower[] {
  return [
    tower({ id: 1, x: 0, y: 0, sizeX: 8, sizeY: 32, ...over }),
    tower({ id: 2, x: 24, y: 0, sizeX: 8, sizeY: 32, ...over }),
    tower({ id: 3, x: 8, y: 0, sizeX: 16, sizeY: 8, ...over }),
    tower({ id: 4, x: 8, y: 24, sizeX: 16, sizeY: 8, ...over }),
  ];
}

function plan(
  towers: readonly Tower[],
  pavement: (x: number, y: number) => boolean = () => false,
  rect: CourtyardRect = BLOCK,
): SpanResult {
  return planPlaza({ rect, supports: towers, ...place(towers, pavement) });
}

function refusal(result: SpanResult): string {
  return result.ok ? 'accettata' : result.refusal;
}

describe('planPlaza — il cuore dell isolato diventa un nodo', () => {
  it('quattro edifici attorno a un cortile reggono la piazza', () => {
    const result = plan(ring());
    expect(refusal(result)).toBe('accettata');
    if (!result.ok) return;

    // Il cuore libero e' 16x16: il quadrato lo riempie fino al proprio tetto.
    expect(result.plan.sizeX).toBe(16);
    expect(result.plan.sizeY).toBe(16);
    expect(result.plan.x).toBe(8);
    expect(result.plan.y).toBe(8);
    expect(result.plan.kind).toBe(SPAN_KIND.plaza);
  });

  it('registra tutti i suoi appoggi, in ordine: e cio che la rende un nodo', () => {
    const result = plan(ring());
    if (!result.ok) throw new Error(refusal(result));
    // Una piazza lega fra loro tutti gli edifici che la reggono, quindi due
    // campate che ci arrivano da lati diversi risultano connesse.
    expect(result.plan.supports).toEqual([1, 2, 3, 4]);
  });

  it('sta sotto il tetto piu basso della coorte', () => {
    const result = plan(ring());
    if (!result.ok) throw new Error(refusal(result));
    expect(result.plan.deckZ).toBe(GROUND_HEIGHT + 40 - SPANS.deckDrop);
  });

  it('non ha mensole: e retta dal perimetro, non da due testate', () => {
    const result = plan(ring());
    if (!result.ok) throw new Error(refusal(result));
    expect(result.plan.corbel).toBe(0);
  });

  it('compare a segmenti come le campate', () => {
    const result = plan(ring());
    if (!result.ok) throw new Error(refusal(result));

    for (const segment of result.plan.segments) {
      expect(segment.sizeX).toBeLessThanOrEqual(SPANS.segmentLength);
      expect(segment.sizeY).toBeLessThanOrEqual(SPANS.segmentLength);
    }
    const covered = result.plan.segments
      .reduce((sum, s) => sum + s.sizeX * s.sizeY, 0);
    expect(covered).toBe(result.plan.sizeX * result.plan.sizeY);
  });

  it('a parita di ingressi il piano e identico', () => {
    expect(plan(ring())).toEqual(plan(ring()));
  });
});

describe('planPlaza — i motivi di rifiuto', () => {
  it('un cuore troppo piccolo non e una piazza', () => {
    // L'isolato e' pieno fin quasi al centro: cio' che resta sta sotto il lato
    // minimo, e stringere oltre non lascia niente.
    const towers = [
      tower({ id: 1, x: 0, y: 0, sizeX: 14, sizeY: 32 }),
      tower({ id: 2, x: 18, y: 0, sizeX: 14, sizeY: 32 }),
      tower({ id: 3, x: 14, y: 0, sizeX: 4, sizeY: 14 }),
      tower({ id: 4, x: 14, y: 18, sizeX: 4, sizeY: 14 }),
    ];
    expect(refusal(plan(towers))).toBe('noCourtyard');
  });

  it('due soli appoggi sono un ponte largo, non una piazza', () => {
    // Isolato basso, cosi' il cuore resta dentro il lato massimo e il rifiuto
    // che si misura e' il numero di appoggi, non l'ingombro.
    const rect: CourtyardRect = { x0: 0, y0: 0, x1: 31, y1: 15 };
    const towers = [
      tower({ id: 1, x: 0, y: 0, sizeX: 8, sizeY: 16 }),
      tower({ id: 2, x: 24, y: 0, sizeX: 8, sizeY: 16 }),
    ];
    expect(refusal(plan(towers, () => false, rect))).toBe('fewSupports');
  });

  it('tre appoggi tutti su un lato reggono un balcone, non un piano', () => {
    const rect: CourtyardRect = { x0: 0, y0: 0, x1: 23, y1: 15 };
    const towers = [
      tower({ id: 1, x: 0, y: 0, sizeX: 8, sizeY: 5 }),
      tower({ id: 2, x: 0, y: 5, sizeX: 8, sizeY: 5 }),
      tower({ id: 3, x: 0, y: 10, sizeX: 8, sizeY: 6 }),
    ];
    expect(refusal(plan(towers, () => false, rect))).toBe('oneSided');
  });

  it('una carreggiata nel cuore: quello e un incrocio, non un cortile', () => {
    expect(refusal(plan(ring(), (x, y) => x >= 8 && x < 24 && y === 16)))
      .toBe('wrongGround');
  });

  it('edifici troppo bassi perche la piazza stia sopra il franco', () => {
    expect(refusal(plan(ring({ height: 8 })))).toBe('tooLow');
  });

  it('rinuncia se gli appoggi si sono gia arretrati a quella quota', () => {
    expect(refusal(plan(ring({ setbackFrom: GROUND_HEIGHT })))).toBe('noAbutment');
  });

  it('scarta dalla coorte chi sta a una quota incompatibile', () => {
    // Tre torri alte e una bassa: la piazza si fa lo stesso, sui tre che
    // condividono il piano, e la quarta non entra fra i suoi appoggi.
    const towers = [
      ...ring().slice(0, 3),
      tower({ id: 4, x: 8, y: 24, sizeX: 16, sizeY: 8, height: 14 }),
    ];
    const result = plan(towers);
    if (!result.ok) throw new Error(refusal(result));
    expect(result.plan.supports).toEqual([1, 2, 3]);
  });
});
