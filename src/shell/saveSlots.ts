import type { GrowthScene } from '../game/growthScene';
import { newGameUrl } from '../game/launchMode';
import type { SaveGame } from '../game/save/format';
import {
  AUTO_SLOT,
  deleteSlot,
  exportText,
  listSlots,
  PENDING_SLOT,
  writeSlot,
  type SaveStorage,
} from '../game/save/storage';
import type { GameHud } from '../ui/GameHud';

/**
 * Il salvataggio visto dalla radice: quando si scrive, dove, e cosa ne sa il menu.
 *
 * Il formato e la potatura stanno in `src/game/save/`; qui c'e' solo il ritmo —
 * l'automatico ogni venti secondi, gli slot a mano, l'apertura che passa per un
 * ricaricamento. Sono le uniche funzioni della radice che possiedono uno stato
 * proprio e non lo condividono con nessuno, ed e' per questo che stanno insieme
 * in un modulo invece che sparse fra il cablaggio.
 *
 * La scena e l'HUD arrivano come **funzioni**, non come valori: `main.ts` li
 * costruisce dopo che l'isola e' pronta, e una copia presa qui al montaggio
 * resterebbe `null` per sempre.
 */
export interface SaveSlotsDeps {
  readonly storage: SaveStorage | null;
  readonly seed: number;
  readonly scene: () => GrowthScene | null;
  readonly hud: () => GameHud | null;
}

/**
 * **L'autosalvataggio non segue il frame.** Il tempo lo decide questo intervallo
 * e il tick gia' salvato ferma il resto: una citta' in pausa non riscrive
 * ventiquattro volte al minuto lo stesso file. Il costo di una serializzazione
 * cade quindi su un frame ogni venti secondi, ed e' l'unico posto in cui questo
 * lavoro puo' stare senza un worker. Alla peggio si perdono al massimo qualche
 * decina di tick; il salvataggio d'uscita copre la finestra fra l'ultimo
 * automatico e la chiusura.
 */
const AUTOSAVE_INTERVAL_MS = 20_000;

export interface SaveSlots {
  autosave(time: number, force?: boolean): void;
  refreshSaveList(): void;
  startNewGame(chosen: number): void;
  saveToSlot(slot: string): void;
  openSlot(save: SaveGame | null, missing: string): void;
  exportSave(): void;
}

export function createSaveSlots(deps: SaveSlotsDeps): SaveSlots {
  const { storage, seed } = deps;
  let autosaveAt = 0;
  let autosavedTick = -1;
  /**
   * La partita in corso e' stata rinnegata: non si salva piu'.
   *
   * `startNewGame` cancella l'autosalvataggio e poi ricarica, ma andarsene fa
   * scattare `pagehide`, che **forza** un autosave: senza questa bandiera la
   * citta' appena buttata via si riscriverebbe da sola nello slot, e il
   * bootstrap successivo la ritroverebbe li' — proprio quando il seed scelto a
   * mano coincide con quello di prima, che e' il caso peggiore perche' e' anche
   * l'unico in cui l'isola sembra giusta e la citta' sopra e' quella vecchia.
   */
  let leavingForNewGame = false;

  function refreshSaveList(): void {
    const hud = deps.hud();
    hud?.setSaves(listSlots(storage));
    // Insieme all'elenco va anche cosa si sta per salvare: il seed lo tiene la
    // radice, e il menu ferma il tempo — quindi la riga non puo' invecchiare
    // mentre la si guarda.
    // Zero e zero prima che la scena esista: e' l'isola vergine del menu
    // d'ingresso, e non e' un valore mancante da nascondere.
    const stats = deps.scene()?.stats;
    hud?.setSummary(seed, stats?.state.population.stock ?? 0, stats?.buildings ?? 0);
  }

  return {
    autosave(time: number, force = false): void {
      if (leavingForNewGame) return;
      const scene = deps.scene();
      if (scene === null || storage === null) return;
      if (!force && time - autosaveAt < AUTOSAVE_INTERVAL_MS) return;

      const tickCount = scene.simState.tickCount;
      if (tickCount === autosavedTick) return;

      autosaveAt = time;
      autosavedTick = tickCount;
      const result = writeSlot(storage, AUTO_SLOT, scene.toSave(seed, Date.now()));
      if (!result.ok) {
        // Un fallimento va **detto**, e detto una volta: continuare a giocare
        // credendo di essere al sicuro e' peggio di sapere che non lo si e'.
        scene.setMessage(result.reason === 'quota'
          ? 'Autosave failed: browser storage is full.'
          : 'Autosave unavailable: browser storage is blocked.');
      }
    },

    /** Rilegge gli slot e li rimanda al menu, che non conosce lo storage. */
    refreshSaveList,

    /**
     * Butta via la partita in corso e ne apre una su un'altra isola.
     *
     * **L'autosalvataggio va cancellato, non solo scavalcato.** Il bootstrap lo
     * riapre quando il `?seed=` coincide, quindi chi digita a mano il seed della
     * partita in corso si ritroverebbe la vecchia citta' su un'isola che sembra
     * nuova. Lo slot di passaggio se ne va con lui: era la partita che qualcuno
     * aveva chiesto di aprire, e adesso non la vuole piu' nessuno.
     */
    startNewGame(chosen: number): void {
      leavingForNewGame = true;
      deleteSlot(storage, PENDING_SLOT);
      deleteSlot(storage, AUTO_SLOT);
      window.location.replace(newGameUrl(window.location.search, chosen));
    },

    /** Scrive la partita in uno slot a mano. */
    saveToSlot(slot: string): void {
      const scene = deps.scene();
      if (scene === null) return;
      const result = writeSlot(storage, slot, scene.toSave(seed, Date.now()));
      deps.hud()?.setSaveNote(result.ok
        ? 'Saved.'
        : result.reason === 'quota'
          ? 'Could not save: browser storage is full.'
          : 'Could not save: browser storage is blocked.');
      refreshSaveList();
    },

    /**
     * Apre una partita: la mette nello slot di passaggio e ricarica la pagina.
     *
     * **Ricaricare e' la strada corta e anche quella giusta.** Il seed decide
     * l'isola, l'isola arriva da un worker a blocchi, e camera, overlay e
     * streamer si costruiscono su quella: rifare tutto a caldo vorrebbe dire un
     * secondo percorso di costruzione del mondo accanto a quello che gia' parte
     * da zero a ogni avvio. Il seed va nell'indirizzo perche' e' li' che il
     * bootstrap lo cerca, e perche' l'URL resta il modo in cui questo mondo si
     * condivide.
     */
    openSlot(save: SaveGame | null, missing: string): void {
      if (save === null) {
        deps.hud()?.setSaveNote(missing);
        return;
      }
      const result = writeSlot(storage, PENDING_SLOT, save);
      if (!result.ok) {
        deps.hud()?.setSaveNote('Could not open that game: browser storage is full.');
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set('seed', String(save.seed));
      window.location.replace(url.toString());
    },

    /** Scarica la partita come file JSON. */
    exportSave(): void {
      const scene = deps.scene();
      if (scene === null) return;
      const text = exportText(scene.toSave(seed, Date.now()));
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `h10-city-${seed}.json`;
      link.click();
      // L'oggetto resta in memoria finche' non lo si revoca, e qui dentro c'e'
      // una citta' intera: si libera appena il click e' partito.
      URL.revokeObjectURL(url);
      deps.hud()?.setSaveNote('Exported.');
    },
  };
}
