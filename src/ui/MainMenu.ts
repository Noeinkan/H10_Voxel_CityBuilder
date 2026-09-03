import type { SlotInfo } from '../game/save/storage';
import type { DaylightMode } from '../engine/daylight';
import type { ThemeChoice } from './GameHud';
import {
  ABOUT_LINE,
  MAIN_MENU_ENTRIES,
  gameSummary,
  menuEntry,
  type MainMenuSection,
} from './MainMenuModel';
import { MainMenuNewGame, type NewGameHandlers } from './MainMenuNewGame';
import { MainMenuSaves, type SaveSectionHandlers } from './MainMenuSaves';
import { MainMenuSettings, type SettingsHandlers } from './MainMenuSettings';
import { titleHelpPane } from './TitleHelp';
import { titleNote, titleSmall } from './titleBits';
import { TITLE_NAME, savedDetail } from './TitleScreenModel';
import './titleScreen.css';

/**
 * Il menu di pausa: l'unica superficie che dice «sei fuori dalla partita».
 *
 * **Non e' piu' la porta d'ingresso.** Quella e' la schermata del titolo, che
 * vive prima del mondo in `TitleScreen.ts`: qui sotto c'e' sempre una citta'
 * viva, e ogni voce parla di lei — non di quale cominciare.
 *
 * **Ma e' vestita come lei, e non per somiglianza.** Stessa colonna, stessi
 * bottoni grandi con la riga che dice cosa succede premendoli, stesse
 * sottoschermate che sostituiscono l'elenco invece di aprirsi accanto: sono i
 * due posti dove si sceglie una citta' e come guardarla, e due disegni diversi
 * per la stessa domanda si imparano due volte. Cambia il fondo, che e' l'unica
 * cosa che qui e' davvero diversa — al posto del cielo c'e' la citta' sfocata
 * dal velo, perche' non si e' usciti dal gioco, si e' messo in pausa.
 *
 * **E' una modale, e questa e' la differenza che conta.** I cassetti di destra
 * vivono accanto alla citta' e si escludono a vicenda per convenzione; questo
 * ha un velo sotto, si prende i clic che sarebbero arrivati alla canvas, e
 * finche' e' aperto il tempo non passa. Non e' un pannello in piu': e' un modo.
 *
 * **Non conosce lo storage, la simulazione ne' l'engine.** Come i cassetti,
 * riceve elenchi gia' letti e restituisce gesti. Chi ha in mano la partita sta
 * in `main.ts`, che e' l'unico a poterne decidere il destino.
 */

export interface MainMenuHandlers extends SaveSectionHandlers, SettingsHandlers, NewGameHandlers {
  readonly onResume: () => void;
  /** Chiede l'elenco aggiornato degli slot: il menu non legge lo storage. */
  readonly onSavesOpened: () => void;
}

/** Cosa si sta guardando: l'elenco, o una delle quattro sottoschermate. */
type MenuPane = 'root' | MainMenuSection;

/** Cosa dice la riga sotto «Resume» finche' nessuno ha mandato il riassunto. */
const RESUME_DETAIL = 'Back to the city.';

export class MainMenu {
  /** Il velo. La colonna sta dentro: chi apre appende questo e basta. */
  readonly root: HTMLElement;

  private readonly column: HTMLElement;
  private readonly stack: HTMLElement;
  private readonly panes = new Map<MainMenuSection, HTMLElement>();
  private readonly resumeButton: HTMLButtonElement;
  private readonly resumeDetail: HTMLElement;
  private readonly savesDetail: HTMLElement;
  private readonly saves: MainMenuSaves;
  private readonly settings: MainMenuSettings;
  private readonly newGame: MainMenuNewGame;
  private pane: MenuPane = 'root';
  /**
   * Chi aveva il fuoco prima che il menu si aprisse.
   *
   * Si restituisce solo se e' ancora attaccato al documento. Dopo un clic col
   * mouse non c'e' niente da restituire, ed e' giusto: `onActivate` toglie
   * apposta il fuoco ai bottoni cliccati, perche' qui ogni tasto e' una
   * scorciatoia di mondo e `:focus-visible` tornerebbe al primo tasto premuto.
   */
  private returnFocusTo: HTMLElement | null = null;

  constructor(private readonly handlers: MainMenuHandlers, themes: readonly ThemeChoice[]) {
    this.root = document.createElement('div');
    this.root.className = 'main-menu-veil';
    this.root.hidden = true;
    // Il velo e' decorazione e barriera, non contenuto: chi legge lo schermo
    // deve trovare il dialogo, non un riquadro vuoto grande come la finestra.
    this.root.setAttribute('aria-hidden', 'true');

    this.column = document.createElement('div');
    this.column.className = 'title-inner title-inner--pause';
    this.column.setAttribute('role', 'dialog');
    this.column.setAttribute('aria-modal', 'true');
    this.column.setAttribute('aria-label', 'Main menu');
    this.column.addEventListener('keydown', (event) => this.trapTab(event));
    this.root.appendChild(this.column);

    const wordmark = document.createElement('h1');
    wordmark.className = 'title-wordmark';
    wordmark.textContent = TITLE_NAME;
    const tagline = document.createElement('p');
    tagline.className = 'title-tagline';
    tagline.textContent = 'The city is on hold while this is open.';

    this.stack = document.createElement('div');
    this.stack.className = 'title-stack';
    // Riprendere e' il gesto piu' probabile di tutti e non apre niente: e' il
    // bottone grande, come «Continue» sul titolo, e porta il proprio riassunto
    // — chi apre il menu per salvare vuole sapere **cosa** sta salvando.
    this.resumeButton = this.menuButton('Resume', RESUME_DETAIL, true);
    this.resumeButton.addEventListener('click', () => handlers.onResume());
    this.resumeDetail = this.resumeButton.querySelector('.title-detail') as HTMLElement;
    this.stack.appendChild(this.resumeButton);

    const details = new Map<MainMenuSection, HTMLElement>();
    for (const entry of MAIN_MENU_ENTRIES) {
      const button = this.menuButton(entry.label, entry.subtitle, false);
      button.addEventListener('click', () => this.openPane(entry.id));
      details.set(entry.id, button.querySelector('.title-detail') as HTMLElement);
      this.stack.appendChild(button);
    }
    // Come sul titolo, la riga sotto i salvataggi conta le citta' invece di
    // ripetere a cosa serve la sezione: e' l'unica delle quattro che cambia.
    this.savesDetail = details.get('saves') as HTMLElement;

    this.saves = new MainMenuSaves(handlers);
    this.settings = new MainMenuSettings(themes, handlers);
    this.newGame = new MainMenuNewGame(handlers);
    this.panes.set('saves', this.buildPane('saves', this.saves.root));
    this.panes.set('new', this.buildPane('new', this.newGame.root));
    this.panes.set('settings', this.buildPane('settings', this.settings.root));
    // L'aiuto e' quello del titolo, non una seconda copia: le tabelle vengono
    // comunque da `ControlsHint.ts`. Arriva gia' come sottoschermata intera, col
    // suo titolo, quindi non passa da `buildPane`: aggiungerne uno sopra
    // scriverebbe «Controls» due volte, una sotto l'altra.
    const help = titleHelpPane();
    help.appendChild(titleSmall('Back', () => this.openPane('root')));
    this.panes.set('help', help);

    const foot = document.createElement('div');
    foot.className = 'title-foot';
    const about = document.createElement('span');
    about.textContent = ABOUT_LINE;
    foot.appendChild(about);

    this.column.append(wordmark, tagline, this.stack);
    for (const [, pane] of this.panes) this.column.appendChild(pane);
    this.column.appendChild(foot);
    this.paint();
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /**
   * Apre il menu, sull'elenco.
   *
   * **L'elenco degli slot si rilegge qui, non entrando nella sezione.** Prima
   * era il contrario, ed era giusto finche' nessuno guardava quei dati fuori
   * dalla sezione: adesso la riga sotto «Saves» conta le citta' e quella sotto
   * «Resume» dice cosa si sta per lasciare, e nessuna delle due puo' aspettare
   * un clic. Resta una lettura sola per apertura, come prima.
   */
  show(): void {
    const active = document.activeElement;
    this.returnFocusTo = active instanceof HTMLElement ? active : null;
    this.root.hidden = false;
    this.root.removeAttribute('aria-hidden');
    this.handlers.onSavesOpened();
    this.openPane('root');
  }

  hide(): void {
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    // La conferma della partita nuova non deve sopravvivere alla chiusura: il
    // secondo clic la farebbe partire senza che nessuno abbia riletto la riga.
    this.newGame.reset();
    // Riaprire riparte dall'elenco: una sottoschermata rimasta aperta sarebbe
    // una risposta a una domanda posta in un'altra sessione di menu.
    this.pane = 'root';
    this.paint();
    if (this.returnFocusTo?.isConnected === true) this.returnFocusTo.focus();
    this.returnFocusTo = null;
  }

  /**
   * `Esc` dentro il menu.
   *
   * Da una sottoschermata si torna all'elenco, come sul titolo: chiudere tutto
   * al primo colpo costringerebbe a riaprire il menu per correggere un tema
   * scelto male. Il secondo colpo, sull'elenco, e' quello che chiude — e lo
   * decide chi ha in mano la catena degli `Esc`, non questo pannello.
   */
  escape(): boolean {
    if (this.pane === 'root') return false;
    this.openPane('root');
    return true;
  }

  /** L'elenco degli slot, gia' letto da chi tiene lo storage. */
  setSaves(slots: readonly SlotInfo[]): void {
    this.savesDetail.textContent = savedDetail(slots);
    this.saves.paint(slots);
  }

  setSaveNote(text: string): void {
    this.saves.setNote(text);
  }

  setTheme(id: string): void {
    this.settings.setTheme(id);
  }

  setDaylight(mode: DaylightMode): void {
    this.settings.setDaylight(mode);
  }

  setClouds(on: boolean): void {
    this.settings.setClouds(on);
  }

  /** Cosa si sta per lasciare, sotto «Resume»: seed, abitanti, edifici. */
  setSummary(seed: number, population: number, buildings: number): void {
    this.resumeDetail.textContent = gameSummary(seed, population, buildings);
  }

  /** Un bottone dell'elenco: la parola sopra, cosa succede premendola sotto. */
  private menuButton(label: string, detail: string, primary: boolean): HTMLButtonElement {
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
    return button;
  }

  /** Una sottoschermata: il titolo che ripete la scelta, il corpo, e l'indietro. */
  private buildPane(section: MainMenuSection, body: HTMLElement): HTMLElement {
    const entry = menuEntry(section);
    const pane = document.createElement('div');
    pane.className = 'title-pane';
    const title = document.createElement('h2');
    title.className = 'title-pane-title';
    title.textContent = entry.title;
    pane.append(title, titleNote(entry.subtitle), body);
    pane.appendChild(titleSmall('Back', () => this.openPane('root')));
    return pane;
  }

  private openPane(pane: MenuPane): void {
    this.pane = pane;
    this.paint();
    if (pane === 'root') {
      this.resumeButton.focus();
      return;
    }
    // Il primo gesto **attivo** della sottoschermata: uno slot vuoto ha i suoi
    // bottoni spenti, e mettere il fuoco li' lo perderebbe fuori dalla modale.
    const body = this.panes.get(pane);
    if (body === undefined) return;
    const controls = [...body.querySelectorAll<HTMLElement>('button, input')];
    controls.find((element) => !(element as HTMLButtonElement).disabled)?.focus();
  }

  /** Chi si vede adesso. Separato dal fuoco: chiudendo non c'e' cosa mettere a fuoco. */
  private paint(): void {
    this.stack.hidden = this.pane !== 'root';
    for (const [id, element] of this.panes) element.hidden = id !== this.pane;
  }

  /**
   * `Tab` resta dentro la colonna.
   *
   * Non e' una rifinitura: senza, il fuoco arriva alle tessere del dock sotto il
   * velo, e `Invio` su una tessera prenderebbe uno strumento da dietro la
   * modale. Il velo ferma il mouse, questo ferma la tastiera.
   */
  private trapTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = [...this.column.querySelectorAll<HTMLElement>('button, input')]
      .filter((element) => !element.hidden && element.offsetParent !== null
        && !(element as HTMLButtonElement).disabled);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
