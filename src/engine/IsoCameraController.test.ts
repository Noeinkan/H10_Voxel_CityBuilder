import { describe, expect, it } from 'vitest';
import { isPanButton } from './IsoCameraController';

describe('isPanButton', () => {
  it.each([0, 1, 2])('accetta il pulsante pointer %i', (button) => {
    expect(isPanButton(button)).toBe(true);
  });

  it('rifiuta i pulsanti laterali', () => {
    expect(isPanButton(3)).toBe(false);
    expect(isPanButton(4)).toBe(false);
  });
});
