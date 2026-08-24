import { CHUNK, FACE_NZ, FACE_PZ } from '../../world/chunkCoords';
import { blockPalette, blockSurface, SURFACE_KIND, type SurfaceKind } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import {
  CARVE_DEPTH,
  CARVE_KIND,
  carveIndex,
  packCarveMark,
  type CarveKind,
} from './carveMarks';
import { carveMarkFor, carveRunAxis, type CarvePlan } from './carvePlan';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import {
  blockAt,
  emitRuns,
  facadeBox,
  facadeHorizontalAxis,
  LATERAL_FACES,
  type MicroGeometryWriter,
  type RunSpec,
} from './microGeometry';

/**
 * La microgeometria **riduttiva**: i vani scavati dentro il voxel.
 *
 * Tutto il resto della microgeometria aggiunge volume — `facadeBox` mette il
 * prisma fuori dal piano, i prop di tetto partono da `(z + 1) * U` — e quello
 * che manca a un edificio fatto solo di sporgenze e' l'ombra che fa un
 * **rientro**. Una soglia, una vetrata a filo interno, una loggia sotto uno
 * sbalzo, una nicchia: si leggono per cio' che non c'e', e con le sole
 * sporgenze non si possono dire.
 *
 * **Qui non si decide niente.** *Dove* scavare lo ha gia' deciso `carvePlan.ts`
 * prima del greedy pass, e lo ha scritto nella maschera; questo modulo la
 * rilegge e disegna. Non e' pignoleria: la faccia base di una cella scavata e'
 * gia' stata soppressa dal mask loop, quindi se le due meta' rispondessero anche
 * una sola volta in modo diverso il risultato non sarebbe un dettaglio storto ma
 * un muro **bucato**. Rileggere invece di rivalutare toglie la possibilita'.
 *
 * **Un vano e' tre pezzi, e nessuno dei tre e' una primitiva nuova.**
 *
 * - le **spalle** sono un `emitBox` con `inward`: le stesse sei facce con l'id
 *   opposto e il winding invertito, che smettono di descrivere un pieno e
 *   descrivono un vuoto. Bocca e fondo si nascondono;
 * - il **fondo** e' un box a spessore nullo con cinque facce su sei nascoste,
 *   cioe' un pannello. `writeDetailBox` gira gia' su sei facce e ne salta
 *   cinque, il conto dei quad viene giusto da solo e l'AABB non si allarga.
 *   Sta separato dalle spalle per una ragione sola: puo' essere piu' scuro;
 * - il **telaio** e' lo stesso pannello, sul filo della parete, e serve alla
 *   sola nicchia — l'unica ricetta piu' stretta della cella, quindi l'unica che
 *   lasci scoperto un anello di muro attorno alla bocca.
 *
 * **L'AO e' meta' del disegno.** `writeDetailBox` da' a ogni prisma il corner
 * del tutto libero, che dentro un incavo significa «niente mi occlude»: una
 * nicchia cosi' legge come un adesivo, non come un buco. Le spalle scendono a 2
 * e il fondo a 1, ed e' quella differenza — non la profondita', che a 1/16 e'
 * minuscola — a far leggere il vano da lontano.
 */

const U = MESH_UNITS_PER_VOXEL;

/** Tutte e sei le facce di un prisma. */
const ALL_FACES = 0b11_1111;

const faceBit = (face: number): number => 1 << face;

/**
 * Le due maschere che riducono un box degenere a un pannello.
 *
 * `hiddenFace` di `RunSpec` porta un bit solo, e qui ne servono cinque:
 * `alsoHidden` porta gli altri quattro. Il testo `hiddenFace: face ^ 1` non e'
 * arbitrario — su un pannello il retro e' nascosto come tutto il resto, e quel
 * bit e' semplicemente uno dei cinque.
 */
function panelFaces(face: number): { hiddenFace: number; alsoHidden: number } {
  return {
    hiddenFace: face ^ 1,
    alsoHidden: ALL_FACES & ~faceBit(face) & ~faceBit(face ^ 1),
  };
}

/** Spalle e fondo di ogni ricetta. Il fondo porta anche il linguaggio. */
interface CarveMaterial {
  readonly side: number;
  readonly back: number;
  readonly backSurface: SurfaceKind;
}

/**
 * Un vano rivestito e' un vano, uno scavato nella stessa materia e' un difetto
 * di stampa.
 *
 * Il fondo di una soglia esce `portal` e quello di una vetrata `luminous`: sono
 * i due linguaggi che il fragment gia' accende, quindi l'ingresso e la finestra
 * si illuminano di notte **dal fondo del vano** invece che dal filo del muro, ed
 * e' esattamente la differenza fra una luce accesa dentro e un adesivo luminoso
 * sopra. Nessun linguaggio nuovo e nessuno slot nuovo: gli invarianti 4 e 5
 * reggono.
 */
const CARVE_MATERIAL: readonly CarveMaterial[] = [
  { side: 0, back: 0, backSurface: SURFACE_KIND.plain },
  { side: PALETTE_SLOTS.stoneDark, back: PALETTE_SLOTS.metalBrass, backSurface: SURFACE_KIND.portal },
  { side: PALETTE_SLOTS.concreteLight, back: PALETTE_SLOTS.glassPale, backSurface: SURFACE_KIND.luminous },
  { side: PALETTE_SLOTS.concreteLight, back: PALETTE_SLOTS.concrete, backSurface: SURFACE_KIND.plain },
  { side: PALETTE_SLOTS.concreteLight, back: PALETTE_SLOTS.concrete, backSurface: SURFACE_KIND.plain },
  { side: PALETTE_SLOTS.metalDark, back: PALETTE_SLOTS.concrete, backSurface: SURFACE_KIND.plain },
  { side: PALETTE_SLOTS.stoneWarm, back: PALETTE_SLOTS.stoneWarm, backSurface: SURFACE_KIND.utility },
];

/** AO delle spalle e AO del fondo. Vedi la nota in testa al modulo. */
const SIDE_AO = 2;
const BACK_AO = 1;

/** Le ricette che scavano una faccia laterale per intero, in ordine stabile. */
const WALL_KINDS: readonly CarveKind[] = [
  CARVE_KIND.threshold,
  CARVE_KIND.glazing,
  CARVE_KIND.loggia,
  CARVE_KIND.stairwell,
];

/**
 * Il predicato di ogni corsa: rileggere la maschera, non rivalutare l'aggancio.
 *
 * Sull'anello di padding la maschera non c'e' — quelle celle appartengono al
 * chunk accanto — e li' si chiede a `carveMarkFor` cosa avrebbero ricevuto.
 * Senza, ogni cucitura mostrerebbe la testata del vano come un setto verticale:
 * la corsa di qua si chiuderebbe credendo di finire, e quella di la' pure.
 */
function carvedAs(
  padded: Uint8Array,
  marks: Uint8Array,
  origin: CarvePlan['origin'],
  mark: number,
  x: number,
  y: number,
  z: number,
): boolean {
  return x >= 0 && x < CHUNK && y >= 0 && y < CHUNK && z >= 0 && z < CHUNK
    ? marks[carveIndex(x, y, z)] === mark
    : carveMarkFor(padded, origin, x, y, z) === mark;
}

/**
 * Il vano di una ricetta di parete: **il perimetro della regione, non le celle.**
 *
 * E' la scelta che decide il costo dell'intero modulo, e la prima versione la
 * sbagliava. Emettere un vano per cella e' facile — un prisma rovesciato, bocca
 * e fondo nascosti — ma due celle scavate accanto producono due spalle
 * coincidenti in mezzo al vano: geometria doppia che non si vede, e un rilievo
 * ogni voxel dentro quella che dovrebbe essere una superficie continua.
 *
 * Un vano ha invece cinque superfici, e nessuna dipende da quante celle copre:
 * il **fondo**, il **davanzale** in basso, l'**architrave** in alto e i due
 * **stipiti** ai lati. Ognuna e' una corsa con il suo aggancio — «scavata, e il
 * vicino da quella parte no» — quindi una fascia luminosa alta ventisei celle e
 * larga quattro costa cinque quad in tutto invece di centotrenta, ed e' la
 * ragione per cui questa geometria sta dentro la sua riserva.
 *
 * Sono tutti box a spessore nullo, cioe' pannelli: nessuno di loro ha bisogno di
 * `inward`, perche' la faccia da mostrare si dichiara e basta.
 */
function emitWallCarves(
  padded: Uint8Array,
  marks: Uint8Array,
  writer: MicroGeometryWriter,
  carves: CarvePlan,
  kind: CarveKind,
): boolean {
  const recess = CARVE_DEPTH[kind];
  const material = CARVE_MATERIAL[kind];

  for (const face of LATERAL_FACES) {
    const mark = packCarveMark(kind, face);
    const hAxis = facadeHorizontalAxis(face);
    const has = (x: number, y: number, z: number): boolean =>
      carvedAs(padded, marks, carves.origin, mark, x, y, z);
    /** «Scavata qui, e non scavata di la'»: e' il bordo della regione. */
    const edge = (dx: number, dy: number, dz: number) =>
      (x: number, y: number, z: number): boolean =>
        has(x, y, z) && !has(x + dx, y + dy, z + dz);

    // Il fondo corre sull'asse che la ricetta dichiara — orizzontale per le
    // fasce, verticale per un vano scala — perche' e' l'unica delle cinque
    // superfici il cui costo cresce con l'area invece che con il perimetro.
    const runAxis = carveRunAxis(kind, face);
    const back: RunSpec = {
      ...panelFaces(face),
      runAxis,
      palette: material.back,
      surface: material.backSurface,
      ao: BACK_AO,
      has,
      box: (x, y, z, length) => facadeBox(
        x,
        y,
        z,
        face,
        0,
        runAxis === 2 ? U : length * U,
        0,
        runAxis === 2 ? length * U : U,
        0,
        recess,
      ),
    };
    if (!emitRuns(writer, carves.cells, back)) return false;

    // Davanzale e architrave: i due bordi orizzontali, degeneri in z.
    for (const below of [true, false]) {
      const strip: RunSpec = {
        ...panelFaces(below ? FACE_PZ : FACE_NZ),
        runAxis: hAxis,
        palette: material.side,
        surface: SURFACE_KIND.utility,
        ao: SIDE_AO,
        has: edge(0, 0, below ? -1 : 1),
        box: (x, y, z, length) => {
          const v = below ? 0 : U;
          return facadeBox(x, y, z, face, 0, length * U, v, v, recess, recess);
        },
      };
      if (!emitRuns(writer, carves.cells, strip)) return false;
    }

    // Stipiti: i due bordi verticali, degeneri sull'asse orizzontale.
    for (const side of [-1, 1] as const) {
      const strip: RunSpec = {
        ...panelFaces(hAxis * 2 + (side < 0 ? 0 : 1)),
        runAxis: 2,
        palette: material.side,
        surface: SURFACE_KIND.utility,
        ao: SIDE_AO,
        has: edge(hAxis === 0 ? side : 0, hAxis === 1 ? side : 0, 0),
        box: (x, y, z, length) => {
          const h = side < 0 ? 0 : U;
          return facadeBox(x, y, z, face, h, h, 0, length * U, recess, recess);
        },
      };
      if (!emitRuns(writer, carves.cells, strip)) return false;
    }
  }
  return true;
}

/**
 * Il vassoio della terrazza: il calpestio scende, il parapetto resta.
 *
 * E' la stessa struttura a perimetro delle ricette di parete, girata di novanta
 * gradi: un piano di calpestio che corre, e quattro pareti sui bordi della
 * depressione. Il parapetto di `emitRoofTech` non si muove — parte da
 * `(z + 1) * U`, cioe' dal filo originale del tetto — quindi da dentro passa da
 * tre sedicesimi a cinque, ed e' la sola cosa che si vede: da fuori la terrazza
 * e' identica a prima.
 */
function emitTrayCarves(
  padded: Uint8Array,
  marks: Uint8Array,
  writer: MicroGeometryWriter,
  carves: CarvePlan,
): boolean {
  const recess = CARVE_DEPTH[CARVE_KIND.tray];
  const material = CARVE_MATERIAL[CARVE_KIND.tray];
  const mark = packCarveMark(CARVE_KIND.tray, FACE_PZ);
  const has = (x: number, y: number, z: number): boolean =>
    carvedAs(padded, marks, carves.origin, mark, x, y, z);

  /** Quota del calpestio abbassato: da qui risalgono le quattro pareti. */
  const floorZ = (z: number): number => (z + 1) * U - recess;

  const floor: RunSpec = {
    ...panelFaces(FACE_PZ),
    runAxis: 0,
    palette: material.back,
    surface: material.backSurface,
    ao: BACK_AO,
    has,
    box: (x, y, z, length) => ({
      min: [x * U, y * U, floorZ(z)],
      max: [(x + length) * U, (y + 1) * U, floorZ(z)],
    }),
  };
  if (!emitRuns(writer, carves.cells, floor)) return false;

  for (const axis of [0, 1] as const) {
    for (const side of [-1, 1] as const) {
      const runAxis = axis === 0 ? 1 : 0;
      const dx = axis === 0 ? side : 0;
      const dy = axis === 1 ? side : 0;
      const wall: RunSpec = {
        ...panelFaces(axis * 2 + (side < 0 ? 0 : 1)),
        runAxis,
        palette: material.side,
        surface: SURFACE_KIND.utility,
        ao: SIDE_AO,
        has: (x, y, z) => has(x, y, z) && !has(x + dx, y + dy, z),
        box: (x, y, z, length) => {
          const base = axis === 0 ? x : y;
          const plane = (side < 0 ? base : base + 1) * U;
          const min: [number, number, number] = [x * U, y * U, floorZ(z)];
          const max: [number, number, number] = [(x + 1) * U, (y + 1) * U, (z + 1) * U];
          min[axis] = plane;
          max[axis] = plane;
          max[runAxis] = (runAxis === 0 ? x : y) * U + length * U;
          return { min, max };
        },
      };
      if (!emitRuns(writer, carves.cells, wall)) return false;
    }
  }
  return true;
}

/** Impronta della bocca di una nicchia, in sedicesimi dentro la cella. */
const ALCOVE_H0 = 4;
const ALCOVE_H1 = 12;
const ALCOVE_V0 = 3;
const ALCOVE_V1 = 13;

/**
 * La nicchia, e il suo telaio.
 *
 * **E' l'unica ricetta piu' stretta della cella, e paga per esserlo.** Il mask
 * loop sopprime la faccia **intera**, quindi l'anello di muro attorno alla bocca
 * va ridisegnato: quattro pannelli, che portano la palette e il linguaggio del
 * voxel che li regge e non un materiale di rivestimento, o la giunzione con la
 * parete si vedrebbe. Nove quad in tutto contro i cinque di un vano a cella
 * piena, ed e' anche il motivo per cui il suo tiro sta a 0,02: scavare una cella
 * isolata **spezza la corsa del merge greedy**, e una parete che il greedy
 * fondeva in un quad ne costa tre o quattro.
 *
 * L'AO del telaio resta quella libera e non quella per corner del quad che
 * sostituisce: e' esatta in mezzo a una parete, che e' dove le nicchie stanno, e
 * a ridosso di uno spigolo perde la riga d'ombra che la faccia intera aveva.
 * Costerebbe far uscire `cornerAO` dal greedy pass per un caso che si vede da
 * due voxel di distanza.
 */
function emitAlcoves(
  padded: Uint8Array,
  marks: Uint8Array,
  writer: MicroGeometryWriter,
  carves: CarvePlan,
): boolean {
  const recess = CARVE_DEPTH[CARVE_KIND.alcove];
  const material = CARVE_MATERIAL[CARVE_KIND.alcove];
  const ring: readonly (readonly [number, number, number, number])[] = [
    [0, U, 0, ALCOVE_V0],
    [0, U, ALCOVE_V1, U],
    [0, ALCOVE_H0, ALCOVE_V0, ALCOVE_V1],
    [ALCOVE_H1, U, ALCOVE_V0, ALCOVE_V1],
  ];

  for (const cell of carves.cells) {
    const x = cell & 31;
    const y = (cell >>> 5) & 31;
    const z = cell >>> 10;
    const mark = marks[carveIndex(x, y, z)];
    if (mark >>> 3 !== CARVE_KIND.alcove) continue;
    const face = mark & 7;

    const shell = facadeBox(x, y, z, face, ALCOVE_H0, ALCOVE_H1, ALCOVE_V0, ALCOVE_V1, recess, recess);
    if (!writer.emitBox(
      shell,
      material.side,
      faceBit(face) | faceBit(face ^ 1),
      SURFACE_KIND.utility,
      { inward: true, ao: SIDE_AO },
    )) {
      return false;
    }

    const back = facadeBox(x, y, z, face, ALCOVE_H0, ALCOVE_H1, ALCOVE_V0, ALCOVE_V1, 0, recess);
    if (!writer.emitBox(
      back,
      material.back,
      ALL_FACES & ~faceBit(face),
      material.backSurface,
      { ao: BACK_AO },
    )) {
      return false;
    }

    const block = blockAt(padded, x, y, z);
    const wallPalette = blockPalette(block);
    const wallSurface = blockSurface(block) as SurfaceKind;
    for (const [h0, h1, v0, v1] of ring) {
      if (!writer.emitBox(
        facadeBox(x, y, z, face, h0, h1, v0, v1, 0, 0),
        wallPalette,
        ALL_FACES & ~faceBit(face),
        wallSurface,
      )) {
        return false;
      }
    }
  }
  return true;
}

/** Spessore del ballatoio, e di quanto resta indietro dal filo della bocca. */
const MEZZANINE_THICKNESS = 2;
const MEZZANINE_CLEARANCE = 1;

/**
 * Il mezzanino: l'unica voce **additiva** di un modulo riduttivo.
 *
 * Sta qui e non fra i prop perche' il suo aggancio e' il vano: una lastra
 * appesa a una parete piatta e' una mensola, la stessa lastra dentro una loggia
 * alta due celle e' un ballatoio. Compare una volta per vano e non una per
 * piano — vuole la loggia sopra, la loggia sotto e **non** la loggia due sotto,
 * cioe' il secondo livello di un rientro — e corre lungo la loggia, quindi una
 * fascia intera costa un prisma e non uno per cella.
 */
function emitMezzanines(
  padded: Uint8Array,
  marks: Uint8Array,
  writer: MicroGeometryWriter,
  carves: CarvePlan,
): boolean {
  const recess = CARVE_DEPTH[CARVE_KIND.loggia];

  for (const face of LATERAL_FACES) {
    const mark = packCarveMark(CARVE_KIND.loggia, face);
    const loggia = (x: number, y: number, z: number): boolean =>
      carvedAs(padded, marks, carves.origin, mark, x, y, z);

    const ok = emitRuns(writer, carves.cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.concreteLight,
      // Il retro della lastra sta contro il fondo del vano: la' non si vede.
      hiddenFace: face ^ 1,
      has: (x, y, z) => loggia(x, y, z) && loggia(x, y, z - 1) && !loggia(x, y, z - 2),
      box: (x, y, z, length) => facadeBox(
        x,
        y,
        z,
        face,
        0,
        length * U,
        0,
        MEZZANINE_THICKNESS,
        recess - MEZZANINE_CLEARANCE,
        recess,
      ),
    });
    if (!ok) return false;
  }
  return true;
}

/**
 * Scrive tutti i vani pianificati. Restituisce i quad emessi.
 *
 * **Non ha una scala di priorita' al proprio interno**, e la differenza con
 * `appendMicroGeometry` e' sostanziale: la' l'ordine decide chi cade per primo
 * sotto il tetto dei quad, qui non puo' cadere nessuno. `planCarves` si e' gia'
 * limitato a `MAX_CARVE_QUADS_PER_CHUNK` e questa funzione scrive per prima fra
 * i dettagli, quindi la riserva c'e' tutta. L'ordine e' solo quello in cui le
 * ricette si leggono meglio.
 */
export function appendCarveDetail(
  padded: Uint8Array,
  marks: Uint8Array,
  writer: MicroGeometryWriter,
  carves: CarvePlan,
): number {
  const initial = writer.remainingQuads;
  if (carves.cells.length === 0) return 0;

  for (const kind of WALL_KINDS) {
    if (!emitWallCarves(padded, marks, writer, carves, kind)) return initial - writer.remainingQuads;
  }
  if (!emitTrayCarves(padded, marks, writer, carves)) return initial - writer.remainingQuads;
  if (!emitAlcoves(padded, marks, writer, carves)) return initial - writer.remainingQuads;
  emitMezzanines(padded, marks, writer, carves);
  return initial - writer.remainingQuads;
}
