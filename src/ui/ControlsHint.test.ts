import { describe, expect, it } from 'vitest';
import { CONTROL_HINTS } from './ControlsHint';

describe('CONTROL_HINTS', () => {
  it('documenta tutti i comandi della camera', () => {
    expect(CONTROL_HINTS).toEqual([
      { keys: ['WASD', '↑←↓→'], action: 'Sposta' },
      { keys: ['Q', 'E'], action: 'Ruota' },
      { keys: ['Rotella'], action: 'Zoom' },
      { keys: ['Trascina'], action: 'Sposta vista' },
      { keys: ['F'], action: 'Reinquadra' },
    ]);
  });
});
