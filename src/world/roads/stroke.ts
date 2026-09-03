import { ROADS, type RoadRank } from './config';
import type { ViaductColumn } from './viaduct';

/**
 * Da linea d'asse a carreggiata: la larghezza, e chi vince dove due tratti si
 * incrociano.
 *
 * **Sta fuori da `network.ts` perche' e' un'altra domanda.** Li' si decide quali
 * strade esistono e quanto contano, e la risposta e' una spezzata di colonne che
 * un test puo' leggere a occhio. Qui si decide quanto sono larghe, ed e' una
 * trasformazione senza scelte: entra un asse, esce un nastro. Tenerle insieme
 * vorrebbe dire non poter piu' verificare la prima senza la seconda.
 *
 * **Il nastro e' continuo per costruzione.** I nodi dell'asse sono adiacenti a
 * otto, quindi due quadrati consecutivi si sovrappongono sempre almeno per un
 * angolo: non serve interpolare fra un nodo e il successivo, e non ci sono buchi
 * da tappare sulle diagonali — che e' esattamente il difetto che un tracciato
 * disegnato per segmenti si porta dietro.
 */

/** Il minimo che serve per allargare una linea d'asse: dove, a che quota, di che rango. */
export interface StrokeInput {
  readonly x: number;
  readonly y: number;
  readonly level: number;
  readonly rank: RoadRank;
}

/** Una colonna di carreggiata da posare. */
export interface RoadSurface extends StrokeInput {}

/** Una colonna di impalcato: come sopra, piu' la pila che eventualmente scende. */
export interface ViaductSurface extends StrokeInput {
  readonly pier: boolean;
}

/**
 * Le colonne di carreggiata di una rete, senza duplicati.
 *
 * Dove due tratti si sovrappongono vince il rango piu' alto, e vince anche sulla
 * quota: e' la stessa regola di priorita' di `surfaceQueue`, e serve alla stessa
 * cosa — un incrocio fra un tronco e un vicolo deve leggersi come il tronco che
 * prosegue, non come due strade che si interrompono a vicenda.
 */
export function strokeRoads(nodes: readonly StrokeInput[]): readonly RoadSurface[] {
  const painted = new Map<string, RoadSurface>();
  widen(nodes, (key, cell) => {
    const current = painted.get(key);
    if (current !== undefined && current.rank >= cell.rank) return;
    painted.set(key, cell);
  });
  return ordered([...painted.values()]);
}

/**
 * Le colonne di un impalcato, con la pila sulla sola linea d'asse.
 *
 * **La pila non si allarga con l'impalcato**, ed e' la ragione per cui questa
 * funzione esiste accanto a quella sopra invece di essere la stessa con un flag:
 * un tronco largo sei voxel su sei pile affiancate non e' un ponte, e' un muro
 * col buco. Una pila sotto il centro e sei voxel di sbalzo ai lati e' invece
 * esattamente il gesto che si vuole vedere.
 */
export function strokeViaduct(columns: readonly ViaductColumn[]): readonly ViaductSurface[] {
  const centres = new Set<string>();
  for (const column of columns) {
    if (column.pier) centres.add(`${column.x},${column.y}`);
  }

  const painted = new Map<string, ViaductSurface>();
  widen(columns, (key, cell) => {
    const current = painted.get(key);
    if (current !== undefined && current.rank >= cell.rank) return;
    painted.set(key, { ...cell, pier: centres.has(key) });
  });
  return ordered([...painted.values()]);
}

/** Il quadrato di lato `rankWidth` attorno a ogni nodo, una cella per volta. */
function widen(
  nodes: readonly StrokeInput[],
  emit: (key: string, cell: StrokeInput) => void,
): void {
  for (const node of nodes) {
    const width = ROADS.rankWidth[node.rank];
    // Larghezza dispari centrata, pari sbilanciata di mezzo voxel verso il
    // basso: e' l'arrotondamento che tiene il nastro allineato al cubo di
    // terreno anche quando la larghezza non e' simmetrica.
    const back = (width - 1) >> 1;
    for (let dy = 0; dy < width; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const x = node.x - back + dx;
        const y = node.y - back + dy;
        emit(`${x},${y}`, { x, y, level: node.level, rank: node.rank });
      }
    }
  }
}

/**
 * Lo stesso ordine totale di `planRoads`.
 *
 * La posa a budget non deve dipendere dall'ordine di inserimento in una mappa:
 * quello segue l'ordine in cui i poli sono stati piantati, e due partite con lo
 * stesso seed mostrerebbero la stessa strada comparire in ordine diverso.
 */
function ordered<T extends StrokeInput>(cells: T[]): readonly T[] {
  cells.sort((a, b) => a.x - b.x || a.y - b.y);
  return cells;
}
