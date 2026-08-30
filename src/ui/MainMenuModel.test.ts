import { describe, expect, it } from 'vitest';
import { AUTO_SLOT, MANUAL_SLOTS, type SlotInfo } from '../game/save/storage';
import {
  ABOUT_LINE,
  MAIN_MENU_ENTRIES,
  gameSummary,
  menuEntry,
  slotLabel,
  slotSummary,
  type MainMenuSection,
} from './MainMenuModel';

function slot(overrides: Partial<SlotInfo> = {}): SlotInfo {
  return {
    slot: '1',
    savedAt: Date.UTC(2026, 7, 30, 12, 0, 0),
    seed: 1337,
    tick: 4200,
    population: 412,
    buildings: 96,
    ...overrides,
  };
}

describe('MAIN_MENU_ENTRIES', () => {
  it('copre l’unione delle sezioni, una volta ciascuna', () => {
    // L'elenco e' l'unica fonte della colonna: una sezione che non compare qui
    // e' una sezione irraggiungibile, e una doppia sarebbe due voci che aprono
    // lo stesso riquadro.
    const ids = MAIN_MENU_ENTRIES.map((entry) => entry.id);
    const expected: readonly MainMenuSection[] = ['saves', 'new', 'settings', 'help'];
    expect(ids).toEqual(expected);
  });

  it('non elenca Resume: quello chiude il menu, non apre una sezione', () => {
    expect(MAIN_MENU_ENTRIES.some((entry) => entry.label === 'Resume')).toBe(false);
  });

  it('ogni voce porta etichetta, titolo e una riga che dice cosa si sta per fare', () => {
    for (const entry of MAIN_MENU_ENTRIES) {
      expect(entry.label).not.toBe('');
      expect(entry.title).not.toBe('');
      expect(entry.subtitle).not.toBe('');
    }
  });

  it('risale alla voce dal solo id', () => {
    expect(menuEntry('new').label).toBe('New game');
    expect(menuEntry('help').title).toBe('Controls');
  });
});

describe('slotLabel', () => {
  it('nomina l’automatico e numera quelli a mano', () => {
    // L'automatico ha un nome proprio perche' e' l'unico che nessuno scrive a
    // mano: chiamarlo «Slot auto» direbbe che e' uno dei tre.
    expect(slotLabel(AUTO_SLOT)).toBe('Autosave');
    expect(MANUAL_SLOTS.map(slotLabel)).toEqual(['Slot 1', 'Slot 2', 'Slot 3']);
  });
});

describe('slotSummary', () => {
  it('dice quanto era grande la citta e su quale isola', () => {
    // La data non si fissa: `toLocaleString()` dipende da locale e fuso, e
    // pinnarla renderebbe il test verde solo su questa macchina.
    const summary = slotSummary(slot());
    expect(summary).toContain('412 residents');
    expect(summary).toContain('96 buildings');
    expect(summary).toContain('seed 1337');
  });

  it('non arrotonda: il conto arriva gia intero da chi legge lo slot', () => {
    // `listSlots` arrotonda la scorta di popolazione mentre riempie `SlotInfo`.
    // Rifarlo qui sarebbe una seconda regola sullo stesso numero, e la riga
    // deve mostrare cio' che lo slot dichiara.
    expect(slotSummary(slot({ population: 7 }))).toContain('7 residents');
  });
});

describe('gameSummary', () => {
  it('mette in una riga cosa si sta per salvare', () => {
    expect(gameSummary(1337, 412.4, 96)).toBe('seed 1337 · 412 residents · 96 buildings');
  });
});

describe('ABOUT_LINE', () => {
  it('non porta un numero di versione a mano', () => {
    // Sarebbe una seconda fonte accanto a `package.json`, e le due
    // divergerebbero al primo rilascio.
    expect(ABOUT_LINE).not.toMatch(/\d+\.\d+\.\d+/);
  });
});
