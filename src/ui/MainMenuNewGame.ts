import { parseSeedInput } from '../game/launchMode';
import { sectionTitle } from './drawerBits';

/**
 * La sezione della partita nuova: un numero, e una conferma.
 *
 * **Il tiro non sta qui.** `AGENTS.md` vieta `Math.random()` sui percorsi
 * deterministici, e la radice possiede gia' il sorteggio vero
 * (`crypto.getRandomValues`): questa sezione lo chiede con `onRoll` invece di
 * inventarne un secondo che divergerebbe dal primo.
 *
 * **La conferma e' in due passi e non e' una cortesia.** Iniziare una partita
 * nuova butta via l'autosalvataggio: e' l'unica cosa che si perde davvero, ed e'
 * anche l'unica che il giocatore non ha scritto a mano. Gli slot restano, e la
 * riga lo dice — senza, l'unica lettura possibile e' «perdo tutto».
 */

export interface NewGameHandlers {
  readonly onStart: (seed: number) => void;
  /** Un seed sorteggiato dalla radice, che possiede l'unico tiro del gioco. */
  readonly onRoll: () => number;
}

export class MainMenuNewGame {
  readonly root: HTMLElement;

  private readonly field: HTMLInputElement;
  private readonly start: HTMLButtonElement;
  private readonly confirm: HTMLElement;
  private readonly hint: HTMLElement;
  /** Il primo colpo arma, il secondo parte: la sezione ricorda solo questo. */
  private arming = false;

  constructor(private readonly handlers: NewGameHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'menu-section-body';

    this.root.appendChild(sectionTitle('Seed'));
    const note = document.createElement('p');
    note.className = 'drawer-note';
    note.textContent = 'The same seed always grows the same island. Leave it empty for a new one.';
    this.root.appendChild(note);

    const row = document.createElement('div');
    row.className = 'menu-choice-row';
    this.field = document.createElement('input');
    this.field.type = 'text';
    this.field.className = 'menu-field';
    this.field.inputMode = 'numeric';
    this.field.placeholder = 'Random';
    this.field.setAttribute('aria-label', 'Seed for the new island');
    this.field.addEventListener('input', () => {
      // Cambiare idea sul numero disarma la conferma: confermare un seed e poi
      // scriverne un altro farebbe partire un mondo che nessuno ha confermato.
      this.arming = false;
      this.paint();
    });
    row.appendChild(this.field);

    const roll = document.createElement('button');
    roll.type = 'button';
    roll.className = 'save-button';
    roll.textContent = 'Random';
    roll.addEventListener('click', () => {
      this.field.value = String(handlers.onRoll());
      this.arming = false;
      this.paint();
    });
    row.appendChild(roll);
    this.root.appendChild(row);

    this.hint = document.createElement('p');
    this.hint.className = 'drawer-note';
    this.root.appendChild(this.hint);

    this.confirm = document.createElement('p');
    this.confirm.className = 'drawer-note';
    this.confirm.dataset['blocked'] = 'true';
    this.confirm.textContent =
      'This replaces the autosave with a brand new island. Your three manual slots stay.';
    this.root.appendChild(this.confirm);

    const actions = document.createElement('div');
    actions.className = 'menu-choice-row';
    this.start = document.createElement('button');
    this.start.type = 'button';
    this.start.className = 'save-button';
    this.start.addEventListener('click', () => this.press());
    actions.appendChild(this.start);
    this.root.appendChild(actions);

    this.paint();
  }

  /** Disarma la conferma: la chiusura del menu non deve lasciarla carica. */
  reset(): void {
    this.arming = false;
    this.paint();
  }

  private press(): void {
    if (!this.arming) {
      this.arming = true;
      this.paint();
      return;
    }
    const typed = this.field.value.trim();
    const seed = typed === '' ? this.handlers.onRoll() : parseSeedInput(typed);
    if (seed === null) return;
    this.handlers.onStart(seed);
  }

  /**
   * Cosa dice il bottone adesso.
   *
   * Un campo vuoto e' valido — vuol dire «sorteggiane uno» — mentre un campo
   * pieno di qualcosa che non e' un seed non lo e', e il bottone si spegne
   * invece di far partire un mondo casuale che nessuno ha chiesto.
   */
  private paint(): void {
    const typed = this.field.value.trim();
    const seed = typed === '' ? null : parseSeedInput(typed);
    const invalid = typed !== '' && seed === null;
    this.start.disabled = invalid;
    this.start.textContent = this.arming ? 'Confirm: start over' : 'Start new city';
    this.start.dataset['armed'] = this.arming ? 'true' : 'false';
    this.confirm.hidden = !this.arming;
    this.hint.textContent = invalid
      ? 'That is not a seed: use a whole number other than zero.'
      : seed === null
        ? 'A seed will be drawn for you.'
        : `Island ${seed}.`;
  }
}
