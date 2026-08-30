import { AUTO_SLOT, type SlotInfo } from '../game/save/storage';

/**
 * Il menu principale come lo vede il giocatore, in TypeScript puro.
 *
 * Stessa divisione di `ViewMenuModel.ts` e `GameHudModel.ts`: qui non c'e' DOM e
 * non c'e' Three, e i test girano in `node`. `MainMenu.ts` disegna quello che
 * esce da qui e nient'altro.
 *
 * Le voci sono **quattro**, e Resume non e' fra loro: non apre una sezione,
 * chiude il menu. Tenerla nell'elenco vorrebbe dire un id che nessuna sezione
 * onora, e un pannello destro che resta vuoto quando lo si sceglie.
 */

export type MainMenuSection = 'saves' | 'new' | 'settings' | 'help';

export interface MainMenuEntry {
  readonly id: MainMenuSection;
  /** Cio' che si legge nella colonna: una parola, non una frase. */
  readonly label: string;
  /** Il titolo della sezione aperta, che ripete la scelta appena fatta. */
  readonly title: string;
  /** Una riga che dice cosa si sta per fare, prima di farlo. */
  readonly subtitle: string;
}

export const MAIN_MENU_ENTRIES: readonly MainMenuEntry[] = [
  {
    id: 'saves',
    label: 'Saves',
    title: 'Saved games',
    subtitle: 'The city keeps itself; these are the copies you keep.',
  },
  {
    id: 'new',
    label: 'New game',
    title: 'New island',
    subtitle: 'A seed is a city: the same number always grows the same island.',
  },
  {
    id: 'settings',
    label: 'Settings',
    title: 'Settings',
    subtitle: 'How the city looks, and what the sky is doing above it.',
  },
  {
    id: 'help',
    label: 'Help',
    title: 'Controls',
    subtitle: 'Every gesture the city answers to.',
  },
];

/** La voce di una sezione, per chi ha in mano solo il suo id. */
export function menuEntry(section: MainMenuSection): MainMenuEntry {
  // Il `find` non puo' fallire — l'elenco copre l'unione — ma il tipo non lo sa,
  // e il primo elemento e' un ripiego onesto quanto un `!`.
  return MAIN_MENU_ENTRIES.find((entry) => entry.id === section) ?? MAIN_MENU_ENTRIES[0];
}

/**
 * Come si chiama uno slot a schermo.
 *
 * L'automatico ha un nome proprio perche' e' l'unico che nessuno scrive a mano;
 * gli altri sono numerati dal loro id, che e' gia' `'1'`, `'2'`, `'3'`.
 */
export function slotLabel(slot: string): string {
  return slot === AUTO_SLOT ? 'Autosave' : `Slot ${slot}`;
}

/** Cosa si legge su una riga piena: quando, e quanto grande era la citta'. */
export function slotSummary(info: SlotInfo): string {
  const when = new Date(info.savedAt).toLocaleString();
  return `${when} · ${info.population} residents · ${info.buildings} buildings · seed ${info.seed}`;
}

/** La riga vuota: un fatto, non un errore. */
export const EMPTY_SLOT_SUMMARY = 'Empty';

/**
 * La partita in corso in una riga, al piede del menu.
 *
 * E' il «riepilogo» che mancava: chi apre il menu per salvare vuole sapere
 * **cosa** sta salvando, e il seed e' anche il numero che si condivide.
 */
export function gameSummary(seed: number, population: number, buildings: number): string {
  return `seed ${seed} · ${Math.round(population)} residents · ${buildings} buildings`;
}

/**
 * Chi e' il gioco, in fondo al menu e al titolo.
 *
 * **Firma lo studio, non la persona.** Questa riga e' l'unica cosa del gioco che
 * nomina qualcuno, la leggono tutti quelli che aprono la pagina, e il nome
 * proprio dell'autore non ha ragione di stare su uno schermo pubblico: la firma
 * e' `Noein Solutions`, come sul sito.
 *
 * Nessun numero di versione scritto a mano: sarebbe una seconda fonte accanto a
 * `package.json`, e le due divergerebbero al primo rilascio.
 */
export const ABOUT_LINE = 'H10 Voxel City Builder · alpha · © 2026 Noein Solutions';
