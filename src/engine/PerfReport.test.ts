import { describe, expect, it } from 'vitest';
import { PerfReport, PERF_REPORT_MS, formatPerfSummary, type PerfSample } from './PerfReport';

function sample(overrides: Partial<PerfSample> = {}): PerfSample {
  return {
    fps: 60,
    frameMs: 16,
    remeshMs: 0.5,
    remeshedChunks: 1,
    qualityMode: 'auto',
    pixelRatio: 1.5,
    effects: 'shadow+bloom',
    ...overrides,
  };
}

describe('PerfReport', () => {
  it('tace finche la finestra non e chiusa', () => {
    const report = new PerfReport();
    expect(report.add(sample(), 0)).toBeNull();
    expect(report.add(sample(), PERF_REPORT_MS - 1)).toBeNull();
  });

  it('riepiloga appena la finestra si chiude e riparte dal frame corrente', () => {
    const report = new PerfReport();
    expect(report.add(sample({ fps: 50 }), 0)).toBeNull();

    const summary = report.add(sample({ fps: 54, frameMs: 18 }), PERF_REPORT_MS);
    expect(summary).not.toBeNull();
    expect(summary?.seconds).toBe(PERF_REPORT_MS / 1000);
    expect(summary?.frames).toBe(2);
    expect(summary?.fpsAvg).toBe(52);
    expect(summary?.fpsMin).toBe(50);
    expect(summary?.frameMsMax).toBe(18);

    // Il frame che ha chiuso la finestra apre anche la successiva.
    const next = report.add(sample({ fps: 60 }), PERF_REPORT_MS + 1000);
    expect(next).toBeNull();
  });

  it('somma i chunk rimeshati e fa la media dei tempi di remesh', () => {
    const report = new PerfReport();
    report.add(sample({ remeshMs: 1, remeshedChunks: 3 }), 0);
    const summary = report.add(sample({ remeshMs: 3, remeshedChunks: 5 }), PERF_REPORT_MS);
    expect(summary?.remeshMsAvg).toBe(2);
    expect(summary?.remeshMsMax).toBe(3);
    expect(summary?.remeshedChunks).toBe(8);
  });

  it('riporta la qualita in vigore alla chiusura della finestra', () => {
    const report = new PerfReport();
    report.add(sample({ qualityMode: 'auto' }), 0);
    const summary = report.add(
      sample({ qualityMode: 'balanced', pixelRatio: 1.5, effects: 'shadow' }),
      PERF_REPORT_MS,
    );
    expect(summary?.qualityMode).toBe('balanced');
    expect(summary?.pixelRatio).toBe(1.5);
    expect(summary?.effects).toBe('shadow');
  });
});

describe('formatPerfSummary', () => {
  it('produce una riga sola con i numeri leggibili e incollabili', () => {
    const line = formatPerfSummary({
      seconds: 5.0,
      frames: 300,
      fpsAvg: 58.36,
      fpsMin: 51.2,
      frameMsAvg: 17.134,
      frameMsMax: 24.31,
      remeshMsAvg: 0.42,
      remeshMsMax: 1.8,
      remeshedChunks: 12,
      qualityMode: 'auto',
      pixelRatio: 1.5,
      effects: 'shadow+bloom',
    });
    expect(line).not.toContain('\n');
    expect(line).toBe(
      '[perf] 5.0s · 300 frames · fps 58.4 (min 51.2) · frame 17.13 ms (max 24.31) · ' +
        'remesh 0.42 ms/f (max 1.80) · 12 chunks · quality auto · dpr 1.50 · effects shadow+bloom',
    );
  });
});
