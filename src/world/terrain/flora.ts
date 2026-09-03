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
  /**
   * Altezza del tronco come `[minimo, alternative]`: una estrazione del PRNG.
   *
   * **Non e' questo il numero che si vede**: la chioma ne ricopre gli ultimi
   * `sink` voxel, quindi cio' che resta nudo — e che decide la proporzione
   * dell'albero — e' `trunk - sink`. Tenerlo entro la **larghezza** della chioma
   * e' la regola che evita il lecca-lecca: il fusto e' un voxel di sezione e a
   * distanza isometrica non ha ne' corteccia ne' rami, per cui un fusto piu'
   * lungo della chioma larga non legge come un albero alto ma come un palo con
   * qualcosa appoggiato sopra.
   */
  readonly trunk: readonly [number, number];
  /**
   * Tinta del tronco. Assente vuol dire legno, che e' quasi sempre la risposta.
   *
   * Esiste per la betulla, e la betulla esiste per questo: a distanza isometrica
   * di un albero si vedono la sagoma e due o tre voxel di fusto, e una corteccia
   * chiara e' l'unica differenza di specie che si legge anche **dentro** un bosco
   * fitto — dove le chiome si toccano e la silhouette non si distingue piu'.
   */
  readonly bark?: number;
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
  birch: 7,
  palm: 8,
  cypress: 9,
  snag: 10,
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
    trunk: [7, 3],
    sink: 5,
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
    trunk: [6, 4],
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
    trunk: [6, 3],
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
    trunk: [8, 4],
    sink: 6,
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
  // Betulla: fusto chiaro e chioma rada. E' l'unica specie che si distingue per
  // il **tronco** invece che per la sagoma, ed e' il motivo per cui sta in
  // catalogo: dentro un bosco fitto le chiome si toccano e la silhouette non si
  // legge piu', mentre una fila di fusti chiari si vede da qualunque distanza.
  // La chioma e' apposta piu' magra di quella della latifoglia — meno voxel
  // sopra, piu' fusto in vista.
  {
    trunk: [8, 3],
    sink: 4,
    bark: PALETTE_SLOTS.concretePale,
    tones: [PALETTE_SLOTS.grass, PALETTE_SLOTS.grassLight, PALETTE_SLOTS.grassPale],
    canopy: [
      { radius: 2, cut: 3, tone: 0 },
      { radius: 3, cut: 4, tone: 0 },
      { radius: 3, cut: 5, tone: 1 },
      { radius: 3, cut: 4, tone: 1 },
      { radius: 2, cut: 3, tone: 2 },
      { radius: 2, cut: 2, tone: 2 },
      { radius: 1, cut: 2, tone: 2 },
    ],
  },
  // Palma: la sola specie della spiaggia, e la sola con la chioma **in cima** al
  // tronco invece che calata sopra. `sink` a uno e' esattamente questo: sotto le
  // fronde non c'e' fogliame ma il fusto nudo, cioe' la proporzione che rende
  // una palma riconoscibile prima ancora del colore.
  //
  // Il fusto e' pero' lungo **quanto la chioma e' larga**, non il doppio. Con un
  // tronco da tredici voxel sotto tre livelli di fronde la silhouette non era una
  // palma ma un palo con una bandiera in cima: da un'inquadratura isometrica il
  // fusto e' un voxel di sezione, quindi tutto quel che se ne legge e' la
  // distanza fra la sabbia e le foglie, e quella distanza pesa piu' della forma
  // delle fronde.
  //
  // Le fronde sono rombi (`cut` uguale al raggio): a raggio quattro un rombo ha
  // le punte sui quattro assi e il vuoto negli angoli, che al mesher esce come
  // foglie che si aprono invece di una chioma piena.
  {
    trunk: [8, 4],
    sink: 1,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass, PALETTE_SLOTS.grassLight],
    canopy: [
      { radius: 4, cut: 4, tone: 0 },
      { radius: 4, cut: 6, tone: 1 },
      { radius: 2, cut: 3, tone: 2 },
    ],
  },
  // Cipresso: una colonna. Non e' un albero in piu', e' l'unica **verticale**
  // del catalogo — raggio due su nove livelli di chioma — e serve dove il
  // paesaggio e' orizzontale per costruzione: in pianura, dove le terrazze non
  // ci sono e tutto quello che si vede sono chiome larghe alte uguale.
  {
    trunk: [7, 3],
    sink: 5,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass],
    canopy: [
      { radius: 1, cut: 2, tone: 0 },
      { radius: 2, cut: 2, tone: 0 },
      { radius: 2, cut: 3, tone: 0 },
      { radius: 2, cut: 3, tone: 1 },
      { radius: 2, cut: 2, tone: 1 },
      { radius: 1, cut: 2, tone: 1 },
      { radius: 1, cut: 2, tone: 2 },
      { radius: 1, cut: 1, tone: 2 },
      { radius: 0, cut: 0, tone: 2 },
    ],
  },
  // Albero morto: tronco e quattro monconi, e nessuna foglia. E' la specie che
  // racconta la quota meglio di una tinta — sopra il limite del bosco cio' che
  // resta in piedi e' legno secco — e costa pochissimo: la stessa chioma di
  // sempre con i raggi a uno e due e le tinte del legno, che l'erosione del
  // bordo riduce a rami storti.
  {
    trunk: [6, 4],
    sink: 3,
    tones: [PALETTE_SLOTS.wood, PALETTE_SLOTS.stoneDark, PALETTE_SLOTS.wood],
    canopy: [
      { radius: 2, cut: 2, tone: 0 },
      { radius: 1, cut: 1, tone: 0 },
      { radius: 2, cut: 2, tone: 1 },
      { radius: 1, cut: 1, tone: 0 },
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
 * **Nemmeno la spiaggia lo e' piu'.** Restava spoglia perche' e' il terreno su
 * cui la citta' arriva per prima, ma un albero non e' un ostacolo — non entra
 * nell'edificabilita', e chi costruisce gli scrive sopra. Quello che si perdeva
 * era invece l'unica fascia che si vede da **ogni** inquadratura, visto che
 * circonda l'isola: una frangia rada di palme, e la costa smette di essere una
 * riga di sabbia.
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
  // beach — una frangia di palme, non una macchia
  {
    density: 0.12,
    species: [
      { species: TREE_SPECIES.palm, weight: 7 },
      { species: TREE_SPECIES.scrub, weight: 2 },
      { species: TREE_SPECIES.shrub, weight: 1 },
    ],
  },
  // plain — chiome larghe, sottobosco e qualche verticale
  {
    density: 0.22,
    species: [
      { species: TREE_SPECIES.broadleaf, weight: 5 },
      { species: TREE_SPECIES.autumn, weight: 3 },
      { species: TREE_SPECIES.shrub, weight: 3 },
      { species: TREE_SPECIES.birch, weight: 3 },
      { species: TREE_SPECIES.cypress, weight: 2 },
    ],
  },
  // forest — il bosco misto: e' la fascia piu' fitta dell'isola
  {
    density: 0.62,
    species: [
      { species: TREE_SPECIES.conifer, weight: 4 },
      { species: TREE_SPECIES.broadleaf, weight: 4 },
      { species: TREE_SPECIES.birch, weight: 3 },
      { species: TREE_SPECIES.shrub, weight: 2 },
      { species: TREE_SPECIES.autumn, weight: 1 },
      { species: TREE_SPECIES.snag, weight: 1 },
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
      { species: TREE_SPECIES.birch, weight: 2 },
      { species: TREE_SPECIES.snag, weight: 1 },
    ],
  },
  // rock — sopra il limite del bosco
  {
    density: 0.14,
    species: [
      { species: TREE_SPECIES.scrub, weight: 6 },
      { species: TREE_SPECIES.pine, weight: 2 },
      { species: TREE_SPECIES.snag, weight: 2 },
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
