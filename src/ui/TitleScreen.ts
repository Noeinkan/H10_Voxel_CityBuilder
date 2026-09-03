import type { LookChoice } from '../game/launchMode';
import type { SlotInfo } from '../game/save/storage';
import { ABOUT_LINE, slotLabel, slotSummary } from './MainMenuModel';
import { titleHelpPane } from './TitleHelp';
import { TitleSettings } from './TitleSettings';
import {
  TITLE_LOADING,
  TITLE_NAME,
  TITLE_TAGLINE,
  newIslandWarning,
  seedNote,
  titleButtons,
  type TitleAction,
  type TitlePane,
} from './TitleScreenModel';
import './titleScreen.css';

/**
 * La porta d'ingresso: una pagina, tre bottoni, nessuna citta' dietro.
 *
 * **Sta prima del gioco, non sopra.** Il menu di pausa e' una modale con un velo
 * e una partita viva sotto; questa e' l'unica cosa a schermo finche' non si
 * sceglie, e per questo non conosce ne' l'engine ne' l'HUD: il suo foglio di
 * stile e' suo, e il bundle del mondo si carica solo dopo la scelta. Era il
 * difetto che si vedeva — l'isola nasceva dietro il menu mentre il giocatore
 * stava ancora decidendo, e la scelta arrivava dopo il lavoro invece che prima.
 *
 * Come i cassetti, riceve elenchi gia' letti e restituisce gesti: chi tiene lo
 * storage e chi carica il mondo e' `boot.ts`.
 */

export interface TitleScreenView {
  /** L'autosalvataggio, se c'e': e' cio' che rende «Continue» una promessa vera. */
  readonly autosave: SlotInfo | null;
  /** Gli slot pieni, automatico compreso: sono le citta' riapribili. */
  readonly slots: readonly SlotInfo[];
  /** Tema, cielo e nuvole in vigore: quelli dichiarati dall'indirizzo. */
  readonly look: LookChoice;
}

export interface TitleScreenHandlers {
  readonly onContinue: () => void;
  readonly onCreate: (seed: number) => void;
  readonly onLoad: (slot: string) => void;
  /** Il seed sorteggiato da chi possiede l'unico tiro del gioco. */
  readonly onRoll: () => number;
  /**
   * Tema, cielo o nuvole sono cambiati.
   *
   * Il titolo non li applica: qui non c'e' ancora niente da illuminare. Li
   * rimanda a chi tiene l'indirizzo, che e' il posto da cui la radice li
   * leggera' quando il mondo nascera'.
   */
  readonly onLook: (look: LookChoice) => void;
}

/** Quanto dura la dissolvenza; deve restare uguale alla transizione nel CSS. */
const FADE_MS = 420;

export class TitleScreen {
  readonly root: HTMLElement;

  private readonly inner: HTMLElement;
  private readonly stack: HTMLElement;
  private readonly panes = new Map<Exclude<TitlePane, 'root'>, HTMLElement>();
  private readonly seedField: HTMLInputElement;
  private readonly seedHint: HTMLElement;
  private readonly createButton: HTMLButtonElement;
  private readonly loadNote: HTMLElement;
  private readonly primaryButton: HTMLButtonElement | null = null;

  constructor(
    private readonly handlers: TitleScreenHandlers,
    private readonly view: TitleScreenView,
  ) {
    this.root = document.createElement('div');
    // Il cielo e' un modificatore da quando il menu di pausa riusa la stessa
    // colonna: li' dietro c'e' la citta' sfocata, e un fondo dipinto sopra
    // direbbe che si e' usciti dal gioco invece che messo in pausa.
    this.root.className = 'title-screen title-screen--sky';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', TITLE_NAME);
    // Da una sottoschermata si torna indietro, non si esce: qui fuori non c'e'
    // ancora niente a cui tornare.
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.openPane('root');
    });

    this.inner = document.createElement('div');
    this.inner.className = 'title-inner';
    this.root.appendChild(this.inner);

    const wordmark = document.createElement('h1');
    wordmark.className = 'title-wordmark';
    wordmark.textContent = TITLE_NAME;
    const tagline = document.createElement('p');
    tagline.className = 'title-tagline';
    tagline.textContent = TITLE_TAGLINE;

    this.stack = document.createElement('div');
    this.stack.className = 'title-stack';
    for (const entry of titleButtons(view.autosave, view.slots)) {
      const button = this.menuButton(entry.id, entry.label, entry.detail, entry.primary);
      button.disabled = entry.disabled;
      if (entry.primary) this.primaryButton = button;
      this.stack.appendChild(button);
    }

    const newPane = this.buildNewPane();
    this.seedField = newPane.querySelector('.title-field') as HTMLInputElement;
    this.seedHint = newPane.querySelector('[data-role="seed-hint"]') as HTMLElement;
    this.createButton = newPane.querySelector('[data-role="create"]') as HTMLButtonElement;
    const loadPane = this.buildLoadPane();
    this.loadNote = loadPane.querySelector('[data-role="load-note"]') as HTMLElement;
    const settingsPane = new TitleSettings(view.look, (look) => handlers.onLook(look)).root;
    settingsPane.appendChild(this.backButton());
    const helpPane = titleHelpPane();
    helpPane.appendChild(this.backButton());
    this.panes.set('new', newPane);
    this.panes.set('load', loadPane);
    this.panes.set('settings', settingsPane);
    this.panes.set('help', helpPane);

    const foot = document.createElement('div');
    foot.className = 'title-foot';
    const about = document.createElement('span');
    about.textContent = ABOUT_LINE;
    foot.appendChild(about);

    this.inner.append(wordmark, tagline, this.stack);
    for (const [, pane] of this.panes) this.inner.appendChild(pane);
    this.inner.appendChild(foot);
    this.openPane('root');
    this.fillSeed();
  }

  /** Il fuoco al bottone che ci si aspetta di premere: si gioca da tastiera. */
  focus(): void {
    this.primaryButton?.focus();
  }

  /**
   * La scelta e' fatta: da qui in poi c'e' solo da aspettare.
   *
   * I bottoni spariscono invece di spegnersi perche' non tornano piu': dopo
   * questo la pagina non e' un menu, e' l'attesa del mondo.
   */
  startLoading(message: string = TITLE_LOADING): void {
    const waiting = document.createElement('div');
    waiting.className = 'title-loading';
    const spinner = document.createElement('div');
    spinner.className = 'title-spinner';
    const label = document.createElement('span');
    label.textContent = message;
    label.setAttribute('role', 'status');
    waiting.append(spinner, label);
    this.stack.replaceChildren(waiting);
    this.openPane('root');
  }

  /** Sfuma e se ne va: il mondo dietro e' pronto, non c'e' piu' niente da coprire. */
  async fadeOut(): Promise<void> {
    this.root.dataset['leaving'] = 'true';
    await new Promise((resolve) => window.setTimeout(resolve, FADE_MS));
    this.root.remove();
  }

  /** Una riga di esito sui salvataggi: serve soprattutto ai fallimenti. */
  setLoadNote(text: string): void {
    this.loadNote.textContent = text;
  }

  private menuButton(
    id: TitleAction,
    label: string,
    detail: string,
    primary: boolean,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'title-button title-button--primary' : 'title-button';
    const name = document.createElement('span');
    name.className = 'title-label';
    name.textContent = label;
    const note = document.createElement('span');
    note.className = 'title-detail';
    note.textContent = detail;
    button.append(name, note);
    button.addEventListener('click', () => this.press(id));
    return button;
  }

  private press(id: TitleAction): void {
    if (id === 'continue') {
      this.handlers.onContinue();
      return;
    }
    this.openPane(id);
  }

  /**
   * La sottoschermata dell'isola nuova.
   *
   * **Il tiro non sta qui.** `AGENTS.md` vieta `Math.random()` sui percorsi
   * deterministici e il gioco possiede gia' un sorteggio solo: questa lo chiede
   * con `onRoll` invece di inventarne un secondo che divergerebbe dal primo.
   */
  private buildNewPane(): HTMLElement {
    const pane = document.createElement('div');
    pane.className = 'title-pane';

    const title = document.createElement('h2');
    title.className = 'title-pane-title';
    title.textContent = 'New island';
    const note = document.createElement('p');
    note.className = 'title-note';
    note.textContent = 'The same seed always grows the same island. Change it, or roll another one.';

    const row = document.createElement('div');
    row.className = 'title-row';
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'title-field';
    field.inputMode = 'numeric';
    field.placeholder = 'Random';
    field.setAttribute('aria-label', 'Seed for the new island');
    field.addEventListener('input', () => this.paintSeed());
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.create();
    });
    const roll = document.createElement('button');
    roll.type = 'button';
    roll.className = 'title-small';
    roll.textContent = 'Random';
    roll.addEventListener('click', () => {
      field.value = String(this.handlers.onRoll());
      this.paintSeed();
    });
    row.append(field, roll);

    const hint = document.createElement('p');
    hint.className = 'title-note';
    hint.dataset['role'] = 'seed-hint';

    pane.append(title, note, row, hint);

    const warning = newIslandWarning(this.view.autosave !== null);
    if (warning !== null) {
      const warn = document.createElement('p');
      warn.className = 'title-note';
      warn.dataset['warn'] = 'true';
      warn.textContent = warning;
      pane.appendChild(warn);
    }

    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'title-button title-button--primary';
    create.dataset['role'] = 'create';
    const label = document.createElement('span');
    label.className = 'title-label';
    label.textContent = 'Create island';
    create.appendChild(label);
    create.addEventListener('click', () => this.create());

    pane.append(create, this.backButton());
    return pane;
  }

  private buildLoadPane(): HTMLElement {
    const pane = document.createElement('div');
    pane.className = 'title-pane';

    const title = document.createElement('h2');
    title.className = 'title-pane-title';
    title.textContent = 'Load city';
    pane.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'title-slots';
    for (const info of this.view.slots) {
      const row = document.createElement('li');
      row.className = 'title-slot';
      const text = document.createElement('div');
      text.className = 'title-slot-text';
      const name = document.createElement('span');
      name.className = 'title-slot-name';
      name.textContent = slotLabel(info.slot);
      const summary = document.createElement('span');
      summary.className = 'title-slot-summary';
      summary.textContent = slotSummary(info);
      text.append(name, summary);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'title-small';
      open.textContent = 'Load';
      open.addEventListener('click', () => this.handlers.onLoad(info.slot));
      row.append(text, open);
      list.appendChild(row);
    }
    pane.appendChild(list);

    const note = document.createElement('p');
    note.className = 'title-note';
    note.dataset['role'] = 'load-note';
    pane.append(note, this.backButton());
    return pane;
  }

  private backButton(): HTMLButtonElement {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'title-small';
    back.textContent = 'Back';
    back.addEventListener('click', () => this.openPane('root'));
    return back;
  }

  private create(): void {
    const { seed, invalid } = seedNote(this.seedField.value);
    if (invalid) return;
    // Il campo vuoto non e' un dato mancante: e' la richiesta di un'isola che
    // nessuno ha ancora visto, e il seed lo tira chi possiede il tiro.
    this.handlers.onCreate(seed ?? this.handlers.onRoll());
  }

  /**
   * Il campo arriva gia' pieno di un seed tirato.
   *
   * Un campo vuoto chiede un numero proprio a chi non ne ha uno in mente, ed e'
   * il caso normale dell'isola nuova: il seed sorteggiato e' la risposta giusta
   * gia' scritta, e resta un testo che si sovrascrive. Il vuoto continua a
   * valere — cancellarlo vuol dire «tirane un altro al via» — ma non e' piu' lo
   * stato d'ingresso, e rientrando nella sottoschermata si ritrova pieno.
   */
  private fillSeed(): void {
    if (this.seedField.value.trim() === '') {
      this.seedField.value = String(this.handlers.onRoll());
    }
    this.paintSeed();
  }

  private paintSeed(): void {
    const { invalid, note } = seedNote(this.seedField.value);
    this.createButton.disabled = invalid;
    this.seedHint.textContent = note;
  }

  private openPane(pane: TitlePane): void {
    this.stack.hidden = pane !== 'root';
    for (const [id, element] of this.panes) element.hidden = id !== pane;
    if (pane === 'new') {
      this.fillSeed();
      this.seedField.focus();
      // Il seed pieno e' selezionato: chi ne ha uno suo lo scrive sopra senza
      // dover prima cancellare quello proposto.
      this.seedField.select();
    } else if (pane === 'root') this.primaryButton?.focus();
  }
}
