import {
  SWATCH_COLUMNS,
  SWATCH_ROWS,
  type SwatchCell,
} from '../world/scenes/swatchLayout';
import { SURFACE_KIND_NAMES } from '../world/visualBlock';

/**
 * Referto del campionario: cosa si sta guardando, riga e colonna.
 *
 * Esiste per la stessa ragione di `InspectOverlay`: **in-world non ci sono
 * etichette**. Una griglia di duecentocinquanta prismi e' leggibile solo se
 * qualcosa dice quale slot e quale linguaggio sia quello sotto il cursore, e la
 * sola convenzione d'ordine si dimentica fra una sessione e l'altra — tanto piu'
 * che il campionario esiste proprio per giudicare un tema che non si conosce
 * ancora.
 *
 * La legenda delle righe sta sempre in vista e non solo sotto il cursore: e' la
 * mappa, e serve prima di sapere dove puntare.
 */

export interface SwatchOverlayFrame {
  /** Cella sotto il cursore, o null se il puntatore e' fuori dal campionario. */
  readonly cell: SwatchCell | null;
}

const REFRESH_MS = 200;

export class SwatchOverlay {
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLPreElement;
  private lastPaint = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('details');
    this.root.className = 'debug-panel debug-panel--right';
    this.root.open = true;

    this.summary = document.createElement('summary');
    this.summary.className = 'debug-summary';
    this.summary.textContent = '▾ SWATCH · —';
    this.root.appendChild(this.summary);

    this.body = document.createElement('pre');
    this.body.className = 'debug-body';
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
    const cell = frame.cell;

    this.summary.textContent = `${this.root.open ? '▾' : '▸'} SWATCH · ${cell?.band ?? '—'}`;

    this.body.textContent = [
      `fascia     ${cell?.band ?? '—'}`,
      `sotto      ${cell?.label ?? '—'}`,
      cell?.note === null || cell?.note === undefined ? '' : `           ${cell.note}`,
      '',
      `matrice    ${SWATCH_COLUMNS} colonne (slot) × ${SWATCH_ROWS} righe (superficie)`,
      ...SURFACE_KIND_NAMES.map((name, row) => `  riga ${row}    ${name}`),
      '',
      '1..9 tema   L modo del giorno   H ±1h',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  dispose(): void {
    this.root.remove();
  }
}
