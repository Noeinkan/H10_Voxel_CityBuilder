import { CHUNK, CHUNK_SHIFT, toChunk, toLocal } from '../world/chunkCoords';
import { BALANCE } from './balance';
import { catalystInfluence, catalystRoleOf, type CatalystId } from './catalysts';
import { ALL_CLASSES, CLASS_COUNT, type BuildingClass } from './classes';
// Solo il tipo: `districts.ts` importa a sua volta `Catalyst` da qui, e un
// `import type` si cancella in compilazione invece di chiudere un ciclo a runtime.
import type { Specialization } from './districts';
import { DESIRABILITY_WEIGHT_OF_CLASS, type Weights } from './policies';
import { distAt, falloff, ReachCache, UNIFORM_COST, type ReachField, type StepCost } from './reach';

/**
 * Campo di desiderabilita' per cella e per uso urbano, chunkato 32x32 come il mondo.
 *
 * Per ogni cella e ogni uso:
 *
 *     D = clamp(somma dei catalizzatori x influenza x pesoPolicy - congestione, 0, 255)
 *
 * dove il contributo di un catalizzatore e'
 * `strength * influenza[uso] * falloff(dist / radius)` e la congestione e' il
 * numero di edifici entro il raggio breve moltiplicato per
 * `congestionPerBuilding`.
 *
 * **La distanza e' geodetica e la calcola `reach.ts`**, che e' l'unico posto in
 * cui vive la curva di decadimento. L'influenza si propaga sulle celle
 * percorribili invece che in linea retta: l'acqua la ferma, un dirupo la
 * rallenta, una strada la porta piu' lontano. Con costo di passo uniforme la
 * geodetica coincide esattamente con la distanza di Chebyshev di prima, quindi
 * il campo di un mondo senza terreno e' quello di sempre, cella per cella.
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
 * il quadrato del suo raggio, per i soli usi che influenza davvero
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

/**
 * Cella libera nella griglia di occupazione. Le classi sono memorizzate come
 * `class + 1`.
 *
 * Esportata perche' la scansione dei candidati legge `occupancy` per indice —
 * una chiamata di metodo per cella costava venticinque volte tanto — e un `!== 0`
 * scritto a mano li' sarebbe la stessa convenzione tenuta in due posti.
 */
export const FREE = 0;

export interface Catalyst {
  readonly x: number;
  readonly y: number;
  /** Uso urbano primario; senza `kind` e' anche l'unico che il catalizzatore porta a pieno. */
  readonly class: BuildingClass;
  /** Ruolo, da cui si legge il vettore di influenza. Assente nei salvataggi MVP. */
  readonly kind?: CatalystId;
  /** Intensita' al centro, 0..255. */
  readonly strength: number;
  /**
   * Raggio in celle, misurato in distanza geodetica: a distanza pari al raggio
   * il contributo e' esattamente 0.
   *
   * Resta anche il lato del quadrato che il campo ricalcola, e non e' una
   * coincidenza: il costo di un passo non scende mai sotto 1, quindi la forma
   * non puo' uscire dal quadrato di Chebyshev del suo raggio.
   */
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
  /** Livello edilizio: cambia la capacita' economica, non il campo. */
  readonly level?: number;
  /** Uso secondario ospitato, se l'edificio e' misto. */
  readonly mixed?: BuildingClass;
  /**
   * Specializzazione dichiarata dal costruttore, se ne ha una.
   *
   * **Non cambia il campo e non e' un uso.** Il campo la ignora del tutto: un
   * edificio pesa per la sua classe, e questo campo viaggia solo perche' il
   * bilancio ha bisogno di distinguere `farming` — una torre idroponica occupa
   * suolo industriale ma produce cibo invece di materiali, ed e' l'unica
   * specializzazione che cambia cosa esce da un tick.
   *
   * Il vocabolario e' di `districts.ts`, cioe' di questo modulo: non e' la
   * tipologia edilizia che entra in `src/sim/` (contratto 7), e' la stessa
   * parola che il profilo locale gia' calcola, restituita da chi ha costruito.
   */
  readonly specialization?: Specialization;
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
  /**
   * Le sole colonne con **piu' di una** quota presa, per indice di cella.
   * `null` dove in questo chunk non ne esiste nessuna.
   *
   * **E' la differenza fra «questa cella e' occupata» e «questa cella e'
   * piena».** Finche' la citta' stava tutta a terra le due domande coincidevano,
   * e `occupancy` bastava per entrambe; da quando si costruisce sopra la citta'
   * una colonna con un edificio puo' averne ancora spazio, e a dire quanto e' il
   * mondo — non questo campo, che continua a non avere una coordinata verticale.
   * Qui si contano le quote spese, li' si sa quante ce ne sono.
   *
   * **Sparsa, e non un array denso per cella.** Un byte per colonna sarebbe un
   * byte su tutta l'isola per rappresentare qualcosa che esiste su una manciata
   * di colonne, e per giunta dimensionato sul tetto del formato invece che sui
   * livelli presenti. L'occupazione dice gia' che una quota c'e': qui stanno
   * solo quelle **oltre** la prima, quindi una colonna a un livello solo costa
   * esattamente quello che costava prima che la citta' salisse.
   */
  readonly levels: ReadonlyMap<number, number> | null;
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
  readonly radii: number[];
  readonly amps: number[];
  /** La portata gia' calcolata, una per catalizzatore sopravvissuto al prefiltro. */
  readonly reaches: ReachField[];
}

class FieldChunk {
  readonly key: string;

  /** Un `Uint8Array` per uso urbano, 1024 celle ciascuno. */
  readonly values: readonly Uint8Array[];

  /**
   * 0 se libera, `class + 1` se occupata.
   *
   * E' l'uso del **primo** edificio della colonna e non dell'ultimo: e' quello
   * che decide di che colore si tinge la cella negli overlay, e cambiarlo a ogni
   * piano sovrapposto farebbe lampeggiare la heatmap senza dire niente di piu'.
   */
  readonly occupancy: Uint8Array;

  /**
   * Le colonne di questo chunk che hanno piu' di una quota presa, con il loro
   * conteggio. Nasce `null` e ci torna appena si svuota: la maggioranza dei
   * chunk non ne vede mai una.
   */
  levels: Map<number, number> | null = null;

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

  /**
   * Quote prese sulla cella: 0 libera, 1 occupata, n impilata.
   *
   * L'occupazione e la mappa sparsa si leggono **sempre** insieme, ed e' la
   * ragione per cui questo metodo sta qui e non in tre punti diversi.
   */
  stackOf(i: number): number {
    if (this.occupancy[i] === FREE) return 0;
    return this.levels?.get(i) ?? 1;
  }

  /** Porta la cella da `n` a `n + 1` quote. La cella e' gia' occupata. */
  pushLevel(i: number, spent: number): void {
    const levels = this.levels ?? (this.levels = new Map());
    levels.set(i, spent + 1);
  }

  /**
   * Toglie una quota a una cella impilata, e la voce quando torna a una sola.
   *
   * La mappa torna `null` quando si svuota, non resta vuota: il campo dichiara
   * che togliere N edifici lo lascia com'era se non ci fossero mai stati, e una
   * mappa vuota allocata sarebbe un residuo — piccolo, ma un residuo.
   */
  popLevel(i: number, spent: number): void {
    const levels = this.levels;
    if (levels === null) return;
    if (spent > 2) levels.set(i, spent - 1);
    else levels.delete(i);
    if (levels.size === 0) this.levels = null;
  }
}

/** Indice lineare di una cella nel chunk. `lx` varia piu' rapidamente. */
export function cellIndexOf(lx: number, ly: number): number {
  return lx + CHUNK * ly;
}

export class DesirabilityField {
  private readonly map = new Map<string, FieldChunk>();

  /**
   * Portate gia' calcolate, una per catalizzatore.
   *
   * Vive qui e non nello stato perche' ha la stessa natura del campo: e' un
   * indice derivato, si ricostruisce da catalizzatori e costo, e non entra
   * nella serializzazione. Il Dijkstra si paga percio' una volta per
   * piazzamento e non a ogni ricalcolo — cio' che tiene il ciclo per cella
   * dov'era, con una lettura da un typed array al posto di un `Math.max`.
   */
  readonly reach: ReachCache;

  /** Stessa cache a un elemento del `VoxelWorld`: gli accessi sono spazialmente coerenti. */
  private cache: FieldChunk | null = null;
  private cacheCcx = 0;
  private cacheCcy = 0;

  private occupied = 0;

  /** Celle visitate dall'ultima operazione di ricalcolo. */
  private lastCells = 0;

  /** Celle visitate da tutte le operazioni di ricalcolo, cumulate. */
  private totalCells = 0;

  /**
   * Il costo di attraversamento entra come funzione e non come `TerrainMap`:
   * `src/sim/` resta puro, e a leggere terreno e strade e' chi li ha in mano.
   * Senza, la portata e' la distanza di Chebyshev di sempre.
   */
  constructor(cost: StepCost = UNIFORM_COST) {
    this.reach = new ReachCache(cost);
  }

  get chunkCount(): number {
    return this.map.size;
  }

  get occupiedCells(): number {
    return this.occupied;
  }

  /**
   * Byte occupati dai buffer **densi** del campo.
   *
   * Si somma da `byteLength` invece di moltiplicare costanti a mano: aggiungere
   * un uso urbano allarga l'occupazione, e una formula scritta a parte sarebbe
   * il primo posto a restare indietro. Serve alla misura di memoria, che e' un
   * criterio di accettazione e non una curiosita'.
   *
   * Le quote oltre la prima non sono qui e non ci devono essere: stanno in una
   * mappa sparsa che non ha un `byteLength` onesto da dichiarare, e a misurarla
   * e' `stackedColumns`. E' la ragione per cui questo numero non cresce quando
   * la citta' sale.
   */
  get byteLength(): number {
    let total = 0;
    for (const chunk of this.map.values()) {
      for (const values of chunk.values) total += values.byteLength;
      total += chunk.occupancy.byteLength + chunk.crowd.byteLength;
    }
    return total;
  }

  /**
   * Colonne con piu' di una quota presa. E' il costo della citta' in quota,
   * misurato dove viene speso: sulle colonne che la ospitano davvero.
   */
  get stackedColumns(): number {
    let total = 0;
    for (const chunk of this.map.values()) total += chunk.levels?.size ?? 0;
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

  /** Quote prese nella cella. Zero dove non c'e' niente. */
  stackAt(x: number, y: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return 0;
    return chunk.stackOf(cellIndexOf(toLocal(x), toLocal(y)));
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
   * della sua cella, le quote spese e la congestione nel raggio breve.
   *
   * **Una cella gia' occupata non e' piu' un rifiuto.** Lo era finche' la citta'
   * stava tutta a terra e una colonna valeva un edificio; da quando ci si
   * costruisce sopra, quel `false` sarebbe il campo che decide quante quote
   * esistono — cioe' proprio la coordinata verticale che questo modulo non deve
   * avere (invariante 7). A dire fin dove si sale e' il mondo, che interroga il
   * campo *prima* di chiamare: qui resta solo il tetto di `BALANCE`, che e' una
   * regola e non piu' un limite di formato.
   *
   * **La congestione somma anche i piani sovrapposti**, ed e' voluto: una citta'
   * impilata *e'* piu' densa, e un secondo livello che non si sentisse nella
   * congestione darebbe quartieri in quota senza nessuno dei costi della densita'.
   */
  addBuilding(building: Building, catalysts: readonly Catalyst[], weights: Weights): boolean {
    const chunk = this.ensureChunk(toChunk(building.x), toChunk(building.y));
    const i = cellIndexOf(toLocal(building.x), toLocal(building.y));
    const spent = chunk.stackOf(i);
    if (spent >= BALANCE.limits.maxStackPerColumn) return false;

    if (spent === 0) {
      chunk.occupancy[i] = building.class + 1;
      this.occupied++;
    } else {
      // La prima quota la dice gia' l'occupazione: la mappa sparsa comincia
      // dalla seconda, ed e' cio' che tiene il costo sui livelli presenti.
      chunk.pushLevel(i, spent);
    }

    const radius = BALANCE.desirability.congestionRadius;
    const rect = rectAround(building.x, building.y, radius);
    this.bumpCrowd(rect, 1);
    this.recomputeRect(rect, catalysts, weights, ALL_CLASSES);
    return true;
  }

  /**
   * Toglie degli edifici e riporta il campo a com'era prima che ci fossero.
   *
   * **"Esatto" e' il requisito, non l'ambizione.** Togliere N edifici deve dare
   * lo stesso campo di non averli mai aggiunti, byte per byte: l'equivalenza fra
   * percorso incrementale e `rebuild` e' la proprieta' su cui poggia tutto il
   * modulo, e varrebbe in una direzione sola se la rimozione lasciasse residui.
   *
   * **`survivors` serve a una cosa sola: l'occupazione.** `occupancy` tiene l'uso
   * del *primo* edificio della colonna, quindi togliere proprio quello lascia la
   * cella tinta di un uso che non c'e' piu'. Chi resta lo sa solo la lista
   * aggiornata, e una passata su di essa costa molto meno di quanto costerebbe
   * sbagliare: questa e' un'operazione del giocatore, non del tick.
   *
   * Il ricalcolo si fa su **un** rettangolo che li racchiude tutti e non su uno
   * per edificio. Chi demolisce demolisce un'impronta compatta — il riquadro di
   * un landmark — e i quadrati di congestione di celle vicine si sovrappongono
   * quasi del tutto: ricalcolarli uno per uno rifarebbe le stesse celle N volte.
   */
  removeBuildings(
    removed: readonly Building[],
    survivors: readonly Building[],
    catalysts: readonly Catalyst[],
    weights: Weights,
  ): void {
    if (removed.length === 0) return;

    const radius = BALANCE.desirability.congestionRadius;
    const cells: { readonly x: number; readonly y: number }[] = [];
    const seen = new Set<string>();
    let touched: CellRect | null = null;

    for (const building of removed) {
      const chunk = this.ensureChunk(toChunk(building.x), toChunk(building.y));
      const i = cellIndexOf(toLocal(building.x), toLocal(building.y));
      // Una cella a zero non e' un errore del chiamante: `addBuilding` rifiuta
      // chi sfora il tetto di quote, e quell'edificio nel campo non e' mai
      // entrato. Toglierlo lo stesso sfonderebbe il contatore verso il basso.
      const spent = chunk.stackOf(i);
      if (spent === 0) continue;

      // L'ultima quota di una colonna e' l'occupazione stessa, quindi toglierla
      // e' liberare la cella; le altre stanno nella mappa sparsa. Chi resta si
      // ritinge piu' sotto, quando si sa chi e' il primo dei superstiti.
      if (spent > 1) chunk.popLevel(i, spent);
      else {
        chunk.occupancy[i] = FREE;
        this.occupied--;
      }

      const key = `${building.x},${building.y}`;
      if (!seen.has(key)) {
        seen.add(key);
        cells.push({ x: building.x, y: building.y });
      }

      const around = rectAround(building.x, building.y, radius);
      this.bumpCrowd(around, -1);
      touched = touched === null ? around : unionRect(touched, around);
    }

    if (touched === null) return;

    const first = new Map<string, BuildingClass>();
    for (const building of survivors) {
      const key = `${building.x},${building.y}`;
      if (!seen.has(key) || first.has(key)) continue;
      first.set(key, building.class);
    }

    for (const cell of cells) {
      const chunk = this.ensureChunk(toChunk(cell.x), toChunk(cell.y));
      const i = cellIndexOf(toLocal(cell.x), toLocal(cell.y));
      // La colonna svuotata l'ha gia' liberata il ciclo sopra: qui resta solo
      // chi e' rimasto in piedi e va ritinto dell'uso del primo superstite.
      if (chunk.occupancy[i] === FREE) continue;
      const survivor = first.get(`${cell.x},${cell.y}`);
      if (survivor !== undefined) chunk.occupancy[i] = survivor + 1;
    }

    this.recomputeRect(touched, catalysts, weights, ALL_CLASSES);
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
    // Spostare o cambiare un catalizzatore ne cambia la portata: la voce vecchia
    // parlerebbe di un centro che non c'e' piu'.
    this.reach.invalidate(catalyst.x, catalyst.y, catalyst.radius);
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
      chunk.levels = null;
      chunk.crowd.fill(0);
    }
    this.occupied = 0;

    const radius = BALANCE.desirability.congestionRadius;
    for (const building of buildings) {
      const chunk = this.ensureChunk(toChunk(building.x), toChunk(building.y));
      const i = cellIndexOf(toLocal(building.x), toLocal(building.y));
      // Le quote si **sommano**, non si saltano: saltare il duplicato darebbe una
      // ricostruzione diversa dal percorso incrementale, e quella equivalenza e'
      // la proprieta' su cui poggia tutto il resto del modulo.
      const spent = chunk.stackOf(i);
      if (spent >= BALANCE.limits.maxStackPerColumn) continue;
      if (spent === 0) {
        chunk.occupancy[i] = building.class + 1;
        this.occupied++;
      } else chunk.pushLevel(i, spent);
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
      const group: CatalystGroup = { cls, radii: [], amps: [], reaches: [] };
      const weight = weights[DESIRABILITY_WEIGHT_OF_CLASS[cls]];

      for (const catalyst of catalysts) {
        if (catalyst.radius <= 0 || catalyst.strength <= 0) continue;
        const influence = catalystInfluence(catalystRoleOf(catalyst))[cls];
        if (influence === 0) continue;
        // Il prefiltro resta sul quadrato: la portata geodetica non puo'
        // uscirne, perche' un passo non costa mai meno di una cella.
        if (catalyst.x + catalyst.radius < rect.minX) continue;
        if (catalyst.x - catalyst.radius > rect.maxX) continue;
        if (catalyst.y + catalyst.radius < rect.minY) continue;
        if (catalyst.y - catalyst.radius > rect.maxY) continue;
        group.radii.push(catalyst.radius);
        group.amps.push(catalyst.strength * influence * weight);
        group.reaches.push(this.reach.get(catalyst.x, catalyst.y, catalyst.radius));
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
            const dist = distAt(group.reaches[k], x, y);
            const radius = group.radii[k];
            if (dist >= radius) continue;
            sum += group.amps[k] * falloff(dist / radius);
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

/** Il piu' piccolo rettangolo che contiene entrambi. */
function unionRect(a: CellRect, b: CellRect): CellRect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Celle contenute in un rettangolo. Serve ai test e alle misure di incrementalita'. */
export function rectArea(rect: CellRect): number {
  return (rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
}
