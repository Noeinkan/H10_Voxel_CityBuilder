import {
  CLASS_COUNT,
  type BuildingClass,
  type CatalystId,
  type DistrictId,
  type Specialization,
} from '../../sim';
import type { BuildingForm } from './config';
import type { SpanKind } from '../spans/config';
import { toChunk } from '../chunkCoords';

/**
 * Unica fonte di verita' su cosa esiste.
 *
 * Il mondo voxel sa quali celle sono piene ma non sa perche': un muro e un
 * pezzo di collina sono lo stesso byte. Il registry sa che quei voxel sono un
 * edificio, di che classe, di che livello e con che seed — abbastanza da
 * rigenerarne l'impronta e cancellarla, senza conservarne una copia.
 *
 * **Non scrive voxel e non conosce il `VoxelWorld`.** E' un indice, non un
 * costruttore: chi lo interroga decide cosa farne. L'unico a scrivere resta il
 * Builder.
 *
 * **L'occupazione e' tridimensionale.** L'isola ha XY limitato e la citta'
 * cresce in altezza: due edifici sulla stessa colonna a quote disgiunte sono
 * legali, e devono esserlo, altrimenti la crescita verticale sarebbe impossibile
 * per costruzione. Il test di sovrapposizione confronta quindi anche gli
 * intervalli in z, non solo i riquadri.
 */

export interface BuildingRecord {
  readonly id: number;

  /** Angolo minimo dell'impronta sul piano di terra. */
  readonly x: number;
  readonly y: number;

  /** Voxel d'ancoraggio in altezza: la prima quota occupata. */
  readonly baseZ: number;

  /** Lato dell'impronta lungo x. Per un edificio e' anche l'unico lato. */
  readonly footprint: number;

  /**
   * Lato dell'impronta lungo y, quando non coincide con `footprint`.
   *
   * Gli edifici sono quadrati per contratto — la fascia di base riempie il
   * riquadro, e la collisione resta un confronto fra due quadrati. I landmark
   * no: un molo, una pista e un viadotto sono lineari per natura, e
   * schiacciarli in un quadrato li farebbe leggere come monconi. Resta
   * opzionale perche' un record quadrato non deve portarsi dietro un campo che
   * ripete `footprint`.
   */
  readonly footprintY?: number;

  /** Voxel occupati in altezza a partire da `baseZ`. */
  readonly height: number;

  /** Uso urbano primario. */
  readonly class: BuildingClass;

  /**
   * Secondo uso ospitato, se l'edificio e' misto.
   *
   * Sta nel registry e non solo nella simulazione perche' serve a ridisegnarlo:
   * il podio prende il colore e la grammatica del secondo uso, e senza questo
   * campo un upgrade lo perderebbe.
   */
  readonly mixed?: BuildingClass;

  readonly level: number;
  readonly seed: number;
  /** Profilo locale congelato per poter rigenerare esattamente lo stamp. */
  readonly form?: BuildingForm;
  /**
   * Tipologia con cui l'edificio e' stato scritto.
   *
   * E' l'altra meta' di cio' che serve a rigenerarne l'impronta: seed e livello
   * danno la sequenza, la tipologia da' la forma su cui quella sequenza si
   * applica. Cancellare un edificio rigenerandolo con la tipologia che il luogo
   * esprime *adesso* lascerebbe voxel orfani.
   */
  readonly typology?: string;
  readonly district?: DistrictId;
  readonly specialization?: Specialization | null;
  /**
   * Faccia rivolta alla strada, negli indici di `accentFace`.
   *
   * Sta nel record per la stessa ragione di `typology`: e' meta' di cio' che
   * serve a rigenerare l'impronta. Un upgrade che ricalcolasse l'orientamento
   * dalla rete di adesso cancellerebbe la sagoma vecchia con una nuova che
   * porta l'accento su un'altra faccia, e lascerebbe voxel orfani.
   */
  readonly facing?: number;

  /**
   * Ruolo del catalizzatore, se questo record e' il suo landmark.
   *
   * **E' l'unica cosa che distingue un landmark da un edificio.** Tutto il
   * resto — occupazione, collisione, budget di chunk, comparsa a budget,
   * avanzamento — e' la stessa macchina, e `level` e' lo stadio. Cambia solo
   * quale generatore disegna lo stamp, ed e' cio' che ha permesso di aggiungere
   * otto strutture senza una seconda passata e senza un secondo indice.
   *
   * Un record con questo campo resta fuori dagli istogrammi: la simulazione non
   * lo ha mai contato come edificio, e vederlo comparire in `countsByClass`
   * significherebbe che l'HUD conta otto edifici che nessuno ha costruito.
   */
  readonly landmark?: CatalystId;

  /**
   * Fila di edifici contigui a cui questo appartiene, se ne ha una.
   *
   * **Un cluster e' due numeri su un record, non un'entita'.** Questo dice solo
   * *con chi*; l'altro e' `baseBand`. La quota condivisa non ha bisogno di un
   * campo suo, perche' e' gia' `baseZ`. Non esiste nessuna struttura che
   * sopravviva ai membri, ed e' il motivo per cui collisione, budget di chunk e
   * cancellazione restano esattamente quelli di un edificio solo.
   */
  readonly cluster?: number;

  /**
   * Altezza in voxel del corso di base condiviso con la fila. Zero o assente
   * dove la fila non ne ha uno.
   *
   * Sta nel record per la stessa ragione di `typology` e `facing`: e' meta' di
   * cio' che serve a rigenerare l'impronta. Un upgrade che ricalcolasse il
   * basamento dalla fila di adesso cancellerebbe la sagoma vecchia con una che
   * parte da un'altra quota, e bucherebbe lo zoccolo sotto il vicino.
   */
  readonly baseBand?: number;

  /**
   * Tipo di campata, se questo record e' una campata e non un edificio.
   *
   * **E' l'altra meta' del mestiere di `landmark`**, e la stessa mossa: un flag
   * dice quale generatore disegna lo stamp, e tutto il resto — occupazione,
   * collisione, budget di chunk, comparsa a budget — resta la macchina che c'e'
   * gia'. A distinguere una campata da un landmark c'e' un fatto solo, ed e'
   * quello che la fase 4.5 esiste per introdurre: **una campata non prende
   * suolo**. Non entra in `groundColumns`, quindi sotto un ponte la carreggiata
   * si dipinge ancora e i lotti si costruiscono ancora.
   *
   * `baseZ` smette qui di venire dal terreno: e' la prima cosa che poggia su
   * altre cose, ed e' l'assunzione che la 4.9 dovra' rompere comunque.
   */
  readonly span?: SpanKind;

  /**
   * Gli id degli edifici su cui la campata poggia.
   *
   * Sono il suo posto nella rete e insieme il suo guinzaglio: quando uno di
   * questi cambia livello o sagoma la campata cade, perche' la sagoma su cui si
   * appoggiava non esiste piu'. Un appoggio che fosse solo un numero lascerebbe
   * campate a mezz'aria, che e' esattamente cio' che il vincolo della fase vieta.
   */
  readonly supports?: readonly number[];
}

/** Profondita' dell'impronta lungo y: quella dichiarata, o il lato quadrato. */
export function footprintDepth(record: {
  readonly footprint: number;
  readonly footprintY?: number;
}): number {
  return record.footprintY ?? record.footprint;
}

/**
 * Cio' che il resto del progetto puo' fare al registry: leggere.
 *
 * Il tipo esiste per essere il parametro di chiunque non sia il Builder. Non e'
 * una convenzione da rispettare a memoria: chi riceve questo tipo non ha
 * proprio i metodi per scrivere.
 */
export interface ReadonlyBuildingRegistry {
  /**
   * Tutti i record, in ordine di inserimento.
   *
   * E' una lettura come le altre — l'iteratore non espone niente con cui
   * scrivere — e serve a chi deve passare in rassegna la citta' intera: la
   * passata di upgrade, gli overlay, i test di forma urbana. L'alternativa
   * sarebbe scandire le colonne con `at`, che risponderebbe la stessa cosa
   * costando quanto la mappa invece che quanto la citta'.
   */
  readonly all: IterableIterator<BuildingRecord>;
  get(id: number): BuildingRecord | null;
  /**
   * true se un qualunque edificio **prende il suolo** di questa colonna.
   *
   * E' `at(x, y).length > 0` senza il costo di `at`, che materializza un array
   * di record per rispondere. La differenza non conta su una colonna, conta
   * quando la ricerca di un lotto ne interroga qualche migliaio per infornata.
   *
   * **Le campate non contano.** La domanda qui e' «questo suolo e' preso», e un
   * ponte scavalca il suolo senza prenderlo: sotto ci passa ancora la
   * carreggiata e ci nasce ancora un lotto. Chi vuole sapere se un *volume* e'
   * libero chiede a `overlaps`, che confronta anche le quote.
   */
  isOccupied(x: number, y: number): boolean;
  at(x: number, y: number): readonly BuildingRecord[];
  withinRadius(x: number, y: number, radius: number): readonly BuildingRecord[];
  /**
   * Quanti record cadono entro `radius`, senza materializzarli.
   *
   * E' `withinRadius(...).length` senza l'array, e la differenza non e' di stile:
   * la gerarchia verticale chiede «quanto e' costruito qui attorno» una volta per
   * record esaminato in una passata di upgrade, cioe' decine di volte per
   * passata, e in un centro denso ogni domanda tocca qualche centinaio di record.
   * Costruire quell'array per leggerne solo la lunghezza era, misurato, la meta'
   * del costo della passata.
   */
  countWithinRadius(x: number, y: number, radius: number): number;
  overlaps(
    x: number,
    y: number,
    footprint: number,
    baseZ: number,
    height: number,
    footprintY?: number,
    except?: readonly number[],
  ): boolean;
  /** Quota della prima cella libera sopra cio' che gia' occupa la colonna. */
  topOf(x: number, y: number): number;
  readonly count: number;
  /** Landmark dei catalizzatori: contati a parte, mai fra gli edifici. */
  readonly landmarkCount: number;
  /**
   * Le campate esistenti, in ordine di inserimento.
   *
   * Sono unita', non migliaia, e si tengono in un indice proprio invece di
   * filtrare `all`: la rete in quota si ricostruisce a ogni passata, e farlo
   * scandendo la citta' intera sarebbe l'unica cosa nel ciclo il cui costo
   * cresce con il numero di edifici.
   */
  readonly spans: readonly BuildingRecord[];
  /** Quante campate esistono, senza materializzarle. */
  readonly spanCount: number;
  /** Le campate che poggiano su questo edificio. */
  spansOf(supportId: number): readonly BuildingRecord[];
  readonly countsByClass: readonly number[];
  /** Edifici che *ospitano* un uso come secondo, con la stessa indicizzazione. */
  readonly mixedByClass: readonly number[];
  readonly levelHistogram: readonly number[];
  /** Edifici per tipologia, in ordine di prima comparsa. Serve all'overlay. */
  readonly typologyHistogram: ReadonlyMap<string, number>;
}

const EMPTY: readonly BuildingRecord[] = [];

export class BuildingRegistry implements ReadonlyBuildingRegistry {
  private readonly records = new Map<number, BuildingRecord>();

  /**
   * Id che coprono una colonna. Un'impronta e' al massimo 3x3, quindi un
   * edificio compare in al massimo nove voci: e' cio' che rende il test di
   * sovrapposizione esatto invece che approssimato da un riquadro.
   */
  private readonly columns = new Map<string, number[]>();

  /**
   * Le sole colonne di cui qualcuno **prende il suolo**.
   *
   * E' `columns` meno le campate, e vive separato invece di essere un filtro
   * perche' `isOccupied` sta nel percorso caldo di `placeLot`, dove le colonne
   * si contano a migliaia per infornata: filtrare vorrebbe dire risolvere gli id
   * in record proprio li'. Cosi' la domanda «questo suolo e' preso» costa
   * esattamente quello che costava prima, e un ponte non toglie un lotto a
   * nessuno.
   */
  private readonly groundColumns = new Map<string, number[]>();

  /** Le campate, per poterle scorrere senza scandire la citta'. */
  private readonly spanIds = new Set<number>();

  /**
   * Campate per edificio che le regge.
   *
   * E' il guinzaglio del vincolo della fase: quando un appoggio cambia livello o
   * sagoma, da qui si ritrova in O(1) cosa deve cadere con lui.
   */
  private readonly spansBySupport = new Map<number, number[]>();

  /**
   * Id per colonna di chunk, con la stessa chunkatura del resto del progetto.
   *
   * Serve solo a `withinRadius`: senza, una query per raggio scandirebbe tutti i
   * record della citta', e con duemila edifici e' esattamente la scansione che
   * non ci si puo' permettere in un ciclo.
   */
  private readonly buckets = new Map<string, number[]>();

  private readonly classCounts = new Array<number>(CLASS_COUNT).fill(0);
  private readonly mixedCounts = new Array<number>(CLASS_COUNT).fill(0);
  private readonly levelCounts: number[] = [];
  private readonly typologyCounts = new Map<string, number>();

  private landmarks = 0;
  private nextId = 1;

  /**
   * Edifici veri: landmark e campate occupano il registry ma non sono edifici.
   *
   * La simulazione non li ha mai registrati con `addBuilding`, e contarli qui
   * farebbe divergere gli istogrammi dell'HUD dai conteggi su cui il bilancio
   * ragiona.
   */
  get count(): number {
    return this.records.size - this.landmarks - this.spanIds.size;
  }

  get landmarkCount(): number {
    return this.landmarks;
  }

  get spans(): readonly BuildingRecord[] {
    const out: BuildingRecord[] = [];
    for (const id of this.spanIds) {
      const record = this.records.get(id);
      if (record !== undefined) out.push(record);
    }
    return out;
  }

  get spanCount(): number {
    return this.spanIds.size;
  }

  spansOf(supportId: number): readonly BuildingRecord[] {
    const ids = this.spansBySupport.get(supportId);
    if (ids === undefined) return EMPTY;
    return ids.map((id) => this.records.get(id)).filter(isRecord);
  }

  get countsByClass(): readonly number[] {
    return this.classCounts;
  }

  get mixedByClass(): readonly number[] {
    return this.mixedCounts;
  }

  get levelHistogram(): readonly number[] {
    return this.levelCounts;
  }

  get typologyHistogram(): ReadonlyMap<string, number> {
    return this.typologyCounts;
  }

  /** Tutti i record, in ordine di inserimento. La passata di upgrade li scorre. */
  get all(): IterableIterator<BuildingRecord> {
    return this.records.values();
  }

  get(id: number): BuildingRecord | null {
    return this.records.get(id) ?? null;
  }

  at(x: number, y: number): readonly BuildingRecord[] {
    const ids = this.columns.get(`${x},${y}`);
    if (ids === undefined) return EMPTY;
    return ids.map((id) => this.records.get(id)).filter(isRecord);
  }

  isOccupied(x: number, y: number): boolean {
    const ids = this.groundColumns.get(`${x},${y}`);
    return ids !== undefined && ids.length > 0;
  }

  /**
   * Quota della prima cella libera sopra la colonna.
   *
   * E' il punto d'ancoraggio di chi vuole costruire sopra qualcosa. Restituisce
   * 0 su una colonna libera: chi costruisce a terra parte dal terreno, e la
   * quota del terreno la sa la `TerrainMap`, non il registry.
   */
  topOf(x: number, y: number): number {
    let top = 0;
    for (const record of this.at(x, y)) {
      const above = record.baseZ + record.height;
      if (above > top) top = above;
    }
    return top;
  }

  /** Record il cui angolo minimo cade entro `radius` in distanza di Chebyshev. */
  withinRadius(x: number, y: number, radius: number): readonly BuildingRecord[] {
    const out: BuildingRecord[] = [];
    this.scanRadius(x, y, radius, (record) => { out.push(record); });
    return out;
  }

  countWithinRadius(x: number, y: number, radius: number): number {
    let count = 0;
    this.scanRadius(x, y, radius, () => { count++; });
    return count;
  }

  /**
   * Scorre i record entro `radius`, senza raccoglierli.
   *
   * Un punto solo per le due domande — «quali» e «quanti» — perche' la
   * chunkatura dei bucket e il filtro di Chebyshev sono la parte che deve restare
   * identica fra loro: due copie divergerebbero al primo raggio che cambia.
   */
  private scanRadius(
    x: number,
    y: number,
    radius: number,
    visit: (record: BuildingRecord) => void,
  ): void {
    const minCc = toChunk(x - radius);
    const maxCc = toChunk(x + radius);
    const minCcy = toChunk(y - radius);
    const maxCcy = toChunk(y + radius);

    for (let ccy = minCcy; ccy <= maxCcy; ccy++) {
      for (let ccx = minCc; ccx <= maxCc; ccx++) {
        const ids = this.buckets.get(`${ccx},${ccy}`);
        if (ids === undefined) continue;
        for (const id of ids) {
          const record = this.records.get(id);
          if (record === undefined) continue;
          if (Math.abs(record.x - x) > radius || Math.abs(record.y - y) > radius) continue;
          visit(record);
        }
      }
    }
  }

  /**
   * true se il volume proposto tocca un edificio esistente.
   *
   * Due volumi sulla stessa colonna ma con intervalli di quota disgiunti non si
   * sovrappongono: e' la condizione che permette a un edificio di poggiare
   * esattamente sul tetto di un altro.
   *
   * **`except` e' per chi si appoggia a qualcosa.** Una campata atterra dove i
   * corpi si affacciano davvero, e le fasce alte sono rientrate: l'impalcato
   * passa quindi sopra le fasce basse dei propri appoggi, dentro il loro riquadro
   * ma nel loro vuoto. Toccare cio' a cui si e' attaccati non e' una collisione —
   * e' come ci si attacca. Tutto il resto resta vietato.
   */
  overlaps(
    x: number,
    y: number,
    footprint: number,
    baseZ: number,
    height: number,
    footprintY: number = footprint,
    except: readonly number[] = EMPTY_IDS,
  ): boolean {
    const top = baseZ + height;
    for (let dy = 0; dy < footprintY; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const ids = this.columns.get(`${x + dx},${y + dy}`);
        if (ids === undefined) continue;
        for (const id of ids) {
          if (except.includes(id)) continue;
          const record = this.records.get(id);
          if (record === undefined) continue;
          if (record.baseZ < top && baseZ < record.baseZ + record.height) return true;
        }
      }
    }
    return false;
  }

  // --- Scrittura -------------------------------------------------------------

  /** Registra un edificio e restituisce il record con l'id assegnato. */
  add(record: Omit<BuildingRecord, 'id'>): BuildingRecord {
    const stored: BuildingRecord = { ...record, id: this.nextId++ };
    this.records.set(stored.id, stored);
    this.index(stored);
    this.tally(stored, 1);
    return stored;
  }

  /**
   * Sostituisce un record esistente conservandone l'id.
   *
   * E' l'upgrade: stesso edificio, geometria nuova. Passa da qui e non da una
   * coppia `remove` + `add` perche' l'id e' cio' che lega il record ai voxel gia'
   * scritti, e cambiarlo renderebbe impossibile dire quale volume cancellare.
   */
  replace(id: number, next: Omit<BuildingRecord, 'id'>): BuildingRecord | null {
    if (!this.records.has(id)) return null;
    this.remove(id);
    const stored: BuildingRecord = { ...next, id };
    this.records.set(id, stored);
    this.index(stored);
    this.tally(stored, 1);
    return stored;
  }

  /**
   * Mette un record in tutti gli indici che lo riguardano.
   *
   * `columns` li prende tutti, perche' e' quello che regge `overlaps`: niente
   * puo' essere costruito **attraverso** una campata. `groundColumns` prende
   * solo chi il suolo lo occupa davvero, ed e' la differenza che permette a un
   * ponte di scavalcare una carreggiata senza togliere a nessuno ne' la strada
   * ne' il lotto.
   */
  private index(record: BuildingRecord): void {
    const depth = footprintDepth(record);
    const takesGround = record.span === undefined;

    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        const key = `${record.x + dx},${record.y + dy}`;
        push(this.columns, key, record.id);
        if (takesGround) push(this.groundColumns, key, record.id);
      }
    }
    push(this.buckets, `${toChunk(record.x)},${toChunk(record.y)}`, record.id);

    if (takesGround) return;
    this.spanIds.add(record.id);
    for (const support of record.supports ?? EMPTY_IDS) {
      push(this.spansBySupport, support, record.id);
    }
  }

  /** L'inverso esatto di `index`. */
  private unindex(record: BuildingRecord): void {
    const depth = footprintDepth(record);
    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        const key = `${record.x + dx},${record.y + dy}`;
        drop(this.columns, key, record.id);
        drop(this.groundColumns, key, record.id);
      }
    }
    drop(this.buckets, `${toChunk(record.x)},${toChunk(record.y)}`, record.id);

    if (record.span === undefined) return;
    this.spanIds.delete(record.id);
    for (const support of record.supports ?? EMPTY_IDS) {
      drop(this.spansBySupport, support, record.id);
    }
  }

  /**
   * Somma `delta` a tutti i contatori derivati di un record.
   *
   * Un punto solo per tre istogrammi: `add`, `replace` e `remove` li toccavano
   * tutti, e ogni contatore aggiunto altrove sarebbe stato un'occasione per
   * dimenticarne uno dei tre.
   */
  private tally(record: BuildingRecord, delta: number): void {
    // Un landmark occupa spazio ma non e' un edificio: la simulazione non lo ha
    // mai registrato con `addBuilding`, e contarlo qui farebbe divergere gli
    // istogrammi dell'HUD dai conteggi su cui il bilancio ragiona.
    if (record.landmark !== undefined) {
      this.landmarks += delta;
      return;
    }
    // Vale identico per una campata, che non e' nemmeno appoggiata al suolo:
    // il suo conto lo tiene `spanIds`, ed e' `index` a riempirlo.
    if (record.span !== undefined) return;

    this.classCounts[record.class] += delta;
    if (record.mixed !== undefined) this.mixedCounts[record.mixed] += delta;
    this.levelCounts[record.level] = (this.levelCounts[record.level] ?? 0) + delta;
    if (record.typology !== undefined) {
      const next = (this.typologyCounts.get(record.typology) ?? 0) + delta;
      if (next <= 0) this.typologyCounts.delete(record.typology);
      else this.typologyCounts.set(record.typology, next);
    }
  }

  /** Toglie un record da tutti gli indici. */
  remove(id: number): boolean {
    const record = this.records.get(id);
    if (record === undefined) return false;

    this.unindex(record);
    this.tally(record, -1);
    this.records.delete(id);
    return true;
  }
}

/** Nessun appoggio: un edificio non e' una campata e non ne ha. */
const EMPTY_IDS: readonly number[] = [];

function push<K>(index: Map<K, number[]>, key: K, id: number): void {
  const existing = index.get(key);
  if (existing === undefined) index.set(key, [id]);
  else existing.push(id);
}

function drop<K>(index: Map<K, number[]>, key: K, id: number): void {
  const existing = index.get(key);
  if (existing === undefined) return;
  const at = existing.indexOf(id);
  if (at !== -1) existing.splice(at, 1);
  if (existing.length === 0) index.delete(key);
}

function isRecord(record: BuildingRecord | undefined): record is BuildingRecord {
  return record !== undefined;
}
