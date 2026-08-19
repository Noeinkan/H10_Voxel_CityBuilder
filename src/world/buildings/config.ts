import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Unica fonte di verita' dei numeri della costruzione.
 *
 * Vale qui la stessa regola di `terrain/config.ts` e `sim/balance.ts`: nessun
 * altro file di `src/world/buildings/` contiene una soglia, una cadenza o un
 * indice di palette. La ragione non e' l'ordine ma la separazione dei domini —
 * `balance.ts` descrive le regole della simulazione, e se un edificio viene su
 * troppo alto o troppo spesso la risposta sta in questo file, mai in quello.
 * Toccare `balance.ts` per far tornare un conto visivo sposterebbe il pareggio
 * alimentare per rendere piu' bella una torre.
 */

/** Ritmo con cui il Builder consuma le decisioni della simulazione. */
export const BUILDER = {
  /** Tick fra un'infornata di costruzioni e la successiva. */
  ticksPerBuild: 2,

  /** Edifici accettati al massimo per infornata. */
  sitesPerBuild: 3,

  /**
   * Moltiplicatore dei candidati richiesti a `nextBuildSites`.
   *
   * La simulazione ragiona per colonna e non sa niente di footprint, pendenza o
   * chunk: una parte dei suoi candidati e' inevitabilmente inutilizzabile. Senza
   * sovra-prelievo un'infornata da tre finirebbe spesso a zero, e la citta'
   * crescerebbe a scatti invece che di continuo.
   */
  candidateOverfetch: 6,

  /** Tick fra una passata di upgrade e la successiva. */
  ticksPerUpgrade: 10,

  /**
   * Record esaminati in una passata di upgrade.
   *
   * La passata riparte da dove si era fermata invece di ricominciare da capo:
   * con duemila edifici, rileggere il campo su tutti a ogni passata sarebbe la
   * sola cosa nel ciclo il cui costo cresce con la citta'.
   */
  upgradesPerPass: 64,

  /** Livello massimo raggiungibile. Oltre, un edificio smette di crescere. */
  maxLevel: 6,

  /**
   * Desiderabilita' che la colonna deve superare per promuovere un edificio al
   * livello indicato dall'indice. Il livello 0 non ha soglia: e' la costruzione
   * iniziale, che passa dalle soglie della simulazione.
   *
   * Salgono piu' in fretta di quanto scenda la desiderabilita': e' cio' che fa
   * convergere l'altezza invece di farla salire finche' c'e' un catalizzatore.
   */
  upgradeThreshold: [0, 50, 78, 108, 138, 168, 198] as readonly number[],

  /**
   * Dislivello massimo, in voxel, che una fondazione puo' colmare.
   *
   * Sopra questa soglia il sito viene scartato **per sempre**: la pendenza di
   * una colonna non cambia mai — nessuno scava e nessuno riporta terra — quindi
   * ritentarla darebbe lo stesso esito a ogni infornata, per sempre.
   */
  maxTerrainStep: 3,

  /**
   * Chunk che un singolo edificio puo' marcare sporchi, fondazione inclusa.
   *
   * E' un tetto duro verificato prima di scrivere, non una speranza: un edificio
   * che sfora viene scartato. Otto copre una torre alta a cavallo di una
   * cucitura senza lasciare che un singolo upgrade sporchi una regione intera.
   */
  maxDirtyChunksPerBuilding: 8,

  /** Cubi scritti per frame per struttura: la crescita e' voxel-per-voxel. */
  voxelsPerFrame: 16,

  /**
   * Edifici che possono crescere contemporaneamente.
   *
   * La coda non e' un limite di memoria ma di frame: ogni edificio in crescita
   * sporca i suoi chunk una volta per fascia, e sporcare cento chunk nello
   * stesso frame e' esattamente il picco che fa cadere il fps sotto la soglia.
   */
  maxGrowing: 12,

  /** Celle di piazzole e sentieri applicate per frame. */
  surfaceCellsPerFrame: 24,

  /** Quota sopra il terreno bonificata da tronchi e chiome. */
  decorClearanceHeight: 7,

  /** Lunghezza massima di un collegamento decorativo fra due piazzole. */
  pathLinkDistance: 12,

  /** Raggio Manhattan della piazzola che identifica un catalizzatore. */
  catalystPlazaRadius: 2,

  /**
   * Probabilita' che un edificio prenda il colore d'accento come corpo.
   *
   * Non e' un dettaglio decorativo: e' cio' che produce blocchi interi di colore
   * caldo dentro un fondo pallido invece di una picchiettatura uniforme, che a
   * distanza si legge come rumore.
   */
  accentBuildingChance: 0.18,
} as const;

/**
 * Tetti per livello.
 *
 * Il livello e' l'unica leva che fa crescere un edificio, e cresce solo per
 * desiderabilita'. Footprint e fasce salgono insieme perche' una torre stretta e
 * altissima su una base 1x1 si legge come un palo, non come un edificio.
 */
/** Lato massimo assoluto di un'impronta, su qualunque livello. */
export const MAX_FOOTPRINT = 4;

export interface LevelCaps {
  /** Lato minimo naturale; durante un upgrade bloccato puo' restare piu' stretto. */
  readonly minFootprint: number;
  /** Lato massimo dell'impronta, in voxel. */
  readonly maxFootprint: number;
  readonly minBands: number;
  readonly maxBands: number;
}

export const LEVEL_CAPS: readonly LevelCaps[] = [
  { minFootprint: 2, maxFootprint: 3, minBands: 1, maxBands: 2 },
  { minFootprint: 2, maxFootprint: 3, minBands: 2, maxBands: 3 },
  { minFootprint: 2, maxFootprint: 4, minBands: 3, maxBands: 4 },
  { minFootprint: 3, maxFootprint: 4, minBands: 4, maxBands: 5 },
  { minFootprint: 3, maxFootprint: 4, minBands: 5, maxBands: 6 },
  { minFootprint: 3, maxFootprint: 4, minBands: 6, maxBands: 7 },
  { minFootprint: 4, maxFootprint: 4, minBands: 7, maxBands: 8 },
];

/**
 * Distribuzione del livello iniziale, cumulata.
 *
 * Coda lunga di proposito: quasi tutto nasce al livello base e pochissimo piu'
 * su. Uno skyline e' fatto di molti volumi bassi e pochi picchi; una
 * distribuzione uniforme darebbe un altopiano, che a colpo d'occhio non si legge
 * come una citta'.
 */
export const START_LEVEL_CDF: readonly number[] = [0.78, 0.94, 0.985, 0.997, 1, 1, 1];

/** Proporzioni e colori di una classe. */
export interface ClassProfile {
  /** Altezza di una fascia, estremi inclusi. */
  readonly bandHeight: readonly [number, number];

  /**
   * Quanto la classe tende a restringersi salendo, in 0..1.
   *
   * A 1 ogni fascia rientra e l'edificio e' un gradone; a 0 le fasce si spostano
   * e sporgono senza rimpicciolire, e l'edificio resta un blocco irregolare.
   */
  readonly shrinkBias: number;

  /** Preferenza di impronta applicata al tiro comune, prima del clamp di livello. */
  readonly footprintBias: number;

  /** Corpo. */
  readonly body: number;
  /** Cornice: il voxel di sommita' di ogni fascia. */
  readonly bodyAlt: number;
  /** Faccia d'accento, e corpo intero quando l'accento sale di scala. */
  readonly accent: number;
  /** Coronamento. */
  readonly crown: number;
  /** Zoccolo a contatto col terreno. */
  readonly plinth: number;
  /** Unico dettaglio verticale sul tetto. */
  readonly roofProp: number;
  /** Altezza del dettaglio sul tetto. */
  readonly roofPropHeight: number;
}

/**
 * Le tre classi, indicizzate come `BUILDING_CLASS`.
 *
 * I colori escono tutti dai 32 slot esistenti: l'uniform `vec3[32]` e' un
 * invariante del progetto, e un edificio non e' una buona ragione per
 * consumarne uno nuovo.
 */
export const CLASS_PROFILE: readonly ClassProfile[] = [
  // residential — bassa, larga, calda. E' la massa di fondo della citta'.
  {
    bandHeight: [2, 3],
    shrinkBias: 0.25,
    footprintBias: 1,
    body: PALETTE_SLOTS.concretePale,
    bodyAlt: PALETTE_SLOTS.concrete,
    accent: PALETTE_SLOTS.metalRust,
    crown: PALETTE_SLOTS.roofPale,
    plinth: PALETTE_SLOTS.stoneWarm,
    roofProp: PALETTE_SLOTS.brickDark,
    roofPropHeight: 1,
  },
  // production — tozza, materica, senza slancio.
  {
    bandHeight: [2, 3],
    shrinkBias: 0.15,
    footprintBias: 1,
    body: PALETTE_SLOTS.stoneWarm,
    bodyAlt: PALETTE_SLOTS.stone,
    accent: PALETTE_SLOTS.brick,
    crown: PALETTE_SLOTS.metalDark,
    plinth: PALETTE_SLOTS.stoneDark,
    roofProp: PALETTE_SLOTS.metalRust,
    roofPropHeight: 2,
  },
  // civic — slanciata e chiara: sono i picchi che reggono lo skyline.
  {
    bandHeight: [3, 4],
    shrinkBias: 0.5,
    footprintBias: 0,
    body: PALETTE_SLOTS.concreteWhite,
    bodyAlt: PALETTE_SLOTS.concreteLight,
    accent: PALETTE_SLOTS.glassDeep,
    crown: PALETTE_SLOTS.roofWhite,
    plinth: PALETTE_SLOTS.concrete,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 3,
  },
];
