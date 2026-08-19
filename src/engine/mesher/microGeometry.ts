import {
  CHUNK,
  FACE_NEIGHBOUR_OFFSETS,
  FACE_NX,
  FACE_NY,
  FACE_NZ,
  FACE_PX,
  FACE_PY,
  FACE_PZ,
  paddedIdx,
} from '../../world/chunkCoords';
import { blockSurface, SURFACE_KIND, type SurfaceKind } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';

/**
 * Microgeometria architettonica in unita' fisse di 1/16 di voxel.
 *
 * Come il resto di `src/engine/mesher/`, questo modulo non importa Three.js e
 * non conosce il mondo: riceve il volume paddato 34^3 e scrive prismi
 * axis-aligned nello stesso scratch buffer del greedy pass, tramite il writer.
 * Nessuna draw call in piu', nessuna geometria separata.
 *
 * **Tutto passa da `emitRuns`.** Un dettaglio non e' mai un prisma per voxel: e'
 * un prisma per *corsa* di voxel contigui che chiedono lo stesso dettaglio. Le
 * facce interne alla corsa non sarebbero comunque visibili, quindi fondere non
 * cambia un pixel e divide per la lunghezza media della corsa il numero di quad.
 * Vale circa un fattore tre sui chunk edificati, e senza fondere il tetto
 * verrebbe sfondato da qualunque isolato.
 *
 * Il padding porta il resto: una corsa che prosegue oltre il confine perde la
 * testata da quel lato e la ritrova, identica, nella corsa del chunk accanto.
 */

/**
 * Limite duro, deterministico e indipendente dalla capacita' degli scratch buffer.
 *
 * Non e' un budget: e' una rete. Un chunk fitto di edifici veri misura 13 890
 * quad di dettaglio, quindi il tetto sta sopra il caso denso e non tronca mai
 * per davvero. Serve solo a tenere limitata la patologia — voxel isolati a
 * scacchiera, dove nessuna corsa fonde e ogni cella chiede otto prismi.
 *
 * Troncare non e' gratis: la sequenza si ferma per priorita', quindi a essere
 * tagliate sono sempre le ultime voci (industrial, civic) e sempre a meta' di un
 * chunk. Meglio pagare la geometria che far sparire una classe a caso.
 */
export const MAX_DETAIL_QUADS_PER_CHUNK = 16384;

export interface FixedBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Writer implementato dal mesher per tenere dettagli e greedy pass nella stessa mesh. */
export interface MicroGeometryWriter {
  readonly remainingQuads: number;
  emitBox(box: FixedBox, palette: number, hiddenFaces: number): boolean;
}

const U = MESH_UNITS_PER_VOXEL;
const LATERAL_FACES = [FACE_PX, FACE_NX, FACE_PY, FACE_NY] as const;
const SIDES = [-1, 1] as const;

type Side = -1 | 1;

const faceBit = (face: number): number => 1 << face;

function encodeCell(x: number, y: number, z: number): number {
  return x | (y << 5) | (z << 10);
}

function collectSurfaceCells(padded: Uint8Array): number[][] {
  const cells = Array.from({ length: 8 }, () => [] as number[]);
  for (let z = 0; z < CHUNK; z++) {
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const block = blockAt(padded, x, y, z);
        if (block === 0) continue;
        const surface = blockSurface(block);
        if (surface !== SURFACE_KIND.plain && surface !== SURFACE_KIND.utility) {
          cells[surface].push(encodeCell(x, y, z));
        }
      }
    }
  }
  return cells;
}

function blockAt(padded: Uint8Array, x: number, y: number, z: number): number {
  return padded[paddedIdx(x + 1, y + 1, z + 1)];
}

function isExposed(padded: Uint8Array, x: number, y: number, z: number, face: number): boolean {
  const offset = FACE_NEIGHBOUR_OFFSETS[face];
  return blockAt(padded, x + offset[0], y + offset[1], z + offset[2]) === 0;
}

function hasSurfaceFace(
  padded: Uint8Array,
  x: number,
  y: number,
  z: number,
  surface: SurfaceKind,
  face: number,
): boolean {
  const block = blockAt(padded, x, y, z);
  return block !== 0 && blockSurface(block) === surface && isExposed(padded, x, y, z, face);
}

function oppositeFace(face: number): number {
  return face ^ 1;
}

/** Asse su cui scorre una facciata: quello ortogonale alla sua normale, nel piano. */
function facadeHorizontalAxis(face: number): 0 | 1 {
  return face < 2 ? 1 : 0;
}

function axisFace(axis: number, positive: boolean): number {
  return axis * 2 + (positive ? 0 : 1);
}

function axisCoord(x: number, y: number, z: number, axis: number): number {
  return axis === 0 ? x : axis === 1 ? y : z;
}

function sharedCapMask(axis: number, negativeContinues: boolean, positiveContinues: boolean): number {
  return (negativeContinues ? faceBit(axisFace(axis, false)) : 0) |
    (positiveContinues ? faceBit(axisFace(axis, true)) : 0);
}

/**
 * Prisma appoggiato a una facciata verticale.
 *
 * `horizontal*` e `vertical*` sono offset dall'origine della cella `(x, y, z)` e
 * possono superare `U`: e' cosi' che una corsa lunga `n` celle diventa un solo
 * box. `depth` misura la sporgenza oltre il piano della facciata.
 */
function facadeBox(
  x: number,
  y: number,
  z: number,
  face: number,
  horizontalStart: number,
  horizontalEnd: number,
  verticalStart: number,
  verticalEnd: number,
  depth: number,
): FixedBox {
  const min: [number, number, number] = [x * U, y * U, z * U + verticalStart];
  const max: [number, number, number] = [(x + 1) * U, (y + 1) * U, z * U + verticalEnd];
  const horizontalAxis = facadeHorizontalAxis(face);
  min[horizontalAxis] += horizontalStart;
  max[horizontalAxis] = (horizontalAxis === 0 ? x : y) * U + horizontalEnd;

  const normalAxis = face < 2 ? 0 : 1;
  const positive = face === FACE_PX || face === FACE_PY;
  const plane = ((normalAxis === 0 ? x : y) + (positive ? 1 : 0)) * U;
  min[normalAxis] = positive ? plane : plane - depth;
  max[normalAxis] = positive ? plane + depth : plane;
  return { min, max };
}

/**
 * Un dettaglio, descritto una volta e steso su tutte le sue corse.
 *
 * `has` decide se una cella chiede questo dettaglio; `box` disegna il prisma che
 * copre `length` celle a partire da quella iniziale. `openStart`/`openEnd`
 * dicono che la corsa prosegue oltre l'estremo: chi disegna arriva al confine
 * invece di rientrare, cosi' il pezzo accanto combacia.
 */
interface RunSpec {
  readonly runAxis: 0 | 1 | 2;
  readonly palette: number;
  /** Faccia aderente al voxel che regge il dettaglio: non viene mai emessa. */
  readonly hiddenFace: number;
  has(x: number, y: number, z: number): boolean;
  box(x: number, y: number, z: number, length: number, openStart: boolean, openEnd: boolean): FixedBox;
}

/**
 * Emette un prisma per ogni corsa massimale di celle che chiedono `spec`.
 *
 * Solo la cella che apre la corsa disegna. Al bordo del chunk apre comunque,
 * anche se il padding mostra che la corsa viene da fuori: il chunk accanto
 * possiede le proprie celle e non puo' disegnare le nostre. Le due meta' si
 * incontrano perche' entrambe nascondono la testata sul confine condiviso.
 */
function emitRuns(writer: MicroGeometryWriter, cells: readonly number[], spec: RunSpec): boolean {
  const axis = spec.runAxis;
  const dx = axis === 0 ? 1 : 0;
  const dy = axis === 1 ? 1 : 0;
  const dz = axis === 2 ? 1 : 0;

  for (const cell of cells) {
    const x = cell & 31;
    const y = (cell >>> 5) & 31;
    const z = (cell >>> 10) & 31;
    if (!spec.has(x, y, z)) continue;

    const openStart = spec.has(x - dx, y - dy, z - dz);
    if (openStart && axisCoord(x, y, z, axis) > 0) continue;

    let length = 1;
    while (
      axisCoord(x, y, z, axis) + length < CHUNK &&
      spec.has(x + dx * length, y + dy * length, z + dz * length)
    ) {
      length++;
    }
    const openEnd = spec.has(x + dx * length, y + dy * length, z + dz * length);

    if (!writer.emitBox(
      spec.box(x, y, z, length, openStart, openEnd),
      spec.palette,
      faceBit(spec.hiddenFace) | sharedCapMask(axis, openStart, openEnd),
    )) {
      return false;
    }
  }
  return true;
}

/** Montante o lama verticale: sta su un bordo della facciata e sale lungo z. */
function verticalEdgeSpec(
  padded: Uint8Array,
  surface: SurfaceKind,
  face: number,
  side: Side,
  width: number,
  depth: number,
  palette: number,
): RunSpec {
  const horizontalAxis = facadeHorizontalAxis(face);
  const dx = horizontalAxis === 0 ? side : 0;
  const dy = horizontalAxis === 1 ? side : 0;
  const start = side < 0 ? 0 : U - width;

  return {
    runAxis: 2,
    palette,
    hiddenFace: oppositeFace(face),
    has: (x, y, z) => hasSurfaceFace(padded, x, y, z, surface, face) &&
      !hasSurfaceFace(padded, x + dx, y + dy, z, surface, face),
    box: (x, y, z, length) => facadeBox(x, y, z, face, start, start + width, 0, length * U, depth),
  };
}

function emitPortals(padded: Uint8Array, writer: MicroGeometryWriter, cells: readonly number[]): boolean {
  const portal = SURFACE_KIND.portal;
  for (const face of LATERAL_FACES) {
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    // Montanti larghi 2/16 e profondi 2/16 sui due bordi del vano.
    for (const side of SIDES) {
      if (!emitRuns(writer, cells, verticalEdgeSpec(padded, portal, face, side, 2, 2, PALETTE_SLOTS.metalBrass))) {
        return false;
      }
    }

    // Architrave e pensilina corrono in orizzontale sul filo superiore del vano.
    const isLintel = (x: number, y: number, z: number): boolean =>
      hasSurfaceFace(padded, x, y, z, portal, face) &&
      !hasSurfaceFace(padded, x, y, z + 1, portal, face);

    if (!emitRuns(writer, cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.metalBrass,
      hiddenFace: oppositeFace(face),
      has: isLintel,
      box: (x, y, z, length) => facadeBox(x, y, z, face, 0, length * U, U - 2, U, 2),
    })) {
      return false;
    }

    if (!emitRuns(writer, cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.metalDark,
      hiddenFace: oppositeFace(face),
      // La pensilina sporge 4/16: le serve aria davanti, un piano piu' in alto.
      has: (x, y, z) => isLintel(x, y, z) && blockAt(padded, x + normal[0], y + normal[1], z + 1) === 0,
      box: (x, y, z, length) => facadeBox(x, y, z, face, 0, length * U, U, U + 1, 4),
    })) {
      return false;
    }
  }
  return true;
}

/** Parapetti perimetrali: solo dove un tetto tecnico confina con l'aria. */
function emitRoofTech(padded: Uint8Array, writer: MicroGeometryWriter, cells: readonly number[]): boolean {
  for (const direction of LATERAL_FACES) {
    const edgeAxis = direction < 2 ? 0 : 1;
    const runAxis = edgeAxis === 0 ? 1 : 0;
    const positive = direction === FACE_PX || direction === FACE_PY;
    const offset = FACE_NEIGHBOUR_OFFSETS[direction];

    const has = (x: number, y: number, z: number): boolean => {
      const block = blockAt(padded, x, y, z);
      return block !== 0 &&
        blockSurface(block) === SURFACE_KIND.roofTech &&
        isExposed(padded, x, y, z, FACE_PZ) &&
        blockAt(padded, x + offset[0], y + offset[1], z) === 0;
    };

    if (!emitRuns(writer, cells, {
      runAxis,
      palette: PALETTE_SLOTS.metalDark,
      hiddenFace: FACE_NZ,
      has,
      box: (x, y, z, length) => {
        const base: [number, number, number] = [x * U, y * U, (z + 1) * U];
        const min: [number, number, number] = [base[0], base[1], base[2]];
        const max: [number, number, number] = [base[0] + U, base[1] + U, base[2] + 3];
        // Spesso 1/16, alto 3/16, rientrato 1/16 dal filo del tetto.
        min[edgeAxis] = base[edgeAxis] + (positive ? U - 2 : 1);
        max[edgeAxis] = base[edgeAxis] + (positive ? U - 1 : 2);
        max[runAxis] = base[runAxis] + length * U;
        return { min, max };
      },
    })) {
      return false;
    }
  }
  return true;
}

/** Cornice spessa e profonda 1/16 sul perimetro delle regioni luminose connesse. */
function emitLuminous(padded: Uint8Array, writer: MicroGeometryWriter, cells: readonly number[]): boolean {
  const luminous = SURFACE_KIND.luminous;
  for (const face of LATERAL_FACES) {
    for (const side of SIDES) {
      if (!emitRuns(writer, cells, verticalEdgeSpec(padded, luminous, face, side, 1, 1, PALETTE_SLOTS.glassPale))) {
        return false;
      }
    }

    // Traversi sopra e sotto la regione. Rientrano di 1/16 solo dove la corsa
    // finisce davvero: e' l'angolo con il montante, non un buco a meta' parete.
    for (const side of SIDES) {
      const vertical = side < 0 ? 0 : U - 1;
      if (!emitRuns(writer, cells, {
        runAxis: facadeHorizontalAxis(face),
        palette: PALETTE_SLOTS.glassPale,
        hiddenFace: oppositeFace(face),
        has: (x, y, z) => hasSurfaceFace(padded, x, y, z, luminous, face) &&
          !hasSurfaceFace(padded, x, y, z + side, luminous, face),
        box: (x, y, z, length, openStart, openEnd) => facadeBox(
          x,
          y,
          z,
          face,
          openStart ? 0 : 1,
          length * U - (openEnd ? 0 : 1),
          vertical,
          vertical + 1,
          1,
        ),
      })) {
        return false;
      }
    }
  }
  return true;
}

/** Mensole orizzontali sui bordi delle terrazze o sui cambi di fascia. */
function emitHabitat(padded: Uint8Array, writer: MicroGeometryWriter, cells: readonly number[]): boolean {
  const habitat = SURFACE_KIND.habitat;
  for (const face of LATERAL_FACES) {
    if (!emitRuns(writer, cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.concreteLight,
      hiddenFace: oppositeFace(face),
      has: (x, y, z) => hasSurfaceFace(padded, x, y, z, habitat, face) &&
        !hasSurfaceFace(padded, x, y, z + 1, habitat, face),
      box: (x, y, z, length) => facadeBox(x, y, z, face, 0, length * U, U - 1, U, 3),
    })) {
      return false;
    }
  }
  return true;
}

/** Nervature e lame verticali agli estremi delle campate di facciata. */
function emitFacadeClass(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  surface: SurfaceKind,
  width: number,
  depth: number,
  palette: number,
  cells: readonly number[],
): boolean {
  for (const face of LATERAL_FACES) {
    for (const side of SIDES) {
      if (!emitRuns(writer, cells, verticalEdgeSpec(padded, surface, face, side, width, depth, palette))) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Accoda i dettagli in priorita' stabile. Restituisce i quad effettivamente
 * emessi; il writer interrompe l'intera sequenza prima di superare il limite.
 */
export function appendMicroGeometry(padded: Uint8Array, writer: MicroGeometryWriter): number {
  const initial = writer.remainingQuads;
  const cells = collectSurfaceCells(padded);
  if (!emitPortals(padded, writer, cells[SURFACE_KIND.portal])) return initial - writer.remainingQuads;
  if (!emitRoofTech(padded, writer, cells[SURFACE_KIND.roofTech])) return initial - writer.remainingQuads;
  if (!emitLuminous(padded, writer, cells[SURFACE_KIND.luminous])) return initial - writer.remainingQuads;
  if (!emitHabitat(padded, writer, cells[SURFACE_KIND.habitat])) return initial - writer.remainingQuads;
  if (!emitFacadeClass(
    padded,
    writer,
    SURFACE_KIND.industrial,
    2,
    2,
    PALETTE_SLOTS.metalRust,
    cells[SURFACE_KIND.industrial],
  )) {
    return initial - writer.remainingQuads;
  }
  emitFacadeClass(
    padded,
    writer,
    SURFACE_KIND.civic,
    1,
    3,
    PALETTE_SLOTS.concreteWhite,
    cells[SURFACE_KIND.civic],
  );
  return initial - writer.remainingQuads;
}
