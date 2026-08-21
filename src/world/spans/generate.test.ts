import { describe, expect, it } from 'vitest';
import { SPANS, SPAN_KIND, type SpanKind } from './config';
import { generateSpan } from './generate';
import { SPAN_HEIGHT, type SpanPlan, type SpanSegment } from './spanPlan';
import { SURFACE_KIND } from '../visualBlock';
import type { VoxelStamp } from '../buildings/stamp';

/**
 * La sezione della campata.
 *
 * Il punto che questi test difendono e' quello che la fase chiama per nome: un
 * impalcato da un voxel «legge come un nastro incollato al cielo». La sezione
 * dev'essere in tre righe — travi, carreggiata, parapetto — e le travi devono
 * stare dove si vedono.
 */

function bridge(over: Partial<SpanPlan> = {}): SpanPlan {
  const sizeX = over.sizeX ?? 12;
  const sizeY = over.sizeY ?? 6;
  return {
    kind: SPAN_KIND.bridge,
    axis: 0,
    deckZ: 50,
    x: 8,
    y: 0,
    sizeX,
    sizeY,
    corbel: SPANS.corbel,
    supports: [1, 2],
    segments: [{ x: 8, y: 0, sizeX, sizeY }],
    ...over,
  };
}

function whole(plan: SpanPlan): SpanSegment {
  return { x: plan.x, y: plan.y, sizeX: plan.sizeX, sizeY: plan.sizeY };
}

function paletteAt(stamp: VoxelStamp, lx: number, ly: number, lz: number): number {
  return stamp.voxels[lx + stamp.sizeX * (ly + stamp.sizeY * lz)];
}

function surfaceAt(stamp: VoxelStamp, lx: number, ly: number, lz: number): number {
  return stamp.surfaces[lx + stamp.sizeX * (ly + stamp.sizeY * lz)];
}

const DECK_Z = SPANS.girderDepth;

describe('generateSpan — la carreggiata', () => {
  it('sta in cima alla sezione e copre tutto l ingombro', () => {
    const plan = bridge();
    const stamp = generateSpan(plan, whole(plan));

    expect(stamp.sizeZ).toBe(SPAN_HEIGHT);
    for (let ly = 0; ly < plan.sizeY; ly++) {
      for (let lx = 0; lx < plan.sizeX; lx++) {
        expect(paletteAt(stamp, lx, ly, DECK_Z)).toBeGreaterThan(0);
      }
    }
  });

  it('i filari di bordo sono roofTech, cosi il parapetto arriva dal mesher', () => {
    const plan = bridge();
    const stamp = generateSpan(plan, whole(plan));

    // E' la stessa mossa della terrazza della 4.3: `emitRoofTech` emette gia' il
    // parapetto dove un tetto tecnico confina con l'aria, quindi la ringhiera
    // non costa ne' geometria dichiarata qui ne' una riga nel mesher.
    for (let lx = 0; lx < plan.sizeX; lx++) {
      expect(surfaceAt(stamp, lx, 0, DECK_Z)).toBe(SURFACE_KIND.roofTech);
      expect(surfaceAt(stamp, lx, plan.sizeY - 1, DECK_Z)).toBe(SURFACE_KIND.roofTech);
    }
  });

  it('prende il colore del proprio tipo', () => {
    for (const kind of [SPAN_KIND.bridge, SPAN_KIND.mezzanine] as SpanKind[]) {
      const plan = bridge({ kind, sizeY: 4 });
      const stamp = generateSpan(plan, whole(plan));
      expect(paletteAt(stamp, 0, 0, DECK_Z)).toBe(SPANS.deckPalette[kind]);
    }
  });
});

describe('generateSpan — cio che regge si vede', () => {
  it('due travi sotto i filari di bordo, e il vuoto in mezzo', () => {
    const plan = bridge();
    const stamp = generateSpan(plan, whole(plan));

    // A meta' corsa, lontano dalle mensole: e' li' che la travatura si legge.
    const middle = Math.floor(plan.sizeX / 2);
    for (let lz = 0; lz < SPANS.girderDepth; lz++) {
      expect(paletteAt(stamp, middle, 0, lz)).toBe(SPANS.girderPalette);
      expect(paletteAt(stamp, middle, plan.sizeY - 1, lz)).toBe(SPANS.girderPalette);
      // Fra le due correnti c'e' aria: e' una travatura, non una soletta, ed e'
      // il vuoto sotto la campata a dire l'altezza.
      for (let ly = 1; ly < plan.sizeY - 1; ly++) {
        expect(paletteAt(stamp, middle, ly, lz)).toBe(0);
      }
    }
  });

  it('alle testate le travi riempiono la larghezza: e la mensola', () => {
    const plan = bridge();
    const stamp = generateSpan(plan, whole(plan));

    for (let ly = 0; ly < plan.sizeY; ly++) {
      for (let lx = 0; lx < plan.corbel; lx++) {
        expect(paletteAt(stamp, lx, ly, 0)).toBe(SPANS.girderPalette);
        expect(paletteAt(stamp, plan.sizeX - 1 - lx, ly, 0)).toBe(SPANS.girderPalette);
      }
    }
  });

  it('la struttura porta la grammatica delle infrastrutture', () => {
    const plan = bridge();
    const stamp = generateSpan(plan, whole(plan));
    expect(surfaceAt(stamp, 0, 0, 0)).toBe(SURFACE_KIND.utility);
  });
});

describe('generateSpan — il verde', () => {
  it('il cuore di una campata larga diventa giardino, il bordo resta passaggio', () => {
    const plan = bridge();
    const stamp = generateSpan(plan, whole(plan));

    // Rientrato di due: dentro il parapetto resta un filare di passaggio da cui
    // il giardino si guarda. Rientrando di uno il verde arriverebbe al filo.
    expect(paletteAt(stamp, 4, 2, DECK_Z)).toBe(SPANS.gardenPalette);
    expect(surfaceAt(stamp, 4, 2, DECK_Z)).toBe(SURFACE_KIND.plain);
    expect(paletteAt(stamp, 4, 1, DECK_Z)).toBe(SPANS.deckPalette[SPAN_KIND.bridge]);
    expect(paletteAt(stamp, 4, 0, DECK_Z)).toBe(SPANS.deckPalette[SPAN_KIND.bridge]);
  });

  it('una campata stretta e tutta passaggio', () => {
    const plan = bridge({ kind: SPAN_KIND.mezzanine, sizeY: SPANS.plantedMinWidth - 2 });
    const stamp = generateSpan(plan, whole(plan));

    for (let ly = 0; ly < plan.sizeY; ly++) {
      for (let lx = 0; lx < plan.sizeX; lx++) {
        expect(paletteAt(stamp, lx, ly, DECK_Z)).not.toBe(SPANS.gardenPalette);
      }
    }
  });
});

describe('generateSpan — i segmenti si accordano', () => {
  it('due segmenti confinanti compongono la stessa campata di uno solo', () => {
    const plan = bridge({
      segments: [
        { x: 8, y: 0, sizeX: 8, sizeY: 6 },
        { x: 16, y: 0, sizeX: 4, sizeY: 6 },
      ],
    });

    const single = generateSpan(plan, whole(plan));
    const parts = plan.segments.map((segment) => generateSpan(plan, segment));

    // Il disegno e' una funzione delle coordinate globali, quindi una finestra
    // su di esso non puo' che coincidere: e' il motivo per cui i segmenti non
    // devono accordarsi fra loro su dove cade il bordo.
    for (const [index, segment] of plan.segments.entries()) {
      const part = parts[index];
      for (let lz = 0; lz < SPAN_HEIGHT; lz++) {
        for (let ly = 0; ly < segment.sizeY; ly++) {
          for (let lx = 0; lx < segment.sizeX; lx++) {
            expect(paletteAt(part, lx, ly, lz))
              .toBe(paletteAt(single, segment.x - plan.x + lx, ly, lz));
          }
        }
      }
    }
  });

  it('lo stamp di un segmento non esce dal segmento', () => {
    const segment = { x: 16, y: 0, sizeX: 4, sizeY: 6 };
    const stamp = generateSpan(bridge({ segments: [segment] }), segment);

    expect(stamp.sizeX).toBe(segment.sizeX);
    expect(stamp.sizeY).toBe(segment.sizeY);
    expect(stamp.voxels).toHaveLength(segment.sizeX * segment.sizeY * SPAN_HEIGHT);
  });
});

describe('generateSpan — la piazza', () => {
  const plaza = bridge({
    kind: SPAN_KIND.plaza,
    x: 0,
    y: 0,
    sizeX: 16,
    sizeY: 16,
    corbel: 0,
    supports: [1, 2, 3],
  });

  it('le travi corrono in griglia, non in due sole correnti', () => {
    const stamp = generateSpan(plaza, whole(plaza));

    // Il perimetro, e una nervatura al passo con cui la piazza compare: un
    // impalcato largo sedici retto solo ai bordi chiederebbe a occhio un
    // appoggio in mezzo, che qui non puo' avere.
    expect(paletteAt(stamp, 0, 8, 0)).toBe(SPANS.girderPalette);
    expect(paletteAt(stamp, 15, 8, 0)).toBe(SPANS.girderPalette);
    expect(paletteAt(stamp, SPANS.segmentLength, 4, 0)).toBe(SPANS.girderPalette);
    expect(paletteAt(stamp, 4, SPANS.segmentLength, 0)).toBe(SPANS.girderPalette);
    expect(paletteAt(stamp, 3, 3, 0)).toBe(0);
  });

  it('ha un giardino al centro e un anello pavimentato attorno', () => {
    const stamp = generateSpan(plaza, whole(plaza));

    expect(paletteAt(stamp, 8, 8, DECK_Z)).toBe(SPANS.gardenPalette);
    for (let lx = 0; lx < plaza.sizeX; lx++) {
      expect(paletteAt(stamp, lx, 0, DECK_Z)).toBe(SPANS.deckPalette[SPAN_KIND.plaza]);
      expect(surfaceAt(stamp, lx, 0, DECK_Z)).toBe(SURFACE_KIND.roofTech);
    }
  });
});
