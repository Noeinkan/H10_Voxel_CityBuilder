import {
  CHUNK,
  FACE_NZ,
  FACE_PZ,
  PADDED_VOL,
  paddedIdx,
} from '../../world/chunkCoords';
import { AERIAL } from '../../world/aerial/config';
import { hashCoords } from '../../world/rng';
import { packVisualBlock, SURFACE_KIND } from '../../world/visualBlock';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import type { ChunkOrigin, MicroGeometryWriter } from './microGeometry';

/** Una corsa verticale posseduta dal chunk, gia' ritagliata ai suoi 32 piani. */
interface SupportRun {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly length: number;
  readonly openBottom: boolean;
  readonly openTop: boolean;
  readonly arched: boolean;
}

interface LiftedCell {
  readonly index: number;
  readonly block: number;
}

/** Stato temporaneo: il volume torna identico dopo il meshing. */
export interface LiftedAerialSupports {
  readonly cells: readonly LiftedCell[];
  readonly runs: readonly SupportRun[];
}

const U = MESH_UNITS_PER_VOXEL;
const EMPTY: LiftedAerialSupports = { cells: [], runs: [] };
const PIER_BLOCK = packVisualBlock(AERIAL.pierPalette, SURFACE_KIND.utility);

function inPadding(value: number): boolean {
  return value >= -1 && value <= CHUNK;
}

function blockAt(padded: Uint8Array, x: number, y: number, z: number): number {
  if (!inPadding(x) || !inPadding(y) || !inPadding(z)) return 0;
  return padded[paddedIdx(x + 1, y + 1, z + 1)];
}

/**
 * Il marcatore non e' un byte nuovo: e' la combinazione che `generatePier`
 * assegna alle sole gambe ordinarie. I carichi pesanti usano `plain`, quindi
 * restano nel greedy pass come piloni pieni.
 */
function isPierBlock(block: number): boolean {
  return block === PIER_BLOCK;
}

function groupKey(x: number, y: number, z: number): number {
  return (x + 1) | ((y + 1) << 6) | ((z + 1) << 12);
}

/** Un piano isolato del 2 x 2 logico della gamba. */
function rawLayer(padded: Uint8Array, x: number, y: number, z: number): boolean {
  if (!isPierBlock(blockAt(padded, x, y, z)) ||
    !isPierBlock(blockAt(padded, x + 1, y, z)) ||
    !isPierBlock(blockAt(padded, x, y + 1, z)) ||
    !isPierBlock(blockAt(padded, x + 1, y + 1, z))) {
    return false;
  }

  // Dove il padding consente di guardare, il 2 x 2 deve finire davvero: cosi'
  // una parete utility in calcestruzzo non diventa per errore una fila di pali.
  for (let along = 0; along < AERIAL.pierSide; along++) {
    if (inPadding(x - 1) && isPierBlock(blockAt(padded, x - 1, y + along, z))) return false;
    if (inPadding(x + 2) && isPierBlock(blockAt(padded, x + 2, y + along, z))) return false;
    if (inPadding(y - 1) && isPierBlock(blockAt(padded, x + along, y - 1, z))) return false;
    if (inPadding(y + 2) && isPierBlock(blockAt(padded, x + along, y + 2, z))) return false;
  }
  return true;
}

/** Un dado isolato non e' una gamba: serve continuita' su almeno un lato in z. */
function supportLayer(padded: Uint8Array, x: number, y: number, z: number): boolean {
  return rawLayer(padded, x, y, z) &&
    (rawLayer(padded, x, y, z - 1) || rawLayer(padded, x, y, z + 1));
}

function wantsArch(origin: ChunkOrigin, x: number, y: number): boolean {
  return (hashCoords(0xa7_c4, origin[0] + x, origin[1] + y) & 3) === 0;
}

/**
 * Toglie dal solo volume di meshing le gambe ordinarie e ne conserva le corse.
 * Occupazione, collisioni e registry continuano a vedere il 2 x 2 originale.
 */
export function liftAerialSupports(
  padded: Uint8Array,
  origin: ChunkOrigin = [0, 0, 0],
): LiftedAerialSupports {
  if (padded.length !== PADDED_VOL) return EMPTY;

  // Quasi tutti i chunk non contengono gambe. `includes` percorre il buffer nel
  // runtime nativo e tiene il caso comune fuori dai tre cicli JS sottostanti.
  if (!padded.includes(PIER_BLOCK)) return EMPTY;

  const groups: { x: number; y: number; z: number }[] = [];
  const present = new Set<number>();
  for (let z = -1; z <= CHUNK; z++) {
    for (let y = -1; y < CHUNK; y++) {
      for (let x = -1; x < CHUNK; x++) {
        if (!supportLayer(padded, x, y, z)) continue;
        groups.push({ x, y, z });
        present.add(groupKey(x, y, z));
      }
    }
  }
  if (groups.length === 0) return EMPTY;

  const runs: SupportRun[] = [];
  for (const group of groups) {
    const { x, y, z } = group;
    if (x < 0 || x >= CHUNK || y < 0 || y >= CHUNK || z < 0 || z >= CHUNK) continue;
    const openBottom = present.has(groupKey(x, y, z - 1));
    if (z > 0 && openBottom) continue;

    let length = 1;
    while (z + length < CHUNK && present.has(groupKey(x, y, z + length))) length++;
    const openTop = present.has(groupKey(x, y, z + length));
    runs.push({
      x,
      y,
      z,
      length,
      openBottom,
      openTop,
      arched: !openTop && wantsArch(origin, x, y),
    });
  }

  const cells: LiftedCell[] = [];
  const lifted = new Set<number>();
  for (const group of groups) {
    for (let dy = 0; dy < AERIAL.pierSide; dy++) {
      for (let dx = 0; dx < AERIAL.pierSide; dx++) {
        const index = paddedIdx(group.x + dx + 1, group.y + dy + 1, group.z + 1);
        if (lifted.has(index)) continue;
        lifted.add(index);
        const block = padded[index];
        if (block === 0) continue;
        cells.push({ index, block });
      }
    }
  }
  for (const cell of cells) padded[cell.index] = 0;
  return { cells, runs };
}

export function restoreAerialSupports(padded: Uint8Array, lifted: LiftedAerialSupports): void {
  for (const cell of lifted.cells) padded[cell.index] = cell.block;
}

function emitCapital(
  writer: MicroGeometryWriter,
  run: SupportRun,
  top: number,
  centerX: number,
  centerY: number,
): boolean {
  if (!run.arched) {
    return writer.emitBox({
      min: [centerX - 5, centerY - 5, top - 2],
      max: [centerX + 5, centerY + 5, top],
    }, AERIAL.pierPalette, 1 << FACE_PZ, SURFACE_KIND.utility);
  }

  // Tre scatti dentro l'ultimo voxel fanno aprire il fusto come un arco a Y:
  // il vuoto resta sotto le spalle, mentre la testa arriva quasi ai quattro
  // lati del 2 x 2 strutturale. A distanza la silhouette e' curva, non a cassa.
  const tiers = [
    { halfX: 5, halfY: 5, from: 8, to: 11 },
    { halfX: 8, halfY: 5, from: 11, to: 14 },
    { halfX: 5, halfY: 8, from: 11, to: 14 },
    { halfX: 12, halfY: 12, from: 14, to: 16 },
  ] as const;
  const cellBottom = top - U;
  for (const tier of tiers) {
    if (!writer.emitBox({
      min: [centerX - tier.halfX, centerY - tier.halfY, cellBottom + tier.from],
      max: [centerX + tier.halfX, centerY + tier.halfY, cellBottom + tier.to],
    }, AERIAL.pierPalette, tier.to === U ? 1 << FACE_PZ : 0, SURFACE_KIND.utility)) {
      return false;
    }
  }
  return true;
}

/** Disegna un fusto per corsa, non un prisma per voxel. */
export function appendAerialSupportDetail(
  writer: MicroGeometryWriter,
  lifted: LiftedAerialSupports,
): number {
  const initial = writer.remainingQuads;
  for (const run of lifted.runs) {
    const centerX = (run.x + 1) * U;
    const centerY = (run.y + 1) * U;
    const bottom = run.z * U;
    const top = (run.z + run.length) * U;
    const hidden = (run.openBottom ? 1 << FACE_NZ : 0) | (run.openTop ? 1 << FACE_PZ : 0);

    if (!writer.emitBox({
      min: [centerX - 3, centerY - 3, bottom],
      max: [centerX + 3, centerY + 3, top],
    }, AERIAL.pierPalette, hidden, SURFACE_KIND.utility)) {
      return initial - writer.remainingQuads;
    }

    if (!run.openBottom && !writer.emitBox({
      min: [centerX - 5, centerY - 5, bottom],
      max: [centerX + 5, centerY + 5, bottom + 2],
    }, AERIAL.pierPalette, 1 << FACE_NZ, SURFACE_KIND.utility)) {
      return initial - writer.remainingQuads;
    }

    if (!run.openTop && !emitCapital(writer, run, top, centerX, centerY)) {
      return initial - writer.remainingQuads;
    }
  }
  return initial - writer.remainingQuads;
}
