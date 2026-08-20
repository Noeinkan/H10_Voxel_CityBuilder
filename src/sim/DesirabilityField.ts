import { CHUNK, CHUNK_SHIFT, toChunk, toLocal } from '../world/chunkCoords';
import { BALANCE } from './balance';
import { catalystInfluence, catalystRoleOf, type CatalystId } from './catalysts';
import { ALL_CLASSES, CLASS_COUNT, type BuildingClass } from './classes';
import { DESIRABILITY_WEIGHT_OF_CLASS, type Weights } from './policies';

/**
 * Campo di desiderabilita' per cella e per uso urbano, chunkato 32x32 come il mondo.
 *
 * Per ogni cella e ogni uso:
 *
 *     D = clamp(somma dei catalizzatori x influenza x pesoPolicy - congestione, 0, 255)
 *
 * dove il contributo di un catalizzatore e'
 * `strength * influenza[uso] * max(0, 1 - dist / radius)` in distanza di
 * Chebyshev, e la congestione e' il numero di edifici entro il raggio breve
 * moltiplicato per `congestionPerBuilding`.
 *
 * **Un catalizzatore parla a piu' usi.** L'influenza e' un vettore, non una
 * classe: un mercato somma su residenziale e commerciale, una fabbrica somma
 * sull'industriale e *sottrae* dal residenziale. Il segno negativo non ha
 * bisogno di un meccanismo suo — il clamp a zero era gia' li'.
 *
 * **Il campo non accumula: ricalcola.** Ogni cella viene ricostruita dalla lista
 * dei catalizzatori e dal conteggio di affollamento, mai per somme e sottrazioni
 * successive. E' l'unico modo perche' togliere un catalizzatore dia esattamente
 * lo stesso risultato di non averlo mai aggiunto, invece di lasciare residui di
 * arrotondamento; ed e' anche cio' che rende il percorso incrementale e la
 * ricostruzione completa indistinguibili, proprieta' verificata dai test.
 *
 * **Cosa si ricalcola.** Un catalizzatore aggiunto, rimosso o modificato tocca
 * il quadrato di Chebyshev del suo raggio, per i soli usi che influenza davvero
 * — gli zeri della tabella non costano una passata. Un edificio nuovo tocca il
 * quadrato del raggio breve, per tutti gli usi. Nient'altro cambia, quindi
 * nient'altro viene visitato: non esiste una passata sull'intera mappa, ne' per
 * tick ne' per operazione.
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
  /** Uso urbano primario; senza `kind` e' anche l'unico che il catalizzatore porta a pieno. */
  readonly class: BuildingClass;
  /** Ruolo, da cui si legge il vettore di influenza. Assente nei salvataggi MVP. */
  readonly kind?: CatalystId;
  /** Intensita' al centro, 0..255. */
  readonly strength: number;
  /** Raggio di Chebyshev in celle. A distanza pari al raggio il contributo e' esattamente 0. */
  readonly radius: number;
}

/**
 * Un edificio come lo vede il campo: una cella occupata da un uso primario, con
 * un eventuale secondo uso ospitato nello stesso volume.
 *
 * Il secondo uso non occupa una seconda cella e non crea una seconda zona:
 * cambia solo cosa quell'edificio produce nel bilancio. Per il campo — che
 * ragiona per occupazione e congestione — un edificio misto e' un edificio.
 */
export interface Building {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
  /** Uso secondario ospitato, se l'edificio e' misto. */
  readonly mixed?: BuildingClass;
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
  /** Un array per uso urbano, 1024 valori ciascuno, indicizzati da `cellIndexOf`. */
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

/**
 * Catalizzatori che contano per un uso, in array paralleli.
 *
 * Array paralleli e non un array di oggetti: il ciclo interno gira una volta per
 * cella per catalizzatore, ed e' l'unico punto del progetto dove la differenza
 * fra leggere quattro campi contigui e inseguire quattro puntatori si vede in
 * profilo.
 */
interface CatalystGroup {
  readonly cls: BuildingClass;
  readonly xs: number[];
  readonly ys: number[];
  readonly radii: number[];
  readonly amps: number[];
}

class FieldChunk {
  readonly key: string;

  /** Un `Uint8Array` per uso urbano, 1024 celle ciascuno. */
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

  /**
   * Byte occupati dai buffer del campo.
   *
   * Si somma da `byteLength` invece di moltiplicare costanti a mano: aggiungere
   * un uso urbano allarga l'occupazione, e una formula scritta a parte sarebbe
   * il primo posto a restare indietro. Serve alla misura di memoria, che e' un
   * criterio di accettazione e non una curiosita'.
   */
  get byteLength(): number {
    let total = 0;
    for (const chunk of this.map.values()) {
      for (const values of chunk.values) total += values.byteLength;
      total += chunk.occupancy.byteLength + chunk.crowd.byteLength;
    }
    return total;
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

  /** Desiderabilita' della cella per l'uso. 0 fuori dai chunk allocati, senza allocare. */
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

  /** Uso primario che occupa la cella, o -1 se libera. */
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
    this.recomputeRect(rect, catalysts, weights, influencedClasses(catalyst));
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
      this.recomputeRect(
        rectAround(catalyst.x, catalyst.y, catalyst.radius),
        catalysts,
        weights,
        influencedClasses(catalyst),
      );
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
      const touched = influencedClasses(catalyst).filter((cls) => classes.includes(cls));
      if (touched.length === 0) continue;
      this.recomputeRect(
        rectAround(catalyst.x, catalyst.y, catalyst.radius),
        catalysts,
        weights,
        touched,
      );
    }
    const radius = BALANCE.desirability.congestionRadius;
    for (const building of buildings) {
      this.recomputeRect(rectAround(building.x, building.y, radius), catalysts, weights, classes);
    }
  }

  // --- Nucleo del ricalcolo ------------------------------------------------

  /**
   * Ricalcola da zero le celle del rettangolo per gli usi indicati.
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
    // Prefiltro, un gruppo per uso da ricalcolare. Sopravvive un catalizzatore
    // solo se il suo quadrato interseca il rettangolo *e* se quell'uso lo
    // sente davvero: un ruolo neutro su un uso non deve costare un giro di
    // ciclo per cella, e con quattro usi gli zeri della tabella sono la meta'.
    //
    // L'ampiezza e' precalcolata: `strength x influenza x pesoPolicy` e'
    // costante su tutto il rettangolo, quindi nel ciclo per cella resta una
    // moltiplicazione sola invece di tre.
    const groups: CatalystGroup[] = [];
    for (const cls of classes) {
      const group: CatalystGroup = { cls, xs: [], ys: [], radii: [], amps: [] };
      const weight = weights[DESIRABILITY_WEIGHT_OF_CLASS[cls]];

      for (const catalyst of catalysts) {
        if (catalyst.radius <= 0 || catalyst.strength <= 0) continue;
        const influence = catalystInfluence(catalystRoleOf(catalyst))[cls];
        if (influence === 0) continue;
        if (catalyst.x + catalyst.radius < rect.minX) continue;
        if (catalyst.x - catalyst.radius > rect.maxX) continue;
        if (catalyst.y + catalyst.radius < rect.minY) continue;
        if (catalyst.y - catalyst.radius > rect.maxY) continue;
        group.xs.push(catalyst.x);
        group.ys.push(catalyst.y);
        group.radii.push(catalyst.radius);
        group.amps.push(catalyst.strength * influence * weight);
      }

      groups.push(group);
    }

    const perBuilding = BALANCE.desirability.congestionPerBuilding;
    const maxValue = BALANCE.limits.maxDesirability;

    let visited = 0;

    for (let y = rect.minY; y <= rect.maxY; y++) {
      for (let x = rect.minX; x <= rect.maxX; x++) {
        visited++;

        const existing = this.getChunk(toChunk(x), toChunk(y));
        const i = cellIndexOf(toLocal(x), toLocal(y));
        const congestion = existing === null ? 0 : existing.crowd[i] * perBuilding;

        for (let g = 0; g < groups.length; g++) {
          const group = groups[g];

          let sum = 0;
          for (let k = 0; k < group.amps.length; k++) {
            const dx = x - group.xs[k];
            const dy = y - group.ys[k];
            const dist = Math.max(dx < 0 ? -dx : dx, dy < 0 ? -dy : dy);
            const radius = group.radii[k];
            if (dist >= radius) continue;
            sum += group.amps[k] * (1 - dist / radius);
          }

          const raw = Math.round(sum - congestion);
          const value = raw < 0 ? 0 : raw > maxValue ? maxValue : raw;

          // Scrivere zero in una colonna mai toccata la allocherebbe per nulla:
          // la lettura fuori dai chunk allocati vale gia' zero.
          if (value === 0 && existing === null) continue;
          const chunk = existing ?? this.ensureChunk(toChunk(x), toChunk(y));
          chunk.values[group.cls][i] = value;
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

/**
 * Usi che un catalizzatore tocca davvero.
 *
 * Un ruolo neutro su un uso non ne cambia nemmeno una cella, quindi non merita
 * un rettangolo di ricalcolo: e' il filtro che tiene il costo di un piazzamento
 * dov'era prima che gli usi diventassero quattro.
 */
function influencedClasses(catalyst: Catalyst): readonly BuildingClass[] {
  const influence = catalystInfluence(catalystRoleOf(catalyst));
  return ALL_CLASSES.filter((cls) => influence[cls] !== 0);
}

/** Quadrato di Chebyshev centrato sulla cella, estremi inclusi. */
export function rectAround(x: number, y: number, radius: number): CellRect {
  return { minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius };
}

/** Celle contenute in un rettangolo. Serve ai test e alle misure di incrementalita'. */
export function rectArea(rect: CellRect): number {
  return (rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
}
