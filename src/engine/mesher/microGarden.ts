import { FACE_NEIGHBOUR_OFFSETS, FACE_NZ, FACE_PZ } from '../../world/chunkCoords';
import { SURFACE_KIND, WATER_CLASS, blockPalette, blockSurface } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { roofInset } from './carveMarks';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import {
  LATERAL_FACES,
  blockAt,
  emitPoints,
  emitRuns,
  isExposed,
  openRoof,
  propRoll,
  type ChunkOrigin,
  type MicroGeometryWriter,
} from './microGeometry';

/**
 * Il tetto come **luogo**: fioriere di bordo, chiome, cespugli, vasche.
 *
 * **E' il vuoto che questo modulo viene a riempire.** Il giardino pensile
 * esisteva gia' — `paint.ts` tinge di verde il cuore di una terrazza — ma
 * usciva `SURFACE_KIND.plain`, e il `plain` `collectSurfaceCells` lo scarta:
 * nessun emettitore lo vedeva, quindi dall'alto un giardino era una **macchia
 * verde piatta**, alla stessa quota del tetto. Le vasche e i gruppi HVAC di
 * `microDetail.ts` stanno sul tetto tecnico, cioe' esattamente dove il verde non
 * c'e'. Un tetto attrezzato aveva un vocabolario, un tetto piantato no.
 *
 * **Il `plain` resta, e non e' un ripiego.** Il commento di `paint.ts` che lo
 * sceglie e' ancora valido — un parapetto in mezzo alle aiuole sarebbe una
 * ringhiera dentro il prato — e un ottavo linguaggio di superficie violerebbe
 * l'invariante 5. Il giardino si riconosce quindi **senza un tipo nuovo**, da
 * cio' che gia' lo descrive: uno slot d'erba, l'aria sopra, e un costruito
 * sotto. E' l'ultima condizione a fare il lavoro vero: sotto un prato d'isola
 * c'e' terra, che e' `plain` come lui; sotto un giardino pensile c'e' la fascia
 * dell'edificio, che porta un linguaggio di facciata. Senza quella riga questo
 * modulo pianterebbe siepi su tutte le praterie della mappa.
 *
 * **La raccolta non aggiunge una scansione** (regola di `src/engine/AGENTS.md`):
 * le celle le mette da parte `collectSurfaceCells` nel ramo in cui gia' scartava
 * il `plain`, e il predicato e' ordinato dal test piu' economico al piu' caro
 * proprio perche' li' passa anche tutto il terreno.
 *
 * **La piscina sta qui e non fra gli impianti di `microDetail.ts`**, che pure
 * vivono sulla stessa superficie: un serbatoio e un condizionatore dicono che
 * lassu' c'e' una macchina, una vasca dice che lassu' si sta. E' la stessa
 * domanda del giardino — il tetto e' un luogo o un coperchio — e le due risposte
 * stanno insieme.
 *
 * **Sta prima delle vasche d'acqua nella sequenza**, con lo stesso argomento con
 * cui il coronamento sta prima di loro: da una camera isometrica il tetto e'
 * meta' di cio' che si vede, e un albero in copertura racconta piu' di un
 * serbatoio.
 */

const U = MESH_UNITS_PER_VOXEL;

// Sali: ogni domanda la sua moneta. Vedi `propRoll`.
const CANOPY_SALT = 0x3ab1_57e9;
const SHRUB_SALT = 0x62d0_4c1b;
const POOL_SALT = 0xa47f_2b06;

/**
 * Celle di giardino riparate che portano un albero.
 *
 * Bassa non per il costo — due prismi — ma per la scala: una chioma occupa 12/16
 * di cella, quindi a frequenza alta due chiome adiacenti si toccano e il
 * giardino legge come un bosco invece che come una terrazza piantata. A 0,12 su
 * un anello di verde ne cade una ogni otto celle, che e' il passo di un filare.
 */
const CANOPY_CHANCE = 0.12;

/** Celle riparate che portano un cespuglio, dove non c'e' gia' un albero. */
const SHRUB_CHANCE = 0.22;

/**
 * Celle di terrazza pavimentata che portano una vasca.
 *
 * La piu' bassa del modulo, e non per il costo: una piscina e' un fatto raro:
 * ne vuoi vedere una ogni tanti tetti, altrimenti la citta' sembra un villaggio
 * vacanze. A 0,02 tocca una terrazza larga su qualche edificio, che e' il passo
 * giusto perche' resti una cosa notevole quando la si trova.
 */
const POOL_CHANCE = 0.02;

/** Gli slot d'erba sono contigui: e' l'intervallo, non quattro confronti. */
function isGardenPalette(palette: number): boolean {
  return palette >= PALETTE_SLOTS.grass && palette <= PALETTE_SLOTS.grassPale;
}

/**
 * true per una cella di giardino pensile scoperta.
 *
 * L'ordine dei test e' il costo: la palette e' due confronti su un byte gia'
 * letto, il costruito sotto e' una lettura, l'aria sopra un'altra. Il grosso di
 * cio' che arriva qui e' terreno, e il secondo test lo toglie tutto.
 */
export function isRoofGarden(padded: Uint8Array, x: number, y: number, z: number): boolean {
  const block = blockAt(padded, x, y, z);
  if (block === 0 || blockSurface(block) !== SURFACE_KIND.plain) return false;
  if (!isGardenPalette(blockPalette(block))) return false;
  // Sotto un prato c'e' terra, sotto un giardino c'e' un edificio. Vedi la nota
  // in testa al file: e' questa riga a distinguerli, non la quota.
  if (blockSurface(blockAt(padded, x, y, z - 1)) === SURFACE_KIND.plain) return false;
  return isExposed(padded, x, y, z, FACE_PZ);
}

/**
 * Cella di giardino con del pieno **tutt'attorno**: non e' sul ciglio del vuoto.
 *
 * **La condizione e' il vicino solido, non il vicino verde, e la differenza
 * decide se in citta' ci sono alberi.** La prima versione chiedeva il verde su
 * tutti e quattro i lati, come `interiorRoof` fa sul tetto tecnico: su un
 * edificio vero il giardino di `paint.ts` e' quasi sempre l'**anello** di una
 * rientranza, largo uno o due voxel, dove una cella con quattro vicini verdi non
 * esiste — misurato, zero chiome su ogni tipologia del catalogo. La chioma sta
 * dentro la propria cella (12/16 centrati), quindi il verde attorno non le
 * serviva: le serve solo di non stare sul filo, dove il parapetto le passa
 * dentro e la sagoma sporge sul vuoto.
 */
function shelteredGarden(padded: Uint8Array, x: number, y: number, z: number): boolean {
  if (!isRoofGarden(padded, x, y, z)) return false;
  for (const face of LATERAL_FACES) {
    const offset = FACE_NEIGHBOUR_OFFSETS[face];
    if (blockAt(padded, x + offset[0], y + offset[1], z) === 0) return false;
  }
  return true;
}

/** Cella di verde che confina con qualcosa che verde non e': il ciglio dell'aiuola. */
function gardenEdge(padded: Uint8Array, x: number, y: number, z: number): boolean {
  if (!isRoofGarden(padded, x, y, z)) return false;
  for (const face of LATERAL_FACES) {
    const offset = FACE_NEIGHBOUR_OFFSETS[face];
    if (!isRoofGarden(padded, x + offset[0], y + offset[1], z)) return true;
  }
  return false;
}

/**
 * La quota di semina, sopra il calpestio vero.
 *
 * Stessa trappola di ogni prop di tetto: `isRoofGarden` risponde sul voxel
 * **solido**, quindi un prisma steso da `z * U` finirebbe dentro quel pieno. La
 * base la dice `roofInset`, non il letterale — su un vassoio scavato il piano e'
 * sceso.
 */
function gardenBase(marks: Uint8Array, x: number, y: number, z: number): number {
  return (z + 1) * U - roofInset(marks, x, y, z);
}

/**
 * Fioriere di bordo: la fascia bassa che corre lungo il ciglio dell'aiuola.
 *
 * **L'aggancio e' il perimetro del verde**, cioe' la cella di giardino che ha
 * almeno un vicino che giardino non e'. Il verde di `paint.ts` e' gia' rientrato
 * di un voxel dal filo, quindi quel perimetro guarda la pavimentazione della
 * terrazza e non il vuoto: e' il posto in cui una fioriera sta davvero.
 *
 * Costa **un prisma per corsa** e non per cella, ed e' la ragione per cui apre
 * il gruppo: e' la voce che si vede da piu' lontano e quella che costa meno. Le
 * testate rientrano solo dove la corsa finisce davvero — `openStart` e `openEnd`
 * dicono che prosegue oltre — cosi' due tratti allineati non si aprono in mezzo.
 */
function emitPlanterKerbs(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  gardens: readonly number[],
  marks: Uint8Array,
): boolean {
  return emitRuns(writer, gardens, {
    runAxis: 0,
    palette: PALETTE_SLOTS.grassDark,
    hiddenFace: FACE_NZ,
    has: (x, y, z) => gardenEdge(padded, x, y, z),
    box: (x, y, z, length, openStart, openEnd) => {
      const base = gardenBase(marks, x, y, z);
      return {
        min: [x * U + (openStart ? 0 : 2), y * U + 4, base],
        max: [(x + length) * U - (openEnd ? 0 : 2), y * U + 12, base + 5],
      };
    },
  });
}

/**
 * Chiome: il fusto e la massa di foglie di un albero in copertura.
 *
 * Due prismi, come la vasca d'acqua: uno solo non ha due colori, e la coppia
 * fusto-chioma e' esattamente cio' che distingue un albero da un cespuglio
 * grosso. La chioma sta a 12/16 di cella, quindi resta dentro la propria cella
 * anche quando due tiri cadono adiacenti.
 */
function emitCanopies(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  gardens: readonly number[],
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  const wanted = (x: number, y: number, z: number): boolean =>
    shelteredGarden(padded, x, y, z) &&
    propRoll(origin, x, y, z, CANOPY_SALT) < CANOPY_CHANCE;

  if (!emitPoints(writer, gardens, {
    runAxis: 0,
    palette: PALETTE_SLOTS.wood,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 7, y * U + 7, gardenBase(marks, x, y, z)],
      max: [x * U + 10, y * U + 10, gardenBase(marks, x, y, z) + 7],
    }),
  })) {
    return false;
  }
  // La chioma scende fino a 6/16, cioe' un sedicesimo sotto la cima del fusto:
  // la compenetrazione e' cio' che tiene chiusa la giunzione da ogni angolazione.
  return emitPoints(writer, gardens, {
    runAxis: 0,
    palette: PALETTE_SLOTS.grassLight,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 2, y * U + 2, gardenBase(marks, x, y, z) + 6],
      max: [x * U + 14, y * U + 14, gardenBase(marks, x, y, z) + 13],
    }),
  });
}

/**
 * Cespugli: il mucchio basso che rompe la piattezza fra un albero e l'altro.
 *
 * **Chiude il gruppo perche' e' la voce che vale meno**, non perche' costi di
 * piu': un prisma per cella e' meno di una chioma. Un giardino senza cespugli
 * resta un giardino; senza alberi torna la macchia verde di prima, ed e' quella
 * la cosa che non deve cadere per prima.
 */
function emitShrubs(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  gardens: readonly number[],
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  return emitPoints(writer, gardens, {
    runAxis: 0,
    palette: PALETTE_SLOTS.grass,
    hiddenFace: FACE_NZ,
    has: (x, y, z) => shelteredGarden(padded, x, y, z) &&
      propRoll(origin, x, y, z, CANOPY_SALT) >= CANOPY_CHANCE &&
      propRoll(origin, x, y, z, SHRUB_SALT) < SHRUB_CHANCE,
    box: (x, y, z) => ({
      min: [x * U + 4, y * U + 4, gardenBase(marks, x, y, z)],
      max: [x * U + 12, y * U + 12, gardenBase(marks, x, y, z) + 4],
    }),
  });
}

/**
 * Vasche: la piscina sulla terrazza pavimentata.
 *
 * **L'aggancio e' il tetto tecnico riparato, non il verde**: una vasca sta sul
 * pavimento, non nell'aiuola, e le serve la stessa condizione della chioma —
 * pieno su tutti e quattro i lati — perche' sul filo ci passa il parapetto.
 * `interiorRoof` chiederebbe invece **tetto** su tutti e quattro i lati, e
 * l'anello di terrazza attorno a un giardino non lo soddisfa mai: e' la stessa
 * trappola in cui l'albero era gia' caduto.
 *
 * Due prismi: il bordo e lo specchio un sedicesimo piu' in basso. E' la
 * differenza di quota, non il colore, a farlo leggere come acqua contenuta
 * invece che come una piastrella azzurra.
 *
 * **Lo specchio esce `WATER_CLASS.canal`, e non e' un dettaglio.** Il fragment
 * riconosce l'acqua dalla palette e poi legge nei bit di superficie **quale**
 * acqua sia: senza dirglielo, una vasca da un voxel prenderebbe la risposta di
 * default — onda lunga e riflesso del sole, cioe' mare aperto — su dieci
 * sedicesimi di lato. Il canale e' la classe dell'acqua chiusa, che e' quello
 * che una piscina e'.
 *
 * **Il bordo e' `concreteLight` e non `concretePale`** perche' quel secondo slot
 * e' gia' il tamburo della vasca d'acqua di `microDetail.ts`, sulla stessa
 * superficie: due prop diversi con lo stesso colore sullo stesso tetto non si
 * distinguono piu', ne' a schermo ne' in un test che li cerchi per palette.
 */
function emitPools(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  roofs: readonly number[],
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  const wanted = (x: number, y: number, z: number): boolean => {
    if (!openRoof(padded, x, y, z)) return false;
    for (const face of LATERAL_FACES) {
      const offset = FACE_NEIGHBOUR_OFFSETS[face];
      if (blockAt(padded, x + offset[0], y + offset[1], z) === 0) return false;
    }
    return propRoll(origin, x, y, z, POOL_SALT) < POOL_CHANCE;
  };

  if (!emitPoints(writer, roofs, {
    runAxis: 0,
    palette: PALETTE_SLOTS.concreteLight,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 1, y * U + 1, gardenBase(marks, x, y, z)],
      max: [x * U + 15, y * U + 15, gardenBase(marks, x, y, z) + 3],
    }),
  })) {
    return false;
  }
  return emitPoints(writer, roofs, {
    runAxis: 0,
    palette: PALETTE_SLOTS.water,
    surface: WATER_CLASS.canal,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 3, y * U + 3, gardenBase(marks, x, y, z)],
      max: [x * U + 13, y * U + 13, gardenBase(marks, x, y, z) + 2],
    }),
  });
}

/**
 * Il tetto abitato, in una chiamata sola.
 *
 * L'ordine e' quello del valore decrescente e non del costo: la fioriera e' una
 * corsa e apre, l'albero e' il motivo per cui il modulo esiste e la segue, il
 * cespuglio e la vasca chiudono perche' sono i due che si possono perdere senza
 * perdere il giardino.
 */
export function appendGardenDetail(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  gardens: readonly number[],
  roofs: readonly number[],
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  if (gardens.length > 0) {
    if (!emitPlanterKerbs(padded, writer, gardens, marks)) return false;
    if (!emitCanopies(padded, writer, gardens, origin, marks)) return false;
    if (!emitShrubs(padded, writer, gardens, origin, marks)) return false;
  }
  return emitPools(padded, writer, roofs, origin, marks);
}
