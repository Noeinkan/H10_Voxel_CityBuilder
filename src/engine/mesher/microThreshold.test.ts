import { describe, expect, it } from 'vitest';
import { PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { CARVE_DEPTH, CARVE_KIND } from './carveMarks';
import { planCarves } from './carvePlan';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import { appendThresholdDetail } from './microThreshold';
import {
  MAX_DETAIL_QUADS_PER_CHUNK,
  collectSurfaceCells,
  type FixedBox,
  type MicroGeometryWriter,
} from './microGeometry';

/**
 * L'attacco a terra.
 *
 * **Le due voci si verificano da dove si rompono.** La forma di un gradino non e'
 * un contratto — la si guarda a schermo — mentre «compare solo davanti a un
 * ingresso», «segue l'arretramento della soglia» e «non costa un prisma per
 * voxel» lo sono: la prima e' l'unico segnale di commercio che il mesher abbia,
 * la seconda e' la ragione per cui il modulo riceve la maschera degli scavi, e la
 * terza e' cio' che tiene il gruppo dentro il budget.
 */

const U = MESH_UNITS_PER_VOXEL;

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

type Drawn = FixedBox & { readonly palette: number; readonly surface: number };

/** I prismi del **solo** attacco a terra, con o senza la maschera degli scavi. */
function thresholdBoxes(padded: Uint8Array, carved = true): readonly Drawn[] {
  const marks = new Uint8Array(PADDED_VOL);
  const cells = collectSurfaceCells(padded);
  if (carved) planCarves(padded, marks, [0, 0, 0], cells);

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
  appendThresholdDetail(padded, writer, cells, marks);
  return boxes;
}

/**
 * Un fronte abitato con un ingresso largo `doorWidth` celle sulla faccia -Y.
 *
 * Il marciapiede a quota zero non e' arredamento: il gradino lo pretende, ed e'
 * la differenza fra una porta e una botola in quota.
 */
function shopFront(doorWidth: number, ground = true): Uint8Array {
  const padded = volume();
  const ox = 8;
  const oy = 8;
  if (ground) {
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        setLocal(padded, x, y, 0, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.plain));
      }
    }
  }
  for (let z = 1; z < 10; z++) {
    for (let y = oy; y < oy + 6; y++) {
      for (let x = ox; x < ox + 8; x++) {
        const doorway = z <= 3 && y === oy && x >= ox + 2 && x < ox + 2 + doorWidth;
        setLocal(padded, x, y, z, packVisualBlock(
          doorway ? PALETTE_SLOTS.stone : PALETTE_SLOTS.concrete,
          doorway ? SURFACE_KIND.portal : SURFACE_KIND.habitat,
        ));
      }
    }
  }
  return padded;
}

describe('l attacco a terra', () => {
  it('compare davanti a un ingresso, e non altrove', () => {
    const armed = thresholdBoxes(shopFront(2));
    expect(armed.length).toBeGreaterThan(0);

    // La stessa parete senza la porta: il fronte e' identico in tutto il resto,
    // quindi cio' che sparisce e' agganciato all'ingresso e a nient'altro.
    const bare = volume();
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        setLocal(bare, x, y, 0, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.plain));
      }
    }
    for (let z = 1; z < 10; z++) {
      for (let y = 8; y < 14; y++) {
        for (let x = 8; x < 16; x++) {
          setLocal(bare, x, y, z, packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.habitat));
        }
      }
    }
    expect(thresholdBoxes(bare).length).toBe(0);
  });

  it('il cassonetto esce luminoso e sta sopra la porta, non su tutto il piano terra', () => {
    // **La differenza fra un'insegna e una lanterna.** `frontage` risponde vero
    // per cinque celle in su, e agganciarcisi accenderebbe una fascia a ogni
    // quota del piano terra. L'aggancio e' la riga **subito sopra** il portale:
    // una sola, alla quota in cui un cassonetto insegna sta davvero.
    const lit = thresholdBoxes(shopFront(2))
      .filter((box) => box.surface === SURFACE_KIND.luminous);
    expect(lit.length).toBe(1);

    // Il portale arriva a `z = 3`, quindi la fascia sta nella cella a quota 4.
    for (const box of lit) {
      expect(box.min[2]).toBeGreaterThanOrEqual(4 * U);
      expect(box.max[2]).toBeLessThanOrEqual(5 * U);
    }
  });

  it('segue l arretramento della soglia invece di restare sul filo del muro', () => {
    // **La ragione per cui il modulo riceve `marks`.** La cella del portale e'
    // scavata da `threshold`, cioe' arretrata di tre sedicesimi: una lastra
    // tirata dal filo del muro resterebbe a mezz'aria davanti alla bocca del
    // vano. Si misura confrontando lo stesso fronte con e senza il piano degli
    // scavi, che e' l'unica differenza fra le due chiamate.
    const padded = shopFront(2);
    const stone = (boxes: readonly Drawn[]): Drawn =>
      boxes.filter((box) => box.palette === PALETTE_SLOTS.stone)[0];

    const flat = stone(thresholdBoxes(padded, false));
    const recessed = stone(thresholdBoxes(padded, true));
    expect(flat).toBeDefined();
    expect(recessed).toBeDefined();

    // La faccia -Y: arretrare vuol dire che il piano di riferimento si sposta
    // **dentro** l'edificio, cioe' verso y crescenti.
    expect(recessed.min[1] - flat.min[1]).toBe(CARVE_DEPTH[CARVE_KIND.threshold]);
  });

  it('costa per ingresso e non per cella di ingresso', () => {
    // Il gradino corre lungo la larghezza della bocca: una porta larga il triplo
    // costa lo stesso prisma. Se questo numero si muovesse, il gruppo sarebbe
    // tornato a costare per voxel, che e' il modello che `emitRuns` esiste per
    // evitare.
    const counts = new Set<number>();
    for (const width of [1, 2, 3, 4]) counts.add(thresholdBoxes(shopFront(width)).length);
    expect(counts.size).toBe(1);
  });

  it('senza marciapiede sotto non mette il gradino', () => {
    // Un ingresso con l'aria davanti **e sotto** e' una botola in quota: la'
    // una lastra resterebbe sospesa. Il cassonetto invece resta, perche' pende
    // dal muro e non poggia su niente.
    const boxes = thresholdBoxes(shopFront(2, false));
    expect(boxes.some((box) => box.palette === PALETTE_SLOTS.stone)).toBe(false);
    expect(boxes.some((box) => box.surface === SURFACE_KIND.luminous)).toBe(true);
  });

  it('e deterministico: non tira nessun dado', () => {
    // Il gruppo non semina niente sulle coordinate di mondo, ed e' una scelta:
    // una soglia e un'insegna stanno dove sta la porta, sempre. E' l'ingresso a
    // essere raro, non l'oggetto — e per questo sono struttura e non prop.
    const padded = shopFront(2);
    const first = thresholdBoxes(padded).map((box) => box.min.join());
    expect(thresholdBoxes(padded).map((box) => box.min.join())).toEqual(first);
  });
});
