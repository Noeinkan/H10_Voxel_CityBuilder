import type { ActionFailure } from '../game/actions';
import type { GrowthStats } from '../game/growthScene';
import { INFO_VIEWS, infoViewSpecOf, type InfoViewKind, type PolicyId, type TradeMode } from '../sim';
import { BuildDock, type DockPanel } from './BuildDock';
import { ControlsHint } from './ControlsHint';
import { applyHudTokens } from './hudTokens';
import {
  buildGameHudModel,
  decisionMark,
  decisionNeedsRepaint,
  resolveEscapeTarget,
  selectionMessage,
  type GameHudModel,
  type GameTool,
  type PlacementMode,
} from './GameHudModel';
import type { DaylightMode } from '../engine/daylight';
import { CityDrawer } from './CityDrawer';
import { PoliciesDrawer } from './PoliciesDrawer';
import { MainMenu } from './MainMenu';
import type { SlotInfo } from '../game/save/storage';
import { drawerHeader } from './drawerBits';
import { ResourceBar } from './ResourceBar';
import { ResourceTrend } from './ResourceTrend';
import { watchRailDensity } from './railDensity';
import {
  barButton,
  cursorLine,
  shortList,
  viewKeyRow,
} from './hudWidgets';
import { buildViewMenuModel, type ViewMenuModel } from './ViewMenuModel';
import { INSPECT, INSPECT_MODE, type InspectMode } from '../engine/inspect';

export type { GameTool } from './GameHudModel';

export interface GameHudHandlers {
  readonly onTool: (tool: GameTool) => void;
  readonly onPolicy: (id: PolicyId) => void;
  readonly onTrade: (mode: TradeMode) => void;
  readonly onDecision: (optionId: string) => void;
  /** Rimanda la decisione sospesa senza scegliere. */
  readonly onSnooze: () => void;
  readonly onPause: (paused: boolean) => void;
  readonly onSpeed: (speed: number) => void;
  /** Ciclo, giorno fisso o notte fissa: sta accanto alla velocita' perche' e' tempo. */
  readonly onDaylight: (mode: DaylightMode) => void;
  /** I banchi di nuvole in quota, accesi o spenti. */
  readonly onClouds: (on: boolean) => void;
  readonly onTheme: (id: string) => void;
  /**
   * Apre il campionario dei voxel, che e' una **scena** e non un pannello.
   *
   * L'HUD non sa dove: l'indirizzo vuole il tema e l'ora in vigore, che vivono
   * nell'engine, e aprire una scheda e' una decisione del composition root. Qui
   * c'e' solo il bottone che lo chiede.
   */
  readonly onSwatch: () => void;
  readonly onView: (mode: InspectMode) => void;
  readonly onLevel: (z: number) => void;
  /** Sceglie una vista informativa (cibo, materiali, densita', felicita', distretti). */
  readonly onInfoView: (kind: InfoViewKind) => void;
  readonly onCancelTool: () => void;
  /** Molla l'isolato scelto in Block focus, lasciando accesa la vista. */
  readonly onReleaseBlock: () => void;
  /** Chiude la scheda di selezione. Il pannello vive fuori dall'HUD; la catena
   *  di Escape no, perche' e' una sola e sta qui. */
  readonly onClearSelection: () => void;
  /**
   * I gesti della sezione salvataggi del menu.
   *
   * L'HUD non tocca ne' lo storage ne' la partita: chiede, e chi ha in mano la
   * scena risponde ridandogli l'elenco degli slot con `setSaves`.
   */
  readonly onSaveSlot: (slot: string) => void;
  readonly onLoadSlot: (slot: string) => void;
  readonly onDeleteSlot: (slot: string) => void;
  readonly onExportSave: () => void;
  readonly onImportSave: (text: string) => void;
  /** Chiede l'elenco aggiornato degli slot: l'HUD non legge lo storage. */
  readonly onSavesOpened: () => void;
  /** Butta via la partita e ne apre una su un'altra isola. */
  readonly onNewGame: (seed: number) => void;
  /**
   * Un seed sorteggiato.
   *
   * Il tiro sta nella radice e non qui: e' l'unico non deterministico del gioco
   * e ne esiste uno solo, quello del bootstrap.
   */
  readonly onRollSeed: () => number;
}

export interface ThemeChoice {
  readonly id: string;
  readonly name: string;
  readonly swatches: readonly string[];
  /**
   * I `--hud-*` di questo tema, gia' calcolati.
   *
   * Arrivano fatti invece che derivati qui perche' derivarli vuol dire leggere
   * l'atmosfera, e l'HUD non conosce l'engine: e' `main.ts` che mette insieme i
   * due strati, ed e' li' che la derivazione sta.
   */
  readonly tokens: Readonly<Record<string, string>>;
}

export interface CursorInfo {
  readonly title: string;
  readonly details: string;
  readonly valid: boolean;
  readonly reason: string;
  /**
   * Usi favoriti, penalizzati e tipologie probabili.
   *
   * Sono la risposta alla domanda che si fa chi tiene il dito sul mouse — "cosa
   * comparira' qui" — e stanno sul cursore invece che in un pannello perche' e'
   * li' che la domanda si pone: dopo il click e' troppo tardi.
   */
  readonly favours?: readonly string[];
  readonly penalises?: readonly string[];
  readonly typologies?: readonly string[];
  /** Le forme che arrivano solo se il quartiere matura, con la loro condizione. */
  readonly unlocks?: readonly string[];
}

const FAILURE_LABEL: Readonly<Record<ActionFailure, string>> = {
  'terrain-loading': 'The terrain is not ready yet.',
  'not-buildable': 'No earthwork holds here: only cliffs and deep water refuse.',
  'needs-coast': 'A Port only works on the waterfront. Move it closer to the sea.',
  'needs-waterfront': 'A Marina needs open water: move it to the sea or to a lake.',
  'needs-open-ground': 'An Airport needs a wide, level clearing to lay a runway on.',
  'too-close': 'Too close to another catalyst of the same type.',
  'insufficient-funds': 'You do not have enough funds yet.',
  'insufficient-materials': 'You do not have enough materials yet. Grow industry first.',
  'population-required': 'The city must grow before you can do this.',
  'landmark-requires-city': 'This monument crowns an established city. Build more first.',
  'already-active': 'This policy is already active.',
  'already-unlocked': 'This sector is already unlocked. Choose another one.',
  'onboarding-order': 'Follow the tutorial order: residential, production, civic.',
  'policy-incompatible': 'This policy conflicts with one that is already active.',
  'decision-option-invalid': 'This decision option is no longer available.',
  'needs-building': 'Point at a building facade, not at the ground.',
  'building-too-short': 'This building is too low to carry the structure. Try a taller one.',
  'no-room-aloft': 'No room on this facade. Try another building.',
  'needs-shore': 'A ropeway starts on dry land. Point at a shore, not at the water.',
  'needs-crossing': 'There is nothing to cross from here. Find a stretch of water with land on the far side.',
  'no-room-for-line': 'No room for the towers here. Try further along the same shore.',
  'landmark-in-the-way': 'A landmark already stands here: monuments are not replaced by another landmark.',
};

/** HUD giocabile: risorse in alto, azioni in basso e pannelli contestuali. */
export class GameHud {
  private readonly root: HTMLElement;
  /** La barra risorse e il dock si disegnano da soli: qui si compongono. */
  private readonly bar: ResourceBar;
  private readonly dock: BuildDock;
  private readonly toast: HTMLElement;
  /** La sola cosa che resta a schermo mentre si guarda da terra. */
  private readonly streetBar: HTMLElement;
  private readonly streetBarHint: HTMLElement;
  /** Il contenitore del lato comandi: dock sopra, targa della vista in fondo. */
  private readonly railLeft: HTMLElement;
  private readonly cityDrawer: CityDrawer;
  private readonly policiesDrawer: PoliciesDrawer;
  /** Il menu principale: una modale sopra tutto, non un cassetto di destra. */
  private readonly mainMenu: MainMenu;
  private readonly themePicker: HTMLElement;
  private readonly viewPicker: HTMLElement;
  private readonly infoPicker: HTMLElement;
  private readonly viewBar: HTMLElement;
  private viewBarLabel!: HTMLElement;
  private viewBarGesture!: HTMLElement;
  private viewBarKeys!: HTMLElement;
  /** Vista accesa: e' l'ultima cosa che Escape spegne, e la targa lo dichiara. */
  private viewActive = false;
  /** Isolato scelto: Escape lo molla **prima** di spegnere la vista. */
  private blockLocked = false;
  /** Scheda di selezione aperta: e' l'ultima cosa che il giocatore ha aperto. */
  private selectionOpen = false;
  /**
   * Il modo gia' disegnato nella targa: i tasti cambiano solo con lui.
   *
   * Il blocco ci entra perche' cambia i tasti senza cambiare il modo: senza,
   * scegliere un isolato lascerebbe a schermo la riga «punta l'isolato» mentre il
   * gesto giusto e' ormai un altro.
   */
  private paintedViewMode: InspectMode | null = null;
  private paintedViewLocked = false;
  private readonly levelRail: HTMLElement;
  private levelSlider!: HTMLInputElement;
  private levelValue!: HTMLElement;
  private readonly cursor: HTMLElement;
  private readonly help: ControlsHint;
  /** Selettore del verso di posa (suolo/facciata): compare solo con un ruolo che ha entrambi. */
  private readonly modePicker: HTMLElement;
  private readonly groundButton: HTMLButtonElement;
  private readonly aloftButton: HTMLButtonElement;
  private readonly handlers: GameHudHandlers;
  private readonly decisionCard: HTMLElement;
  private readonly themeButtons = new Map<string, HTMLButtonElement>();
  private readonly themeTokens = new Map<string, Readonly<Record<string, string>>>();
  private readonly viewButtons = new Map<InspectMode, HTMLButtonElement>();
  private readonly infoButtons = new Map<InfoViewKind, HTMLButtonElement>();
  /** La finestra dei tick recenti: e' dell'HUD, non della simulazione. */
  private readonly trend = new ResourceTrend();
  private selected: GameTool = { kind: 'none' };
  private model: GameHudModel = buildGameHudModel(null);
  private feedback: { readonly message: string; readonly tone: 'error' | 'neutral' } | null = null;
  /**
   * Nota che **accompagna** l'istruzione dello strumento invece di sostituirla.
   *
   * Un `showFeedback` normale coprirebbe "click the island to place it", che e'
   * proprio cio' che il giocatore deve leggere dopo aver scelto uno strumento.
   */
  private selectionNote: string | null = null;
  private paintedDecisionId: string | null = null;
  private lastPaint = 0;

  constructor(
    parent: HTMLElement,
    handlers: GameHudHandlers,
    themes: readonly ThemeChoice[],
    activeThemeId: string,
  ) {
    this.handlers = handlers;
    this.root = document.createElement('section');
    this.root.className = 'game-hud';
    this.root.setAttribute('aria-label', 'City controls');

    this.bar = new ResourceBar(this.model, {
      onPause: (paused) => handlers.onPause(paused),
      onSpeed: (speed) => handlers.onSpeed(speed),
      onDaylight: (mode) => handlers.onDaylight(mode),
      onClouds: (on) => handlers.onClouds(on),
    });

    this.streetBar = document.createElement('aside');
    this.streetBar.className = 'street-bar hud-surface';
    this.streetBar.hidden = true;
    this.streetBar.setAttribute('aria-label', 'Street view');
    this.streetBar.setAttribute('aria-live', 'polite');
    const streetEyebrow = document.createElement('span');
    streetEyebrow.className = 'street-bar-eyebrow';
    streetEyebrow.textContent = 'Street view';
    this.streetBarHint = document.createElement('p');
    this.streetBarHint.className = 'street-bar-hint';
    this.streetBar.append(streetEyebrow, this.streetBarHint);
    this.root.appendChild(this.streetBar);

    this.toast = document.createElement('div');
    this.toast.className = 'hud-toast';
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    this.root.appendChild(this.toast);

    this.cursor = document.createElement('div');
    this.cursor.className = 'cursor-card';
    this.cursor.hidden = true;
    this.root.appendChild(this.cursor);

    // Il rail sinistro e' **un solo** lato: i dati in alto, i comandi sotto, la
    // targa della vista in fondo. Prima dati e comandi si dividevano i due bordi
    // opposti dello schermo; adesso lo stato della citta' sta sopra le sue leve,
    // e il corridoio verticale al centro resta interamente alla citta'.
    this.railLeft = document.createElement('div');
    this.railLeft.className = 'hud-rail-left';
    this.railLeft.appendChild(this.bar.root);
    this.dock = new BuildDock(this.model, {
      onTool: (tool) => this.pickTool(tool),
      onSwatch: () => handlers.onSwatch(),
      onPanel: (panel) => this.togglePanel(panel),
      onHelp: () => this.toggleHelp(),
    });
    this.railLeft.appendChild(this.dock.root);
    this.root.appendChild(this.railLeft);

    this.cityDrawer = new CityDrawer(this.model, {
      onClose: () => this.closeCity(),
      onDecision: (id) => {
        this.feedback = null;
        this.handlers.onDecision(id);
      },
      onSnooze: () => this.snoozeDecision(),
    });
    this.root.appendChild(this.cityDrawer.root);
    this.policiesDrawer = new PoliciesDrawer(this.model, {
      onPolicy: (id) => {
        this.feedback = null;
        handlers.onPolicy(id);
      },
      onTrade: (mode) => handlers.onTrade(mode),
      onClose: () => this.closePolicies(),
    });
    this.root.appendChild(this.policiesDrawer.root);
    this.mainMenu = new MainMenu({
      onSave: (slot) => handlers.onSaveSlot(slot),
      onLoad: (slot) => handlers.onLoadSlot(slot),
      onDelete: (slot) => handlers.onDeleteSlot(slot),
      onExport: () => handlers.onExportSave(),
      onImport: (text) => handlers.onImportSave(text),
      onSavesOpened: () => handlers.onSavesOpened(),
      onTheme: (id) => handlers.onTheme(id),
      onDaylight: (mode) => handlers.onDaylight(mode),
      onClouds: (on) => handlers.onClouds(on),
      onSwatch: () => handlers.onSwatch(),
      onStart: (seed) => handlers.onNewGame(seed),
      onRoll: () => handlers.onRollSeed(),
      onResume: () => this.closeMenu(),
    }, themes);
    this.root.appendChild(this.mainMenu.root);
    this.decisionCard = document.createElement('aside');
    this.decisionCard.className = 'decision-card hud-surface hud-surface--modal';
    this.decisionCard.hidden = true;
    this.decisionCard.setAttribute('aria-live', 'polite');
    this.root.appendChild(this.decisionCard);
    this.themePicker = this.createThemePicker(themes);
    this.root.appendChild(this.themePicker);
    this.viewPicker = this.createViewPicker();
    this.root.appendChild(this.viewPicker);
    this.infoPicker = this.createInfoPicker();
    this.root.appendChild(this.infoPicker);
    this.viewBar = this.createViewBar();
    this.railLeft.appendChild(this.viewBar);
    this.levelRail = this.createLevelRail();
    this.root.appendChild(this.levelRail);
    const modePicker = this.createModePicker();
    this.modePicker = modePicker.picker;
    this.groundButton = modePicker.ground;
    this.aloftButton = modePicker.aloft;
    this.root.appendChild(this.modePicker);
    parent.appendChild(this.root);
    this.help = new ControlsHint(this.root);
    this.setTheme(activeThemeId);
    this.setView(buildViewMenuModel(INSPECT_MODE.off, INSPECT.defaultSliceZ, INSPECT.maxSliceZ));

    // Quanto misura davvero il rail sinistro: la sua larghezza dipende da quante
    // tessere ci stanno, e chi gli sta fuori — la barra dei livelli, il toast,
    // gli overlay tecnici — la legge da qui invece di ripetere una misura che
    // cambierebbe alla prossima tessera.
    const publishRails = (): void => {
      document.documentElement.style.setProperty('--game-hud-rail-left', `${this.railLeft.offsetWidth}px`);
    };
    const rails = new ResizeObserver(publishRails);
    rails.observe(this.railLeft);
    requestAnimationFrame(publishRails);

    // E quanto stretto debba stare, che e' l'altra meta' della stessa domanda:
    // la larghezza la decide quante tessere ci sono, la quota decide quanto si
    // possa mostrare di ognuna. Nessuna soglia in pixel qui dentro — il perche'
    // sta in `railDensity.ts`, insieme al ciclo che misura. L'HUD vive quanto la
    // pagina, come i due osservatori qui sopra: la funzione che stacca il ciclo
    // c'e' per chi lo montera' altrove, non perche' qui serva chiamarla.
    watchRailDensity(this.railLeft);

    this.paint(this.model);
  }

  needsPaint(now: number): boolean {
    return now - this.lastPaint >= 150;
  }

  update(stats: GrowthStats, now: number): void {
    this.lastPaint = now;
    // La finestra si nutre qui e non dentro il modello: `buildGameHudModel` e'
    // puro e senza memoria, e deve restarlo. L'ancora e' `tickCount`, quindi
    // ridipingere piu' volte dentro lo stesso tick non falsa la tendenza.
    this.trend.sample(stats.state.tickCount, [
      ['funds', stats.state.funds.stock],
      ['population', stats.state.population.stock],
      ['food', stats.state.food.stock],
      ['materials', stats.state.materials.stock],
      ['satisfaction', stats.state.satisfaction],
    ]);
    this.model = buildGameHudModel(stats, this.trend);
    this.paint(this.model);
  }

  setTool(tool: GameTool): void {
    this.feedback = null;
    this.selectionNote = null;
    this.selected = tool;
    this.paintSelection();
    this.paintToast();
  }

  /**
   * Uno strumento scelto **dal dock**, e non annunciato da fuori.
   *
   * E' `setTool` piu' l'avviso a chi gioca: la differenza fra i due versi e'
   * tutta qui, e tenerli separati evita che un annuncio in arrivo rimbalzi
   * indietro come se fosse un clic.
   */
  private pickTool(tool: GameTool): void {
    this.feedback = null;
    this.selectionNote = null;
    this.selected = tool;
    // L'annuncio prima della ripittura, com'era quando i bottoni stavano qui:
    // chi ascolta puo' rifiutare lo strumento, e dipingerlo premuto prima di
    // saperlo mostrerebbe per un istante uno stato che non e' vero.
    this.handlers.onTool(tool);
    this.paintSelection();
    this.paintToast();
  }

  /**
   * Prende l'n-esimo strumento del dock, come farebbe un clic sulla tessera.
   *
   * Torna `false` quando quel posto non esiste o l'azione non e' disponibile,
   * cosi' chi ascolta il tasto puo' lasciarlo passare ad altri invece di
   * inghiottirlo: un `4` che non fa niente e non lo dice e' peggio di un `4`
   * che non e' legato a niente.
   */
  selectToolByIndex(index: number): boolean {
    const tool = this.dock.toolAt(index);
    if (tool === null) return false;
    this.pickTool(tool);
    return true;
  }

  setSelectionNote(note: string | null): void {
    this.selectionNote = note;
    this.paintToast();
  }

  setTheme(id: string): void {
    if (!this.themeButtons.has(id)) return;
    for (const [themeId, button] of this.themeButtons) {
      button.setAttribute('aria-pressed', themeId === id ? 'true' : 'false');
    }
    const active = this.themeButtons.get(id);
    const name = active?.dataset.themeName ?? id;
    this.dock.setThemeLabel(`Change visual theme, current: ${name}`);
    // L'HUD cambia con il mondo, invece di restare crema sotto un cielo al neon.
    const tokens = this.themeTokens.get(id);
    if (tokens !== undefined) applyHudTokens(tokens);
    // Il picker del dock e le impostazioni del menu mostrano la stessa scelta:
    // dipingerne una sola vorrebbe dire due superfici che si contraddicono su
    // quale tema sia in vigore.
    this.mainMenu.setTheme(id);
  }

  setClouds(on: boolean): void {
    this.bar.setClouds(on);
    this.mainMenu.setClouds(on);
  }

  setDaylight(mode: DaylightMode): void {
    this.bar.setDaylight(mode);
    this.mainMenu.setDaylight(mode);
  }

  /**
   * La vista attiva, dal modello puro alle superfici che la mostrano.
   *
   * Quattro in una chiamata sola — bottone del dock, picker, targa e barra dei
   * livelli — perche' dicono tutte la stessa cosa e vederle divergere sarebbe il
   * difetto peggiore: un picker che dice Cutaway mentre la citta' e' intera.
   */
  setView(model: ViewMenuModel): void {
    for (const option of model.options) {
      this.viewButtons.get(option.mode)?.setAttribute('aria-pressed', option.active ? 'true' : 'false');
    }

    const active = model.bar.visible;
    this.dock.setViewLabel(
      active ? `Looking inside: ${model.activeLabel} · V to change` : 'Look inside the city · V',
      active,
    );

    this.viewActive = active;
    this.blockLocked = model.blockLocked;
    this.viewBar.hidden = !active;
    // Solo al cambio di modo: questa funzione gira a ogni ripittura dell'HUD, e
    // ricreare i `kbd` sei volte al secondo li strapperebbe da sotto il puntatore
    // — e' lo stesso motivo per cui la scheda decisione non si ridisegna sempre.
    if (!active) this.paintedViewMode = null;
    else if (this.paintedViewMode !== model.mode || this.paintedViewLocked !== model.blockLocked) {
      this.paintedViewMode = model.mode;
      this.paintedViewLocked = model.blockLocked;
      this.viewBarLabel.textContent = model.bar.label;
      this.viewBarGesture.textContent = model.bar.gesture;
      this.viewBarKeys.replaceChildren(...model.bar.keys.map(viewKeyRow));
    }

    this.levelRail.hidden = !model.levelVisible;
    const max = String(model.levelMax);
    if (this.levelSlider.max !== max) this.levelSlider.max = max;
    const level = String(model.level);
    // Solo se e' cambiato: riscrivere `value` mentre si trascina interrompe il
    // gesto, e questa funzione gira anche a ogni ripittura dell'HUD.
    if (this.levelSlider.value !== level) this.levelSlider.value = level;
    this.levelValue.textContent = level;
  }

  /**
   * La vista informativa attiva, dal modello puro alle superfici che la mostrano.
   *
   * Segna il bottone del dock e quello del picker, cosi' tessera e scorciatoia
   * dicono la stessa cosa: la vista si puo' scegliere da qui, dal picker o dal
   * tasto `I`, e nessuna delle tre deve restare indietro rispetto alle altre.
   */
  setInfoView(kind: InfoViewKind): void {
    for (const [viewKind, button] of this.infoButtons) {
      button.setAttribute('aria-pressed', viewKind === kind ? 'true' : 'false');
    }
    const active = kind !== 'off';
    const label = active
      ? `Reading: ${infoViewSpecOf(kind).label} · I to change`
      : 'Read the city by data · I';
    this.dock.setInfoLabel(label, active);
  }

  showFailure(reason: ActionFailure): void {
    this.showFeedback(FAILURE_LABEL[reason], 'error');
  }

  showPickingFailure(): void {
    this.showFeedback('There is no selectable surface here.', 'error');
  }

  showFeedback(message: string, tone: 'error' | 'neutral' = 'neutral'): void {
    this.feedback = { message, tone };
    this.paintToast();
  }

  /**
   * Messaggio che si spegne da solo.
   *
   * Gli altri restano finche' il giocatore non fa qualcosa, perche' sono errori
   * e una spiegazione che sparisce non serve a niente. Questo invece accompagna
   * un gesto riuscito — un tasto che ha cambiato il modo di guardare — e
   * lasciarlo a schermo coprirebbe per sempre lo stato della citta'.
   *
   * Si spegne solo se e' ancora il proprio: un errore arrivato nel frattempo ha
   * la precedenza e non va cancellato da un timer che non lo riguarda.
   */
  showTransientFeedback(message: string, ms = 2600): void {
    this.showFeedback(message);
    const shown = this.feedback;
    window.setTimeout(() => {
      if (this.feedback === shown) this.clearFeedback();
    }, ms);
  }

  clearFeedback(): void {
    this.feedback = null;
    this.selectionNote = null;
    this.paintToast();
  }

  updateCursor(clientX: number, clientY: number, info: CursorInfo | null): void {
    if (info === null) {
      this.cursor.hidden = true;
      return;
    }
    this.cursor.hidden = false;
    this.cursor.style.left = `${clientX + 18}px`;
    this.cursor.style.top = `${clientY + 18}px`;
    this.cursor.dataset.valid = info.valid ? 'true' : 'false';
    this.cursor.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = info.title;
    const details = document.createElement('span');
    details.textContent = info.details;
    const reason = document.createElement('span');
    reason.className = 'cursor-reason';
    reason.textContent = info.reason;
    this.cursor.append(title, details);

    if (info.favours !== undefined && info.favours.length > 0) {
      this.cursor.appendChild(cursorLine('Favours', info.favours.join(', ')));
    }
    if (info.penalises !== undefined && info.penalises.length > 0) {
      this.cursor.appendChild(cursorLine('Penalises', info.penalises.join(', ')));
    }
    // Accorciati come nel tooltip, e con la stessa funzione: la scheda al
    // cursore sta aperta **mentre** si mira, ed e' il momento in cui diciassette
    // nomi di tipologia coprono il punto che si sta cercando di guardare.
    if (info.typologies !== undefined && info.typologies.length > 0) {
      this.cursor.appendChild(cursorLine('May build', shortList(info.typologies)));
    }
    // La stessa riga della tessera, e non un testo suo: cursore e dock devono
    // dire la stessa cosa dello stesso ruolo, o uno dei due si smette di leggere.
    if (info.unlocks !== undefined && info.unlocks.length > 0) {
      this.cursor.appendChild(cursorLine('Unlocks', shortList(info.unlocks, '; ')));
    }
    this.cursor.appendChild(reason);
  }

  /** Il dock chiede un pannello per nome: quale sia il suo bottone lo sa lui. */
  private togglePanel(panel: DockPanel): void {
    if (panel === 'city') this.toggleCity();
    else if (panel === 'policies') this.togglePolicies();
    else if (panel === 'menu') this.toggleMenu();
    else if (panel === 'themes') this.toggleThemes();
    else if (panel === 'views') this.toggleViews();
    else this.toggleInfo();
  }

  toggleCity(): void {
    const opening = this.cityDrawer.hidden;
    this.cityDrawer.hidden = !opening;
    this.dock.setExpanded('city', opening);
    if (opening) {
      // La scheda di selezione vive fuori dall'HUD e sta sopra i cassetti: aprire
      // un cassetto la chiude, o i due pannelli si sovrappongono sul bordo destro.
      this.handlers.onClearSelection();
      this.closePolicies();
      this.closeThemes();
      this.closeViews();
      this.closeInfo();
      this.help.hide();
    }
  }

  togglePolicies(): void {
    const opening = this.policiesDrawer.hidden;
    this.policiesDrawer.hidden = !opening;
    this.dock.setExpanded('policies', opening);
    if (opening) {
      this.handlers.onClearSelection();
      this.closeCity();
      this.closeThemes();
      this.closeViews();
      this.closeInfo();
      this.help.hide();
    }
  }

  /** Il menu e' aperto: lo legge il ciclo di frame, che gli ferma il tempo. */
  get menuOpen(): boolean {
    return this.mainMenu.open;
  }

  toggleMenu(): void {
    if (this.mainMenu.open) this.closeMenu();
    else this.openMenu();
  }

  /** L'elenco degli slot, gia' letto da chi tiene lo storage. */
  setSaves(slots: readonly SlotInfo[]): void {
    this.mainMenu.setSaves(slots);
  }

  /** Una riga di esito nella sezione salvataggi: serve soprattutto ai fallimenti. */
  setSaveNote(text: string): void {
    this.mainMenu.setSaveNote(text);
  }

  /**
   * La partita in corso al piede del menu: seed, abitanti, edifici.
   *
   * Il seed non e' dell'HUD — lo tiene la radice — e arriva insieme all'elenco
   * degli slot, che e' l'unico momento in cui serve. Finche' il menu e' aperto
   * la citta' e' ferma, quindi la riga non puo' invecchiare sotto gli occhi.
   */
  setSummary(seed: number, population: number, buildings: number): void {
    this.mainMenu.setSummary(seed, population, buildings);
  }

  toggleThemes(): void {
    const opening = this.themePicker.hidden;
    this.themePicker.hidden = !opening;
    this.dock.setExpanded('themes', opening);
    if (opening) {
      this.handlers.onClearSelection();
      this.closeCity();
      this.closePolicies();
      this.closeViews();
      this.closeInfo();
      this.help.hide();
    }
  }

  toggleViews(): void {
    const opening = this.viewPicker.hidden;
    this.viewPicker.hidden = !opening;
    this.dock.setExpanded('views', opening);
    if (opening) {
      this.handlers.onClearSelection();
      this.closeCity();
      this.closePolicies();
      this.closeThemes();
      this.closeInfo();
      this.help.hide();
    }
  }

  toggleInfo(): void {
    const opening = this.infoPicker.hidden;
    this.infoPicker.hidden = !opening;
    this.dock.setExpanded('info', opening);
    if (opening) {
      this.handlers.onClearSelection();
      this.closeCity();
      this.closePolicies();
      this.closeThemes();
      this.closeViews();
      this.help.hide();
    }
  }

  toggleHelp(): void {
    const opening = !this.help.isOpen;
    this.closeCity();
    this.closePolicies();
    this.closeThemes();
    this.closeViews();
    this.closeInfo();
    if (opening) this.handlers.onClearSelection();
    this.help.toggle();
  }

  /**
   * Chiude i pannelli di destra, tutti insieme.
   *
   * Serve alla scheda di selezione, che si apre sul bordo destro: i cassetti e i
   * picker condividono quella striscia, e due pannelli sovrapposti non si
   * leggono. La scheda vive fuori dall'HUD, quindi chi la apre non puo' toccare
   * questi cassetti direttamente — passa di qui.
   *
   * Il menu principale resta fuori: e' una modale sopra tutto, e la scheda di
   * selezione — l'unica che chiami questo metodo — sotto il velo non si apre.
   */
  dismissPanels(): void {
    this.closeCity();
    this.closePolicies();
    this.closeThemes();
    this.closeViews();
    this.closeInfo();
    this.help.hide();
  }

  /**
   * Dice all'HUD che una scheda di selezione e' aperta.
   *
   * L'HUD non la possiede e non la disegna: gliene importa una cosa sola, ed e'
   * che Escape e' uno e la sua catena sta qui. Due listener sullo stesso tasto
   * sarebbero due ordini di priorita' che nessuno mette d'accordo.
   */
  setSelectionOpen(open: boolean): void {
    this.selectionOpen = open;
  }

  /**
   * L'interfaccia si toglie di mezzo, e resta una riga sola.
   *
   * A terra non c'e' niente da comandare — non si costruisce, non si sceglie, non
   * si legge un bilancio — e ogni pannello a schermo e' una cosa che non
   * risponde: quella e' una vista, non un modo di gioco con altri strumenti.
   * Sparisce tutto tranne una targa che dice come si esce, perche' un'uscita che
   * non si vede, da una vista che non ha nemmeno un cursore, e' una trappola.
   *
   * Non si spegne la sezione intera con `hidden`: i pannelli tengono uno stato —
   * quale cassetto era aperto, quale strumento in mano — e distruggerlo per poi
   * rimetterlo sarebbe un secondo posto da tenere allineato al primo. Basta una
   * classe, e cio' che c'era torna dov'era.
   */
  setStreetView(active: boolean, hint: string | null): void {
    this.root.classList.toggle('game-hud--street', active);
    this.streetBar.hidden = !active;
    if (active) this.dismissPanels();
    if (hint !== null) this.streetBarHint.textContent = hint;
  }

  handleEscape(): boolean {
    // Il menu si chiude prima di tutto, e sta **fuori** dalla catena: e' una
    // modale, cioe' un modo e non un pannello aperto sopra il gioco. Dentro la
    // catena perderebbe contro lo strumento in mano — che aprire il menu non
    // posa — e `Esc` non riuscirebbe a chiudere l'unica cosa a schermo.
    if (this.mainMenu.open) {
      this.closeMenu();
      return true;
    }
    // Il picker dei dati si chiude per primo quando e' aperto, come gli altri
    // pannelli: i picker si escludono a vicenda, quindi e' l'unico aperto.
    if (!this.infoPicker.hidden) {
      this.closeInfo();
      return true;
    }
    switch (resolveEscapeTarget(
      !this.viewPicker.hidden,
      !this.themePicker.hidden,
      // I due cassetti condividono la stessa voce della catena: stanno sulla
      // stessa striscia, si escludono a vicenda, e chiuderli e' lo stesso gesto.
      !this.cityDrawer.hidden || !this.policiesDrawer.hidden,
      this.help.isOpen,
      this.selected,
      this.viewActive,
      this.blockLocked,
      this.selectionOpen,
    )) {
      // Chiude il picker e non la vista: sono due cose distinte, e il colpo dopo
      // e' quello che spegne la vista. Chi ha il pannello aperto sopra la citta'
      // velata deve premere due volte, ed e' l'ordine giusto — il primo Escape
      // toglie quello che copre, il secondo quello che nasconde.
      case 'views':
        this.closeViews();
        return true;
      case 'themes':
        this.closeThemes();
        return true;
      case 'policies':
        this.closeCity();
        this.closePolicies();
        return true;
      case 'help':
        this.help.hide(true);
        return true;
      case 'tool':
        this.selected = { kind: 'none' };
        this.feedback = null;
        this.handlers.onCancelTool();
        this.paintSelection();
        this.paintToast();
        return true;
      case 'selection':
        this.handlers.onClearSelection();
        return true;
      case 'lock':
        this.handlers.onReleaseBlock();
        return true;
      case 'view':
        this.handlers.onView(INSPECT_MODE.off);
        return true;
      // La catena esaurita **apre** invece di chiudere: a mani vuote non c'e'
      // piu' niente da annullare, ed e' il solo momento in cui `Esc` puo'
      // significare «esci dalla partita» senza rubare il colpo a nient'altro.
      case 'menu':
        this.openMenu();
        return true;
    }
  }

  private createThemePicker(themes: readonly ThemeChoice[]): HTMLElement {
    const picker = document.createElement('aside');
    picker.className = 'theme-picker hud-surface hud-surface--panel';
    picker.hidden = true;
    picker.setAttribute('aria-label', 'Visual themes');

    picker.appendChild(drawerHeader({
      title: 'Visual theme',
      closeLabel: 'Close themes · Esc',
      onClose: () => this.closeThemes(),
    }));

    const grid = document.createElement('div');
    grid.className = 'theme-grid';
    for (const theme of themes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-option';
      button.dataset.themeName = theme.name;
      button.setAttribute('aria-label', `Use ${theme.name} theme`);
      button.addEventListener('click', () => {
        this.handlers.onTheme(theme.id);
        this.closeThemes();
      });

      const preview = document.createElement('span');
      preview.className = 'theme-swatches';
      preview.setAttribute('aria-hidden', 'true');
      for (const color of theme.swatches) {
        const swatch = document.createElement('span');
        swatch.style.background = color;
        preview.appendChild(swatch);
      }
      const label = document.createElement('span');
      label.textContent = theme.name;
      button.append(preview, label);
      this.themeButtons.set(theme.id, button);
      this.themeTokens.set(theme.id, theme.tokens);
      grid.appendChild(button);
    }
    picker.appendChild(grid);
    return picker;
  }

  /**
   * Le cinque viste, ognuna con la riga che dice cosa si va a vedere.
   *
   * Le etichette e le descrizioni arrivano da `ViewMenuModel`, che e' puro e
   * testato: qui si disegna e basta.
   */
  private createViewPicker(): HTMLElement {
    const picker = document.createElement('aside');
    picker.className = 'view-picker hud-surface hud-surface--panel';
    picker.hidden = true;
    picker.setAttribute('aria-label', 'City views');

    picker.appendChild(drawerHeader({
      title: 'Look inside',
      subtitle: 'Your city is dense enough to hide things. Open it up.',
      closeLabel: 'Close views · Esc',
      onClose: () => this.closeViews(),
    }));

    const list = document.createElement('div');
    list.className = 'view-list';
    const initial = buildViewMenuModel(INSPECT_MODE.off, INSPECT.defaultSliceZ, INSPECT.maxSliceZ);
    for (const option of initial.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'view-option';
      button.setAttribute('aria-pressed', 'false');
      const label = document.createElement('strong');
      label.textContent = option.label;
      const description = document.createElement('span');
      description.textContent = option.description;
      button.append(label, description);
      // Il gesto sta sotto la descrizione e in un peso diverso: si legge dopo
      // aver scelto, non mentre si sceglie, ed e' la riga che collega la vista
      // al cursore. Normal non si punta e non ne ha una.
      if (option.gesture !== '') {
        const gesture = document.createElement('span');
        gesture.className = 'view-gesture';
        gesture.textContent = option.gesture;
        button.appendChild(gesture);
      }
      button.addEventListener('click', () => this.handlers.onView(option.mode));
      this.viewButtons.set(option.mode, button);
      list.appendChild(button);
    }
    picker.appendChild(list);
    return picker;
  }

  /**
   * Le sei viste informative, dalla citta' nuda al dato per colonna.
   *
   * Stesse etichette e descrizioni di `INFO_VIEWS` — l'unica fonte, condivisa con
   * l'overlay in-world e con la legenda — e lo stesso disegno del picker delle
   * viste: qui si sceglie la heatmap, il tasto `I` la cicla.
   */
  private createInfoPicker(): HTMLElement {
    const picker = document.createElement('aside');
    picker.className = 'info-picker hud-surface hud-surface--panel';
    picker.hidden = true;
    picker.setAttribute('aria-label', 'City data views');

    picker.appendChild(drawerHeader({
      title: 'Read the city',
      subtitle: 'A data overlay per block, like an info view.',
      closeLabel: 'Close data views · Esc',
      onClose: () => this.closeInfo(),
    }));

    const list = document.createElement('div');
    list.className = 'view-list';
    for (const spec of INFO_VIEWS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'view-option';
      button.setAttribute('aria-pressed', 'false');
      const label = document.createElement('strong');
      label.textContent = spec.label;
      const description = document.createElement('span');
      description.textContent = spec.description;
      button.append(label, description);
      button.addEventListener('click', () => this.handlers.onInfoView(spec.kind));
      this.infoButtons.set(spec.kind, button);
      list.appendChild(button);
    }
    picker.appendChild(list);
    return picker;
  }

  /**
   * La targa della vista attiva, in alto a sinistra.
   *
   * Risponde alle tre domande che restavano senza risposta appena il picker si
   * chiudeva: **cosa sto guardando**, **cosa devo fare**, **come torno indietro**.
   * Le prime due erano scritte solo dentro il picker e in un toast che si spegne
   * da solo; la terza non era scritta da nessuna parte.
   *
   * In alto a sinistra perche' e' l'unico angolo che nessuna superficie di gioco
   * occupa — le risorse sono centrate, i pannelli stanno in basso a destra, la
   * quota sul bordo sinistro a meta' altezza — e perche' una targa di stato non
   * deve inseguire il cursore: si guarda una volta e poi si torna alla citta'.
   *
   * Ha due bottoni e non uno: uscire e cambiare sono due intenzioni diverse, e
   * chi ha aperto la vista sbagliata non deve passare da Normal per rimediare.
   */
  private createViewBar(): HTMLElement {
    const bar = document.createElement('aside');
    bar.className = 'view-bar hud-surface';
    bar.hidden = true;
    bar.setAttribute('aria-label', 'Active view');
    bar.setAttribute('aria-live', 'polite');

    const eyebrow = document.createElement('span');
    eyebrow.className = 'view-bar-eyebrow';
    eyebrow.textContent = 'Looking inside';
    this.viewBarLabel = document.createElement('strong');
    this.viewBarLabel.className = 'view-bar-label';
    this.viewBarGesture = document.createElement('p');
    this.viewBarGesture.className = 'view-bar-gesture';
    this.viewBarKeys = document.createElement('div');
    this.viewBarKeys.className = 'view-bar-keys';

    const actions = document.createElement('div');
    actions.className = 'view-bar-actions';
    actions.append(
      barButton('Change view', 'Choose another view', () => this.toggleViews()),
      barButton('Exit view', 'Back to the whole city', () => this.handlers.onView(INSPECT_MODE.off)),
    );
    actions.lastElementChild?.classList.add('view-bar-exit');

    bar.append(eyebrow, this.viewBarLabel, this.viewBarGesture, this.viewBarKeys, actions);
    return bar;
  }

  /**
   * La barra dei livelli, sul bordo sinistro.
   *
   * Sta fuori dal picker e non dentro perche' cercare la quota giusta e' un
   * gesto continuo: si scende di un piano alla volta **guardando la citta'**, e
   * un pannello aperto coprirebbe proprio quello che si sta cercando di leggere.
   * Compare solo con una vista che taglia, cioe' solo dove c'e' una quota.
   */
  private createLevelRail(): HTMLElement {
    const rail = document.createElement('aside');
    rail.className = 'level-rail hud-surface';
    rail.hidden = true;
    rail.setAttribute('aria-label', 'City level');

    const title = document.createElement('span');
    title.className = 'level-rail-title';
    title.textContent = 'Level';

    this.levelValue = document.createElement('span');
    this.levelValue.className = 'level-rail-value';

    this.levelSlider = document.createElement('input');
    this.levelSlider.type = 'range';
    this.levelSlider.min = String(INSPECT.minSliceZ);
    this.levelSlider.max = String(INSPECT.maxSliceZ);
    this.levelSlider.step = String(INSPECT.sliceStep);
    this.levelSlider.value = String(INSPECT.defaultSliceZ);
    this.levelSlider.setAttribute('aria-label', 'City level');
    this.levelSlider.addEventListener('input', () => {
      const value = Number(this.levelSlider.value);
      this.levelValue.textContent = String(value);
      this.handlers.onLevel(value);
    });

    const keys = document.createElement('span');
    keys.className = 'level-rail-keys';
    for (const label of ['[', ']']) {
      const key = document.createElement('kbd');
      key.textContent = label;
      keys.appendChild(key);
    }

    rail.append(title, this.levelValue, this.levelSlider, keys);
    return rail;
  }

  private closeCity(): void {
    this.cityDrawer.hidden = true;
    this.dock.setExpanded('city', false);
  }

  private openMenu(): void {
    // La scheda di selezione non e' un cassetto e non vive dentro l'HUD: sta su
    // `container`, sorella di `.game-hud`, con uno z-index suo. Niente di quello
    // che sta qui dentro puo' coprirla, velo compreso — chiuderla e' l'unico
    // modo, e questa riga non e' pulizia opzionale.
    this.handlers.onClearSelection();
    this.closeCity();
    this.closePolicies();
    this.closeThemes();
    this.closeViews();
    this.closeInfo();
    this.help.hide();
    // La scheda al cursore resterebbe congelata sopra il velo: il `pointermove`
    // che la toglie non arriva piu' alla canvas.
    this.cursor.hidden = true;
    this.mainMenu.show();
    this.dock.setExpanded('menu', true);
  }

  private closeMenu(): void {
    this.mainMenu.hide();
    this.dock.setExpanded('menu', false);
  }

  private closePolicies(): void {
    this.policiesDrawer.hidden = true;
    this.dock.setExpanded('policies', false);
  }

  private closeViews(): void {
    this.viewPicker.hidden = true;
    this.dock.setExpanded('views', false);
  }

  private closeInfo(): void {
    this.infoPicker.hidden = true;
    this.dock.setExpanded('info', false);
  }

  private closeThemes(): void {
    this.themePicker.hidden = true;
    this.dock.setExpanded('themes', false);
  }

  private paint(model: GameHudModel): void {
    this.bar.paint(model);
    this.dock.paint(model);
    this.cityDrawer.paint(model);
    this.policiesDrawer.paint(model);
    this.paintDecision(model);
    this.paintSelection();
    this.paintToast();
  }

  private snoozeDecision(): void {
    this.handlers.onSnooze();
    this.showTransientFeedback('Decision postponed — answer it in the City dashboard.');
  }

  private paintDecision(model: GameHudModel): void {
    const decision = model.decision;
    if (decision === null) {
      this.decisionCard.hidden = true;
      if (decisionNeedsRepaint(this.paintedDecisionId, null)) this.decisionCard.replaceChildren();
      this.paintedDecisionId = null;
      return;
    }
    // Rimandata: la carta si nasconde, ma la scelta resta in piedi e ricompare
    // al termine dello snooze. Si svuota lo stato dipinto perche' i bottoni
    // vanno ricostruiti con listener freschi al rientro.
    if (model.decisionSnoozed) {
      this.decisionCard.hidden = true;
      if (this.paintedDecisionId !== null) {
        this.paintedDecisionId = null;
        this.decisionCard.replaceChildren();
      }
      return;
    }
    this.decisionCard.hidden = false;
    // Il repaint periodico non deve sostituire il bottone tra pointerdown e click.
    if (!decisionNeedsRepaint(this.paintedDecisionId, decision)) return;
    const title = document.createElement('h2');
    title.textContent = decision.title;
    const message = document.createElement('p');
    message.textContent = decision.message;
    const options = document.createElement('div');
    options.className = 'decision-options';
    for (const option of decision.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'decision-option';
      const label = document.createElement('strong');
      label.textContent = option.label;
      const description = document.createElement('span');
      description.textContent = option.description;
      button.append(label, description);
      // Il segno che l'alternativa lascia sulla forma della citta'. Senza
      // questa riga il giocatore legge tre travasi di risorse e non sa che sta
      // scegliendo anche come cresceranno i suoi isolati.
      const mark = decisionMark(option, model.decisionActiveCharter);
      if (mark !== null) {
        const consequence = document.createElement('span');
        consequence.className = 'decision-mark';
        consequence.textContent = mark;
        button.appendChild(consequence);
      }
      button.addEventListener('click', () => this.handlers.onDecision(option.id), { once: true });
      options.appendChild(button);
    }
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'decision-later';
    later.textContent = 'Decide later';
    later.addEventListener('click', () => this.snoozeDecision(), { once: true });
    this.decisionCard.replaceChildren(title, message, options, later);
    this.paintedDecisionId = decision.id;
  }

  private paintSelection(): void {
    this.dock.paintSelection(this.selected);
    this.paintPlacementMode();
  }

  /**
   * Il verso di posa scelto, se il ruolo ne ha due.
   *
   * `null` per gli strumenti senza facciata: il selettore resta nascosto, perche'
   * non c'e' niente da scegliere. Un ruolo con la forma in quota mostra i due
   * versi e marca quello attivo, cosi' tessera, scorciatoia e puntatore dicono
   * la stessa cosa.
   */
  private placementModeFor(tool: GameTool): boolean {
    if (tool.kind !== 'catalyst' || tool.id === undefined) return false;
    const action = this.model.catalysts.find((candidate) => candidate.catalystId === tool.id);
    return action?.facadeForm === true;
  }

  private paintPlacementMode(): void {
    if (this.selected.kind !== 'catalyst' || !this.placementModeFor(this.selected)) {
      this.modePicker.hidden = true;
      return;
    }
    this.modePicker.hidden = false;
    const active = this.selected.mode ?? 'ground';
    this.groundButton.setAttribute('aria-pressed', active === 'ground' ? 'true' : 'false');
    this.aloftButton.setAttribute('aria-pressed', active === 'aloft' ? 'true' : 'false');
  }

  /**
   * Alterna suolo e facciata per lo strumento in mano.
   *
   * Torna `false` quando non c'e' niente da alternare, cosi' il tasto che la
   * chiama puo' cadere su altri handler invece di essere ingoiato: e' la stessa
   * regola delle cifre nude del dock.
   */
  togglePlacementMode(): boolean {
    if (this.selected.kind !== 'catalyst' || !this.placementModeFor(this.selected)) return false;
    const current = this.selected.mode ?? 'ground';
    this.pickTool({ ...this.selected, mode: current === 'ground' ? 'aloft' : 'ground' });
    return true;
  }

  private setPlacementMode(mode: PlacementMode): void {
    if (this.selected.kind !== 'catalyst' || !this.placementModeFor(this.selected)) return;
    if ((this.selected.mode ?? 'ground') === mode) return;
    this.pickTool({ ...this.selected, mode });
  }

  private createModePicker(): {
    readonly picker: HTMLElement;
    readonly ground: HTMLButtonElement;
    readonly aloft: HTMLButtonElement;
  } {
    const picker = document.createElement('aside');
    picker.className = 'placement-mode hud-surface';
    picker.hidden = true;
    picker.setAttribute('aria-label', 'Placement direction');

    const title = document.createElement('span');
    title.className = 'placement-mode-title';
    title.textContent = 'Placement';

    const ground = document.createElement('button');
    ground.type = 'button';
    ground.className = 'placement-mode-option';
    ground.textContent = 'Ground';
    ground.addEventListener('click', () => this.setPlacementMode('ground'));

    const aloft = document.createElement('button');
    aloft.type = 'button';
    aloft.className = 'placement-mode-option';
    aloft.textContent = 'Rooftop';
    aloft.addEventListener('click', () => this.setPlacementMode('aloft'));

    const row = document.createElement('div');
    row.className = 'placement-mode-row';
    row.append(ground, aloft);

    const keys = document.createElement('span');
    keys.className = 'placement-mode-keys';
    const key = document.createElement('kbd');
    key.textContent = 'X';
    keys.append(key, document.createTextNode(' toggles'));

    picker.append(title, row, keys);
    return { picker, ground, aloft };
  }

  private paintToast(): void {
    if (this.feedback !== null) {
      this.toast.textContent = this.feedback.message;
      this.toast.dataset.tone = this.feedback.tone;
      delete this.toast.dataset.kind;
      return;
    }
    const instruction = selectionMessage(this.selected, this.model.catalysts);
    if (instruction !== null) {
      this.toast.textContent = this.selectionNote === null
        ? instruction
        : `${this.selectionNote} · ${instruction}`;
      this.toast.dataset.tone = 'selection';
      delete this.toast.dataset.kind;
      return;
    }
    const condition = this.model.condition;
    /*
     * Tutorial e coach sono istruzioni: nasconderne il gesto nel cassetto Citta'
     * lasciava sul campo soltanto «Place a Market» o «Add homes», cioe' proprio
     * la parte che non spiega come riuscirci. Restano compatti in due pesi —
     * obiettivo e gesto/verifica — mentre crisi e referti continuano a essere
     * targhe di una riga: quelli durano e i dettagli hanno gia' una dashboard.
     */
    if (condition?.kind === 'onboarding' || condition?.kind === 'coach') {
      const title = document.createElement('strong');
      title.className = 'hud-toast-title';
      title.textContent = condition.title;
      const message = document.createElement('span');
      message.className = 'hud-toast-message';
      message.textContent = condition.message;
      this.toast.replaceChildren(title, message);
      this.toast.dataset.tone = condition.tone;
      this.toast.dataset.kind = condition.kind;
      return;
    }
    this.toast.textContent = condition?.title ?? this.model.message;
    this.toast.dataset.tone = condition?.tone ?? 'neutral';
    if (condition === null) delete this.toast.dataset.kind;
    else this.toast.dataset.kind = 'condition';
  }
}
