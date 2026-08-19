import { CLASS_COUNT, type BuildingClass, type DistrictId } from '../../sim';
import type { BuildingForm } from './config';
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

  /** Lato dell'impronta, 1..3. */
  readonly footprint: number;

  /** Voxel occupati in altezza a partire da `baseZ`. */
  readonly height: number;

  readonly class: BuildingClass;
  readonly level: number;
  readonly seed: number;
  /** Profilo locale congelato per poter rigenerare esattamente lo stamp. */
  readonly form?: BuildingForm;
  readonly district?: DistrictId;
}

/**
 * Cio' che il resto del progetto puo' fare al registry: leggere.
 *
 * Il tipo esiste per essere il parametro di chiunque non sia il Builder. Non e'
 * una convenzione da rispettare a memoria: chi riceve questo tipo non ha
 * proprio i metodi per scrivere.
 */
export interface ReadonlyBuildingRegistry {
  get(id: number): BuildingRecord | null;
  at(x: number, y: number): readonly BuildingRecord[];
  withinRadius(x: number, y: number, radius: number): readonly BuildingRecord[];
  overlaps(x: number, y: number, footprint: number, baseZ: number, height: number): boolean;
  /** Quota della prima cella libera sopra cio' che gia' occupa la colonna. */
  topOf(x: number, y: number): number;
  readonly count: number;
  readonly countsByClass: readonly number[];
  readonly levelHistogram: readonly number[];
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
   * Id per colonna di chunk, con la stessa chunkatura del resto del progetto.
   *
   * Serve solo a `withinRadius`: senza, una query per raggio scandirebbe tutti i
   * record della citta', e con duemila edifici e' esattamente la scansione che
   * non ci si puo' permettere in un ciclo.
   */
  private readonly buckets = new Map<string, number[]>();

  private readonly classCounts = new Array<number>(CLASS_COUNT).fill(0);
  private readonly levelCounts: number[] = [];

  private nextId = 1;

  get count(): number {
    return this.records.size;
  }

  get countsByClass(): readonly number[] {
    return this.classCounts;
  }

  get levelHistogram(): readonly number[] {
    return this.levelCounts;
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
          out.push(record);
        }
      }
    }

    return out;
  }

  /**
   * true se il volume proposto tocca un edificio esistente.
   *
   * Due volumi sulla stessa colonna ma con intervalli di quota disgiunti non si
   * sovrappongono: e' la condizione che permette a un edificio di poggiare
   * esattamente sul tetto di un altro.
   */
  overlaps(x: number, y: number, footprint: number, baseZ: number, height: number): boolean {
    const top = baseZ + height;
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const ids = this.columns.get(`${x + dx},${y + dy}`);
        if (ids === undefined) continue;
        for (const id of ids) {
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

    for (let dy = 0; dy < stored.footprint; dy++) {
      for (let dx = 0; dx < stored.footprint; dx++) {
        push(this.columns, `${stored.x + dx},${stored.y + dy}`, stored.id);
      }
    }
    push(this.buckets, `${toChunk(stored.x)},${toChunk(stored.y)}`, stored.id);

    this.classCounts[stored.class]++;
    this.levelCounts[stored.level] = (this.levelCounts[stored.level] ?? 0) + 1;
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

    for (let dy = 0; dy < stored.footprint; dy++) {
      for (let dx = 0; dx < stored.footprint; dx++) {
        push(this.columns, `${stored.x + dx},${stored.y + dy}`, id);
      }
    }
    push(this.buckets, `${toChunk(stored.x)},${toChunk(stored.y)}`, id);

    this.classCounts[stored.class]++;
    this.levelCounts[stored.level] = (this.levelCounts[stored.level] ?? 0) + 1;
    return stored;
  }

  /** Toglie un record da tutti e due gli indici. */
  remove(id: number): boolean {
    const record = this.records.get(id);
    if (record === undefined) return false;

    for (let dy = 0; dy < record.footprint; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        drop(this.columns, `${record.x + dx},${record.y + dy}`, id);
      }
    }
    drop(this.buckets, `${toChunk(record.x)},${toChunk(record.y)}`, id);

    this.classCounts[record.class]--;
    this.levelCounts[record.level]--;
    this.records.delete(id);
    return true;
  }
}

function push(index: Map<string, number[]>, key: string, id: number): void {
  const existing = index.get(key);
  if (existing === undefined) index.set(key, [id]);
  else existing.push(id);
}

function drop(index: Map<string, number[]>, key: string, id: number): void {
  const existing = index.get(key);
  if (existing === undefined) return;
  const at = existing.indexOf(id);
  if (at !== -1) existing.splice(at, 1);
  if (existing.length === 0) index.delete(key);
}

function isRecord(record: BuildingRecord | undefined): record is BuildingRecord {
  return record !== undefined;
}
