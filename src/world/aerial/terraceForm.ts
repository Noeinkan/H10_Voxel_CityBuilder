import { AERIAL } from './config';
import type { DeckRect } from './deckPlan';

/**
 * La forma di una mensola: che pezzo di fronte occupa, quanto sporge, come si
 * termina verso la punta.
 *
 * **Esiste perche' la mensola aveva una forma sola.** `overhangOf` legava lo
 * sporto alla lunghezza della corsa, e dentro i due estremi quella riga e'
 * l'identita': ogni fronte fra tre e otto voxel — cioe' tutti, con
 * `MAX_FOOTPRINT` a otto — dava un **quadrato**. Quattro mensole su una citta'
 * erano quattro volte lo stesso oggetto in pianta.
 *
 * **Pura come le altre regole di questo dominio.** Entrano una lunghezza e un
 * seme, o un riquadro e una colonna; esce un numero o un booleano. Nessun mondo,
 * nessun registry, nessun voxel: la pianta la usa `terracePlan`, la sezione la
 * usa `generate`, e le due non si conoscono fra loro.
 *
 * **Il seme non e' un tiro di dado.** E' un hash di ospite, faccia e quota, cioe'
 * di cose che non cambiano: la stessa citta' con lo stesso seme rida' la stessa
 * mensola, che e' il patto di tutto `src/world/`.
 *
 * ```
 *      pianta                          sezione (parete a sinistra)
 *   ┌──────────╮   angolo smussato    ░░░░░░░░░░  piano
 *   │          │                      ██▓▓▓▓▓▓·   trave alta: il filo, meno la punta
 *   │  parete  │   corsa              ██·······   trave bassa: solo presso la parete
 *   └──────────╯
 * ```
 */

/** Il verso in cui una mensola esce dalla facciata. */
export interface TerraceSide {
  /** 0 se sporge lungo x, 1 se lungo y. */
  readonly axis: 0 | 1;
  /** +1 se sporge verso le coordinate crescenti. */
  readonly outward: 1 | -1;
}

/** Il riquadro in pianta che una corsa di parete porta. */
export interface TerraceShape {
  /** Voxel di corsa occupati: mai piu' della corsa. */
  readonly length: number;
  /** Voxel oltre il filo della parete. */
  readonly overhang: number;
  /** Di quanto il riquadro scorre dal capo basso della corsa. */
  readonly shift: number;
}

/**
 * Lo sporto di riferimento di una corsa larga `run`.
 *
 * **Quanto e' larga, tanto e' profonda**, dentro i due estremi. Era il risultato,
 * ed e' rimasta la misura: `terraceShape` la piega per ciascuna forma invece di
 * consegnarla tale e quale. Una facciata da quattro porta ancora un balcone e una
 * da otto una terrazza vera — e quella, oltre `AERIAL.reach`, si ritrova le
 * proprie gambe.
 */
export function overhangOf(run: number): number {
  return Math.min(AERIAL.terrace.maxOverhang, Math.max(AERIAL.terrace.minOverhang, run));
}

/**
 * Il riquadro che una corsa porta, nella forma che le tocca.
 *
 * La forma la sceglie il seme fra le quattro di `AERIAL.terrace.forms`; le
 * proporzioni le detta la corsa. Ne segue che un fronte corto continua a dare
 * quattro varianti quasi uguali — non c'e' spazio per altro — e un fronte da otto
 * ne da' quattro davvero diverse, che e' dove la varieta' si vede.
 */
export function terraceShape(run: number, seed: number): TerraceShape {
  const { forms, minRun } = AERIAL.terrace;
  const form = forms[seed % forms.length];

  const length = clamp(Math.round(run * form.run), Math.min(run, minRun), run);
  const overhang = clamp(
    Math.round(overhangOf(run) * form.depth),
    AERIAL.terrace.minOverhang,
    AERIAL.terrace.maxOverhang,
  );
  return { length, overhang, shift: Math.round((run - length) * form.align) };
}

/**
 * Da che parte sta la parete, dato il riquadro e l'ancoraggio a cui e' appeso.
 *
 * Si ricava dall'ancoraggio invece di portarsi dietro la faccia: `generate` riceve
 * un `DeckPlan`, che e' la lingua comune delle tre forme in quota, e la faccia e'
 * un concetto della sola mensola. L'ancoraggio di una mensola e' una striscia di
 * parete larga un voxel, quindi il lato corto dice l'asse e il segno della
 * differenza dice il verso.
 */
export function terraceSide(rect: DeckRect, anchor: DeckRect): TerraceSide {
  const axis = anchor.sizeX <= anchor.sizeY ? 0 : 1;
  const outward = axis === 0
    ? (rect.x > anchor.x ? 1 : -1)
    : (rect.y > anchor.y ? 1 : -1);
  return { axis, outward };
}

/**
 * Quanto smusso tocca a questo riquadro.
 *
 * Mai piu' di un terzo del lato piu' corto: su una mensola grande e' lo smusso
 * dichiarato, su un balcone da tre voxel si riduce a uno — che e' ancora un
 * angolo tagliato, mentre due su tre sarebbero mezzo balcone.
 */
export function cornerCutOf(rect: DeckRect): number {
  return Math.min(
    AERIAL.terrace.cornerCut,
    Math.floor(Math.min(rect.sizeX, rect.sizeY) / 3),
  );
}

/**
 * true se questa colonna cade in un angolo smussato, cioe' **fuori** dalla
 * mensola.
 *
 * Solo i due angoli lontani dalla parete: gli altri due stanno contro la
 * facciata, dove uno smusso non lo vedrebbe nessuno e lascerebbe un buco fra il
 * piano e il muro.
 */
export function chamfered(
  rect: DeckRect,
  side: TerraceSide,
  cut: number,
  gx: number,
  gy: number,
): boolean {
  if (cut <= 0) return false;
  const outer = depthOf(rect, side) - 1 - reachOf(rect, side, gx, gy);
  const along = alongOf(rect, side, gx, gy);
  const lateral = Math.min(along, spanOf(rect, side) - 1 - along);
  return outer + lateral < cut;
}

/**
 * true se la colonna sta sul filo della mensola.
 *
 * Si guarda la sagoma **smussata**, non il riquadro: senza, il parapetto
 * correrebbe lungo uno spigolo che non c'e' piu' e si interromperebbe sulla
 * diagonale. Il filo contro la parete rientra nel conto e non e' un errore —
 * `emitRoofTech` emette il parapetto solo dove un tetto tecnico confina con
 * l'aria, e li' confina con il muro.
 */
export function terraceEdge(
  rect: DeckRect,
  side: TerraceSide,
  cut: number,
  gx: number,
  gy: number,
): boolean {
  if (chamfered(rect, side, cut, gx, gy)) return false;
  for (const [ox, oy] of NEIGHBOURS) {
    const nx = gx + ox;
    const ny = gy + oy;
    if (!inRect(rect, nx, ny)) return true;
    if (chamfered(rect, side, cut, nx, ny)) return true;
  }
  return false;
}

/** I quattro vicini ortogonali, per chi cerca il filo di una sagoma. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Quanto la colonna e' lontana dalla parete: zero sul filo che la tocca. */
function reachOf(rect: DeckRect, side: TerraceSide, gx: number, gy: number): number {
  return side.axis === 0
    ? (side.outward > 0 ? gx - rect.x : rect.x + rect.sizeX - 1 - gx)
    : (side.outward > 0 ? gy - rect.y : rect.y + rect.sizeY - 1 - gy);
}

/** Profondita' della mensola: il lato lungo l'asse dello sporto. */
function depthOf(rect: DeckRect, side: TerraceSide): number {
  return side.axis === 0 ? rect.sizeX : rect.sizeY;
}

/** Larghezza della mensola: il lato lungo la corsa di parete. */
function spanOf(rect: DeckRect, side: TerraceSide): number {
  return side.axis === 0 ? rect.sizeY : rect.sizeX;
}

/** Posizione della colonna lungo la corsa, zero al capo basso. */
function alongOf(rect: DeckRect, side: TerraceSide, gx: number, gy: number): number {
  return side.axis === 0 ? gy - rect.y : gx - rect.x;
}

function inRect(rect: DeckRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.sizeX && y >= rect.y && y < rect.y + rect.sizeY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
