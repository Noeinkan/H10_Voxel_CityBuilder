import type { ActionFailure } from '../game/actions';
import type { GrowthStats } from '../game/growthScene';
import type { BuildingClass, PolicyId } from '../sim';
import { ControlsHint } from './ControlsHint';
import {
  buildGameHudModel,
  resolveEscapeTarget,
  selectionMessage,
  type GameHudModel,
  type GameTool,
  type HudAction,
  type HudPolicy,
  type HudResource,
} from './GameHudModel';
import { createHudIcon, type HudIcon } from './hudIcons';

export type { GameTool } from './GameHudModel';

export interface GameHudHandlers {
  readonly onTool: (tool: GameTool) => void;
  readonly onPolicy: (id: PolicyId) => void;
  readonly onPause: (paused: boolean) => void;
  readonly onSpeed: (speed: number) => void;
  readonly onCancelTool: () => void;
}

export interface CursorInfo {
  readonly title: string;
  readonly details: string;
  readonly valid: boolean;
  readonly reason: string;
}

const FAILURE_LABEL: Readonly<Record<ActionFailure, string>> = {
  'terrain-loading': 'Il terreno non è ancora pronto.',
  'not-buildable': 'Qui non puoi costruire: prova su una zona pianeggiante.',
  'too-close': 'Troppo vicino a un catalizzatore dello stesso tipo.',
  'insufficient-funds': 'Non hai ancora abbastanza fondi.',
  'population-required': 'La città deve crescere ancora prima di questa azione.',
  'already-active': 'Questa policy è già attiva.',
  'already-unlocked': 'Questo settore è già sbloccato: scegline un altro.',
  'onboarding-order': 'Segui l’ordine del tutorial: residenziale, produttivo, civico.',
};

const RESOURCE_ICON: Readonly<Record<HudResource['id'], HudIcon>> = {
  funds: 'funds', population: 'population', food: 'food', materials: 'materials', satisfaction: 'satisfaction',
};
const CATALYST_ICON: readonly HudIcon[] = ['residential', 'production', 'civic'];

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
  private readonly cursor: HTMLElement;
  private readonly help: ControlsHint;
  private readonly handlers: GameHudHandlers;
  private readonly resources = new Map<HudResource['id'], ResourceElements>();
  private readonly catalystButtons: HTMLButtonElement[] = [];
  private readonly policyButtons = new Map<PolicyId, HTMLButtonElement>();
  private readonly expansionButton: HTMLButtonElement;
  private readonly policyToggle: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly speedButtons = new Map<number, HTMLButtonElement>();
  private selected: GameTool = { kind: 'none' };
  private model: GameHudModel = buildGameHudModel(null);
  private feedback: { readonly message: string; readonly tone: 'error' | 'neutral' } | null = null;
  private lastPaint = 0;

  constructor(parent: HTMLElement, handlers: GameHudHandlers) {
    this.handlers = handlers;
    this.root = document.createElement('section');
    this.root.className = 'game-hud';
    this.root.setAttribute('aria-label', 'Comandi della città');

    const resourceBar = document.createElement('header');
    resourceBar.className = 'resource-bar hud-surface';
    for (const resource of this.model.resources) resourceBar.appendChild(this.createResource(resource));

    const time = document.createElement('div');
    time.className = 'time-controls';
    this.pauseButton = iconButton('pause', 'Metti in pausa', () => handlers.onPause(!this.model.paused));
    this.pauseButton.classList.add('hud-button--small');
    time.appendChild(this.pauseButton);
    for (const speed of [1, 2, 4]) {
      const button = textButton(`${speed}×`, `Velocità ${speed}×`, () => handlers.onSpeed(speed));
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
    this.dock.setAttribute('aria-label', 'Azioni di costruzione');
    this.model.catalysts.forEach((action, index) => {
      const button = actionButton(action, CATALYST_ICON[index] ?? 'residential', () => {
        this.feedback = null;
        this.selected = { kind: 'catalyst', class: index as BuildingClass };
        handlers.onTool(this.selected);
        this.paintSelection();
        this.paintToast();
      });
      this.catalystButtons.push(button);
      this.dock.appendChild(button);
    });

    this.expansionButton = actionButton(this.model.expansion, 'expansion', () => {
      this.feedback = null;
      this.selected = { kind: 'expansion' };
      handlers.onTool(this.selected);
      this.paintSelection();
      this.paintToast();
    });
    this.expansionButton.classList.add('hud-button--accent');
    this.dock.append(this.expansionButton, divider());
    this.policyToggle = labeledButton('policies', 'Policy', 'Apri le policy cittadine', () => this.togglePolicies());
    this.policyToggle.setAttribute('aria-expanded', 'false');
    this.dock.appendChild(this.policyToggle);
    this.dock.appendChild(iconButton('help', 'Apri l’aiuto', () => this.toggleHelp()));
    this.root.appendChild(this.dock);

    this.policyDrawer = this.createPolicyDrawer();
    this.root.appendChild(this.policyDrawer);
    parent.appendChild(this.root);
    this.help = new ControlsHint(this.root);

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

  showFailure(reason: ActionFailure): void {
    this.showFeedback(FAILURE_LABEL[reason], 'error');
  }

  showPickingFailure(): void {
    this.showFeedback('Nessuna superficie selezionabile in questo punto.', 'error');
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
    this.cursor.append(title, details, reason);
  }

  togglePolicies(): void {
    const opening = this.policyDrawer.hidden;
    this.policyDrawer.hidden = !opening;
    this.policyToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) this.help.hide();
  }

  toggleHelp(): void {
    this.closePolicies();
    this.help.toggle();
  }

  handleEscape(): boolean {
    switch (resolveEscapeTarget(!this.policyDrawer.hidden, this.help.isOpen, this.selected)) {
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
    drawer.setAttribute('aria-label', 'Policy cittadine');
    const header = document.createElement('header');
    header.className = 'drawer-header';
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'drawer-title';
    title.textContent = 'Policy cittadine';
    const subtitle = document.createElement('p');
    subtitle.className = 'drawer-subtitle';
    subtitle.textContent = 'Investi per orientare la crescita della città.';
    copy.append(title, subtitle);
    const close = iconButton('close', 'Chiudi le policy', () => this.closePolicies());
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
    return drawer;
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

  private closePolicies(): void {
    this.policyDrawer.hidden = true;
    this.policyToggle.setAttribute('aria-expanded', 'false');
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

    this.pauseButton.replaceChildren(createHudIcon(model.paused ? 'play' : 'pause'));
    const pauseLabel = model.paused ? 'Riprendi la simulazione' : 'Metti in pausa';
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
    if (state !== null) state.textContent = policy.active ? 'ATTIVA' : '';
    if (requirement !== null) {
      const population = policy.population > 0 ? ` · ${policy.population} abitanti` : '';
      requirement.textContent = policy.active ? 'Seleziona per disattivare' : `${policy.cost} fondi${population}`;
    }
  }

  private paintSelection(): void {
    this.catalystButtons.forEach((button, index) => {
      const active = this.selected.kind === 'catalyst' && this.selected.class === index;
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
  cost.textContent = `${action.cost} fondi`;
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
  button.dataset.tooltip = action.reason;
  button.title = action.reason;
}

function divider(): HTMLElement {
  const element = document.createElement('span');
  element.className = 'dock-divider';
  element.setAttribute('aria-hidden', 'true');
  return element;
}
