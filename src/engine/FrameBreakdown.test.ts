import { describe, expect, it } from 'vitest';
import { FrameBreakdown, RENDER_PHASE } from './FrameBreakdown';
import { SampleWindow } from './SampleWindow';

function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('SampleWindow', () => {
  it('tiene il massimo dall azzeramento e i percentili sulla finestra', () => {
    const window = new SampleWindow(4);
    for (const ms of [50, 1, 2, 3, 4]) window.add(ms);

    const summary = window.summary();
    // Il 50 e' uscito dalla finestra, ma resta il picco: e' lo spike da vedere.
    expect(summary.maxMs).toBe(50);
    expect(summary.p99Ms).toBe(4);
    expect(summary.lastMs).toBe(4);
    expect(summary.avgMs).toBe(2.5);
    expect(summary.count).toBe(4);

    window.reset();
    expect(window.summary().count).toBe(0);
  });
});

describe('FrameBreakdown', () => {
  it('ogni millisecondo va alla fase del segno che lo chiude, e il render resta fuori dal main', () => {
    const time = clock();
    const breakdown = new FrameBreakdown(time.now);

    breakdown.begin();
    time.advance(1);
    breakdown.mark('growth');
    time.advance(6);
    breakdown.mark(RENDER_PHASE);
    // Il lavoro dopo il render e' main thread come l'altro: prima si perdeva.
    time.advance(2);
    breakdown.mark('hud');
    expect(breakdown.mainSoFar).toBe(3);
    breakdown.end();

    const snapshot = breakdown.snapshot();
    expect(snapshot.main.lastMs).toBe(3);
    expect(snapshot.render.lastMs).toBe(6);
    expect(snapshot.phases.map((phase) => [phase.name, phase.lastMs])).toEqual([
      ['growth', 1],
      [RENDER_PHASE, 6],
      ['hud', 2],
    ]);
  });

  it('una fase segnata due volte somma i suoi segmenti', () => {
    const time = clock();
    const breakdown = new FrameBreakdown(time.now);
    breakdown.begin();
    time.advance(1);
    breakdown.mark('overlays');
    time.advance(4);
    breakdown.mark('growth');
    time.advance(2);
    breakdown.mark('overlays');
    breakdown.end();

    expect(breakdown.snapshot().phases.find((p) => p.name === 'overlays')?.lastMs).toBe(3);
  });

  it('separa il render dei frame che caricano geometria da quello degli altri', () => {
    const time = clock();
    const breakdown = new FrameBreakdown(time.now);
    const frame = (renderMs: number, uploadBytes: number): void => {
      breakdown.begin();
      time.advance(renderMs);
      breakdown.mark(RENDER_PHASE);
      breakdown.end(uploadBytes);
    };

    frame(3, 0);
    frame(9, 64_000);
    frame(4, 0);

    const snapshot = breakdown.snapshot();
    expect(snapshot.renderWithUpload.maxMs).toBe(9);
    expect(snapshot.renderWithoutUpload.maxMs).toBe(4);
    expect(snapshot.uploadBytes).toBe(0);
    expect(snapshot.uploadBytesMax).toBe(64_000);

    breakdown.resetPeaks();
    expect(breakdown.snapshot().uploadBytesMax).toBe(0);
    expect(breakdown.snapshot().main.count).toBe(0);
  });

  it('un segno fuori da un frame aperto non conta', () => {
    const time = clock();
    const breakdown = new FrameBreakdown(time.now);
    breakdown.mark('growth');
    breakdown.end();
    expect(breakdown.snapshot().phases).toEqual([]);
  });
});
