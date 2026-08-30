import { readSave, type SaveGame } from './format';

/**
 * Gli slot, e il posto in cui stanno.
 *
 * **Lo storage entra come parametro**, esattamente come `HelpStorage` in
 * `ControlsHint.ts`: e' cio' che permette di provare quota piena, chiave
 * corrotta ed elenco degli slot in ambiente `node`, dove `localStorage` non
 * esiste. Il browser lo fornisce `browserStorage()`, e puo' non fornirlo
 * affatto — in navigazione privata l'accesso stesso puo' lanciare.
 *
 * **Niente eccezioni verso l'alto.** Salvare puo' fallire davvero — la quota e'
 * cinque megabyte e una citta' matura non e' piccola — e un fallimento va
 * mostrato al giocatore in una riga, non fatto risalire fino al ciclo di frame
 * dove diventerebbe una pagina bianca.
 */

/** Cio' che serve da uno storage. `Storage` del browser lo soddisfa. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Lo slot che il gioco riscrive da solo. */
export const AUTO_SLOT = 'auto';

/** Gli slot che il giocatore riempie a mano. */
export const MANUAL_SLOTS = ['1', '2', '3'] as const;

export const ALL_SLOTS: readonly string[] = [AUTO_SLOT, ...MANUAL_SLOTS];

/**
 * Lo slot di passaggio: cosa caricare al prossimo avvio.
 *
 * **Caricare significa ricaricare la pagina**, e non e' una rinuncia: il seed
 * decide l'isola, l'isola arriva da un worker a blocchi e mezza scena si
 * costruisce da quella. Rifare tutto a caldo vorrebbe dire un secondo percorso
 * di costruzione del mondo — con i suoi modi di divergere da quello vero —
 * accanto a uno che gia' funziona e che parte da zero ogni volta.
 *
 * Passa quindi di qui: chi carica scrive il salvataggio scelto, chi si avvia lo
 * consuma. Non e' l'autosave, e non deve esserlo: sovrascrivere quello
 * significherebbe che aprire uno slot vecchio butta via la partita in corso
 * prima ancora che il giocatore veda cosa ha aperto.
 */
export const PENDING_SLOT = 'pending';

const PREFIX = 'h10.save.';

/** Cosa c'e' in uno slot, senza aprirlo per intero. */
export interface SlotInfo {
  readonly slot: string;
  readonly savedAt: number;
  readonly seed: number;
  readonly tick: number;
  readonly population: number;
  readonly buildings: number;
}

export type WriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'quota' | 'unavailable' };

/** Lo storage del browser, o null dove non si puo' nemmeno chiedere. */
export function browserStorage(): SaveStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function writeSlot(
  storage: SaveStorage | null,
  slot: string,
  save: SaveGame,
): WriteResult {
  if (storage === null) return { ok: false, reason: 'unavailable' };
  try {
    storage.setItem(PREFIX + slot, JSON.stringify(save));
    return { ok: true };
  } catch {
    // `QuotaExceededError` e' l'unico fallimento che ci si aspetta qui, ma il
    // nome dell'eccezione cambia fra browser e non vale la pena distinguerlo:
    // per chi guarda, «non c'e' stato spazio» e' la stessa riga.
    return { ok: false, reason: 'quota' };
  }
}

export function readSlot(storage: SaveStorage | null, slot: string): SaveGame | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(PREFIX + slot);
    if (raw === null) return null;
    return readSave(JSON.parse(raw));
  } catch {
    // Una chiave illeggibile vale come uno slot vuoto: qualcuno l'ha toccata a
    // mano, o e' rimasta a meta' di una scrittura interrotta.
    return null;
  }
}

/**
 * Legge uno slot e lo svuota nello stesso gesto.
 *
 * E' come si consuma `PENDING_SLOT`: se restasse scritto, ogni ricaricamento
 * successivo riaprirebbe quella partita invece dell'autosave, e il giocatore
 * non avrebbe modo di uscirne.
 */
export function takeSlot(storage: SaveStorage | null, slot: string): SaveGame | null {
  const save = readSlot(storage, slot);
  if (save !== null) deleteSlot(storage, slot);
  return save;
}

export function deleteSlot(storage: SaveStorage | null, slot: string): void {
  if (storage === null) return;
  try {
    storage.removeItem(PREFIX + slot);
  } catch {
    // Uno slot che non si riesce a cancellare resta li': non c'e' niente di
    // meglio da fare, e il giocatore lo riscrivera' salvandoci sopra.
  }
}

/** Gli slot pieni, in ordine di catalogo. Quelli vuoti non compaiono. */
export function listSlots(storage: SaveStorage | null): readonly SlotInfo[] {
  const out: SlotInfo[] = [];
  for (const slot of ALL_SLOTS) {
    const save = readSlot(storage, slot);
    if (save === null) continue;
    out.push({
      slot,
      savedAt: save.savedAt,
      seed: save.seed,
      tick: save.sim.tickCount,
      population: Math.round(save.sim.population.stock),
      buildings: save.records.length,
    });
  }
  return out;
}

/** Il testo che finisce nel file scaricato. Indentato: e' fatto per essere letto. */
export function exportText(save: SaveGame): string {
  return JSON.stringify(save, null, 2);
}

/** L'inverso: un file scelto dal giocatore, o null se non e' un salvataggio. */
export function importText(text: string): SaveGame | null {
  try {
    return readSave(JSON.parse(text));
  } catch {
    return null;
  }
}
