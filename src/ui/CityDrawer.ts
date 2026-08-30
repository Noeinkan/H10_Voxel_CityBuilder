import type { CityOverviewModel, OverviewTrade } from './CityOverviewModel';
import { decisionMark, type GameHudModel, type HudCommerce } from './GameHudModel';
import type { CharterId, CityDecision } from '../sim';
import { drawerHeader, factRows, goalRows, note, overviewSection, sectionTitle } from './drawerBits';

/**
 * La dashboard della citta': lettura della condizione e delle scelte.
 *
 * E' la meta' che il vecchio cassetto a cinque linguette teneva mescolata
 * all'altra: leggere come sta la citta' e cambiare le regole con cui cresce
 * erano due intenzioni dentro la stessa superficie. Qui scorrono condizione,
 * traguardi, capacita', economia, commercio, scambi, forma, infrastrutture e
 * storia in una colonna sola, con la condizione in testa e la storia in fondo.
 *
 * **Unica eccezione al solo-lettura: la decisione in attesa.** Quando c'e' una
 * scelta aperta, la sua casella compare in cima — e' l'inbox del consiglio, il
 * posto dove la carta rimandata torna a farsi trovare — con le alternative
 * cliccabili e il «decidi piu' tardi». Il resto della dashboard si guarda.
 */

export interface CityDrawerHandlers {
  readonly onClose: () => void;
  readonly onDecision: (optionId: string) => void;
  readonly onSnooze: () => void;
}

export class CityDrawer {
  readonly root: HTMLElement;

  private readonly body: HTMLElement;
  private readonly handlers: CityDrawerHandlers;
  private latestModel: GameHudModel;

  constructor(model: GameHudModel, handlers: CityDrawerHandlers) {
    this.latestModel = model;
    this.handlers = handlers;
    this.root = document.createElement('aside');
    this.root.className = 'city-drawer hud-surface hud-surface--panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'City dashboard');

    this.root.appendChild(drawerHeader({
      title: 'City',
      subtitle: 'Read the whole city at a glance.',
      closeLabel: 'Close city dashboard · Esc',
      onClose: () => handlers.onClose(),
    }));

    this.body = document.createElement('div');
    this.body.className = 'drawer-body';
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
    // Da chiusa la dashboard non si ridisegna: ricostruire decine di nodi sei
    // volte al secondo per un cassetto invisibile e' lavoro di frame puro.
    if (this.root.hidden) return;
    this.paintOverview(model.overview, model.commerce, model.decision, model.decisionActiveCharter);
  }

  private paintOverview(
    overview: CityOverviewModel | null,
    commerce: HudCommerce | null,
    pending: CityDecision | null,
    activeCharter: CharterId | null,
  ): void {
    if (overview === null) {
      this.body.replaceChildren(note('The city is getting ready.'));
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

    const sections: HTMLElement[] = [];
    if (pending !== null) sections.push(this.pendingSection(pending, activeCharter));
    sections.push(
      condition,
      overviewSection('Goals', goalRows(overview.goals)),
      overviewSection('Capacity', factRows(overview.capacity)),
      overviewSection('Economy', factRows(overview.economy)),
    );
    if (commerce !== null) sections.push(overviewSection('Commerce', commerceRows(commerce)));
    sections.push(
      overviewSection('Trade', tradeRows(overview.trade)),
      overviewSection('City shape', factRows(overview.shape)),
      overviewSection('Infrastructure', factRows(overview.infrastructure)),
      overviewSection('Arcologies', arcologyRows(overview.arcology)),
      overviewSection('History', historyRows(overview)),
    );

    this.body.replaceChildren(...sections);
  }

  /** L'inbox del consiglio: la decisione in attesa, con le sue alternative. */
  private pendingSection(decision: CityDecision, activeCharter: CharterId | null): HTMLElement {
    const section = document.createElement('section');
    section.className = 'overview-section decision-inbox';
    section.appendChild(sectionTitle('Decision awaits'));

    const title = document.createElement('strong');
    title.className = 'decision-inbox-title';
    title.textContent = decision.title;
    const message = document.createElement('p');
    message.className = 'decision-inbox-message';
    message.textContent = decision.message;
    section.append(title, message);

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
      const mark = decisionMark(option, activeCharter);
      if (mark !== null) {
        const consequence = document.createElement('span');
        consequence.className = 'decision-mark';
        consequence.textContent = mark;
        button.appendChild(consequence);
      }
      button.addEventListener('click', () => this.handlers.onDecision(option.id));
      options.appendChild(button);
    }
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'decision-later';
    later.textContent = 'Decide later';
    later.addEventListener('click', () => this.handlers.onSnooze());
    options.appendChild(later);
    section.appendChild(options);
    return section;
  }
}

/**
 * Il ciclo commerciale in quattro numeri e una frase.
 *
 * "Servita" e "pieni" sono due cose diverse e vanno mostrate insieme: la prima
 * dice se la citta' trova cio' che cerca, la seconda se i negozi che ha
 * costruito servono a qualcosa. Con un solo numero, "troppi negozi" e "pochi
 * negozi" si leggerebbero uguale.
 */
function commerceRows(commerce: HudCommerce): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'commerce-panel';

  const rows: readonly (readonly [string, string])[] = [
    ['Demand served', `${commerce.service}%`],
    ['Shops in use', `${commerce.occupancy}%`],
    ['Revenue', `${commerce.revenue.toFixed(2)} / tick`],
    ['Goods sold', `${commerce.goods.toFixed(2)} / tick`],
    ['Mixed-use blocks', `${commerce.mixedBuildings}`],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'commerce-row';
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = value;
    row.append(name, amount);
    panel.appendChild(row);
  }

  const message = document.createElement('p');
  message.className = 'commerce-note';
  message.textContent = commerce.message;
  panel.appendChild(message);
  return panel;
}

/**
 * Gli scambi esterni come fatti, piu' una nota quando non sono ancora possibili.
 *
 * Prima il rapporto e le tre schede di rotta vivevano nella stessa linguetta, e
 * chi non aveva ancora un porto trovava un elenco spento senza sapere perche'.
 * Qui la nota e' la stessa che spiega le schede, ma accanto ai numeri che si
 * stanno leggendo.
 */
function tradeRows(trade: OverviewTrade): HTMLElement {
  const links = trade.links.length === 0 ? 'None' : trade.links.join(' · ');
  const facts = factRows([
    { label: 'Connections', value: links },
    { label: 'Food imported', value: `${trade.food.toFixed(1)} / tick` },
    { label: 'Materials exported', value: `${trade.materials.toFixed(1)} / tick` },
    {
      label: 'Trade balance',
      value: `${trade.funds > 0 ? '+' : ''}${trade.funds.toFixed(1)} funds / tick`,
      tone: trade.funds >= 0 ? 'positive' : 'warning',
    },
  ]);
  if (trade.connected) return facts;
  const wrap = document.createElement('div');
  wrap.append(facts, note('Build a Port or an Airport to unlock external trade.'));
  return wrap;
}

/**
 * La megastruttura: quanto ne ammette la citta', cosa manca, cosa porta.
 *
 * **La barra della quota sta in cima e la ricompensa in fondo**, e in mezzo cio'
 * che manca: e' l'ordine in cui si legge una scala — dove sono, cosa devo fare,
 * perche' dovrei. La nota chiude il malinteso che la meccanica si porta dietro
 * da sempre: non c'e' un bottone, e non e' una dimenticanza.
 */
function arcologyRows(arcology: CityOverviewModel['arcology']): HTMLElement {
  const panel = document.createElement('div');
  panel.append(goalRows([arcology.goal]));
  if (arcology.gaps.length > 0) panel.appendChild(factRows(arcology.gaps));
  panel.appendChild(note(
    `No tool places one: it rises on its own where a quarter has nothing left to ` +
    `become. It carries ${arcology.reward}.`,
  ));
  return panel;
}

/** Mandati e decisioni: la memoria della citta', in fondo alla colonna. */
function historyRows(overview: CityOverviewModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'history-panel';

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

  panel.append(
    sectionTitle('Standing mandates'),
    mandates,
    sectionTitle('Recent decisions'),
    decisions,
  );
  return panel;
}
