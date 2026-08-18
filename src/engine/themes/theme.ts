/**
 * Contratto di un tema grafico.
 *
 * Un tema e' solo dato: 32 colori piu' i parametri di atmosfera. Applicarlo
 * riscrive uniform e stato del renderer, mai una geometria — i vertici portano
 * l'indice di palette, non il colore, quindi cambiare tema non puo' invalidare
 * una sola mesh.
 *
 * Questo modulo non importa nulla, nemmeno Three: e' il tipo che condividono la
 * tabella dei temi e il materiale.
 */

export interface Atmosphere {
  /**
   * Colore di fondo, cioe' quello che si vede a schermo dietro alla scena.
   *
   * Non passa dal tone mapping, mentre la geometria si': con `toneMapping:
   * 'aces'` va scelto guardando il risultato, non facendolo combaciare a occhio
   * con `fogColor`. Sono due parametri distinti apposta.
   */
  readonly background: string;
  /** Tinta verso cui sfuma la distanza, miscelata in spazio lineare. */
  readonly fogColor: string;
  /** Densita' della nebbia esponenziale. 0 la spegne del tutto. */
  readonly fogDensity: number;
  /**
   * Luminosita' per orientamento di faccia, indicizzata da `FACE_*` di
   * chunkCoords: +X, -X, +Y, -Y, +Z, -Z.
   *
   * Il sole e' fisso nel mondo, non nella camera: ruotando con Q/E il lato
   * illuminato cambia, ed e' voluto.
   */
  readonly faceLight: readonly number[];
  /** Quanto scuriscono gli angoli concavi. Consumata dall'AO per-vertice. */
  readonly aoStrength: number;
  readonly toneMapping: 'none' | 'aces';
  readonly exposure: number;
}

export interface Theme {
  readonly id: string;
  readonly name: string;
  /** 32 colori esadecimali, negli stessi slot di `paletteSlots.ts`. */
  readonly colors: readonly string[];
  readonly atmosphere: Atmosphere;
}
