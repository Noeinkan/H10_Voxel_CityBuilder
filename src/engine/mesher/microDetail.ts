import {
  FACE_NEIGHBOUR_OFFSETS,
  FACE_NZ,
  FACE_PX,
  FACE_PY,
} from '../../world/chunkCoords';
import { SURFACE_KIND } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { roofInset } from './carveMarks';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import {
  LATERAL_FACES,
  blockAt,
  emitPoints,
  emitRuns,
  facadeAt,
  facadeBox,
  facadeHorizontalAxis,
  frontage,
  hasSurfaceFace,
  interiorRoof,
  openRoof,
  propRoll,
  type ChunkOrigin,
  type FixedBox,
  type MicroGeometryWriter,
  type SurfaceCells,
} from './microGeometry';

/**
 * Il vocabolario di dettaglio degli edifici maturi: balconi, davanzali, lesene,
 * pinne, passerelle, impianti di tetto.
 *
 * **E' un modulo suo per la stessa regola di `microStreet.ts`** — una
 * responsabilita' nuova, un file nuovo — ma con un'aggancio diverso: quello
 * veste il **retro**, questo veste cio' che la crescita ha aggiunto alla
 * facciata e al tetto. Gli emettitori qui non conoscono il livello di un
 * edificio e non devono: reagiscono alla geometria e alla superficie che le
 * soglie visuali fanno comparire — una terrazza diventa `roofTech` solo alla
 * soglia di torre, e da li' in poi questi dettagli ci si agganciano da soli.
 *
 * **Tutto esce da geometria, superficie e hash di mondo**, come per il resto
 * del modulo: nessun metadato per edificio, nessun attributo nuovo, e i tiri
 * sono per colonna o per cella con un sale proprio, quindi due meta' di una
 * corsa a cavallo di un confine di chunk scelgono la stessa cosa.
 *
 * **Vengono dopo i prop storici e prima del retro** nella sequenza di
 * `appendMicroGeometry`: sotto pressione di budget cadono prima dei tubi e
 * delle scale, che valgono di piu' — un edificio senza balconi resta leggibile,
 * uno con le calate a meta' no. Dentro il modulo l'ordine e' quello del costo:
 * prima le corse che fondono, poi i punti.
 */

const U = MESH_UNITS_PER_VOXEL;

// Sali: ogni domanda la sua moneta. Vedi `propRoll`.
const BALCONY_SALT = 0x41a2_7c55;
const PIPE_SALT = 0x6b31_dd84;
const CLUSTER_SALT = 0x19c4_6a0f;
const FIN_SALT = 0x74e5_3b12;
const TANK_SALT = 0x2f56_9ca3;
const HVAC_SALT = 0x8d70_14f2;

/** Colonne di facciata su cui compare un balcone, dove l'aggancio c'e'. */
const BALCONY_CHANCE = 0.35;

/** Spigoli di parete industriale che portano un terminale di condotta. */
const PIPE_CHANCE = 0.3;

/** Retro industriali che portano un gruppo tecnico: pesca su tutta la parete. */
const CLUSTER_CHANCE = 0.015;

/** Colonne di facciata civica che portano una pinna verticale. */
const FIN_CHANCE = 0.15;

/** Tetti interni che portano una vasca o un gruppo HVAC. */
const TANK_CHANCE = 0.05;
const HVAC_CHANCE = 0.04;

/**
 * L'asse normale e il piano di una facciata, per i box che `facadeBox` non sa
 * esprimere: il corrimano di un balcone sta sul **filo esterno** della lastra,
 * non contro la parete.
 */
function planeOf(x: number, y: number, face: number): { axis: 0 | 1; plane: number } {
  const axis: 0 | 1 = face < 2 ? 0 : 1;
  const positive = face === FACE_PX || face === FACE_PY;
  const plane = ((axis === 0 ? x : y) + (positive ? 1 : 0)) * U;
  return { axis, plane };
}

/**
 * Balconi poco profondi sopra le terrazze attrezzate, con il corrimano.
 *
 * **L'aggancio e' l'anello scoperto** che la grammatica produce quando una
 * fascia rientra: la parete sopra la terrazza e' arretrata, quindi la prima
 * riga della parete nuova ha la terrazza **davanti** — la riga di tetto tecnico
 * esposta subito oltre il filo — e l'aria sopra. Il balcone e' la lastra che
 * sporge su quel vuoto — due prismi, lastra e corrimano, fusi in una corsa per
 * lato. Il tiro e' per **colonna**, cosi' un balcone sale dritto dove il piano
 * sopra apre un'altra terrazza: e' il ritmo verticale che una loggia ha davvero.
 */
function emitBalconies(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const normal = FACE_NEIGHBOUR_OFFSETS[face];

    const wanted = (x: number, y: number, z: number): boolean =>
      z >= 2 &&
      facadeAt(padded, x, y, z, face) === SURFACE_KIND.habitat &&
      blockAt(padded, x + normal[0], y + normal[1], z) === 0 &&
      openRoof(padded, x + normal[0], y + normal[1], z - 1) &&
      propRoll(origin, x, y, 0, BALCONY_SALT) < BALCONY_CHANCE;

    const horizontalAxis = facadeHorizontalAxis(face);
    const slab = (x: number, y: number, z: number, length: number): FixedBox => {
      const { axis, plane } = planeOf(x, y, face);
      const min: [number, number, number] = [x * U, y * U, z * U];
      const max: [number, number, number] = [x * U + U, y * U + U, z * U + 3];
      min[axis] = plane;
      max[axis] = plane + 3;
      max[horizontalAxis] = (horizontalAxis === 0 ? x : y) * U + length * U;
      return { min, max };
    };
    const rail = (x: number, y: number, z: number, length: number): FixedBox => {
      const { axis, plane } = planeOf(x, y, face);
      const min: [number, number, number] = [x * U, y * U, z * U + 3];
      const max: [number, number, number] = [x * U + U, y * U + U, z * U + 7];
      min[axis] = plane + 2;
      max[axis] = plane + 3;
      max[horizontalAxis] = (horizontalAxis === 0 ? x : y) * U + length * U;
      return { min, max };
    };

    if (!emitRuns(writer, facade[i], {
      runAxis: horizontalAxis,
      palette: PALETTE_SLOTS.stone,
      hiddenFace: face ^ 1,
      has: wanted,
      box: slab,
    })) {
      return false;
    }
    if (!emitRuns(writer, facade[i], {
      runAxis: horizontalAxis,
      palette: PALETTE_SLOTS.metalDark,
      hiddenFace: face ^ 1,
      has: wanted,
      box: rail,
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Davanzali continui sotto le regioni luminose.
 *
 * **L'aggancio e' il fronte attivo**: la lama d'accento che la soglia `mature`
 * accende. Il davanzale e' la riga sottile che ne chiude la base, e corre lungo
 * tutta la regione — un prisma per corsa, non per cella — con il tono della
 * pietra del quartiere.
 */
function emitSillLines(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[],
): boolean {
  for (const face of LATERAL_FACES) {
    if (!emitRuns(writer, cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.stoneWarm,
      hiddenFace: face ^ 1,
      has: (x, y, z) => hasSurfaceFace(padded, x, y, z, SURFACE_KIND.luminous, face) &&
        !hasSurfaceFace(padded, x, y, z - 1, SURFACE_KIND.luminous, face),
      box: (x, y, z, length) => facadeBox(x, y, z, face, 0, length * U, 0, 1, 2),
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Fasce d'ingresso: due lame accese ai fianchi del portale.
 *
 * Il portale e' il solo vuoto della facciata che la superficie racconta, e le
 * sue due testate sono geometriche: la cella del portale il cui vicino laterale
 * non e' portale. Le lame escono `luminous`, quindi di notte inquadrano
 * l'ingresso con la stessa luce dell'insegna — il fronte commerciale si legge
 * anche al buio.
 */
function emitEntranceFrames(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[],
): boolean {
  for (const face of LATERAL_FACES) {
    const horizontalAxis = facadeHorizontalAxis(face);
    const dx = horizontalAxis === 0 ? 1 : 0;
    const dy = horizontalAxis === 1 ? 1 : 0;
    for (const side of [-1, 1] as const) {
      const start = side < 0 ? 0 : U - 1;
      if (!emitRuns(writer, cells, {
        runAxis: 2,
        palette: PALETTE_SLOTS.glassPale,
        hiddenFace: face ^ 1,
        surface: SURFACE_KIND.luminous,
        has: (x, y, z) => hasSurfaceFace(padded, x, y, z, SURFACE_KIND.portal, face) &&
          !hasSurfaceFace(padded, x + dx * side, y + dy * side, z, SURFACE_KIND.portal, face),
        box: (x, y, z, length) => facadeBox(
          x, y, z, face, start, start + 1, 0, length * U, 1,
        ),
      })) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Il lembo della tenda: una lama sottile che pende dal filo esterno.
 *
 * Stesso aggancio della tenda — fronte con ingresso sotto — ma il prisma sta
 * **sotto** la lastra e sul suo bordo: la doppia riga e' cio' che trasforma la
 * pensilina in una tenda articolata.
 */
function emitAwningFringes(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
): boolean {
  const FRONTAGE_TOP = 7;
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    const { axis, plane } = planeOf(0, 0, face);
    const horizontalAxis = facadeHorizontalAxis(face);
    if (!emitRuns(writer, facade[i], {
      runAxis: horizontalAxis,
      palette: PALETTE_SLOTS.brickLight,
      hiddenFace: face ^ 1,
      has: (x, y, z) => z <= FRONTAGE_TOP &&
        facadeAt(padded, x, y, z, face) === SURFACE_KIND.habitat &&
        blockAt(padded, x + normal[0], y + normal[1], z) === 0 &&
        frontage(padded, x, y, z, face),
      box: (x, y, z, length) => {
        const min: [number, number, number] = [x * U, y * U, z * U + U - 10];
        const max: [number, number, number] = [x * U + U, y * U + U, z * U + U - 4];
        min[axis] = plane + 4;
        max[axis] = plane + 5;
        max[horizontalAxis] = (horizontalAxis === 0 ? x : y) * U + length * U;
        return { min, max };
      },
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Passerelle industriali: la mensola di piano che i capannoni hanno al posto
 * della cornice abitata.
 *
 * L'aggancio e' lo stesso delle mensole `habitat` — la sommita' della regione
 * sulla faccia — ma qui corre sull'industriale, che finora portava solo
 * nervature verticali: la passerella e' il ritmo **orizzontale** che ne fa una
 * fabbrica invece che un muro di lamiera.
 */
function emitWalkways(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[],
): boolean {
  for (const face of LATERAL_FACES) {
    if (!emitRuns(writer, cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.metalRust,
      hiddenFace: face ^ 1,
      has: (x, y, z) => hasSurfaceFace(padded, x, y, z, SURFACE_KIND.industrial, face) &&
        !hasSurfaceFace(padded, x, y, z + 1, SURFACE_KIND.industrial, face),
      box: (x, y, z, length) => facadeBox(x, y, z, face, 0, length * U, U - 1, U, 3),
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Terminali di condotta: gli sfiati che spuntano dal ciglio della parete.
 *
 * **L'aggancio e' lo spigolo superiore** — l'ultima riga di parete esposta,
 * con l'aria sopra. Il tiro e' per colonna, quindi i terminali cadono a un
 * ritmo fisso lungo il ciglio invece che a caso.
 */
function emitPipeStubs(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const ok = emitPoints(writer, facade[i], {
      runAxis: 2,
      palette: PALETTE_SLOTS.metalDark,
      hiddenFace: FACE_NZ,
      has: (x, y, z) => facadeAt(padded, x, y, z, face) === SURFACE_KIND.industrial &&
        blockAt(padded, x, y, z + 1) === 0 &&
        propRoll(origin, x, y, 0, PIPE_SALT) < PIPE_CHANCE,
      box: (x, y, z) => ({
        min: [x * U + 5, y * U + 5, (z + 1) * U],
        max: [x * U + 11, y * U + 11, (z + 1) * U + 9],
      }),
    });
    if (!ok) return false;
  }
  return true;
}

/**
 * Gruppi tecnici sul retro industriale: un cassone con il suo condotto.
 *
 * E' il solo emettitore del modulo che pesca sull'intera parete, quindi la
 * frequenza e' quella dei condizionatori: bassa, o vale da solo piu' di tutto.
 */
function emitTechClusters(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    const wanted = (x: number, y: number, z: number): boolean =>
      facadeAt(padded, x, y, z, face) === SURFACE_KIND.industrial &&
      blockAt(padded, x + normal[0], y + normal[1], z) === 0 &&
      !frontage(padded, x, y, z, face) &&
      propRoll(origin, x, y, z, CLUSTER_SALT) < CLUSTER_CHANCE;

    if (!emitPoints(writer, facade[i], {
      runAxis: 2,
      palette: PALETTE_SLOTS.metalRust,
      hiddenFace: face ^ 1,
      has: wanted,
      box: (x, y, z) => facadeBox(x, y, z, face, 4, 12, 2, 10, 4),
    })) {
      return false;
    }
    if (!emitPoints(writer, facade[i], {
      runAxis: 2,
      palette: PALETTE_SLOTS.metalBrass,
      hiddenFace: face ^ 1,
      has: wanted,
      box: (x, y, z) => facadeBox(x, y, z, face, 6, 8, 10, 16, 3),
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Lesene civiche: pilastri piatti a passo fisso sulla facciata.
 *
 * **Il passo e' una coordinata, non un tiro**: ogni quarta colonna, contata dal
 * mondo, porta una lesena. Non serve un dado perche' la cadenza e' la stessa su
 * ogni faccia e su ogni chunk — e' il ritmo classico del fronte monumentale, e
 * un hash lo farebbe balbettare dove non serve varieta'.
 */
function emitPilasters(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const horizontalAxis = facadeHorizontalAxis(face);
    if (!emitRuns(writer, facade[i], {
      runAxis: 2,
      palette: PALETTE_SLOTS.stoneWarm,
      hiddenFace: face ^ 1,
      has: (x, y, z) => hasSurfaceFace(padded, x, y, z, SURFACE_KIND.civic, face) &&
        ((horizontalAxis === 0 ? x : y) & 3) === 1,
      box: (x, y, z, length) => facadeBox(x, y, z, face, 6, 9, 0, length * U, 1),
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Pinne verticali civiche: lame sottili che spezzano la parete vetrata.
 *
 * Il tiro e' per **colonna**, come i rampicanti: la corsa sale dritta per tutta
 * la facciata e costa un prisma solo. L'offset alterna su due colonne perche'
 * due pinne vicine non si allineino come un retino.
 */
function emitFinBlades(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const horizontalAxis = facadeHorizontalAxis(face);
    if (!emitRuns(writer, facade[i], {
      runAxis: 2,
      palette: PALETTE_SLOTS.concreteWhite,
      hiddenFace: face ^ 1,
      has: (x, y, z) => facadeAt(padded, x, y, z, face) === SURFACE_KIND.civic &&
        propRoll(origin, x, y, 0, FIN_SALT) < FIN_CHANCE,
      box: (x, y, z, length) => {
        const coord = horizontalAxis === 0 ? x : y;
        const start = (coord & 1) === 0 ? 4 : 11;
        return facadeBox(x, y, z, face, start, start + 1, 0, length * U, 3);
      },
    })) {
      return false;
    }
  }
  return true;
}

/**
 * La quota da cui parte un impianto di tetto, sopra il calpestio vero.
 *
 * Stessa trappola gia' documentata in `microGeometry.ts`: `openRoof` risponde
 * sul voxel **solido**, e sopra un vassoio scavato il calpestio e' sceso.
 */
function roofBase(marks: Uint8Array, x: number, y: number, z: number): number {
  return (z + 1) * U - roofInset(marks, x, y, z);
}

/**
 * Vasche d'acqua sul tetto: un tamburo basso con il coperchio in metallo.
 *
 * Sta su `interiorRoof` come antenne e chiome: sul filo c'e' gia' il parapetto.
 * Il coperchio e' un secondo prisma perche' un prisma solo non ha due colori —
 * e il coperchio e' cio' che distingue una vasca da un cassone qualunque.
 */
function emitWaterTanks(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  roofs: readonly number[],
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  const wanted = (x: number, y: number, z: number): boolean =>
    openRoof(padded, x, y, z) && interiorRoof(padded, x, y, z) &&
    propRoll(origin, x, y, z, TANK_SALT) < TANK_CHANCE;

  if (!emitPoints(writer, roofs, {
    runAxis: 0,
    palette: PALETTE_SLOTS.concretePale,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 3, y * U + 3, roofBase(marks, x, y, z)],
      max: [x * U + 13, y * U + 13, roofBase(marks, x, y, z) + 8],
    }),
  })) {
    return false;
  }
  return emitPoints(writer, roofs, {
    runAxis: 0,
    palette: PALETTE_SLOTS.metalBrass,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 3, y * U + 3, roofBase(marks, x, y, z) + 8],
      max: [x * U + 13, y * U + 13, roofBase(marks, x, y, z) + 9],
    }),
  });
}

/**
 * Gruppi HVAC: il cassone di condizionamento con la ventola in vista.
 *
 * La ventola e' il secondo prisma, piu' largo del cassone di un sedicesimo per
 * lato: e' il bordo che la fa leggere come una griglia invece che come un
 * coperchio pieno.
 */
function emitHvacUnits(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  roofs: readonly number[],
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  const wanted = (x: number, y: number, z: number): boolean =>
    openRoof(padded, x, y, z) && interiorRoof(padded, x, y, z) &&
    propRoll(origin, x, y, z, HVAC_SALT) < HVAC_CHANCE;

  if (!emitPoints(writer, roofs, {
    runAxis: 0,
    palette: PALETTE_SLOTS.metalDark,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 4, y * U + 4, roofBase(marks, x, y, z)],
      max: [x * U + 12, y * U + 12, roofBase(marks, x, y, z) + 4],
    }),
  })) {
    return false;
  }
  return emitPoints(writer, roofs, {
    runAxis: 0,
    palette: PALETTE_SLOTS.glassPale,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 3, y * U + 3, roofBase(marks, x, y, z) + 4],
      max: [x * U + 13, y * U + 13, roofBase(marks, x, y, z) + 5],
    }),
  });
}

/**
 * Il dettaglio delle facciate mature, in una chiamata sola.
 *
 * L'ordine interno va dalle corse che fondono ai punti, cosi' sotto pressione
 * di budget a cadere sono le voci piu' care e non le piu' visibili.
 */
export function appendFacadeDetail(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: SurfaceCells,
  origin: ChunkOrigin,
): boolean {
  const facade = cells.facadeByFace;
  if (!emitEntranceFrames(padded, writer, cells.bySurface[SURFACE_KIND.portal])) return false;
  if (!emitSillLines(padded, writer, cells.bySurface[SURFACE_KIND.luminous])) return false;
  if (!emitBalconies(padded, writer, facade, origin)) return false;
  if (!emitAwningFringes(padded, writer, facade)) return false;
  if (!emitWalkways(padded, writer, cells.bySurface[SURFACE_KIND.industrial])) return false;
  if (!emitPilasters(padded, writer, facade)) return false;
  if (!emitFinBlades(padded, writer, facade, origin)) return false;
  if (!emitPipeStubs(padded, writer, facade, origin)) return false;
  return emitTechClusters(padded, writer, facade, origin);
}

/**
 * Il dettaglio dei tetti, in una chiamata sola.
 */
export function appendRoofDetail(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  roofs: readonly number[],
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  if (!emitWaterTanks(padded, writer, roofs, origin, marks)) return false;
  return emitHvacUnits(padded, writer, roofs, origin, marks);
}
