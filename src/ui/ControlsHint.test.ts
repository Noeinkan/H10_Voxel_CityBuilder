import { describe, expect, it } from 'vitest';
import { CONTROL_HINTS, VIEW_HINTS, VIEW_HINTS_LEAD } from './ControlsHint';
import { INSPECT_MODE } from '../engine/inspect';
import { buildViewMenuModel } from './ViewMenuModel';

describe('CONTROL_HINTS', () => {
  it('documenta tutti i comandi della camera', () => {
    expect(CONTROL_HINTS).toEqual([
      { keys: ['WASD', '↑←↓→'], action: 'Move the camera' },
      { keys: ['Q', 'E'], action: 'Rotate the city' },
      { keys: ['Wheel'], action: 'Zoom in and out' },
      { keys: ['Drag'], action: 'Pan the camera' },
      { keys: ['F'], action: 'Frame the whole city' },
      { keys: ['V'], action: 'Cycle the views below' },
      { keys: ['L'], action: 'Hold the day, hold the night, or let the clock run' },
      { keys: ['Esc'], action: 'Cancel the tool, then leave the view' },
    ]);
  });

  it('promette che Escape riporta la citta’ intera', () => {
    // La card diceva solo "cancel the current tool", ed era vero: Escape si
    // rifiutava di spegnere una vista. Uscirne non era scritto da nessuna parte.
    const escape = CONTROL_HINTS.find((hint) => hint.keys.includes('Esc'));
    expect(escape?.action).toContain('view');
  });

  it('la quota non e’ piu’ una scorciatoia globale', () => {
    // `[` e `]` valgono solo dentro Levels, e la loro riga sta accanto a quella
    // vista invece che fra i comandi della camera: pubblicizzarli come controllo
    // generale li faceva provare in Normal, dove non muovono niente di visibile.
    expect(CONTROL_HINTS.some((hint) => hint.keys.includes('['))).toBe(false);
  });
});

describe('VIEW_HINTS', () => {
  it('nomina tutte le viste che si puntano, tranne Normal', () => {
    const labels = VIEW_HINTS.map((hint) => hint.label);
    expect(labels).toEqual(['X-ray', 'Levels', 'Cutaway', 'Block focus']);
  });

  it('ogni riga dice come si punta la vista', () => {
    for (const hint of VIEW_HINTS) expect(hint.gesture.length).toBeGreaterThan(0);
  });

  it('chiama le viste con lo stesso nome del picker', () => {
    // Due elenchi paralleli divergono al primo cambio, e il giocatore si
    // troverebbe l'aiuto che nomina una vista che nel dock non esiste.
    const menu = buildViewMenuModel(INSPECT_MODE.off, 24, 90);
    for (const hint of VIEW_HINTS) {
      const option = menu.options.find((candidate) => candidate.label === hint.label);
      expect(option?.gesture).toBe(hint.gesture);
    }
  });

  it('dice da dove si aprono e da dove si esce', () => {
    expect(VIEW_HINTS_LEAD).toContain('Views');
    expect(VIEW_HINTS_LEAD).toContain('V');
    // Una vista si prova volentieri quando si sa gia' come tornare indietro.
    expect(VIEW_HINTS_LEAD).toContain('Esc');
  });
});
