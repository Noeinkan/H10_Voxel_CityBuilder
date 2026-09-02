import { BUILDING_CLASS } from '../../sim';
import { hashCoords } from '../rng';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount } from './chunkBudget';
import type { VoxelStamp } from './stamp';

/**
 * La quaterna che ogni driver ripeteva: budget, collisione, record, coda.
 *
 * **Non e' una fabbrica di strutture, e' il contratto di scrittura.** Cosa
 * costruire lo decide il piano del dominio — `spanPlan`, `crossingPlan`,
 * `guideway`, `ropewayPlan`, tutti puri e tutti al loro posto — e qui arriva
 * solo il volume gia' deciso. Quello che era scritto quattro volte con quattro
 * nomi diversi e' cio' che viene dopo: misurare quanti chunk sporcherebbe,
 * chiedere al registry se il posto e' libero, scrivere il record, accodare i
 * voxel. Le variazioni erano nell'ordine dei due rifiuti e nel nome delle
 * variabili, mai nella sostanza.
 *
 * **Tre funzioni e non una, perche' la funivia ha bisogno di due tempi.** Una
 * linea sono due torri, e la seconda che non entra deve fermare anche la prima:
 * `structureFits` risponde senza scrivere, `writeStructure` scrive senza
 * richiedere. Verificare tutto e poi scrivere tutto non e' la stessa cosa che
 * verificare-e-scrivere due volte — la prima torre scritta cambia il registry
 * sotto la verifica della seconda — ed e' il comportamento di prima. Chi posa un
 * pezzo solo chiama `placeStructure`, che le mette insieme.
 *
 * **Fuori restano i tre driver grandi.** `landmarkDriver`, `arcologyDriver` e
 * `aerialDriver` hanno varianti proprie — opere di terra, pozzi, gambe contate a
 * parte — e farceli entrare vorrebbe dire riportare qui le loro eccezioni, cioe'
 * spostare il problema invece di toglierlo.
 */

/**
 * Un pezzo che si scrive in un colpo solo.
 *
 * **Il tetto di chunk si misura qui e non sull'ingombro**, ed e' tutto il senso
 * di aver spezzato le strutture lunghe: un ponte da cinquanta voxel non compare
 * tutto insieme, quindi misurarlo intero direbbe di no proprio alle strutture
 * per cui i segmenti sono stati fatti.
 */
export interface StructureSegment {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /**
   * I voxel, **a domanda**.
   *
   * Una funzione e non uno stamp gia' fatto: la misura di chunk e la collisione
   * vengono prima, e i driver generavano la sagoma solo dopo averle passate. Con
   * uno stamp pronto, ogni struttura rifiutata pagherebbe una generazione per
   * niente — su una campata sono un migliaio di voxel per segmento.
   */
  readonly stamp: () => VoxelStamp;
}

/**
 * Il record da scrivere, con i tre campi che hanno un default.
 *
 * `class`, `level` e `seed` erano identici in tutti e quattro i driver, commento
 * incluso: una struttura non ha un uso urbano — `tally` la salta e il campo non
 * entra in nessun istogramma — non ha un livello, e il suo seme viene dalla
 * propria colonna. Restano scrivibili perche' un dominio che volesse dire
 * altro deve poterlo dire, non perche' oggi qualcuno lo faccia.
 */
export type StructureRecord =
  Omit<BuildingRecord, 'id' | 'class' | 'level' | 'seed'> &
  Partial<Pick<BuildingRecord, 'class' | 'level' | 'seed'>>;

export interface StructureSpec {
  readonly record: StructureRecord;
  /** Il tetto di chunk sporchi del dominio, per segmento. */
  readonly maxDirtyChunks: number;
  /**
   * Id esclusi dalla collisione: cio' a cui la struttura e' **attaccata**.
   *
   * Un impalcato servito da un montante, i due appoggi di una campata: toccare
   * cio' su cui ci si posa non e' un conflitto, ed e' il piano del dominio ad
   * aver gia' verificato che li' dentro non ci sia altro di solido.
   */
  readonly exempt?: readonly number[];
  /** Le unita' di scrittura. Per un pezzo solo, usa `wholeFootprint`. */
  readonly segments: readonly StructureSegment[];
}

/** Il segmento unico di una struttura che si scrive tutta insieme. */
export function wholeFootprint(
  record: StructureRecord,
  stamp: () => VoxelStamp,
): StructureSegment[] {
  return [{
    x: record.x,
    y: record.y,
    sizeX: record.footprint,
    sizeY: footprintDepth(record),
    stamp,
  }];
}

/**
 * true se questa struttura ci sta: budget di chunk e collisione. **Non scrive.**
 *
 * L'ordine dei due rifiuti e' libero — nessuno dei due tocca niente — e i
 * quattro driver lo avevano infatti in due ordini diversi. Qui il budget viene
 * per primo perche' non interroga il registry.
 */
export function structureFits(ctx: BuildContext, spec: StructureSpec): boolean {
  const { record } = spec;
  const top = record.baseZ + record.height;

  for (const segment of spec.segments) {
    const count = dirtyChunkCount(
      segment.x, segment.y, segment.sizeX, record.baseZ, top, segment.sizeY,
    );
    if (count > spec.maxDirtyChunks) return false;
  }

  return !ctx.registry.overlaps(
    record.x,
    record.y,
    record.footprint,
    record.baseZ,
    record.height,
    footprintDepth(record),
    spec.exempt,
  );
}

/**
 * Scrive la struttura. **Non verifica**: lo ha gia' fatto chi chiama.
 *
 * Il record entra nel registry **prima** della coda, e non e' indifferente: e'
 * il suo id a dire alla crescita di chi sono i voxel che sta per far comparire.
 */
export function writeStructure(ctx: BuildContext, spec: StructureSpec): BuildingRecord {
  const { record } = spec;
  const stored = ctx.registry.add({
    ...record,
    class: record.class ?? BUILDING_CLASS.civic,
    level: record.level ?? 0,
    seed: record.seed ?? hashCoords(ctx.seed, record.x, record.y),
  });

  for (const segment of spec.segments) {
    ctx.growth.enqueue(
      stored.id,
      { x: segment.x, y: segment.y, z: record.baseZ },
      segment.stamp(),
    );
  }
  return stored;
}

/** Verifica e scrive: la strada di chi posa un pezzo solo. null se non ci sta. */
export function placeStructure(ctx: BuildContext, spec: StructureSpec): BuildingRecord | null {
  return structureFits(ctx, spec) ? writeStructure(ctx, spec) : null;
}
