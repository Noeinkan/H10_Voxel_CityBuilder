import { describe, expect, it } from 'vitest';
import { CONTROL_HINTS } from './ControlsHint';

describe('CONTROL_HINTS', () => {
  it('documenta tutti i comandi della camera', () => {
    expect(CONTROL_HINTS).toEqual([
      { keys: ['WASD', '↑←↓→'], action: 'Sposta la visuale' },
      { keys: ['Q', 'E'], action: 'Ruota la città' },
      { keys: ['Rotella'], action: 'Avvicina e allontana' },
      { keys: ['Drag'], action: 'Trascina la visuale' },
      { keys: ['F'], action: 'Reinquadra tutto' },
      { keys: ['Esc'], action: 'Annulla lo strumento' },
    ]);
  });
});
