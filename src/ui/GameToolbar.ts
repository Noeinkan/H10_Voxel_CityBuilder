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
  private feedback: string | null = null;

  constructor(parent: HTMLElement, handlers: GameToolbarHandlers) {
    this.root = document.createElement('div');
    this.root.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:12px', 'z-index:20', 'transform:translateX(-50%)',
      'width:min(920px,calc(100vw - 24px))', 'padding:10px 12px', 'box-sizing:border-box',
      'border:1px solid rgba(185,217,210,.24)', 'border-radius:14px',
      'background:linear-gradient(135deg,rgba(15,26,33,.94),rgba(20,31,38,.9))',
      'backdrop-filter:blur(12px)', 'color:#edf6f4', 'font:11px/1.3 system-ui,sans-serif',
      'box-shadow:0 16px 48px rgba(0,0,0,.34)',
    ].join(';');

    this.resources = document.createElement('div');
    this.resources.style.cssText = [
      'padding:6px 9px', 'margin-bottom:8px', 'border-radius:8px',
      'background:rgba(185,217,210,.08)', 'color:#f5fbf9',
      'font-weight:700', 'letter-spacing:.015em', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
    ].join(';');
    this.root.appendChild(this.resources);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px';

    const tools = row();
    for (let cls = 0; cls < CLASS_NAMES.length; cls++) {
      const cost = BALANCE.gameplay.catalyst.cost[cls];
      const button = actionButton(`+ ${CLASS_NAMES[cls]} · ${cost}`, () => {
        this.feedback = null;
        this.selected = { kind: 'catalyst', class: cls as BuildingClass };
        handlers.onTool(this.selected);
        this.refreshTools();
      });
      this.toolButtons.push(button);
      tools.appendChild(button);
    }
    const expansion = actionButton(`Espandi · ${BALANCE.gameplay.expansion.cost}`, () => {
      this.feedback = null;
      this.selected = { kind: 'expansion' };
      handlers.onTool(this.selected);
      this.refreshTools();
    });
    this.toolButtons.push(expansion);
    tools.appendChild(expansion);
    actions.appendChild(group('COSTRUISCI', tools));

    const policies = row();
    for (const policy of POLICIES) {
      const requirement = BALANCE.gameplay.policy[policy.id];
      const button = actionButton(`${policy.label} · ${requirement.cost}`, () => handlers.onPolicy(policy.id));
      this.policyButtons.set(policy.id, button);
      policies.appendChild(button);
    }
    actions.appendChild(group('POLITICHE', policies));

    const time = row();
    time.appendChild(actionButton('Pausa', () => handlers.onPause(true)));
    time.appendChild(actionButton('▶', () => handlers.onPause(false)));
    for (const speed of [1, 2, 4]) time.appendChild(actionButton(`${speed}×`, () => handlers.onSpeed(speed)));
    actions.appendChild(group('TEMPO', time));
    this.root.appendChild(actions);

    this.status = document.createElement('div');
    this.status.style.cssText = 'min-height:1.3em;margin-top:7px;padding-left:2px;color:#b9d9d2';
    this.root.appendChild(this.status);
    parent.appendChild(this.root);

    const publishHeight = (): void => {
      document.documentElement.style.setProperty('--game-hud-bottom', `${this.root.offsetHeight + 24}px`);
    };
    new ResizeObserver(publishHeight).observe(this.root);
    requestAnimationFrame(publishHeight);
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
    this.status.textContent = this.feedback ?? stats.message;
    for (const [id, button] of this.policyButtons) {
      button.dataset.active = state.policies.includes(id) ? '1' : '0';
      paintButton(button);
    }
  }

  showFailure(reason: ActionFailure): void {
    this.feedback = FAILURE_LABEL[reason];
    this.status.textContent = this.feedback;
  }

  showPickingFailure(): void {
    this.feedback = 'Nessuna superficie selezionabile in questo punto.';
    this.status.textContent = this.feedback;
  }

  clearFeedback(): void {
    this.feedback = null;
  }

  setTool(tool: GameTool): void {
    this.feedback = null;
    this.selected = tool;
    this.refreshTools();
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
  element.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap';
  return element;
}

function group(label: string, contents: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  const title = document.createElement('div');
  title.textContent = label;
  title.style.cssText = 'margin:0 0 5px 2px;color:#8fb8af;font-size:9px;font-weight:800;letter-spacing:.13em';
  section.append(title, contents);
  return section;
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
    'border:1px solid rgba(185,217,210,.24)', 'border-radius:7px', 'padding:5px 8px',
    `background:${active ? '#d8b45b' : 'rgba(255,255,255,.055)'}`,
    `color:${active ? '#16202a' : '#edf6f4'}`, 'cursor:pointer', 'font:inherit',
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.04)',
  ].join(';');
}
