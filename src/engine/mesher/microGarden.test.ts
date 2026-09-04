import { describe, expect, it } from 'vitest';
import { CHUNK, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { typologyById } from '../../world/buildings/config/typologies';
import { generateBuilding } from '../../world/buildings/generate';
import { typologyProfile } from '../../world/buildings/typology';
import { packVisualBlock, SURFACE_KIND, type SurfaceKind } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { CARVE_DEPTH, CARVE_KIND } from './carveMarks';
import { greedyMesh } from './greedyMesher';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import { appendGardenDetail } from './microGarden';
import {
  MAX_DETAIL_QUADS_PER_CHUNK,
  collectSurfaceCells,
  type FixedBox,
  type MicroGeometryWriter,
} from './microGeometry';

/**
 * Il verde di copertura.
 *
 * **La domanda che questo file esiste per fare e' la seconda.** Un giardino
 * pensile e' `plain` piu' uno slot d'erba, e `plain` piu' erba e' anche ogni
 * prateria dell'isola: se il predicato sbaglia, il difetto non e' un albero
 * storto ma un bosco di siepi su tutta la mappa, e nessun conto di prismi lo
 * segnala. Il resto sono le domande di sempre di un gruppo di dettaglio — dove
 * si aggancia, quanto costa, ed e' deterministico.
 */

const U = MESH_UNITS_PER_VOXEL;

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

/** Il piano di copertura della torre: e' li' che si semina. */
const ROOF_Z = CHUNK - 5;

/** Angolo e lato dell'impronta, per ricavare a mano dove cade il verde. */
const ORIGIN_XY = 4;
const SIDE = 12;

/**
 * Una torre con la copertura piantata: anello pavimentato e cuore verde.
 *
 * E' la forma che `paint.ts` produce davvero — il verde rientra sempre di un
 * voxel dal filo, perche' sul filo ci va il parapetto — e riprodurla qui e' cio'
 * che rende sensato il test sulle chiome: senza l'anello, ogni cella di giardino
 * sarebbe di bordo e non ci sarebbe un interno in cui verificarle.
 */
function plantedTower(): Uint8Array {
  const padded = volume();
  for (let z = 0; z <= ROOF_Z; z++) {
    for (let y = ORIGIN_XY; y < ORIGIN_XY + SIDE; y++) {
      for (let x = ORIGIN_XY; x < ORIGIN_XY + SIDE; x++) {
        if (z < ROOF_Z) {
          setLocal(padded, x, y, z, packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.habitat));
          continue;
        }
        const onEdge = x === ORIGIN_XY || y === ORIGIN_XY ||
          x === ORIGIN_XY + SIDE - 1 || y === ORIGIN_XY + SIDE - 1;
        setLocal(padded, x, y, z, onEdge
          ? packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.roofTech)
          : packVisualBlock(PALETTE_SLOTS.grass, SURFACE_KIND.plain));
      }
    }
  }
  return padded;
}

/**
 * Un edificio **vero**, disegnato dalla tipologia che dichiara il giardino.
 *
 * **E' la sola prova che il gruppo serva a qualcosa nella citta' vera.** Le
 * fixture sintetiche dicono che gli emettitori funzionano; questa dice che cio'
 * che `paint.ts` produce e' ancora riconoscibile a valle. La cucitura fra i due
 * e' implicita — nessun tipo la dichiara — e si romperebbe in silenzio il giorno
 * in cui la sommita' piantata cambiasse superficie.
 */
function gardenBuilding(seed: number): Uint8Array {
  const definition = typologyById('gardenHousing');
  expect(definition, 'la tipologia con il giardino non e piu nel catalogo').not.toBeNull();
  const stamp = generateBuilding({
    class: definition!.use,
    level: 4,
    seed,
    shape: definition!.shape,
    profile: typologyProfile(definition!),
    // L'impronta larga non e' comodita': sotto i dieci voxel il cuore
    // dell'aiuola non esiste — anello pavimentato, bordo del verde, e niente in
    // mezzo — e la prova sugli alberi non avrebbe dove agganciarsi.
    footprintFloor: 10,
    footprintCap: 12,
  });
  expect(stamp.sizeZ, 'lo stamp non ci sta nel chunk e la copertura verrebbe tagliata')
    .toBeLessThanOrEqual(CHUNK);
  const padded = volume();
  for (let z = 0; z < stamp.sizeZ && z < CHUNK; z++) {
    for (let y = 0; y < stamp.sizeY && y < CHUNK; y++) {
      for (let x = 0; x < stamp.sizeX && x < CHUNK; x++) {
        const index = x + stamp.sizeX * (y + stamp.sizeY * z);
        const palette = stamp.voxels[index];
        if (palette === 0) continue;
        setLocal(padded, x + 2, y + 2, z, packVisualBlock(
          palette,
          stamp.surfaces[index] as SurfaceKind,
        ));
      }
    }
  }
  return padded;
}

/**
 * Una torre con la copertura **tutta pavimentata**: nessun verde, solo terrazza.
 *
 * Serve alla vasca e non al giardino: una piscina sta sul pavimento, e sul filo
 * dell'impronta non ci sta mai — li' passa il parapetto. Su `plantedTower` la
 * terrazza e' l'anello largo un voxel, cioe' tutto filo: e' il caso che una
 * vasca deve rifiutare, e da solo non proverebbe che sappia anche accettarne uno.
 */
function pavedTower(): Uint8Array {
  const padded = volume();
  for (let z = 0; z <= ROOF_Z; z++) {
    for (let y = ORIGIN_XY; y < ORIGIN_XY + SIDE; y++) {
      for (let x = ORIGIN_XY; x < ORIGIN_XY + SIDE; x++) {
        setLocal(padded, x, y, z, z < ROOF_Z
          ? packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.habitat)
          : packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.roofTech));
      }
    }
  }
  return padded;
}

/** Un pianoro d'erba: erba su terra, tutto `plain`. E' il caso da non piantare. */
function meadow(): Uint8Array {
  const padded = volume();
  for (let z = 0; z < 8; z++) {
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        setLocal(padded, x, y, z, packVisualBlock(
          z === 7 ? PALETTE_SLOTS.grass : PALETTE_SLOTS.stoneDark,
          SURFACE_KIND.plain,
        ));
      }
    }
  }
  return padded;
}

/**
 * I prismi del **solo** gruppo del verde.
 *
 * Come per il retro: passare da `greedyMesh` misurerebbe tutto il dettaglio del
 * chunk, e qui il parapetto dell'anello da solo vale piu' del giardino.
 */
function gardenBoxes(
  padded: Uint8Array,
  origin: readonly [number, number, number],
): readonly (FixedBox & { readonly palette: number })[] {
  const marks = new Uint8Array(PADDED_VOL);
  const cells = collectSurfaceCells(padded);
  const boxes: (FixedBox & { palette: number })[] = [];
  const writer: MicroGeometryWriter = {
    get remainingQuads() {
      return MAX_DETAIL_QUADS_PER_CHUNK;
    },
    emitBox: (box, palette) => {
      boxes.push({ ...box, palette });
      return true;
    },
  };
  appendGardenDetail(
    padded,
    writer,
    cells.gardens,
    cells.bySurface[SURFACE_KIND.roofTech],
    origin,
    marks,
  );
  return boxes;
}

describe('il verde di copertura', () => {
  it('raccoglie le celle piantate, che nessuna superficie dichiara', () => {
    // La lista non nasce da un linguaggio di superficie: e' il ramo che scarta
    // il `plain` a metterla da parte. Se sparisce, ogni test qui sotto passa
    // guardando un giardino vuoto.
    const cells = collectSurfaceCells(plantedTower());
    expect(cells.gardens.length).toBe((SIDE - 2) * (SIDE - 2));
  });

  it('compare, e non e a costo zero', () => {
    expect(gardenBoxes(plantedTower(), [0, 0, 0]).length).toBeGreaterThan(0);
  });

  it('non pianta niente su una prateria', () => {
    // **La regola del modulo.** Erba e `plain` descrivono tanto un giardino
    // pensile quanto ogni prato dell'isola: a distinguerli e' il costruito
    // sotto. Senza quella riga questo caso emette siepi su tutta la mappa, e il
    // conto dei prismi di una torre resterebbe identico.
    expect(collectSurfaceCells(meadow()).gardens).toHaveLength(0);
    expect(gardenBoxes(meadow(), [0, 0, 0])).toHaveLength(0);
    expect(greedyMesh(meadow()).detailQuadCount).toBe(0);
  });

  it('sta sopra il calpestio del tetto, non dentro il voxel', () => {
    // La trappola condivisa da ogni prop di copertura: `isRoofGarden` risponde
    // sul voxel **solido**, quindi un prisma steso da `z * U` finisce sepolto e
    // costa i suoi quad senza rendere un pixel.
    const floor = (ROOF_Z + 1) * U - CARVE_DEPTH[CARVE_KIND.tray];
    const boxes = gardenBoxes(plantedTower(), [0, 0, 0]);
    expect(Math.min(...boxes.map((box) => box.min[2]))).toBeGreaterThanOrEqual(floor);
  });

  it('gli alberi stanno sul verde, mai sul filo del vuoto', () => {
    // La chioma vive dentro la propria cella, quindi non le serve verde attorno:
    // le serve del **pieno**, o starebbe sul filo dove passa il parapetto. Il
    // verde va da `ORIGIN_XY + 1` a `ORIGIN_XY + SIDE - 2`, e li' dentro deve
    // restare — sull'anello pavimentato non cresce un albero.
    const first = ORIGIN_XY + 1;
    const last = ORIGIN_XY + SIDE - 2;
    const canopies = gardenBoxes(plantedTower(), [0, 0, 0])
      .filter((box) => box.palette === PALETTE_SLOTS.grassLight);

    expect(canopies.length, 'nessuna chioma emessa').toBeGreaterThan(0);
    for (const box of canopies) {
      expect(box.min[0]).toBeGreaterThanOrEqual(first * U);
      expect(box.min[1]).toBeGreaterThanOrEqual(first * U);
      expect(box.max[0]).toBeLessThanOrEqual((last + 1) * U);
      expect(box.max[1]).toBeLessThanOrEqual((last + 1) * U);
    }
  });

  it('la fioriera e una corsa, non un prisma per cella', () => {
    // E' la voce che apre il gruppo proprio perche' fonde: se smettesse di
    // fondere costerebbe quanto il perimetro del verde, che su un isolato fitto
    // e' il conto piu' grosso del modulo.
    const kerbs = gardenBoxes(plantedTower(), [0, 0, 0])
      .filter((box) => box.palette === PALETTE_SLOTS.grassDark);

    expect(kerbs.length).toBeGreaterThan(0);
    expect(Math.max(...kerbs.map((box) => box.max[0] - box.min[0]))).toBeGreaterThan(U);
  });

  it('costa meno di un prisma per cella piantata', () => {
    const planted = collectSurfaceCells(plantedTower()).gardens.length;
    expect(gardenBoxes(plantedTower(), [0, 0, 0]).length).toBeLessThan(planted);
  });

  it('e deterministico', () => {
    expect(gardenBoxes(plantedTower(), [0, 0, 0]).length)
      .toBe(gardenBoxes(plantedTower(), [0, 0, 0]).length);
  });

  it('segue le coordinate di mondo, non quelle locali', () => {
    // Stessa torre, origine diversa: alberi e cespugli cadono su altre celle. Se
    // il conto non cambiasse, due chunk adiacenti pianterebbero lo stesso albero
    // ai due lati della cucitura.
    const here = gardenBoxes(plantedTower(), [0, 0, 0]).length;
    const far = gardenBoxes(plantedTower(), [512, -256, 0]).length;
    expect(far).toBeGreaterThan(here / 4);
    expect(far).toBeLessThan(here * 4);
  });

  it('resta dentro il tetto dei quad', () => {
    expect(greedyMesh(plantedTower()).detailQuadCount).toBeLessThan(MAX_DETAIL_QUADS_PER_CHUNK);
  });

  it('riconosce il giardino che il generatore disegna davvero', () => {
    // La cucitura fra `paint.ts` e questo modulo non e' dichiarata da nessun
    // tipo: il verde e' `plain`, e a distinguerlo dal terreno e' la fascia
    // dell'edificio sotto. Se quella sommita' cambiasse superficie, ogni test
    // qui sopra resterebbe verde e in citta' non ci sarebbe piu' un albero.
    const padded = gardenBuilding(0x5eed_1234);
    const planted = collectSurfaceCells(padded).gardens.length;
    const boxes = gardenBoxes(padded, [0, 0, 0]).length;
    expect(planted).toBeGreaterThan(0);
    expect(boxes).toBeGreaterThan(0);
    console.info(
      `[misura] edificio con giardino: ${planted} celle piantate, ${boxes} prismi di verde, ` +
      `${greedyMesh(padded).detailQuadCount} quad di dettaglio in tutto`,
    );
  });

  it('la vasca sta sul pavimento riparato, non sul filo del parapetto', () => {
    // Due domande in una. Che compaia: su una terrazza larga, scorrendo le
    // origini perche' a 0,02 una singola non basta a dire niente. E che **non**
    // compaia dove la terrazza e' l'anello largo un voxel di `plantedTower`:
    // li' ogni cella confina con il vuoto, e una vasca sul filo sarebbe una
    // piscina appesa fuori dal parapetto.
    let onPaved = 0;
    for (let step = 0; step < 12; step++) {
      onPaved += gardenBoxes(pavedTower(), [step * 64, 0, 0])
        .filter((box) => box.palette === PALETTE_SLOTS.water).length;
    }
    expect(onPaved, 'nessuna vasca su dodici terrazze larghe').toBeGreaterThan(0);

    for (let step = 0; step < 12; step++) {
      expect(gardenBoxes(plantedTower(), [step * 64, 0, 0])
        .filter((box) => box.palette === PALETTE_SLOTS.water)).toHaveLength(0);
    }
  });

  it('su edifici veri gli alberi compaiono davvero', () => {
    // **La misura che ha corretto l'aggancio, e per questo resta.** Chiedendo il
    // verde su tutti e quattro i lati — la regola di `interiorRoof` — questo
    // conto era **zero** su ogni seme: il giardino di un edificio vero e' quasi
    // sempre l'anello di una rientranza, largo uno o due voxel, e un anello non
    // ha un interno. Un gruppo che sulle fixture sintetiche pianta alberi e in
    // citta' nessuno passa ogni altro test di questo file.
    let canopies = 0;
    let planted = 0;
    for (let seed = 0; seed < 24; seed++) {
      const padded = gardenBuilding(0x5eed_0000 + seed);
      planted += collectSurfaceCells(padded).gardens.length;
      canopies += gardenBoxes(padded, [seed * 32, 0, 0])
        .filter((box) => box.palette === PALETTE_SLOTS.grassLight).length;
    }
    console.info(`[misura] ventiquattro edifici: ${planted} celle piantate, ${canopies} chiome`);
    expect(canopies).toBeGreaterThan(0);
  });
});
