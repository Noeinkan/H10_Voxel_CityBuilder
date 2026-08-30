import { parseSeedInput } from '../game/launchMode';
import type { SlotInfo } from '../game/save/storage';
import { slotSummary } from './MainMenuModel';

/**
 * La schermata del titolo come la vede il giocatore, in TypeScript puro.
 *
 * Stessa divisione di `MainMenuModel.ts`: qui non c'e' DOM, non c'e' Three, e i
 * test girano in `node`. `TitleScreen.ts` disegna quello che esce da qui.
 *
 * **Non e' il menu di pausa con un fondo diverso.** Quello gestisce una partita
 * viva — salvataggi, temi, viste — e vive accanto alla citta'. Questo sta prima
 * che la citta' esista, e ha una domanda sola: quale isola. Le voci sono percio'
 * tre, non sette, e ognuna e' un modo di rispondere a quella domanda.
 */

export type TitleAction = 'continue' | 'new' | 'load' | 'settings' | 'help';

/** Cosa si sta guardando: l'elenco, o una delle sottoschermate. */
export type TitlePane = 'root' | 'new' | 'load' | 'settings' | 'help';

export interface TitleButton {
  readonly id: TitleAction;
  /** Una o due parole: e' un bottone grande, non una frase. */
  readonly label: string;
  /** La riga sotto, che dice cosa succede premendolo. */
  readonly detail: string;
  /** Quello che ci si aspetta di premere arrivando qui. Uno solo. */
  readonly primary: boolean;
  readonly disabled: boolean;
}

export const TITLE_NAME = 'H10 Voxel City';

export const TITLE_TAGLINE = 'Pick an island. The city grows on it.';

/** Cosa si legge mentre l'isola nasce, dopo la scelta e prima della partita. */
export const TITLE_LOADING = 'Growing the island…';

/**
 * L'elenco del titolo.
 *
 * **Continue compare solo se c'e' davvero qualcosa da riprendere**, e quando
 * c'e' e' lui il bottone grande: chi torna il giorno dopo vuole la sua citta',
 * non un'isola nuova. Senza autosalvataggio la prima voce cambia parola — «Play»
 * invece di «New island» — perche' li' non c'e' un «vecchio» da cui distinguerla,
 * e chiamarla «nuova» farebbe cercare quella di prima.
 */
export function titleButtons(
  autosave: SlotInfo | null,
  slots: readonly SlotInfo[],
): readonly TitleButton[] {
  const buttons: TitleButton[] = [];
  if (autosave !== null) {
    buttons.push({
      id: 'continue',
      label: 'Continue',
      detail: slotSummary(autosave),
      primary: true,
      disabled: false,
    });
  }
  buttons.push({
    id: 'new',
    label: autosave === null ? 'Play' : 'New island',
    detail: 'A seed is a city: the same number always grows the same island.',
    primary: autosave === null,
    disabled: false,
  });
  buttons.push({
    id: 'load',
    label: 'Load city',
    detail: savedDetail(slots),
    primary: false,
    // Un bottone che apre un elenco vuoto e' una porta su una stanza vuota: si
    // spegne, e la riga sotto dice perche'.
    disabled: slots.length === 0,
  });
  // Le due voci che il mondo non se lo aspetta gia' fatto: qui si decide **come**
  // nascera' — il cielo lo legge la radice dall'indirizzo — e si leggono i
  // comandi prima di averne bisogno, non dopo aver sbagliato il primo gesto.
  buttons.push({
    id: 'settings',
    label: 'Settings',
    detail: 'How the city looks, and what the sky is doing above it.',
    primary: false,
    disabled: false,
  });
  buttons.push({
    id: 'help',
    label: 'Help',
    detail: 'Every gesture the city answers to.',
    primary: false,
    disabled: false,
  });
  return buttons;
}

/** Quante citta' ci sono da riaprire, in una riga. */
export function savedDetail(slots: readonly SlotInfo[]): string {
  if (slots.length === 0) return 'Nothing saved yet.';
  return slots.length === 1 ? '1 saved city.' : `${slots.length} saved cities.`;
}

export interface SeedNote {
  /** Il seed scelto, o `null` se va sorteggiato. */
  readonly seed: number | null;
  /** Scritto qualcosa che un seed non e': il bottone si spegne. */
  readonly invalid: boolean;
  /** La riga sotto il campo, che conferma cosa si sta per generare. */
  readonly note: string;
}

/**
 * Cosa dice il campo del seed adesso.
 *
 * Il vuoto e' **valido** e vuol dire «sorteggiane uno»; il pieno illeggibile no,
 * e spegne il bottone invece di far partire un mondo casuale che nessuno ha
 * chiesto. Stessa regola della sezione del menu di pausa, che passa dallo stesso
 * `parseSeedInput`: due letture separate di «cos'e' un seed» divergerebbero al
 * primo caso limite.
 */
export function seedNote(raw: string): SeedNote {
  const typed = raw.trim();
  const seed = typed === '' ? null : parseSeedInput(typed);
  const invalid = typed !== '' && seed === null;
  return {
    seed,
    invalid,
    note: invalid
      ? 'That is not a seed: use a whole number other than zero.'
      : seed === null
        ? 'A seed will be drawn for you.'
        : `Island ${seed}.`,
  };
}

/**
 * La riga che avverte prima di un'isola nuova.
 *
 * Iniziare da capo butta via l'autosalvataggio, ed e' l'unica cosa che si perde
 * davvero: gli slot a mano restano, e dirlo evita l'unica lettura possibile
 * altrimenti, cioe' «perdo tutto». Senza autosalvataggio non c'e' niente da
 * avvertire e la riga sparisce.
 */
export function newIslandWarning(hasAutosave: boolean): string | null {
  return hasAutosave
    ? 'This replaces the autosaved city with a brand new island. Your saved slots stay.'
    : null;
}
