import type { PolicyId, TradeMode } from '../sim';
import type { GameHudModel, HudCommerce, HudPolicy, HudTradeMode } from './GameHudModel';
import type { CityOverviewModel, OverviewFact, OverviewGoal } from './CityOverviewModel';
import { createHudIcon } from './hudIcons';
import { iconButton } from './hudWidgets';

/**
 * Il pannello di governo: stato della citta', scelte e memoria.
 *
 * Esce da `GameHud.ts` per la ragione di `AGENTS.md` — quel file e' oltre il
 * budget e il semaforo prende il lock per path — ma soprattutto perche' ne
 * cambia la **forma**. Le sezioni stavano incolonnate dentro un unico
 * riquadro che scorreva tutto insieme, intestazione compresa: per leggere il
 * commercio esterno si scendeva oltre sette schede di policy, e arrivati la'
 * la croce per chiudere era rimasta fuori schermo. Nessuna delle due cose si
 * risolve spostando un `overflow` senza decidere *cosa* scorre.
 *
 * Qui scorre solo il corpo della linguetta aperta. Intestazione e linguette
 * stanno ferme, e la panoramica sta **tutta in vista** senza nascondersi dietro
 * una fisarmonica: ogni sezione e' un'intestazione con le sue cifre in una
 * griglia a due colonne, etichetta sopra e valore sotto, cosi' si legge a colpo
 * d'occhio invece di aprire una riga alla volta. Le altre linguette dicono cosa
 * li sta modificando e cosa e' successo.
 */

export type PolicyTab = 'city' | 'policies' | 'commerce' | 'trade' | 'history';

/** I nomi delle linguette. Corti: sono etichette, non frasi. */
const TAB_LABELS: Readonly<Record<PolicyTab, string>> = {
  city: 'City',
  policies: 'Policies',
  commerce: 'Commerce',
  trade: 'Trade',
  history: 'History',
};

const TABS: readonly PolicyTab[] = ['city', 'policies', 'commerce', 'trade', 'history'];

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
  private readonly overviewPanel = document.createElement('div');
  private readonly commercePanel = document.createElement('div');
  private readonly tradeReportPanel = document.createElement('div');
  private readonly historyPanel = document.createElement('div');
  private readonly tradeNote = document.createElement('p');
  private latestModel: GameHudModel;
  private active: PolicyTab = 'city';
  private collapsed = false;

  constructor(model: GameHudModel, private readonly handlers: PolicyDrawerHandlers) {
    this.latestModel = model;
    this.root = document.createElement('aside');
    this.root.className = 'policy-drawer hud-surface hud-surface--panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'City information and policies');

    const collapsedHandle = document.createElement('button');
    collapsedHandle.type = 'button';
    collapsedHandle.className = 'drawer-collapsed-handle';
    collapsedHandle.setAttribute('aria-label', 'Expand city overview');
    collapsedHandle.setAttribute('aria-expanded', 'false');
    const collapsedLabel = document.createElement('span');
    collapsedLabel.textContent = 'City overview';
    collapsedHandle.append(createHudIcon('policies'), collapsedLabel);
    collapsedHandle.addEventListener('click', () => this.setCollapsed(false));

    const header = document.createElement('header');
    header.className = 'drawer-header';
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'drawer-title';
    title.textContent = 'City overview';
    const subtitle = document.createElement('p');
    subtitle.className = 'drawer-subtitle';
    subtitle.textContent = 'Read the whole city, then shape how it grows.';
    copy.append(title, subtitle);
    const actions = document.createElement('div');
    actions.className = 'drawer-header-actions';
    const minimize = document.createElement('button');
    minimize.type = 'button';
    minimize.className = 'drawer-window-button drawer-minimize';
    minimize.setAttribute('aria-label', 'Minimize city overview');
    minimize.setAttribute('aria-expanded', 'true');
    const minimizeMark = document.createElement('span');
    minimizeMark.setAttribute('aria-hidden', 'true');
    minimizeMark.textContent = '›';
    minimize.appendChild(minimizeMark);
    minimize.addEventListener('click', () => this.setCollapsed(true));
    const close = iconButton('close', 'Close city overview · Esc', () => this.handlers.onClose());
    close.classList.add('hud-button--small');
    actions.append(minimize, close);
    header.append(copy, actions);

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
      tab.addEventListener('keydown', (event) => this.moveTab(event, id));
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

    this.fillOverview();
    this.fillPolicies(model.policies);
    this.fillCommerce();
    this.fillTrade(model.tradeModes);
    this.fillHistory();

    this.root.append(collapsedHandle, header, tabs, ...this.bodies.values());
    this.select(this.active);
  }

  get hidden(): boolean {
    return this.root.hidden;
  }

  set hidden(value: boolean) {
    this.root.hidden = value;
    if (!value) {
      this.setCollapsed(false);
      this.paint(this.latestModel);
    }
  }

  paint(model: GameHudModel): void {
    this.latestModel = model;
    // Da chiuso basta conservare l'ultimo stato. Ricostruire decine di nodi sei
    // volte al secondo per un cassetto invisibile sarebbe lavoro di frame puro.
    if (this.root.hidden || this.collapsed) return;
    this.paintOverview(model.overview);
    for (const policy of model.policies) this.paintPolicy(policy);
    this.paintCommerce(model.commerce);
    this.paintTradeReport(model.overview);
    for (const mode of model.tradeModes) this.paintTradeMode(mode, model.tradeConnected);
    this.tradeNote.hidden = model.tradeConnected;
    this.paintHistory(model.overview);
  }

  private select(id: PolicyTab): void {
    this.active = id;
    for (const [other, tab] of this.tabs) {
      const open = other === id;
      tab.setAttribute('aria-selected', open ? 'true' : 'false');
      tab.tabIndex = open ? 0 : -1;
      tab.dataset['active'] = open ? 'true' : 'false';
      const body = this.bodies.get(other);
      if (body !== undefined) body.hidden = !open;
    }
  }

  /** Riduce il cassetto a una maniglia sul bordo senza confonderlo con chiuso. */
  private setCollapsed(value: boolean): void {
    if (this.collapsed === value) return;
    this.collapsed = value;
    this.root.dataset['collapsed'] = value ? 'true' : 'false';
    const handle = this.root.querySelector<HTMLButtonElement>('.drawer-collapsed-handle');
    handle?.setAttribute('aria-expanded', value ? 'false' : 'true');
    this.root.querySelector<HTMLButtonElement>('.drawer-minimize')
      ?.setAttribute('aria-expanded', value ? 'false' : 'true');
    if (!value) this.paint(this.latestModel);
  }

  /** Frecce e Home/End seguono il pattern ARIA senza uscire dal cassetto. */
  private moveTab(event: KeyboardEvent, current: PolicyTab): void {
    const index = TABS.indexOf(current);
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? TABS[(index + 1) % TABS.length]
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? TABS[(index - 1 + TABS.length) % TABS.length]
        : event.key === 'Home'
          ? TABS[0]
          : event.key === 'End' ? TABS[TABS.length - 1] : undefined;
    if (next === undefined) return;
    event.preventDefault();
    this.select(next);
    this.tabs.get(next)?.focus();
  }

  private fillOverview(): void {
    const body = this.bodies.get('city');
    if (body === undefined) return;
    this.overviewPanel.className = 'city-overview';
    body.appendChild(this.overviewPanel);
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
    this.tradeReportPanel.className = 'trade-report';
    body.append(this.tradeReportPanel, this.tradeNote, list);
  }

  private fillHistory(): void {
    const body = this.bodies.get('history');
    if (body === undefined) return;
    this.historyPanel.className = 'history-panel';
    body.appendChild(this.historyPanel);
  }

  private paintOverview(overview: CityOverviewModel | null): void {
    if (overview === null) {
      this.overviewPanel.replaceChildren(note('The city is getting ready.'));
      return;
    }

    const condition = document.createElement('section');
    condition.className = 'overview-condition';
    condition.dataset.tone = overview.condition.tone;
    const title = document.createElement('strong');
    title.textContent = overview.condition.title;
    const message = document.createElement('span');
    message.textContent = overview.condition.message;
    condition.append(title, message);

    this.overviewPanel.replaceChildren(
      condition,
      overviewSection('Self-sufficiency', goalRows(overview.goals)),
      overviewSection('Capacity', factRows(overview.capacity)),
      overviewSection('Economy', factRows(overview.economy)),
      overviewSection('City shape', factRows(overview.shape)),
      overviewSection('Infrastructure', factRows(overview.infrastructure)),
    );
  }

  private paintTradeReport(overview: CityOverviewModel | null): void {
    if (overview === null) {
      this.tradeReportPanel.replaceChildren();
      return;
    }
    const report = overview.trade;
    const links = report.links.length === 0 ? 'None' : report.links.join(' · ');
    this.tradeReportPanel.replaceChildren(
      sectionTitle('Last tick'),
      factRows([
        { label: 'Connections', value: links },
        { label: 'Food imported', value: `${report.food.toFixed(1)} / tick` },
        { label: 'Materials exported', value: `${report.materials.toFixed(1)} / tick` },
        {
          label: 'Trade balance',
          value: `${report.funds > 0 ? '+' : ''}${report.funds.toFixed(1)} funds / tick`,
          tone: report.funds >= 0 ? 'positive' : 'warning',
        },
      ]),
    );
  }

  private paintHistory(overview: CityOverviewModel | null): void {
    if (overview === null) {
      this.historyPanel.replaceChildren(note('The city is getting ready.'));
      return;
    }
    const mandates = document.createElement('div');
    mandates.className = 'mandate-list';
    if (overview.mandates.length === 0) {
      mandates.appendChild(note('No standing mandates. Decisions that reshape districts will appear here.'));
    } else {
      for (const mandate of overview.mandates) {
        const item = document.createElement('article');
        item.className = 'mandate-item';
        const head = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = mandate.label;
        const family = document.createElement('span');
        family.textContent = mandate.family;
        head.append(name, family);
        const effect = document.createElement('p');
        effect.textContent = mandate.effect;
        item.append(head, effect);
        mandates.appendChild(item);
      }
    }

    const decisions = document.createElement('div');
    decisions.className = 'decision-history';
    if (overview.history.length === 0) {
      decisions.appendChild(note('No decisions have been resolved yet.'));
    } else {
      for (const decision of overview.history) {
        const row = document.createElement('div');
        const tick = document.createElement('span');
        tick.textContent = `Tick ${decision.tick}`;
        const summary = document.createElement('strong');
        summary.textContent = decision.summary;
        row.append(tick, summary);
        decisions.appendChild(row);
      }
    }

    this.historyPanel.replaceChildren(
      sectionTitle('Standing mandates'),
      mandates,
      sectionTitle('Recent decisions'),
      decisions,
    );
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

function overviewSection(title: string, content: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  section.className = 'overview-section';
  const heading = document.createElement('h3');
  heading.className = 'overview-section-title';
  heading.textContent = title;
  section.append(heading, content);
  return section;
}

function goalRows(goals: readonly OverviewGoal[]): HTMLElement {
  const rows = document.createElement('div');
  rows.className = 'goal-list';
  for (const goal of goals) {
    const row = document.createElement('div');
    row.className = 'goal-row';
    row.dataset.met = goal.met ? 'true' : 'false';
    const label = document.createElement('span');
    label.textContent = goal.label;
    const value = document.createElement('strong');
    value.textContent = goal.value;
    const track = document.createElement('span');
    track.className = 'goal-track';
    const fill = document.createElement('span');
    fill.className = 'goal-fill';
    fill.style.width = `${Math.round(goal.progress * 100)}%`;
    track.appendChild(fill);
    row.append(label, value, track);
    rows.appendChild(row);
  }
  return rows;
}

function factRows(facts: readonly OverviewFact[]): HTMLElement {
  const rows = document.createElement('div');
  rows.className = 'overview-facts';
  for (const fact of facts) {
    const row = document.createElement('div');
    row.className = 'overview-fact';
    row.dataset.tone = fact.tone ?? 'neutral';
    const label = document.createElement('span');
    label.textContent = fact.label;
    const value = document.createElement('strong');
    value.textContent = fact.value;
    row.append(label, value);
    if (fact.note !== undefined) {
      const detail = document.createElement('small');
      detail.textContent = fact.note;
      row.appendChild(detail);
    }
    rows.appendChild(row);
  }
  return rows;
}

function sectionTitle(value: string): HTMLElement {
  const title = document.createElement('h3');
  title.className = 'drawer-section-title';
  title.textContent = value;
  return title;
}

function note(value: string): HTMLElement {
  const message = document.createElement('p');
  message.className = 'drawer-note';
  message.textContent = value;
  return message;
}
