import {
  CHUNK,
  FACE_NEIGHBOUR_OFFSETS,
  FACE_NX,
  FACE_NY,
  FACE_NZ,
  FACE_PX,
  FACE_PY,
  FACE_PZ,
  PADDED,
  PADDED_VOL,
  paddedIdx,
} from '../../world/chunkCoords';
import { hashCoords } from '../../world/rng';
import { blockPalette, blockSurface, SURFACE_KIND, type SurfaceKind } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { facadeInset, roofInset } from './carveMarks';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
// Il dettaglio del retro vive in un modulo suo — questo file e' gia' oltre il
// budget di righe della cartella. Le due direzioni si chiudono in cerchio, ed e'
// sicuro solo perche' **nessuna delle due valuta l'altra al caricamento**: qui si
// chiama `appendStreetDetail` dentro il corpo di una funzione, e di la' si legge
// `LATERAL_FACES` dentro il corpo di un emettitore. Un letterale di modulo che
// dereferenziasse l'altro lato romperebbe il caricamento, non la compilazione.
import { appendStreetDetail } from './microStreet';
// Il vocabolario degli edifici maturi sta in un terzo modulo per la stessa
// ragione e con la stessa cautela: `appendFacadeDetail` e `appendRoofDetail` si
// chiamano solo dentro il corpo di `appendMicroGeometry`, e di la' si leggono le
// costanti di questo file dentro i corpi degli emettitori.
import { appendFacadeDetail, appendRoofDetail } from './microDetail';

/**
 * Microgeometria architettonica in unita' fisse di 1/16 di voxel.
 *
 * Come il resto di `src/engine/mesher/`, questo modulo non importa Three.js e
 * non conosce il mondo: riceve il volume paddato 34^3 e scrive prismi
 * axis-aligned nello stesso scratch buffer del greedy pass, tramite il writer.
 * Nessuna draw call in piu', nessuna geometria separata.
 *
 * **Tutto passa da `emitRuns`.** Un dettaglio non e' mai un prisma per voxel: e'
 * un prisma per *corsa* di voxel contigui che chiedono lo stesso dettaglio. Le
 * facce interne alla corsa non sarebbero comunque visibili, quindi fondere non
 * cambia un pixel e divide per la lunghezza media della corsa il numero di quad.
 * Vale circa un fattore tre sui chunk edificati, e senza fondere il tetto
 * verrebbe sfondato da qualunque isolato.
 *
 * Il padding porta il resto: una corsa che prosegue oltre il confine perde la
 * testata da quel lato e la ritrova, identica, nella corsa del chunk accanto.
 *
 * **Due famiglie, non una.** Sopra ci sono i dettagli di *struttura* — montanti,
 * architravi, parapetti, cornici — che stanno dove la facciata cambia e la cui
 * posizione e' interamente geometrica. Sotto ci sono i *prop*: la tenda,
 * l'insegna, il condizionatore, l'antenna. Anche loro nascono da una giunzione
 * che il volume racconta, ma quale cella la porti lo decide un hash delle
 * coordinate di **mondo**. Vengono per ultimi apposta: sotto pressione di
 * budget a cadere sono loro, e una citta' senza tende resta leggibile.
 */

/**
 * Limite duro, deterministico e indipendente dalla capacita' degli scratch buffer.
 *
 * Non e' un budget: e' una rete. Un chunk fitto di edifici veri misura 13 890
 * quad di dettaglio, quindi il tetto sta sopra il caso denso e non tronca mai
 * per davvero. Serve solo a tenere limitata la patologia — voxel isolati a
 * scacchiera, dove nessuna corsa fonde e ogni cella chiede otto prismi.
 *
 * **I prop hanno alzato quel numero, e il tetto non si e' alzato con loro.** La
 * fixture `densityChunk` di `microGeometry.test.ts` misura la differenza:
 * 3 320 quad di sola struttura, 4 355 con prop e verde — un trenta per cento.
 * La voce che pesa e' l'unica che pesca su tutta la parete invece che su una
 * giunzione, ed e' per questo che la sua frequenza sta a 0,012 e non a 0,09,
 * dove da sola valeva piu' di tutto il dettaglio strutturale del chunk. Il
 * verde, invece, e' quasi gratis: fioriera e cassone sono lo stesso prisma con
 * due slot diversi, e un rampicante e' una corsa sola per colonna.
 *
 * Troncare non e' gratis: la sequenza si ferma per priorita', quindi a essere
 * tagliate sono sempre le ultime voci (industrial, civic) e sempre a meta' di un
 * chunk. Meglio pagare la geometria che far sparire una classe a caso.
 */
export const MAX_DETAIL_QUADS_PER_CHUNK = 16384;

export interface FixedBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * Come va disegnato un prisma. Tutto opzionale: senza, e' un pieno illuminato.
 *
 * **`inward` e' cio' che rende possibile la microgeometria riduttiva.** Le
 * stesse sei facce, con l'id di faccia opposto e il winding invertito, smettono
 * di descrivere un pieno e descrivono un **vuoto**: le pareti guardano dentro il
 * prisma invece che fuori. Il materiale e' `FrontSide`, quindi il winding non e'
 * ornamentale — sbagliarlo rende la cavita' invisibile invece che sbagliata.
 */
export interface BoxOptions {
  /** Le facce guardano dentro il prisma: e' un vano scavato, non un volume aggiunto. */
  readonly inward?: boolean;
  /**
   * AO costante sui quattro corner, 0..3. Senza, il corner del tutto libero.
   *
   * Dentro un incavo il valore libero significa «niente mi occlude», cioe'
   * piatto e illuminato: e' esattamente cio' che farebbe leggere una nicchia
   * come un adesivo invece che come un buco. Le cavita' lo abbassano, e il fondo
   * piu' delle spalle.
   */
  readonly ao?: number;
}

/**
 * Writer implementato dal mesher per tenere dettagli e greedy pass nella stessa
 * mesh.
 *
 * `surface` non e' un tipo nuovo: e' uno dei sette linguaggi che il fragment
 * gia' conosce. Serve perche' un'insegna deve poter uscire `luminous` e
 * prendersi la fascia accesa senza un materiale proprio, mentre un
 * condizionatore resta `utility`, cioe' metallo strutturale.
 *
 * `hiddenFaces` conserva sempre il suo significato **geometrico** — un bit per
 * lato del prisma — anche sui vani: cambia solo quale lato si nasconde, che su
 * un pieno e' quello incollato al voxel e su un vuoto e' la **bocca**.
 */
export interface MicroGeometryWriter {
  readonly remainingQuads: number;
  emitBox(
    box: FixedBox,
    palette: number,
    hiddenFaces: number,
    surface: SurfaceKind,
    options?: BoxOptions,
  ): boolean;
}

/**
 * Angolo minimo del chunk in voxel di mondo.
 *
 * E' l'unica nozione di mondo che entra in questo modulo, e serve a una cosa
 * sola: seminare la scelta di un prop. Con coordinate locali le due meta' di una
 * corsa a cavallo di un confine sceglierebbero prop diversi, e la cucitura si
 * vedrebbe. Non entra in nessun predicato geometrico.
 */
export type ChunkOrigin = readonly [number, number, number];

const ORIGIN_ZERO: ChunkOrigin = [0, 0, 0];

/**
 * La maschera degli scavi del chunk in lavorazione.
 *
 * Vive a livello di modulo invece di passare per quattordici firme, ed e' la
 * stessa scelta che `coverDetail.ts` fa con `lifted`: il worker mesha un chunk
 * alla volta, e cio' che gli emettitori le chiedono e' sempre la stessa cosa —
 * di quanto e' arretrata la parete sotto questo prisma. `appendMicroGeometry` la
 * posa prima di chiamare chiunque, e nessuno la scrive.
 *
 * **Senza, i prismi additivi resterebbero appesi nel vuoto.** Un montante di
 * portale su una soglia arretrata di tre sedicesimi partirebbe dal filo del muro
 * che li' non c'e' piu'. Il valore e' zero su ogni parete piatta, cioe' quasi
 * ovunque, quindi non cambia una virgola di cio' che il mesher faceva prima.
 */
let carves: Uint8Array = new Uint8Array(PADDED_VOL);

/** Di quanto arretra un prisma appoggiato a questa faccia. Zero su parete piatta. */
function inset(x: number, y: number, z: number, face: number): number {
  return facadeInset(carves, x, y, z, face);
}

/**
 * La quota da cui parte un prop di tetto, in unita' di mesh.
 *
 * `openRoof` risponde sul voxel **solido**, quindi la base e' sempre stata
 * `(z + 1) * U` — e da quando il vassoio abbassa il calpestio quella non e' piu'
 * la superficie su cui il prop poggia. Chi aggiunge un emettitore di tetto usi
 * questa e non il letterale: e' la stessa trappola gia' documentata in
 * `src/engine/AGENTS.md`, un giro piu' in la'.
 */
function roofBase(x: number, y: number, z: number): number {
  return (z + 1) * U - roofInset(carves, x, y, z);
}

const U = MESH_UNITS_PER_VOXEL;
export const LATERAL_FACES = [FACE_PX, FACE_NX, FACE_PY, FACE_NY] as const;
const SIDES = [-1, 1] as const;

type Side = -1 | 1;

const faceBit = (face: number): number => 1 << face;

function encodeCell(x: number, y: number, z: number): number {
  return x | (y << 5) | (z << 10);
}

/**
 * Le celle da visitare: per superficie, e per faccia esposta.
 *
 * La seconda lista e' l'unica cosa che rende sostenibili i prop. Un emettitore
 * costa una passata sulla lista che riceve, e la lista per superficie e'
 * **volumetrica**: un edificio pieno ci mette dentro anche i voxel interni, che
 * sono i due terzi e non potranno mai portare niente. Filtrarli una volta sola,
 * nella scansione che c'e' gia', li toglie da tutte le passate che seguono.
 *
 * L'indice e' la posizione dentro `LATERAL_FACES`, non l'indice di faccia.
 */
export interface SurfaceCells {
  readonly bySurface: number[][];
  readonly facadeByFace: number[][];
}

export function collectSurfaceCells(padded: Uint8Array): SurfaceCells {
  const bySurface = Array.from({ length: 8 }, () => [] as number[]);
  const facadeByFace = Array.from({ length: LATERAL_FACES.length }, () => [] as number[]);
  for (let z = 0; z < CHUNK; z++) {
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const block = blockAt(padded, x, y, z);
        if (block === 0) continue;
        const surface = blockSurface(block);
        if (surface === SURFACE_KIND.plain || surface === SURFACE_KIND.utility) continue;
        const cell = encodeCell(x, y, z);
        bySurface[surface].push(cell);
        // L'acqua porta `WATER_CLASS` in questi stessi bit, e bassofondo e
        // canale coincidono con `habitat` e `industrial`: senza escluderla, il
        // mare esposto al bordo del mondo finirebbe nella lista di facciata.
        if ((surface !== SURFACE_KIND.habitat && surface !== SURFACE_KIND.industrial &&
          surface !== SURFACE_KIND.civic) || isWater(block)) {
          continue;
        }
        // I quattro vicini in piano si leggono con gli indici, non con la
        // tabella degli offset: e' l'unico punto del modulo che paga una lettura
        // per **ogni** cella di edificio, interne comprese, e li' la doppia
        // indirezione di `FACE_NEIGHBOUR_OFFSETS` si sente. L'ordine e' quello
        // di `LATERAL_FACES`.
        const p = paddedIdx(x + 1, y + 1, z + 1);
        if (padded[p + 1] === 0) facadeByFace[0].push(cell);
        if (padded[p - 1] === 0) facadeByFace[1].push(cell);
        if (padded[p + PADDED] === 0) facadeByFace[2].push(cell);
        if (padded[p - PADDED] === 0) facadeByFace[3].push(cell);
      }
    }
  }
  return { bySurface, facadeByFace };
}

export function blockAt(padded: Uint8Array, x: number, y: number, z: number): number {
  return padded[paddedIdx(x + 1, y + 1, z + 1)];
}

export function isExposed(padded: Uint8Array, x: number, y: number, z: number, face: number): boolean {
  const offset = FACE_NEIGHBOUR_OFFSETS[face];
  return blockAt(padded, x + offset[0], y + offset[1], z + offset[2]) === 0;
}

export function hasSurfaceFace(
  padded: Uint8Array,
  x: number,
  y: number,
  z: number,
  surface: SurfaceKind,
  face: number,
): boolean {
  const block = blockAt(padded, x, y, z);
  return block !== 0 && blockSurface(block) === surface && isExposed(padded, x, y, z, face);
}

function oppositeFace(face: number): number {
  return face ^ 1;
}

/** Asse su cui scorre una facciata: quello ortogonale alla sua normale, nel piano. */
export function facadeHorizontalAxis(face: number): 0 | 1 {
  return face < 2 ? 1 : 0;
}

function axisFace(axis: number, positive: boolean): number {
  return axis * 2 + (positive ? 0 : 1);
}

function axisCoord(x: number, y: number, z: number, axis: number): number {
  return axis === 0 ? x : axis === 1 ? y : z;
}

function sharedCapMask(axis: number, negativeContinues: boolean, positiveContinues: boolean): number {
  return (negativeContinues ? faceBit(axisFace(axis, false)) : 0) |
    (positiveContinues ? faceBit(axisFace(axis, true)) : 0);
}

/**
 * Prisma appoggiato a una facciata verticale.
 *
 * `horizontal*` e `vertical*` sono offset dall'origine della cella `(x, y, z)` e
 * possono superare `U`: e' cosi' che una corsa lunga `n` celle diventa un solo
 * box. `depth` misura la sporgenza oltre il piano della facciata.
 *
 * **`inset` arretra il piano di riferimento dentro il voxel**, e serve a due
 * cose sole. La prima e' descrivere il vano stesso: `inset` e `depth` uguali
 * danno esattamente il volume scavato, e `depth` zero da' un box degenere sul
 * fondo, cioe' un pannello. La seconda e' rimettere un prisma additivo sul filo
 * di una bocca invece che a mezz'aria davanti a un vano — un montante di portale
 * su una soglia arretrata. Vale zero per tutti i chiamanti storici, che
 * continuano a sporgere dal filo della parete.
 *
 * Non provare a ottenere un vano con `depth` negativo: uscirebbe un box con
 * `min` oltre `max`, che il writer scrive senza lamentarsi e nessuno vede.
 */
export function facadeBox(
  x: number,
  y: number,
  z: number,
  face: number,
  horizontalStart: number,
  horizontalEnd: number,
  verticalStart: number,
  verticalEnd: number,
  depth: number,
  inset = 0,
): FixedBox {
  const min: [number, number, number] = [x * U, y * U, z * U + verticalStart];
  const max: [number, number, number] = [(x + 1) * U, (y + 1) * U, z * U + verticalEnd];
  const horizontalAxis = facadeHorizontalAxis(face);
  min[horizontalAxis] += horizontalStart;
  max[horizontalAxis] = (horizontalAxis === 0 ? x : y) * U + horizontalEnd;

  const normalAxis = face < 2 ? 0 : 1;
  const positive = face === FACE_PX || face === FACE_PY;
  const plane = ((normalAxis === 0 ? x : y) + (positive ? 1 : 0)) * U;
  const reference = positive ? plane - inset : plane + inset;
  min[normalAxis] = positive ? reference : reference - depth;
  max[normalAxis] = positive ? reference + depth : reference;
  return { min, max };
}

/**
 * Un dettaglio, descritto una volta e steso su tutte le sue corse.
 *
 * `has` decide se una cella chiede questo dettaglio; `box` disegna il prisma che
 * copre `length` celle a partire da quella iniziale. `openStart`/`openEnd`
 * dicono che la corsa prosegue oltre l'estremo: chi disegna arriva al confine
 * invece di rientrare, cosi' il pezzo accanto combacia.
 */
export interface RunSpec {
  readonly runAxis: 0 | 1 | 2;
  readonly palette: number;
  /**
   * Lato del prisma che non viene mai emesso.
   *
   * Su un pieno e' la faccia aderente al voxel che lo regge; su un vano
   * (`inward`) e' la **bocca**, cioe' il lato aperto verso l'aria. Restano altri
   * lati da nascondere: `hiddenFaces` accetta una maschera, questo un solo bit,
   * e chi ne vuole due passa da `emitBox`.
   */
  readonly hiddenFace: number;
  /** Altri lati da nascondere oltre a `hiddenFace`, come maschera di bit. */
  readonly alsoHidden?: number;
  /** Linguaggio di superficie del prisma. Senza, e' metallo strutturale. */
  readonly surface?: SurfaceKind;
  /** Il prisma e' un vano scavato e non un volume aggiunto. Vedi `BoxOptions`. */
  readonly inward?: boolean;
  /** AO costante sui quattro corner. Vedi `BoxOptions`. */
  readonly ao?: number;
  has(x: number, y: number, z: number): boolean;
  box(x: number, y: number, z: number, length: number, openStart: boolean, openEnd: boolean): FixedBox;
}

/** Le opzioni di disegno di uno spec, o `undefined` se sono tutte al default. */
function boxOptions(spec: RunSpec): BoxOptions | undefined {
  return spec.inward === undefined && spec.ao === undefined
    ? undefined
    : { inward: spec.inward, ao: spec.ao };
}

/**
 * Emette un prisma per ogni corsa massimale di celle che chiedono `spec`.
 *
 * Solo la cella che apre la corsa disegna. Al bordo del chunk apre comunque,
 * anche se il padding mostra che la corsa viene da fuori: il chunk accanto
 * possiede le proprie celle e non puo' disegnare le nostre. Le due meta' si
 * incontrano perche' entrambe nascondono la testata sul confine condiviso.
 */
export function emitRuns(writer: MicroGeometryWriter, cells: readonly number[], spec: RunSpec): boolean {
  const axis = spec.runAxis;
  const dx = axis === 0 ? 1 : 0;
  const dy = axis === 1 ? 1 : 0;
  const dz = axis === 2 ? 1 : 0;
  const options = boxOptions(spec);
  const hidden = faceBit(spec.hiddenFace) | (spec.alsoHidden ?? 0);

  for (const cell of cells) {
    const x = cell & 31;
    const y = (cell >>> 5) & 31;
    const z = (cell >>> 10) & 31;
    if (!spec.has(x, y, z)) continue;

    const openStart = spec.has(x - dx, y - dy, z - dz);
    if (openStart && axisCoord(x, y, z, axis) > 0) continue;

    let length = 1;
    while (
      axisCoord(x, y, z, axis) + length < CHUNK &&
      spec.has(x + dx * length, y + dy * length, z + dz * length)
    ) {
      length++;
    }
    const openEnd = spec.has(x + dx * length, y + dy * length, z + dz * length);

    if (!writer.emitBox(
      spec.box(x, y, z, length, openStart, openEnd),
      spec.palette,
      hidden | sharedCapMask(axis, openStart, openEnd),
      spec.surface ?? SURFACE_KIND.utility,
      options,
    )) {
      return false;
    }
  }
  return true;
}

/**
 * Un prisma per cella che soddisfa `spec`, senza cercare la corsa.
 *
 * **Non e' una scorciatoia di `emitRuns`, e' il caso in cui la corsa non
 * esiste.** Un condizionatore o un'antenna stanno dentro la loro cella e non
 * proseguono: chiedere a `emitRuns` di scoprirlo costa tre valutazioni in piu'
 * del predicato per cella — quella all'indietro, quella in avanti e quella che
 * chiude — per riscoprire ogni volta una corsa di lunghezza uno. Su un prop
 * sparso il predicato e' il costo dominante, quindi valeva tre volte tanto.
 *
 * Niente testate condivise da mascherare: il prisma non tocca il confine, e la
 * cella appartiene a un chunk solo.
 */
export function emitPoints(writer: MicroGeometryWriter, cells: readonly number[], spec: RunSpec): boolean {
  const options = boxOptions(spec);
  const hidden = faceBit(spec.hiddenFace) | (spec.alsoHidden ?? 0);

  for (const cell of cells) {
    const x = cell & 31;
    const y = (cell >>> 5) & 31;
    const z = (cell >>> 10) & 31;
    if (!spec.has(x, y, z)) continue;

    if (!writer.emitBox(
      spec.box(x, y, z, 1, false, false),
      spec.palette,
      hidden,
      spec.surface ?? SURFACE_KIND.utility,
      options,
    )) {
      return false;
    }
  }
  return true;
}

/** Montante o lama verticale: sta su un bordo della facciata e sale lungo z. */
function verticalEdgeSpec(
  padded: Uint8Array,
  surface: SurfaceKind,
  face: number,
  side: Side,
  width: number,
  depth: number,
  palette: number,
): RunSpec {
  const horizontalAxis = facadeHorizontalAxis(face);
  const dx = horizontalAxis === 0 ? side : 0;
  const dy = horizontalAxis === 1 ? side : 0;
  const start = side < 0 ? 0 : U - width;

  return {
    runAxis: 2,
    palette,
    hiddenFace: oppositeFace(face),
    has: (x, y, z) => hasSurfaceFace(padded, x, y, z, surface, face) &&
      !hasSurfaceFace(padded, x + dx, y + dy, z, surface, face),
    box: (x, y, z, length) => facadeBox(
      x, y, z, face, start, start + width, 0, length * U, depth, inset(x, y, z, face),
    ),
  };
}

function emitPortals(padded: Uint8Array, writer: MicroGeometryWriter, cells: readonly number[]): boolean {
  const portal = SURFACE_KIND.portal;
  for (const face of LATERAL_FACES) {
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    // Montanti larghi 2/16 e profondi 2/16 sui due bordi del vano.
    for (const side of SIDES) {
      if (!emitRuns(writer, cells, verticalEdgeSpec(padded, portal, face, side, 2, 2, PALETTE_SLOTS.metalBrass))) {
        return false;
      }
    }

    // Architrave e pensilina corrono in orizzontale sul filo superiore del vano.
    const isLintel = (x: number, y: number, z: number): boolean =>
      hasSurfaceFace(padded, x, y, z, portal, face) &&
      !hasSurfaceFace(padded, x, y, z + 1, portal, face);

    if (!emitRuns(writer, cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.metalBrass,
      hiddenFace: oppositeFace(face),
      has: isLintel,
      box: (x, y, z, length) => facadeBox(
        x, y, z, face, 0, length * U, U - 2, U, 2, inset(x, y, z, face),
      ),
    })) {
      return false;
    }

    if (!emitRuns(writer, cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.metalDark,
      hiddenFace: oppositeFace(face),
      // La pensilina sporge 4/16: le serve aria davanti, un piano piu' in alto.
      has: (x, y, z) => isLintel(x, y, z) && blockAt(padded, x + normal[0], y + normal[1], z + 1) === 0,
      box: (x, y, z, length) => facadeBox(
        x, y, z, face, 0, length * U, U, U + 1, 4, inset(x, y, z, face),
      ),
    })) {
      return false;
    }
  }
  return true;
}

/** Parapetti perimetrali: solo dove un tetto tecnico confina con l'aria. */
function emitRoofTech(padded: Uint8Array, writer: MicroGeometryWriter, cells: readonly number[]): boolean {
  for (const direction of LATERAL_FACES) {
    const edgeAxis = direction < 2 ? 0 : 1;
    const runAxis = edgeAxis === 0 ? 1 : 0;
    const positive = direction === FACE_PX || direction === FACE_PY;
    const offset = FACE_NEIGHBOUR_OFFSETS[direction];

    const has = (x: number, y: number, z: number): boolean => {
      const block = blockAt(padded, x, y, z);
      return block !== 0 &&
        blockSurface(block) === SURFACE_KIND.roofTech &&
        isExposed(padded, x, y, z, FACE_PZ) &&
        blockAt(padded, x + offset[0], y + offset[1], z) === 0;
    };

    if (!emitRuns(writer, cells, {
      runAxis,
      palette: PALETTE_SLOTS.metalDark,
      hiddenFace: FACE_NZ,
      has,
      box: (x, y, z, length) => {
        const base: [number, number, number] = [x * U, y * U, (z + 1) * U];
        const min: [number, number, number] = [base[0], base[1], base[2]];
        const max: [number, number, number] = [base[0] + U, base[1] + U, base[2] + 3];
        // Spesso 1/16, alto 3/16, rientrato 1/16 dal filo del tetto.
        min[edgeAxis] = base[edgeAxis] + (positive ? U - 2 : 1);
        max[edgeAxis] = base[edgeAxis] + (positive ? U - 1 : 2);
        max[runAxis] = base[runAxis] + length * U;
        return { min, max };
      },
    })) {
      return false;
    }
  }
  return true;
}

/** Cornice spessa e profonda 1/16 sul perimetro delle regioni luminose connesse. */
function emitLuminous(padded: Uint8Array, writer: MicroGeometryWriter, cells: readonly number[]): boolean {
  const luminous = SURFACE_KIND.luminous;
  for (const face of LATERAL_FACES) {
    for (const side of SIDES) {
      if (!emitRuns(writer, cells, verticalEdgeSpec(padded, luminous, face, side, 1, 1, PALETTE_SLOTS.glassPale))) {
        return false;
      }
    }

    // Traversi sopra e sotto la regione. Rientrano di 1/16 solo dove la corsa
    // finisce davvero: e' l'angolo con il montante, non un buco a meta' parete.
    for (const side of SIDES) {
      const vertical = side < 0 ? 0 : U - 1;
      if (!emitRuns(writer, cells, {
        runAxis: facadeHorizontalAxis(face),
        palette: PALETTE_SLOTS.glassPale,
        hiddenFace: oppositeFace(face),
        has: (x, y, z) => hasSurfaceFace(padded, x, y, z, luminous, face) &&
          !hasSurfaceFace(padded, x, y, z + side, luminous, face),
        box: (x, y, z, length, openStart, openEnd) => facadeBox(
          x,
          y,
          z,
          face,
          openStart ? 0 : 1,
          length * U - (openEnd ? 0 : 1),
          vertical,
          vertical + 1,
          1,
          inset(x, y, z, face),
        ),
      })) {
        return false;
      }
    }
  }
  return true;
}

/** Mensole orizzontali sui bordi delle terrazze o sui cambi di fascia. */
function emitHabitat(padded: Uint8Array, writer: MicroGeometryWriter, cells: readonly number[]): boolean {
  const habitat = SURFACE_KIND.habitat;
  for (const face of LATERAL_FACES) {
    if (!emitRuns(writer, cells, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.concreteLight,
      hiddenFace: oppositeFace(face),
      has: (x, y, z) => hasSurfaceFace(padded, x, y, z, habitat, face) &&
        !hasSurfaceFace(padded, x, y, z + 1, habitat, face),
      box: (x, y, z, length) => facadeBox(
        x, y, z, face, 0, length * U, U - 1, U, 3, inset(x, y, z, face),
      ),
    })) {
      return false;
    }
  }
  return true;
}

/** Nervature e lame verticali agli estremi delle campate di facciata. */
function emitFacadeClass(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  surface: SurfaceKind,
  width: number,
  depth: number,
  palette: number,
  cells: readonly number[],
): boolean {
  for (const face of LATERAL_FACES) {
    for (const side of SIDES) {
      if (!emitRuns(writer, cells, verticalEdgeSpec(padded, surface, face, side, width, depth, palette))) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Collarino e ago sulla sommita' di una colonna sottile.
 *
 * **L'aggancio e' la colonna isolata**, cioe' la cella scoperta in alto che non
 * ha nessun vicino in piano. E' la definizione geometrica di ciminiera, guglia,
 * gamba di gru, torre di controllo e antenna di coronamento: tutte cose che
 * fino a qui finivano su un quadrato piatto largo quanto il fusto, che a
 * distanza isometrica e' esattamente cio' che fa leggere un prisma come un
 * prisma. Il collarino sborda di 1/16 per lato e produce la riga d'ombra che
 * stacca la punta dal fusto; l'ago sopra da' alla colonna una fine invece di un
 * troncamento.
 *
 * Non ha tiro: dove sta e' interamente deciso dalla geometria, quindi e'
 * struttura e non prop — e sta in fondo alla struttura perche' fra tutte e' la
 * meno grave da perdere se il tetto dei quad arriva.
 */
function emitFinials(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[],
  surface: SurfaceKind,
  palette: number,
): boolean {
  const isTip = (x: number, y: number, z: number): boolean => {
    // L'ordine e' una scelta di costo: la scopertura in alto e' una lettura
    // sola e cade su ogni cella di parete, che sono la quasi totalita'.
    if (!isExposed(padded, x, y, z, FACE_PZ)) return false;
    const block = blockAt(padded, x, y, z);
    if (block === 0 || blockSurface(block) !== surface) return false;
    for (const face of LATERAL_FACES) {
      const offset = FACE_NEIGHBOUR_OFFSETS[face];
      if (blockAt(padded, x + offset[0], y + offset[1], z) !== 0) return false;
    }
    return true;
  };

  if (!emitPoints(writer, cells, {
    runAxis: 0,
    palette,
    hiddenFace: FACE_NZ,
    has: isTip,
    box: (x, y, z) => ({
      min: [x * U - 1, y * U - 1, (z + 1) * U],
      max: [(x + 1) * U + 1, (y + 1) * U + 1, (z + 1) * U + 2],
    }),
  })) {
    return false;
  }

  return emitPoints(writer, cells, {
    runAxis: 0,
    palette: PALETTE_SLOTS.metalBrass,
    hiddenFace: FACE_NZ,
    has: isTip,
    box: (x, y, z) => ({
      min: [x * U + 7, y * U + 7, (z + 1) * U + 2],
      max: [x * U + 9, y * U + 9, (z + 1) * U + 9],
    }),
  });
}

/**
 * Fascia sul bordo inferiore di un aggetto.
 *
 * **L'aggancio e' l'intradosso scoperto che finisce nel vuoto**: una cella con
 * aria sotto e aria di fianco e' il filo di uno sbalzo. Un braccio di gru, un
 * nastro trasportatore, l'impalcato di un viadotto e la fascia di un edificio
 * che cresce in fuori mostravano li' la faccia nuda del voxel, cioe' uno
 * spessore che a distanza non si legge; la fascia lo dichiara.
 *
 * Corre lungo lo sbalzo — un braccio intero costa un prisma per lato, non uno
 * per cella — ed e' per questo che si puo' permettere di stare nella struttura
 * invece che fra i prop.
 */
function emitSoffits(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[],
  surface: SurfaceKind,
  palette: number,
): boolean {
  for (const face of LATERAL_FACES) {
    const offset = FACE_NEIGHBOUR_OFFSETS[face];
    const normalAxis = face < 2 ? 0 : 1;
    const runAxis = facadeHorizontalAxis(face);
    const positive = face === FACE_PX || face === FACE_PY;

    if (!emitRuns(writer, cells, {
      runAxis,
      palette,
      // Il lato superiore della fascia e' contro l'intradosso che la regge.
      hiddenFace: FACE_PZ,
      has: (x, y, z) => {
        const block = blockAt(padded, x, y, z);
        return block !== 0 && blockSurface(block) === surface &&
          isExposed(padded, x, y, z, FACE_NZ) &&
          blockAt(padded, x + offset[0], y + offset[1], z) === 0;
      },
      box: (x, y, z, length) => {
        const min: [number, number, number] = [x * U, y * U, z * U - 3];
        const max: [number, number, number] = [(x + 1) * U, (y + 1) * U, z * U];
        const base = (normalAxis === 0 ? x : y) * U;
        min[normalAxis] = positive ? base + U - 2 : base;
        max[normalAxis] = positive ? base + U : base + 2;
        max[runAxis] = (runAxis === 0 ? x : y) * U + length * U;
        return { min, max };
      },
    })) {
      return false;
    }
  }
  return true;
}

// --- Prop: gli oggetti appesi all'edificio ---------------------------------
//
// Quello che separa questi dettagli da quelli sopra e' l'**aggancio**. Un
// montante, un architrave o un parapetto stanno dove la facciata cambia, e la
// loro posizione e' interamente decisa dalla geometria; un condizionatore o
// un'insegna stanno dove qualcuno li avrebbe messi, e la geometria da sola non
// lo dice. Qui l'aggancio e' un predicato — c'e' un ingresso sotto questa
// faccia? questa sommita' e' un arretramento o un coronamento? — e il seme
// sceglie soltanto *quale* cella lo porta, mai *se* l'aggancio esiste.
//
// **Vengono per ultimi, ed e' deliberato.** Sotto pressione di budget a cadere
// sono loro: una citta' senza tende resta leggibile, una senza parapetti no.

/** Quanto in basso si cerca l'ingresso per dire che una faccia guarda la strada. */
const FRONTAGE_REACH = 5;

/** Sopra questa quota di cella un prop da marciapiede non ha piu' senso. */
const FRONTAGE_TOP = 7;

/** Fin dove sale un rampicante: piu' su sarebbe un giardino verticale. */
const VINE_TOP = 11;

/**
 * Numero pseudocasuale in [0, 1) da coordinate di **mondo** e un sale.
 *
 * Non e' un PRNG con stato: due chunk adiacenti devono poter chiedere la stessa
 * cella e ottenere la stessa risposta, e un generatore a sequenza dipenderebbe
 * dall'ordine di visita. Il sale separa le domande — «qui c'e' un'insegna?» e
 * «qui c'e' un condizionatore?» non devono essere la stessa moneta.
 */
export function propRoll(origin: ChunkOrigin, x: number, y: number, z: number, salt: number): number {
  const h = hashCoords(hashCoords(salt, origin[0] + x, origin[1] + y), origin[2] + z, salt);
  return h / 4294967296;
}

/** true se questa faccia ha un ingresso sotto di se': e' cosi' che si legge il fronte strada. */
export function frontage(padded: Uint8Array, x: number, y: number, z: number, face: number): boolean {
  for (let d = 0; d <= FRONTAGE_REACH; d++) {
    if (z - d < -1) break;
    if (hasSurfaceFace(padded, x, y, z - d, SURFACE_KIND.portal, face)) return true;
  }
  return false;
}

/**
 * Facciata d'uso esposta su questa faccia, o `SURFACE_KIND.plain` se non c'e'.
 *
 * Restituisce la superficie invece di un booleano perche' e' cosi' che l'uso
 * sceglie il prop: una tenda e' da negozio, un condizionatore non sta sul fronte
 * di un civico. Il valore neutro e' `plain`, che nessuna facciata usa, cosi' il
 * confronto resta un intero e non un `null` da controllare a parte.
 */
export function facadeAt(padded: Uint8Array, x: number, y: number, z: number, face: number): number {
  const block = blockAt(padded, x, y, z);
  if (block === 0 || !isExposed(padded, x, y, z, face)) return SURFACE_KIND.plain;
  const surface = blockSurface(block);
  if (surface === SURFACE_KIND.habitat || surface === SURFACE_KIND.industrial ||
    surface === SURFACE_KIND.civic) {
    // Su un voxel d'acqua quei tre bit sono `WATER_CLASS`, non un linguaggio di
    // facciata: bassofondo e canale coincidono con `habitat` e `industrial`, e
    // senza questo controllo il mare esposto al bordo del mondo si metterebbe i
    // condizionatori. E' lo stesso riconoscimento che il fragment fa dalla
    // palette prima di leggere la superficie.
    return isWater(block) ? SURFACE_KIND.plain : surface;
  }
  return SURFACE_KIND.plain;
}

/** Riconosce l'acqua dalla palette, come il fragment. */
function isWater(block: number): boolean {
  const palette = blockPalette(block);
  return palette === PALETTE_SLOTS.water || palette === PALETTE_SLOTS.waterDeep;
}

/** Le tende stanno sui fronti abitati e commerciali, non su un capannone. */
function wantsAwning(surface: number): boolean {
  return surface === SURFACE_KIND.habitat;
}

/** Un'insegna a bandiera sta dove si entra: commercio e civico, non industria. */
function wantsSign(surface: number): boolean {
  return surface === SURFACE_KIND.habitat || surface === SURFACE_KIND.civic;
}

/** Il condizionatore sta dove c'e' qualcosa da raffreddare, e non sul civico. */
function wantsWallUnit(surface: number): boolean {
  return surface === SURFACE_KIND.habitat || surface === SURFACE_KIND.industrial;
}

/** Sommita' di tetto tecnico scoperta: e' l'aggancio di antenne, cassoni e fioriere. */
export function openRoof(padded: Uint8Array, x: number, y: number, z: number): boolean {
  const block = blockAt(padded, x, y, z);
  return block !== 0 && blockSurface(block) === SURFACE_KIND.roofTech &&
    isExposed(padded, x, y, z, FACE_PZ);
}

/**
 * Sommita' scoperta con tetto scoperto **tutt'attorno**.
 *
 * Antenne e chiome stanno in mezzo a un tetto, non sul suo filo: sul filo c'e'
 * gia' il parapetto di `emitRoofTech`, e una cornice larga un voxel non e' una
 * copertura su cui posare qualcosa. Toglie anche il caso in cui un prop
 * comparirebbe su una sporgenza che da lontano e' una linea.
 */
export function interiorRoof(padded: Uint8Array, x: number, y: number, z: number): boolean {
  for (const face of LATERAL_FACES) {
    const offset = FACE_NEIGHBOUR_OFFSETS[face];
    if (!openRoof(padded, x + offset[0], y + offset[1], z)) return false;
  }
  return true;
}

/** true se sopra un vicino laterale c'e' ancora volume: la sommita' e' un arretramento. */
export function underSetback(padded: Uint8Array, x: number, y: number, z: number): boolean {
  for (const face of LATERAL_FACES) {
    const offset = FACE_NEIGHBOUR_OFFSETS[face];
    if (blockAt(padded, x + offset[0], y + offset[1], z + 1) !== 0) return true;
  }
  return false;
}

/**
 * Tende e pensiline sul fronte strada.
 *
 * Corrono in orizzontale come le mensole di `emitHabitat`, ma solo dove sotto
 * c'e' un ingresso: e' la differenza fra una tenda da negozio e un marcapiano.
 */
function emitAwnings(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[][],
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    if (!emitRuns(writer, cells[i], {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.roofPale,
      hiddenFace: oppositeFace(face),
      // L'ordine dei predicati e' una scelta di costo, non di stile: `frontage`
      // e' l'unico che scandisce una colonna, e sta in fondo perche' ci arrivi
      // una cella su cento invece di tutte.
      has: (x, y, z) => z <= FRONTAGE_TOP &&
        wantsAwning(facadeAt(padded, x, y, z, face)) &&
        // Le serve aria davanti: sporge 5/16, e sotto un volume non ci sta.
        blockAt(padded, x + normal[0], y + normal[1], z) === 0 &&
        frontage(padded, x, y, z, face),
      box: (x, y, z, length) => facadeBox(
        x, y, z, face, 0, length * U, U - 4, U - 1, 5, inset(x, y, z, face),
      ),
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Insegne a bandiera: lame ortogonali alla facciata, sopra l'ingresso.
 *
 * Escono `luminous`, quindi di notte si accendono da sole passando dal ramo che
 * il fragment ha gia': un'insegna non e' un materiale nuovo, e' un prisma con
 * una palette esistente e il linguaggio giusto.
 */
function emitSigns(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    if (!emitPoints(writer, cells[i], {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.metalBrass,
      hiddenFace: oppositeFace(face),
      surface: SURFACE_KIND.luminous,
      has: (x, y, z) => z <= FRONTAGE_TOP && z >= 2 &&
        wantsSign(facadeAt(padded, x, y, z, face)) &&
        blockAt(padded, x + normal[0], y + normal[1], z) === 0 &&
        propRoll(origin, x, y, z, 0x51_6e) < 0.16 &&
        frontage(padded, x, y, z, face),
      // Sporge 8/16 e resta larga 2/16: e' una bandiera, non un pannello.
      box: (x, y, z) => facadeBox(x, y, z, face, 6, 8, 3, 12, 8, inset(x, y, z, face)),
    })) {
      return false;
    }
  }
  return true;
}

/** Condizionatori e cassoni tecnici: solo sulle facce che **non** guardano la strada. */
function emitWallUnits(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    if (!emitPoints(writer, cells[i], {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.metalDark,
      hiddenFace: oppositeFace(face),
      // Uno su cento, e non e' timidezza: e' la sola voce che pesca su **tutta**
      // la parete invece che su una giunzione, quindi la sua frequenza
      // moltiplica per l'area. A 0,09 valeva da sola piu' di tutto il dettaglio
      // strutturale del chunk; a 0,012 una facciata di quattordici per ventisei
      // ne porta ancora cinque.
      has: (x, y, z) => wantsWallUnit(facadeAt(padded, x, y, z, face)) &&
        blockAt(padded, x + normal[0], y + normal[1], z) === 0 &&
        propRoll(origin, x, y, z, 0x1a_c0) < 0.012 &&
        !frontage(padded, x, y, z, face),
      box: (x, y, z) => facadeBox(x, y, z, face, 4, 12, 4, 12, 3, inset(x, y, z, face)),
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Antenne e sfiati sul coronamento.
 *
 * Salgono oltre il voxel che le regge: l'AABB del chunk si allarga per
 * contenerle, che e' lo stesso caso gia' coperto dal parapetto in quota 32.
 */
function emitRoofMasts(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[],
  origin: ChunkOrigin,
): boolean {
  return emitPoints(writer, cells, {
    runAxis: 0,
    palette: PALETTE_SLOTS.metalDark,
    hiddenFace: FACE_NZ,
    has: (x, y, z) => openRoof(padded, x, y, z) &&
      propRoll(origin, x, y, z, 0x4d_a5) < 0.04 &&
      interiorRoof(padded, x, y, z),
    box: (x, y, z) => ({
      min: [x * U + 7, y * U + 7, roofBase(x, y, z)],
      max: [x * U + 9, y * U + 9, (z + 1) * U + 22],
    }),
  });
}

/**
 * Cassoni e fioriere sul bordo di un arretramento.
 *
 * L'aggancio e' la terrazza che la grammatica produce da sempre: la sommita'
 * scoperta di una fascia con ancora volume di fianco. Corrono lungo il bordo,
 * quindi una terrazza intera costa un prisma per lato e non uno per cella.
 *
 * **Il verde non costa un prisma in piu'.** Cassone tecnico e fioriera hanno la
 * stessa forma e cambiano solo slot di palette: e' la seconda meta' del tiro a
 * decidere quale delle due, quindi la terrazza si pianta senza emettere niente
 * che prima non emettesse.
 */
function emitTerraceBoxes(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[],
  origin: ChunkOrigin,
): boolean {
  for (const runAxis of [0, 1] as const) {
    const salt = runAxis === 0 ? 0x70_11 : 0x70_22;
    for (const planted of [false, true]) {
      if (!emitRuns(writer, cells, {
        runAxis,
        palette: planted ? PALETTE_SLOTS.grassDark : PALETTE_SLOTS.stoneWarm,
        hiddenFace: FACE_NZ,
        has: (x, y, z) => {
          if (!openRoof(padded, x, y, z)) return false;
          const roll = propRoll(origin, x, y, z, salt);
          if (roll >= 0.3) return false;
          // Due su tre sono verdi: una terrazza e' un giardino con qualche
          // cassone, non un vano tecnico con qualche pianta.
          if ((roll < 0.1) === planted) return false;
          return underSetback(padded, x, y, z);
        },
        box: (x, y, z, length) => {
          const min: [number, number, number] = [x * U + 3, y * U + 3, (z + 1) * U];
          const max: [number, number, number] = [x * U + 13, y * U + 13, (z + 1) * U + 6];
          max[runAxis] = (runAxis === 0 ? x : y) * U + (length - 1) * U + 13;
          return { min, max };
        },
      })) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Rampicanti: una corsa verticale sottile sulle facciate a nord e a est.
 *
 * **Il tiro non guarda la quota**, ed e' quello che li rende rampicanti invece
 * che macchie: con un tiro per cella la corsa si spezzerebbe a ogni voxel, e
 * `emitRuns` emetterebbe un prisma per cella invece di uno per colonna. Cosi'
 * una parete di dieci voxel costa cinque quad in tutto.
 *
 * Si fermano in basso perche' e' li' che un rampicante arriva: piu' su sarebbe
 * un giardino verticale, che e' un'altra cosa e la citta' non la costruisce.
 */
function emitVines(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  // Nord ed est: le prime e le terze voci di `LATERAL_FACES` sono +X e +Y.
  for (const i of [0, 2] as const) {
    const face = LATERAL_FACES[i];
    for (const side of SIDES) {
      const start = side < 0 ? 2 : U - 5;
      if (!emitRuns(writer, cells[i], {
        runAxis: 2,
        palette: PALETTE_SLOTS.grassDark,
        hiddenFace: oppositeFace(face),
        has: (x, y, z) => z <= VINE_TOP &&
          facadeAt(padded, x, y, z, face) !== SURFACE_KIND.plain &&
          propRoll(origin, x, y, 0, side < 0 ? 0x7e_11 : 0x7e_22) < 0.12,
        box: (x, y, z, length) => facadeBox(
          x, y, z, face, start, start + 3, 0, length * U, 2, inset(x, y, z, face),
        ),
      })) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Chiome sui tetti scoperti: il giardino pensile visto da fuori.
 *
 * Sta sui coronamenti piatti e non sugli arretramenti, dove il bordo lo occupano
 * gia' fioriere e cassoni. E' l'unico prop piu' largo della cella che lo regge:
 * una chioma stretta quanto un voxel non legge come chioma.
 */
function emitRoofCrowns(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[],
  origin: ChunkOrigin,
): boolean {
  return emitPoints(writer, cells, {
    runAxis: 0,
    palette: PALETTE_SLOTS.grassLight,
    hiddenFace: FACE_NZ,
    has: (x, y, z) => openRoof(padded, x, y, z) &&
      propRoll(origin, x, y, z, 0x6c_ea) < 0.05 &&
      interiorRoof(padded, x, y, z),
    box: (x, y, z) => ({
      min: [x * U + 1, y * U + 1, roofBase(x, y, z)],
      max: [x * U + 15, y * U + 15, (z + 1) * U + 7],
    }),
  });
}

/**
 * Pilastrino d'angolo a piano terra.
 *
 * L'angolo d'isolato e' la cella che espone **due** facce ortogonali della
 * stessa facciata: e' l'unico punto in cui due fronti si incontrano, e a terra
 * e' dove sta il cantonale.
 */
function emitCornerPosts(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: readonly number[][],
): boolean {
  // Le prime due voci di `LATERAL_FACES` sono +X e -X: il pilastrino si appoggia
  // a una di quelle e guarda l'angolo con la faccia in y.
  for (let i = 0; i < 2; i++) {
    const face = LATERAL_FACES[i];
    for (const lateral of [FACE_PY, FACE_NY] as const) {
      const side = lateral === FACE_PY ? 1 : -1;
      const start = side > 0 ? U - 3 : 0;
      if (!emitRuns(writer, cells[i], {
        runAxis: 2,
        palette: PALETTE_SLOTS.stoneDark,
        hiddenFace: oppositeFace(face),
        has: (x, y, z) => {
          if (z > FRONTAGE_TOP) return false;
          const own = facadeAt(padded, x, y, z, face);
          // Le due facce devono essere **la stessa** facciata: due usi che si
          // toccano sono due edifici, e li' non c'e' un cantonale ma un giunto.
          return own !== SURFACE_KIND.plain && facadeAt(padded, x, y, z, lateral) === own;
        },
        box: (x, y, z, length) => facadeBox(
          x, y, z, face, start, start + 3, 0, length * U, 3, inset(x, y, z, face),
        ),
      })) {
        return false;
      }
    }
  }
  return true;
}

/**
 * I prop di facciata, su celle gia' filtrate per faccia esposta.
 *
 * L'uso non moltiplica le passate: entra nel predicato (`wantsAwning` e
 * compagni). Cosi' ogni cella di facciata viene letta cinque volte in tutto —
 * una per emettitore — invece di venti, e le celle interne di un edificio pieno
 * non vengono lette affatto.
 */
function emitFacadeProps(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  if (!emitAwnings(padded, writer, facade)) return false;
  if (!emitSigns(padded, writer, facade, origin)) return false;
  if (!emitWallUnits(padded, writer, facade, origin)) return false;
  if (!emitCornerPosts(padded, writer, facade)) return false;
  return emitVines(padded, writer, facade, origin);
}

/**
 * Accoda i dettagli in priorita' stabile. Restituisce i quad effettivamente
 * emessi; il writer interrompe l'intera sequenza prima di superare il limite.
 */
export function appendMicroGeometry(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  marks: Uint8Array,
  cells: SurfaceCells,
  origin: ChunkOrigin = ORIGIN_ZERO,
): number {
  const initial = writer.remainingQuads;
  // Da qui in giu' ogni prisma di facciata sa di quanto la sua parete e'
  // arretrata. Vedi la nota su `carves`.
  carves = marks;
  // La scansione la fa `greedyMesh` prima del greedy pass, perche' il piano
  // degli scavi ne ha bisogno **prima**. Rifarla qui sarebbe la stessa passata
  // due volte.
  const { bySurface, facadeByFace } = cells;
  if (!emitPortals(padded, writer, bySurface[SURFACE_KIND.portal])) return initial - writer.remainingQuads;
  if (!emitRoofTech(padded, writer, bySurface[SURFACE_KIND.roofTech])) return initial - writer.remainingQuads;
  if (!emitLuminous(padded, writer, bySurface[SURFACE_KIND.luminous])) return initial - writer.remainingQuads;
  if (!emitHabitat(padded, writer, bySurface[SURFACE_KIND.habitat])) return initial - writer.remainingQuads;
  if (!emitFacadeClass(
    padded,
    writer,
    SURFACE_KIND.industrial,
    2,
    2,
    PALETTE_SLOTS.metalRust,
    bySurface[SURFACE_KIND.industrial],
  )) {
    return initial - writer.remainingQuads;
  }
  if (!emitFacadeClass(
    padded,
    writer,
    SURFACE_KIND.civic,
    1,
    3,
    PALETTE_SLOTS.concreteWhite,
    bySurface[SURFACE_KIND.civic],
  )) {
    return initial - writer.remainingQuads;
  }

  // Coda della struttura: finiali e fasce di sbalzo valgono su tutte e due le
  // facciate d'uso costruite, quindi si pagano due liste a testa. Stanno qui e
  // non piu' in alto perche' fra la struttura sono le prime a poter cadere: una
  // guglia senza punta resta una guglia, una facciata senza montanti no.
  const finials: readonly [SurfaceKind, number][] = [
    [SURFACE_KIND.civic, PALETTE_SLOTS.concreteWhite],
    [SURFACE_KIND.industrial, PALETTE_SLOTS.metalDark],
  ];
  for (const [surface, palette] of finials) {
    if (!emitFinials(padded, writer, bySurface[surface], surface, palette)) {
      return initial - writer.remainingQuads;
    }
  }
  for (const [surface, palette] of finials) {
    if (!emitSoffits(padded, writer, bySurface[surface], surface, palette)) {
      return initial - writer.remainingQuads;
    }
  }

  // Da qui in giu' sono oggetti, non struttura: se il tetto arriva, cadono loro.
  if (!emitFacadeProps(padded, writer, facadeByFace, origin)) return initial - writer.remainingQuads;
  // Il vocabolario maturo segue i prop storici: balconi, davanzali, lesene e
  // pinne sono oggetti quanto le tende, e sotto pressione cadono prima del
  // retro — ma dopo i prop di sempre, che sono il secondo sguardo di base.
  if (!appendFacadeDetail(padded, writer, cells, origin)) return initial - writer.remainingQuads;
  const roofs = bySurface[SURFACE_KIND.roofTech];
  if (!emitRoofMasts(padded, writer, roofs, origin)) return initial - writer.remainingQuads;
  if (!emitRoofCrowns(padded, writer, roofs, origin)) return initial - writer.remainingQuads;
  if (!emitTerraceBoxes(padded, writer, roofs, origin)) return initial - writer.remainingQuads;
  // Le combinazioni di tetto chiudono i prop: vasche e gruppi HVAC sono l'ultima
  // voce del campionario prima del retro, che resta il primo a cadere.
  if (!appendRoofDetail(padded, writer, roofs, origin, marks)) {
    return initial - writer.remainingQuads;
  }
  // Il dettaglio del retro chiude la sequenza: e' l'ultimo a comparire e il primo
  // a cadere. Vive in `microStreet.ts` — un file suo, perche' questo e' gia'
  // oltre il budget di righe della cartella.
  appendStreetDetail(padded, writer, facadeByFace, roofs, origin, marks);
  return initial - writer.remainingQuads;
}

