import {
  INSPECT,
  INSPECT_MODES,
  INSPECT_NAMES,
  INSPECT_MODE,
  type InspectMode,
} from '../engine/inspect';

/**
 * Pannello delle viste di ispezione, attivo con `?debug=1` o `F3`.
 *
 * Esiste per una ragione sola: **in-world non ci sono etichette**. Guardando una
 * citta' velata o tagliata non c'e' modo di sapere a che quota sia la fetta, su
 * quale isolato ci si sia fermati o quale modo sia in mano — e senza saperlo si
 * finisce per attribuire alla citta' quello che invece sta facendo lo strumento.
 * E' la stessa richiesta che fa il campionario della 4.10.
 *
 * Lo slider e' qui e non fra le hotkey perche' cercare la quota giusta e' un
 * gesto continuo: `[` e `]` servono a rifinire, il trascinamento a trovare.
 */

export interface InspectOverlayFrame {
  readonly mode: InspectMode;
  readonly sliceZ: number;
  /** Colonna sotto il cursore, o null se il puntatore non e' sull'isola. */
  readonly focus: { readonly x: number; readonly y: number; readonly z: number } | null;
  /** Chiave dell'isolato sotto il cursore. */
  readonly block: string | null;
  /** Vero quando l'isolato e' stato scelto e la vista ha smesso di inseguire. */
  readonly locked: boolean;
  /** Densita' del retino in vigore: 1 vuol dire taglio. */
  readonly veil: number;
  /** Vero quando il taglio ha spento le ombre proiettate. */
  readonly shadowsOff: boolean;
}

export interface InspectOverlayHandlers {
  readonly onMode: (mode: InspectMode) => void;
  readonly onSliceZ: (z: number) => void;
}

const REFRESH_MS = 200;

/** Cosa risponde ogni modo: e' la riga che si legge prima di scegliere. */
const MODE_HELP: Readonly<Record<InspectMode, string>> = {
  [INSPECT_MODE.off]: 'nessuna vista attiva',
  [INSPECT_MODE.xray]: 'vela cio’ che copre l’edificio sotto il cursore',
  [INSPECT_MODE.slice]: 'taglia sopra la quota: la citta’ al piano n',
  [INSPECT_MODE.section]: 'taglia su una carreggiata, dal lato della camera',
  [INSPECT_MODE.block]: 'vela tutto fuori dall’isolato sotto il cursore',
};

export class InspectOverlay {
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLPreElement;
  private readonly buttons = new Map<InspectMode, HTMLButtonElement>();
  private readonly slider: HTMLInputElement;
  private lastPaint = 0;

  constructor(parent: HTMLElement, handlers: InspectOverlayHandlers) {
    this.root = document.createElement('details');
    this.root.className = 'debug-panel debug-panel--inspect';
    this.root.open = true;

    this.summary = document.createElement('summary');
    this.summary.className = 'debug-summary';
    this.summary.textContent = '▾ INSPECT · off';
    this.root.appendChild(this.summary);

    const modes = document.createElement('div');
    modes.className = 'debug-actions';
    for (const mode of INSPECT_MODES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'debug-button';
      button.textContent = INSPECT_NAMES[mode];
      button.addEventListener('click', () => handlers.onMode(mode));
      this.buttons.set(mode, button);
      modes.appendChild(button);
    }
    this.root.appendChild(modes);

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.className = 'debug-range';
    this.slider.min = String(INSPECT.minSliceZ);
    this.slider.max = String(INSPECT.maxSliceZ);
    this.slider.step = String(INSPECT.sliceStep);
    this.slider.value = String(INSPECT.defaultSliceZ);
    this.slider.addEventListener('input', () => handlers.onSliceZ(Number(this.slider.value)));
    this.root.appendChild(this.slider);

    this.body = document.createElement('pre');
    this.body.className = 'debug-body';
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
  }

  /** Estremo alto dello slider: la citta' cresce, e con lei la quota utile. */
  setSliceRange(maxZ: number): void {
    const next = String(Math.max(INSPECT.minSliceZ + 1, Math.min(INSPECT.maxSliceZ, Math.ceil(maxZ))));
    if (this.slider.max !== next) this.slider.max = next;
  }

  needsPaint(now: number): boolean {
    return !this.root.hidden && now - this.lastPaint >= REFRESH_MS;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(frame: InspectOverlayFrame, now: number): void {
    this.lastPaint = now;

    for (const [mode, button] of this.buttons) setActive(button, mode === frame.mode);
    if (this.slider.value !== String(frame.sliceZ)) this.slider.value = String(frame.sliceZ);

    this.summary.textContent = `${this.root.open ? '▾' : '▸'} INSPECT · ${INSPECT_NAMES[frame.mode]}`;

    const focus = frame.focus === null
      ? '—'
      : `${frame.focus.x}, ${frame.focus.y} · z ${frame.focus.z}`;
    const action = frame.veil === 0
      ? 'niente'
      : frame.veil >= INSPECT.cut
        ? 'taglio'
        : `velo ${(frame.veil * 100).toFixed(0)} %`;

    this.body.textContent = [
      `modo       ${INSPECT_NAMES[frame.mode]}`,
      `           ${MODE_HELP[frame.mode]}`,
      `azione     ${action}`,
      `quota      ${frame.sliceZ.toString().padStart(3)}  ([ ] · Shift ×${INSPECT.sliceCoarse})`,
      `cursore    ${focus}`,
      `isolato    ${frame.block ?? '—'}${frame.locked ? '  (scelto · orbita)' : ''}`,
      frame.shadowsOff ? 'ombre      spente finche’ il taglio e’ attivo' : '',
      '',
      'V cicla i modi',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Stesso stato attivo dei pulsanti di `SimOverlay`: un solo linguaggio. */
function setActive(button: HTMLButtonElement, active: boolean): void {
  button.style.background = active ? 'rgba(120,200,180,0.22)' : 'rgba(216,220,224,0.08)';
  button.style.borderColor = active ? 'rgba(120,200,180,0.6)' : 'rgba(216,220,224,0.28)';
}
