import { describe, expect, it } from 'vitest';
import { createSimState, toSimStateData } from '../../sim';
import { SAVE_VERSION, type SaveGame } from './format';
import {
  AUTO_SLOT,
  deleteSlot,
  exportText,
  importText,
  listSlots,
  readSlot,
  writeSlot,
  type SaveStorage,
} from './storage';

function memoryStorage(limit = Infinity): SaveStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > limit) throw new Error('QuotaExceededError');
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

function save(seed = 4242): SaveGame {
  return {
    version: SAVE_VERSION,
    savedAt: 1_700_000_000_000,
    seed,
    sim: toSimStateData(createSimState()),
    records: [],
    sectors: [],
    scene: { paused: false, speed: 1, clock: 0, healthyTicks: 0 },
  };
}

describe('slot di salvataggio', () => {
  it('scrive e rilegge lo stesso salvataggio', () => {
    const storage = memoryStorage();
    expect(writeSlot(storage, AUTO_SLOT, save())).toEqual({ ok: true });
    expect(readSlot(storage, AUTO_SLOT)).toEqual(save());
  });

  it('tiene gli slot separati', () => {
    const storage = memoryStorage();
    writeSlot(storage, AUTO_SLOT, save(1));
    writeSlot(storage, '2', save(2));
    expect(readSlot(storage, AUTO_SLOT)?.seed).toBe(1);
    expect(readSlot(storage, '2')?.seed).toBe(2);
    expect(readSlot(storage, '3')).toBeNull();
  });

  it('dice che la quota e piena invece di lasciar salire l eccezione', () => {
    // Il ciclo di frame non deve poter morire perche' lo storage e' pieno.
    expect(writeSlot(memoryStorage(10), AUTO_SLOT, save())).toEqual({ ok: false, reason: 'quota' });
  });

  it('sopravvive a uno storage assente', () => {
    expect(writeSlot(null, AUTO_SLOT, save())).toEqual({ ok: false, reason: 'unavailable' });
    expect(readSlot(null, AUTO_SLOT)).toBeNull();
    expect(listSlots(null)).toEqual([]);
  });

  it('legge una chiave corrotta come uno slot vuoto', () => {
    const storage = memoryStorage();
    storage.setItem('h10.save.auto', '{ meta');
    expect(readSlot(storage, AUTO_SLOT)).toBeNull();
  });

  it('elenca solo gli slot pieni, con cosa serve a riconoscerli', () => {
    const storage = memoryStorage();
    writeSlot(storage, AUTO_SLOT, save(11));
    writeSlot(storage, '2', save(22));
    const slots = listSlots(storage);
    expect(slots.map((s) => s.slot)).toEqual([AUTO_SLOT, '2']);
    expect(slots[0]?.seed).toBe(11);
    expect(slots[0]?.population).toBe(Math.round(save().sim.population.stock));
  });

  it('cancella uno slot', () => {
    const storage = memoryStorage();
    writeSlot(storage, '1', save());
    deleteSlot(storage, '1');
    expect(readSlot(storage, '1')).toBeNull();
  });

  it('esporta e reimporta lo stesso salvataggio', () => {
    expect(importText(exportText(save()))).toEqual(save());
  });

  it('rifiuta un file importato che non e un salvataggio', () => {
    expect(importText('non sono JSON')).toBeNull();
    expect(importText('{"version":99}')).toBeNull();
  });
});
