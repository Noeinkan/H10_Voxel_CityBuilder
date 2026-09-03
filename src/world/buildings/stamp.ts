import type { SurfaceKind } from '../visualBlock';

/**
 * Impronta voxel di un edificio: un array 3D compatto di indici di palette con
 * dimensioni proprie.
 *
 * E' il solo linguaggio in cui il generatore parla. Non conosce il `VoxelWorld`,
 * non conosce le coordinate di mondo e non sa a che quota finira': chi lo piazza
 * decide dove, e questo file non ha modo di scoprirlo. E' cio' che permette al
 * generatore di girare in un test senza mondo e senza terreno.
 *
 * **L'ancora e' un voxel 3D, non una cella.** `anchorX/Y/Z` identificano il
 * cubo dello stamp che coincide con l'ancora nel mondo. Non esiste quindi un
 * piano privilegiato nel formato: uno stamp puo' partire dal terreno, da un
 * tetto o da una faccia laterale senza cambiare rappresentazione.
 */

/** Indice di palette che significa "qui non c'e' niente". Coincide con `PALETTE_SLOTS.empty`. */
export const STAMP_EMPTY = 0;

/** Un cubo del mondo usato come origine di un volume, a qualunque quota. */
export interface VoxelAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelStamp {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;

  /** Offset dell'ancora voxel dentro lo stamp. */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly anchorZ: number;

  /** Indici di palette, `sizeX * sizeY * sizeZ` valori. 0 = vuoto. */
  readonly voxels: Uint8Array;

  /** Grammatica visuale parallela a `voxels`; non cambia occupazione o collisioni. */
  readonly surfaces: Uint8Array;

  /**
   * Quota di inizio di ogni fascia, piu' un ultimo elemento pari a `sizeZ`.
   *
   * La comparsa animata scrive una fascia per frame, e senza questo indice
   * dovrebbe ricostruirlo scandendo i voxel a ogni passo. Lo tiene il
   * generatore, che le fasce le ha appena disegnate e sa dove finiscono.
   */
  readonly bandStarts: readonly number[];
}

/**
 * Uno stamp senza un solo voxel.
 *
 * Serve a **demolire con la coda invece che di colpo**: accodato come sagoma
 * nuova con il volume da togliere come `erase`, non scrive niente e cancella
 * tutto, a budget e senza un secondo percorso di scrittura. Il confronto
 * «coperto dalla nuova sagoma» e' falso ovunque perche' i lati sono zero, che e'
 * esattamente la risposta giusta quando la sagoma nuova non esiste.
 */
export const EMPTY_STAMP: VoxelStamp = {
  sizeX: 0,
  sizeY: 0,
  sizeZ: 0,
  anchorX: 0,
  anchorY: 0,
  anchorZ: 0,
  voxels: new Uint8Array(0),
  surfaces: new Uint8Array(0),
  bandStarts: [0],
};

/**
 * Indice lineare dentro lo stamp. `sx` varia piu' rapidamente.
 *
 * E' deliberatamente la stessa disposizione di `idx()` in `chunkCoords.ts`: chi
 * legge un ciclo di scrittura riconosce la forma senza doverla ricontrollare.
 */
export function stampIndex(stamp: VoxelStamp, sx: number, sy: number, sz: number): number {
  return sx + stamp.sizeX * (sy + stamp.sizeY * sz);
}

/** Converte un voxel locale dello stamp nella posizione ancorata nel mondo. */
export function anchoredVoxel(
  anchor: VoxelAnchor,
  stamp: VoxelStamp,
  sx: number,
  sy: number,
  sz: number,
): VoxelAnchor {
  return {
    x: anchor.x + sx - stamp.anchorX,
    y: anchor.y + sy - stamp.anchorY,
    z: anchor.z + sz - stamp.anchorZ,
  };
}

/**
 * true se lo stamp, ancorato li', occupera' quella colonna del mondo.
 *
 * E' l'inverso esatto di `anchoredVoxel`, e serve a interrogare una sagoma
 * **prima che sia scritta**: la promozione deve sapere cosa il volume nuovo
 * occupera' mentre puo' ancora rinunciare. Fuori dai propri lati la risposta e'
 * `false` — uno stamp non dice niente di cio' che gli sta intorno — ed e' quella
 * la risposta giusta qui: cio' che il volume non copre, non lo tocca.
 */
export function stampSolidAt(
  stamp: VoxelStamp,
  anchor: VoxelAnchor,
  x: number,
  y: number,
  z: number,
): boolean {
  const sx = x - anchor.x + stamp.anchorX;
  const sy = y - anchor.y + stamp.anchorY;
  const sz = z - anchor.z + stamp.anchorZ;
  if (sx < 0 || sy < 0 || sz < 0) return false;
  if (sx >= stamp.sizeX || sy >= stamp.sizeY || sz >= stamp.sizeZ) return false;
  return stamp.voxels[stampIndex(stamp, sx, sy, sz)] !== STAMP_EMPTY;
}

/** Numero di fasce dello stamp. */
export function bandCount(stamp: VoxelStamp): number {
  return stamp.bandStarts.length - 1;
}

/** Tipo visuale tipizzato di una cella dello stamp. */
export function stampSurface(stamp: VoxelStamp, index: number): SurfaceKind {
  return stamp.surfaces[index] as SurfaceKind;
}

/** Un ritaglio in pianta di uno stamp, con l'offset da cui parte. */
export interface StampSlice {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly stamp: VoxelStamp;
}

/**
 * Spezza uno stamp in ritagli larghi al massimo `maxSide` in pianta.
 *
 * **Serve al tetto di chunk sporchi, non alla memoria.** Un volume lungo
 * ventisei colonne attraversa piu' piani di chunk di una torre alta, e scriverlo
 * in un colpo solo li marca tutti nello stesso frame: e' il caso che il commento
 * di `maxDirtyChunksPerBuilding` racconta essere gia' andato storto una volta,
 * facendo sparire in silenzio proprio le strutture grandi. Spezzare in ritagli e
 * farli comparire uno per volta riporta il picco a quello di una struttura sola.
 *
 * Uno stamp che ci sta gia' **non viene copiato**: torna lui stesso, e il caso
 * comune — ogni edificio della citta' — non paga niente.
 *
 * Si taglia solo in pianta e mai in quota: una colonna spezzata a meta' altezza
 * comparirebbe in due tempi con una cucitura orizzontale in mezzo, che a schermo
 * si vede. In pianta la cucitura cade fra due colonne, dove non c'e' niente da
 * vedere.
 */
export function sliceStamps(stamp: VoxelStamp, maxSide: number): readonly StampSlice[] {
  if (stamp.sizeX <= maxSide && stamp.sizeY <= maxSide) {
    return [{ offsetX: 0, offsetY: 0, stamp }];
  }

  const out: StampSlice[] = [];
  for (let y0 = 0; y0 < stamp.sizeY; y0 += maxSide) {
    for (let x0 = 0; x0 < stamp.sizeX; x0 += maxSide) {
      const sizeX = Math.min(maxSide, stamp.sizeX - x0);
      const sizeY = Math.min(maxSide, stamp.sizeY - y0);
      out.push({ offsetX: x0, offsetY: y0, stamp: cutout(stamp, x0, y0, sizeX, sizeY) });
    }
  }
  return out;
}

/** Copia un riquadro dello stamp, su tutte le quote. */
function cutout(
  stamp: VoxelStamp,
  x0: number,
  y0: number,
  sizeX: number,
  sizeY: number,
): VoxelStamp {
  const voxels = new Uint8Array(sizeX * sizeY * stamp.sizeZ);
  const surfaces = new Uint8Array(voxels.length);

  for (let sz = 0; sz < stamp.sizeZ; sz++) {
    for (let sy = 0; sy < sizeY; sy++) {
      for (let sx = 0; sx < sizeX; sx++) {
        const from = (x0 + sx) + stamp.sizeX * ((y0 + sy) + stamp.sizeY * sz);
        const to = sx + sizeX * (sy + sizeY * sz);
        voxels[to] = stamp.voxels[from];
        surfaces[to] = stamp.surfaces[from];
      }
    }
  }

  return {
    sizeX,
    sizeY,
    sizeZ: stamp.sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    // Le fasce del ritaglio sono quelle dell'intero: si taglia in pianta, e le
    // quote di inizio non si spostano.
    bandStarts: stamp.bandStarts,
  };
}

/**
 * Quali colonne dello stamp **poggiano**, in pianta.
 *
 * **E' la domanda dell'opera di terra, non del rendering.** Un'impronta
 * rettangolare dice quanto spazio una struttura si riserva; questa dice su cosa
 * si regge, ed e' la differenza fra una banchina e un'isola artificiale: il
 * riquadro di un porto e' per meta' specchio d'acqua, e riempirlo tutto fino
 * alla quota del piano — che e' cio' che `buildWorks` faceva senza maschera —
 * cancellava il mare dentro cui il porto dovrebbe stare.
 *
 * **`maxZ` separa cio' che poggia da cio' che sporge.** Guardare tutte le quote
 * darebbe la risposta sbagliata proprio dove serve: il braccio di una gru passa
 * sopra la darsena a tredici voxel d'altezza, e contarlo vorrebbe dire riempire
 * di terra l'acqua che sorvola. Le prime quote invece sono suolo per costruzione
 * — nessuna ricetta ci mette qualcosa a mezz'aria — e sono quelle che l'opera
 * deve reggere.
 *
 * Si chiede sempre allo **stadio finale**: l'opera si getta una volta sola, al
 * piazzamento, e uno stadio successivo non deve poter scoprire di aver bisogno di
 * terra che nessuno ha costruito.
 */
export function stampFootprint(stamp: VoxelStamp, maxZ: number = stamp.sizeZ): Uint8Array {
  const plan = new Uint8Array(stamp.sizeX * stamp.sizeY);
  const top = Math.min(maxZ, stamp.sizeZ);
  for (let sz = 0; sz < top; sz++) {
    const base = stamp.sizeX * stamp.sizeY * sz;
    for (let i = 0; i < plan.length; i++) {
      if (stamp.voxels[base + i] !== STAMP_EMPTY) plan[i] = 1;
    }
  }
  return plan;
}

/** Uno stamp ridotto alle sole quote piene, con l'offset da cui riparte. */
export interface TrimmedStamp {
  /** Quote saltate in basso: chi lo accoda le somma alla propria ancora. */
  readonly z0: number;
  readonly stamp: VoxelStamp;
}

/**
 * Lo stesso stamp senza le quote vuote in cima e in fondo.
 *
 * **Serve alla stima del tetto di chunk, non alla memoria.** Una struttura a
 * stadi riserva l'inviluppo *finale* fin dal primo — e' cio' che le impedisce di
 * restare bloccata a meta' — quindi la sagoma dello stadio zero e' alta quanto
 * la corona che arrivera' fra mille tick ed e' piena solo in basso.
 * `fitsChunkBudget` misura pero' il riquadro, non i voxel: senza il taglio una
 * ricetta legittima verrebbe **scartata in silenzio**, che e' esattamente il
 * difetto raccontato dal commento di `maxDirtyChunksPerBuilding`.
 *
 * **Si taglia in quota solo qui**, e non e' una deroga al divieto di
 * `sliceStamps`: li' la cucitura cadrebbe a meta' di una colonna che compare in
 * due tempi, e a schermo si vede; qui il taglio segue il pieno, quindi non
 * separa niente che sia gia' stato disegnato.
 *
 * Uno stamp gia' pieno da cima a fondo — ogni edificio della citta' — **non
 * viene copiato**: torna lui stesso con `z0` a zero.
 */
export function trimStampZ(stamp: VoxelStamp): TrimmedStamp {
  const plane = stamp.sizeX * stamp.sizeY;
  if (plane === 0 || stamp.sizeZ === 0) return { z0: 0, stamp };

  let z0 = 0;
  while (z0 < stamp.sizeZ && emptyPlane(stamp, z0, plane)) z0++;
  // Tutto vuoto: non c'e' niente da scrivere, e lo stamp vuoto lo dice meglio di
  // un ritaglio alto zero che porta ancora i lati dell'inviluppo.
  if (z0 === stamp.sizeZ) return { z0: 0, stamp: EMPTY_STAMP };

  let z1 = stamp.sizeZ - 1;
  while (z1 > z0 && emptyPlane(stamp, z1, plane)) z1--;
  if (z0 === 0 && z1 === stamp.sizeZ - 1) return { z0: 0, stamp };

  const sizeZ = z1 - z0 + 1;
  const from = z0 * plane;
  return {
    z0,
    stamp: {
      sizeX: stamp.sizeX,
      sizeY: stamp.sizeY,
      sizeZ,
      anchorX: stamp.anchorX,
      anchorY: stamp.anchorY,
      anchorZ: 0,
      voxels: stamp.voxels.slice(from, from + sizeZ * plane),
      surfaces: stamp.surfaces.slice(from, from + sizeZ * plane),
      // Le fasce dell'inviluppo non descrivono piu' il ritaglio, e la comparsa a
      // budget scorre comunque l'array lineare: una fascia sola e' la risposta
      // onesta, come gia' per i landmark.
      bandStarts: [0, sizeZ],
    },
  };
}

function emptyPlane(stamp: VoxelStamp, z: number, plane: number): boolean {
  const base = z * plane;
  for (let i = 0; i < plane; i++) {
    if (stamp.voxels[base + i] !== STAMP_EMPTY) return false;
  }
  return true;
}

/** Voxel pieni dello stamp. Serve alle misure e ai test, non al percorso caldo. */
export function solidCount(stamp: VoxelStamp): number {
  let count = 0;
  for (let i = 0; i < stamp.voxels.length; i++) {
    if (stamp.voxels[i] !== STAMP_EMPTY) count++;
  }
  return count;
}
