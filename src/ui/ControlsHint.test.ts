import { describe, expect, it } from 'vitest';
import { CONTROL_HINTS, DEMOLISH_HINTS, DEMOLISH_HINTS_LEAD, VIEW_HINTS, VIEW_HINTS_LEAD } from './ControlsHint';
import { INSPECT_MODE } from '../engine/inspect';
import { buildViewMenuModel } from './ViewMenuModel';

describe('CONTROL_HINTS', () => {
  it('documenta tutti i comandi della camera', () => {
    expect(CONTROL_HINTS).toEqual([
      { keys: ['WASD', '↑←↓→'], action: 'Move the camera' },
      { keys: ['Q', 'E'], action: 'Rotate the city' },
      { keys: ['Wheel'], action: 'Zoom in and out' },
      { keys: ['Drag'], action: 'Pan the camera' },
      { keys: ['Middle drag'], action: 'Orbit and tilt the view' },
      { keys: ['F'], action: 'Frame the city and level the view' },
      { keys: ['Click'], action: 'Inspect a building, block, column or voxel' },
      { keys: ['1', '…', '9'], action: 'Pick the matching tool from the dock' },
      { keys: ['Shift', '1..9'], action: 'Switch the visual theme' },
      { keys: ['V'], action: 'Cycle the views below' },
      { keys: ['L'], action: 'Hold the day, hold the night, or let the clock run' },
      { keys: ['Esc'], action: 'Cancel the tool, close the card, leave the view, then open the menu' },
    ]);
  });

  it('promette anche l’ultimo passo, che apre invece di chiudere', () => {
    // A mani vuote Escape non faceva niente, e nessuna riga lo diceva perche'
    // non c'era niente da dire. Adesso e' la porta del menu, ed e' il solo modo
    // di scoprirlo senza premerlo a caso.
    const escape = CONTROL_HINTS.find((hint) => hint.keys.includes('Esc'));
    expect(escape?.action).toContain('menu');
  });

  it('il click a mani vuote e’ un comando, e va detto', () => {
    // Nessun bottone lo suggerisce e a mani vuote non fa niente di visibile
    // finche' non si scopre che apre una scheda: e' un gesto che si impara
    // leggendolo, o per caso.
    const click = CONTROL_HINTS.find((hint) => hint.keys.includes('Click'));
    expect(click?.action).toContain('building');
    expect(click?.action).toContain('voxel');
  });

  it('promette che Escape riporta la citta’ intera', () => {
    // La card diceva solo "cancel the current tool", ed era vero: Escape si
    // rifiutava di spegnere una vista. Uscirne non era scritto da nessuna parte.
    const escape = CONTROL_HINTS.find((hint) => hint.keys.includes('Esc'));
    expect(escape?.action).toContain('view');
  });

  it('l’orbita e’ un comando di camera, non una funzione di Block focus', () => {
    // Stava solo dentro lo studio di un isolato, e chi voleva guardare la citta'
    // da un altro angolo doveva prima isolarne un pezzo. La riga sta fra i
    // comandi generali perche' e' li' che la si cerca.
    const orbit = CONTROL_HINTS.find((hint) => hint.action.includes('Orbit'));
    expect(orbit?.keys).toEqual(['Middle drag']);
    // E il ritorno all'assetto isometrico deve essere promesso dove sta: su `F`.
    const frame = CONTROL_HINTS.find((hint) => hint.keys.includes('F'));
    expect(frame?.action).toContain('level');
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

describe('DEMOLISH_HINTS', () => {
  it('documenta i tre gesti della gomma', () => {
    expect(DEMOLISH_HINTS).toEqual([
      { keys: ['Click'], action: 'Tear down a single building' },
      { keys: ['Drag'], action: 'Sweep an area of buildings' },
      { keys: ['Ctrl', 'Z'], action: 'Undo the last sweep while it is still falling' },
    ]);
  });

  it('l annullamento promette il tasto, non solo il gesto', () => {
    const undo = DEMOLISH_HINTS.find((hint) => hint.keys.includes('Ctrl'));
    expect(undo?.keys).toEqual(['Ctrl', 'Z']);
    expect(undo?.action).toContain('Undo');
  });

  it('dice il senso dei colori dell anteprima', () => {
    // Rosso e ambra compaiono solo durante lo striscio, e senza questa riga
    // l'ambra si leggerebbe come un'evidenza invece che come un "no".
    expect(DEMOLISH_HINTS_LEAD).toContain('red');
    expect(DEMOLISH_HINTS_LEAD).toContain('amber');
  });
});
