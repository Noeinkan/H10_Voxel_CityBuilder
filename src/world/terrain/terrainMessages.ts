import type { ColumnBlock } from './columnBlock';
import type { IslandShape } from './region';

/** Protocollo fra `TerrainStreamer` (main thread) e `terrain.worker`. */

/** Una colonna di chunk da generare. */
export interface BlockRequest {
  readonly ccx: number;
  readonly ccy: number;
}

/**
 * Un intero lotto di blocchi in un solo messaggio: il worker li restituisce uno
 * alla volta, ma riceve la lista completa cosi' non c'e' un round trip per
 * blocco fra un pezzo di isola e il successivo.
 */
export interface TerrainJob {
  readonly seed: number;
  readonly shape: IslandShape;
  readonly blocks: readonly BlockRequest[];
}

export interface BlockMessage {
  readonly type: 'block';
  readonly block: ColumnBlock;
  /** Posizione nel lotto, per l'avanzamento. */
  readonly index: number;
  readonly total: number;
}

export interface DoneMessage {
  readonly type: 'done';
  readonly blocks: number;
  /** Tempo speso dal worker sull'intero lotto, escluso il trasporto. */
  readonly generationMs: number;
}

export type TerrainMessage = BlockMessage | DoneMessage;
