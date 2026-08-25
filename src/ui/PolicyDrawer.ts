import type { PolicyId, TradeMode } from '../sim';
import type { GameHudModel, HudCommerce, HudPolicy, HudTradeMode } from './GameHudModel';
import { iconButton } from './hudWidgets';

/**
 * Il pannello di governo: politiche, commercio interno, commercio esterno.
 *
 * Esce da `GameHud.ts` per la ragione di `AGENTS.md` — quel file e' oltre il
 * budget e il semaforo prende il lock per path — ma soprattutto perche' ne
 * cambia la **forma**. Le tre sezioni stavano incolonnate dentro un unico
 * riquadro che scorreva tutto insieme, intestazione compresa: per leggere il
 * commercio esterno si scendeva oltre sette schede di policy, e arrivati la'
 * la croce per chiudere era rimasta fuori schermo. Nessuna delle due cose si
 * risolve spostando un `overflow` senza decidere *cosa* scorre.
 *
 * Qui scorre solo il corpo della linguetta aperta. L'intestazione e le tre
 * linguette stanno ferme, e le tre sezioni non si sommano piu' in altezza:
 * sono tre risposte a tre domande diverse, e si guarda quella che si sta
 * facendo.
 */

export type PolicyTab = 'policies' | 'commerce' | 'trade';

/** I nomi delle linguette. Corti: sono etichette, non frasi. */
const TAB_LABELS: Readonly<Record<PolicyTab, string>> = {
  policies: 'Policies',
  commerce: 'Commerce',
  trade: 'Trade',
};

const TABS: readonly PolicyTab[] = ['policies', 'commerce', 'trade'];

export interface PolicyDrawerHandlers {
  readonly onPolicy: (id: PolicyId) => void;
  readonly onTrade: (mode: TradeMode) => void;
  readonly onClose: () => void;
}

export class PolicyDrawer {
  readonly root: HTMLElement;

  private readonly tabs = new Map<PolicyTab, HTMLButtonElement>();
  private readonly bodies = new Map<PolicyTab, HTMLElement>();
  private readonly policyButtons = new Map<PolicyId, HTMLButtonElement>();
  private readonly tradeButtons = new Map<TradeMode, HTMLButtonElement>();
  private readonly commercePanel = document.createElement('div');
  private readonly tradeNote = document.createElement('p');
  private active: PolicyTab = 'policies';

  constructor(model: GameHudModel, private readonly handlers: PolicyDrawerHandlers) {
    this.root = document.createElement('aside');
    this.root.className = 'policy-drawer hud-surface hud-surface--panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'City policies');

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
    const close = iconButton('close', 'Close policies · Esc', () => this.handlers.onClose());
    close.classList.add('hud-button--small');
    header.append(copy, close);

    const tabs = document.createElement('div');
    tabs.className = 'drawer-tabs';
    tabs.setAttribute('role', 'tablist');
    for (const id of TABS) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'drawer-tab';
      tab.id = `policy-tab-${id}`;
      tab.textContent = TAB_LABELS[id];
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `policy-body-${id}`);
      tab.addEventListener('click', () => this.select(id));
      this.tabs.set(id, tab);
      tabs.appendChild(tab);

      const body = document.createElement('div');
      body.className = 'drawer-body';
      body.id = `policy-body-${id}`;
      body.setAttribute('role', 'tabpanel');
      body.setAttribute('aria-labelledby', tab.id);
      body.hidden = id !== this.active;
      this.bodies.set(id, body);
    }

    this.fillPolicies(model.policies);
    this.fillCommerce();
    this.fillTrade(model.tradeModes);

    this.root.append(header, tabs, ...this.bodies.values());
    this.select(this.active);
  }

  get hidden(): boolean {
    return this.root.hidden;
  }

  set hidden(value: boolean) {
    this.root.hidden = value;
  }

  paint(model: GameHudModel): void {
    for (const policy of model.policies) this.paintPolicy(policy);
    this.paintCommerce(model.commerce);
    for (const mode of model.tradeModes) this.paintTradeMode(mode, model.tradeConnected);
    this.tradeNote.hidden = model.tradeConnected;
  }

  private select(id: PolicyTab): void {
    this.active = id;
    for (const [other, tab] of this.tabs) {
      const open = other === id;
      tab.setAttribute('aria-selected', open ? 'true' : 'false');
      tab.dataset['active'] = open ? 'true' : 'false';
      const body = this.bodies.get(other);
      if (body !== undefined) body.hidden = !open;
    }
  }

  private fillPolicies(policies: readonly HudPolicy[]): void {
    const body = this.bodies.get('policies');
    if (body === undefined) return;
    const list = document.createElement('div');
    list.className = 'policy-list';
    for (const policy of policies) {
      const button = this.createPolicyButton(policy);
      this.policyButtons.set(policy.id, button);
      list.appendChild(button);
    }
    body.appendChild(list);
  }

  private fillCommerce(): void {
    const body = this.bodies.get('commerce');
    if (body === undefined) return;
    // Il commercio interno e quello esterno restano due linguette vicine, non
    // due pannelli: competono per gli stessi materiali, e chi guarda l'uno sta
    // per guardare l'altro.
    this.commercePanel.className = 'commerce-panel';
    body.appendChild(this.commercePanel);
  }

  private fillTrade(modes: readonly HudTradeMode[]): void {
    const body = this.bodies.get('trade');
    if (body === undefined) return;
    // Il motivo per cui le tre schede sono spente sta **scritto**, non nel
    // `title`: un elenco disabilitato senza spiegazione visibile e' il modo piu'
    // veloce per far credere che il pannello sia rotto.
    this.tradeNote.className = 'drawer-note';
    this.tradeNote.textContent = 'Build a Port or an Airport to unlock external trade.';
    const list = document.createElement('div');
    list.className = 'trade-list';
    for (const mode of modes) {
      const button = this.createTradeButton(mode);
      this.tradeButtons.set(mode.id, button);
      list.appendChild(button);
    }
    body.append(this.tradeNote, list);
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

  /**
   * Il ciclo commerciale in quattro numeri e una frase.
   *
   * "Servita" e "pieni" sono due cose diverse e vanno mostrate insieme: la prima
   * dice se la citta' trova cio' che cerca, la seconda se i negozi che ha
   * costruito servono a qualcosa. Con un solo numero, "troppi negozi" e "pochi
   * negozi" si leggerebbero uguale.
   */
  private paintCommerce(commerce: HudCommerce | null): void {
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
}
