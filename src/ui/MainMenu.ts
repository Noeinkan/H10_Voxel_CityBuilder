import type { SlotInfo } from '../game/save/storage';
import type { DaylightMode } from '../engine/daylight';
import { helpSections } from './ControlsHint';
import { drawerHeader } from './drawerBits';
import type { ThemeChoice } from './GameHud';
import { createHudIcon, type HudIcon } from './hudIcons';
import {
  ABOUT_LINE,
  MAIN_MENU_ENTRIES,
  gameSummary,
  menuEntry,
  slotSummary,
  type MainMenuSection,
} from './MainMenuModel';
import { MainMenuNewGame, type NewGameHandlers } from './MainMenuNewGame';
import { MainMenuSaves, type SaveSectionHandlers } from './MainMenuSaves';
import { MainMenuSettings, type SettingsHandlers } from './MainMenuSettings';

/**
 * Il menu principale: l'unica superficie che dice «sei fuori dalla partita».
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
  /** Riapre l'autosalvataggio: e' cio' che la partita non fa piu' da sola. */
  readonly onContinue: () => void;
}

/** L'icona accanto a ogni voce della colonna. */
const SECTION_ICONS: Readonly<Record<MainMenuSection, HudIcon>> = {
  saves: 'save',
  new: 'expansion',
  settings: 'theme',
  help: 'help',
};

export class MainMenu {
  /** Il velo. Il pannello sta dentro: chi apre appende questo e basta. */
  readonly root: HTMLElement;

  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly navButtons = new Map<MainMenuSection, HTMLButtonElement>();
  private readonly sections = new Map<MainMenuSection, HTMLElement>();
  private readonly saves: MainMenuSaves;
  private readonly settings: MainMenuSettings;
  private readonly newGame: MainMenuNewGame;
  private readonly resumeButton: HTMLButtonElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
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

    this.panel = document.createElement('div');
    this.panel.className = 'main-menu hud-surface hud-surface--modal';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', 'Main menu');
    this.panel.addEventListener('keydown', (event) => this.trapTab(event));
    this.root.appendChild(this.panel);

    const header = drawerHeader({
      title: 'Menu',
      subtitle: 'The city is on hold while this is open.',
      closeLabel: 'Resume · Esc',
      onClose: () => handlers.onResume(),
    });
    this.panel.appendChild(header);
    this.closeButton = header.querySelector('.drawer-close') as HTMLButtonElement;

    const body = document.createElement('div');
    body.className = 'main-menu-body';

    const nav = document.createElement('nav');
    nav.className = 'main-menu-nav';
    nav.setAttribute('aria-label', 'Menu sections');
    // Resume sta in cima e non fra le voci: non apre una sezione, chiude il
    // menu. Metterla nell'elenco prometterebbe un riquadro che non esiste.
    this.resumeButton = document.createElement('button');
    this.resumeButton.type = 'button';
    this.resumeButton.className = 'main-menu-item main-menu-item--resume';
    this.resumeButton.textContent = 'Resume';
    this.resumeButton.addEventListener('click', () => handlers.onResume());
    nav.appendChild(this.resumeButton);

    // Sotto Play e sopra le sezioni, perche' e' la seconda domanda che si fa chi
    // arriva: non «cosa posso fare», ma «e la citta' di ieri?». Compare solo
    // all'avvio e solo se c'e' davvero qualcosa da riprendere — in partita
    // significherebbe buttare via quella in corso per l'autosalvataggio, che e'
    // un gesto diverso e sta fra gli slot con il suo bottone Load.
    this.continueButton = document.createElement('button');
    this.continueButton.type = 'button';
    this.continueButton.className = 'main-menu-item main-menu-item--continue';
    this.continueButton.hidden = true;
    this.continueButton.addEventListener('click', () => handlers.onContinue());
    nav.appendChild(this.continueButton);

    for (const entry of MAIN_MENU_ENTRIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'main-menu-item';
      button.setAttribute('aria-pressed', 'false');
      button.append(createHudIcon(SECTION_ICONS[entry.id]), document.createTextNode(entry.label));
      button.addEventListener('click', () => this.openSection(entry.id));
      this.navButtons.set(entry.id, button);
      nav.appendChild(button);
    }
    body.appendChild(nav);

    const pane = document.createElement('section');
    pane.className = 'main-menu-pane';
    this.title = document.createElement('h3');
    this.title.className = 'drawer-title';
    this.subtitle = document.createElement('p');
    this.subtitle.className = 'drawer-subtitle';
    pane.append(this.title, this.subtitle);

    this.saves = new MainMenuSaves(handlers);
    this.settings = new MainMenuSettings(themes, handlers);
    this.newGame = new MainMenuNewGame(handlers);
    this.sections.set('saves', this.saves.root);
    this.sections.set('settings', this.settings.root);
    this.sections.set('new', this.newGame.root);
    this.sections.set('help', helpPane());
    for (const [, element] of this.sections) {
      element.hidden = true;
      pane.appendChild(element);
    }
    body.appendChild(pane);
    this.panel.appendChild(body);

    const foot = document.createElement('footer');
    foot.className = 'main-menu-foot';
    this.summary = document.createElement('span');
    const about = document.createElement('small');
    about.textContent = ABOUT_LINE;
    foot.append(this.summary, about);
    this.panel.appendChild(foot);

    this.openSection('saves');
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /**
   * Apre il menu.
   *
   * `resumable` distingue le due volte in cui questo pannello compare, che sono
   * due momenti diversi con le stesse voci: all'avvio non c'e' niente da
   * riprendere — c'e' un'isola appena nata da giocare, e forse una citta' di
   * ieri da riaprire — mentre in partita si torna a quello che si stava
   * facendo. Cambia la parola sul bottone grande e la presenza di Continue,
   * non la struttura.
   */
  show(section: MainMenuSection = 'saves', resumable = true): void {
    const active = document.activeElement;
    this.returnFocusTo = active instanceof HTMLElement ? active : null;
    this.root.hidden = false;
    this.root.removeAttribute('aria-hidden');
    this.resumeButton.textContent = resumable ? 'Resume' : 'Play';
    this.continueButton.hidden = resumable || this.continueButton.dataset['filled'] !== 'true';
    this.subtitle.textContent = menuEntry(section).subtitle;
    this.openSection(section);
    this.closeButton.focus();
  }

  /**
   * Cosa c'e' nell'autosalvataggio, per il bottone che lo riapre.
   *
   * Il riassunto sta **sul bottone** e non dietro un clic: «Continue» da solo
   * chiederebbe di fidarsi, e chi ha appena lanciato il gioco non sa se quella
   * citta' e' di dieci minuti fa o di un mese fa.
   */
  setContinue(info: SlotInfo | null): void {
    this.continueButton.dataset['filled'] = info === null ? 'false' : 'true';
    if (info === null) {
      this.continueButton.hidden = true;
      return;
    }
    this.continueButton.replaceChildren();
    const label = document.createElement('strong');
    label.textContent = 'Continue';
    const detail = document.createElement('small');
    detail.textContent = slotSummary(info);
    this.continueButton.append(label, detail);
  }

  hide(): void {
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    // La conferma della partita nuova non deve sopravvivere alla chiusura: il
    // secondo clic la farebbe partire senza che nessuno abbia riletto la riga.
    this.newGame.reset();
    if (this.returnFocusTo?.isConnected === true) this.returnFocusTo.focus();
    this.returnFocusTo = null;
  }

  /** L'elenco degli slot, gia' letto da chi tiene lo storage. */
  setSaves(slots: readonly SlotInfo[]): void {
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

  /** Cosa si sta per salvare, al piede: seed, abitanti, edifici. */
  setSummary(seed: number, population: number, buildings: number): void {
    this.summary.textContent = gameSummary(seed, population, buildings);
  }

  private openSection(section: MainMenuSection): void {
    const entry = menuEntry(section);
    this.title.textContent = entry.title;
    this.subtitle.textContent = entry.subtitle;
    for (const [id, button] of this.navButtons) {
      button.setAttribute('aria-pressed', id === section ? 'true' : 'false');
    }
    for (const [id, element] of this.sections) element.hidden = id !== section;
    // L'elenco si rilegge entrando **qui**, non aprendo il menu: leggere quattro
    // salvataggi interi per una sezione che nessuno sta guardando e' lavoro
    // buttato, ed era il motivo per cui il vecchio cassetto lo faceva all'apertura.
    if (section === 'saves') {
      this.handlers.onSavesOpened();
      this.saves.repaint();
    }
  }

  /**
   * `Tab` resta dentro il pannello.
   *
   * Non e' una rifinitura: senza, il fuoco arriva alle tessere del dock sotto il
   * velo, e `Invio` su una tessera prenderebbe uno strumento da dietro la
   * modale. Il velo ferma il mouse, questo ferma la tastiera.
   */
  private trapTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = [...this.panel.querySelectorAll<HTMLElement>('button, input')]
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

/** L'aiuto dentro il menu: le stesse sezioni della card, non una seconda copia. */
function helpPane(): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'menu-section-body';
  for (const section of helpSections()) pane.appendChild(section);
  return pane;
}
