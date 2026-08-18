import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from './loop';

describe('FixedStepLoop', () => {
  it('avanza a passo fisso senza dipendere dalla divisione dei frame', () => {
    const loop = new FixedStepLoop(10, 10);
    let steps = 0;

    expect(loop.advance(0.04, () => steps++)).toBe(0);
    expect(loop.advance(0.06, () => steps++)).toBe(1);
    expect(loop.advance(0.3, () => steps++)).toBe(3);
    expect(steps).toBe(4);
  });

  it('limita il recupero dopo una pausa lunga', () => {
    const loop = new FixedStepLoop(10, 2);
    let steps = 0;

    expect(loop.advance(10, () => steps++)).toBe(2);
    expect(steps).toBe(2);
    expect(loop.pending).toBe(0);
  });
});
