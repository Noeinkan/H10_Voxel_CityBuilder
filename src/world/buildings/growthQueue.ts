import type { VoxelWorld } from '../VoxelWorld';
import type { BuildingRecord } from './BuildingRegistry';
import { BUILDER } from './config';
import {
  anchoredVoxel,
  sliceStamps,
  stampSurface,
  STAMP_EMPTY,
  type VoxelAnchor,
  type VoxelStamp,
} from './stamp';

/**
 * La coda con cui i volumi compaiono, e le sole scritture che li disegnano.
 *
 * **E' l'unico posto da cui un edificio arriva nel mondo a budget.** Il Builder
 * decideva *cosa* costruire e insieme *come farlo comparire*; qui resta la
 * seconda meta', che non sa cosa sia un edificio — vede ancore, stamp e un
 * `ownerId` da confrontare. Le tre invarianti che il costo per frame regge
 * (tetto di volumi in volo, un segmento per struttura, la nuova sagoma prima
 * della cancellazione) vivono percio' tutte in un file solo, invece di essere
 * sparse fra cinque metodi privati che nessuno poteva verificare separatamente.
 */

/**
 * Un volume da scrivere, con la propria ancora.
 *
 * **Porta un'ancora e non un record**, e non e' un dettaglio: e' cio' che
 * permette a piu' stamp di appartenere allo stesso record e di comparire uno
 * dopo l'altro. Finche' l'ancora era `record.x, record.y, record.baseZ` una
 * struttura era per forza un blocco solo, e un molo lungo ventisei colonne
 * doveva o sforare il tetto di chunk sporchi o farselo alzare — che e'
 * esattamente cio' che la 4.12 aveva fatto e lasciato aperto qui.
 *
 * `ownerId` resta perche' le guardie chiedono «questo record sta gia'
 * comparendo?», non «questo volume».
 */
interface Growing {
  readonly ownerId: number;
  readonly anchor: VoxelAnchor;
  readonly stamp: VoxelStamp;
  /** Impronta precedente: i soli voxel non coperti dalla nuova vengono rimossi. */
  readonly erase: VoxelStamp | null;
  voxelCursor: number;
  eraseCursor: number;
}

/**
 * Un volume in attesa di un posto nella coda di comparsa.
 *
 * **Un segmento per volta, per struttura.** Accodare tutti i segmenti di un molo
 * insieme non ridurrebbe niente: i chunk si sporcano man mano che le scritture
 * atterrano, e sei segmenti in volo li sporcano tutti e sei nello stesso frame.
 * E' l'ammissione a scaglioni a tenere il picco a quello di una struttura sola,
 * ed e' il motivo per cui questa coda esiste invece di un `push` diretto.
 */
type Pending = Omit<Growing, 'voxelCursor' | 'eraseCursor'>;

/** Ancora di un record: l'angolo minimo dell'impronta alla sua quota di base. */
export function anchorOf(record: BuildingRecord): VoxelAnchor {
  return { x: record.x, y: record.y, z: record.baseZ };
}

export class GrowthQueue {
  private readonly growing: Growing[] = [];
  private readonly pending: Pending[] = [];

  constructor(private readonly world: VoxelWorld) {}

  /** Volumi che stanno comparendo in questo momento. */
  get growingCount(): number {
    return this.growing.length;
  }

  /** Volumi in coda o in attesa: e' il numero su cui le passate si fermano. */
  get queued(): number {
    return this.growing.length + this.pending.length;
  }

  /** true se il record sta gia' comparendo, o ha segmenti che aspettano. */
  isGrowing(id: number): boolean {
    return this.growing.some((entry) => entry.ownerId === id) ||
      this.pending.some((entry) => entry.ownerId === id);
  }

  /**
   * Toglie dalla coda ogni volume del record, in volo o in attesa.
   *
   * Serve all'annullamento della gomma: prima si ferma la cancellazione in
   * corso, poi chi annulla ri-accoda lo stamp vero per farlo ricrescere. I voxel
   * gia' cancellati non si ripristinano qui — li riscrive la coda nuova.
   */
  cancel(id: number): void {
    for (let i = this.growing.length - 1; i >= 0; i--) {
      if (this.growing[i].ownerId === id) this.growing.splice(i, 1);
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].ownerId === id) this.pending.splice(i, 1);
    }
  }

  /** I record che stanno comparendo, in coda o in attesa. */
  busyIds(): ReadonlySet<number> {
    const busy = new Set<number>();
    for (const entry of this.growing) busy.add(entry.ownerId);
    for (const entry of this.pending) busy.add(entry.ownerId);
    return busy;
  }

  /**
   * Accoda un volume. Compare quando la coda gli fa posto.
   *
   * E' l'unica strada per far comparire voxel a budget: passandoci anche i
   * segmenti, «una struttura per volta» resta vero senza che nessun chiamante
   * debba ricordarselo.
   */
  enqueue(
    ownerId: number,
    anchor: VoxelAnchor,
    stamp: VoxelStamp,
    erase: VoxelStamp | null = null,
  ): void {
    this.pending.push({ ownerId, anchor, stamp, erase });
  }

  /**
   * Accoda uno stamp spezzandolo se e' piu' largo di un segmento.
   *
   * E' la strada dei volumi grossi — i landmark lineari, e da qui in avanti
   * chiunque altro ne abbia bisogno. Uno stamp che ci sta gia' non viene copiato:
   * `sliceStamps` restituisce l'originale, e il caso comune non paga niente.
   *
   * `zOffset` serve a chi accoda un ritaglio in quota (`trimStampZ`): la sagoma
   * comincia piu' in alto della base del record, e senza questo scarto
   * ricomparirebbe appoggiata a terra.
   */
  enqueueSegments(record: BuildingRecord, stamp: VoxelStamp, zOffset = 0): void {
    const anchor = anchorOf(record);
    for (const slice of sliceStamps(stamp, BUILDER.segmentSide)) {
      this.enqueue(record.id, {
        x: anchor.x + slice.offsetX,
        y: anchor.y + slice.offsetY,
        z: anchor.z + zOffset,
      }, slice.stamp);
    }
  }

  /**
   * Scrive singoli cubi dei volumi in crescita. Una chiamata per frame.
   *
   * Il costo per frame e' `maxGrowing * voxelsPerFrame` voxel, indipendente da
   * quanto e' grande la citta': e' il motivo per cui le comparse non fanno
   * cadere il frame rate quando gli edifici sono duemila invece di dieci.
   */
  step(): void {
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const entry = this.growing[i];
      let budget = BUILDER.voxelsPerFrame;

      if (entry.voxelCursor < entry.stamp.voxels.length) {
        const write = this.writeVoxelBatch(entry.anchor, entry.stamp, entry.voxelCursor, budget);
        entry.voxelCursor = write.cursor;
        budget -= write.written;
      }

      // Prima compare la nuova sagoma, poi spariscono soltanto le parti che non
      // le appartengono piu'. Cosi' un upgrade non cancella centinaia di voxel
      // in un singolo frame e l'edificio non lampeggia nel vuoto.
      if (entry.voxelCursor >= entry.stamp.voxels.length && entry.erase !== null && budget > 0) {
        const clear = this.clearObsoleteVoxelBatch(
          entry.anchor,
          entry.erase,
          entry.stamp,
          entry.eraseCursor,
          budget,
        );
        entry.eraseCursor = clear.cursor;
      }

      const writeDone = entry.voxelCursor >= entry.stamp.voxels.length;
      const clearDone = entry.erase === null || entry.eraseCursor >= entry.erase.voxels.length;
      if (writeDone && clearDone) this.growing.splice(i, 1);
    }

    this.admitPending();
  }

  /**
   * Fa entrare in coda i segmenti in attesa, **uno per struttura**.
   *
   * Il tetto di chunk sporchi vale per il singolo volume scritto, quindi due
   * segmenti dello stesso molo in volo insieme lo raddoppierebbero: e' l'ordine
   * a farne un budget, non il conteggio.
   */
  private admitPending(): void {
    for (let i = 0; i < this.pending.length && this.growing.length < BUILDER.maxGrowing;) {
      const next = this.pending[i];
      if (this.growing.some((entry) => entry.ownerId === next.ownerId)) {
        i++;
        continue;
      }
      this.pending.splice(i, 1);
      this.growing.push({ ...next, voxelCursor: 0, eraseCursor: 0 });
    }
  }

  /** Scrive le quote `[fromZ, toZ)` di uno stamp. `clear` scrive vuoto invece del colore. */
  writeStamp(
    anchor: VoxelAnchor,
    stamp: VoxelStamp,
    fromZ: number,
    toZ: number,
    clear: boolean,
  ): void {
    for (let sz = fromZ; sz < toZ; sz++) {
      for (let sy = 0; sy < stamp.sizeY; sy++) {
        for (let sx = 0; sx < stamp.sizeX; sx++) {
          const index = sx + stamp.sizeX * (sy + stamp.sizeY * sz);
          const id = stamp.voxels[index];
          if (id === STAMP_EMPTY) continue;
          const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
          this.world.setBlock(
            voxel.x,
            voxel.y,
            voxel.z,
            clear ? STAMP_EMPTY : id,
            clear ? undefined : stampSurface(stamp, index),
          );
        }
      }
    }
  }

  /** Svuota un volume, saltando le celle gia' vuote per non sporcare chunk a vuoto. */
  clearVolume(
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
    minZ: number,
    maxZ: number,
  ): void {
    for (let z = minZ; z < maxZ; z++) {
      for (let cy = y; cy < y + sizeY; cy++) {
        for (let cx = x; cx < x + sizeX; cx++) {
          if (this.world.getBlock(cx, cy, z) !== STAMP_EMPTY) {
            this.world.setBlock(cx, cy, z, STAMP_EMPTY);
          }
        }
      }
    }
  }

  /** Scrive un numero limitato di cubi solidi, dal basso verso l'alto. */
  private writeVoxelBatch(
    anchor: VoxelAnchor,
    stamp: VoxelStamp,
    from: number,
    budget: number,
  ): { cursor: number; written: number } {
    const plane = stamp.sizeX * stamp.sizeY;
    let cursor = from;
    let written = 0;
    while (cursor < stamp.voxels.length && written < budget) {
      const id = stamp.voxels[cursor];
      if (id !== STAMP_EMPTY) {
        const sz = Math.floor(cursor / plane);
        const within = cursor - sz * plane;
        const sy = Math.floor(within / stamp.sizeX);
        const sx = within - sy * stamp.sizeX;
        const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
        this.world.setBlock(voxel.x, voxel.y, voxel.z, id, stampSurface(stamp, cursor));
        written++;
      }
      cursor++;
    }
    return { cursor, written };
  }

  /**
   * Rimuove a budget soltanto i voxel vecchi che la nuova sagoma non copre.
   *
   * **Il confronto passa dalle ancore, e prima non lo faceva.** Gli indici locali
   * di due stamp descrivono la stessa colonna del mondo solo se i due stamp sono
   * ancorati allo stesso punto: era vero per costruzione finche' ogni edificio
   * era ancorato in `(0,0,0)`, e ha smesso di esserlo da quando uno sbalzo puo'
   * spostare l'ancora di due colonne. Con due ancore diverse il confronto diretto
   * cancella i voxel sbagliati — e lo fa in silenzio, lasciando buchi nella sagoma
   * nuova e pezzi della vecchia in piedi.
   */
  private clearObsoleteVoxelBatch(
    anchor: VoxelAnchor,
    previous: VoxelStamp,
    next: VoxelStamp,
    from: number,
    budget: number,
  ): { cursor: number; written: number } {
    const previousPlane = previous.sizeX * previous.sizeY;
    let cursor = from;
    let written = 0;

    while (cursor < previous.voxels.length && written < budget) {
      if (previous.voxels[cursor] !== STAMP_EMPTY) {
        const sz = Math.floor(cursor / previousPlane);
        const within = cursor - sz * previousPlane;
        const sy = Math.floor(within / previous.sizeX);
        const sx = within - sy * previous.sizeX;
        // Stessa colonna del mondo, letta nei due sistemi locali: si passa per
        // l'ancora, che e' l'unico punto che i due stamp hanno in comune.
        const nx = sx - previous.anchorX + next.anchorX;
        const ny = sy - previous.anchorY + next.anchorY;
        const nz = sz - previous.anchorZ + next.anchorZ;
        const covered = nx >= 0 && ny >= 0 && nz >= 0 &&
          nx < next.sizeX && ny < next.sizeY && nz < next.sizeZ &&
          next.voxels[nx + next.sizeX * (ny + next.sizeY * nz)] !== STAMP_EMPTY;
        if (!covered) {
          const voxel = anchoredVoxel(anchor, previous, sx, sy, sz);
          this.world.setBlock(voxel.x, voxel.y, voxel.z, STAMP_EMPTY);
          written++;
        }
      }
      cursor++;
    }

    return { cursor, written };
  }
}
