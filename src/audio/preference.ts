/**
 * Se il suono e' acceso, e dove resta scritto fra due partite.
 *
 * `localStorage` e non i parametri d'indirizzo, dove invece vivono tema, cielo e
 * nuvole: quelli sono cio' che **questa** schermata sta mostrando e vanno
 * condivisi con un link, il muto e' una proprieta' di chi sta davanti al
 * computer. Un indirizzo copiato da chi gioca in silenzio non deve zittire
 * anche chi lo riceve.
 *
 * Nessun accesso al DOM oltre la fabbrica in fondo: lo storage entra da fuori,
 * cosi' il file gira in `node` come tutto il resto.
 */

export const SOUND_STORAGE_KEY = 'h10.sound';

/** La fetta di `localStorage` che serve qui, e nient'altro. */
export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Lo storage del browser, o `null` dove e' negato.
 *
 * L'accesso e' fra `try`: in una finestra anonima con i dati dei siti bloccati
 * la sola **lettura** della proprieta' solleva, e sarebbe un errore all'avvio
 * per una preferenza che si puo' benissimo non ricordare.
 */
export function browserSoundStorage(): SoundStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Il suono e' acceso finche' qualcuno non lo spegne.
 *
 * Il default e' acceso e non spento: chi apre il gioco per la prima volta deve
 * sentire che il suono c'e', altrimenti la funzione esiste solo per chi va a
 * cercare il bottone. Chi lo spegne lo ritrova spento, ed e' quello che conta.
 */
export function readSoundPreference(storage: SoundStorage | null): boolean {
  try {
    return storage?.getItem(SOUND_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeSoundPreference(storage: SoundStorage | null, on: boolean): void {
  try {
    storage?.setItem(SOUND_STORAGE_KEY, on ? '1' : '0');
  } catch {
    // Il gioco suona lo stesso: quello che si perde e' solo la memoria fra due
    // ricariche, e non vale un errore in faccia a chi sta giocando.
  }
}
