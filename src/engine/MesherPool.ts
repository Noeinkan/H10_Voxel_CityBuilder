import { PADDED_VOL } from '../world/chunkCoords';
import type { MeshJob, MeshResult } from './mesher/meshTypes';

/** Risultato consegnato al chiamante: senza il buffer di input, gia' riciclato dal pool. */
export type ChunkMeshResult = Omit<MeshResult, 'padded'>;

export interface MesherStats {
  readonly poolSize: number;
  readonly inFlight: number;
  readonly completed: number;
  readonly lastMs: number;
  readonly avgMs: number;
  readonly maxMs: number;
}

const SAMPLE_WINDOW = 64;

/**
 * Pool di worker di meshing con riciclo dei buffer di input.
 *
 * Il pool non decide cosa meshare: accetta un job solo quando ha un worker
 * libero (`idleCount`), cosi' la coda a priorita' resta dove si conoscono le
 * distanze dalla camera, cioe' nel ChunkRenderer.
 */
export class MesherPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly results: ChunkMeshResult[] = [];
  /** Volumi paddati riusabili: evitano 39 KB di allocazione per rebuild. */
  private readonly paddedPool: Uint8Array[] = [];

  private nextJobId = 1;
  private inFlightCount = 0;
  private completedCount = 0;
  private lastMs = 0;
  private maxMs = 0;
  private readonly samples: number[] = [];
  private sampleCursor = 0;

  constructor(size = defaultPoolSize()) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./mesher/mesher.worker.ts', import.meta.url), {
        type: 'module',
        name: `mesher-${i}`,
      });
      worker.onmessage = (event: MessageEvent<MeshResult>): void => this.onResult(worker, event.data);
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  get poolSize(): number {
    return this.workers.length;
  }

  get idleCount(): number {
    return this.idle.length;
  }

  get inFlight(): number {
    return this.inFlightCount;
  }

  get pendingResults(): number {
    return this.results.length;
  }

  /** Volume paddato azzerato, preso dal pool quando disponibile. */
  acquirePadded(): Uint8Array {
    const recycled = this.paddedPool.pop();
    if (recycled === undefined) return new Uint8Array(PADDED_VOL);
    recycled.fill(0);
    return recycled;
  }

  /**
   * Manda un chunk a meshare. Il buffer viene trasferito: il chiamante non deve
   * piu' usarlo. Restituisce il jobId, che cresce in modo monotono e permette di
   * scartare i risultati superati.
   */
  submit(key: string, padded: Uint8Array): number {
    const worker = this.idle.pop();
    if (worker === undefined) {
      throw new Error('MesherPool.submit: no worker available, check idleCount');
    }

    const jobId = this.nextJobId++;
    const job: MeshJob = { jobId, key, padded };
    this.inFlightCount++;
    worker.postMessage(job, [padded.buffer]);
    return jobId;
  }

  /** Estrae un risultato pronto, se c'e'. */
  poll(): ChunkMeshResult | undefined {
    return this.results.shift();
  }

  get stats(): MesherStats {
    let sum = 0;
    for (const s of this.samples) sum += s;
    return {
      poolSize: this.workers.length,
      inFlight: this.inFlightCount,
      completed: this.completedCount,
      lastMs: this.lastMs,
      avgMs: this.samples.length === 0 ? 0 : sum / this.samples.length,
      maxMs: this.maxMs,
    };
  }

  /** Azzera le misure di tempo, per distinguere il regime dallo startup. */
  resetStats(): void {
    this.lastMs = 0;
    this.maxMs = 0;
    this.samples.length = 0;
    this.sampleCursor = 0;
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.idle.length = 0;
    this.results.length = 0;
    this.paddedPool.length = 0;
  }

  private onResult(worker: Worker, result: MeshResult): void {
    this.inFlightCount--;
    this.completedCount++;
    this.idle.push(worker);

    // Il buffer di input torna subito nel pool: il consumatore non lo vede mai.
    if (result.padded.length === PADDED_VOL) this.paddedPool.push(result.padded);

    this.lastMs = result.meshMs;
    if (result.meshMs > this.maxMs) this.maxMs = result.meshMs;
    if (this.samples.length < SAMPLE_WINDOW) {
      this.samples.push(result.meshMs);
    } else {
      this.samples[this.sampleCursor] = result.meshMs;
      this.sampleCursor = (this.sampleCursor + 1) % SAMPLE_WINDOW;
    }

    this.results.push(result);
  }
}

function defaultPoolSize(): number {
  const cores = typeof navigator === 'undefined' ? 4 : (navigator.hardwareConcurrency ?? 4);
  return Math.min(4, Math.max(1, cores - 1));
}
