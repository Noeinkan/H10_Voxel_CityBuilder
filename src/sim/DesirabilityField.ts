import { CHUNK, CHUNK_SHIFT, toChunk, toLocal } from '../world/chunkCoords';
import { BALANCE } from './balance';
import { ALL_CLASSES, CLASS_COUNT, type BuildingClass } from './classes';
import { DESIRABILITY_WEIGHT_OF_CLASS, type Weights } from './policies';

/**
 * Campo di desiderabilita' per cella e per classe, chunkato 32x32 come il mondo.
 *
 * Per ogni cella e ogni classe:
 *
 *     D = clamp(somma dei catalizzatori della classe x pesoPolicy - congestione, 0, 255)
 *
 * dove il contributo di un catalizzatore e' `strength * max(0, 1 - dist / radius)`
 * in distanza di Chebyshev, e la congestione e' il numero di edifici entro il
 * raggio breve moltiplicato per `congestionPerBuilding`.
 *
 * **Il campo non accumula: ricalcola.** Ogni cella viene ricostruita dalla lista
 * dei catalizzatori e dal conteggio di affollamento, mai per somme e sottrazioni
 * successive. E' l'unico modo perche' togliere un catalizzatore dia esattamente
 * lo stesso risultato di non averlo mai aggiunto, invece di lasciare residui di
 * arrotondamento; ed e' anche cio' che rende il percorso incrementale e la
 * ricostruzione completa indistinguibili, proprieta' verificata dai test.
 *
 * **Cosa si ricalcola.** Un catalizzatore aggiunto, rimosso o modificato tocca
 * il quadrato di Chebyshev del suo raggio, per la sua sola classe. Un edificio
 * nuovo tocca il quadrato del raggio breve, per tutte le classi. Nient'altro
 * cambia, quindi nient'altro viene visitato: non esiste una passata sull'intera
 * mappa, ne' per tick ne' per operazione.
 *
 * **Il campo tiene anche l'occupazione.** Sapere se una cella e' libera e sapere
 * quanto e' affollata sono la stessa domanda spaziale, con la stessa chunkatura
 * e gli stessi accessi: separarle in due strutture significherebbe pagare due
 * volte la ricerca del chunk in ogni ciclo.
 *
 * Il campo e' un indice mutabile derivato: e' ricostruibile per intero da
 * catalizzatori, edifici e policy, e per questo non entra nella serializzazione
 * dello stato.
 */

/** Celle in una colonna di chunk: 32 x 32, come `COLUMNS_PER_CHUNK` del terreno. */
export const CELLS_PER_CHUNK = CHUNK * CHUNK;

/** Cella libera nella griglia di occupazione. Le classi sono memorizzate come `class + 1`. */
const FREE = 0;

export interface Catalyst {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
  /** Intensita' al centro, 0..255. */
  readonly strength: number;
  /** Raggio di Chebyshev in celle. A distanza pari al raggio il contributo e' esattamente 0. */
  readonly radius: number;
}

/** Un edificio come lo vede il campo: una cella occupata da una classe. */
export interface Building {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
}

/**
 * Vista di sola lettura su una colonna di chunk del campo.
 *
 * Espone i buffer com'e' scritto: chi scandisce l'intero campo — la lista dei
 * candidati, la heatmap di debug — non puo' permettersi una chiamata di metodo
 * e una ricerca di chunk per cella e per classe. Chi la riceve legge e basta;
 * l'unica scrittura al campo passa dai metodi della classe.
 */
export interface FieldChunkView {
  readonly ccx: number;
  readonly ccy: number;
  /** Un array per classe, 1024 valori ciascuno, indicizzati da `cellIndexOf`. */
  readonly values: readonly Uint8Array[];
  /** 0 se la cella e' libera. */
  readonly occupancy: Uint8Array;
}

/** Rettangolo di celle, estremi inclusi. */
export interface CellRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

class FieldChunk {
  readonly key: string;

  /** Un `Uint8Array` per classe, 1024 celle ciascuno. */
  readonly values: readonly Uint8Array[];

  /** 0 se libera, `class + 1` se occupata. */
  readonly occupancy: Uint8Array;

  /** Numero di edifici entro il raggio breve, per cella. */
  readonly crowd: Uint16Array;

  constructor(
    readonly ccx: number,
    readonly ccy: number,
  ) {
    this.key = `${ccx},${ccy}`;
    const values: Uint8Array[] = [];
    for (let i = 0; i < CLASS_COUNT; i++) values.push(new Uint8Array(CELLS_PER_CHUNK));
    this.values = values;
    this.occupancy = new Uint8Array(CELLS_PER_CHUNK);
    this.crowd = new Uint16Array(CELLS_PER_CHUNK);
  }
}

/** Indice lineare di una cella nel chunk. `lx` varia piu' rapidamente. */
export function cellIndexOf(lx: number, ly: number): number {
  return lx + CHUNK * ly;
}

export class DesirabilityField {
  private readonly map = new Map<string, FieldChunk>();

  /** Stessa cache a un elemento del `VoxelWorld`: gli accessi sono spazialmente coerenti. */
  private cache: FieldChunk | null = null;
  private cacheCcx = 0;
  private cacheCcy = 0;

  private occupied = 0;

  /** Celle visitate dall'ultima operazione di ricalcolo. */
  private lastCells = 0;

  /** Celle visitate da tutte le operazioni di ricalcolo, cumulate. */
  private totalCells = 0;

  get chunkCount(): number {
    return this.map.size;
  }

  get occupiedCells(): number {
    return this.occupied;
  }

  /** Celle toccate dall'ultimo ricalcolo. E' il numero su cui si misura l'incrementalita'. */
  get lastRecomputedCells(): number {
    return this.lastCells;
  }

  get totalRecomputedCells(): number {
    return this.totalCells;
  }

  resetCounters(): void {
    this.lastCells = 0;
    this.totalCells = 0;
  }

  /** Colonne di chunk allocate, in sola lettura. Serve alla scansione dei candidati. */
  get chunks(): ReadonlyMap<string, FieldChunkView> {
    return this.map;
  }

  // --- Lettura -------------------------------------------------------------

  /** Desiderabilita' della cella per la classe. 0 fuori dai chunk allocati, senza allocare. */
  valueAt(x: number, y: number, cls: BuildingClass): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return 0;
    return chunk.values[cls][cellIndexOf(toLocal(x), toLocal(y))];
  }

  /** true se nessun edificio occupa la cella. */
  isFree(x: number, y: number): boolean {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return true;
    return chunk.occupancy[cellIndexOf(toLocal(x), toLocal(y))] === FREE;
  }

  /** Classe che occupa la cella, o -1 se libera. */
  occupantAt(x: number, y: number): BuildingClass | -1 {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return -1;
    const stored = chunk.occupancy[cellIndexOf(toLocal(x), toLocal(y))];
    if (stored === FREE) return -1;
    return (stored - 1) as BuildingClass;
  }

  /** Edifici entro il raggio breve dalla cella, la cella stessa inclusa. */
  crowdAt(x: number, y: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return 0;
    return chunk.crowd[cellIndexOf(toLocal(x), toLocal(y))];
  }

  // --- Scrittura -----------------------------------------------------------

  /**
   * Registra un edificio e aggiorna cio' che il suo arrivo cambia: l'occupazione
   * della sua cella e la congestione nel raggio breve.
   *
   * Restituisce false se la cella era gia' occupata, senza toccare nulla.
   */
  addBuilding(building: Building, catalysts: readonly Catalyst[], weights: Weights): boolean {
    const chunk = this.ensureChunk(toChunk(building.x), toChunk(building.y));
    const i = cellIndexOf(toLocal(building.x), toLocal(building.y));
    if (chunk.occupancy[i] !== FREE) return false;

    chunk.occupancy[i] = building.class + 1;
    this.occupied++;

    const radius = BALANCE.desirability.congestionRadius;
    const rect = rectAround(building.x, building.y, radius);
    this.bumpCrowd(rect, 1);
    this.recomputeRect(rect, catalysts, weights, ALL_CLASSES);
    return true;
  }

  /**
   * Ricalcola cio' che l'aggiunta, la rimozione o la modifica di un catalizzatore
   * cambia: il quadrato del suo raggio, per la sua sola classe.
   *
   * `catalysts` e' la lista **gia' aggiornata**: il campo la rilegge per intero
   * su ogni cella toccata, quindi non gli importa se il catalizzatore in
   * questione ci sia ancora o no.
   */
  applyCatalystChange(catalyst: Catalyst, catalysts: readonly Catalyst[], weights: Weights): void {
    const rect = rectAround(catalyst.x, catalyst.y, catalyst.radius);
    this.recomputeRect(rect, catalysts, weights, [catalyst.class]);
  }

  /**
   * Ricostruisce l'intero campo da catalizzatori ed edifici.
   *
   * Non e' sul percorso del tick: serve al caricamento da JSON e al cambio di
   * una policy, che sposta un peso e quindi tutte le celle di quella classe in
   * un colpo solo. Il costo resta legato a catalizzatori ed edifici, non
   * all'estensione della mappa.
   */
  rebuild(catalysts: readonly Catalyst[], buildings: readonly Building[], weights: Weights): void {
    for (const chunk of this.map.values()) {
      for (const values of chunk.values) values.fill(0);
      chunk.occupancy.fill(FREE);
      chunk.crowd.fill(0);
    }
    this.occupied = 0;

    const radius = BALANCE.desirability.congestionRadius;
    for (const building of buildings) {
      const chunk = this.ensureChunk(toChunk(building.x), toChunk(building.y));
      const i = cellIndexOf(toLocal(building.x), toLocal(building.y));
      if (chunk.occupancy[i] !== FREE) continue;
      chunk.occupancy[i] = building.class + 1;
      this.occupied++;
      this.bumpCrowd(rectAround(building.x, building.y, radius), 1);
    }

    for (const catalyst of catalysts) {
      this.recomputeRect(rectAround(catalyst.x, catalyst.y, catalyst.radius), catalysts, weights, [
        catalyst.class,
      ]);
    }
    for (const building of buildings) {
      this.recomputeRect(
        rectAround(building.x, building.y, radius),
        catalysts,
        weights,
        ALL_CLASSES,
      );
    }
  }

  /** Ricostruisce le sole classi indicate, lasciando intatte le altre. */
  rebuildClasses(
    catalysts: readonly Catalyst[],
    buildings: readonly Building[],
    weights: Weights,
    classes: readonly BuildingClass[],
  ): void {
    if (classes.length === 0) return;

    for (const chunk of this.map.values()) {
      for (const cls of classes) chunk.values[cls].fill(0);
    }

    for (const catalyst of catalysts) {
      if (!classes.includes(catalyst.class)) continue;
      this.recomputeRect(rectAround(catalyst.x, catalyst.y, catalyst.radius), catalysts, weights, [
        catalyst.class,
      ]);
    }
    const radius = BALANCE.desirability.congestionRadius;
    for (const building of buildings) {
      this.recomputeRect(rectAround(building.x, building.y, radius), catalysts, weights, classes);
    }
  }

  // --- Nucleo del ricalcolo ------------------------------------------------

  /**
   * Ricalcola da zero le celle del rettangolo per le classi indicate.
   *
   * Il rettangolo e' esatto, non allineato ai chunk: allargarlo ai bordi di
   * chunk trasformerebbe un raggio 20 (1681 celle) in un ricalcolo su 4096.
   */
  private recomputeRect(
    rect: CellRect,
    catalysts: readonly Catalyst[],
    weights: Weights,
    classes: readonly BuildingClass[],
  ): void {
    // Prefiltro: dei catalizzatori sopravvivono solo quelli il cui quadrato
    // interseca il rettangolo. Nel ciclo sulle celle resta una lista corta
    // invece dell'intera citta'.
    const relevant: Catalyst[] = [];
    for (const catalyst of catalysts) {
      if (!classes.includes(catalyst.class)) continue;
      if (catalyst.radius <= 0 || catalyst.strength <= 0) continue;
      if (catalyst.x + catalyst.radius < rect.minX) continue;
      if (catalyst.x - catalyst.radius > rect.maxX) continue;
      if (catalyst.y + catalyst.radius < rect.minY) continue;
      if (catalyst.y - catalyst.radius > rect.maxY) continue;
      relevant.push(catalyst);
    }

    const perBuilding = BALANCE.desirability.congestionPerBuilding;
    const maxValue = BALANCE.limits.maxDesirability;

    // Il peso di policy e' costante su tutto il rettangolo: risolverlo per cella
    // significherebbe due indirezioni per cella per classe.
    const classWeights = classes.map((cls) => weights[DESIRABILITY_WEIGHT_OF_CLASS[cls]]);

    let visited = 0;

    for (let y = rect.minY; y <= rect.maxY; y++) {
      for (let x = rect.minX; x <= rect.maxX; x++) {
        visited++;

        const existing = this.getChunk(toChunk(x), toChunk(y));
        const i = cellIndexOf(toLocal(x), toLocal(y));
        const congestion = existing === null ? 0 : existing.crowd[i] * perBuilding;

        for (let c = 0; c < classes.length; c++) {
          const cls = classes[c];

          let sum = 0;
          for (let k = 0; k < relevant.length; k++) {
            const catalyst = relevant[k];
            if (catalyst.class !== cls) continue;
            const dx = x - catalyst.x;
            const dy = y - catalyst.y;
            const dist = Math.max(dx < 0 ? -dx : dx, dy < 0 ? -dy : dy);
            if (dist >= catalyst.radius) continue;
            sum += catalyst.strength * (1 - dist / catalyst.radius);
          }

          const raw = Math.round(sum * classWeights[c] - congestion);
          const value = raw < 0 ? 0 : raw > maxValue ? maxValue : raw;

          // Scrivere zero in una colonna mai toccata la allocherebbe per nulla:
          // la lettura fuori dai chunk allocati vale gia' zero.
          if (value === 0 && existing === null) continue;
          const chunk = existing ?? this.ensureChunk(toChunk(x), toChunk(y));
          chunk.values[cls][i] = value;
        }
      }
    }

    this.lastCells = visited;
    this.totalCells += visited;
  }

  /** Somma `delta` al conteggio di affollamento di tutte le celle del rettangolo. */
  private bumpCrowd(rect: CellRect, delta: number): void {
    for (let y = rect.minY; y <= rect.maxY; y++) {
      for (let x = rect.minX; x <= rect.maxX; x++) {
        const chunk = this.ensureChunk(toChunk(x), toChunk(y));
        chunk.crowd[cellIndexOf(toLocal(x), toLocal(y))] += delta;
      }
    }
  }

  // --- Chunk ---------------------------------------------------------------

  private getChunk(ccx: number, ccy: number): FieldChunk | null {
    if (this.cache !== null && ccx === this.cacheCcx && ccy === this.cacheCcy) return this.cache;
    const found = this.map.get(`${ccx},${ccy}`);
    if (found === undefined) return null;
    this.cache = found;
    this.cacheCcx = ccx;
    this.cacheCcy = ccy;
    return found;
  }

  private ensureChunk(ccx: number, ccy: number): FieldChunk {
    const existing = this.getChunk(ccx, ccy);
    if (existing !== null) return existing;

    const chunk = new FieldChunk(ccx, ccy);
    this.map.set(chunk.key, chunk);
    this.cache = chunk;
    this.cacheCcx = ccx;
    this.cacheCcy = ccy;
    return chunk;
  }

  /** Coordinata mondo x della prima cella di una colonna di chunk. */
  static originOf(cc: number): number {
    return cc << CHUNK_SHIFT;
  }
}

/** Quadrato di Chebyshev centrato sulla cella, estremi inclusi. */
export function rectAround(x: number, y: number, radius: number): CellRect {
  return { minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius };
}

/** Celle contenute in un rettangolo. Serve ai test e alle misure di incrementalita'. */
export function rectArea(rect: CellRect): number {
  return (rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
}
