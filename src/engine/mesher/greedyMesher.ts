import { CEILING_VOL, CHUNK, PADDED, PADDED_VOL, SKY_PROBE } from '../../world/chunkCoords';
import {
  BLOCK_SURFACE_SHIFT,
  blockPalette,
  blockSurface,
  SURFACE_KIND,
  type SurfaceKind,
} from '../../world/visualBlock';
import { carvedFace } from './carveMarks';
import { appendCarveDetail } from './carveGeometry';
import { clearCarves, planCarves } from './carvePlan';
import { appendCoverDetail, liftGroundCover, restoreGroundCover } from './coverDetail';
import {
  appendAerialSupportDetail,
  liftAerialSupports,
  restoreAerialSupports,
} from './aerialSupportDetail';
import {
  appendMicroGeometry,
  collectSurfaceCells,
  MAX_DETAIL_QUADS_PER_CHUNK,
  type BoxOptions,
  type ChunkOrigin,
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
  shade: Uint8Array;
  indices: Uint32Array;
  /** Maschera di una slice: 0 = nessuna faccia, >0 = faccia positiva, <0 = negativa. */
  readonly mask: Int32Array;
  /**
   * Per ogni cella del volume paddato, quanti voxel vuoti la separano dal primo
   * solido sopra di lei, saturati a `SKY_PROBE`. Riempita da `sweepSkyGap`.
   */
  readonly skyGap: Uint8Array;
  /** Corse di vuoto in lavorazione, una per colonna del volume paddato. */
  readonly skyRuns: Uint8Array;
  /**
   * Per ogni cella del volume paddato, quanta luce le arriva da una superficie
   * emissiva vicina, 0..`GLOW_SOURCE`. Riempita da `sweepGlow`.
   */
  readonly glow: Uint8Array;
  /**
   * Per ogni cella del volume paddato, quale faccia e' scavata e con quale
   * ricetta. Riempita da `planCarves`, letta dal mask loop, azzerata in fondo.
   *
   * Sta nello scratch e non a livello di modulo perche' il mask loop la legge
   * per ogni faccia che sta per emettere: e' l'unico array nuovo del percorso
   * caldo, e vive accanto agli altri due che quel ciclo gia' consulta.
   */
  readonly carveMarks: Uint8Array;
  capacityQuads: number;
}

/** Massimo teorico del solo greedy pass: pattern a scacchiera in un chunk. */
export const MAX_BASE_QUADS_PER_CHUNK = 6 * (CHUNK * CHUNK * CHUNK) * 0.5;

/** Massimo teorico complessivo, inclusa la microgeometria. */
export const MAX_QUADS_PER_CHUNK = MAX_BASE_QUADS_PER_CHUNK + MAX_DETAIL_QUADS_PER_CHUNK;

const STRIDE: readonly [number, number, number] = [1, PADDED, PADDED * PADDED];

const ORIGIN_ZERO: ChunkOrigin = [0, 0, 0];

export function createScratch(initialQuads = 4096): MeshScratch {
  return {
    positions: new Int16Array(initialQuads * 12),
    faces: new Uint8Array(initialQuads * 4),
    palettes: new Uint8Array(initialQuads * 4),
    surfaces: new Uint8Array(initialQuads * 4),
    shade: new Uint8Array(initialQuads * 4),
    indices: new Uint32Array(initialQuads * 6),
    mask: new Int32Array(CHUNK * CHUNK),
    skyGap: new Uint8Array(PADDED_VOL),
    skyRuns: new Uint8Array(PADDED * PADDED),
    glow: new Uint8Array(PADDED_VOL),
    carveMarks: new Uint8Array(PADDED_VOL),
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
  const shade = new Uint8Array(cap * 4);
  shade.set(scratch.shade);
  const indices = new Uint32Array(cap * 6);
  indices.set(scratch.indices);

  scratch.positions = positions;
  scratch.faces = faces;
  scratch.palettes = palettes;
  scratch.surfaces = surfaces;
  scratch.shade = shade;
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
 * @param ceiling fetta 34x34x`SKY_PROBE` sopra il volume; omessa vale cielo
 *   libero, che e' cio' che serve a chi mesha un volume isolato
 * @param origin angolo minimo del chunk in voxel di mondo; serve solo a seminare
 *   la scelta dei prop, e omesso vale l'origine
 */
export function greedyMesh(
  padded: Uint8Array,
  scratch?: MeshScratch,
  ceiling?: Uint8Array,
  origin?: ChunkOrigin,
): MeshArrays {
  if (padded.length !== PADDED_VOL) {
    throw new Error(`greedyMesh: expected a volume of ${PADDED_VOL} cells, received ${padded.length}`);
  }
  if (ceiling !== undefined && ceiling.length !== CEILING_VOL) {
    throw new Error(`greedyMesh: expected a ceiling of ${CEILING_VOL} cells, received ${ceiling.length}`);
  }
  const s = scratch ?? createScratch();
  const mask = s.mask;
  const skyGap = s.skyGap;
  const glow = s.glow;
  const carveMarks = s.carveMarks;

  // Le coperture escono dal volume prima di qualunque cosa lo legga: cielo, AO e
  // greedy pass devono vedere il terreno nudo, perche' al posto del cubo ci
  // andra' la microgeometria di `coverDetail.ts`. Il volume torna intatto in
  // fondo alla funzione.
  const cover = liftGroundCover(padded, ceiling);

  // Le gambe ordinarie conservano nel mondo il proprio 2 x 2 pieno, ma nel
  // volume di rendering lasciano posto a un fusto in sedicesimi. Come per la
  // copertura, il volume viene ripristinato prima di uscire.
  const aerialSupports = liftAerialSupports(padded, origin);

  // **Una scansione sola per due lettori.** `collectSurfaceCells` filtra il
  // volume per superficie e per faccia esposta, e serviva ai prop; da quando c'e'
  // il piano degli scavi serve anche a lui, e per lui deve girare **prima** del
  // greedy pass. Farla qui invece che dentro `appendMicroGeometry` non aggiunge
  // una passata: la sposta, e il piano smette di doversene fare una sua — che
  // costava 7,8 ms per chunk, cioe' l'intero budget di rebuild.
  const surfaceCells = collectSurfaceCells(padded);

  // Gli scavi si decidono qui, prima del greedy pass, perche' il mask loop deve
  // sapere quali facce **non** emettere. A differenza delle coperture non
  // toccano il volume: la cella resta piena, quindi cielo, bagliore e AO dei
  // vicini raccontano ancora la stessa parete. Una nicchia non deve scurire il
  // muro a due metri.
  const carves = planCarves(padded, carveMarks, origin ?? ORIGIN_ZERO, surfaceCells);

  sweepSkyGap(padded, ceiling, skyGap, s.skyRuns);
  sweepGlow(padded, glow);

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
    // Gli stessi id che `faceId` ricompone piu' sotto: `FACE_PX` e' `0 * 2`,
    // `FACE_PY` e' `1 * 2`, `FACE_PZ` e' `2 * 2`. Fuori dal ciclo perche' la
    // maschera degli scavi si interroga per faccia e non per cella.
    const positiveFace = d * 2;
    const negativeFace = d * 2 + 1;

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
          // Una faccia scavata non si emette: al suo posto ci va la cavita' di
          // `carveGeometry.ts`, e lasciare il quad piatto la coprirebbe. Il test
          // costa una lettura e due confronti, e cade solo su facce che stanno
          // gia' per essere emesse — sopprimere significa `mask[n] = 0`, cioe'
          // il valore che il merge non fonde con niente, quindi non c'e' un
          // campo nuovo da far entrare in `packFace`.
          if (a !== 0) {
            mask[n] = b === 0 && canEmitPositive && !carvedFace(carveMarks, p, positiveFace)
              ? packFace(a, p + sd, su, sv, padded, skyGap, glow)
              : 0;
          } else {
            mask[n] = b !== 0 && canEmitNegative && !carvedFace(carveMarks, p + sd, negativeFace)
              ? -packFace(b, p, su, sv, padded, skyGap, glow)
              : 0;
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
          //
          // Cielo e bagliore sono della faccia intera e non del corner — sono
          // due sondaggi dalla stessa cella vuota adiacente — quindi entrano
          // uguali nei quattro byte, nei bit alti.
          const sky = (((packed >>> SKY_SHIFT) & SKY_MASK) << SHADE_SKY_SHIFT) |
            (((packed >>> GLOW_SHIFT) & GLOW_MASK) << SHADE_GLOW_SHIFT);
          const ao0 = (packed >>> AO_00_SHIFT) & AO_MASK;
          const ao1 = (packed >>> AO_10_SHIFT) & AO_MASK;
          const ao2 = (packed >>> AO_11_SHIFT) & AO_MASK;
          const ao3 = (packed >>> AO_01_SHIFT) & AO_MASK;
          s.shade[vbase] = ao0 | sky;
          if (positive) {
            s.shade[vbase + 1] = ao1 | sky;
            s.shade[vbase + 2] = ao2 | sky;
            s.shade[vbase + 3] = ao3 | sky;
          } else {
            s.shade[vbase + 1] = ao3 | sky;
            s.shade[vbase + 2] = ao2 | sky;
            s.shade[vbase + 3] = ao1 | sky;
          }

          const iOff = quadCount * 6;
          // La diagonale si sceglie sulla sola AO: il cielo e' costante sul quad
          // e sommarlo qui non cambierebbe il confronto, ma lo renderebbe opaco.
          if (ao0 + ao2 > ao1 + ao3) {
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
    emitBox(
      box: FixedBox,
      palette: number,
      hiddenFaces: number,
      surface: SurfaceKind,
      options?: BoxOptions,
    ): boolean {
      const faceCount = 6 - countBits(hiddenFaces & 0b11_1111);
      if (faceCount > this.remainingQuads) return false;
      if (quadCount + faceCount > s.capacityQuads) growScratch(s, quadCount + faceCount);
      quadCount += writeDetailBox(
        s,
        quadCount,
        box,
        palette,
        hiddenFaces,
        levelAtBox(box, skyGap, SKY_LEVEL_STEP),
        levelAtBox(box, glow, GLOW_LEVEL_STEP),
        surface,
        options?.inward === true,
        options?.ao ?? SHADE_AO_FREE,
      );
      for (let axis = 0; axis < 3; axis++) {
        if (box.min[axis] < boundsMin[axis]) boundsMin[axis] = box.min[axis];
        if (box.max[axis] > boundsMax[axis]) boundsMax[axis] = box.max[axis];
      }
      return true;
    },
  };
  // **L'ordine qui e' una scala di gravita', non una preferenza.**
  //
  // Gli scavi passano per primi perche' la loro faccia base e' gia' stata
  // soppressa dal mask loop: troncarne uno non lascerebbe un edificio piu'
  // spoglio ma un edificio **bucato**, cioe' un muro attraverso cui si vede
  // l'interno. `planCarves` si e' gia' limitato a `MAX_CARVE_QUADS_PER_CHUNK`,
  // che sta sotto il tetto dei dettagli, quindi arrivando per primi hanno la
  // certezza di starci — ed e' quella certezza, non l'ordine da sola, a
  // garantire che una faccia soppressa venga sempre pagata.
  //
  // La copertura viene subito dopo per la stessa ragione un grado piu' lieve: la
  // sua cella non c'e' piu' nel volume, quindi troncarla lascia una chiazza
  // calva. Tutto il resto, a cadere, lascia solo un edificio meno vestito.
  const carveQuadCount = appendCarveDetail(padded, carveMarks, writer, carves);
  const coverQuadCount = appendCoverDetail(padded, writer, cover, origin);
  const supportQuadCount = appendAerialSupportDetail(writer, aerialSupports);
  const detailQuadCount = carveQuadCount + coverQuadCount + supportQuadCount +
    appendMicroGeometry(padded, writer, carveMarks, surfaceCells, origin);
  restoreAerialSupports(padded, aerialSupports);
  restoreGroundCover(padded, ceiling, cover);
  // La maschera vive nello scratch, che il pool riusa fra un job e l'altro:
  // azzerare le sole celle toccate costa quanto il piano invece che quanto il
  // volume.
  clearCarves(carveMarks, carves);

  if (quadCount === 0) {
    return {
      positions: EMPTY_I16,
      faces: EMPTY_U8,
      palettes: EMPTY_U8,
      surfaces: EMPTY_U8,
      shade: EMPTY_U8,
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
    shade: s.shade.slice(0, vertexCount),
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
const SKY_SHIFT = 16;
const SKY_MASK = 0b11;
const GLOW_SHIFT = 18;
const GLOW_MASK = 0b11;

/**
 * Bit del byte per vertice: AO in basso, cielo sopra, bagliore vicino in cima.
 *
 * Tre campi geometrici in sei bit, e nessun attributo di vertice in piu': e' la
 * stessa mossa con cui la 4.7 ha fatto entrare il cielo accanto all'AO. Restano
 * liberi i due bit alti.
 */
export const SHADE_AO_MASK = 0b11;
export const SHADE_SKY_SHIFT = 2;
export const SHADE_SKY_MASK = 0b11;
export const SHADE_GLOW_SHIFT = 4;
export const SHADE_GLOW_MASK = 0b11;

/**
 * Luce di una superficie emissiva alla sorgente, in unita' di decadimento.
 *
 * **Sei, e la prima volta erano dodici.** Con un alone di dodici voxel ogni
 * faccia di un edificio cadeva dentro il raggio di qualcosa di acceso — le
 * fasce luminose corrono su tutta la faccia d'accento — e a schermo l'edificio
 * intero diventava ambra invece di avere una parete schiarita accanto
 * all'insegna. Sei voxel sono due piani: la scala a cui una luce accesa si
 * legge davvero su una facciata.
 */
const GLOW_SOURCE = 6;

/** Quanto vale un livello dei quattro che entrano nel byte per vertice. */
const GLOW_LEVEL_STEP = 2;

/**
 * Intervallo di byte che porta una superficie emissiva.
 *
 * `luminous` e `portal` sono i valori 4 e 5 dei tre bit alti, quindi i byte da
 * 4*32 a 6*32 esclusi. Confrontare il byte intero evita di estrarre la
 * superficie per ognuna delle 39 304 celle del volume paddato.
 */
const EMISSIVE_LOW = SURFACE_KIND.luminous << BLOCK_SURFACE_SHIFT;
const EMISSIVE_HIGH = (SURFACE_KIND.roofTech) << BLOCK_SURFACE_SHIFT;
/** Corner del tutto libero: e' il valore che l'AO assume dove non occlude. */
const SHADE_AO_FREE = 3;

/**
 * Livelli di visibilita' del cielo. Ognuno vale un quarto di `SKY_PROBE`, quindi
 * il livello 3 comincia a tre quarti del sondaggio: piu' in alto di cosi' una
 * copertura non racconta piu' niente e la cella si considera scoperta.
 */
const SKY_LEVEL_STEP = SKY_PROBE / 4;

/** AO classica a quattro livelli per un corner su una faccia visibile. */
function cornerAO(pn: number, du: number, dv: number, su: number, sv: number, padded: Uint8Array): number {
  const side1 = padded[pn + du * su] === 0 ? 0 : 1;
  const side2 = padded[pn + dv * sv] === 0 ? 0 : 1;
  if (side1 === 1 && side2 === 1) return 0;
  const corner = padded[pn + du * su + dv * sv] === 0 ? 0 : 1;
  return 3 - side1 - side2 - corner;
}

/**
 * Palette, superficie, quattro corner AO e visibilita' del cielo in una chiave
 * confrontabile dal greedy merge.
 *
 * Tutto cio' che distingue due facce deve stare qui dentro, altrimenti il merge
 * ne fonderebbe due diverse: e' per questo che il cielo occupa due bit propri e
 * non viene ricavato dopo. `pn` e' la cella **vuota** adiacente alla faccia, la
 * stessa da cui l'AO guarda i vicini e da cui il cielo guarda in su.
 */
function packFace(
  block: number,
  pn: number,
  su: number,
  sv: number,
  padded: Uint8Array,
  skyGap: Uint8Array,
  glow: Uint8Array,
): number {
  const ao00 = cornerAO(pn, -1, -1, su, sv, padded);
  const ao10 = cornerAO(pn, 1, -1, su, sv, padded);
  const ao11 = cornerAO(pn, 1, 1, su, sv, padded);
  const ao01 = cornerAO(pn, -1, 1, su, sv, padded);
  const sky = Math.min(3, Math.floor(skyGap[pn] / SKY_LEVEL_STEP));
  // Il bagliore si legge dalla cella **vuota** adiacente alla faccia, la stessa
  // da cui guardano l'AO e il cielo: e' l'aria davanti al muro a essere
  // illuminata, non il muro dentro.
  const glowLevel = Math.min(3, Math.floor(glow[pn] / GLOW_LEVEL_STEP));
  return blockPalette(block) |
    (ao00 << AO_00_SHIFT) |
    (ao10 << AO_10_SHIFT) |
    (ao11 << AO_11_SHIFT) |
    (ao01 << AO_01_SHIFT) |
    (blockSurface(block) << SURFACE_SHIFT) |
    (sky << SKY_SHIFT) |
    (glowLevel << GLOW_SHIFT);
}

/**
 * Luce che **esce** da una superficie emissiva, cotta nel mesher.
 *
 * Fino alla 4.7 `emission` illuminava il proprio pixel e alimentava il bloom, e
 * non schiariva il muro di fronte: per quello servirebbe una luce vera, cioe'
 * una pass in piu' o un elenco di sorgenti nel fragment. Il dato pero' e' gia'
 * qui — chi emette e' un voxel con superficie `luminous` o `portal` — e quello
 * che manca e' solo portarlo fino al frammento.
 *
 * **Il valore si propaga per massimo con decadimento, separabile sui tre assi.**
 * Sei scansioni lineari sul volume paddato, nessuna allocazione: e' la stessa
 * forma di `sweepSkyGap`, e come quella costa a prescindere dal contenuto. Il
 * decadimento di uno per voxel su `GLOW_SOURCE` da' un alone di dodici voxel
 * che il campo per faccia quantizza a quattro livelli.
 *
 * La distanza che ne esce e' quella di Manhattan e non quella euclidea: un alone
 * a rombo invece che a cerchio. A quattro livelli di quantizzazione la
 * differenza non si vede, e costa sei passate invece di un raggio vero.
 *
 * **Chi non ha emettitori non paga le sei passate**, e sono la maggioranza dei
 * chunk: terreno, mare e periferia non hanno una sola superficie accesa.
 */
function sweepGlow(padded: Uint8Array, glow: Uint8Array): boolean {
  let sources = 0;
  for (let i = 0; i < PADDED_VOL; i++) {
    const block = padded[i];
    // L'acqua non puo' essere un emettitore: `WATER_CLASS` occupa gli stessi
    // bit ma i suoi tre valori sono plain, habitat e industrial, mai questi due.
    // Il confronto e' sul byte intero invece che sulla superficie estratta: i
    // cinque bit bassi sono la palette, quindi «superficie luminous o portal»
    // e' «il byte cade in uno di due intervalli di trentadue», e questa e' la
    // sola scansione che tocca ogni cella del volume paddato.
    const emissive = block >= EMISSIVE_LOW && block < EMISSIVE_HIGH;
    glow[i] = emissive ? GLOW_SOURCE : 0;
    if (emissive) sources++;
  }
  if (sources === 0) return false;

  sweepGlowAxis(glow, 1);
  sweepGlowAxis(glow, PADDED);
  sweepGlowAxis(glow, PADDED * PADDED);
  return true;
}

/**
 * Massimo con decadimento avanti e indietro lungo un asse.
 *
 * Le linee sono sempre `PADDED` celle e sempre `PADDED^2` in numero, qualunque
 * sia l'asse: cambia solo da dove partono, e ricavarlo dallo stride evita tre
 * cicli annidati diversi per i tre assi.
 */
function sweepGlowAxis(glow: Uint8Array, stride: number): void {
  const span = PADDED;
  const lines = PADDED_VOL / span;
  const last = (span - 1) * stride;
  for (let line = 0; line < lines; line++) {
    const base = stride === 1
      ? line * PADDED
      : stride === PADDED
        ? (line % PADDED) + Math.floor(line / PADDED) * PADDED * PADDED
        : line;

    // L'indice avanza di `stride`, non si ricalcola: e' la scansione piu'
    // percorsa del mesher — sei volte l'intero volume paddato — e una
    // moltiplicazione per cella si sente.
    let run = 0;
    for (let p = base; p <= base + last; p += stride) {
      const value = glow[p];
      if (value > run) run = value;
      glow[p] = run;
      if (run > 0) run--;
    }
    run = 0;
    for (let p = base + last; p >= base; p -= stride) {
      const value = glow[p];
      if (value > run) run = value;
      glow[p] = run;
      if (run > 0) run--;
    }
  }
}

/**
 * Per ogni cella, quanti voxel vuoti la separano dal primo solido sopra di lei.
 *
 * Una sola passata dall'alto verso il basso per colonna: la corsa di vuoto che
 * comincia sopra una cella e' quella che comincia sopra la cella superiore, piu'
 * uno — a meno che la cella superiore non sia piena, e allora riparte da zero.
 * La fetta di soffitto entra come prolungamento della colonna, cosi' una campata
 * che sta nel chunk sopra scurisce comunque la carreggiata che copre.
 *
 * Sopra la fetta si assume cielo libero: un chunk non ancora generato non deve
 * comparire come una copertura, o la citta' si scurirebbe mentre si carica.
 */
function sweepSkyGap(
  padded: Uint8Array,
  ceiling: Uint8Array | undefined,
  skyGap: Uint8Array,
  runs: Uint8Array,
): void {
  const plane = PADDED * PADDED;

  // Un piano alla volta e non una colonna alla volta, con le corse di tutte le
  // colonne tenute a lato: cosi' i tre array si leggono e si scrivono in ordine
  // sequenziale. Colonna per colonna il passo sarebbe di 1156 byte e ogni cella
  // costerebbe una linea di cache — la stessa passata misurava il triplo.
  runs.fill(SKY_PROBE);

  if (ceiling !== undefined) {
    for (let k = SKY_PROBE - 1; k >= 0; k--) {
      const base = plane * k;
      for (let c = 0; c < plane; c++) {
        const run = runs[c];
        runs[c] = ceiling[base + c] !== 0 ? 0 : run < SKY_PROBE ? run + 1 : SKY_PROBE;
      }
    }
  }

  for (let pz = PADDED - 1; pz >= 0; pz--) {
    const base = plane * pz;
    for (let c = 0; c < plane; c++) {
      // Entrando nell'iterazione `runs[c]` e' la corsa che comincia a `pz + 1`,
      // cioe' esattamente cio' che questa cella vede sopra di se'.
      const run = runs[c];
      skyGap[base + c] = run;
      runs[c] = padded[base + c] !== 0 ? 0 : run < SKY_PROBE ? run + 1 : SKY_PROBE;
    }
  }
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

/**
 * Livello di un campo per cella, letto dove sta il centro di un prisma.
 *
 * I dettagli non hanno AO propria — sono troppo piccoli perche' un corner dica
 * qualcosa — ma il cielo sopra di loro e il bagliore attorno sono quelli della
 * cella in cui stanno. Senza ereditarli un condizionatore sotto un impalcato
 * resterebbe illuminato mentre la parete a cui e' appeso si spegne, e
 * un'insegna non schiarirebbe la propria mensola.
 */
function levelAtBox(box: FixedBox, field: Uint8Array, step: number): number {
  const px = clampPadded(Math.floor((box.min[0] + box.max[0]) / (2 * MESH_UNITS_PER_VOXEL)) + 1);
  const py = clampPadded(Math.floor((box.min[1] + box.max[1]) / (2 * MESH_UNITS_PER_VOXEL)) + 1);
  const pz = clampPadded(Math.floor((box.min[2] + box.max[2]) / (2 * MESH_UNITS_PER_VOXEL)) + 1);
  return Math.min(3, Math.floor(field[px + PADDED * (py + PADDED * pz)] / step));
}

function clampPadded(value: number): number {
  return value < 0 ? 0 : value > PADDED - 1 ? PADDED - 1 : value;
}

/**
 * Scrive i lati visibili di un prisma ortogonale negli stessi buffer del greedy
 * pass.
 *
 * **`inward` rovescia il prisma, e sono due righe sole.** Il lato geometrico
 * resta dov'e' — quello su `box.max[d]` sta su `box.max[d]` in ogni caso — ma
 * porta l'id di faccia **opposto**, quindi `uFaceNormal[aFace]` gli da' la
 * normale che punta verso il centro del prisma, e prende l'ordine di corner
 * dell'altro verso, cosi' il front face guarda dentro invece che fuori. E' tutta
 * la differenza fra un volume aggiunto e un vano scavato: `hiddenFaces`
 * continua a parlare di lati del prisma, e chi disegna un vano ci nasconde la
 * bocca invece del lato incollato.
 */
function writeDetailBox(
  scratch: MeshScratch,
  startQuad: number,
  box: FixedBox,
  palette: number,
  hiddenFaces: number,
  sky: number,
  glow: number,
  surface: SurfaceKind,
  inward: boolean,
  ao: number,
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
    const facing = inward ? face ^ 1 : face;
    const corners = positive !== inward
      ? [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]]
      : [[uMin, vMin], [uMin, vMax], [uMax, vMax], [uMax, vMin]];
    const quad = startQuad + written;
    const vertexBase = quad * 4;

    for (let corner = 0; corner < 4; corner++) {
      const positionOffset = (vertexBase + corner) * 3;
      scratch.positions[positionOffset + d] = normal;
      scratch.positions[positionOffset + axisU] = corners[corner][0];
      scratch.positions[positionOffset + axisV] = corners[corner][1];
      scratch.faces[vertexBase + corner] = facing;
      scratch.palettes[vertexBase + corner] = palette;
      scratch.surfaces[vertexBase + corner] = surface;
      scratch.shade[vertexBase + corner] = ao |
        (sky << SHADE_SKY_SHIFT) |
        (glow << SHADE_GLOW_SHIFT);
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
