import { SWATCH_FOCUSES, type SwatchFocus } from '../world/scenes/swatchCatalog';
import {
  SWATCH_FOCUS_LABELS,
  swatchCard,
  type SwatchCard,
  type SwatchCardRow,
  type SwatchOverlayFrame,
} from './SwatchOverlayModel';

export type { SwatchOverlayFrame, SwatchVoxel } from './SwatchOverlayModel';

/**
 * Referto e navigazione del campionario.
 *
 * Esiste per la stessa ragione di `InspectOverlay`: **in-world non ci sono
 * etichette**. Da quando la scena e' cresciuta fino alle gallerie di edifici e
 * landmark, un pannello che nomina solo la matrice non basta piu': qui stanno i
 * cinque pulsanti che inquadrano una fascia e la scheda del soggetto sotto il
 * cursore — nome, uso o ruolo, variante, livello o stadio, ingombro e altezza —
 * piu' il referto del voxel davvero colpito.
 *
 * **Questo file e' soltanto la vista.** Cosa la scheda dica lo decide
 * `SwatchOverlayModel`, che gira anche in Node: qui restano gli elementi da
 * appendere e il ritmo con cui si riscrivono.
 */

const REFRESH_MS = 200;

export class SwatchOverlay {
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLElement;
  private readonly buttons = new Map<SwatchFocus, HTMLButtonElement>();
  private lastPaint = 0;

  constructor(parent: HTMLElement, onFocus: (focus: SwatchFocus) => void) {
    this.root = document.createElement('details');
    this.root.className = 'debug-panel debug-panel--right';
    this.root.open = true;

    this.summary = document.createElement('summary');
    this.summary.className = 'debug-summary';
    this.summary.textContent = '▾ SWATCH · All';
    this.root.appendChild(this.summary);

    const actions = document.createElement('div');
    actions.className = 'debug-actions';
    for (const focus of SWATCH_FOCUSES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'debug-button';
      button.textContent = SWATCH_FOCUS_LABELS[focus];
      button.addEventListener('click', () => onFocus(focus));
      this.buttons.set(focus, button);
      actions.appendChild(button);
    }
    this.root.appendChild(actions);

    this.body = document.createElement('div');
    this.body.className = 'debug-body swatch-body';
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
  }

  needsPaint(now: number): boolean {
    return !this.root.hidden && now - this.lastPaint >= REFRESH_MS;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(frame: SwatchOverlayFrame, now: number): void {
    this.lastPaint = now;
    const card = swatchCard(frame);

    for (const [focus, button] of this.buttons) setActive(button, focus === frame.focus);
    this.summary.textContent = `${this.root.open ? '▾' : '▸'} SWATCH · ${card.focusLabel}`;

    // Cinque volte al secondo su una ventina di elementi: ricostruire costa meno
    // che riconciliare, e fra due schede non c'e' niente da conservare.
    this.body.replaceChildren(...sections(card));
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Le sezioni della scheda; a schermo le separa una sola riga sottile. */
function sections(card: SwatchCard): readonly HTMLElement[] {
  const head = section();
  head.appendChild(titleLine(card));
  if (card.note !== null) head.appendChild(text('swatch-note', card.note));
  if (card.rows.length > 0) head.appendChild(rowList(card.rows));

  const out: HTMLElement[] = [head];

  if (card.pinned !== null) {
    const pinned = section();
    pinned.appendChild(rowList([{ label: 'Pinned', value: card.pinned }]));
    out.push(pinned);
  }

  const voxel = section();
  voxel.appendChild(rowList(card.voxelRows));
  out.push(voxel);

  const hints = section();
  hints.classList.add('swatch-hints');
  for (const hint of card.hints) hints.appendChild(text('swatch-hint', hint));
  out.push(hints);

  return out;
}

function section(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'swatch-section';
  return element;
}

/** Nome del soggetto e, accanto, il genere che spiega le sue righe. */
function titleLine(card: SwatchCard): HTMLElement {
  const line = document.createElement('div');
  line.className = 'swatch-title';

  const name = document.createElement('span');
  name.className = 'swatch-title__name';
  if (card.kind === null) name.classList.add('swatch-title__name--empty');
  name.textContent = card.title;
  line.appendChild(name);

  if (card.kind !== null) {
    const kind = document.createElement('span');
    kind.className = 'swatch-kind';
    kind.textContent = card.kind;
    line.appendChild(kind);
  }
  return line;
}

/**
 * Etichette e valori in due colonne.
 *
 * Un `<dl>` e non una tabella: sono coppie, non una griglia di dati. La griglia
 * CSS fa il resto, e un valore lungo va a capo sotto se stesso invece che sotto
 * la colonna delle etichette — il difetto per cui il referto allineato a
 * `padEnd` non reggeva la scheda di un edificio.
 */
function rowList(rows: readonly SwatchCardRow[]): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'swatch-rows';
  for (const row of rows) {
    const label = document.createElement('dt');
    label.textContent = row.label;
    const value = document.createElement('dd');
    value.textContent = row.value;
    list.append(label, value);
  }
  return list;
}

function text(className: string, content: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = content;
  return element;
}

/** Stesso stato attivo dei pulsanti di `InspectOverlay`: un solo linguaggio. */
function setActive(button: HTMLButtonElement, active: boolean): void {
  button.style.background = active ? 'rgba(120,200,180,0.22)' : 'rgba(216,220,224,0.08)';
  button.style.borderColor = active ? 'rgba(120,200,180,0.6)' : 'rgba(216,220,224,0.28)';
}
