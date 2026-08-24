import { PADDED_VOL, paddedIdx } from '../chunkCoords';
import { packVisualBlock, type SurfaceKind } from '../visualBlock';
import { appendCarveDetail } from '../../engine/mesher/carveGeometry';
import { planCarves } from '../../engine/mesher/carvePlan';
import {
  appendMicroGeometry,
  MAX_DETAIL_QUADS_PER_CHUNK,
  type ChunkOrigin,
  type FixedBox,
  type MicroGeometryWriter,
} from '../../engine/mesher/microGeometry';
import {
  CELL_FOOTPRINT,
  CELL_HEIGHT,
  cellSolidAt,
  matrixCellRect,
  SWATCH,
  SWATCH_COLUMNS,
} from './swatchLayout';

/**
 * Quanti prismi di dettaglio emette una cella del campionario.
 *
 * **Esiste perche' la domanda non si puo' fare a occhio.** Il campionario serve a
 * riconoscere un linguaggio che sta emettendo poco, e a distanza isometrica venti
 * prismi e sessanta si somigliano; peggio, una famiglia di emettitori spenta del
 * tutto — `emitRoofMasts` prima del cortile, per dire — non lascia nessuna
 * traccia da guardare. Il numero sotto il cursore la fa cadere subito.
 *
 * **Rimisura invece di ricordare.** Passa `appendMicroGeometry` vero con un
 * writer che conta al posto di scrivere, quindi non c'e' una tabella scritta a
 * mano che possa restare indietro rispetto agli emettitori. Il conto dei quad e'
 * lo stesso di `greedyMesher`: sei facce meno quelle nascoste.
 *
 * **Misura il provino in isolamento**, e questa e' l'unica differenza dal mesher.
 * Le coordinate di mondo sono quelle vere — `propRoll` estrae percio' gli stessi
 * tiri, e tende, tubi e rampicanti cadono dove cadono davvero — ma dove una cella
 * scavalca un confine di chunk il conto vero si divide in due pezzi, uno per
 * lato, e la somma puo' differire di qualche prisma per le testate.
 *
 * Non importa il renderer: `microGeometry.ts` e' TypeScript puro sul volume
 * paddato, come `paletteSlots` che `swatchLayout.ts` legge gia'.
 */

export interface SwatchDetail {
  /** Prismi emessi, cioe' chiamate a `emitBox`. */
  readonly prisms: number;
  /** Quad che ne escono: sei facce meno quelle nascoste, come nel mesher. */
  readonly quads: number;
}

/**
 * Margine di volume attorno al provino.
 *
 * Due celle e non una: gli emettitori leggono un vicino in ogni direzione, e la
 * corsia di padding del volume 34^3 e' gia' impegnata a rappresentare il chunk
 * accanto. Con un margine di due, quel che si legge dentro la cella non dipende
 * da dove finisce il buffer.
 */
const PROBE_MARGIN = 2;

/** Un referto per cella; la sagoma e' identica ovunque, il seme dei prop no. */
const measured = new Map<number, SwatchDetail>();

/**
 * Prismi e quad di dettaglio della cella `(row, col)`.
 *
 * La colonna zero non ha voxel — palette zero e' il vuoto — quindi restituisce
 * zero senza comporre niente.
 */
export function cellDetail(row: number, col: number): SwatchDetail {
  const key = row * SWATCH_COLUMNS + col;
  const cached = measured.get(key);
  if (cached !== undefined) return cached;

  const detail = col <= 0 ? { prisms: 0, quads: 0 } : measure(row, col);
  measured.set(key, detail);
  return detail;
}

/**
 * Prismi e quad di dettaglio che un volume paddato qualunque produce.
 *
 * **Conta invece di scrivere**, ed e' l'unica differenza dal writer di
 * `greedyMesher`: stessa sequenza di emettitori, stesso ordine, stesso tetto,
 * stessa aritmetica dei quad — sei facce meno quelle nascoste. Sta qui e non in
 * un test perche' la usano in due, la sonda della cella e il controllo del tetto
 * per chunk, e due copie direbbero due numeri diversi al primo ritocco.
 *
 * Gli scavi passano per primi come nel mesher, e per la stessa ragione: la loro
 * faccia base e' gia' soppressa, quindi non possono cadere. Manca solo il
 * dettaglio della copertura del terreno (`coverDetail.ts`), e non per scelta:
 * nel campionario non c'e' un marcatore d'erba, quindi vale zero.
 */
export function countDetail(padded: Uint8Array, origin: ChunkOrigin): SwatchDetail {
  let prisms = 0;
  let quads = 0;
  const writer: MicroGeometryWriter = {
    get remainingQuads(): number {
      return MAX_DETAIL_QUADS_PER_CHUNK - quads;
    },
    emitBox(_box: FixedBox, _palette: number, hiddenFaces: number): boolean {
      const faces = 6 - countBits(hiddenFaces & 0b11_1111);
      if (faces > MAX_DETAIL_QUADS_PER_CHUNK - quads) return false;
      prisms++;
      quads += faces;
      return true;
    },
  };

  // La maschera degli scavi e' nuova a ogni chiamata, quindi non c'e' un
  // `clearCarves` da fare: il pool del mesher la riusa, la sonda no.
  const marks = new Uint8Array(PADDED_VOL);
  const carves = planCarves(padded, marks, origin);
  appendCarveDetail(padded, marks, writer, carves);
  appendMicroGeometry(padded, writer, marks, origin);
  return { prisms, quads };
}

function measure(row: number, col: number): SwatchDetail {
  const rect = matrixCellRect(row, col);
  // L'origine e' quella vera meno il margine: `propRoll` somma origine e
  // coordinata locale, quindi cosi' ogni cella risponde con il tiro che il mesher
  // le ha davvero estratto.
  return countDetail(
    compose(col, row as SurfaceKind),
    [rect.x0 - PROBE_MARGIN, rect.y0 - PROBE_MARGIN, 0],
  );
}

/**
 * Il provino in un volume paddato, con sotto la sua fetta di basamento.
 *
 * Il basamento non e' contorno: senza, il livello zero del podio avrebbe aria
 * sotto e `emitSoffits` ci troverebbe un intradosso che nel campionario non
 * esiste. E' `plain`, quindi non emette niente per conto proprio.
 */
function compose(palette: number, surface: SurfaceKind): Uint8Array {
  const padded = new Uint8Array(PADDED_VOL);
  const span = CELL_FOOTPRINT + PROBE_MARGIN * 2;
  const block = packVisualBlock(palette, surface);
  const plinth = packVisualBlock(SWATCH.plinthSlot);

  for (let y = 0; y < span; y++) {
    for (let x = 0; x < span; x++) {
      for (let z = 0; z < SWATCH.groundZ; z++) padded[paddedIdx(x + 1, y + 1, z + 1)] = plinth;
    }
  }

  for (let level = 0; level < CELL_HEIGHT; level++) {
    for (let ly = 0; ly < CELL_FOOTPRINT; ly++) {
      for (let lx = 0; lx < CELL_FOOTPRINT; lx++) {
        if (!cellSolidAt(lx, ly, level)) continue;
        const px = lx + PROBE_MARGIN + 1;
        const py = ly + PROBE_MARGIN + 1;
        padded[paddedIdx(px, py, SWATCH.groundZ + level + 1)] = block;
      }
    }
  }
  return padded;
}

function countBits(value: number): number {
  let bits = 0;
  for (let v = value; v !== 0; v >>>= 1) bits += v & 1;
  return bits;
}
