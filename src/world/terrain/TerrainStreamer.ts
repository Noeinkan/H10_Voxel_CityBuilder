import type { SceneGenerator } from '../scenes/cityScene';
import type { VoxelWorld } from '../VoxelWorld';
import { COLUMNS_PER_CHUNK, DECOR_RECORD_SIZE, type ColumnBlock } from './columnBlock';
import { ensureBlockChunks, writeBlockColumns, writeBlockDecor } from './IslandGenerator';
import { chunkSpanOf, shapeFromRegion, type IslandShape, type Region } from './region';
import type { BlockRequest, TerrainJob, TerrainMessage } from './terrainMessages';
import { TerrainMap } from './TerrainMap';

/**
 * Generazione di un'isola in Web Worker, applicata al mondo a budget di frame.
 *
 * Il worker fa il lavoro pesante — rumore, biomi, pendenze — e consegna un
 * blocco per colonna di chunk. Il main thread fa solo l'unica cosa che non puo'
 * delegare, cioe' scrivere nel `VoxelWorld`, e la fa a lotti di colonne
 * fermandosi appena esaurisce il budget: da qui il fatto che l'isola comincia a
 * comparire e a meshare molto prima di essere completa.
 *
 * Implementa `SceneGenerator` cosi' l'harness la guida esattamente come le scene
 * di prompt 1, senza casi speciali nel loop di frame.
 */

/** Colonne scritte fra due controlli del budget. Una colonna e' al piu' 40 voxel. */
const COLUMN_BATCH = 64;
/** Alberi scritti fra due controlli del budget del frame. */
const DECOR_BATCH = 24;

export class TerrainStreamer implements SceneGenerator {
  readonly map: TerrainMap;
  readonly shape: IslandShape;
  readonly seed: number;

  private readonly world: VoxelWorld;
  private readonly worker: Worker;
  private readonly pending: ColumnBlock[] = [];
  private readonly totalBlocks: number;

  /** Colonna corrente dentro il blocco in testa alla coda. */
  private cursor = 0;
  /** Record decorativo corrente, dopo che tutte le colonne sono state scritte. */
  private decorCursor = 0;
  private ensured = false;

  private receivedBlocks = 0;
  private appliedBlocks = 0;
  private workerDone = false;
  private finished = false;
  private written = 0;
  private workerMs = 0;
  private disposed = false;

  constructor(world: VoxelWorld, seed: number, region: Region, shape?: IslandShape) {
    this.world = world;
    this.seed = seed;
    this.shape = shape ?? shapeFromRegion(region);
    this.map = new TerrainMap();
    this.map.rememberShape(this.shape);

    const span = chunkSpanOf(region);
    const blocks: BlockRequest[] = [];
    for (let ccy = span.minCcy; ccy <= span.maxCcy; ccy++) {
      for (let ccx = span.minCcx; ccx <= span.maxCcx; ccx++) blocks.push({ ccx, ccy });
    }
    this.totalBlocks = blocks.length;

    this.worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), {
      type: 'module',
      name: 'terrain',
    });
    this.worker.onmessage = (event: MessageEvent<TerrainMessage>): void => this.onMessage(event.data);

    const job: TerrainJob = { seed, shape: this.shape, blocks };
    this.worker.postMessage(job);
  }

  get done(): boolean {
    return this.finished;
  }

  get progress(): number {
    if (this.totalBlocks === 0) return 1;
    const partial = this.cursor / COLUMNS_PER_CHUNK;
    return Math.min(1, (this.appliedBlocks + partial) / this.totalBlocks);
  }

  get voxelsWritten(): number {
    return this.written;
  }

  /** Millisecondi spesi dal worker sull'intero lotto. 0 finche' non ha finito. */
  get generationMs(): number {
    return this.workerMs;
  }

  get buildableColumns(): number {
    return this.map.buildableCount;
  }

  get blocksReceived(): number {
    return this.receivedBlocks;
  }

  get blocksApplied(): number {
    return this.appliedBlocks;
  }

  get blocksTotal(): number {
    return this.totalBlocks;
  }

  /** true quando c'e' del lavoro in coda che `step` puo' consumare. */
  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const start = performance.now();

    while (this.pending.length > 0) {
      const block = this.pending[0];
      if (!this.ensured) {
        ensureBlockChunks(this.world, block);
        this.ensured = true;
      }

      while (this.cursor < COLUMNS_PER_CHUNK) {
        this.written += writeBlockColumns(this.world, block, this.cursor, COLUMN_BATCH);
        this.cursor += COLUMN_BATCH;
        if (performance.now() - start >= budgetMs) break;
      }

      // Blocco a meta': si riprende dallo stesso cursore al frame dopo.
      if (this.cursor < COLUMNS_PER_CHUNK) return false;

      const decorCount = block.decor.length / DECOR_RECORD_SIZE;
      while (this.decorCursor < decorCount) {
        this.written += writeBlockDecor(this.world, block, this.decorCursor, DECOR_BATCH);
        this.decorCursor += DECOR_BATCH;
        if (performance.now() - start >= budgetMs) break;
      }

      // Le decorazioni sono una fase separata: gli alberi arrivano sempre dopo
      // il terreno e possono fermarsi qui senza dipendere dall'ordine dei blocchi.
      if (this.decorCursor < decorCount) return false;

      this.pending.shift();
      this.cursor = 0;
      this.decorCursor = 0;
      this.ensured = false;
      this.appliedBlocks++;

      if (performance.now() - start >= budgetMs) break;
    }

    this.finished = this.workerDone && this.pending.length === 0;
    if (this.finished) this.releaseWorker();
    return this.finished;
  }

  dispose(): void {
    this.releaseWorker();
    this.pending.length = 0;
  }

  private onMessage(message: TerrainMessage): void {
    if (message.type === 'block') {
      this.receivedBlocks++;
      // La mappa adotta subito i buffer arrivati: le statistiche per colonna
      // sono interrogabili prima che i voxel corrispondenti siano scritti.
      this.map.adopt(message.block);
      this.pending.push(message.block);
      return;
    }
    this.workerMs = message.generationMs;
    this.workerDone = true;
  }

  private releaseWorker(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.onmessage = null;
    this.worker.terminate();
  }
}
