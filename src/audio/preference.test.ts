import { describe, expect, it } from 'vitest';
import {
  readSoundPreference,
  writeSoundPreference,
  SOUND_STORAGE_KEY,
  type SoundStorage,
} from './preference';

function memoryStorage(seed?: string): SoundStorage & { readonly written: string[] } {
  const written: string[] = [];
  let value = seed ?? null;
  return {
    written,
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
      written.push(next);
    },
  };
}

/** Uno storage che solleva a ogni gesto: la finestra anonima con i dati bloccati. */
const hostileStorage: SoundStorage = {
  getItem: () => {
    throw new Error('storage denied');
  },
  setItem: () => {
    throw new Error('storage denied');
  },
};

describe('readSoundPreference', () => {
  it('senza niente di scritto il suono e acceso', () => {
    expect(readSoundPreference(memoryStorage())).toBe(true);
  });

  it('solo lo zero spegne', () => {
    expect(readSoundPreference(memoryStorage('0'))).toBe(false);
    expect(readSoundPreference(memoryStorage('1'))).toBe(true);
  });

  /**
   * Una chiave toccata a mano non deve spegnere il gioco: tutto cio' che non e'
   * esattamente lo zero vale come «acceso», che e' anche il default.
   */
  it('un valore incomprensibile vale acceso', () => {
    expect(readSoundPreference(memoryStorage('yes please'))).toBe(true);
  });

  it('senza storage, o con uno che solleva, resta acceso', () => {
    expect(readSoundPreference(null)).toBe(true);
    expect(readSoundPreference(hostileStorage)).toBe(true);
  });
});

describe('writeSoundPreference', () => {
  it('scrive uno e zero sotto la propria chiave', () => {
    const storage = memoryStorage();
    writeSoundPreference(storage, false);
    expect(storage.written).toEqual(['0']);
    expect(readSoundPreference(storage)).toBe(false);
    writeSoundPreference(storage, true);
    expect(storage.written).toEqual(['0', '1']);
    expect(readSoundPreference(storage)).toBe(true);
  });

  it('lo storage negato non ferma la partita', () => {
    expect(() => writeSoundPreference(hostileStorage, false)).not.toThrow();
    expect(() => writeSoundPreference(null, false)).not.toThrow();
  });

  it('la chiave e quella dichiarata, cosi il salvataggio non la calpesta', () => {
    expect(SOUND_STORAGE_KEY).toBe('h10.sound');
  });
});
