import { describe, expect, it } from 'vitest';
import { FrameTiming } from './FrameTiming';

describe('FrameTiming', () => {
  it('misura intervalli rAF e calcola il vero uno percento peggiore', () => {
    const timing = new FrameTiming(200);
    let now = 0;
    timing.sample(now);
    for (let i = 0; i < 99; i++) timing.sample(now += 10);
    timing.sample(now += 100);

    const stats = timing.snapshot();
    expect(stats.sampleCount).toBe(100);
    expect(stats.fpsLow).toBeCloseTo(10);
    expect(stats.p99Ms).toBe(10);
    expect(stats.jankRatio).toBeCloseTo(0.01);
  });

  it('ignora tab nascosta, resume e gap anomali', () => {
    const timing = new FrameTiming();
    timing.sample(0);
    timing.sample(16);
    timing.sample(1000, false);
    timing.sample(2000, true);
    timing.sample(2016, true);
    timing.sample(3000, true);

    expect(timing.snapshot().sampleCount).toBe(2);
  });

  it('resetta campioni e timestamp precedente', () => {
    const timing = new FrameTiming();
    timing.sample(0);
    timing.sample(16);
    timing.reset();
    expect(timing.snapshot().sampleCount).toBe(0);
    timing.sample(1000);
    expect(timing.snapshot().sampleCount).toBe(0);
  });
});
