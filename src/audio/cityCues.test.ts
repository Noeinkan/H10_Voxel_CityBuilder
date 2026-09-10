import { describe, expect, it } from 'vitest';
import { CityCueWatcher } from './cityCues';

describe('CityCueWatcher', () => {
  /**
   * E' il caso che ha deciso la forma della classe: al caricamento di un
   * salvataggio la prima lettura porta gia' tutti gli edifici della citta', e
   * senza la linea di partenza sarebbe un tonfo per una posa mai avvenuta.
   */
  it('la prima lettura fissa la linea di partenza e non suona', () => {
    const watcher = new CityCueWatcher();
    expect(watcher.observe({ buildings: 214, milestone: 6 })).toBeNull();
  });

  it('un edificio in piu e un tonfo, uno in meno e una demolizione', () => {
    const watcher = new CityCueWatcher();
    watcher.observe({ buildings: 10, milestone: 1 });
    expect(watcher.observe({ buildings: 11, milestone: 1 })).toBe('place');
    expect(watcher.observe({ buildings: 8, milestone: 1 })).toBe('demolish');
  });

  it('la citta ferma non suona', () => {
    const watcher = new CityCueWatcher();
    watcher.observe({ buildings: 10, milestone: 1 });
    expect(watcher.observe({ buildings: 10, milestone: 1 })).toBeNull();
  });

  /**
   * L'edificio che fa scattare la soglia e' un evento solo: raccontarlo con il
   * tonfo *e* con l'accordo sarebbe dirlo due volte nello stesso decimo di
   * secondo.
   */
  it('la soglia superata vince sulla posa che l ha causata', () => {
    const watcher = new CityCueWatcher();
    watcher.observe({ buildings: 10, milestone: 1 });
    expect(watcher.observe({ buildings: 11, milestone: 2 })).toBe('milestone');
  });

  it('reset rimette la linea di partenza, cosi la citta sostituita non suona', () => {
    const watcher = new CityCueWatcher();
    watcher.observe({ buildings: 10, milestone: 1 });
    watcher.reset();
    expect(watcher.observe({ buildings: 250, milestone: 9 })).toBeNull();
    expect(watcher.observe({ buildings: 251, milestone: 9 })).toBe('place');
  });
});
