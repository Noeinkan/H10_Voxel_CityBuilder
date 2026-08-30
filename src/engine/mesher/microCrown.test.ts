import { describe, expect, it } from 'vitest';
import { CHUNK, FACE_NEIGHBOUR_OFFSETS, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND, type SurfaceKind } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { CARVE_DEPTH, CARVE_KIND } from './carveMarks';
import { planCarves } from './carvePlan';
import { greedyMesh } from './greedyMesher';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import { appendCrownEdges, appendCrownProps, facadeUnder } from './microCrown';
import {
  MAX_DETAIL_QUADS_PER_CHUNK,
  collectSurfaceCells,
  type FixedBox,
  type MicroGeometryWriter,
} from './microGeometry';

/**
 * Il coronamento.
 *
 * **Cio' che vale la pena tenere fermo qui non e' la forma dei prismi ma il
 * segnale che li sceglie.** `facadeUnder` e' l'unico modo che il mesher ha di
 * sapere che edificio ha sotto un tetto, e ogni voce del gruppo ne dipende: se
 * quella funzione smettesse di distinguere i tre usi, la citta' tornerebbe ad
 * avere un tetto solo — e nessun conto di quad se ne accorgerebbe, perche' i
 * prismi ci sarebbero tutti.
 */

const U = MESH_UNITS_PER_VOXEL;

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

type Drawn = FixedBox & { readonly palette: number; readonly surface: number };

/**
 * I prismi del **solo** coronamento, fuori da `greedyMesh`.
 *
 * Per la stessa ragione di `streetBoxes` in `microStreet.test.ts`: passare dal
 * mesher intero misurerebbe anche parapetti, finiali e antenne, che si agganciano
 * agli stessi tetti e sposterebbero ogni conto.
 */
function crownBoxes(
  padded: Uint8Array,
  origin: readonly [number, number, number] = [0, 0, 0],
): readonly Drawn[] {
  const marks = new Uint8Array(PADDED_VOL);
  const cells = collectSurfaceCells(padded);
  planCarves(padded, marks, origin, cells);
  const roofs = cells.bySurface[SURFACE_KIND.roofTech];

  const boxes: Drawn[] = [];
  const writer: MicroGeometryWriter = {
    get remainingQuads() {
      return MAX_DETAIL_QUADS_PER_CHUNK;
    },
    emitBox: (box, palette, _hidden, surface) => {
      boxes.push({ ...box, palette, surface });
      return true;
    },
  };
  appendCrownEdges(padded, writer, roofs);
  appendCrownProps(padded, writer, roofs, origin, marks);
  return boxes;
}

/** Una torre di lato `side` con `use` sotto e un cappello `roofTech` in cima. */
function tower(use: SurfaceKind, side = 6, top = 12, ox = 4, oy = 4): Uint8Array {
  const padded = volume();
  paint(padded, use, side, top, ox, oy);
  return padded;
}

function paint(
  padded: Uint8Array,
  use: SurfaceKind,
  side: number,
  top: number,
  ox: number,
  oy: number,
): void {
  for (let z = 0; z <= top; z++) {
    const surface = z === top ? SURFACE_KIND.roofTech : use;
    for (let y = oy; y < oy + side; y++) {
      for (let x = ox; x < ox + side; x++) {
        setLocal(padded, x, y, z, packVisualBlock(PALETTE_SLOTS.concrete, surface));
      }
    }
  }
}

const EDGE_PALETTES = [PALETTE_SLOTS.roofPale, PALETTE_SLOTS.stoneWarm, PALETTE_SLOTS.metalRust];

describe('il coronamento', () => {
  it('il filo del tetto cambia profilo con l uso che ha sotto', () => {
    // **Il test che tiene in piedi il gruppo.** Tre torri identiche in tutto
    // tranne la banda sotto il cappello: se il filo uscisse uguale, `facadeUnder`
    // non starebbe distinguendo niente e i tre profili sarebbero tre nomi per la
    // stessa gronda. Si verifica anche il verso opposto — nessuna delle tre porta
    // il profilo di un'altra — perche' e' quello a cadere se un predicato si
    // allarga per sbaglio.
    const expected = [
      [SURFACE_KIND.habitat, PALETTE_SLOTS.roofPale],
      [SURFACE_KIND.civic, PALETTE_SLOTS.stoneWarm],
      [SURFACE_KIND.industrial, PALETTE_SLOTS.metalRust],
    ] as const;

    for (const [use, palette] of expected) {
      const palettes = new Set(crownBoxes(tower(use)).map((box) => box.palette));
      expect({ use, suo: palettes.has(palette) }).toEqual({ use, suo: true });
      for (const other of EDGE_PALETTES) {
        if (other === palette) continue;
        expect({ use, altrui: palettes.has(other) }).toEqual({ use, altrui: false });
      }
    }
  });

  it('facadeUnder attraversa cio che non e un uso e si ferma nel vuoto', () => {
    // Fra il cappello e la facciata ci stanno un secondo strato di tetto tecnico
    // e una fascia d'accento: fermarsi alla prima cella direbbe «nessun uso»
    // proprio sugli edifici piu' costruiti.
    const layered = volume();
    for (let z = 0; z < 4; z++) {
      const surface = z >= 2
        ? SURFACE_KIND.roofTech
        : z === 1 ? SURFACE_KIND.luminous : SURFACE_KIND.habitat;
      setLocal(layered, 8, 8, z, packVisualBlock(PALETTE_SLOTS.concrete, surface));
    }
    expect(facadeUnder(layered, 8, 8, 3)).toBe(SURFACE_KIND.habitat);

    // Un cappello che galleggia sul vuoto non ha un edificio sotto, e non deve
    // prendersi il cornicione di uno: l'aria e' una risposta, non un salto.
    const floating = volume();
    setLocal(floating, 8, 8, 8, packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech));
    expect(facadeUnder(floating, 8, 8, 8)).toBe(SURFACE_KIND.plain);

    // E sotto il pavimento del chunk non si legge: la' il volume paddato finisce.
    expect(facadeUnder(floating, 8, 8, 0)).toBe(SURFACE_KIND.plain);
  });

  it('il filo costa per perimetro, non per cella di tetto', () => {
    // La proprieta' che rende sostenibile il gruppo, chiesta come la chiede gia'
    // `microGeometry.test.ts` al parapetto: quattro corse per tetto, e il conto
    // non si muove al crescere del lato. Se cominciasse a muoversi, il filo
    // sarebbe tornato a essere un prisma per cella.
    const counts = new Set<number>();
    for (const side of [2, 3, 5, 8, 16]) {
      const edges = crownBoxes(tower(SURFACE_KIND.habitat, side, 10))
        .filter((box) => box.palette === PALETTE_SLOTS.roofPale);
      counts.add(edges.length);
    }
    expect(counts).toEqual(new Set([4]));
  });

  it('il filo pende sotto la linea del tetto e sporge fuori dal voxel', () => {
    // Le due meta' della sua ragione d'essere. **Sotto**, e non complanare: la
    // faccia superiore sta un sedicesimo sotto il piano del tetto, perche' a
    // quota identica si contenderebbe lo z con la faccia che il greedy pass
    // emette li'. **Fuori**, oltre il filo del voxel: e' la sporgenza a fare
    // l'ombra, ed e' cio' che il parapetto — che rientra — non puo' dare.
    const top = 10;
    const line = (top + 1) * U;
    const edges = crownBoxes(tower(SURFACE_KIND.habitat, 6, top))
      .filter((box) => box.palette === PALETTE_SLOTS.roofPale);
    expect(edges.length).toBe(4);

    for (const box of edges) {
      expect(box.max[2]).toBe(line - 1);
      expect(box.min[2]).toBeLessThan(line - 1);
      // Sporge da una parte sola, quella del vuoto: uno dei due estremi in piano
      // esce dall'impronta 4..10 della torre.
      const outside = box.min[0] < 4 * U || box.min[1] < 4 * U ||
        box.max[0] > 10 * U || box.max[1] > 10 * U;
      expect(outside).toBe(true);
    }
  });

  it('il comignolo sta sugli angoli del tetto, non in mezzo', () => {
    // L'aggancio e' quello che nessun altro prop occupa: `emitFinials` vuole zero
    // vicini, antenne e vasche ne vogliono quattro, il comignolo ne vuole due.
    const side = 5;
    const top = 8;
    const bricks = crownBoxes(tower(SURFACE_KIND.habitat, side, top))
      .filter((box) => box.palette === PALETTE_SLOTS.brick);
    expect(bricks.length).toBeGreaterThan(0);

    const corners = new Set([`${4},${4}`, `${8},${4}`, `${4},${8}`, `${8},${8}`]);
    for (const box of bricks) {
      const x = Math.floor(box.min[0] / U);
      const y = Math.floor(box.min[1] / U);
      expect({ x, y, angolo: corners.has(`${x},${y}`) }).toEqual({ x, y, angolo: true });
    }
  });

  it('il coronamento notturno si accende solo dove l uso lo chiede', () => {
    // Lanterna e lucernario escono `luminous` e passano dal ramo che il fragment
    // ha gia'; la ciminiera resta spenta, ed e' il contrasto a far leggere uno
    // skyline al buio. Un tetto largo perche' `interiorRoof` vuole quattro
    // vicini scoperti, e i tiri sono bassi.
    const lit = (use: SurfaceKind): boolean => crownBoxes(tower(use, 14, 10))
      .some((box) => box.surface === SURFACE_KIND.luminous);

    expect({ uso: 'civico', acceso: lit(SURFACE_KIND.civic) }).toEqual({ uso: 'civico', acceso: true });
    expect({ uso: 'abitato', acceso: lit(SURFACE_KIND.habitat) }).toEqual({ uso: 'abitato', acceso: true });
    expect({ uso: 'industria', acceso: lit(SURFACE_KIND.industrial) })
      .toEqual({ uso: 'industria', acceso: false });
  });

  it('ogni prop di tetto poggia sul calpestio vero, vassoio compreso', () => {
    // **Il difetto in cui il progetto e' gia' caduto una volta.** `openRoof`
    // risponde sul voxel solido, quindi la base sembra `(z + 1) * U`; sopra un
    // vassoio scavato il calpestio e' sceso di sei sedicesimi, e un prisma che
    // parte dal filo resta sospeso. Qui si verifica al contrario: dove il vassoio
    // scatta, nessun prop puo' cominciare sopra il piano abbassato.
    const padded = tower(SURFACE_KIND.civic, 14, 10);
    const marks = new Uint8Array(PADDED_VOL);
    const plan = planCarves(padded, marks, [0, 0, 0], collectSurfaceCells(padded));
    const trays = plan.byMark.some((cells, mark) => mark >>> 3 === CARVE_KIND.tray && cells.length > 0);
    expect(trays, 'il vassoio non scatta: la fixture non prova niente').toBe(true);

    // Il filo del tetto **pende** sotto la linea e sul bordo, dove il vassoio non
    // arriva: distinguerlo per quota non funziona — un cornicione civico scende
    // di sei e finirebbe fra i prop — e si distingue percio' per materiale, che
    // e' anche il modo in cui i due gruppi si separano davvero.
    const props: readonly number[] = [
      PALETTE_SLOTS.brick, PALETTE_SLOTS.glassPale,
      PALETTE_SLOTS.metalDark, PALETTE_SLOTS.metalBrass,
    ];
    const floor = 11 * U - CARVE_DEPTH[CARVE_KIND.tray];
    const bases = crownBoxes(padded)
      .filter((box) => props.includes(box.palette))
      .map((box) => box.min[2]);
    expect(bases.length).toBeGreaterThan(0);
    for (const base of bases) expect(base).toBeGreaterThanOrEqual(floor);
    // E almeno uno ci poggia davvero: se leggessero `(z + 1) * U` invece di
    // `roofBase`, starebbero **tutti** due sedicesimi piu' in alto e questo
    // confronto cadrebbe senza che nessun altro se ne accorga.
    expect(bases).toContain(floor);
  });

  it('ogni quad del gruppo guarda dove dichiara di guardare', () => {
    // Il materiale e' `FrontSide`: un prisma con il winding girato non e' storto,
    // e' **invisibile**, e nessun conto di prismi lo segnala. Si verifica sul
    // prodotto vettoriale del primo triangolo, come per gli scavi.
    const padded = volume();
    paint(padded, SURFACE_KIND.habitat, 8, 12, 1, 1);
    paint(padded, SURFACE_KIND.civic, 8, 16, 12, 1);
    paint(padded, SURFACE_KIND.industrial, 8, 14, 1, 12);

    const mesh = greedyMesh(padded);
    const first = mesh.quadCount - mesh.detailQuadCount;
    expect(mesh.detailQuadCount).toBeGreaterThan(0);

    for (let quad = first; quad < mesh.quadCount; quad++) {
      const base = quad * 4;
      const at = (v: number): [number, number, number] => [
        mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2],
      ];
      const [ax, ay, az] = at(base);
      const [bx, by, bz] = at(base + 1);
      const [cx, cy, cz] = at(base + 2);
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const declared = FACE_NEIGHBOUR_OFFSETS[mesh.faces[base]];
      const dot = normal[0] * declared[0] + normal[1] * declared[1] + normal[2] * declared[2];
      if (dot <= 0) {
        expect({ quad, face: mesh.faces[base], normal }).toEqual({
          quad, face: mesh.faces[base], normal: declared,
        });
      }
    }
  });

  it('e deterministico e semina i prop sulle coordinate di mondo', () => {
    const padded = tower(SURFACE_KIND.habitat, 14, 10);
    const here = crownBoxes(padded, [0, 0, 0]);
    expect(crownBoxes(padded, [0, 0, 0]).length).toBe(here.length);

    // Il filo del tetto non tira dadi e resta identico; i prop si spostano. Se
    // **niente** si muovesse, il tiro leggerebbe coordinate locali e due chunk
    // adiacenti arrederebbero le stesse celle.
    const far = crownBoxes(padded, [CHUNK * 5, -CHUNK * 3, 0]);
    const edges = (boxes: readonly Drawn[]): number =>
      boxes.filter((box) => box.palette === PALETTE_SLOTS.roofPale).length;
    expect(edges(far)).toBe(edges(here));
    expect(far.map((box) => box.min.join())).not.toEqual(here.map((box) => box.min.join()));
  });

  it('senza un tetto tecnico non emette niente', () => {
    // Il gruppo intero pende da `roofTech`: senza cappello non c'e' coronamento,
    // e nessun predicato deve inventarne uno da una facciata qualunque.
    const padded = volume();
    for (let z = 0; z < 10; z++) {
      for (let y = 6; y < 12; y++) {
        for (let x = 6; x < 12; x++) {
          setLocal(padded, x, y, z, packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.habitat));
        }
      }
    }
    expect(crownBoxes(padded).length).toBe(0);
  });

  it('misura il gruppo su una torre per uso', () => {
    let total = 0;
    for (const use of [SURFACE_KIND.habitat, SURFACE_KIND.civic, SURFACE_KIND.industrial] as const) {
      total += crownBoxes(tower(use, 14, 12)).length;
    }
    console.info(`[misura] coronamento su tre torri: ${total} prismi`);
    expect(total).toBeGreaterThan(0);
  });
});
