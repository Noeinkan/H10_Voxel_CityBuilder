import type { SlotInfo } from '../game/save/storage';
import type { DaylightMode } from '../engine/daylight';
import type { ThemeChoice } from './GameHud';
import { SUPPORT_LABEL, SUPPORT_TITLE, SUPPORT_URL } from './community';
import { FeedbackPane } from './FeedbackPane';
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

/**
 * Cosa si sta guardando: l'elenco, o una delle sottoschermate.
 *
 * Il feedback e' una sottoschermata ma **non** una voce dell'elenco: si apre dal
 * piede, accanto alla firma, che e' il posto dove si va a cercare chi ha fatto
 * il gioco. Fra le quattro voci starebbe come una quinta cosa da fare in
 * partita, che non e'.
 */
type MenuPane = 'root' | MainMenuSection | 'feedback';

/** Cosa dice la riga sotto «Resume» finche' nessuno ha mandato il riassunto. */
const RESUME_DETAIL = 'Back to the city.';

/**
 * Cosa il `Tab` puo' raggiungere dentro la colonna.
 *
 * Elenca ogni tipo di comando che ci vive davvero — il piede ha un
 * collegamento, il feedback un riquadro di testo e due `summary` — perche' e'
 * la stessa lista che tiene il fuoco dentro la modale: cio' che non e' qui,
 * `Tab` lo salta o lo porta fuori, sotto il velo.
 */
const FOCUSABLE = 'button, input, textarea, summary, a[href]';

export class MainMenu {
  /** Il velo. La colonna sta dentro: chi apre appende questo e basta. */
  readonly root: HTMLElement;

  private readonly column: HTMLElement;
  private readonly stack: HTMLElement;
  private readonly panes = new Map<Exclude<MenuPane, 'root'>, HTMLElement>();
  private readonly resumeButton: HTMLButtonElement;
  private readonly resumeDetail: HTMLElement;
  private readonly savesDetail: HTMLElement;
  private readonly saves: MainMenuSaves;
  private readonly settings: MainMenuSettings;
  private readonly newGame: MainMenuNewGame;
  private readonly feedback: FeedbackPane;
  private pane: MenuPane = 'root';
  /**
   * L'ultimo riassunto ricevuto, per il contesto che la nota si porta dietro.
   *
   * Il menu non conosce la partita: la riga gliela manda `main.ts` a ogni
   * apertura, e questa e' la stessa che si legge sotto «Resume». Finche' non
   * arriva non c'e' niente di vero da allegare, e dirlo e' meglio che allegare
   * uno zero.
   */
  private citySummary = 'not reported yet';
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

    this.feedback = new FeedbackPane({ onCity: () => this.citySummary });
    this.feedback.root.appendChild(titleSmall('Back', () => this.openPane('root')));
    this.panes.set('feedback', this.feedback.root);

    const foot = document.createElement('div');
    foot.className = 'title-foot';
    const about = document.createElement('span');
    about.textContent = ABOUT_LINE;
    foot.append(about, this.communityRow());

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
    this.citySummary = gameSummary(seed, population, buildings);
    this.resumeDetail.textContent = this.citySummary;
  }

  /**
   * Le due porte verso chi fa il gioco, in fondo alla colonna.
   *
   * Stanno sotto la firma e non fra le voci: nessuna delle due riguarda la
   * citta' aperta, e chi le cerca le cerca dove c'e' scritto chi l'ha fatta.
   *
   * **Il sostegno e' un collegamento, non un bottone**, e va su Ko-fi in una
   * scheda nuova: qui dentro non passa nessun pagamento e non c'e' niente da
   * configurare. L'etichetta la decide `community.ts`, che spiega anche perche'
   * non puo' dire «Donate».
   */
  private communityRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'community-foot';

    const support = document.createElement('a');
    support.className = 'community-link community-link--support';
    support.href = SUPPORT_URL;
    support.target = '_blank';
    // Senza questo la pagina aperta puo' toccare quella che l'ha aperta.
    support.rel = 'noopener noreferrer';
    support.textContent = SUPPORT_LABEL;
    support.title = SUPPORT_TITLE;
    support.setAttribute('aria-label', SUPPORT_TITLE);

    const feedback = document.createElement('button');
    feedback.type = 'button';
    feedback.className = 'community-link';
    feedback.textContent = 'Feedback';
    feedback.title = 'Tell the maker what you think';
    feedback.addEventListener('click', () => this.openPane('feedback'));

    row.append(support, feedback);
    return row;
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
    // Il contesto allegato alla nota dichiara valori correnti: si rileggono
    // aprendo, non costruendo il pannello una volta per tutte.
    if (pane === 'feedback') this.feedback.open();
    // Il primo gesto **attivo** della sottoschermata: uno slot vuoto ha i suoi
    // bottoni spenti, e mettere il fuoco li' lo perderebbe fuori dalla modale.
    const body = this.panes.get(pane);
    if (body === undefined) return;
    const controls = [...body.querySelectorAll<HTMLElement>(FOCUSABLE)];
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
    const focusable = [...this.column.querySelectorAll<HTMLElement>(FOCUSABLE)]
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
