import { BIOME, TERRAIN } from '../terrain/config';
import { BUILD_WEIGHT, GRADING } from './config';

/**
 * Cosa serve costruire perche' un pezzo di terreno regga un piano.
 *
 * **Puro.** Entrano quote e classificazioni gia' lette, esce un piano di opera:
 * niente `TerrainMap`, niente `VoxelWorld`, nessuno stato. E' cio' che rende
 * queste regole verificabili in Node scrivendo tre numeri a mano, invece che
 * generando un'isola per vedere se un muro viene su dritto.
 *
 * **Chi scrive sta altrove.** Questo modulo decide *quale* opera e *fino a che
 * quota*; i voxel li scrive il Builder, che resta l'unico autorizzato. La
 * separazione conta perche' la stessa decisione serve a tre cose diverse — il
 * lotto di un edificio, la carreggiata che lo raggiunge, la piazza di un
 * catalizzatore — e un'unica regola le tiene d'accordo sulla quota.
 */

/** Come una colonna si presenta a chi deve costruirci sopra. */
export const GROUND = {
  /** Piana e asciutta: ci si costruisce senza opere, come prima della 4.2. */
  flat: 0,
  /** Asciutta ma in pendenza: regge solo su un terrapieno. */
  sloped: 1,
  /** Battigia o bassofondo: regge solo su una banchina. */
  shore: 2,
  /** Roccia nuda abbastanza piana: regge, ma la fondazione si paga. */
  rock: 3,
  /** Parete, acqua fonda, o colonna non ancora generata. */
  refused: 4,
} as const;

export type GroundKind = (typeof GROUND)[keyof typeof GROUND];

/** L'opera che un piano richiede. */
export const WORKS = {
  /** Nessuna: il terreno era gia' in piano. */
  none: 0,
  /** Terrapieno con muro di contenimento. */
  terrace: 1,
  /** Banchina: il piano sale sopra la battigia e il muro scende sul fondale. */
  quay: 2,
} as const;

export type Works = (typeof WORKS)[keyof typeof WORKS];

/**
 * Classificazione di una colonna a partire dai tre campi della `TerrainMap`.
 *
 * Il bit `buildable` del terreno **non** entra qui, ed e' deliberato: quel bit
 * dice "piano e asciutto", che era la sola domanda finche' la citta' non sapeva
 * costruire niente sotto di se'. Ora la domanda e' un'altra, e la risposta
 * distingue quattro casi dove il bit ne vedeva due.
 *
 * **La roccia non e' piu' un rifiuto per bioma.** Lo era, e produceva l'unica
 * risposta che nessuno riusciva a leggere sullo schermo: una mesa larga e
 * perfettamente piana rifiutata mentre il prato accanto accettava, perche'
 * `classifyBiome` chiama roccia tutto cio' che sta sopra `rockMinHeight` anche
 * a pendenza zero. Adesso decide la pendenza, come per ogni altro bioma, e la
 * roccia si distingue nel prezzo (`BUILD_WEIGHT`) invece che nel divieto.
 */
export function groundKindOf(biome: number, slope: number, height: number): GroundKind {
  if (biome === BIOME.ocean) {
    const depth = TERRAIN.seaLevel - height;
    // **Sott'acqua sopra il livello del mare vuol dire lago**, da quando le
    // conche di `landform.ts` hanno dato a uno specchio la propria quota. E un
    // lago non e' battigia: la banchina e' un muro che scende sul fondale fino a
    // `GRADING.quayLevel`, una quota assoluta tarata sul mare, e sotto la riva
    // di un lago in quota quel muro finirebbe una decina di voxel dentro la
    // collina. La citta' gli cresce intorno, che e' anche cio' che si vuole
    // vedere.
    if (depth < 0) return GROUND.refused;
    return depth <= GRADING.maxQuayDepth ? GROUND.shore : GROUND.refused;
  }
  if (biome === BIOME.beach) return GROUND.shore;
  if (slope >= GRADING.maxTerraceSlope) return GROUND.refused;
  if (biome === BIOME.rock) return GROUND.rock;
  return slope >= TERRAIN.buildableMaxSlope ? GROUND.sloped : GROUND.flat;
}

/**
 * true se la colonna e' terra emersa.
 *
 * Non e' `groundKindOf(...) !== GROUND.shore`: la battigia e' `shore` ed e'
 * terra, mentre il bassofondo e' `shore` e non lo e'. La distinzione serve a
 * chi misura **quanto una banchina si allontana dalla costa**, e li' i due casi
 * stanno da parti opposte pur condividendo la classificazione.
 *
 * Decide il bioma e non la quota, e da quando esistono i laghi le due cose non
 * coincidono piu' nemmeno sull'isola vera: `classifyBiome` chiama oceano cio'
 * che sta sotto **il proprio** specchio, che dentro una conca e' quello del
 * lago. La quota assoluta direbbe che la riva di un lago in quota e' terra
 * asciutta sott'acqua — e su una fixture di terreno piano, che dichiara un
 * bioma di terra a una quota qualsiasi, direbbe che l'intera mappa e' sommersa.
 */
export function isDryLand(biome: number): boolean {
  return biome !== BIOME.ocean;
}

/**
 * Peso di costo di una colonna, e `Infinity` dove non si costruisce affatto.
 *
 * L'ordine dell'array e' quello di `GROUND`, e sta qui — accanto alla
 * definizione — invece che in `config.ts`, dove gli indici non si vedrebbero.
 * I numeri restano di la': questo file non ne inventa nessuno.
 */
const WEIGHT_BY_KIND: readonly number[] = [
  BUILD_WEIGHT.flat,
  BUILD_WEIGHT.sloped,
  BUILD_WEIGHT.shore,
  BUILD_WEIGHT.rock,
  Number.POSITIVE_INFINITY,
];

export function buildWeightOf(kind: GroundKind): number {
  return WEIGHT_BY_KIND[kind];
}

/**
 * Peso di un'impronta intera: il **massimo** delle sue colonne.
 *
 * Stessa ragione per cui `planGrade` alza il piano al massimo e non alla media:
 * un lotto per meta' sulla banchina la banchina la costruisce tutta, e pagarne
 * la meta' significherebbe che conviene sempre appoggiare un angolo sull'acqua.
 */
export function footprintWeightOf(kinds: Iterable<GroundKind>): number {
  let worst = 0;
  for (const kind of kinds) worst = Math.max(worst, buildWeightOf(kind));
  return worst;
}

/** Una colonna gia' classificata, come la vede chi progetta l'opera. */
export interface GroundColumn {
  readonly kind: GroundKind;
  /** Quota naturale: numero di voxel pieni, l'ultimo sta a `height - 1`. */
  readonly height: number;
}

export interface GradePlan {
  readonly works: Works;
  /** Quota del piano finito: l'ultimo voxel dell'opera sta a `padZ - 1`. */
  readonly padZ: number;
  /** Quota naturale piu' bassa toccata: dove il muro poggia. */
  readonly footZ: number;
  /** Voxel di riempimento che l'opera aggiunge. Zero se non serve un'opera. */
  readonly fill: number;
}

/**
 * Piano dell'opera sotto un'impronta, o null se nessuna opera la regge.
 *
 * La quota finita e' il **massimo** delle colonne, mai la media: livellare
 * verso il basso vorrebbe dire scavare, e un voxel di isola tolto non torna.
 * Una sola colonna di battigia porta l'intera impronta su `quayLevel`, perche'
 * un edificio mezzo sulla sabbia e mezzo sulla banchina avrebbe due piani terra.
 *
 * La roccia non compare in nessun ramo ed e' corretto cosi': strutturalmente e'
 * terreno gia' in quota, e non chiede ne' riempimento ne' muro. Quello che
 * chiede — la fondazione — si paga in `BUILD_WEIGHT`, non in voxel.
 */
export function planGrade(columns: readonly GroundColumn[]): GradePlan | null {
  if (columns.length === 0) return null;

  let padZ = 0;
  let footZ = Number.MAX_SAFE_INTEGER;
  let shore = false;
  let sloped = false;

  for (const column of columns) {
    if (column.kind === GROUND.refused) return null;
    if (column.kind === GROUND.shore) shore = true;
    if (column.kind === GROUND.sloped) sloped = true;

    const top = column.kind === GROUND.shore
      ? Math.max(column.height, GRADING.quayLevel)
      : column.height;
    if (top > padZ) padZ = top;
    if (column.height < footZ) footZ = column.height;
  }

  if (padZ - footZ > GRADING.maxWorksStep) return null;

  let fill = 0;
  for (const column of columns) fill += padZ - column.height;

  // La pendenza da sola basta a chiedere il muro anche quando il dislivello
  // sotto l'impronta e' piccolo: e' la colonna *attorno* che scappa via, ed e'
  // li' che senza muro si vedrebbe il taglio nel terreno.
  const works = shore
    ? WORKS.quay
    : sloped || padZ - footZ >= GRADING.terraceMinStep
      ? WORKS.terrace
      : WORKS.none;

  return { works, padZ, footZ, fill };
}

/**
 * Alza un campo di quote al piu' piccolo campo 1-Lipschitz che lo contiene.
 *
 * E' la rampa. Un piano rialzato — una banchina, un terrapieno — lascerebbe la
 * carreggiata che lo raggiunge a picco sul dislivello; questa relazione la
 * porta alla quota nuova un voxel per colonna, che e' la pendenza massima che
 * una strada percorre senza diventare una scalinata.
 *
 * Due passate di rilassamento su vicinato di Chebyshev, quindi lineari nel
 * numero di celle: la versione ovvia — per ogni cella il massimo su tutte le
 * altre meno la distanza — costerebbe il quadrato, e questa griglia si calcola
 * una volta per isolato.
 *
 * Muta `level` in posto: e' un buffer di lavoro, non un valore da conservare.
 */
export function rampField(level: Int32Array, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let best = level[i];
      if (x > 0) best = Math.max(best, level[i - 1] - 1);
      if (y > 0) {
        best = Math.max(best, level[i - width] - 1);
        if (x > 0) best = Math.max(best, level[i - width - 1] - 1);
        if (x + 1 < width) best = Math.max(best, level[i - width + 1] - 1);
      }
      level[i] = best;
    }
  }

  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let best = level[i];
      if (x + 1 < width) best = Math.max(best, level[i + 1] - 1);
      if (y + 1 < height) {
        best = Math.max(best, level[i + width] - 1);
        if (x + 1 < width) best = Math.max(best, level[i + width + 1] - 1);
        if (x > 0) best = Math.max(best, level[i + width - 1] - 1);
      }
      level[i] = best;
    }
  }
}
