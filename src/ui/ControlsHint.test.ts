import { describe, expect, it } from 'vitest';
import { CONTROL_HINTS } from './ControlsHint';

describe('CONTROL_HINTS', () => {
  it('documenta tutti i comandi della camera e delle viste', () => {
    expect(CONTROL_HINTS).toEqual([
      { keys: ['WASD', '↑←↓→'], action: 'Move the camera' },
      { keys: ['Q', 'E'], action: 'Rotate the city' },
      { keys: ['Wheel'], action: 'Zoom in and out' },
      { keys: ['Drag'], action: 'Pan the camera' },
      { keys: ['F'], action: 'Frame the whole city' },
      { keys: ['V'], action: 'Look inside the city' },
      { keys: ['[', ']'], action: 'Move the level up and down' },
      { keys: ['Esc'], action: 'Cancel the current tool' },
    ]);
  });
});
