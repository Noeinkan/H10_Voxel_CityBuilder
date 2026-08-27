import { describe, expect, it } from 'vitest';
import { CHUNK, FACE_NEIGHBOUR_OFFSETS, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { greedyMesh } from './greedyMesher';
import {
  MAX_DETAIL_QUADS_PER_CHUNK,
  appendMicroGeometry,
  collectSurfaceCells,
  propRoll,
  type ChunkOrigin,
  type FixedBox,
  type MicroGeometryWriter,
} from './microGeometry';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';

/**
 * Il vocabolario maturo di `microDetail.ts`: agganci, quote, winding, cuciture
 * e priorita'.
 *
 * Sono gli stessi contratti della microgeometria storica — un prisma parte dalla
 * quota giusta, guarda dove dichiara e non pesa mai piu' della struttura — ma
 * chiesti agli emettitori nuovi, che agganciano cose che prima non esistevano:
 * terrazze attrezzate, fronti attivi, tetti praticabili.
 */

const U = MESH_UNITS_PER_VOXEL;

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

/** Vertice `i` del mesh, come terna. */
function corner(mesh: ReturnType<typeof greedyMesh>, vertex: number): [number, number, number] {
  return [mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]];
}

/** Quote di tutti i vertici di dettaglio. */
function detailZ(mesh: ReturnType<typeof greedyMesh>): number[] {
  const first = (mesh.quadCount - mesh.detailQuadCount) * 4;
  const out: number[] = [];
  for (let v = first; v < mesh.quadCount * 4; v++) out.push(mesh.positions[v * 3 + 2]);
  return out;
}

/** Intervalli `[min, max]` in quota di ogni quad di dettaglio. */
function detailZRanges(mesh: ReturnType<typeof greedyMesh>): [number, number][] {
  const first = mesh.quadCount - mesh.detailQuadCount;
  const out: [number, number][] = [];
  for (let quad = first; quad < mesh.quadCount; quad++) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 4; i++) {
      const z = mesh.positions[(quad * 4 + i) * 3 + 2];
      min = Math.min(min, z);
      max = Math.max(max, z);
    }
    out.push([min, max]);
  }
  return out;
}

function detailPalettes(mesh: ReturnType<typeof greedyMesh>): number[] {
  const first = (mesh.quadCount - mesh.detailQuadCount) * 4;
  return [...mesh.palettes.slice(first)];
}

function detailSurfaces(mesh: ReturnType<typeof greedyMesh>): number[] {
  const first = (mesh.quadCount - mesh.detailQuadCount) * 4;
  return [...mesh.surfaces.slice(first)];
}

/**
 * Parete abitata con la terrazza davanti: l'aggancio dei balconi.
 *
 * La terrazza e' la riga `roofTech` esposta della fascia **sotto**, che sporge
 * oltre il filo della parete nuova: e' la geometria che `paint` produce dalla
 * soglia di torre in poi, quando una fascia rientra e la parete sopra riparte
 * arretrata.
 */
function wallOverTerrace(terrace: boolean): Uint8Array {
  const padded = volume();
  for (let y = 2; y < CHUNK - 2; y++) {
    if (terrace) {
      setLocal(padded, 9, y, 5, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.roofTech));
    }
    for (let z = 6; z < 14; z++) {
      setLocal(padded, 8, y, z, packVisualBlock(PALETTE_SLOTS.concretePale, SURFACE_KIND.habitat));
    }
  }
  return padded;
}

/** Una chiazza di tetto tecnico esposta: l'aggancio di vasche e gruppi HVAC. */
function roofPatch(): Uint8Array {
  const padded = volume();
  for (let y = 6; y < 14; y++) {
    for (let x = 6; x < 14; x++) {
      setLocal(padded, x, y, 5, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.roofTech));
    }
  }
  return padded;
}

/** Un fronte con portale: l'aggancio delle fasce d'ingresso. */
function doorFront(): Uint8Array {
  const padded = volume();
  for (let z = 0; z < 8; z++) {
    setLocal(padded, 8, 8, z, packVisualBlock(
      PALETTE_SLOTS.concrete,
      z < 4 ? SURFACE_KIND.portal : SURFACE_KIND.habitat,
    ));
  }
  return padded;
}

/** Cerca un'origine per cui la fixture produce almeno un dettaglio del tipo dato. */
function originWith(padded: Uint8Array, wanted: (mesh: ReturnType<typeof greedyMesh>) => boolean): ChunkOrigin {
  for (let oy = 0; oy < 64; oy++) {
    const origin: ChunkOrigin = [0, oy * CHUNK, 0];
    if (wanted(greedyMesh(padded, undefined, undefined, origin))) return origin;
  }
  throw new Error('nessuna origine trovata per la fixture');
}

describe('microdettaglio degli edifici maturi', () => {
  it('il balcone si aggancia alla terrazza sotto, e senza terrazza non esiste', () => {
    // Stessa parete, con e senza l'anello `roofTech` sotto la prima riga: e'
    // l'aggancio a fare il dettaglio — la parete da sola non basta, altrimenti
    // ogni piano della citta' si metterebbe i balconi.
    const over = wallOverTerrace(true);
    const bare = wallOverTerrace(false);
    const mesh = greedyMesh(over, undefined, undefined, originWith(over, (m) => (
      detailPalettes(m).includes(PALETTE_SLOTS.stone)
    )));
    const plain = greedyMesh(bare, undefined, undefined, [0, 0, 0]);

    expect(detailPalettes(mesh)).toContain(PALETTE_SLOTS.stone);
    expect(detailPalettes(mesh)).toContain(PALETTE_SLOTS.metalDark);
    expect(detailPalettes(plain)).not.toContain(PALETTE_SLOTS.stone);
  });

  it('la lastra del balcone parte dalla base della cella e il corrimano sopra', () => {
    const padded = wallOverTerrace(true);
    const origin = originWith(padded, (mesh) => (
      detailPalettes(mesh).includes(PALETTE_SLOTS.stone)
    ));
    const mesh = greedyMesh(padded, undefined, undefined, origin);
    const ranges = detailZRanges(mesh);
    // La parete riparte a quota 6: la lastra sta a 6*U..6*U+3 e il corrimano a
    // 6*U+3..6*U+7 — nessuno dei due scende dentro il voxel della terrazza.
    expect(ranges).toContainEqual([6 * U, 6 * U + 3]);
    expect(ranges).toContainEqual([6 * U + 3, 6 * U + 7]);
    // Nessun prisma del balcone resta interrato: tutto parte sopra il tetto.
    const zs = detailZ(mesh);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(6 * U);
  });

  it('la vasca poggia sul calpestio che il tetto ha davvero e chiude con il coperchio', () => {
    // Sul tetto piano `carvePlan` scava il vassoio, quindi il calpestio scende
    // sotto il filo del voxel: la vasca deve seguirlo — e' la stessa regola di
    // antenne e pergole. Qui si verifica il contratto, non il numero del
    // vassoio: il tamburo e' alto otto sedicesimi e il coperchio poggia
    // **esattamente** sulla sua testa.
    const padded = roofPatch();
    const origin = originWith(padded, (mesh) => (
      detailPalettes(mesh).includes(PALETTE_SLOTS.concretePale)
    ));
    const mesh = greedyMesh(padded, undefined, undefined, origin);
    const palettes = detailPalettes(mesh);
    const ranges = detailZRanges(mesh);

    const body = ranges.find((range, index) => (
      palettes[index * 4] === PALETTE_SLOTS.concretePale && range[1] > range[0]
    ));
    expect(body).toBeDefined();
    const [base, top] = body!;
    expect(top - base).toBe(8);
    expect(ranges.some((range, index) => (
      range[0] === top && range[1] === top + 1 &&
      palettes[index * 4] === PALETTE_SLOTS.metalBrass
    ))).toBe(true);
  });

  it('la fascia d ingresso esce luminosa solo accanto a un portale', () => {
    const withDoor = doorFront();
    const noDoor = volume();
    for (let z = 0; z < 8; z++) {
      setLocal(noDoor, 8, 8, z, packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.habitat));
    }

    const mesh = greedyMesh(withDoor, undefined, undefined, [0, 0, 0]);
    const bare = greedyMesh(noDoor, undefined, undefined, [0, 0, 0]);
    const lit = (m: ReturnType<typeof greedyMesh>): boolean => detailSurfaces(m).includes(SURFACE_KIND.luminous);
    expect(lit(mesh)).toBe(true);
    expect(lit(bare)).toBe(false);
  });

  it('ogni quad di dettaglio nuovo guarda dove dichiara di guardare', () => {
    // Il test del winding su una fixture che accende tutti gli agganci nuovi:
    // un quad girato male non e' storto, e' invisibile — e nessun conto di
    // prismi se ne accorge.
    const padded = volume();
    // Parete con terrazza e portale sotto: balconi, telai e tende.
    for (let y = 2; y < CHUNK - 2; y++) {
      setLocal(padded, 9, y, 5, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.roofTech));
      for (let z = 6; z < 16; z++) {
        setLocal(padded, 8, y, z, packVisualBlock(PALETTE_SLOTS.concretePale, SURFACE_KIND.habitat));
      }
      for (let z = 0; z < 4; z++) {
        setLocal(padded, 8, y, z, packVisualBlock(PALETTE_SLOTS.stoneDark, SURFACE_KIND.portal));
      }
    }
    // Fronte luminoso: davanzali.
    for (let y = 2; y < CHUNK - 2; y++) {
      setLocal(padded, 16, y, 8, packVisualBlock(PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous));
      setLocal(padded, 16, y, 9, packVisualBlock(PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous));
    }
    // Parete industriale e civica: passerelle, terminali, lesene e pinne.
    for (let y = 2; y < CHUNK - 2; y++) {
      for (let z = 2; z < 12; z++) {
        setLocal(padded, 24, y, z, packVisualBlock(PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial));
        setLocal(padded, 28, y, z, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));
      }
    }
    // Tetto: vasche, gruppi HVAC, antenne e pergole.
    for (let y = 20; y < 28; y++) {
      for (let x = 20; x < 28; x++) {
        setLocal(padded, x, y, 12, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.roofTech));
      }
    }

    const mesh = greedyMesh(padded, undefined, undefined, [0, 0, 0]);
    const first = mesh.quadCount - mesh.detailQuadCount;
    expect(mesh.detailQuadCount).toBeGreaterThan(0);

    for (let quad = first; quad < mesh.quadCount; quad++) {
      const base = quad * 4;
      const [ax, ay, az] = corner(mesh, base);
      const [bx, by, bz] = corner(mesh, base + 1);
      const [cx, cy, cz] = corner(mesh, base + 2);
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const declared = FACE_NEIGHBOUR_OFFSETS[mesh.faces[base]];
      const dot = normal[0] * declared[0] + normal[1] * declared[1] + normal[2] * declared[2];
      if (dot <= 0) {
        expect({ quad, face: mesh.faces[base], normal, declared }).toEqual({
          quad,
          face: mesh.faces[base],
          normal: declared,
          declared,
        });
      }
    }
  });

  it('il tiro per colonna continua attraverso la cucitura dei chunk', () => {
    // La stessa cella di mondo, letta dai due lati del confine, deve rispondere
    // con lo stesso tiro: e' la regola di `propRoll`, e senza di lei un balcone
    // cambierebbe idea attraversando la cucitura.
    for (let y = 0; y < 8; y++) {
      for (let z = 0; z < 8; z++) {
        for (const salt of [0x41a2_7c55, 0x6b31_dd84, 0x19c4_6a0f]) {
          const here = propRoll([0, 0, 0], CHUNK - 1, y, z, salt);
          const there = propRoll([CHUNK, 0, 0], -1, y, z, salt);
          expect(there, `x=31 vs 32 y=${y} z=${z}`).toBe(here);
        }
      }
    }

    // E il balcone sull'ultima colonna del chunk arriva **fino al confine**,
    // senza rientrare: la meta' che sta nel chunk accanto si attacca a filo.
    // La terrazza davanti alla parete sta nel padding: nel mondo e' il chunk
    // accanto, e il mesher la legge attraverso la corsia di bordo.
    const padded = volume();
    for (let y = 2; y < CHUNK - 2; y++) {
      setLocal(padded, CHUNK, y, 5, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.roofTech));
      for (let z = 6; z < 10; z++) {
        setLocal(padded, CHUNK - 1, y, z, packVisualBlock(PALETTE_SLOTS.concretePale, SURFACE_KIND.habitat));
      }
    }
    const origin = originWith(padded, (mesh) => (
      detailPalettes(mesh).includes(PALETTE_SLOTS.stone)
    ));
    const mesh = greedyMesh(padded, undefined, undefined, origin);
    const first = (mesh.quadCount - mesh.detailQuadCount) * 4;
    // La lastra del balcone sull'ultima colonna arriva al filo del confine e
    // sporge oltre per la sua profondita' (3/16): la meta' nel chunk accanto
    // si attacca a filo, senza rientrare per il bordo.
    let slabMax = 0;
    for (let v = first; v < mesh.quadCount * 4; v++) {
      if (mesh.palettes[v] === PALETTE_SLOTS.stone) {
        slabMax = Math.max(slabMax, mesh.positions[v * 3]);
      }
    }
    expect(slabMax).toBe(CHUNK * U + 3);
  });

  it('sotto pressione di budget cadono i dettagli nuovi, non la struttura', () => {
    // La sequenza di emissione e' un contratto: i primi quad sono sempre quelli
    // della struttura. Un writer con un tetto piccolo deve produrre
    // **esattamente il prefisso** della corsa piena — la priorita' e' l'ordine,
    // non una speranza.
    const padded = volume();
    for (let y = 2; y < CHUNK - 2; y++) {
      setLocal(padded, 8, y, 5, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.roofTech));
      for (let z = 0; z < 4; z++) {
        setLocal(padded, 8, y, z, packVisualBlock(PALETTE_SLOTS.stoneDark, SURFACE_KIND.portal));
      }
      for (let z = 6; z < 12; z++) {
        setLocal(padded, 8, y, z, packVisualBlock(PALETTE_SLOTS.concretePale, SURFACE_KIND.habitat));
      }
    }

    type Box = { readonly palette: number; readonly hidden: number; readonly surface: number };
    const run = (cap: number): Box[] => {
      const boxes: Box[] = [];
      let quads = 0;
      const writer: MicroGeometryWriter = {
        get remainingQuads(): number {
          return cap - quads;
        },
        emitBox(_box: FixedBox, palette: number, hidden: number, surface: number): boolean {
          const faces = 6 - countBits(hidden & 0b11_1111);
          if (faces > cap - quads) return false;
          quads += faces;
          boxes.push({ palette, hidden, surface });
          return true;
        },
      };
      appendMicroGeometry(padded, writer, new Uint8Array(PADDED_VOL), collectSurfaceCells(padded), [0, 0, 0]);
      return boxes;
    };

    const full = run(MAX_DETAIL_QUADS_PER_CHUNK);
    expect(full.length).toBeGreaterThan(0);
    const capped = run(240);
    expect(capped.length).toBeGreaterThan(0);
    expect(capped.length).toBeLessThan(full.length);
    expect(capped).toEqual(full.slice(0, capped.length));
  });
});

function countBits(value: number): number {
  let bits = 0;
  for (let v = value; v !== 0; v >>>= 1) bits += v & 1;
  return bits;
}

