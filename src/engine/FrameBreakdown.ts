import { SampleWindow, type SampleSummary } from './SampleWindow';

/** La fase che non e' lavoro del main thread da mettere a budget: il disegno. */
export const RENDER_PHASE = 'render';

export interface PhaseReading extends SampleSummary {
  readonly name: string;
}

export interface FrameBreakdownSnapshot {
  /** Le fasi nell'ordine in cui il frame le attraversa la prima volta. */
  readonly phases: readonly PhaseReading[];
  /** Tutto il lavoro del frame **tranne** il render: e' il numero dei 4 ms. */
  readonly main: SampleSummary;
  readonly render: SampleSummary;
  /**
   * Il render dei soli frame in cui sono nate geometrie, e di quelli in cui no.
   *
   * **E' cosi' che l'upload si separa dal disegno.** La geometria di un chunk
   * nasce in `ChunkRenderer.applyResult`, ma raggiunge la GPU solo al primo
   * `render` che la incontra, e da JavaScript quel trasferimento non ha un
   * orologio suo. La differenza fra le due finestre e' il suo costo, letto dove
   * davvero lo si paga.
   */
  readonly renderWithUpload: SampleSummary;
  readonly renderWithoutUpload: SampleSummary;
  /** Byte di geometria nati nell'ultimo frame, e il picco dall'ultimo azzeramento. */
  readonly uploadBytes: number;
  readonly uploadBytesMax: number;
}

/**
 * Dove va il tempo di un frame, fase per fase.
 *
 * **Un segmento per `mark`**: il tempo fra un segno e il precedente va alla fase
 * nominata dal secondo. Cosi' nessun millisecondo resta senza padrone — e il
 * lavoro che prima cadeva dopo la misura, cioe' HUD, traffico e autosave, entra
 * nel conto invece di sparire. Una fase segnata due volte nello stesso frame
 * somma i due segmenti.
 *
 * Pura e senza DOM: l'orologio entra da fuori, e i test lo muovono a mano.
 */
export class FrameBreakdown {
  private readonly windows = new Map<string, SampleWindow>();
  private readonly frame = new Map<string, number>();
  private readonly mainWindow: SampleWindow;
  private readonly renderWindow: SampleWindow;
  private readonly uploadWindow: SampleWindow;
  private readonly idleWindow: SampleWindow;
  private lastMark = 0;
  private open = false;
  private lastUploadBytes = 0;
  private maxUploadBytes = 0;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly capacity = 600,
  ) {
    this.mainWindow = new SampleWindow(capacity);
    this.renderWindow = new SampleWindow(capacity);
    this.uploadWindow = new SampleWindow(capacity);
    this.idleWindow = new SampleWindow(capacity);
  }

  begin(): void {
    this.frame.clear();
    this.lastMark = this.now();
    this.open = true;
  }

  mark(phase: string): void {
    if (!this.open) return;
    const at = this.now();
    this.frame.set(phase, (this.frame.get(phase) ?? 0) + (at - this.lastMark));
    this.lastMark = at;
  }

  /** Chiude il frame. `uploadBytes` sono i byte di geometria nati in questo frame. */
  end(uploadBytes = 0): void {
    if (!this.open) return;
    this.open = false;

    let main = 0;
    let render = 0;
    for (const [phase, ms] of this.frame) {
      this.windowOf(phase).add(ms);
      if (phase === RENDER_PHASE) render += ms;
      else main += ms;
    }
    this.mainWindow.add(main);
    if (this.frame.has(RENDER_PHASE)) {
      this.renderWindow.add(render);
      (uploadBytes > 0 ? this.uploadWindow : this.idleWindow).add(render);
    }
    this.lastUploadBytes = uploadBytes;
    if (uploadBytes > this.maxUploadBytes) this.maxUploadBytes = uploadBytes;
  }

  /** Lavoro non-render del frame in corso fin qui: serve a chi divide il budget. */
  get mainSoFar(): number {
    let main = 0;
    for (const [phase, ms] of this.frame) if (phase !== RENDER_PHASE) main += ms;
    return main;
  }

  snapshot(): FrameBreakdownSnapshot {
    const phases: PhaseReading[] = [];
    for (const [name, window] of this.windows) phases.push({ name, ...window.summary() });
    return {
      phases,
      main: this.mainWindow.summary(),
      render: this.renderWindow.summary(),
      renderWithUpload: this.uploadWindow.summary(),
      renderWithoutUpload: this.idleWindow.summary(),
      uploadBytes: this.lastUploadBytes,
      uploadBytesMax: this.maxUploadBytes,
    };
  }

  /** Riapre tutte le finestre: si misura il regime, non l'avvio. */
  resetPeaks(): void {
    for (const window of this.windows.values()) window.reset();
    this.mainWindow.reset();
    this.renderWindow.reset();
    this.uploadWindow.reset();
    this.idleWindow.reset();
    this.maxUploadBytes = 0;
  }

  private windowOf(phase: string): SampleWindow {
    let window = this.windows.get(phase);
    if (window === undefined) {
      window = new SampleWindow(this.capacity);
      this.windows.set(phase, window);
    }
    return window;
  }
}
