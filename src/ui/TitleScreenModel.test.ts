import { describe, expect, it } from 'vitest';
import { AUTO_SLOT, type SlotInfo } from '../game/save/storage';
import {
  newIslandWarning,
  savedDetail,
  seedNote,
  titleButtons,
  type TitleAction,
} from './TitleScreenModel';

function slot(overrides: Partial<SlotInfo> = {}): SlotInfo {
  return {
    slot: AUTO_SLOT,
    savedAt: Date.UTC(2026, 7, 30, 12, 0, 0),
    seed: 1337,
    tick: 4200,
    population: 412,
    buildings: 96,
    ...overrides,
  };
}

describe('titleButtons', () => {
  it('senza autosalvataggio non promette una partita da riprendere', () => {
    // Un «Continue» che non riapre niente e' la peggiore delle voci: chiede di
    // fidarsi e poi non risponde.
    const ids = titleButtons(null, []).map((button) => button.id);
    const expected: readonly TitleAction[] = ['new', 'load', 'settings', 'help'];
    expect(ids).toEqual(expected);
  });

  it('Settings e Help ci sono sempre: non dipendono da cosa c’e salvato', () => {
    // Sono le due voci che non parlano di una partita: il cielo con cui il
    // mondo nascera' e i comandi da leggere prima di sbagliare il primo gesto.
    for (const buttons of [titleButtons(null, []), titleButtons(slot(), [slot()])]) {
      const ids = buttons.map((button) => button.id);
      expect(ids).toContain('settings');
      expect(ids).toContain('help');
      expect(buttons.filter((button) => button.disabled).map((button) => button.id))
        .not.toContain('settings');
    }
  });

  it('con l’autosalvataggio Continue viene prima ed e il bottone grande', () => {
    const buttons = titleButtons(slot(), [slot()]);
    expect(buttons[0].id).toBe('continue');
    expect(buttons.filter((button) => button.primary).map((button) => button.id)).toEqual([
      'continue',
    ]);
  });

  it('la voce grande e una sola anche quando non c’e niente da riprendere', () => {
    // Due bottoni «principali» sono zero bottoni principali: chi arriva non sa
    // piu' quale sia la strada normale.
    const primary = titleButtons(null, []).filter((button) => button.primary);
    expect(primary.map((button) => button.id)).toEqual(['new']);
  });

  it('la prima voce cambia parola quando non c’e un vecchio da cui distinguerla', () => {
    expect(titleButtons(null, []).find((button) => button.id === 'new')?.label).toBe('Play');
    expect(titleButtons(slot(), []).find((button) => button.id === 'new')?.label)
      .toBe('New island');
  });

  it('Load si spegne su un elenco vuoto e dice perche', () => {
    const empty = titleButtons(null, []).find((button) => button.id === 'load');
    expect(empty?.disabled).toBe(true);
    expect(empty?.detail).toBe('Nothing saved yet.');
    expect(titleButtons(null, [slot()]).find((button) => button.id === 'load')?.disabled)
      .toBe(false);
  });

  it('Continue porta con se quanto era grande la citta', () => {
    const resume = titleButtons(slot(), []).find((button) => button.id === 'continue');
    expect(resume?.detail).toContain('412 residents');
    expect(resume?.detail).toContain('seed 1337');
  });
});

describe('savedDetail', () => {
  it('conta le citta al singolare e al plurale', () => {
    expect(savedDetail([slot()])).toBe('1 saved city.');
    expect(savedDetail([slot(), slot({ slot: '1' })])).toBe('2 saved cities.');
  });
});

describe('seedNote', () => {
  it('il vuoto e valido e vuol dire «sorteggiane uno»', () => {
    const note = seedNote('   ');
    expect(note.seed).toBeNull();
    expect(note.invalid).toBe(false);
    expect(note.note).toBe('A seed will be drawn for you.');
  });

  it('un numero conferma quale isola si sta per generare', () => {
    expect(seedNote(' 42 ')).toEqual({ seed: 42, invalid: false, note: 'Island 42.' });
  });

  it('cio che un seed non e spegne il bottone invece di sorteggiare', () => {
    // Il caso peggiore non e' l'errore: e' partire su un mondo casuale mentre
    // il giocatore crede di aver scelto il suo.
    const note = seedNote('isola');
    expect(note.invalid).toBe(true);
    expect(note.seed).toBeNull();
  });

  it('lo zero non e un seed, il negativo si', () => {
    expect(seedNote('0').invalid).toBe(true);
    expect(seedNote('-5').seed).toBe(-5);
  });
});

describe('newIslandWarning', () => {
  it('avverte solo quando c’e davvero qualcosa da perdere', () => {
    expect(newIslandWarning(false)).toBeNull();
    expect(newIslandWarning(true)).toContain('autosaved');
  });

  it('dice anche cosa resta: senza, l’unica lettura e «perdo tutto»', () => {
    expect(newIslandWarning(true)).toContain('saved slots stay');
  });
});
