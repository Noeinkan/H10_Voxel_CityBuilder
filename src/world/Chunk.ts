import { CHUNK_VOL, keyOf } from './chunkCoords';

/**
 * Un chunk 32x32x32 con due layer paralleli.
 *
 * `blocks` e' l'unico layer letto dal renderer: 0 = vuoto, altrimenti indice di palette.
 * `data` e' un byte libero per la simulazione e non viene mai letto da src/engine.
 *
 * Gli array sono allocati una sola volta nel costruttore e mai riallocati: la
 * crescita del mondo aggiunge chunk nuovi senza toccare quelli esistenti.
 */
export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly key: string;

  /** Layer di rendering: indice di palette per cella, 0 = vuoto. */
  readonly blocks: Uint8Array;

  /** Layer di simulazione: byte libero, ignorato dal renderer. */
  readonly data: Uint8Array;

  /** Celle non vuote in `blocks`. Permette di saltare i chunk vuoti senza scandirli. */
  solidCount = 0;

  /** true quando `blocks` e' cambiato dopo l'ultimo flush. */
  dirty = false;

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.key = keyOf(cx, cy, cz);
    this.blocks = new Uint8Array(CHUNK_VOL);
    this.data = new Uint8Array(CHUNK_VOL);
  }

  /** true se il chunk non contiene alcuna cella piena. */
  get isEmpty(): boolean {
    return this.solidCount === 0;
  }
}
