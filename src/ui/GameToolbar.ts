import { BALANCE, CLASS_NAMES, POLICIES, type BuildingClass, type PolicyId } from '../sim';
import type { ActionFailure } from '../game/actions';
import type { GrowthStats } from '../game/growthScene';

export type GameTool =
  | { readonly kind: 'catalyst'; readonly class: BuildingClass }
  | { readonly kind: 'expansion' }
  | { readonly kind: 'none' };

export interface GameToolbarHandlers {
  readonly onTool: (tool: GameTool) => void;
  readonly onPolicy: (id: PolicyId) => void;
  readonly onPause: (paused: boolean) => void;
  readonly onSpeed: (speed: number) => void;
}

const FAILURE_LABEL: Readonly<Record<ActionFailure, string>> = {
  'terrain-loading': 'Il terreno non è ancora pronto.',
  'not-buildable': 'Questa colonna non è edificabile.',
  'too-close': 'Troppo vicino a un catalizzatore dello stesso tipo.',
  'insufficient-funds': 'Fondi insufficienti.',
  'population-required': 'Popolazione insufficiente.',
  'already-active': 'Azione già attiva.',
};

export class GameToolbar {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly resources: HTMLDivElement;
  private readonly toolButtons: HTMLButtonElement[] = [];
  private readonly policyButtons = new Map<PolicyId, HTMLButtonElement>();
  private selected: GameTool = { kind: 'none' };
  private lastPaint = 0;

  constructor(parent: HTMLElement, handlers: GameToolbarHandlers) {
    this.root = document.createElement('div');
    this.root.style.cssText = [
      'position:fixed', 'left:16px', 'bottom:16px', 'z-index:20', 'width:min(680px,calc(100vw - 32px))',
      'padding:12px', 'box-sizing:border-box', 'border:1px solid rgba(255,255,255,.2)',
      'border-radius:10px', 'background:rgba(9,16,24,.86)', 'backdrop-filter:blur(8px)',
      'color:#edf6f4', 'font:12px/1.35 system-ui,sans-serif', 'box-shadow:0 12px 40px rgba(0,0,0,.28)',
    ].join(';');

    this.resources = document.createElement('div');
    this.resources.style.cssText = 'font-weight:700;margin-bottom:9px;letter-spacing:.02em';
    this.root.appendChild(this.resources);

    const tools = row();
    for (let cls = 0; cls < CLASS_NAMES.length; cls++) {
      const cost = BALANCE.gameplay.catalyst.cost[cls];
      const button = actionButton(`+ ${CLASS_NAMES[cls]} · ${cost}`, () => {
        this.selected = { kind: 'catalyst', class: cls as BuildingClass };
        handlers.onTool(this.selected);
        this.refreshTools();
      });
      this.toolButtons.push(button);
      tools.appendChild(button);
    }
    const expansion = actionButton(`Espandi · ${BALANCE.gameplay.expansion.cost}`, () => {
      this.selected = { kind: 'expansion' };
      handlers.onTool(this.selected);
      this.refreshTools();
    });
    this.toolButtons.push(expansion);
    tools.appendChild(expansion);
    this.root.appendChild(tools);

    const policies = row();
    for (const policy of POLICIES) {
      const requirement = BALANCE.gameplay.policy[policy.id];
      const button = actionButton(`${policy.label} · ${requirement.cost}`, () => handlers.onPolicy(policy.id));
      this.policyButtons.set(policy.id, button);
      policies.appendChild(button);
    }
    this.root.appendChild(policies);

    const time = row();
    time.appendChild(actionButton('Pausa', () => handlers.onPause(true)));
    time.appendChild(actionButton('▶', () => handlers.onPause(false)));
    for (const speed of [1, 2, 4]) time.appendChild(actionButton(`${speed}×`, () => handlers.onSpeed(speed)));
    this.root.appendChild(time);

    this.status = document.createElement('div');
    this.status.style.cssText = 'min-height:1.35em;margin-top:7px;color:#b9d9d2';
    this.root.appendChild(this.status);
    parent.appendChild(this.root);
  }

  needsPaint(now: number): boolean {
    return now - this.lastPaint >= 150;
  }

  update(stats: GrowthStats, now: number): void {
    this.lastPaint = now;
    const state = stats.state;
    this.resources.textContent = [
      `Fondi ${Math.floor(state.funds.stock)}`,
      `Pop ${Math.floor(state.population.stock)}`,
      `Cibo ${Math.floor(state.food.stock)}`,
      `Materiali ${Math.floor(state.materials.stock)}`,
      `Felicità ${Math.round(state.satisfaction * 100)}%`,
      stats.paused ? 'IN PAUSA' : `${stats.speed}×`,
    ].join('  ·  ');
    this.status.textContent = stats.message;
    for (const [id, button] of this.policyButtons) {
      button.dataset.active = state.policies.includes(id) ? '1' : '0';
      paintButton(button);
    }
  }

  showFailure(reason: ActionFailure): void {
    this.status.textContent = FAILURE_LABEL[reason];
  }

  private refreshTools(): void {
    this.toolButtons.forEach((button, index) => {
      const active = this.selected.kind === 'catalyst'
        ? index === this.selected.class
        : this.selected.kind === 'expansion' && index === this.toolButtons.length - 1;
      button.dataset.active = active ? '1' : '0';
      paintButton(button);
    });
  }
}

function row(): HTMLDivElement {
  const element = document.createElement('div');
  element.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
  return element;
}

function actionButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  button.dataset.active = '0';
  paintButton(button);
  return button;
}

function paintButton(button: HTMLButtonElement): void {
  const active = button.dataset.active === '1';
  button.style.cssText = [
    'border:1px solid rgba(255,255,255,.22)', 'border-radius:6px', 'padding:6px 9px',
    `background:${active ? '#d8b45b' : 'rgba(255,255,255,.07)'}`,
    `color:${active ? '#16202a' : '#edf6f4'}`, 'cursor:pointer', 'font:inherit',
  ].join(';');
}
