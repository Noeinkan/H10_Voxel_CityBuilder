import { DAYLIGHT_MODE, type DaylightMode } from '../engine/daylight';
import { daylightControl, type GameHudModel, type HudFlow, type HudResource } from './GameHudModel';
import type { TrendDirection } from './ResourceTrend';
import { createHudIcon, type HudIcon } from './hudIcons';
import { iconButton, textButton } from './hudWidgets';

/**
 * La barra in alto: cosa la citta' ha, e quanto tempo passa mentre la si guarda.
 *
 * Esce da `GameHud.ts` con le stesse ragioni per cui ne erano gia' usciti i
 * widget: e' una superficie che si legge e si modifica da sola, e teneva in
 * ostaggio il file piu' conteso del progetto. Le cinque risorse e i controlli
 * del tempo stanno insieme perche' condividono la barra, non perche' si
 * conoscano: il tempo e' l'unica cosa che si tocca da qui.
 */

const RESOURCE_ICON: Readonly<Record<HudResource['id'], HudIcon>> = {
  funds: 'funds', population: 'population', food: 'food', materials: 'materials', satisfaction: 'satisfaction',
};

const DAYLIGHT_ICON: Readonly<Record<DaylightMode, HudIcon>> = {
  [DAYLIGHT_MODE.cycle]: 'daylight',
  [DAYLIGHT_MODE.day]: 'sun',
  [DAYLIGHT_MODE.night]: 'moon',
};

interface ResourceElements {
  readonly item: HTMLElement;
  readonly value: HTMLElement;
  readonly delta: HTMLElement;
  readonly arrow: HTMLElement;
  readonly spark: SVGPolylineElement;
  readonly ring: SVGCircleElement;
  readonly flows: HTMLElement;
}

/** La freccia di tendenza: e' la sagoma a dire il verso, non il colore. */
const ARROW: Readonly<Record<TrendDirection, string>> = { up: '▲', down: '▼', flat: '·' };

/** Il perimetro dell'anello, per `stroke-dasharray`. Raggio 7 su un box da 18. */
const RING_LENGTH = 2 * Math.PI * 7;

/** Il box della sparkline: stretta e bassa, perche' e' una firma e non un grafico. */
const SPARK_WIDTH = 48;
const SPARK_HEIGHT = 14;

function svg<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

/**
 * La finestra come `points` di una polilinea, scalata sul proprio minimo e
 * massimo.
 *
 * Autoscalata e non su uno zero fisso: quello che interessa e' la **forma**
 * dell'ultimo tratto, e una serie che oscilla fra 900 e 910 su un asse che parte
 * da zero e' una riga piatta che non dice niente.
 */
export function sparkPoints(series: readonly number[]): string {
  if (series.length < 2) return '';
  let low = series[0] ?? 0;
  let high = low;
  for (const value of series) {
    if (value < low) low = value;
    if (value > high) high = value;
  }
  const span = high - low;
  const step = SPARK_WIDTH / (series.length - 1);
  return series
    .map((value, index) => {
      // Senza escursione la riga sta a meta' altezza: appoggiarla sul bordo
      // farebbe sembrare "fermo" e "al minimo" la stessa cosa.
      const t = span === 0 ? 0.5 : (value - low) / span;
      return `${(index * step).toFixed(1)},${(SPARK_HEIGHT - t * SPARK_HEIGHT).toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Le voci del bilancio dentro il popover, piu' il totale.
 *
 * Si ridisegna solo quando cambia il **numero** di righe: le cifre si
 * riscrivono in place, cosi' il popover non si smonta sotto il puntatore di chi
 * lo sta leggendo mentre la simulazione avanza.
 */
function paintFlows(host: HTMLElement, flows: readonly HudFlow[] | undefined): void {
  if (flows === undefined || flows.length === 0) {
    host.replaceChildren();
    host.dataset.empty = 'true';
    return;
  }
  host.dataset.empty = 'false';
  if (host.childElementCount !== flows.length) {
    host.replaceChildren(...flows.map(() => {
      const row = document.createElement('div');
      row.className = 'resource-flow';
      row.append(document.createElement('span'), document.createElement('strong'));
      return row;
    }));
  }
  flows.forEach((flow, index) => {
    const row = host.children[index];
    if (!(row instanceof HTMLElement)) return;
    row.dataset.direction = flow.direction;
    const [name, amount] = row.children;
    if (name instanceof HTMLElement) name.textContent = flow.label;
    if (amount instanceof HTMLElement) {
      amount.textContent = `${flow.direction === 'out' ? '−' : '+'}${flow.amount.toFixed(1)}`;
    }
  });
}

export interface ResourceBarHandlers {
  readonly onPause: (paused: boolean) => void;
  readonly onSpeed: (speed: number) => void;
  /** Ciclo, giorno fisso o notte fissa: sta accanto alla velocita' perche' e' tempo. */
  readonly onDaylight: (mode: DaylightMode) => void;
}

export class ResourceBar {
  readonly root: HTMLElement;

  private readonly resources = new Map<HudResource['id'], ResourceElements>();
  private readonly pauseButton: HTMLButtonElement;
  private readonly speedButtons = new Map<number, HTMLButtonElement>();
  private readonly daylightButton: HTMLButtonElement;
  private daylightMode: DaylightMode = DAYLIGHT_MODE.cycle;
  /**
   * L'ultimo stato dipinto, non il modello.
   *
   * Il bottone della pausa chiede il **contrario** di cio' che c'e' adesso, e
   * senza questo dovrebbe risalire al modello di qualcun altro: e' l'unico
   * pezzo di stato che la barra ha bisogno di ricordare fra due ripitture.
   */
  private paused = false;

  constructor(model: GameHudModel, handlers: ResourceBarHandlers) {
    this.root = document.createElement('header');
    this.root.className = 'resource-bar hud-surface hud-surface--framed';
    for (const resource of model.resources) this.root.appendChild(this.createResource(resource));

    const time = document.createElement('div');
    time.className = 'time-controls';
    this.pauseButton = iconButton('pause', 'Pause simulation', () => handlers.onPause(!this.paused));
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
      handlers.onDaylight(daylightControl(this.daylightMode).next));
    this.daylightButton.classList.add('hud-button--small', 'daylight-toggle');
    time.appendChild(this.daylightButton);
    this.setDaylight(DAYLIGHT_MODE.cycle);
    this.root.appendChild(time);
  }

  paint(model: GameHudModel): void {
    this.paused = model.paused;
    // La citta' in crisi si vede dalla barra e non solo dal toast: e' li' che si
    // sta guardando quando qualcosa va storto, e il toast si legge una volta.
    this.root.dataset.condition = model.condition?.kind === 'crisis' ? 'crisis' : 'calm';

    for (const resource of model.resources) {
      const elements = this.resources.get(resource.id);
      if (elements === undefined) continue;
      elements.value.textContent = resource.value;
      elements.delta.textContent = resource.delta === '' ? '' : ` ${resource.delta}`;
      elements.delta.dataset.tone = resource.tone;

      elements.arrow.textContent = resource.trend === 'flat' ? '' : ARROW[resource.trend];
      elements.arrow.dataset.trend = resource.trend;
      // La magnitudine e' opacita', non una seconda cifra: dice "quanto forte"
      // senza chiedere di leggere un numero in piu'. Sotto un terzo resterebbe
      // invisibile, quindi la scala parte da li'.
      elements.arrow.style.opacity = (0.35 + resource.magnitude * 0.65).toFixed(2);

      const points = sparkPoints(resource.series);
      elements.spark.setAttribute('points', points);
      elements.spark.parentElement?.toggleAttribute('hidden', points === '');

      const fill = resource.fill;
      elements.item.dataset.capped = fill === undefined ? 'false' : 'true';
      if (fill !== undefined) {
        elements.ring.setAttribute('stroke-dashoffset', (RING_LENGTH * (1 - fill.value)).toFixed(2));
        elements.item.title = fill.label;
        // Sotto un quarto l'anello vira: e' la stessa soglia oltre la quale la
        // penuria diventa una crisi dichiarata, e le due non devono divergere.
        elements.ring.dataset.low = fill.value < 0.25 ? 'true' : 'false';
      }

      paintFlows(elements.flows, resource.breakdown);
    }

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

  private createResource(resource: HudResource): HTMLElement {
    const item = document.createElement('div');
    item.className = 'resource-item';

    // L'icona dentro l'anello: dove un tetto esiste, il contorno **e'** la
    // lettura, e non c'e' una seconda cifra da confrontare con la prima.
    const badge = document.createElement('span');
    badge.className = 'resource-badge';
    const gauge = svg('svg');
    gauge.setAttribute('viewBox', '0 0 18 18');
    gauge.setAttribute('aria-hidden', 'true');
    gauge.classList.add('resource-ring');
    const track = svg('circle');
    track.setAttribute('cx', '9');
    track.setAttribute('cy', '9');
    track.setAttribute('r', '7');
    track.classList.add('resource-ring-track');
    const ring = svg('circle');
    ring.setAttribute('cx', '9');
    ring.setAttribute('cy', '9');
    ring.setAttribute('r', '7');
    ring.classList.add('resource-ring-fill');
    ring.setAttribute('stroke-dasharray', RING_LENGTH.toFixed(2));
    gauge.append(track, ring);
    badge.append(gauge, createHudIcon(RESOURCE_ICON[resource.id]));

    const label = document.createElement('span');
    label.className = 'resource-label';
    label.textContent = resource.label;

    const value = document.createElement('span');
    value.className = 'resource-value';
    const number = document.createElement('span');
    number.className = 'resource-number';
    const arrow = document.createElement('span');
    arrow.className = 'resource-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    const delta = document.createElement('span');
    delta.className = 'resource-delta';
    value.append(number, arrow, delta);

    // Il perche' del saldo, al passaggio del mouse.
    //
    // Un popover e non una riga fissa: la scomposizione serve quando ci si
    // chiede «perche' sto perdendo denaro», che e' una domanda occasionale, e
    // tenerla sempre a schermo costerebbe alla barra tutto lo spazio che ha.
    const flows = document.createElement('div');
    flows.className = 'resource-flows';

    const spark = svg('svg');
    spark.setAttribute('viewBox', `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`);
    // Senza questo la polilinea si deforma con la cella invece di riempirla, ed
    // e' esattamente cio' che si vuole da una sparkline: la forma, non la scala.
    spark.setAttribute('preserveAspectRatio', 'none');
    spark.setAttribute('aria-hidden', 'true');
    spark.classList.add('resource-spark');
    const line = svg('polyline');
    spark.appendChild(line);

    item.append(badge, label, value, spark, flows);
    // Raggiungibile da tastiera: senza, la scomposizione esiste solo per chi usa
    // il mouse, e la domanda che risponde non e' un extra decorativo.
    item.tabIndex = 0;
    this.resources.set(resource.id, { item, value: number, delta, arrow, spark: line, ring, flows });
    return item;
  }
}
