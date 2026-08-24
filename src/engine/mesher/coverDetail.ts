import { CEILING_VOL, CHUNK, FACE_NZ, PADDED, PADDED_VOL } from '../../world/chunkCoords';
import { hashCoords } from '../../world/rng';
import {
  COVER_FORM,
  coverFormOn,
  coverToneOn,
  type CoverForm,
} from '../../world/terrain/groundcover';
import { blockPalette, coverMarkKind, isCoverMark, SURFACE_KIND } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import type { ChunkOrigin, FixedBox, MicroGeometryWriter } from './microGeometry';

/**
 * Erbette, fiori e sassi in prismi da 1/16, al posto della cella che li porta.
 *
 * **E' l'unico dettaglio che sostituisce del volume invece di aggiungersene.**
 * Tutta la microgeometria di `microGeometry.ts` si appoggia a una facciata o a
 * un tetto che restano dove sono; qui la cella del ciuffo viene tolta dal volume
 * *prima* del greedy pass e non torna piu' come cubo. Ne segue tutto il resto:
 * il sollevamento e' una fase a se' e non un emettitore, sta in questo modulo e
 * non in quello dei dettagli, e il volume va rimesso a posto alla fine — chi
 * chiama `greedyMesh` riusa lo stesso buffer, e un mesher che consuma il proprio
 * input sarebbe una trappola.
 *
 * **Toglierla e' meta' del guadagno, non un prezzo da pagare.** Un cubo di
 * copertura buca il piano superiore del terreno, e ogni buco spezza le corse del
 * merge greedy; toglierlo le ricuce. Con lui se ne va anche l'AO che proiettava
 * attorno a se', che era l'ombra di un dado grande un quarto di cella.
 *
 * Il mondo dice *dove* e *che tipo* (`packCoverMark`); la tinta la dice il
 * terreno sotto, via la tabella di `groundcover.ts`. Qui non si decide niente
 * tranne la forma dei prismi e quale delle sue quattro giravolte prendere.
 */

/** Unita' di microgeometria per voxel: la stessa griglia da 1/16 dei dettagli. */
const U = MESH_UNITS_PER_VOXEL;

const PLANE = PADDED * PADDED;

/** Faccia inferiore: aderisce al terreno e non va mai emessa. */
const HIDDEN_BOTTOM = 1 << FACE_NZ;

/** Sale del tiro che sceglie la giravolta: separato da quelli dei prop. */
const TURN_SALT = 0x9e_ed_10;

const ORIGIN_ZERO: ChunkOrigin = [0, 0, 0];

/**
 * Le coperture tolte dal volume, con quanto serve a rimetterle.
 *
 * Vive a livello di modulo e non nello scratch del mesher per la stessa ragione
 * per cui ci vivono i bound: e' un buffer di lavoro di una funzione sola, e il
 * worker mesha un chunk alla volta. Gli array crescono al massimo una volta.
 */
export interface LiftedCover {
  /** Indici nel volume paddato delle celle sollevate. */
  readonly cells: number[];
  /** Byte originale di ognuna, nello stesso ordine. */
  readonly marks: number[];
  /** Indici nella fetta di soffitto, se ne e' stata passata una. */
  readonly ceilingCells: number[];
  readonly ceilingMarks: number[];
}

const lifted: LiftedCover = {
  cells: [],
  marks: [],
  ceilingCells: [],
  ceilingMarks: [],
};

/**
 * Svuota le celle di copertura del volume e le restituisce.
 *
 * Passa anche sull'anello di padding, e non e' zelo: un ciuffo del chunk accanto
 * lasciato pieno proietterebbe la sua AO sulle facce di bordo di questo, e la
 * cucitura si vedrebbe come una riga di angoli scuri ogni tanto. Per la stessa
 * ragione passa sulla fetta di soffitto, dove un ciuffo conterebbe come una
 * copertura del cielo.
 *
 * La scansione e' lineare su tutto il volume paddato — la stessa forma e lo
 * stesso ordine di `sweepGlow`, che gia' lo percorre tutto — perche' un
 * marcatore e' un byte e non ha una posizione prevedibile: sta sopra il terreno,
 * e dove sia il terreno lo sa solo il volume.
 */
export function liftGroundCover(padded: Uint8Array, ceiling?: Uint8Array): LiftedCover {
  lifted.cells.length = 0;
  lifted.marks.length = 0;
  lifted.ceilingCells.length = 0;
  lifted.ceilingMarks.length = 0;

  for (let i = 0; i < PADDED_VOL; i++) {
    const block = padded[i];
    if (!isCoverMark(block)) continue;
    lifted.cells.push(i);
    lifted.marks.push(block);
    padded[i] = 0;
  }

  if (ceiling !== undefined) {
    for (let i = 0; i < CEILING_VOL; i++) {
      const block = ceiling[i];
      if (!isCoverMark(block)) continue;
      lifted.ceilingCells.push(i);
      lifted.ceilingMarks.push(block);
      ceiling[i] = 0;
    }
  }

  return lifted;
}

/** Rimette nel volume le celle sollevate: `greedyMesh` non consuma il suo input. */
export function restoreGroundCover(
  padded: Uint8Array,
  ceiling: Uint8Array | undefined,
  cover: LiftedCover,
): void {
  for (let i = 0; i < cover.cells.length; i++) padded[cover.cells[i]] = cover.marks[i];
  if (ceiling === undefined) return;
  for (let i = 0; i < cover.ceilingCells.length; i++) {
    ceiling[cover.ceilingCells[i]] = cover.ceilingMarks[i];
  }
}

/**
 * Scrive la microgeometria delle coperture sollevate.
 *
 * **Va per prima fra i dettagli**, e per una ragione che nessun altro emettitore
 * ha: la sua cella e' gia' stata tolta dal volume, quindi se il tetto dei quad
 * la tagliasse non resterebbe un cubo al suo posto ma una chiazza calva. Tutto
 * il resto della microgeometria, a cadere, lascia un edificio piu' spoglio; solo
 * questa lascerebbe un buco.
 *
 * Costa poco per la stessa ragione per cui i prop costano poco: la lista che
 * riceve e' gia' filtrata: sono le sole celle marcate, qualche decina su un
 * chunk di terreno, non le sue trentaduemila.
 */
export function appendCoverDetail(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cover: LiftedCover,
  origin: ChunkOrigin = ORIGIN_ZERO,
): number {
  const initial = writer.remainingQuads;

  for (let n = 0; n < cover.cells.length; n++) {
    const index = cover.cells[n];
    const px = index % PADDED;
    const py = Math.floor(index / PADDED) % PADDED;
    const pz = Math.floor(index / PLANE);

    // Le celle dell'anello di padding sono state svuotate come le altre — quello
    // serviva all'AO — ma appartengono al chunk accanto, che disegnera' le sue.
    const x = px - 1;
    const y = py - 1;
    const z = pz - 1;
    if (x < 0 || x >= CHUNK || y < 0 || y >= CHUNK || z < 0 || z >= CHUNK) continue;

    const ground = blockPalette(padded[index - PLANE]);
    const kind = coverMarkKind(cover.marks[n]);
    const tone = coverToneOn(ground, kind);
    if (tone === 0) continue;

    const turns = hashCoords(TURN_SALT, origin[0] + x, origin[1] + y) & 3;
    if (!emitCover(writer, coverFormOn(ground, kind), tone, x, y, z, turns)) break;
  }

  return initial - writer.remainingQuads;
}

/**
 * Impronta di un prisma nel piano, in sedicesimi e dentro la cella.
 *
 * I quattro valori sono `x0, x1, y0, y1`: si dichiara una forma sola e le altre
 * tre giravolte escono da `turn`. Un ciuffo ha un verso, e senza le giravolte un
 * prato intero mostrerebbe la stessa lama nella stessa direzione — che e'
 * esattamente il difetto per cui il cubo era stato scartato, solo piu' piccolo.
 */
type Footprint = readonly [number, number, number, number];

/** Rotazione di 90 gradi attorno al centro della cella, esatta in interi. */
function turn(print: Footprint, turns: number): Footprint {
  let [x0, x1, y0, y1] = print;
  for (let t = 0; t < turns; t++) {
    const nx0 = y0;
    const nx1 = y1;
    const ny0 = U - x1;
    const ny1 = U - x0;
    x0 = nx0;
    x1 = nx1;
    y0 = ny0;
    y1 = ny1;
  }
  return [x0, x1, y0, y1];
}

function box(print: Footprint, x: number, y: number, z: number, z0: number, z1: number): FixedBox {
  return {
    min: [x * U + print[0], y * U + print[2], z * U + z0],
    max: [x * U + print[1], y * U + print[3], z * U + z1],
  };
}

/**
 * Tre lame di altezza diversa, sfalsate: e' il minimo perche' un ciuffo legga
 * come un ciuffo e non come uno stecco. La piu' alta arriva a 11/16 e nessuna
 * esce dalla cella, cosi' la copertura non allarga mai l'AABB del chunk ne'
 * sconfina in quello sopra — un ciuffo al confine resterebbe orfano.
 */
const BLADES: readonly (readonly [Footprint, number])[] = [
  [[4, 7, 6, 9], 11],
  [[8, 12, 4, 8], 7],
  [[6, 10, 9, 13], 5],
];

/** Stelo sottile e corolla larga: il fiore e' l'unica copertura a due tinte. */
const BLOOM_STEM: Footprint = [7, 9, 7, 9];
const BLOOM_HEAD: Footprint = [5, 11, 5, 11];

/** Lastra bassa e larga: un sasso si legge dall'ombra che fa, non dall'altezza. */
const PEBBLE: Footprint = [3, 12, 4, 13];

/**
 * Il solco: due crinali che attraversano la cella da un bordo all'altro.
 *
 * **Vanno da 0 a `U` sull'asse di corsa, ed e' l'unica cosa che conta.** Ogni
 * altra copertura sta dentro un'aiuola al centro della cella, cosi' due vicine
 * non si toccano; qui e' il contrario — due colonne contigue devono saldarsi in
 * una fila sola, o un campo torna a essere una picchiettatura di cespugli. E'
 * anche il motivo per cui i solchi non prendono una giravolta dall'hash: il
 * verso arriva dal marcatore, uguale per tutto il lotto.
 *
 * Due file per cella e non una: con `FARMS.rowPitch` a 2 la colonna accanto e'
 * nuda, quindi il passo che si vede a schermo e' di due file ogni due colonne, e
 * il vuoto in mezzo e' cio' che le fa leggere *come* file. Le altezze sono
 * diverse — 5 e 3 — perche' due creste identiche a distanza isometrica leggono
 * come un unico gradino piatto.
 */
const ROWS: readonly (readonly [Footprint, number])[] = [
  [[0, U, 5, 11], 5],
  [[0, U, 1, 3], 3],
];

function emitCover(
  writer: MicroGeometryWriter,
  form: CoverForm,
  tone: number,
  x: number,
  y: number,
  z: number,
  turns: number,
): boolean {
  // I solchi per primi: sono l'unica forma con un verso proprio, e leggerlo dal
  // marcatore invece che da `turns` e' cio' che tiene dritto un campo intero.
  // `rowX` corre lungo x, quindi la sua impronta e' gia' quella dichiarata;
  // `rowY` e' la stessa girata di novanta gradi, cioe' `turn(..., 1)`.
  if (form === COVER_FORM.rowX || form === COVER_FORM.rowY) {
    const quarter = form === COVER_FORM.rowY ? 1 : 0;
    for (const [print, height] of ROWS) {
      if (!writer.emitBox(
        box(turn(print, quarter), x, y, z, 0, height),
        tone,
        HIDDEN_BOTTOM,
        SURFACE_KIND.plain,
      )) {
        return false;
      }
    }
    return true;
  }

  if (form === COVER_FORM.tuft) {
    for (const [print, height] of BLADES) {
      if (!writer.emitBox(
        box(turn(print, turns), x, y, z, 0, height),
        tone,
        HIDDEN_BOTTOM,
        SURFACE_KIND.plain,
      )) {
        return false;
      }
    }
    return true;
  }

  if (form === COVER_FORM.bloom) {
    // Lo stelo e' verde scuro su qualunque terreno: il fiore compare solo dove
    // l'erba cresce, quindi non c'e' un caso in cui un gambo verde sia sbagliato.
    if (!writer.emitBox(
      box(BLOOM_STEM, x, y, z, 0, 9),
      PALETTE_SLOTS.grassDark,
      HIDDEN_BOTTOM,
      SURFACE_KIND.plain,
    )) {
      return false;
    }
    // La corolla e' l'unico prisma della copertura che paga tutte e sei le
    // facce: e' larga il triplo dello stelo, quindi il suo intradosso e' scoperto
    // per davvero, e un fiore visto da valle mostrerebbe il buco.
    return writer.emitBox(
      box(turn(BLOOM_HEAD, turns), x, y, z, 9, 12),
      tone,
      0,
      SURFACE_KIND.plain,
    );
  }

  if (form === COVER_FORM.pebble) {
    return writer.emitBox(
      box(turn(PEBBLE, turns), x, y, z, 0, 4),
      tone,
      HIDDEN_BOTTOM,
      SURFACE_KIND.plain,
    );
  }

  return true;
}
