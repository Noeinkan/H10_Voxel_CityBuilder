import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Unica fonte di verita' dei numeri del terreno.
 *
 * Nessun altro file di `src/world/terrain/` contiene soglie, frequenze o
 * ampiezze: tutto passa da qui, cosi' la calibrazione e' un file solo.
 *
 * **Asse verticale.** Il mondo e' Z-up (`x` est, `y` nord, `z` altezza), quindi
 * "livello del mare a 8" e "altezza massima 40" sono valori di `z`. Il piano
 * delle colonne e' `(x, y)`.
 */

/** Identificatori di bioma. Sono indici densi: alimentano tabelle e `Uint8Array`. */
export const BIOME = {
  ocean: 0,
  beach: 1,
  plain: 2,
  forest: 3,
  hill: 4,
  rock: 5,
} as const;

export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

/** Nomi in ordine di indice, per overlay e messaggi di test. */
export const BIOME_NAMES: readonly string[] = ['ocean', 'beach', 'plain', 'forest', 'hill', 'rock'];

export const BIOME_COUNT = BIOME_NAMES.length;

export const TERRAIN = {
  // --- Quote assolute (voxel sull'asse z) ---------------------------------

  /** Superficie dell'acqua: l'ultimo voxel d'acqua sta a `z = seaLevel - 1`. */
  seaLevel: 8,

  /** Tetto duro dell'altezza di colonna. Nessuna colonna supera questa quota. */
  maxHeight: 40,

  /** Altezza a cui la maschera radiale schiaccia il bordo della region. */
  oceanFloor: 2,

  /**
   * Rilievo massimo per voxel di raggio dell'isola.
   *
   * Il gradiente del campo scala come rilievo diviso raggio: un'isola stretta
   * con lo stesso rilievo di una larga e' la stessa montagna schiacciata in meta'
   * spazio, quindi con pendenze doppie. Senza questo tetto la calibrazione
   * varrebbe solo per il lato 256 su cui e' stata fatta, e su una region piu'
   * piccola cadrebbero sia il criterio di continuita' sia l'edificabilita'.
   *
   * A raggio 128 il tetto vale 38,4 e non morde: il rilievo resta
   * `maxHeight - oceanFloor`. Sotto, l'isola si abbassa in proporzione — che e'
   * anche il comportamento giusto, un isolotto non ha una vetta da 40 voxel.
   */
  maxReliefSlope: 0.3,

  // --- Campo di rumore ----------------------------------------------------

  /**
   * Quattro ottave di simplex sommate con ampiezza `persistence^i` e frequenza
   * `baseFrequency * lacunarity^i`.
   *
   * Le frequenze sono deliberatamente basse. Il criterio "due colonne adiacenti
   * non differiscono di piu' di 1 in altezza" e' un vincolo di Lipschitz sul
   * campo continuo: con un rilievo di `maxHeight - oceanFloor` voxel, la somma
   * pesata `Σ w_i * f_i` moltiplicata per il gradiente massimo del simplex deve
   * restare sotto ~1 voxel per voxel, maschera radiale inclusa. Alzare
   * `baseFrequency` o `maxHeight` rompe quel test: `heightField.test.ts` misura
   * il margine effettivo.
   */
  octaves: 4,
  baseFrequency: 1 / 192,
  lacunarity: 2,
  persistence: 0.5,

  /**
   * Quota che la maschera radiale alza da sola, come frazione del rilievo. Il
   * rumore si prende il resto. Senza questo termine l'isola dipende troppo da
   * dove cadono le creste del seed: alcuni seed davano un banco piatto senza
   * collina ne' roccia.
   */
  domeBias: 0.35,

  /** Sale del seed per ottava: tiene le ottave indipendenti fra loro. */
  noiseSalt: 0x5eed_1a1d,

  /**
   * Deformazione del raggio della maschera radiale.
   *
   * Senza, l'isola e' un'ellisse e le fasce di bioma escono come cerchi
   * concentrici: un bersaglio, non una costa. Un rumore a frequenza molto bassa
   * che allunga e accorcia il raggio rompe la simmetria con poche anse larghe,
   * e costa quasi nulla in gradiente proprio perche' e' cosi' lento.
   *
   * `warpAmount` ha un tetto duro intorno a 0,26: e' il punto in cui la
   * maschera sul bordo della region sale abbastanza da portare una colonna di
   * rumore massimo sopra `seaLevel`, cioe' terra attaccata al bordo invece di
   * acqua. Sotto quel valore l'isola resta circondata d'acqua per costruzione.
   */
  warpAmount: 0.16,
  warpFrequency: 1 / 320,
  warpSalt: 0x00c0_a571,

  // --- Soglie di bioma ----------------------------------------------------
  //
  // Valutate nell'ordine di `classifyBiome`: oceano, spiaggia, roccia, collina,
  // foresta, pianura. Le soglie di altezza sono in voxel, quelle di pendenza in
  // voxel per voxel (dislivello massimo verso i quattro vicini ortogonali).

  /** Sopra il mare ma entro questa quota si resta costa. */
  beachMaxHeight: 11,

  /**
   * Roccia, collina e foresta si dividono il rilievo in fasce da cinque voxel
   * sopra la pianura. Il tetto e' `rockMinHeight`: la calibrazione del rumore
   * garantisce che ogni seed arrivi almeno li', altrimenti esisterebbero isole
   * senza vetta (`heightField.test.ts` lo verifica).
   */
  rockMinHeight: 25,
  rockMinSlope: 0.52,

  hillMinHeight: 20,
  hillMinSlope: 0.42,

  forestMinHeight: 15,
  forestMinSlope: 0.36,

  /**
   * Pendenza massima per cui una colonna resta edificabile. Sta sotto
   * `forestMinSlope` di proposito: le colonne edificabili sono le piu' dolci
   * della loro fascia, non tutta la fascia.
   */
  buildableMaxSlope: 0.34,

  // --- Stratigrafia della colonna -----------------------------------------

  /** Voxel di sottosuolo sotto la superficie prima di passare al fondo. */
  subsoilDepth: 3,

  /** Voxel d'acqua chiara sopra l'acqua profonda. */
  waterSurfaceDepth: 2,
} as const;

/** Biomi su cui si puo' costruire, prima di applicare la soglia di pendenza. */
export const BUILDABLE_BIOMES: readonly boolean[] = [
  false, // ocean
  false, // beach
  true, //  plain
  true, //  forest
  true, //  hill
  false, // rock
];

/** Strati di una colonna: superficie, sottosuolo, fondo. Indici di palette. */
export interface BiomeStrata {
  readonly surface: number;
  readonly subsoil: number;
  readonly deep: number;
}

/**
 * Colori per bioma, in ordine di `BIOME`.
 *
 * La palette resta quella del motore: 32 slot esatti, fissati dall'uniform
 * `vec3[32]`. Non ci sono indici nuovi da aggiungere, quindi il terreno riusa
 * gli slot esistenti e questa tabella e' l'unico posto dove si legge quale
 * tinta fa cosa.
 */
export const BIOME_STRATA: readonly BiomeStrata[] = [
  // ocean — sabbia bagnata sul fondale
  { surface: PALETTE_SLOTS.stoneWarm, subsoil: PALETTE_SLOTS.stoneDark, deep: PALETTE_SLOTS.stoneDeep },
  // beach — sabbia asciutta, la piu' chiara del gruppo `stone`
  { surface: PALETTE_SLOTS.stone, subsoil: PALETTE_SLOTS.stoneWarm, deep: PALETTE_SLOTS.stoneDeep },
  // plain — erba su terra
  { surface: PALETTE_SLOTS.grass, subsoil: PALETTE_SLOTS.wood, deep: PALETTE_SLOTS.stoneDeep },
  // forest — erba scura su terra
  { surface: PALETTE_SLOTS.grassDark, subsoil: PALETTE_SLOTS.wood, deep: PALETTE_SLOTS.stoneDeep },
  // hill — erba chiara su sabbia compatta
  { surface: PALETTE_SLOTS.grassLight, subsoil: PALETTE_SLOTS.stoneWarm, deep: PALETTE_SLOTS.stoneDeep },
  // rock — il gruppo `concrete` fa sia il cemento della citta' sia la roccia nuda
  { surface: PALETTE_SLOTS.concreteLight, subsoil: PALETTE_SLOTS.concrete, deep: PALETTE_SLOTS.stoneDeep },
];

/** Acqua: chiara in superficie, scura in profondita'. */
export const WATER_IDS = {
  surface: PALETTE_SLOTS.water,
  deep: PALETTE_SLOTS.waterDeep,
} as const;

/** Parametri delle decorazioni voxel. Le probabilita' sono per cella 6x6. */
export const TREE_DECOR = {
  /** Raggio massimo della chioma; definisce anche l'anello valutato dai blocchi. */
  ring: 2,
  cellSize: 6,
  /** Una cella puo' scegliere solo una delle quattro posizioni interne 2x2. */
  jitterSize: 2,
  /** Densita' per bioma: niente alberi su oceano, spiaggia e roccia. */
  density: [0, 0, 0.18, 0.62, 0.34, 0] as const,
} as const;

/**
 * Tinte piatte del toggle "colora per bioma" della scena di debug. Servono solo
 * a leggere le fasce a colpo d'occhio, non a fare bella figura.
 */
export const BIOME_DEBUG_IDS: readonly number[] = [
  PALETTE_SLOTS.glassDeep, //     ocean  — blu pieno
  PALETTE_SLOTS.metalBrass, //    beach  — giallo
  PALETTE_SLOTS.grassPale, //     plain  — verde chiaro
  PALETTE_SLOTS.grassDark, //     forest — verde scuro
  PALETTE_SLOTS.metalRust, //     hill   — arancio
  PALETTE_SLOTS.concretePale, //  rock   — grigio chiaro
];
