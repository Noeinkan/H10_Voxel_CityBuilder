import type { BuildingClass, CatalystId, DistrictId, Specialization } from '../../sim';
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

  /**
   * Isolati di raggio entro cui cercare un lotto quando il proprio e' pieno.
   *
   * La simulazione ripropone le stesse colonne finche' il campo resta saturo:
   * senza questa ricerca la citta' si ferma appena il primo isolato si riempie.
   * Due basta a scavalcare un isolato pieno e uno inutilizzabile di fila, e
   * tiene lo scarto dalla colonna proposta sotto una trentina di colonne.
   */
  blockSearchRadius: 2,

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

  /**
   * Voxel di superficie urbana scritti per frame.
   *
   * Contava celle finche' una cella valeva un voxel. Dalla 4.2 una cella puo'
   * essere un molo alto sei, e il budget deve restare quello che e': un tetto
   * sul lavoro per frame, non sul numero di colonne toccate.
   */
  surfaceVoxelsPerFrame: 48,

  /** Quota sopra il terreno bonificata da tronchi e chiome. */
  decorClearanceHeight: 7,

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

  /**
   * Raggio di Chebyshev entro cui una colonna non edificabile fa "costa".
   *
   * Serve alla sola selezione della tipologia: e' cio' che distingue un mercato
   * sul porto da un mercato qualunque. Sette colonne perche' l'impronta massima
   * e' quattro e il mercato deve vedere l'acqua, non sfiorarla.
   */
  coastalRadius: 7,

  /** Quanto il profilo locale anticipa il livello con cui nasce un edificio. */
  localLevel: {
    density: 1.4,
    wealth: 0.9,
    accessibility: 0.7,
    satisfaction: 0.5,
  },

  /** Riduzione della soglia di upgrade prodotta dalle qualita locali. */
  localUpgrade: {
    density: 18,
    wealth: 14,
    accessibility: 10,
    satisfaction: 8,
    maxDiscount: 38,
  },

  /** Le stesse qualita cambiano anche la grammatica, non solo l'altezza. */
  localForm: {
    densityBandBias: 2,
    accessibilityFootprintBias: -1,
    satisfactionTerraceBias: 0.22,
    wealthTerraceBias: 0.12,
    wealthAccentChance: 0.24,
  },
} as const;

export interface BuildingForm {
  readonly density: number;
  readonly wealth: number;
  readonly accessibility: number;
  readonly satisfaction: number;
}

export const DEFAULT_BUILDING_FORM: BuildingForm = {
  density: 0,
  wealth: 0,
  accessibility: 0,
  satisfaction: 0,
};

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
 * I quattro usi urbani, indicizzati come `BUILDING_CLASS`.
 *
 * E' il colore e la proporzione *di base* di un uso: la tipologia (sotto) ne
 * sovrascrive quel che le serve. Un uso senza tipologia riconosciuta resta
 * comunque leggibile, ed e' cio' che tiene in piedi la citta' anche nelle
 * colonne che non esprimono niente di particolare.
 *
 * I colori escono tutti dai 32 slot esistenti: l'uniform `vec3[32]` e' un
 * invariante del progetto, e un edificio non e' una buona ragione per
 * consumarne uno nuovo.
 */
export const CLASS_PROFILE: readonly ClassProfile[] = [
  // residenziale — moduli terrazzati e scafi chiari, massa di fondo della citta'.
  {
    bandHeight: [2, 3],
    shrinkBias: 0.38,
    footprintBias: 1,
    body: PALETTE_SLOTS.concretePale,
    bodyAlt: PALETTE_SLOTS.glassDeep,
    accent: PALETTE_SLOTS.glass,
    crown: PALETTE_SLOTS.roofPale,
    plinth: PALETTE_SLOTS.metalDark,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 2,
  },
  // commerciale — fronti caldi e bassi, insegne d'ottone, tetti larghi.
  {
    bandHeight: [2, 3],
    shrinkBias: 0.24,
    footprintBias: 1,
    body: PALETTE_SLOTS.brick,
    bodyAlt: PALETTE_SLOTS.brickLight,
    accent: PALETTE_SLOTS.metalBrass,
    crown: PALETTE_SLOTS.roofPale,
    plinth: PALETTE_SLOTS.stoneWarm,
    roofProp: PALETTE_SLOTS.metalGold,
    roofPropHeight: 2,
  },
  // industriale — megastrutture compatte, corazze e apparati di dissipazione.
  {
    bandHeight: [2, 3],
    shrinkBias: 0.18,
    footprintBias: 1,
    body: PALETTE_SLOTS.stoneDeep,
    bodyAlt: PALETTE_SLOTS.metalDark,
    accent: PALETTE_SLOTS.metalRust,
    crown: PALETTE_SLOTS.metalDark,
    plinth: PALETTE_SLOTS.asphaltDark,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 3,
  },
  // civico — guglie vetrate ed esoscheletri chiari, i landmark dello skyline.
  {
    bandHeight: [3, 4],
    shrinkBias: 0.62,
    footprintBias: 0,
    body: PALETTE_SLOTS.concreteWhite,
    bodyAlt: PALETTE_SLOTS.glassPale,
    accent: PALETTE_SLOTS.glassDeep,
    crown: PALETTE_SLOTS.roofWhite,
    plinth: PALETTE_SLOTS.concrete,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 3,
  },
];

// --- Catalogo delle tipologie ---------------------------------------------

/**
 * Come si legge una tipologia.
 *
 * Una tipologia e' *forma piu' condizioni*: sotto quali condizioni locali
 * quell'uso prende quella forma. Non e' un modello disegnato a mano — la
 * grammatica di `generate.ts` resta la stessa — ma un insieme di parametri che
 * la piegano, piu' tre interruttori strutturali (podio, corte, coronamento
 * piatto) che da soli producono silhouette non confondibili.
 *
 * Aggiungere una tipologia significa aggiungere una riga qui. Non c'e' codice
 * da scrivere da nessun'altra parte: la selezione in `typology.ts` e' generica,
 * e i suoi criteri sono i campi di questa struttura.
 */
export interface TypologyShape {
  /**
   * Fasce di base che riempiono l'impronta senza rientrare.
   *
   * Il podio e' cio' che distingue un podio commerciale con abitazioni sopra da
   * una torre qualunque: due fasce piene, poi un arretramento netto. Su un
   * edificio misto il podio prende anche il colore del secondo uso, e la
   * divisione delle funzioni si legge dal basamento.
   */
  readonly podiumBands: number;
  /** Svuota il cuore delle fasce larghe: e' l'isolato a corte. */
  readonly courtyard: boolean;
  /** Coronamento basso e nessun dettaglio verticale sul tetto. */
  readonly flatCrown: boolean;
  /** Lato minimo dell'impronta imposto dalla tipologia. */
  readonly minFootprint: number;
  /** Lato massimo dell'impronta imposto dalla tipologia. */
  readonly maxFootprint: number;
}

export interface TypologyRequirement {
  /** Uso primario a cui la tipologia si applica. */
  readonly use: BuildingClass;
  /** Se presente, la tipologia vale solo su edifici misti con questo secondo uso. */
  readonly mixed?: BuildingClass;
  readonly specialization?: Specialization;
  /** Basta uno dei ruoli elencati fra i catalizzatori che coprono la colonna. */
  readonly roles?: readonly CatalystId[];
  readonly districts?: readonly DistrictId[];
  /** La colonna deve affacciare sul mare entro il raggio di ricerca del Builder. */
  readonly coastal?: boolean;
  readonly minLevel?: number;
  readonly minDensity?: number;
  readonly maxDensity?: number;
  readonly minWealth?: number;
  readonly minAccessibility?: number;
  readonly minSatisfaction?: number;
  readonly minIndustry?: number;
}

export interface TypologyDefinition extends TypologyRequirement {
  readonly id: string;
  readonly label: string;
  /**
   * Specificita' della tipologia.
   *
   * Fra tutte le tipologie che accettano una colonna vince quella con la
   * priorita' piu' alta, e a parita' vince la prima del catalogo. Non e' un
   * peso probabilistico: una scelta casuale renderebbe illeggibile la relazione
   * fra luogo e forma, che e' esattamente cio' che questa fase deve mostrare.
   */
  readonly priority: number;
  readonly shape: TypologyShape;
  /** Cio' che la tipologia sovrascrive del profilo dell'uso. */
  readonly profile: Partial<ClassProfile>;
}

/** Forma senza vincoli: la grammatica di `generate.ts` lasciata libera. */
export const DEFAULT_TYPOLOGY_SHAPE: TypologyShape = {
  podiumBands: 0,
  courtyard: false,
  flatCrown: false,
  minFootprint: 2,
  maxFootprint: MAX_FOOTPRINT,
};

/**
 * Il catalogo, in ordine di lettura per uso.
 *
 * Ogni uso chiude con una riga a priorita' zero e senza condizioni: e' la forma
 * che quell'uso prende quando il luogo non dice niente di piu' preciso, e
 * garantisce che la selezione trovi sempre una risposta.
 */
export const TYPOLOGIES: readonly TypologyDefinition[] = [
  // --- residenziale --------------------------------------------------------
  {
    id: 'shophouse',
    label: 'Shophouse',
    use: 0,
    mixed: 1,
    // Nessuna condizione sul luogo: e' *la* forma dell'uso misto, quella che
    // vale ovunque un secondo uso attecchisca. Dove il podio commerciale
    // qualifica — densita' alta e livello alto — vince lui, che ha priorita'
    // maggiore; qui sotto resta la casa-bottega.
    priority: 3,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, flatCrown: true, maxFootprint: 3 },
    profile: {
      bandHeight: [2, 2],
      shrinkBias: 0.12,
      body: PALETTE_SLOTS.brickLight,
      bodyAlt: PALETTE_SLOTS.wood,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneWarm,
    },
  },
  {
    id: 'commercialPodium',
    label: 'Podium block',
    use: 0,
    mixed: 1,
    minDensity: 0.4,
    minLevel: 2,
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 2, minFootprint: 3 },
    profile: {
      bandHeight: [2, 3],
      shrinkBias: 0.58,
      body: PALETTE_SLOTS.concretePale,
      bodyAlt: PALETTE_SLOTS.glassDeep,
      accent: PALETTE_SLOTS.glass,
    },
  },
  {
    id: 'courtyardBlock',
    label: 'Courtyard block',
    use: 0,
    minDensity: 0.3,
    minLevel: 2,
    priority: 2,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, courtyard: true, flatCrown: true, minFootprint: 4 },
    profile: {
      bandHeight: [2, 3],
      shrinkBias: 0.08,
      body: PALETTE_SLOTS.concrete,
      bodyAlt: PALETTE_SLOTS.concreteLight,
      accent: PALETTE_SLOTS.brickLight,
    },
  },
  {
    id: 'towerBlock',
    label: 'Tower block',
    use: 0,
    minDensity: 0.55,
    minLevel: 4,
    priority: 4,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, maxFootprint: 3 },
    profile: { bandHeight: [3, 4], shrinkBias: 0.72 },
  },
  { id: 'terracedHousing', label: 'Terraced housing', use: 0, priority: 0, shape: DEFAULT_TYPOLOGY_SHAPE, profile: {} },

  // --- commerciale ---------------------------------------------------------
  {
    id: 'harborMarket',
    label: 'Harbor market',
    use: 1,
    roles: ['port'],
    coastal: true,
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, flatCrown: true, minFootprint: 3 },
    profile: {
      bandHeight: [2, 2],
      shrinkBias: 0.08,
      footprintBias: 2,
      body: PALETTE_SLOTS.wood,
      bodyAlt: PALETTE_SLOTS.brickLight,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'officeTower',
    label: 'Office tower',
    use: 1,
    specialization: 'office',
    minLevel: 3,
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, minFootprint: 3 },
    profile: {
      bandHeight: [3, 4],
      shrinkBias: 0.78,
      body: PALETTE_SLOTS.glassDeep,
      bodyAlt: PALETTE_SLOTS.glassDark,
      accent: PALETTE_SLOTS.glassPale,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.stoneDark,
      roofPropHeight: 4,
    },
  },
  {
    id: 'hotel',
    label: 'Hotel',
    use: 1,
    specialization: 'tourism',
    minLevel: 2,
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, minFootprint: 3 },
    profile: {
      bandHeight: [2, 3],
      shrinkBias: 0.28,
      body: PALETTE_SLOTS.concreteWhite,
      bodyAlt: PALETTE_SLOTS.roofPale,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stoneWarm,
    },
  },
  {
    id: 'entertainmentHall',
    label: 'Entertainment hall',
    use: 1,
    specialization: 'entertainment',
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, flatCrown: true, minFootprint: 3 },
    profile: {
      bandHeight: [3, 4],
      shrinkBias: 0.18,
      body: PALETTE_SLOTS.brickDark,
      bodyAlt: PALETTE_SLOTS.brick,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.metalBrass,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  { id: 'retailRow', label: 'Retail row', use: 1, priority: 0, shape: { ...DEFAULT_TYPOLOGY_SHAPE, flatCrown: true, maxFootprint: 3 }, profile: { bandHeight: [2, 2] } },

  // --- industriale ---------------------------------------------------------
  {
    id: 'logisticsDepot',
    label: 'Logistics depot',
    use: 2,
    specialization: 'logistics',
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, flatCrown: true, minFootprint: 4 },
    profile: {
      bandHeight: [2, 2],
      shrinkBias: 0,
      footprintBias: 2,
      body: PALETTE_SLOTS.asphalt,
      bodyAlt: PALETTE_SLOTS.metalDark,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
    },
  },
  {
    id: 'productionLoft',
    label: 'Production loft',
    use: 2,
    minLevel: 2,
    priority: 2,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, flatCrown: true, minFootprint: 3 },
    profile: { bandHeight: [2, 2], shrinkBias: 0.05, footprintBias: 2 },
  },
  { id: 'industrialYard', label: 'Industrial yard', use: 2, priority: 0, shape: DEFAULT_TYPOLOGY_SHAPE, profile: {} },

  // --- civico --------------------------------------------------------------
  {
    id: 'universityLab',
    label: 'University lab',
    use: 3,
    specialization: 'research',
    minLevel: 2,
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, courtyard: true, flatCrown: true, minFootprint: 4 },
    profile: {
      bandHeight: [3, 3],
      shrinkBias: 0.12,
      body: PALETTE_SLOTS.concreteWhite,
      bodyAlt: PALETTE_SLOTS.glassPale,
      accent: PALETTE_SLOTS.glassDeep,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stone,
    },
  },
  {
    id: 'culturalPavilion',
    label: 'Cultural pavilion',
    use: 3,
    roles: ['monument', 'park'],
    maxDensity: 0.6,
    priority: 4,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, minFootprint: 3 },
    profile: {
      bandHeight: [3, 4],
      shrinkBias: 0.34,
      body: PALETTE_SLOTS.stoneWarm,
      bodyAlt: PALETTE_SLOTS.concreteWhite,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stone,
      roofProp: PALETTE_SLOTS.metalGold,
    },
  },
  { id: 'civicSpire', label: 'Civic spire', use: 3, priority: 0, shape: DEFAULT_TYPOLOGY_SHAPE, profile: {} },
];

export type TypologyId = (typeof TYPOLOGIES)[number]['id'];

const TYPOLOGY_BY_ID = new Map<string, TypologyDefinition>(
  TYPOLOGIES.map((entry) => [entry.id, entry]),
);

export function typologyById(id: string): TypologyDefinition | null {
  return TYPOLOGY_BY_ID.get(id) ?? null;
}
