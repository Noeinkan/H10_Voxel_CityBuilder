import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Catalogo della flora: com'e' fatta ogni specie e chi cresce dove.
 *
 * Sta fuori da `config.ts` per una ragione dichiarata in quel file: e' la parte
 * del terreno che si tocca per *aspetto* e non per calibrazione, ed e' anche la
 * piu' lunga. Qui non ci sono soglie del campo di altezza, frequenze o
 * stratigrafie — quelle restano una cosa sola, di la'.
 *
 * **La quota decide la flora, non solo la tinta.** Prima di questa tabella la
 * specie usciva da un'estrazione uniforme su tutto il catalogo: la stessa
 * latifoglia tonda compariva sul prato e a cinquanta voxel d'altezza, e le fasce
 * di bioma si distinguevano solo per densita'. Ogni bioma ha invece una sua
 * lista di specie con dei pesi, e la lettura del rilievo passa anche da li' —
 * abeti stretti e macchie basse in quota, chiome larghe in pianura.
 */

/**
 * Un livello di chioma: un disco orizzontale di foglie.
 *
 * `radius` e' il mezzo lato del quadrato, `cut` la distanza di Manhattan
 * massima ammessa al suo interno — e' quel numero, e non una forma dedicata, a
 * smussare gli angoli: `cut = radius` da' un rombo, `cut = 2 * radius` il
 * quadrato pieno, e i valori in mezzo tutte le vie di mezzo. `tone` indicizza
 * le tinte della specie.
 */
export interface TreeCanopyLevel {
  readonly radius: number;
  readonly cut: number;
  readonly tone: number;
}

/** Profilo completo di una specie: tronco piu' chioma impilata dal basso. */
export interface TreeShape {
  /** Altezza del tronco come `[minimo, alternative]`: una estrazione del PRNG. */
  readonly trunk: readonly [number, number];
  /**
   * Di quanti livelli la chioma scende ad avvolgere il tronco.
   *
   * Deve restare minore di `trunk[0]`, altrimenti la chioma comincerebbe sotto
   * la quota del suolo e scaverebbe la colonna che la sostiene.
   */
  readonly sink: number;
  /** Tinte della chioma, dalla piu' scura alla piu' chiara. */
  readonly tones: readonly number[];
  /** Livelli dal basso verso l'alto; la lunghezza e' l'altezza della chioma. */
  readonly canopy: readonly TreeCanopyLevel[];
}

/** Indici nel catalogo `TREE_SHAPES`: l'ordine dei due elenchi e' lo stesso. */
export const TREE_SPECIES = {
  conifer: 0,
  broadleaf: 1,
  autumn: 2,
  pine: 3,
  shrub: 4,
  scrub: 5,
  fruit: 6,
} as const;

/**
 * Profili delle specie, nell'ordine di `TREE_SPECIES`.
 *
 * La chioma si schiarisce salendo: e' quanto basta a farla leggere come volume
 * invece che come blocco unico, e non costa niente perche' il colore vive
 * nell'uniform di palette. Il raggio della specie non e' dichiarato — si ricava
 * dal massimo dei suoi livelli, cosi' una riga sbagliata non puo' mentire al
 * generatore su quanto largo sia l'anello da valutare.
 */
export const TREE_SHAPES: readonly TreeShape[] = [
  // Conifera: guglia a piani sfalsati, il classico abete a gradoni. I livelli
  // larghi alternati agli stretti sono cio' che da' la silhouette dentellata —
  // e con quattro raggi disponibili invece di due i gradoni sono davvero
  // gradoni, non tre scalini contati.
  {
    trunk: [9, 4],
    sink: 6,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass, PALETTE_SLOTS.grassLight],
    canopy: [
      { radius: 4, cut: 4, tone: 0 },
      { radius: 4, cut: 5, tone: 0 },
      { radius: 3, cut: 4, tone: 0 },
      { radius: 4, cut: 4, tone: 0 },
      { radius: 3, cut: 3, tone: 0 },
      { radius: 3, cut: 4, tone: 1 },
      { radius: 2, cut: 4, tone: 1 },
      { radius: 3, cut: 3, tone: 1 },
      { radius: 2, cut: 3, tone: 1 },
      { radius: 2, cut: 2, tone: 2 },
      { radius: 1, cut: 2, tone: 2 },
      { radius: 0, cut: 0, tone: 2 },
    ],
  },
  // Latifoglia: chioma tonda e piena, la piu' voluminosa del catalogo. Il ventre
  // sta a `cut: 7` su raggio 4, cioe' quasi il quadrato pieno: e' la sola via
  // per una sfera, perche' il rombo a quella scala legge come un ottaedro.
  {
    trunk: [8, 5],
    sink: 4,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass, PALETTE_SLOTS.grassLight],
    canopy: [
      { radius: 3, cut: 4, tone: 0 },
      { radius: 4, cut: 5, tone: 0 },
      { radius: 4, cut: 6, tone: 1 },
      { radius: 4, cut: 7, tone: 1 },
      { radius: 4, cut: 7, tone: 1 },
      { radius: 4, cut: 6, tone: 1 },
      { radius: 4, cut: 5, tone: 2 },
      { radius: 3, cut: 4, tone: 2 },
      { radius: 2, cut: 3, tone: 2 },
      { radius: 1, cut: 2, tone: 2 },
    ],
  },
  // Autunnale: stessa scala della latifoglia ma piu' schiacciata, e in caldo.
  {
    trunk: [8, 4],
    sink: 4,
    tones: [PALETTE_SLOTS.metalRust, PALETTE_SLOTS.brickLight, PALETTE_SLOTS.metalBrass],
    canopy: [
      { radius: 3, cut: 5, tone: 0 },
      { radius: 4, cut: 6, tone: 0 },
      { radius: 4, cut: 7, tone: 1 },
      { radius: 4, cut: 7, tone: 1 },
      { radius: 4, cut: 6, tone: 1 },
      { radius: 3, cut: 5, tone: 2 },
      { radius: 2, cut: 3, tone: 2 },
      { radius: 1, cut: 2, tone: 2 },
    ],
  },
  // Abete d'alta quota: la conifera vista da lontano e in salita. Piu' alto di
  // tutti e piu' stretto di tutti — raggio tre contro quattro — perche' e' la
  // proporzione, non il colore, a dire che si sta guardando una montagna: una
  // guglia su un fianco terrazzato legge come una scala che sale, una chioma
  // tonda come un giardino appoggiato la' sopra.
  {
    trunk: [11, 5],
    sink: 7,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass],
    canopy: [
      { radius: 3, cut: 3, tone: 0 },
      { radius: 3, cut: 4, tone: 0 },
      { radius: 2, cut: 3, tone: 0 },
      { radius: 3, cut: 3, tone: 0 },
      { radius: 2, cut: 3, tone: 1 },
      { radius: 2, cut: 2, tone: 1 },
      { radius: 2, cut: 3, tone: 1 },
      { radius: 1, cut: 2, tone: 1 },
      { radius: 2, cut: 2, tone: 2 },
      { radius: 1, cut: 2, tone: 2 },
      { radius: 1, cut: 1, tone: 2 },
      { radius: 0, cut: 0, tone: 2 },
    ],
  },
  // Cespuglio: cinque voxel in tutto, ed e' il punto. Fra il prato spoglio e un
  // albero da quindici voxel non c'era niente, e la pianura si leggeva o vuota o
  // boscosa; questo riempie quella scala, e sotto le chiome fa sottobosco.
  {
    trunk: [2, 2],
    sink: 1,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass, PALETTE_SLOTS.grassLight],
    canopy: [
      { radius: 2, cut: 3, tone: 0 },
      { radius: 2, cut: 4, tone: 1 },
      { radius: 2, cut: 3, tone: 1 },
      { radius: 1, cut: 2, tone: 2 },
    ],
  },
  // Macchia d'alta quota: larga e schiacciata, il contrario dell'abete. Sopra la
  // fascia degli alberi non cresce piu' niente in verticale, e una sagoma che si
  // stende invece di alzarsi e' cio' che lo racconta senza una riga di codice.
  {
    trunk: [2, 2],
    sink: 1,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass, PALETTE_SLOTS.grassPale],
    canopy: [
      { radius: 3, cut: 4, tone: 0 },
      { radius: 3, cut: 5, tone: 1 },
      { radius: 2, cut: 3, tone: 2 },
    ],
  },
  // Da frutto: **l'unica specie che non nasce da sola.** Non compare in nessuna
  // riga di `FLORA` — la pianta un frutteto, cioe' qualcuno — ed e' il motivo per
  // cui puo' permettersi una sagoma che in natura non si spiegherebbe: bassa,
  // tonda e larga uguale, cioe' potata.
  //
  // Raggio due, contro il quattro delle chiome selvatiche: e' quello che le
  // permette di stare su un reticolo fitto senza che due chiome si tocchino, e a
  // distanza isometrica sono la **regolarita' e la scala** — non la specie — a
  // dire che quello e' un frutteto e non un pezzo di bosco.
  //
  // L'ottone in cima e' il frutto, ed e' lo stesso slot del fogliame autunnale e
  // del grano maturo: la palette e' piena, e un tono caldo dentro il verde e'
  // tutto quello che serve perche' si legga a colpo d'occhio.
  {
    trunk: [4, 2],
    sink: 2,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass, PALETTE_SLOTS.metalBrass],
    canopy: [
      { radius: 2, cut: 3, tone: 0 },
      { radius: 2, cut: 4, tone: 1 },
      { radius: 2, cut: 3, tone: 1 },
      { radius: 1, cut: 2, tone: 2 },
    ],
  },
];

/** Una specie e quanto pesa nell'estrazione del proprio bioma. */
export interface SpeciesWeight {
  readonly species: number;
  readonly weight: number;
}

/** Quanta flora c'e' in un bioma, e di quale specie. */
export interface BiomeFlora {
  /**
   * Probabilita' che una cella decorativa ospiti qualcosa.
   *
   * Non cambia con la scala del terreno: la cella ha quattro volte l'area di
   * quando gli alberi erano larghi la meta', e ospita un albero quattro volte
   * piu' largo in pianta, quindi la frazione di suolo coperta resta calibrata.
   */
  readonly density: number;
  /** Specie ammesse con il loro peso; vuota vuol dire bioma spoglio. */
  readonly species: readonly SpeciesWeight[];
}

/**
 * Chi cresce dove, in ordine di `BIOME`.
 *
 * **La roccia non e' piu' nuda.** Era l'unico bioma emerso senza niente sopra, e
 * quella scelta veniva da quando la roccia era anche l'unico terreno vietato
 * alla citta': un posto dove non succede niente. Ora ci cresce quel che cresce
 * davvero sopra il limite del bosco — qualche abete storto e molta macchia
 * bassa — e la densita' e' un settimo di quella della foresta perche' e' la
 * *rarita'* a dire che si e' in quota. Il filtro di pendenza in `decor.ts` fa il
 * resto: sui fianchi veri non attecchisce niente, e la flora si raccoglie sulle
 * terrazze, che e' esattamente dove ci si aspetta di vederla.
 */
export const FLORA: readonly BiomeFlora[] = [
  // ocean — sott'acqua
  { density: 0, species: [] },
  // beach — la sabbia resta sabbia; ci passa la citta'
  { density: 0, species: [] },
  // plain — chiome larghe e sottobosco
  {
    density: 0.2,
    species: [
      { species: TREE_SPECIES.broadleaf, weight: 5 },
      { species: TREE_SPECIES.autumn, weight: 3 },
      { species: TREE_SPECIES.shrub, weight: 3 },
    ],
  },
  // forest — il bosco misto: e' la fascia piu' fitta dell'isola
  {
    density: 0.62,
    species: [
      { species: TREE_SPECIES.conifer, weight: 4 },
      { species: TREE_SPECIES.broadleaf, weight: 4 },
      { species: TREE_SPECIES.autumn, weight: 1 },
      { species: TREE_SPECIES.shrub, weight: 2 },
    ],
  },
  // hill — comincia la salita: gli abeti prendono il posto delle chiome tonde
  {
    density: 0.4,
    species: [
      { species: TREE_SPECIES.pine, weight: 5 },
      { species: TREE_SPECIES.conifer, weight: 3 },
      { species: TREE_SPECIES.shrub, weight: 2 },
      { species: TREE_SPECIES.scrub, weight: 2 },
    ],
  },
  // rock — sopra il limite del bosco
  {
    density: 0.14,
    species: [
      { species: TREE_SPECIES.scrub, weight: 6 },
      { species: TREE_SPECIES.pine, weight: 2 },
      { species: TREE_SPECIES.shrub, weight: 1 },
    ],
  },
];

/**
 * Specie estratta dai pesi del bioma con **una sola** frazione.
 *
 * L'unicita' dell'estrazione non e' un vezzo: `treeOrigin` e `treeAt` leggono lo
 * stesso flusso del PRNG dalle due parti della cucitura fra blocchi, e un
 * numero di tiri diverso fra i due sposterebbe gli alberi di bordo.
 */
export function pickSpecies(flora: BiomeFlora, unit: number): number {
  let total = 0;
  for (const entry of flora.species) total += entry.weight;
  let cursor = unit * total;
  for (const entry of flora.species) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.species;
  }
  // Irraggiungibile con `unit` in [0, 1) e pesi positivi: e' il ripiego che
  // tiene la funzione totale invece di restituire `undefined` per un errore di
  // arrotondamento.
  return flora.species[flora.species.length - 1].species;
}
