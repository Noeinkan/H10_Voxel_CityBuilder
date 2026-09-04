import { unitAt } from '../rng';
import { ROADS } from './config';

/**
 * La parte **continua** del costo di una colonna: pendenza e divagazione.
 *
 * **Perche' esiste.** I costi di `config.ts` sono a gradini — terra, roccia,
 * costruito, acqua — e su un terreno a gradini un cammino minimo non e' unico:
 * fra due punti di un pianoro ci sono migliaia di percorsi che costano identico,
 * e la ricerca ne restituisce uno qualunque. Quello che esce e' sempre la stessa
 * forma, la diagonale canonica seguita dal tratto in asse, cioe' esattamente il
 * disegno geometrico che il tracciato organico doveva togliere di mezzo. Il
 * problema non e' A\*: e' che senza un campo continuo **non c'e' una risposta
 * migliore delle altre**, e allora tanto vale la piu' dritta.
 *
 * Questo modulo aggiunge quella risposta. La pendenza dice da che parte girare
 * dove il terreno ha una forma; la divagazione dice da che parte girare dove non
 * ce l'ha. Entrambe sono deterministiche in `(seed, x, y)`, quindi la rete
 * ricostruita al caricamento e' identica a quella salvata.
 *
 * **Il minimo resta zero.** Il costo di un passo non scende mai sotto
 * `ROADS.flatCost` perche' questo termine si somma e non sostituisce: se
 * diventasse negativo l'euristica di `traceRoad` smetterebbe di essere
 * ammissibile. E' l'invariante che l'`AGENTS.md` di questa cartella chiama per
 * nome, e vale anche qui.
 */

/**
 * Il campo di divagazione in `(x, y)`, in [0, 1).
 *
 * E' un valore per nodo del reticolo di lato `wanderCell`, interpolato con la
 * smoothstep fra i quattro nodi che circondano la colonna. **L'interpolazione
 * non e' un abbellimento**: presa a gradini, la divagazione sarebbe costante
 * dentro la cella e salterebbe sul bordo, e il tracciato girerebbe solo sui
 * confini del reticolo — una scala, che e' un reticolo quadrato in incognito.
 * Con la smoothstep la derivata si annulla sui nodi e la curva si sviluppa
 * dentro la cella.
 */
export function wanderAt(seed: number, x: number, y: number): number {
  const cell = ROADS.wanderCell;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = smoothstep(x / cell - gx);
  const fy = smoothstep(y / cell - gy);
  const top = mix(unitAt(seed, gx, gy), unitAt(seed, gx + 1, gy), fx);
  const bottom = mix(unitAt(seed, gx, gy + 1), unitAt(seed, gx + 1, gy + 1), fx);
  return mix(top, bottom, fy);
}

/**
 * Quanto la forma del terreno aggiunge al costo di una colonna.
 *
 * La pendenza arriva gia' misurata da `TerrainMap` perche' questo modulo, come
 * il resto del dominio puro, non conosce il terreno: chi chiama la legge e la
 * passa. Vale zero su una colonna piana di un campo di divagazione al minimo,
 * ed e' il caso in cui il tracciato torna a essere quello di prima.
 */
export function terrainPenalty(seed: number, x: number, y: number, slope: number): number {
  return slope * ROADS.slopeCost + wanderAt(seed, x, y) * ROADS.wanderCost;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
