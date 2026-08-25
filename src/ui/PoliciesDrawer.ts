import type { PolicyId, TradeMode } from '../sim';
import type { GameHudModel, HudPolicy, HudTradeMode } from './GameHudModel';
import { drawerHeader, sectionTitle } from './drawerBits';

/**
 * Il cassetto di governo: **solo azioni**, niente letture.
 *
 * E' l'altra meta' del vecchio cassetto a cinque linguette. Le policy e le
 * rotte commerciali sono le due cose che il giocatore **fa**, non che guarda:
 * qui stanno insieme e si toccano, mentre la dashboard accanto resta pura. Due
 * sezioni corte, senza linguette — si scorre e basta, e ogni scheda porta il
 * prezzo, il mantenimento e perche' e' bloccata quando lo e'.
 */

export interface PoliciesDrawerHandlers {
  readonly onPolicy: (id: PolicyId) => void;
  readonly onTrade: (mode: TradeMode) => void;
  readonly onClose: () => void;
}

export class PoliciesDrawer {
  readonly root: HTMLElement;

  private readonly body: HTMLElement;
  private readonly policyButtons = new Map<PolicyId, HTMLButtonElement>();
  private readonly tradeButtons = new Map<TradeMode, HTMLButtonElement>();
  private readonly tradeNote = document.createElement('p');
  private latestModel: GameHudModel;

  constructor(model: GameHudModel, private readonly handlers: PoliciesDrawerHandlers) {
    this.latestModel = model;
    this.root = document.createElement('aside');
    this.root.className = 'policies-drawer hud-surface hud-surface--panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Policies and trade');

    this.root.appendChild(drawerHeader({
      title: 'Policies',
      subtitle: 'Shape how the city grows, and who it trades with.',
      closeLabel: 'Close policies · Esc',
      onClose: () => handlers.onClose(),
    }));

    this.body = document.createElement('div');
    this.body.className = 'drawer-body';

    this.body.appendChild(sectionTitle('Policies'));
    const policyList = document.createElement('div');
    policyList.className = 'policy-list';
    for (const policy of model.policies) {
      const button = this.createPolicyButton(policy);
      this.policyButtons.set(policy.id, button);
      policyList.appendChild(button);
    }
    this.body.appendChild(policyList);

    this.body.appendChild(sectionTitle('Trade routes'));
    // Il motivo per cui le tre schede sono spente sta **scritto**, non nel
    // `title`: un elenco disabilitato senza spiegazione visibile e' il modo piu'
    // veloce per far credere che il pannello sia rotto.
    this.tradeNote.className = 'drawer-note';
    this.tradeNote.textContent = 'Build a Port or an Airport to unlock external trade.';
    const tradeList = document.createElement('div');
    tradeList.className = 'trade-list';
    for (const mode of model.tradeModes) {
      const button = this.createTradeButton(mode);
      this.tradeButtons.set(mode.id, button);
      tradeList.appendChild(button);
    }
    this.body.append(this.tradeNote, tradeList);

    this.root.appendChild(this.body);
  }

  get hidden(): boolean {
    return this.root.hidden;
  }

  set hidden(value: boolean) {
    this.root.hidden = value;
    if (!value) this.paint(this.latestModel);
  }

  paint(model: GameHudModel): void {
    this.latestModel = model;
    if (this.root.hidden) return;
    for (const policy of model.policies) this.paintPolicy(policy);
    for (const mode of model.tradeModes) this.paintTradeMode(mode, model.tradeConnected);
    this.tradeNote.hidden = model.tradeConnected;
  }

  private createPolicyButton(policy: HudPolicy): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'policy-card';
    button.addEventListener('click', () => this.handlers.onPolicy(policy.id));
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
   * Prezzo, mantenimento e ostacolo sono tre cose e non un elenco puntato.
   *
   * La riga diceva `120 funds · 48 residents · 2.0 funds/tick`: tre numeri con lo
   * stesso peso, di cui uno e' una spesa una tantum, uno una **condizione** e uno
   * una spesa per sempre. Chi non poteva permettersela leggeva comunque il
   * listino, e il motivo del blocco stava solo nel `title`. Ora il listino
   * compare quando si puo' comprare, e al suo posto — dove non si puo' — c'e' la
   * frase che dice cosa manca.
   */
  private paintPolicy(policy: HudPolicy): void {
    const button = this.policyButtons.get(policy.id);
    if (button === undefined) return;
    button.disabled = !policy.available;
    button.setAttribute('aria-pressed', policy.active ? 'true' : 'false');
    // Dove agisce: e' la seconda frase, e sta qui invece che sulla scheda.
    button.title = policy.effect;
    const state = button.querySelector<HTMLElement>('.policy-state');
    const requirement = button.querySelector<HTMLElement>('.policy-requirement');
    if (state !== null) state.textContent = policy.active ? 'ACTIVE' : '';
    if (requirement === null) return;
    const blocked = !policy.available && !policy.active;
    requirement.dataset['blocked'] = blocked ? 'true' : 'false';
    requirement.textContent = blocked
      ? policy.reason
      : policy.active
        ? `Upkeep ${policy.upkeep.toFixed(1)} funds/tick · select to stop it`
        : `${policy.cost} funds now, then ${policy.upkeep.toFixed(1)} funds/tick`;
  }

  private paintTradeMode(mode: HudTradeMode, connected: boolean): void {
    const button = this.tradeButtons.get(mode.id);
    if (button === undefined) return;
    button.disabled = !mode.available;
    button.setAttribute('aria-pressed', mode.active ? 'true' : 'false');
    button.title = connected ? mode.description : '';
  }
}
