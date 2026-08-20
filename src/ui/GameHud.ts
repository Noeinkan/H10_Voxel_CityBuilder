import type { ActionFailure } from '../game/actions';
import type { GrowthStats } from '../game/growthScene';
import type { PolicyId, TradeMode } from '../sim';
import { ControlsHint } from './ControlsHint';
import {
  buildGameHudModel,
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
import { createHudIcon, type HudIcon } from './hudIcons';

export type { GameTool } from './GameHudModel';

export interface GameHudHandlers {
  readonly onTool: (tool: GameTool) => void;
  readonly onPolicy: (id: PolicyId) => void;
  readonly onTrade: (mode: TradeMode) => void;
  readonly onDecision: (optionId: string) => void;
  readonly onPause: (paused: boolean) => void;
  readonly onSpeed: (speed: number) => void;
  readonly onTheme: (id: string) => void;
  readonly onCancelTool: () => void;
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
  'too-close': 'Too close to another catalyst of the same type.',
  'insufficient-funds': 'You do not have enough funds yet.',
  'population-required': 'The city must grow before you can do this.',
  'already-active': 'This policy is already active.',
  'already-unlocked': 'This sector is already unlocked. Choose another one.',
  'onboarding-order': 'Follow the tutorial order: residential, production, civic.',
  'policy-incompatible': 'This policy conflicts with one that is already active.',
  'decision-option-invalid': 'This decision option is no longer available.',
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
  private readonly pauseButton: HTMLButtonElement;
  private readonly speedButtons = new Map<number, HTMLButtonElement>();
  private readonly themeButtons = new Map<string, HTMLButtonElement>();
  private selected: GameTool = { kind: 'none' };
  private model: GameHudModel = buildGameHudModel(null);
  private feedback: { readonly message: string; readonly tone: 'error' | 'neutral' } | null = null;
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
    parent.appendChild(this.root);
    this.help = new ControlsHint(this.root);
    this.setTheme(activeThemeId);

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
    this.selected = tool;
    this.paintSelection();
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

  clearFeedback(): void {
    this.feedback = null;
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
      this.help.hide();
    }
  }

  toggleThemes(): void {
    const opening = this.themePicker.hidden;
    this.themePicker.hidden = !opening;
    this.themeToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      this.closePolicies();
      this.help.hide();
    }
  }

  toggleHelp(): void {
    this.closePolicies();
    this.closeThemes();
    this.help.toggle();
  }

  handleEscape(): boolean {
    switch (resolveEscapeTarget(
      !this.themePicker.hidden,
      !this.policyDrawer.hidden,
      this.help.isOpen,
      this.selected,
    )) {
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

  private closePolicies(): void {
    this.policyDrawer.hidden = true;
    this.policyToggle.setAttribute('aria-expanded', 'false');
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
    button.title = connected ? mode.description : 'Build a Port to unlock external trade.';
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
      this.toast.textContent = instruction;
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

function divider(): HTMLElement {
  const element = document.createElement('span');
  element.className = 'dock-divider';
  element.setAttribute('aria-hidden', 'true');
  return element;
}
