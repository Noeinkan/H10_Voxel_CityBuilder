import { CHUNK, PADDED, PADDED_VOL } from '../../world/chunkCoords';
import { blockPalette, blockSurface, SURFACE_KIND } from '../../world/visualBlock';
import {
  appendMicroGeometry,
  MAX_DETAIL_QUADS_PER_CHUNK,
  type FixedBox,
  type MicroGeometryWriter,
} from './microGeometry';
import { MESH_UNITS_PER_VOXEL, type MeshArrays } from './meshTypes';

/**
 * Greedy meshing e microgeometria per faccia su un volume paddato 34^3.
 *
 * Nessun import da Three.js: la funzione e' pura e restituisce array grezzi.
 *
 * Il volume di input e' il chunk 32^3 circondato da una cella di bordo che porta
 * i voxel dei chunk adiacenti. L'AO legge anche le diagonali sul piano della
 * faccia, quindi il padding contiene tutti i 26 vicini immediati.
 *
 * Ogni faccia viene emessa dal chunk che possiede il voxel solido: al bordo
 * inferiore (slice -1) si emette solo la faccia negativa, al bordo superiore
 * (slice 31) solo quella positiva. Senza questa regola due chunk adiacenti
 * emetterebbero due volte la stessa faccia.
 */

/** Buffer riusabili tra invocazioni successive, per non allocare a ogni rebuild. */
export interface MeshScratch {
  positions: Int16Array;
  faces: Uint8Array;
  palettes: Uint8Array;
  surfaces: Uint8Array;
  ao: Uint8Array;
  indices: Uint32Array;
  /** Maschera di una slice: 0 = nessuna faccia, >0 = faccia positiva, <0 = negativa. */
  readonly mask: Int32Array;
  capacityQuads: number;
}

/** Massimo teorico del solo greedy pass: pattern a scacchiera in un chunk. */
export const MAX_BASE_QUADS_PER_CHUNK = 6 * (CHUNK * CHUNK * CHUNK) * 0.5;

/** Massimo teorico complessivo, inclusa la microgeometria. */
export const MAX_QUADS_PER_CHUNK = MAX_BASE_QUADS_PER_CHUNK + MAX_DETAIL_QUADS_PER_CHUNK;

const STRIDE: readonly [number, number, number] = [1, PADDED, PADDED * PADDED];

export function createScratch(initialQuads = 4096): MeshScratch {
  return {
    positions: new Int16Array(initialQuads * 12),
    faces: new Uint8Array(initialQuads * 4),
    palettes: new Uint8Array(initialQuads * 4),
    surfaces: new Uint8Array(initialQuads * 4),
    ao: new Uint8Array(initialQuads * 4),
    indices: new Uint32Array(initialQuads * 6),
    mask: new Int32Array(CHUNK * CHUNK),
    capacityQuads: initialQuads,
  };
}

function growScratch(scratch: MeshScratch, neededQuads: number): void {
  let cap = scratch.capacityQuads;
  while (cap < neededQuads) cap *= 2;

  const positions = new Int16Array(cap * 12);
  positions.set(scratch.positions);
  const faces = new Uint8Array(cap * 4);
  faces.set(scratch.faces);
  const palettes = new Uint8Array(cap * 4);
  palettes.set(scratch.palettes);
  const surfaces = new Uint8Array(cap * 4);
  surfaces.set(scratch.surfaces);
  const ao = new Uint8Array(cap * 4);
  ao.set(scratch.ao);
  const indices = new Uint32Array(cap * 6);
  indices.set(scratch.indices);

  scratch.positions = positions;
  scratch.faces = faces;
  scratch.palettes = palettes;
  scratch.surfaces = surfaces;
  scratch.ao = ao;
  scratch.indices = indices;
  scratch.capacityQuads = cap;
}

const boundsMin = new Int32Array(3);
const boundsMax = new Int32Array(3);

/**
 * Produce la geometria del chunk contenuto nel volume paddato.
 *
 * @param padded volume 34^3, indice `px + 34 * (py + 34 * pz)`
 * @param scratch buffer riusabili; se omesso vengono allocati al volo
 */
export function greedyMesh(padded: Uint8Array, scratch?: MeshScratch): MeshArrays {
  if (padded.length !== PADDED_VOL) {
    throw new Error(`greedyMesh: expected a volume of ${PADDED_VOL} cells, received ${padded.length}`);
  }
  const s = scratch ?? createScratch();
  const mask = s.mask;

  let quadCount = 0;
  boundsMin[0] = boundsMin[1] = boundsMin[2] = CHUNK * MESH_UNITS_PER_VOXEL;
  boundsMax[0] = boundsMax[1] = boundsMax[2] = 0;

  for (let d = 0; d < 3; d++) {
    // (u, v, d) e' una terna destrorsa: u x v = +d, quindi l'ordine dei vertici
    // di un quad in (u, v) crescente da' la normale positiva senza correzioni.
    const axisU = (d + 1) % 3;
    const axisV = (d + 2) % 3;
    const sd = STRIDE[d];
    const su = STRIDE[axisU];
    const sv = STRIDE[axisV];

    for (let slice = -1; slice < CHUNK; slice++) {
      // Il piano della faccia, in coordinate locali di spigolo: 0..32.
      const plane = slice + 1;
      const canEmitPositive = slice >= 0; // il voxel `a` appartiene a questo chunk
      const canEmitNegative = slice < CHUNK - 1; // il voxel `b` appartiene a questo chunk

      let n = 0;
      const baseD = plane * sd;
      for (let j = 0; j < CHUNK; j++) {
        let p = baseD + (j + 1) * sv + su;
        for (let i = 0; i < CHUNK; i++, n++, p += su) {
          const a = padded[p];
          const b = padded[p + sd];
          if (a !== 0) {
            mask[n] = b === 0 && canEmitPositive ? packFace(a, p + sd, su, sv, padded) : 0;
          } else {
            mask[n] = b !== 0 && canEmitNegative ? -packFace(b, p, su, sv, padded) : 0;
          }
        }
      }

      // Fusione greedy dei rettangoli massimali a (palette, direzione) uguali.
      n = 0;
      for (let j = 0; j < CHUNK; j++) {
        for (let i = 0; i < CHUNK; ) {
          const m = mask[n];
          if (m === 0) {
            i++;
            n++;
            continue;
          }

          let w = 1;
          while (i + w < CHUNK && mask[n + w] === m) w++;

          let h = 1;
          growHeight: while (j + h < CHUNK) {
            const rowStart = n + h * CHUNK;
            for (let k = 0; k < w; k++) {
              if (mask[rowStart + k] !== m) break growHeight;
            }
            h++;
          }

          if (quadCount + 1 > s.capacityQuads) growScratch(s, quadCount + 1);

          const positive = m > 0;
          const packed = positive ? m : -m;
          const paletteId = packed & PALETTE_MASK;
          const surfaceId = (packed >>> SURFACE_SHIFT) & SURFACE_MASK;
          const faceId = d * 2 + (positive ? 0 : 1);

          // Winding: ordine crescente in (u, v) per la faccia positiva, invertito
          // per la negativa, cosi' il front face guarda sempre fuori dal solido.
          let u0: number, v0: number, u1: number, v1: number;
          let u2: number, v2: number, u3: number, v3: number;
          if (positive) {
            u0 = i;
            v0 = j;
            u1 = i + w;
            v1 = j;
            u2 = i + w;
            v2 = j + h;
            u3 = i;
            v3 = j + h;
          } else {
            u0 = i;
            v0 = j;
            u1 = i;
            v1 = j + h;
            u2 = i + w;
            v2 = j + h;
            u3 = i + w;
            v3 = j;
          }

          const vbase = quadCount * 4;
          const pos = s.positions;
          let o = vbase * 3;
          pos[o + axisU] = u0 * MESH_UNITS_PER_VOXEL;
          pos[o + axisV] = v0 * MESH_UNITS_PER_VOXEL;
          pos[o + d] = plane * MESH_UNITS_PER_VOXEL;
          o += 3;
          pos[o + axisU] = u1 * MESH_UNITS_PER_VOXEL;
          pos[o + axisV] = v1 * MESH_UNITS_PER_VOXEL;
          pos[o + d] = plane * MESH_UNITS_PER_VOXEL;
          o += 3;
          pos[o + axisU] = u2 * MESH_UNITS_PER_VOXEL;
          pos[o + axisV] = v2 * MESH_UNITS_PER_VOXEL;
          pos[o + d] = plane * MESH_UNITS_PER_VOXEL;
          o += 3;
          pos[o + axisU] = u3 * MESH_UNITS_PER_VOXEL;
          pos[o + axisV] = v3 * MESH_UNITS_PER_VOXEL;
          pos[o + d] = plane * MESH_UNITS_PER_VOXEL;

          s.faces[vbase] = faceId;
          s.faces[vbase + 1] = faceId;
          s.faces[vbase + 2] = faceId;
          s.faces[vbase + 3] = faceId;
          s.palettes[vbase] = paletteId;
          s.palettes[vbase + 1] = paletteId;
          s.palettes[vbase + 2] = paletteId;
          s.palettes[vbase + 3] = paletteId;
          s.surfaces[vbase] = surfaceId;
          s.surfaces[vbase + 1] = surfaceId;
          s.surfaces[vbase + 2] = surfaceId;
          s.surfaces[vbase + 3] = surfaceId;

          // Il packing e' in ordine geometrico (u,v): 00, 10, 11, 01. La
          // faccia negativa inverte il winding, dunque inverte anche quei
          // corner senza introdurre casi speciali nel calcolo dell'AO.
          const ao0 = (packed >>> AO_00_SHIFT) & AO_MASK;
          const ao1 = (packed >>> AO_10_SHIFT) & AO_MASK;
          const ao2 = (packed >>> AO_11_SHIFT) & AO_MASK;
          const ao3 = (packed >>> AO_01_SHIFT) & AO_MASK;
          s.ao[vbase] = ao0;
          if (positive) {
            s.ao[vbase + 1] = ao1;
            s.ao[vbase + 2] = ao2;
            s.ao[vbase + 3] = ao3;
          } else {
            s.ao[vbase + 1] = ao3;
            s.ao[vbase + 2] = ao2;
            s.ao[vbase + 3] = ao1;
          }

          const iOff = quadCount * 6;
          if (s.ao[vbase] + s.ao[vbase + 2] > s.ao[vbase + 1] + s.ao[vbase + 3]) {
            s.indices[iOff] = vbase + 1;
            s.indices[iOff + 1] = vbase + 2;
            s.indices[iOff + 2] = vbase + 3;
            s.indices[iOff + 3] = vbase + 1;
            s.indices[iOff + 4] = vbase + 3;
            s.indices[iOff + 5] = vbase;
          } else {
            s.indices[iOff] = vbase;
            s.indices[iOff + 1] = vbase + 1;
            s.indices[iOff + 2] = vbase + 2;
            s.indices[iOff + 3] = vbase;
            s.indices[iOff + 4] = vbase + 2;
            s.indices[iOff + 5] = vbase + 3;
          }

          if (i * MESH_UNITS_PER_VOXEL < boundsMin[axisU]) boundsMin[axisU] = i * MESH_UNITS_PER_VOXEL;
          if ((i + w) * MESH_UNITS_PER_VOXEL > boundsMax[axisU]) boundsMax[axisU] = (i + w) * MESH_UNITS_PER_VOXEL;
          if (j * MESH_UNITS_PER_VOXEL < boundsMin[axisV]) boundsMin[axisV] = j * MESH_UNITS_PER_VOXEL;
          if ((j + h) * MESH_UNITS_PER_VOXEL > boundsMax[axisV]) boundsMax[axisV] = (j + h) * MESH_UNITS_PER_VOXEL;
          if (plane * MESH_UNITS_PER_VOXEL < boundsMin[d]) boundsMin[d] = plane * MESH_UNITS_PER_VOXEL;
          if (plane * MESH_UNITS_PER_VOXEL > boundsMax[d]) boundsMax[d] = plane * MESH_UNITS_PER_VOXEL;

          quadCount++;

          for (let dj = 0; dj < h; dj++) {
            const rowStart = n + dj * CHUNK;
            mask.fill(0, rowStart, rowStart + w);
          }

          i += w;
          n += w;
        }
      }
    }
  }

  const baseQuadCount = quadCount;
  const writer: MicroGeometryWriter = {
    get remainingQuads(): number {
      return MAX_DETAIL_QUADS_PER_CHUNK - (quadCount - baseQuadCount);
    },
    emitBox(box: FixedBox, palette: number, hiddenFaces: number): boolean {
      const faceCount = 6 - countBits(hiddenFaces & 0b11_1111);
      if (faceCount > this.remainingQuads) return false;
      if (quadCount + faceCount > s.capacityQuads) growScratch(s, quadCount + faceCount);
      quadCount += writeDetailBox(s, quadCount, box, palette, hiddenFaces);
      for (let axis = 0; axis < 3; axis++) {
        if (box.min[axis] < boundsMin[axis]) boundsMin[axis] = box.min[axis];
        if (box.max[axis] > boundsMax[axis]) boundsMax[axis] = box.max[axis];
      }
      return true;
    },
  };
  const detailQuadCount = appendMicroGeometry(padded, writer);

  if (quadCount === 0) {
    return {
      positions: EMPTY_I16,
      faces: EMPTY_U8,
      palettes: EMPTY_U8,
      surfaces: EMPTY_U8,
      ao: EMPTY_U8,
      indices: EMPTY_U32,
      detailQuadCount: 0,
      quadCount: 0,
      min: [0, 0, 0],
      max: [0, 0, 0],
    };
  }

  const vertexCount = quadCount * 4;
  return {
    positions: s.positions.slice(0, vertexCount * 3),
    faces: s.faces.slice(0, vertexCount),
    palettes: s.palettes.slice(0, vertexCount),
    surfaces: s.surfaces.slice(0, vertexCount),
    ao: s.ao.slice(0, vertexCount),
    indices: s.indices.slice(0, quadCount * 6),
    detailQuadCount,
    quadCount,
    min: [
      boundsMin[0] / MESH_UNITS_PER_VOXEL,
      boundsMin[1] / MESH_UNITS_PER_VOXEL,
      boundsMin[2] / MESH_UNITS_PER_VOXEL,
    ],
    max: [
      boundsMax[0] / MESH_UNITS_PER_VOXEL,
      boundsMax[1] / MESH_UNITS_PER_VOXEL,
      boundsMax[2] / MESH_UNITS_PER_VOXEL,
    ],
  };
}

const EMPTY_I16 = new Int16Array(0);
const EMPTY_U8 = new Uint8Array(0);
const EMPTY_U32 = new Uint32Array(0);

const PALETTE_MASK = 0b1_1111;
const AO_MASK = 0b11;
const AO_00_SHIFT = 5;
const AO_10_SHIFT = 7;
const AO_11_SHIFT = 9;
const AO_01_SHIFT = 11;
const SURFACE_SHIFT = 13;
const SURFACE_MASK = 0b111;

/** AO classica a quattro livelli per un corner su una faccia visibile. */
function cornerAO(pn: number, du: number, dv: number, su: number, sv: number, padded: Uint8Array): number {
  const side1 = padded[pn + du * su] === 0 ? 0 : 1;
  const side2 = padded[pn + dv * sv] === 0 ? 0 : 1;
  if (side1 === 1 && side2 === 1) return 0;
  const corner = padded[pn + du * su + dv * sv] === 0 ? 0 : 1;
  return 3 - side1 - side2 - corner;
}

/** Palette e quattro corner AO in una chiave Int16 confrontabile dal greedy merge. */
function packFace(block: number, pn: number, su: number, sv: number, padded: Uint8Array): number {
  const ao00 = cornerAO(pn, -1, -1, su, sv, padded);
  const ao10 = cornerAO(pn, 1, -1, su, sv, padded);
  const ao11 = cornerAO(pn, 1, 1, su, sv, padded);
  const ao01 = cornerAO(pn, -1, 1, su, sv, padded);
  return blockPalette(block) |
    (ao00 << AO_00_SHIFT) |
    (ao10 << AO_10_SHIFT) |
    (ao11 << AO_11_SHIFT) |
    (ao01 << AO_01_SHIFT) |
    (blockSurface(block) << SURFACE_SHIFT);
}

function countBits(value: number): number {
  let bits = value;
  let count = 0;
  while (bits !== 0) {
    bits &= bits - 1;
    count++;
  }
  return count;
}

/** Scrive i lati visibili di un prisma ortogonale negli stessi buffer del greedy pass. */
function writeDetailBox(
  scratch: MeshScratch,
  startQuad: number,
  box: FixedBox,
  palette: number,
  hiddenFaces: number,
): number {
  let written = 0;
  for (let face = 0; face < 6; face++) {
    if ((hiddenFaces & (1 << face)) !== 0) continue;
    const d = Math.floor(face / 2);
    const positive = (face & 1) === 0;
    const axisU = (d + 1) % 3;
    const axisV = (d + 2) % 3;
    const normal = positive ? box.max[d] : box.min[d];
    const uMin = box.min[axisU];
    const uMax = box.max[axisU];
    const vMin = box.min[axisV];
    const vMax = box.max[axisV];
    const corners = positive
      ? [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]]
      : [[uMin, vMin], [uMin, vMax], [uMax, vMax], [uMax, vMin]];
    const quad = startQuad + written;
    const vertexBase = quad * 4;

    for (let corner = 0; corner < 4; corner++) {
      const positionOffset = (vertexBase + corner) * 3;
      scratch.positions[positionOffset + d] = normal;
      scratch.positions[positionOffset + axisU] = corners[corner][0];
      scratch.positions[positionOffset + axisV] = corners[corner][1];
      scratch.faces[vertexBase + corner] = face;
      scratch.palettes[vertexBase + corner] = palette;
      scratch.surfaces[vertexBase + corner] = SURFACE_KIND.utility;
      scratch.ao[vertexBase + corner] = 3;
    }

    const indexOffset = quad * 6;
    scratch.indices[indexOffset] = vertexBase;
    scratch.indices[indexOffset + 1] = vertexBase + 1;
    scratch.indices[indexOffset + 2] = vertexBase + 2;
    scratch.indices[indexOffset + 3] = vertexBase;
    scratch.indices[indexOffset + 4] = vertexBase + 2;
    scratch.indices[indexOffset + 5] = vertexBase + 3;
    written++;
  }
  return written;
}
