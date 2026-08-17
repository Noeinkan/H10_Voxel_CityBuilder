import { CHUNK, PADDED, PADDED_VOL } from '../../world/chunkCoords';
import type { MeshArrays } from './meshTypes';

/**
 * Greedy meshing per faccia su un volume paddato 34^3.
 *
 * Nessun import da Three.js: la funzione e' pura e restituisce array grezzi.
 *
 * Il volume di input e' il chunk 32^3 circondato da una cella di bordo che porta
 * i voxel dei chunk adiacenti. Servono solo i sei piani di faccia del padding:
 * spigoli e angoli non vengono mai letti, perche' lo sweep guarda +-1 unicamente
 * lungo il proprio asse.
 *
 * Ogni faccia viene emessa dal chunk che possiede il voxel solido: al bordo
 * inferiore (slice -1) si emette solo la faccia negativa, al bordo superiore
 * (slice 31) solo quella positiva. Senza questa regola due chunk adiacenti
 * emetterebbero due volte la stessa faccia.
 */

/** Buffer riusabili tra invocazioni successive, per non allocare a ogni rebuild. */
export interface MeshScratch {
  positions: Uint16Array;
  faces: Uint8Array;
  palettes: Uint8Array;
  indices: Uint32Array;
  /** Maschera di una slice: 0 = nessuna faccia, >0 = faccia positiva, <0 = negativa. */
  readonly mask: Int16Array;
  capacityQuads: number;
}

/** Numero massimo di quad producibili da un chunk 32^3 (pattern a scacchiera). */
export const MAX_QUADS_PER_CHUNK = 6 * (CHUNK * CHUNK * CHUNK) * 0.5;

const STRIDE: readonly [number, number, number] = [1, PADDED, PADDED * PADDED];

export function createScratch(initialQuads = 4096): MeshScratch {
  return {
    positions: new Uint16Array(initialQuads * 12),
    faces: new Uint8Array(initialQuads * 4),
    palettes: new Uint8Array(initialQuads * 4),
    indices: new Uint32Array(initialQuads * 6),
    mask: new Int16Array(CHUNK * CHUNK),
    capacityQuads: initialQuads,
  };
}

function growScratch(scratch: MeshScratch, neededQuads: number): void {
  let cap = scratch.capacityQuads;
  while (cap < neededQuads) cap *= 2;

  const positions = new Uint16Array(cap * 12);
  positions.set(scratch.positions);
  const faces = new Uint8Array(cap * 4);
  faces.set(scratch.faces);
  const palettes = new Uint8Array(cap * 4);
  palettes.set(scratch.palettes);
  const indices = new Uint32Array(cap * 6);
  indices.set(scratch.indices);

  scratch.positions = positions;
  scratch.faces = faces;
  scratch.palettes = palettes;
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
    throw new Error(`greedyMesh: atteso un volume di ${PADDED_VOL} celle, ricevute ${padded.length}`);
  }
  const s = scratch ?? createScratch();
  const mask = s.mask;

  let quadCount = 0;
  boundsMin[0] = boundsMin[1] = boundsMin[2] = CHUNK;
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
            mask[n] = b === 0 && canEmitPositive ? a : 0;
          } else {
            mask[n] = b !== 0 && canEmitNegative ? -b : 0;
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
          const paletteId = positive ? m : -m;
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
          pos[o + axisU] = u0;
          pos[o + axisV] = v0;
          pos[o + d] = plane;
          o += 3;
          pos[o + axisU] = u1;
          pos[o + axisV] = v1;
          pos[o + d] = plane;
          o += 3;
          pos[o + axisU] = u2;
          pos[o + axisV] = v2;
          pos[o + d] = plane;
          o += 3;
          pos[o + axisU] = u3;
          pos[o + axisV] = v3;
          pos[o + d] = plane;

          s.faces[vbase] = faceId;
          s.faces[vbase + 1] = faceId;
          s.faces[vbase + 2] = faceId;
          s.faces[vbase + 3] = faceId;
          s.palettes[vbase] = paletteId;
          s.palettes[vbase + 1] = paletteId;
          s.palettes[vbase + 2] = paletteId;
          s.palettes[vbase + 3] = paletteId;

          const iOff = quadCount * 6;
          s.indices[iOff] = vbase;
          s.indices[iOff + 1] = vbase + 1;
          s.indices[iOff + 2] = vbase + 2;
          s.indices[iOff + 3] = vbase;
          s.indices[iOff + 4] = vbase + 2;
          s.indices[iOff + 5] = vbase + 3;

          if (i < boundsMin[axisU]) boundsMin[axisU] = i;
          if (i + w > boundsMax[axisU]) boundsMax[axisU] = i + w;
          if (j < boundsMin[axisV]) boundsMin[axisV] = j;
          if (j + h > boundsMax[axisV]) boundsMax[axisV] = j + h;
          if (plane < boundsMin[d]) boundsMin[d] = plane;
          if (plane > boundsMax[d]) boundsMax[d] = plane;

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

  if (quadCount === 0) {
    return {
      positions: EMPTY_U16,
      faces: EMPTY_U8,
      palettes: EMPTY_U8,
      indices: EMPTY_U32,
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
    indices: s.indices.slice(0, quadCount * 6),
    quadCount,
    min: [boundsMin[0], boundsMin[1], boundsMin[2]],
    max: [boundsMax[0], boundsMax[1], boundsMax[2]],
  };
}

const EMPTY_U16 = new Uint16Array(0);
const EMPTY_U8 = new Uint8Array(0);
const EMPTY_U32 = new Uint32Array(0);
