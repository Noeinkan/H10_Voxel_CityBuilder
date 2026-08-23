import type { ActionFailure } from '../game/actions';
import type { GrowthStats } from '../game/growthScene';
import type { PolicyId, TradeMode } from '../sim';
import { ControlsHint } from './ControlsHint';
import {
  buildGameHudModel,
  daylightControl,
  decisionMark,
  decisionNeedsRepaint,
  resolveEscapeTarget,
  selectionMessage,
  type GameHudModel,
  type GameTool,
  type HudAction,
  type HudPolicy,
  type HudResource,
  type HudTradeMode,
} from './GameHudModel';
import { DAYLIGHT_MODE, type DaylightMode } from '../engine/daylight';
import { createHudIcon, type HudIcon } from './hudIcons';
import { buildViewMenuModel, type ViewKeyHint, type ViewMenuModel } from './ViewMenuModel';
import { INSPECT, INSPECT_MODE, type InspectMode } from '../engine/inspect';

export type { GameTool } from './GameHudModel';

export interface GameHudHandlers {
  readonly onTool: (tool: GameTool) => void;
  readonly onPolicy: (id: PolicyId) => void;
  readonly onTrade: (mode: TradeMode) => void;
  readonly onDecision: (optionId: string) => void;
  readonly onPause: (paused: boolean) => void;
  readonly onSpeed: (speed: number) => void;
  /** Ciclo, giorno fisso o notte fissa: sta accanto alla velocita' perche' e' tempo. */
  readonly onDaylight: (mode: DaylightMode) => void;
  readonly onTheme: (id: string) => void;
  readonly onView: (mode: InspectMode) => void;
  readonly onLevel: (z: number) => void;
  readonly onCancelTool: () => void;
  /** Molla l'isolato scelto in Block focus, lasciando accesa la vista. */
  readonly onReleaseBlock: () => void;
}

export interface ThemeChoice {
  readonly id: string;
  readonly name: string;
  readonly swatches: readonly string[];
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
}

const FAILURE_LABEL: Readonly<Record<ActionFailure, string>> = {
  'terrain-loading': 'The terrain is not ready yet.',
  'not-buildable': 'No earthwork holds here: only cliffs and deep water refuse.',
  'needs-coast': 'A Port only works on the waterfront. Move it closer to the sea.',
  'needs-open-ground': 'An Airport needs a wide, level clearing to lay a runway on.',
  'too-close': 'Too close to another catalyst of the same type.',
  'block-too-tall': 'Too tall to clear. Look for a lower pocket in the district.',
  'structure-in-the-way': 'A landmark or an elevated deck stands here. It will not make way.',
  'insufficient-funds': 'You do not have enough funds yet.',
  'population-required': 'The city must grow before you can do this.',
  'already-active': 'This policy is already active.',
  'already-unlocked': 'This sector is already unlocked. Choose another one.',
  'onboarding-order': 'Follow the tutorial order: residential, production, civic.',
  'policy-incompatible': 'This policy conflicts with one that is already active.',
  'decision-option-invalid': 'This decision option is no longer available.',
};

const DAYLIGHT_ICON: Readonly<Record<DaylightMode, HudIcon>> = {
  [DAYLIGHT_MODE.cycle]: 'daylight',
  [DAYLIGHT_MODE.day]: 'sun',
  [DAYLIGHT_MODE.night]: 'moon',
};

const RESOURCE_ICON: Readonly<Record<HudResource['id'], HudIcon>> = {
  funds: 'funds', population: 'population', food: 'food', materials: 'materials', satisfaction: 'satisfaction',
};

interface ResourceElements {
  readonly value: HTMLElement;
  readonly delta: HTMLElement;
}

/** HUD giocabile: risorse in alto, azioni in basso e pannelli contestuali. */
export class GameHud {
  private readonly root: HTMLElement;
  private readonly dock: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly policyDrawer: HTMLElement;
  private readonly themePicker: HTMLElement;
  private readonly viewPicker: HTMLElement;
  private readonly viewBar: HTMLElement;
  private viewBarLabel!: HTMLElement;
  private viewBarGesture!: HTMLElement;
  private viewBarKeys!: HTMLElement;
  /** Vista accesa: e' l'ultima cosa che Escape spegne, e la targa lo dichiara. */
  private viewActive = false;
  /** Isolato scelto: Escape lo molla **prima** di spegnere la vista. */
  private blockLocked = false;
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
  private readonly handlers: GameHudHandlers;
  private readonly resources = new Map<HudResource['id'], ResourceElements>();
  private readonly catalystButtons: HTMLButtonElement[] = [];
  private commercePanel!: HTMLElement;
  private readonly policyButtons = new Map<PolicyId, HTMLButtonElement>();
  private readonly tradeButtons = new Map<TradeMode, HTMLButtonElement>();
  private readonly decisionCard: HTMLElement;
  private readonly expansionButton: HTMLButtonElement;
  private readonly policyToggle: HTMLButtonElement;
  private readonly themeToggle: HTMLButtonElement;
  private readonly viewToggle: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly daylightButton: HTMLButtonElement;
  private daylightMode: DaylightMode = DAYLIGHT_MODE.cycle;
  private readonly speedButtons = new Map<number, HTMLButtonElement>();
  private readonly themeButtons = new Map<string, HTMLButtonElement>();
  private readonly viewButtons = new Map<InspectMode, HTMLButtonElement>();
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

    const resourceBar = document.createElement('header');
    resourceBar.className = 'resource-bar hud-surface';
    for (const resource of this.model.resources) resourceBar.appendChild(this.createResource(resource));

    const time = document.createElement('div');
    time.className = 'time-controls';
    this.pauseButton = iconButton('pause', 'Pause simulation', () => handlers.onPause(!this.model.paused));
    this.pauseButton.classList.add('hud-button--small');
    time.appendChild(this.pauseButton);
    for (const speed of [1, 2, 4]) {
      const button = textButton(`${speed}×`, `Simulation speed ${speed}×`, () => handlers.onSpeed(speed));
      button.classList.add('hud-button--small');
      this.speedButtons.set(speed, button);
      time.appendChild(button);
    }
    // Il ciclo del giorno sta con la velocita' e la pausa perche' e' la stessa
    // domanda — quanto tempo passa mentre guardo — e perche' e' li' che si
    // guarda quando la citta' e' buia e non si sa se tornera' giorno.
    this.daylightButton = iconButton('daylight', 'Daylight', () =>
      this.handlers.onDaylight(daylightControl(this.daylightMode).next));
    this.daylightButton.classList.add('hud-button--small', 'daylight-toggle');
    time.appendChild(this.daylightButton);
    this.setDaylight(DAYLIGHT_MODE.cycle);
    resourceBar.appendChild(time);
    this.root.appendChild(resourceBar);

    this.toast = document.createElement('div');
    this.toast.className = 'hud-toast';
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    this.root.appendChild(this.toast);

    this.cursor = document.createElement('div');
    this.cursor.className = 'cursor-card hud-surface';
    this.cursor.hidden = true;
    this.root.appendChild(this.cursor);

    this.dock = document.createElement('nav');
    this.dock.className = 'build-dock hud-surface';
    this.dock.setAttribute('aria-label', 'Building actions');
    // La toolbar e' organizzata per funzione, non per costo o per ordine di
    // sblocco: prima cosa fa crescere la citta', poi cosa la collega, infine
    // cosa le da' un carattere. E' l'unica classificazione che il giocatore puo'
    // usare prima di conoscere i sette nomi.
    //
    // `catalystButtons` resta parallelo a `model.catalysts`, non ai gruppi: il
    // ridisegno scorre la lista piatta, e tenere due ordini diversi sarebbe una
    // corrispondenza da mantenere a mano a ogni ripittura.
    for (const group of this.model.catalystGroups) {
      const section = document.createElement('div');
      section.className = 'dock-group';
      const heading = document.createElement('span');
      heading.className = 'dock-group-title';
      heading.textContent = group.label;
      section.appendChild(heading);

      const row = document.createElement('div');
      row.className = 'dock-group-row';
      for (const action of group.actions) {
        const button = actionButton(action, (action.catalystId ?? 'market') as HudIcon, () => {
          this.feedback = null;
          this.selectionNote = null;
          this.selected = {
            kind: 'catalyst',
            class: action.class ?? 0,
            id: action.catalystId,
          };
          handlers.onTool(this.selected);
          this.paintSelection();
          this.paintToast();
        });
        this.catalystButtons[this.model.catalysts.indexOf(action)] = button;
        row.appendChild(button);
      }
      section.appendChild(row);
      this.dock.appendChild(section);
    }

    this.expansionButton = actionButton(this.model.expansion, 'expansion', () => {
      this.feedback = null;
      this.selectionNote = null;
      this.selected = { kind: 'expansion' };
      handlers.onTool(this.selected);
      this.paintSelection();
      this.paintToast();
    });
    this.expansionButton.classList.add('hud-button--accent');
    this.dock.append(this.expansionButton, divider());
    this.policyToggle = labeledButton('policies', 'Policies', 'Open city policies', () => this.togglePolicies());
    this.policyToggle.setAttribute('aria-expanded', 'false');
    this.dock.appendChild(this.policyToggle);
    // Le viste stanno fra le politiche e il tema perche' e' li' che passa il
    // confine: da qui in poi i bottoni non cambiano la citta', cambiano come la
    // si guarda.
    this.viewToggle = labeledButton('view', 'Views', 'Look inside the city · V', () => this.toggleViews());
    this.viewToggle.setAttribute('aria-expanded', 'false');
    this.dock.appendChild(this.viewToggle);
    this.themeToggle = iconButton('theme', 'Change visual theme', () => this.toggleThemes());
    this.themeToggle.setAttribute('aria-expanded', 'false');
    this.dock.appendChild(this.themeToggle);
    this.dock.appendChild(iconButton('help', 'Open help', () => this.toggleHelp()));
    this.root.appendChild(this.dock);

    this.policyDrawer = this.createPolicyDrawer();
    this.root.appendChild(this.policyDrawer);
    this.decisionCard = document.createElement('aside');
    this.decisionCard.className = 'decision-card hud-surface';
    this.decisionCard.hidden = true;
    this.decisionCard.setAttribute('aria-live', 'polite');
    this.root.appendChild(this.decisionCard);
    this.themePicker = this.createThemePicker(themes);
    this.root.appendChild(this.themePicker);
    this.viewPicker = this.createViewPicker();
    this.root.appendChild(this.viewPicker);
    this.viewBar = this.createViewBar();
    this.root.appendChild(this.viewBar);
    this.levelRail = this.createLevelRail();
    this.root.appendChild(this.levelRail);
    parent.appendChild(this.root);
    this.help = new ControlsHint(this.root);
    this.setTheme(activeThemeId);
    this.setView(buildViewMenuModel(INSPECT_MODE.off, INSPECT.defaultSliceZ, INSPECT.maxSliceZ));

    const publishDockHeight = (): void => {
      document.documentElement.style.setProperty('--game-hud-bottom', `${this.dock.offsetHeight + 28}px`);
    };
    new ResizeObserver(publishDockHeight).observe(this.dock);
    requestAnimationFrame(publishDockHeight);
    this.paint(this.model);
  }

  needsPaint(now: number): boolean {
    return now - this.lastPaint >= 150;
  }

  update(stats: GrowthStats, now: number): void {
    this.lastPaint = now;
    this.model = buildGameHudModel(stats);
    this.paint(this.model);
  }

  setTool(tool: GameTool): void {
    this.feedback = null;
    this.selectionNote = null;
    this.selected = tool;
    this.paintSelection();
    this.paintToast();
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
    const label = `Change visual theme, current: ${name}`;
    this.themeToggle.setAttribute('aria-label', label);
    this.themeToggle.dataset.tooltip = label;
  }

  /**
   * Il modo del ciclo, dal modello puro al bottone.
   *
   * L'icona **e'** lo stato: sole con l'orizzonte per il giro, sole pieno per il
   * giorno fermo, falce per la notte ferma. Un bottone che cicla e mostra sempre
   * la stessa icona costringe a leggere il tooltip per sapere dove si e'.
   */
  setDaylight(mode: DaylightMode): void {
    this.daylightMode = mode;
    const control = daylightControl(mode);
    this.daylightButton.replaceChildren(createHudIcon(DAYLIGHT_ICON[mode]));
    this.daylightButton.setAttribute('aria-label', control.tooltip);
    this.daylightButton.dataset.tooltip = control.tooltip;
    this.daylightButton.dataset.active = control.frozen ? 'true' : 'false';
    this.daylightButton.setAttribute('aria-pressed', control.frozen ? 'true' : 'false');
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
    this.viewToggle.dataset.active = active ? 'true' : 'false';
    const label = active
      ? `Looking inside: ${model.activeLabel} · V to change`
      : 'Look inside the city · V';
    this.viewToggle.setAttribute('aria-label', label);
    this.viewToggle.dataset.tooltip = label;

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
    if (info.typologies !== undefined && info.typologies.length > 0) {
      this.cursor.appendChild(cursorLine('May build', info.typologies.join(', ')));
    }
    this.cursor.appendChild(reason);
  }

  togglePolicies(): void {
    const opening = this.policyDrawer.hidden;
    this.policyDrawer.hidden = !opening;
    this.policyToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      this.closeThemes();
      this.closeViews();
      this.help.hide();
    }
  }

  toggleThemes(): void {
    const opening = this.themePicker.hidden;
    this.themePicker.hidden = !opening;
    this.themeToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      this.closePolicies();
      this.closeViews();
      this.help.hide();
    }
  }

  toggleViews(): void {
    const opening = this.viewPicker.hidden;
    this.viewPicker.hidden = !opening;
    this.viewToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      this.closePolicies();
      this.closeThemes();
      this.help.hide();
    }
  }

  toggleHelp(): void {
    this.closePolicies();
    this.closeThemes();
    this.closeViews();
    this.help.toggle();
  }

  handleEscape(): boolean {
    switch (resolveEscapeTarget(
      !this.viewPicker.hidden,
      !this.themePicker.hidden,
      !this.policyDrawer.hidden,
      this.help.isOpen,
      this.selected,
      this.viewActive,
      this.blockLocked,
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
      case 'lock':
        this.handlers.onReleaseBlock();
        return true;
      case 'view':
        this.handlers.onView(INSPECT_MODE.off);
        return true;
      case 'none':
        return false;
    }
  }

  /**
   * Il ciclo commerciale in quattro numeri e una frase.
   *
   * "Servita" e "pieni" sono due cose diverse e vanno mostrate insieme: la
   * prima dice se la citta' trova cio' che cerca, la seconda se i negozi che ha
   * costruito servono a qualcosa. Con un solo numero, "troppi negozi" e "pochi
   * negozi" si leggerebbero uguale.
   */
  private paintCommerce(commerce: GameHudModel['commerce']): void {
    if (commerce === null) {
      this.commercePanel.replaceChildren();
      return;
    }

    const rows: readonly (readonly [string, string])[] = [
      ['Demand served', `${commerce.service}%`],
      ['Shops in use', `${commerce.occupancy}%`],
      ['Revenue', `${commerce.revenue.toFixed(2)} / tick`],
      ['Goods sold', `${commerce.goods.toFixed(2)} / tick`],
      ['Mixed-use blocks', `${commerce.mixedBuildings}`],
    ];

    this.commercePanel.replaceChildren(
      ...rows.map(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'commerce-row';
        const name = document.createElement('span');
        name.textContent = label;
        const amount = document.createElement('strong');
        amount.textContent = value;
        row.append(name, amount);
        return row;
      }),
    );

    const note = document.createElement('p');
    note.className = 'commerce-note';
    note.textContent = commerce.message;
    this.commercePanel.appendChild(note);
  }

  private createResource(resource: HudResource): HTMLElement {
    const item = document.createElement('div');
    item.className = 'resource-item';
    item.appendChild(createHudIcon(RESOURCE_ICON[resource.id]));
    const label = document.createElement('span');
    label.className = 'resource-label';
    label.textContent = resource.label;
    const value = document.createElement('span');
    value.className = 'resource-value';
    const number = document.createElement('span');
    const delta = document.createElement('span');
    delta.className = 'resource-delta';
    value.append(number, delta);
    item.append(label, value);
    this.resources.set(resource.id, { value: number, delta });
    return item;
  }

  private createPolicyDrawer(): HTMLElement {
    const drawer = document.createElement('aside');
    drawer.className = 'policy-drawer hud-surface';
    drawer.hidden = true;
    drawer.setAttribute('aria-label', 'City policies');
    const header = document.createElement('header');
    header.className = 'drawer-header';
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'drawer-title';
    title.textContent = 'City policies';
    const subtitle = document.createElement('p');
    subtitle.className = 'drawer-subtitle';
    subtitle.textContent = 'Invest to shape how your city grows.';
    copy.append(title, subtitle);
    const close = iconButton('close', 'Close policies', () => this.closePolicies());
    close.classList.add('hud-button--small');
    header.append(copy, close);
    drawer.appendChild(header);
    const list = document.createElement('div');
    list.className = 'policy-list';
    for (const policy of this.model.policies) {
      const button = this.createPolicyButton(policy);
      this.policyButtons.set(policy.id, button);
      list.appendChild(button);
    }
    drawer.appendChild(list);

    // Il commercio interno sta accanto a quello esterno perche' sono la stessa
    // domanda vista da due lati: cosa la citta' vende a se stessa e cosa vende
    // fuori. Separarli in due pannelli renderebbe invisibile che competono per
    // gli stessi materiali.
    const commerceTitle = document.createElement('h3');
    commerceTitle.className = 'drawer-section-title';
    commerceTitle.textContent = 'Commerce';
    drawer.appendChild(commerceTitle);
    this.commercePanel = document.createElement('div');
    this.commercePanel.className = 'commerce-panel';
    drawer.appendChild(this.commercePanel);

    const tradeTitle = document.createElement('h3');
    tradeTitle.className = 'drawer-section-title';
    tradeTitle.textContent = 'External trade';
    drawer.appendChild(tradeTitle);
    const tradeList = document.createElement('div');
    tradeList.className = 'trade-list';
    for (const mode of this.model.tradeModes) {
      const button = this.createTradeButton(mode);
      this.tradeButtons.set(mode.id, button);
      tradeList.appendChild(button);
    }
    drawer.appendChild(tradeList);
    return drawer;
  }

  private createThemePicker(themes: readonly ThemeChoice[]): HTMLElement {
    const picker = document.createElement('aside');
    picker.className = 'theme-picker hud-surface';
    picker.hidden = true;
    picker.setAttribute('aria-label', 'Visual themes');

    const title = document.createElement('h2');
    title.className = 'drawer-title';
    title.textContent = 'Visual theme';
    picker.appendChild(title);

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
      grid.appendChild(button);
    }
    picker.appendChild(grid);
    return picker;
  }

  private createPolicyButton(policy: HudPolicy): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'policy-card';
    button.addEventListener('click', () => {
      this.feedback = null;
      this.handlers.onPolicy(policy.id);
    });
    const name = document.createElement('span');
    name.className = 'policy-name';
    name.textContent = policy.label;
    const state = document.createElement('span');
    state.className = 'policy-state';
    const description = document.createElement('span');
    description.className = 'policy-description';
    description.textContent = policy.description;
    const requirement = document.createElement('span');
    requirement.className = 'policy-requirement';
    button.append(name, state, description, requirement);
    return button;
  }

  private createTradeButton(mode: HudTradeMode): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trade-card';
    button.addEventListener('click', () => this.handlers.onTrade(mode.id));
    const name = document.createElement('strong');
    name.textContent = mode.label;
    const description = document.createElement('span');
    description.textContent = mode.description;
    button.append(name, description);
    return button;
  }

  /**
   * Le cinque viste, ognuna con la riga che dice cosa si va a vedere.
   *
   * Le etichette e le descrizioni arrivano da `ViewMenuModel`, che e' puro e
   * testato: qui si disegna e basta.
   */
  private createViewPicker(): HTMLElement {
    const picker = document.createElement('aside');
    picker.className = 'view-picker hud-surface';
    picker.hidden = true;
    picker.setAttribute('aria-label', 'City views');

    const title = document.createElement('h2');
    title.className = 'drawer-title';
    title.textContent = 'Look inside';
    const subtitle = document.createElement('p');
    subtitle.className = 'drawer-subtitle';
    subtitle.textContent = 'Your city is dense enough to hide things. Open it up.';
    picker.append(title, subtitle);

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

  private closePolicies(): void {
    this.policyDrawer.hidden = true;
    this.policyToggle.setAttribute('aria-expanded', 'false');
  }

  private closeViews(): void {
    this.viewPicker.hidden = true;
    this.viewToggle.setAttribute('aria-expanded', 'false');
  }

  private closeThemes(): void {
    this.themePicker.hidden = true;
    this.themeToggle.setAttribute('aria-expanded', 'false');
  }

  private paint(model: GameHudModel): void {
    for (const resource of model.resources) {
      const elements = this.resources.get(resource.id);
      if (elements === undefined) continue;
      elements.value.textContent = resource.value;
      elements.delta.textContent = resource.delta === '' ? '' : ` ${resource.delta}`;
      elements.delta.dataset.tone = resource.tone;
    }
    model.catalysts.forEach((action, index) => paintAction(this.catalystButtons[index], action));
    paintAction(this.expansionButton, model.expansion);
    for (const policy of model.policies) this.paintPolicy(policy);
    this.paintCommerce(model.commerce);
    for (const mode of model.tradeModes) this.paintTradeMode(mode, model.tradeConnected);
    this.paintDecision(model);

    this.pauseButton.replaceChildren(createHudIcon(model.paused ? 'play' : 'pause'));
    const pauseLabel = model.paused ? 'Resume simulation' : 'Pause simulation';
    this.pauseButton.setAttribute('aria-label', pauseLabel);
    this.pauseButton.dataset.tooltip = pauseLabel;
    this.pauseButton.dataset.active = model.paused ? 'true' : 'false';
    for (const [speed, button] of this.speedButtons) {
      const active = !model.paused && model.speed === speed;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    this.paintSelection();
    this.paintToast();
  }

  private paintPolicy(policy: HudPolicy): void {
    const button = this.policyButtons.get(policy.id);
    if (button === undefined) return;
    button.disabled = !policy.available;
    button.setAttribute('aria-pressed', policy.active ? 'true' : 'false');
    button.title = policy.reason;
    const state = button.querySelector<HTMLElement>('.policy-state');
    const requirement = button.querySelector<HTMLElement>('.policy-requirement');
    if (state !== null) state.textContent = policy.active ? 'ACTIVE' : '';
    if (requirement !== null) {
      const population = policy.population > 0 ? ` · ${policy.population} residents` : '';
      requirement.textContent = policy.active
        ? `Select to deactivate · ${policy.upkeep.toFixed(1)} funds/tick`
        : `${policy.cost} funds${population} · ${policy.upkeep.toFixed(1)} funds/tick`;
    }
  }

  private paintTradeMode(mode: HudTradeMode, connected: boolean): void {
    const button = this.tradeButtons.get(mode.id);
    if (button === undefined) return;
    button.disabled = !mode.available;
    button.setAttribute('aria-pressed', mode.active ? 'true' : 'false');
    button.title = connected
      ? mode.description
      : 'Build a Port or an Airport to unlock external trade.';
  }

  private paintDecision(model: GameHudModel): void {
    const decision = model.decision;
    this.decisionCard.hidden = decision === null;
    if (decision === null) {
      if (decisionNeedsRepaint(this.paintedDecisionId, decision)) this.decisionCard.replaceChildren();
      this.paintedDecisionId = null;
      return;
    }
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
      const mark = decisionMark(option);
      if (mark !== null) {
        const consequence = document.createElement('span');
        consequence.className = 'decision-mark';
        consequence.textContent = mark;
        button.appendChild(consequence);
      }
      button.addEventListener('click', () => this.handlers.onDecision(option.id), { once: true });
      options.appendChild(button);
    }
    this.decisionCard.replaceChildren(title, message, options);
    this.paintedDecisionId = decision.id;
  }

  private paintSelection(): void {
    this.catalystButtons.forEach((button, index) => {
      const action = this.model.catalysts[index];
      const active = this.selected.kind === 'catalyst' && action !== undefined && (
        this.selected.id !== undefined
          ? this.selected.id === action.catalystId
          : this.selected.class === action.class
      );
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    this.expansionButton.setAttribute('aria-pressed', this.selected.kind === 'expansion' ? 'true' : 'false');
  }

  private paintToast(): void {
    if (this.feedback !== null) {
      this.toast.textContent = this.feedback.message;
      this.toast.dataset.tone = this.feedback.tone;
      return;
    }
    const instruction = selectionMessage(this.selected, this.model.catalysts);
    if (instruction !== null) {
      this.toast.textContent = this.selectionNote === null
        ? instruction
        : `${this.selectionNote} · ${instruction}`;
      this.toast.dataset.tone = 'selection';
      return;
    }
    this.toast.textContent = this.model.message;
    this.toast.dataset.tone = this.model.condition?.tone ?? 'neutral';
  }
}

function actionButton(action: HudAction, icon: HudIcon, onClick: () => void): HTMLButtonElement {
  const button = labeledButton(icon, action.label, action.reason, onClick);
  const copy = button.querySelector('.button-copy');
  const cost = document.createElement('span');
  cost.className = 'button-cost';
  cost.textContent = `${action.cost} funds`;
  copy?.appendChild(cost);
  button.setAttribute('aria-pressed', 'false');
  return button;
}

function labeledButton(icon: HudIcon, label: string, tooltip: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button';
  button.dataset.tooltip = tooltip;
  button.setAttribute('aria-label', label);
  button.appendChild(createHudIcon(icon));
  const copy = document.createElement('span');
  copy.className = 'button-copy';
  const text = document.createElement('span');
  text.textContent = label;
  copy.appendChild(text);
  button.appendChild(copy);
  button.addEventListener('click', onClick);
  return button;
}

function iconButton(icon: HudIcon, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button hud-button--icon';
  button.dataset.tooltip = label;
  button.setAttribute('aria-label', label);
  button.appendChild(createHudIcon(icon));
  button.addEventListener('click', onClick);
  return button;
}

function textButton(label: string, tooltip: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button';
  button.textContent = label;
  button.dataset.tooltip = tooltip;
  button.setAttribute('aria-label', tooltip);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', onClick);
  return button;
}

function paintAction(button: HTMLButtonElement | undefined, action: HudAction): void {
  if (button === undefined) return;
  button.disabled = !action.available;
  // Bloccato ma visibile: il bottone resta al suo posto e cambia solo stato,
  // cosi' la toolbar non si riordina sotto il dito mentre i fondi salgono.
  button.dataset.locked = action.locked === true ? 'true' : 'false';
  button.dataset.tooltip = actionTooltip(action);
  button.title = actionTooltip(action);
}

/** Motivo dell'azione, piu' cio' che quel ruolo favorisce e puo' far nascere. */
function actionTooltip(action: HudAction): string {
  const lines = [action.reason];
  // Subito dopo il motivo e prima di tutto il resto: un vincolo di sito cambia
  // *dove* si clicca, e leggerlo in fondo all'elenco vorrebbe dire leggerlo
  // dopo aver gia' scelto il punto.
  if (action.site !== undefined) lines.push(action.site);
  if (action.radius !== undefined) lines.push(`Radius ${action.radius}`);
  if (action.favours !== undefined && action.favours.length > 0) {
    lines.push(`Favours: ${action.favours.join(', ')}`);
  }
  if (action.penalises !== undefined && action.penalises.length > 0) {
    lines.push(`Penalises: ${action.penalises.join(', ')}`);
  }
  if (action.typologies !== undefined && action.typologies.length > 0) {
    lines.push(`May build: ${action.typologies.join(', ')}`);
  }
  return lines.join(' · ');
}

/** Una riga etichettata della scheda al cursore. */
function cursorLine(label: string, value: string): HTMLElement {
  const line = document.createElement('span');
  line.className = 'cursor-line';
  const name = document.createElement('em');
  name.textContent = `${label}: `;
  line.append(name, document.createTextNode(value));
  return line;
}

/** Una riga di tasti della targa: i capitasti a sinistra, cosa fanno a destra. */
function viewKeyRow(hint: ViewKeyHint): HTMLElement {
  const row = document.createElement('div');
  row.className = 'view-bar-key';
  const caps = document.createElement('span');
  caps.className = 'view-bar-caps';
  for (const label of hint.keys) {
    const key = document.createElement('kbd');
    key.textContent = label;
    caps.appendChild(key);
  }
  const action = document.createElement('span');
  action.textContent = hint.action;
  row.append(caps, action);
  return row;
}

/** Bottone di testo della targa: niente icona, perche' e' la parola che conta. */
function barButton(label: string, tooltip: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'view-bar-button';
  button.textContent = label;
  // `title` e non `data-tooltip`: la bolla del dock e' legata a `.hud-button`, e
  // qui la parola sul bottone dice gia' quasi tutto.
  button.title = tooltip;
  button.setAttribute('aria-label', tooltip);
  button.addEventListener('click', onClick);
  return button;
}

function divider(): HTMLElement {
  const element = document.createElement('span');
  element.className = 'dock-divider';
  element.setAttribute('aria-hidden', 'true');
  return element;
}
