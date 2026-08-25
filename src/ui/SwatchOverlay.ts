import {
  SWATCH_FOCUSES,
  type SwatchFocus,
  type SwatchSubject,
} from '../world/scenes/swatchCatalog';
import type { SwatchDetail } from '../world/scenes/swatchProbe';
import { PALETTE_SLOT_NAMES } from '../engine/paletteSlots';
import { SURFACE_KIND_NAMES } from '../world/visualBlock';

/**
 * Referto e navigazione del campionario.
 *
 * Esiste per la stessa ragione di `InspectOverlay`: **in-world non ci sono
 * etichette**. Da quando la scena e' cresciuta fino alle gallerie di edifici e
 * landmark, un pannello che nomina solo la matrice non basta piu': qui stanno i
 * cinque pulsanti che inquadrano una fascia e la scheda del soggetto sotto il
 * cursore — nome, uso o ruolo, variante, livello o stadio, ingombro e altezza —
 * piu' il referto del voxel davvero colpito.
 */

/** Il voxel colpito dal raggio, con il suo referto di palette e superficie. */
export interface SwatchVoxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Slot di palette del voxel. */
  readonly palette: number;
  /** Indice del linguaggio di superficie del voxel. */
  readonly surface: number;
}

export interface SwatchOverlayFrame {
  /** Fascia inquadrata dai pulsanti. */
  readonly focus: SwatchFocus;
  /** Soggetto sotto il cursore, o la scelta persistente quando il cursore e' fuori. */
  readonly subject: SwatchSubject | null;
  /** Scelta persistente: sopravvive alla navigazione fra le fasce. */
  readonly selection: SwatchSubject | null;
  /** Il voxel davvero colpito, o null se il cursore non tocca nulla. */
  readonly voxel: SwatchVoxel | null;
  /** Prismi e quad della cella di matrice, o null fuori dalla matrice. */
  readonly detail: SwatchDetail | null;
}

const FOCUS_LABELS: Readonly<Record<SwatchFocus, string>> = {
  matrix: 'Matrice',
  scale: 'Scala',
  buildings: 'Edifici',
  landmarks: 'Landmark',
  arcologies: 'Arcologie',
  all: 'Tutto',
};

const KIND_LABELS: Readonly<Record<SwatchSubject['kind'], string>> = {
  matrix: 'matrice',
  strata: 'stratigrafia',
  scale: 'scala',
  building: 'edificio',
  landmark: 'landmark',
  arcology: 'arcologia',
};

const REFRESH_MS = 200;

export class SwatchOverlay {
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLPreElement;
  private readonly buttons = new Map<SwatchFocus, HTMLButtonElement>();
  private lastPaint = 0;

  constructor(parent: HTMLElement, onFocus: (focus: SwatchFocus) => void) {
    this.root = document.createElement('details');
    this.root.className = 'debug-panel debug-panel--right';
    this.root.open = true;

    this.summary = document.createElement('summary');
    this.summary.className = 'debug-summary';
    this.summary.textContent = '▾ SWATCH · Tutto';
    this.root.appendChild(this.summary);

    const actions = document.createElement('div');
    actions.className = 'debug-actions';
    for (const focus of SWATCH_FOCUSES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'debug-button';
      button.textContent = FOCUS_LABELS[focus];
      button.addEventListener('click', () => onFocus(focus));
      this.buttons.set(focus, button);
      actions.appendChild(button);
    }
    this.root.appendChild(actions);

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
    const subject = frame.subject;
    const voxel = frame.voxel;

    for (const [focus, button] of this.buttons) setActive(button, focus === frame.focus);
    this.summary.textContent = `${this.root.open ? '▾' : '▸'} SWATCH · ${FOCUS_LABELS[frame.focus]}`;

    const voxelLine = voxel === null
      ? 'voxel      —'
      : `voxel      ${voxel.x}, ${voxel.y}, ${voxel.z} · slot ${voxel.palette} (${PALETTE_SLOT_NAMES[voxel.palette]}) · ${SURFACE_KIND_NAMES[voxel.surface]} (${voxel.surface})`;

    this.body.textContent = [
      `fascia     ${FOCUS_LABELS[frame.focus]}`,
      `sotto      ${subject?.label ?? '—'}`,
      subject === null ? '' : `           ${KIND_LABELS[subject.kind]}${subject.note === null ? '' : ` · ${subject.note}`}`,
      ...(subject === null ? [] : subject.info.map((row) => rowLine(row.label, row.value))),
      subject === null ? '' : `           ${subject.rect.x1 - subject.rect.x0} × ${subject.rect.y1 - subject.rect.y0} voxel · altezza ${subject.z1 - subject.z0}`,
      frame.selection === null
        ? ''
        : `scelto     ${frame.selection.label}${frame.selection === subject ? '' : '  (Esc per mollare)'}`,
      voxelLine,
      frame.detail === null ? '' : `dettaglio  ${frame.detail.prisms} prismi · ${frame.detail.quads} quad`,
      '',
      '1..9 tema   L giorno/notte   F3 strumenti tecnici (H ±1h)',
      'clic sceglie · Esc molla',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Riga di scheda allineata: etichetta a sinistra, valore a capo con rientro. */
function rowLine(label: string, value: string): string {
  return `           ${label.padEnd(10)} ${value}`;
}

/** Stesso stato attivo dei pulsanti di `InspectOverlay`: un solo linguaggio. */
function setActive(button: HTMLButtonElement, active: boolean): void {
  button.style.background = active ? 'rgba(120,200,180,0.22)' : 'rgba(216,220,224,0.08)';
  button.style.borderColor = active ? 'rgba(120,200,180,0.6)' : 'rgba(216,220,224,0.28)';
}
