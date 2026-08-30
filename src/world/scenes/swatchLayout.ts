import { PALETTE_SIZE, PALETTE_SLOT_NAMES } from '../../engine/paletteSlots';
import { BIOME_NAMES, TERRAIN } from '../terrain/config';
import { TREE_SHAPES } from '../terrain/flora';
import { SURFACE_KIND_NAMES, WATER_CLASS } from '../visualBlock';
import { clearanceBehind } from './swatchOcclusion';

/**
 * Dove sta ogni cosa nel campionario dei voxel, e con quali numeri.
 *
 * **Puro e senza mondo**, come `inspect.ts` lo e' rispetto a `InspectView.ts`:
 * qui c'e' la geometria, in `swatchScene.ts` c'e' chi la scrive. Sono separati
 * perche' questa meta' ha tre consumatori diversi — il generatore, l'inquadratura
 * di `main.ts` e il referto sotto il cursore — e due letture della stessa griglia
 * divergerebbero al primo ritocco.
 *
 * **Le dimensioni si ricavano dalle tabelle, mai da un letterale.** Le colonne
 * sono `PALETTE_SIZE` e le righe sono quante ne ha `SURFACE_KIND`: uno slot o un
 * linguaggio nuovo allarga la griglia da se' invece di restare fuori dal
 * campionario, che e' esattamente il difetto che questa scena esiste per
 * rendere impossibile.
 */

/** Rettangolo in pianta, estremo massimo escluso. */
export interface SwatchRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const SWATCH_BAND = {
  matrix: 'matrix',
  strata: 'strata',
  scale: 'scale',
} as const;

export type SwatchBand = (typeof SWATCH_BAND)[keyof typeof SWATCH_BAND];

export const SWATCH = {
  /** Prima quota scritta dai soggetti; sotto c'e' il basamento. */
  groundZ: 2,

  /** Slot del basamento: neutro, e `plain` perche' non deve emettere dettaglio. */
  plinthSlot: 4,

  /** Bordo di basamento attorno ai soggetti: il piano di lettura, non un margine estetico. */
  plinthMargin: 3,

  /**
   * Bordo vuoto riservato attorno al campionario, per muoversi liberamente.
   *
   * Il pan da tastiera e' vincolato all'AABB dei chunk esistenti piu' un piccolo
   * margine, e il campionario dichiara un ingombro appena piu' largo del proprio
   * contenuto: senza un bordo vuoto la camera non riesce ad allontanarsi dalla
   * griglia. Riservare questi chunk vuoti allarga la superficie su cui ci si
   * muove senza aggiungere geometria — il mesher li scarta perche' vuoti, e non
   * entrano ne' nel conteggio dei solidi ne' in quello delle mesh.
   *
   * Tre chunk per lato (~96 voxel) raddoppiano all'incirca la superficie
   * camminabile: e' il respiro che serve a giudicare un provino guardandolo da
   * fuori invece che standoci sopra.
   */
  walkMargin: 96,

  /**
   * Il bordo sul lato sud-ovest, la direzione in cui muove il tasto `W`.
   *
   * `W` allontana l'inquadratura dal campionario, ed e' il passo con cui si
   * indietreggia per tenere in campo un soggetto per intero. Una megastruttura
   * alta quanto un'arcologia chiede piu' strada di una cella della matrice:
   * qui il bordo raddoppia, cosi' si puo' arretrare abbastanza da non farla
   * uscire dall'inquadratura. Lo consuma `reserveWalkArea`, che lo applica ai
   * lati `minX` e `minY` — ovest e sud, dove `W` porta a yaw di riposo.
   */
  walkBackMargin: 192,

  // --- Matrice palette x superficie -----------------------------------------

  /**
   * Interasse fra due celle della matrice.
   *
   * **Non e' spaziatura a gusto: e' l'occlusione**, e il conto sta in
   * `swatchOcclusion.ts`: la fila davanti ne nasconde `CELL_HEIGHT` meno il
   * vuoto libero, cioe' meno `cellPitch - CELL_FOOTPRINT`. Con interasse pari
   * all'impronta sparirebbe il provino intero, ed e' cosi' che una griglia di
   * prismi distinti si legge come una massa unica.
   *
   * A dodici contro un'altezza di nove e un'impronta di sette ne restano
   * nascosti quattro, e sopra il quarto c'e' `CELL_LEDGE`: tutto cio' che la
   * microgeometria produce sta piu' in alto. **Questa e' l'unica fascia del
   * campionario che accetta di nascondere qualcosa**, perche' le sue duecento
   * celle hanno tutte la stessa sagoma e sotto quel filo non c'e' niente da
   * distinguere; le gallerie, dove ogni soggetto e' diverso, si scoprono per
   * intero.
   *
   * Alzarlo ancora costa in fretta, perche' `frameRegion` inquadra sulla
   * diagonale e la larghezza dell'inquadratura cresce con `sizeX + sizeY`: ogni
   * voxel di interasse si paga trentuno volte in x e sette in y. E' anche il
   * vincolo che tiene l'impronta a sette: `cellPitch` deve restarle sopra.
   */
  cellPitch: 12,

  /** Vuoto minimo fra una fascia e la successiva; l'occlusione puo' chiederne di piu'. */
  bandGap: 10,

  // --- Stratigrafia ---------------------------------------------------------

  pillarSide: 4,
  pillarPitch: 6,

  /**
   * Altezza di un pilastro di stratigrafia, multipla di `TERRAIN.cellSize`.
   *
   * Deve superare `STRATA_DEPTH.subsoil` — superficie piu' sottosuolo — o il
   * fondo non comparirebbe e il taglio mostrerebbe due strati invece di tre.
   */
  pillarHeight: 16,

  /** Quota del fondale nei pilastri d'acqua: sopra c'e' solo acqua. */
  waterFloor: 6,

  /** Distacco fra i sei biomi e i tre specchi d'acqua. */
  waterGap: 6,

  // --- Fascia di scala ------------------------------------------------------

  /** Distacco fra i tre soggetti della fascia di scala. */
  scaleGap: 8,

  /** Interasse fra due alberi: `TREE_DECOR.cellSize`, cioe' il loro passo vero. */
  treePitch: 12,

  /** Gradini di cella di terreno accanto al cubo singolo. */
  stairSteps: 3,

  /**
   * L'edificio di riferimento.
   *
   * Livello quattro e tipologia forzata per id, perche' senza citta' intorno
   * `selectTypology` puo' solo ripiegare e il ripiego cambierebbe insieme al
   * catalogo. Misurato, lo stamp e' 8 x 8 x 30: sta dentro la riserva qui sotto,
   * e il test lo verifica invece di fidarsi.
   */
  referenceTypology: 'terracedHousing',
  referenceLevel: 4,
  referenceSpan: 12,
  referenceHeight: 36,
} as const;

/**
 * Un pezzo del provino: un quadrato **centrato** nell'impronta, in un tratto di
 * quota, eventualmente svuotato.
 *
 * La quota di partenza e' esplicita e non implicita nell'ordine, perche' due
 * pezzi devono poter stare **alla stessa quota**: una corona cava e i pinnacoli
 * che le crescono accanto sono lo stesso piano, e una pila sequenziale non sa
 * dirlo.
 *
 * I tre modificatori sono tutti invarianti per rotazione di 90 gradi, ed e' la
 * proprieta' che tiene in piedi il contratto della sagoma (vedi `CELL_PARTS`).
 */
export interface SwatchPart {
  /** Quota di partenza sopra `SWATCH.groundZ`. */
  readonly z0: number;
  readonly levels: number;
  /** Lato del quadrato. L'arretramento si ricava: la pianta e' sempre centrata. */
  readonly side: number;
  /** Lato del vuoto centrale; assente vale pieno. */
  readonly hole?: number;
  /** Blocco d'angolo tolto: su un quadrato pieno e' una croce, su un anello lo spezza. */
  readonly notch?: number;
  /** Solo le quattro celle d'angolo del quadrato. */
  readonly corners?: boolean;
}

/**
 * La sagoma di un provino della matrice — **la stessa in tutte e 248 le celle**.
 *
 * Identica ovunque perche' e' l'unico modo di far variare una cosa sola: se
 * cambiasse anche la forma, due celle vicine non sarebbero piu' confrontabili e
 * il campionario smetterebbe di rispondere alla domanda per cui esiste.
 *
 * **Non e' un prisma perche' un prisma non racconta niente al mesher.** La
 * microgeometria emette dove il volume glielo dice, e su un parallelepipedo
 * isolato con la sommita' piatta quattro famiglie di `microGeometry.ts` non
 * possono scattare affatto. I quattro pezzi sono la sagoma che le produce tutte:
 *
 * | pezzo | pianta | cosa dichiara al mesher |
 * | --- | --- | --- |
 * | podio, smussato | 5 con gli angoli tolti | regge lo sbalzo e gli lascia l'aria sotto; ogni angolo tolto e' un angolo interno in piu' |
 * | sbalzo, a filo | 7 pieno | intradosso scoperto sui quattro lati: **fasce di sbalzo** |
 * | corona, quattro lame | anello 7 spezzato agli angoli | la sommita' sotto ha volume di fianco: **fioriere e cassoni**; il cortile 5x5 che circonda e' la prima **sommita' con quattro vicini scoperti** del campionario |
 * | pinnacoli | le quattro celle d'angolo | nessun vicino in piano, a **tutte** le quote: **collarino e ago**, piu' otto nervature a testa |
 *
 * **Il cortile e' la novita' che si vede.** `emitRoofMasts`, `emitRoofCrowns` e
 * `emitPergolas` chiedono `interiorRoof`, cioe' una sommita' scoperta con tutti
 * e quattro i vicini scoperti: sulla vecchia sagoma il tetto piu' largo era un
 * anello di spessore uno, e nessuna delle tre poteva scattare. Qui la sommita'
 * dello sbalzo resta scoperta su 33 celle, e 13 di quelle hanno i quattro
 * vicini liberi.
 *
 * **`notch` sulla corona non e' decorazione**: toglie all'anello proprio le
 * celle che toccherebbero i pinnacoli, ed e' cio' che li rende colonne isolate
 * per tutta la loro altezza invece che soltanto in punta.
 *
 * In piu' ogni cambio di pianta spezza le corse verticali, quindi montanti,
 * traversi, architravi, mensole e parapetti si moltiplicano invece di comparire
 * una volta sola in cima.
 *
 * **Misurato con `swatchProbe.ts`**, prismi per provino, sagoma vecchia a
 * gradoni contro questa. Le prime due colonne sono la sola microgeometria, cioe'
 * quel che questa sagoma cambia da sola; la terza e' il totale che il referto
 * mostra oggi, scavi compresi.
 *
 * | linguaggio | gradoni | qui | con gli scavi |
 * | --- | --- | --- | --- |
 * | habitat | 47 | 119 | 137 |
 * | industrial | 70 | 170 | 204 |
 * | civic | 68 | 178 | 212 |
 * | luminous | 64 | 176 | 304 |
 * | portal | 60 | 180 | 308 |
 * | roofTech | 21 | 61 | 77 |
 *
 * `roofTech` resta il piu' magro, e non e' un difetto della sagoma: quel
 * linguaggio ha meno emettitori degli altri. Ma e' l'unico che e' passato da
 * **zero** chiome e **zero** pergole ad averne, ed e' la misura che dice che il
 * cortile fa il suo mestiere. `plain` e `utility` restano a zero, come devono.
 *
 * Il chunk piu' carico del campionario fa **10 629 quad** di dettaglio contro i
 * 16 384 di `MAX_DETAIL_QUADS_PER_CHUNK` — il 65%, ed era meta' prima che gli
 * scavi si sommassero a questa sagoma. Chi arricchisce ancora **rimisuri**
 * invece di fidarsi di questa riga: il test lo fa da se', e a superare il tetto
 * si perderebbero industrial e civic a meta' chunk.
 */
export const CELL_PARTS: readonly SwatchPart[] = [
  { z0: 0, levels: 3, side: 5, notch: 1 },
  { z0: 3, levels: 2, side: 7 },
  { z0: 5, levels: 2, side: 7, hole: 5, notch: 2 },
  { z0: 5, levels: 4, side: 7, corners: true },
];

/** Lato in pianta del provino: il pezzo piu' largo. */
export const CELL_FOOTPRINT = CELL_PARTS.reduce((widest, part) => Math.max(widest, part.side), 0);

/** Altezza del provino: fin dove arriva il pezzo piu' alto. */
export const CELL_HEIGHT = CELL_PARTS.reduce(
  (top, part) => Math.max(top, part.z0 + part.levels),
  0,
);

/**
 * Quota sopra la quale il provino dev'essere **visibile per intero**.
 *
 * E' la sommita' dello sbalzo, cioe' il filo da cui in su sta tutto quello che
 * la microgeometria produce. Sotto c'e' il podio, e li' l'occlusione della fila
 * davanti e' accettabile; sopra no, o meta' del vocabolario si vedrebbe solo
 * ruotando la camera. Lo consuma il test dell'interasse, che lo confronta con
 * `hiddenBehind`: il conto sta in `swatchOcclusion.ts`.
 */
export const CELL_LEDGE = CELL_PARTS[1].z0 + CELL_PARTS[1].levels;

/** true se la cella `(lx, ly)` del pezzo e' piena: quadrato meno vuoto meno smusso. */
function inPart(part: SwatchPart, lx: number, ly: number): boolean {
  const inset = (CELL_FOOTPRINT - part.side) / 2;
  const sx = lx - inset;
  const sy = ly - inset;
  if (sx < 0 || sy < 0 || sx >= part.side || sy >= part.side) return false;

  const last = part.side - 1;
  if (part.corners === true) return (sx === 0 || sx === last) && (sy === 0 || sy === last);

  const hole = part.hole ?? 0;
  const holeInset = (part.side - hole) / 2;
  if (hole > 0 && sx >= holeInset && sy >= holeInset && sx < holeInset + hole && sy < holeInset + hole) {
    return false;
  }

  // Lo smusso e' un blocco quadrato per angolo, non la diagonale di Manhattan di
  // `planMask.ts`: quella su un anello di spessore uno taglierebbe la cella
  // d'angolo e nient'altro, mentre qui serve staccare la lama dal pinnacolo.
  const notch = part.notch ?? 0;
  return !(notch > 0 && Math.min(sx, last - sx) < notch && Math.min(sy, last - sy) < notch);
}

/**
 * true se la cella `(lx, ly)` del provino e' piena al livello `level`.
 *
 * **E' l'unica descrizione della sagoma**, e la leggono in tre: il generatore che
 * la scrive, la sonda che ne conta i prismi e il test che verifica il mondo.
 * Due letture della stessa forma divergerebbero al primo ritocco, ed e' la
 * stessa ragione per cui `matrixCellRect` sta qui e non nel generatore.
 */
export function cellSolidAt(lx: number, ly: number, level: number): boolean {
  for (const part of CELL_PARTS) {
    if (level < part.z0 || level >= part.z0 + part.levels) continue;
    if (inPart(part, lx, ly)) return true;
  }
  return false;
}

/** Colonne della matrice: uno slot di palette ciascuna, `empty` compreso. */
export const SWATCH_COLUMNS = PALETTE_SIZE;

/** Righe della matrice: un linguaggio di superficie ciascuna. */
export const SWATCH_ROWS = SURFACE_KIND_NAMES.length;

/** Gli slot che il fragment riconosce come acqua **prima** di leggere i tre bit. */
const WATER_SLOTS: readonly number[] = [24, 25];

/** I tre specchi, in ordine di pilastro. Sono `WATER_CLASS`, non un ottavo tipo. */
export const SWATCH_WATERS: readonly { readonly name: string; readonly kind: number }[] = [
  { name: 'open', kind: WATER_CLASS.open },
  { name: 'shallow', kind: WATER_CLASS.shallow },
  { name: 'canal', kind: WATER_CLASS.canal },
];

/** Lato coperto dalla matrice in pianta: l'ultima cella non porta l'interasse. */
function bandSpan(count: number, side: number, pitch: number): number {
  return count <= 0 ? 0 : (count - 1) * pitch + side;
}

const MATRIX_WIDTH = bandSpan(SWATCH_COLUMNS, CELL_FOOTPRINT, SWATCH.cellPitch);
const MATRIX_DEPTH = bandSpan(SWATCH_ROWS, CELL_FOOTPRINT, SWATCH.cellPitch);

const BIOME_WIDTH = bandSpan(BIOME_NAMES.length, SWATCH.pillarSide, SWATCH.pillarPitch);
const WATER_WIDTH = bandSpan(SWATCH_WATERS.length, SWATCH.pillarSide, SWATCH.pillarPitch);
const STRATA_WIDTH = BIOME_WIDTH + SWATCH.waterGap + WATER_WIDTH;

/** Un soggetto della fascia di scala, con il posto che si prende. */
export interface ScaleItem {
  readonly kind: 'cells' | 'tree' | 'building';
  readonly label: string;
  /** Indice in `TREE_SHAPES`, solo per gli alberi. */
  readonly species: number;
  readonly x0: number;
  readonly width: number;
  readonly depth: number;
}

/**
 * I soggetti della fascia di scala, da sinistra a destra.
 *
 * Il catalogo degli alberi si percorre per intero: una specie aggiunta a
 * `TREE_SHAPES` compare qui senza che nessuno se ne ricordi.
 */
function planScaleItems(): readonly ScaleItem[] {
  const items: ScaleItem[] = [];
  const cell = TERRAIN.cellSize;
  let x = 0;

  // La cella di terreno e la sua scaletta: e' il metro con cui si misura tutto
  // il resto, e la scaletta e' quel che rende visibile la quantizzazione.
  const cellsWidth = cell + SWATCH.scaleGap + SWATCH.stairSteps * cell;
  items.push({ kind: 'cells', label: 'terrain cell', species: -1, x0: x, width: cellsWidth, depth: cell });
  x += cellsWidth + SWATCH.scaleGap;

  for (let species = 0; species < TREE_SHAPES.length; species++) {
    items.push({
      kind: 'tree',
      label: `tree ${species}`,
      species,
      x0: x,
      width: SWATCH.treePitch,
      depth: SWATCH.treePitch,
    });
    x += SWATCH.treePitch;
  }

  x += SWATCH.scaleGap;
  items.push({
    kind: 'building',
    label: SWATCH.referenceTypology,
    species: -1,
    x0: x,
    width: SWATCH.referenceSpan,
    depth: SWATCH.referenceSpan,
  });

  return items;
}

const RAW_SCALE_ITEMS = planScaleItems();
const SCALE_WIDTH = RAW_SCALE_ITEMS.reduce((widest, item) => Math.max(widest, item.x0 + item.width), 0);

/**
 * Le due fasce strette stanno **centrate** sotto la matrice.
 *
 * Da quando l'interasse della matrice segue l'occlusione, la griglia e' larga il
 * triplo della stratigrafia e della scala: allineate a sinistra lasciavano due
 * terzi di basamento vuoto in un angolo, che a schermo si legge come una scena
 * non finita invece che come uno spazio.
 */
const STRATA_X0 = Math.max(0, Math.floor((MATRIX_WIDTH - STRATA_WIDTH) / 2));
const SCALE_X0 = Math.max(0, Math.floor((MATRIX_WIDTH - SCALE_WIDTH) / 2));

export const SCALE_ITEMS: readonly ScaleItem[] = RAW_SCALE_ITEMS.map((item) => ({
  ...item,
  x0: item.x0 + SCALE_X0,
}));
const SCALE_DEPTH = SCALE_ITEMS.reduce((deepest, item) => Math.max(deepest, item.depth), 0);

/** Quota a cui arriva ogni fascia, basamento compreso: e' cio' che occlude. */
const SCALE_TOP = SWATCH.groundZ + SWATCH.referenceHeight;
const STRATA_TOP = SWATCH.groundZ + SWATCH.pillarHeight;
const MATRIX_TOP = SWATCH.groundZ + CELL_HEIGHT;

/** Vuoto fra due fasce: quello dichiarato, o quanto ne chiede chi sta davanti. */
function bandGapFor(frontTop: number): number {
  return Math.max(SWATCH.bandGap, clearanceBehind(frontTop));
}

/**
 * Origine in y delle tre fasce, **dalla piu' alta alla piu' bassa**.
 *
 * L'ordine non e' quello di lettura ed e' deliberato: la camera guarda da
 * `(+x, +y)`, quindi lungo +y ci si avvicina, e chi sta davanti copre chi sta
 * dietro per la propria quota meno il vuoto che li separa. Con la scala in coda
 * — com'era — l'edificio di riferimento, alto trentotto, seppelliva le ultime
 * file della matrice e i pilastri; capovolto, ogni fascia scopre per intero
 * quella dietro e il vuoto lo dice `swatchOcclusion.ts` invece di un numero
 * scelto a occhio.
 */
const SCALE_Y = 0;
const STRATA_Y = SCALE_Y + SCALE_DEPTH + bandGapFor(STRATA_TOP);
const MATRIX_Y = STRATA_Y + SWATCH.pillarSide + bandGapFor(MATRIX_TOP);
const BASE_END_Y = MATRIX_Y + MATRIX_DEPTH;

/**
 * La fascia piu' arretrata della base: dove comincia e fin dove sale.
 *
 * La legge `swatchCatalog.ts`, che accoda le gallerie **dietro** la base: per
 * sapere di quanto scostarsi le serve sapere cosa si trovera' davanti, e questo
 * e' il solo posto in cui quel dato esiste.
 */
export const SWATCH_BASE_REAR = { y: SCALE_Y, top: SCALE_TOP } as const;

/** Estensione dell'intero campionario, basamento compreso. */
export interface SwatchExtent {
  readonly minX: number;
  readonly minY: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

/**
 * Quanto spazio prende il campionario.
 *
 * La consuma `main.ts` per inquadrarlo **senza istanziare il generatore**: qui
 * ogni ingombro e' dichiarato, mentre il diorama deve comporre lo stamp per
 * sapere quanto e' alto il proprio soggetto.
 */
export function swatchExtent(): SwatchExtent {
  const margin = SWATCH.plinthMargin;
  return {
    minX: -margin,
    minY: SCALE_Y - margin,
    sizeX: Math.max(MATRIX_WIDTH, STRATA_WIDTH, SCALE_WIDTH) + margin * 2,
    sizeY: BASE_END_Y - SCALE_Y + margin * 2,
    sizeZ: Math.max(MATRIX_TOP, STRATA_TOP, SCALE_TOP),
  };
}

/**
 * Fin dove arriva il basamento alla riga `y`.
 *
 * **Il piano di lettura e' largo quanto cio' che ci sta sopra**, e non quanto il
 * rettangolo che contiene tutto: la matrice e' larga il triplo delle altre due
 * fasce, e un basamento rettangolare lascerebbe due terzi di grigio vuoto sotto
 * la stratigrafia e la scala. Ogni fascia ha percio' il suo ripiano, e il vuoto
 * fra due ripiani resta vuoto: da quando i distacchi li detta l'occlusione sono
 * larghi quanto una fascia intera, e riempirli avrebbe voluto dire un deserto
 * grigio al posto di uno stacco.
 */
export function plinthSpanAt(y: number): { readonly x0: number; readonly x1: number } {
  const margin = SWATCH.plinthMargin;
  if (y >= SCALE_Y - margin && y < SCALE_Y + SCALE_DEPTH + margin) {
    return { x0: SCALE_X0 - margin, x1: SCALE_X0 + SCALE_WIDTH + margin };
  }
  if (y >= STRATA_Y - margin && y < STRATA_Y + SWATCH.pillarSide + margin) {
    return { x0: STRATA_X0 - margin, x1: STRATA_X0 + STRATA_WIDTH + margin };
  }
  if (y >= MATRIX_Y - margin && y < MATRIX_Y + MATRIX_DEPTH + margin) {
    return { x0: -margin, x1: MATRIX_WIDTH + margin };
  }
  return { x0: 0, x1: 0 };
}

/**
 * Riquadro in pianta della cella `(row, col)`: l'ingombro del pezzo piu' largo.
 *
 * E' l'impronta, non il volume — i pezzi stanno dentro questo riquadro e quali
 * celle riempiano lo dice `cellSolidAt`. Chi cerca un voxel di una combinazione
 * lo cerca qui dentro, a qualunque altezza.
 */
export function matrixCellRect(row: number, col: number): SwatchRect {
  const x0 = col * SWATCH.cellPitch;
  const y0 = MATRIX_Y + row * SWATCH.cellPitch;
  return { x0, y0, x1: x0 + CELL_FOOTPRINT, y1: y0 + CELL_FOOTPRINT };
}

/**
 * Riquadro del pilastro `index`: prima i sei biomi, poi i tre specchi d'acqua.
 */
export function strataPillarRect(index: number): SwatchRect {
  const biomes = BIOME_NAMES.length;
  const slot = index < biomes ? index : index - biomes;
  const offset = index < biomes ? 0 : BIOME_WIDTH + SWATCH.waterGap;
  const x0 = STRATA_X0 + offset + slot * SWATCH.pillarPitch;
  return { x0, y0: STRATA_Y, x1: x0 + SWATCH.pillarSide, y1: STRATA_Y + SWATCH.pillarSide };
}

/** Quanti pilastri ha la fascia della stratigrafia: biomi piu' specchi d'acqua. */
export const SWATCH_PILLARS = BIOME_NAMES.length + SWATCH_WATERS.length;

/** Origine in y della fascia di scala; i soggetti ci si appoggiano sopra. */
export const SCALE_ORIGIN_Y = SCALE_Y;

/** Cosa si sta guardando: e' il referto che l'overlay scrive sotto il cursore. */
export interface SwatchCell {
  readonly band: SwatchBand;
  /** Riga della matrice, o `-1` fuori da lei. */
  readonly row: number;
  /** Colonna della matrice, o `-1` fuori da lei. */
  readonly col: number;
  readonly label: string;
  /** Seconda riga del referto: dice quando la cella non significa quel che sembra. */
  readonly note: string | null;
}

/**
 * Cosa c'e' alla colonna `(x, y)` del campionario.
 *
 * **In-world non ci sono etichette**, e la sola convenzione d'ordine si
 * dimentica: e' la stessa richiesta a cui risponde `InspectOverlay`. Il vuoto
 * fra due celle appartiene alla cella che lo precede, cosi' il referto non
 * sfarfalla mentre il cursore attraversa la griglia.
 */
export function swatchCellAt(x: number, y: number): SwatchCell | null {
  const extent = swatchExtent();
  if (x < extent.minX || y < extent.minY) return null;
  if (x >= extent.minX + extent.sizeX || y >= extent.minY + extent.sizeY) return null;

  if (y < SCALE_Y + SCALE_DEPTH) return scaleItemAt(x);
  if (y < STRATA_Y) return null;
  if (y < STRATA_Y + SWATCH.pillarSide) return pillarAt(x);
  if (y < MATRIX_Y) return null;
  return matrixCellAt(x, y);
}

function matrixCellAt(x: number, y: number): SwatchCell | null {
  const col = Math.floor(x / SWATCH.cellPitch);
  const row = Math.floor((y - MATRIX_Y) / SWATCH.cellPitch);
  if (col < 0 || col >= SWATCH_COLUMNS || row < 0 || row >= SWATCH_ROWS) return null;

  const slot = PALETTE_SLOT_NAMES[col];
  const surface = SURFACE_KIND_NAMES[row];
  return {
    band: SWATCH_BAND.matrix,
    row,
    col,
    label: `${slot} ${col} · ${surface} ${row}`,
    note: matrixNote(col, row),
  };
}

/**
 * L'unico posto in cui la matrice non dice quel che sembra.
 *
 * Sugli slot d'acqua i tre bit alti portano `WATER_CLASS` e non un linguaggio di
 * facciata — il fragment riconosce l'acqua dalla palette **prima** di leggerli
 * (contratto 5). Senza questa riga si finirebbe per attribuire alla superficie
 * quello che sta facendo lo specchio.
 */
function matrixNote(col: number, row: number): string | null {
  if (col === 0) return 'slot 0 is the void: no voxel to write';
  if (!WATER_SLOTS.includes(col)) return null;
  const water = SWATCH_WATERS.find((candidate) => candidate.kind === row);
  return water === undefined
    ? 'water: the three bits carry WATER_CLASS, not the facade'
    : `water: here the three bits say «${water.name}», not the facade`;
}

function pillarAt(x: number): SwatchCell | null {
  for (let index = 0; index < SWATCH_PILLARS; index++) {
    const rect = strataPillarRect(index);
    if (x < rect.x0 || x >= rect.x0 + SWATCH.pillarPitch) continue;
    const biomes = BIOME_NAMES.length;
    const label = index < biomes
      ? `${BIOME_NAMES[index]} · surface / subsoil / bedrock`
      : `water ${SWATCH_WATERS[index - biomes].name}`;
    return {
      band: SWATCH_BAND.strata,
      row: -1,
      col: -1,
      label,
      note: index < biomes
        ? `every layer is a multiple of ${TERRAIN.cellSize} voxel tall`
        : 'the class travels in the three bits of the water voxel',
    };
  }
  return null;
}

function scaleItemAt(x: number): SwatchCell | null {
  for (const item of SCALE_ITEMS) {
    if (x < item.x0 || x >= item.x0 + item.width) continue;
    return {
      band: SWATCH_BAND.scale,
      row: -1,
      col: -1,
      label: item.label,
      note: item.kind === 'cells'
        ? `the terrain cube is ${TERRAIN.cellSize} voxel: what fills it is not`
        : null,
    };
  }
  return null;
}
