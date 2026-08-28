import type { BuildingClass, CatalystId, CharterId, DistrictId, Specialization } from '../../../sim';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import type { ClassProfile } from './classProfile';
import {
  BAND_OP,
  CROWN_KIND,
  LOT_ROLE,
  MAX_FOOTPRINT,
  type CrownKind,
  type LotRole,
} from './grammar';

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
  /** Come si chiude la silhouette. Vedi `CROWN_KIND`. */
  readonly crownKind: CrownKind;
  /**
   * Pianta le rientranze scoperte invece di lasciarle pavimentate.
   *
   * Il bordo resta comunque terrazza — ci si affaccia, e il parapetto lo dice —
   * ma il cuore dell'anello diventa verde. Non e' una fascia in piu' ne' un
   * volume: e' lo stesso voxel di sommita', con un altro slot.
   */
  readonly roofGarden: boolean;
  /**
   * Angoli tagliati in pianta, in voxel di lato. Zero e' lo spigolo vivo.
   *
   * E' lo stesso `chamfer` di `Part.chamfer` nei landmark, e usa lo stesso
   * predicato — `planMask.ts`, che vive alla radice di `src/world/` proprio
   * perche' i due domini lo condividono. Un edificio smussato di uno e' un
   * ottagono, di due un tamburo: due forme che la grammatica delle fasce non sa
   * produrre in nessun altro modo, perche' `BandRect` e' e resta un rettangolo.
   *
   * **Non e' una fascia in piu' e non cambia l'impronta**: e' lo stesso volume
   * con quattro colonne in meno agli angoli, quindi collisione, budget di chunk e
   * cancellazione non se ne accorgono. L'unico che se ne accorge, e nel verso
   * giusto, e' `stampFootprint`: l'opera di terra smette di riempire un angolo
   * che l'edificio non occupa.
   */
  readonly chamfer: number;

  /**
   * Il piano terra sul fronte strada diventa un portico.
   *
   * **E' l'unica cosa del repertorio che fa vuoto sotto un pieno.** Le fasce
   * sanno rientrare, sporgere e sovrapporsi, ma quello che producono e' sempre
   * un solido appoggiato: un porticato no, e a distanza di gioco e' proprio
   * quell'ombra sotto il fronte a dire che li' sotto ci si cammina. La colonnata
   * dei landmark lo sa fare da sempre (`PART.colonnade`); qui e' la stessa idea
   * ridotta a una riga di catalogo.
   *
   * I pilastri seguono il passo dei montanti della classe (`bayPeriod`) e si
   * contano dall'estremo piu' vicino, non da un capo: contati da un capo, un
   * fronte che non e' multiplo del passo si ritrova il pilastro su un angolo e
   * l'architrave nudo sull'altro.
   */
  readonly arcade: boolean;

  /**
   * Voxel di cui il corpo puo' sporgere oltre l'impronta, verso la strada.
   *
   * **E' l'unico campo che rompe un invariante dichiarato**, e vale la pena
   * dirlo qui: «nessuna fascia esce dall'impronta» era vero e non lo e' piu'.
   * Regge per la stessa ragione della mensola di `aerial/` — `overlaps` confronta
   * gli intervalli di quota colonna per colonna, quindi prenotare aria sopra il
   * marciapiede non toglie niente a nessuno — e con lo stesso complemento:
   * **uno sbalzo non prende suolo**, quindi sotto ci passa ancora la carreggiata
   * e accanto nasce ancora un lotto.
   *
   * Sporge **solo verso `facing`**, e non e' una comodita': verso il cuore
   * dell'isolato ci sarebbe il vicino, e due inviluppi che si toccano sono voxel
   * sovrascritti. Un edificio senza fronte strada non sporge affatto — non c'e'
   * una via su cui farlo.
   */
  readonly overhang: number;

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
  /**
   * Mandati che concedono la tipologia: ne basta uno fra quelli che si sentono
   * sulla colonna.
   *
   * E' la forma piu' leggibile che una decisione puo' prendere. Un vettore
   * numerico sposta una soglia e a volte non scavalla niente; una riga concessa
   * da un mandato produce edifici che senza quella scelta non possono
   * comparire, e la differenza fra due partite si vede a colpo d'occhio.
   */
  readonly charter?: readonly CharterId[];
  readonly districts?: readonly DistrictId[];
  /**
   * Dove il lotto cade dentro il proprio isolato: angolo, fronte o cuore.
   *
   * **Non entra in `demandsPlace`** e non deve: il ruolo lo sa la maglia
   * stradale, che c'e' sempre. Chi chiede una tipologia senza un lotto — una
   * scena di prova, la rigenerazione di ripiego — non lo passa, e le righe che lo
   * dichiarano restano fuori per confronto diretto invece che per un ramo.
   */
  readonly lotRole?: LotRole;
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
  /**
   * Tipologie da cui questa puo' nascere **per upgrade**, quando il luogo e'
   * gia' occupato da una di loro.
   *
   * Vale solo per la selezione di un upgrade: alla nascita la linea non conta e
   * ogni riga che il luogo accetta resta selezionabile. Un upgrade adotta una
   * tipologia diversa solo se la linea lo ammette — la corrente la dichiara —
   * altrimenti l'edificio mantiene la propria. Le righe di ripiego a priorita'
   * zero sono punti di partenza e non compaiono mai come esito di un upgrade,
   * se non per restare se' stesse.
   *
   * **Le linee sono un albero e non una rete**, e il test delle linee lo
   * verifica: niente cicli, niente transizioni laterali o inverse. Una
   * casa-bottega diventa un podio commerciale e un capannone una torre
   * idroponica, mai il contrario: la crescita racconta un progresso, non un
   * giro.
   *
   * **Una cima puo' portare a un'altra cima, ma solo in salita**, e la regola
   * che tiene in piedi la frase e' che la seconda chieda *strettamente di piu'*
   * della prima: un livello piu' alto, o una soglia che la prima non poneva. La
   * torre liscia chiede densita' al livello quattro, il gradone abitato ci
   * aggiunge la ricchezza al cinque e il tamburo il fronte strada al sei —
   * salire quella scala e' un progresso, e nessuno dei tre passi si puo'
   * percorrere all'indietro. Senza questo, la cima piu' bassa vinceva per prima e
   * congelava il lotto per tutti i livelli successivi: era il motivo per cui una
   * citta' matura era fatta di due sagome e le altre restavano scritte a
   * catalogo.
   */
  readonly evolvesFrom?: readonly string[];
}

/** Forma senza vincoli: la grammatica di `generate.ts` lasciata libera. */
export const DEFAULT_TYPOLOGY_SHAPE: TypologyShape = {
  podiumBands: 0,
  courtyard: false,
  crownKind: CROWN_KIND.taper,
  roofGarden: false,
  chamfer: 0,
  arcade: false,
  overhang: 0,
  minFootprint: 4,
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
    // La casa-bottega e' un punto di partenza: nessun upgrade la adotta, perche'
    // la sua linea va solo in avanti — verso il podio commerciale — e mai
    // all'indietro. La lista vuota dichiara esattamente questo: non un ripiego
    // per omissione, ma «mai per upgrade».
    evolvesFrom: [],
    // Nessuna condizione sul luogo: e' *la* forma dell'uso misto, quella che
    // vale ovunque un secondo uso attecchisca. Dove il podio commerciale
    // qualifica — densita' alta e livello alto — vince lui, che ha priorita'
    // maggiore; qui sotto resta la casa-bottega.
    priority: 3,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      podiumBands: 1,
      crownKind: CROWN_KIND.flat,
      maxFootprint: 6,
      // Il portico al piano terra non e' un ornamento aggiunto alla casa-bottega:
      // e' la casa-bottega. La «via di cinque piedi» — il marciapiede coperto
      // ricavato sotto il primo piano — e' cio' che distingue una shophouse da
      // una casa con un negozio dentro, ed e' anche il motivo per cui in una via
      // fitta si cammina all'ombra.
      arcade: true,
    },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.12,
      body: PALETTE_SLOTS.brickLight,
      bodyAlt: PALETTE_SLOTS.wood,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneWarm,
    },
  },
  {
    id: 'cornerTower',
    label: 'Corner tower',
    use: 0,
    lotRole: LOT_ROLE.corner,
    minDensity: 0.5,
    minLevel: 4,
    // Culminazione della linea residenziale: vi si arriva dalla casa a schiera
    // o da una delle forme intermedie, mai da un'altra verticale — due cime non
    // si scambiano il posto, la crescita racconta un progresso.
    evolvesFrom: ['terracedHousing', 'gardenHousing', 'rationedBlock', 'stackedTenement', 'courtyardBlock'],
    // Stessa priorita' di `commercialPodium` e **prima di lui nel catalogo**, che
    // e' come si dice «piu' specifico» a parita' di peso: dove il lotto e' un
    // angolo vince il vertice dell'isolato, altrove resta il podio. Sotto le due
    // righe concesse dai mandati, che restano l'affermazione piu' forte.
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.lantern,
      // Lo smusso su un angolo non e' decorazione: e' il taglio che gli edifici
      // veri hanno proprio li', dove due fronti si incontrano su un incrocio.
      chamfer: 1,
      maxFootprint: 6,
    },
    profile: {
      bandHeight: [5, 7],
      shrinkBias: 0.66,
      roofProp: PALETTE_SLOTS.metalGold,
      roofPropHeight: 6,
    },
  },
  {
    id: 'commercialPodium',
    label: 'Podium block',
    use: 0,
    mixed: 1,
    minDensity: 0.4,
    minLevel: 2,
    // Il podio e' la casa-bottega cresciuta: un misto che promuove diventa podio
    // quando la densita' lo merita, e la linea e' un solo passo — non c'e'
    // niente fra i due, e non c'e' niente oltre: un podio resta un podio.
    evolvesFrom: ['shophouse'],
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      podiumBands: 2,
      minFootprint: 6,
      // Podio pieno sulla strada e piani che sporgono sopra: e' la sezione piu'
      // comune di un fronte denso, ed e' anche la riga che porta lo sbalzo alla
      // maggioranza degli edifici invece che a un caso raro.
      overhang: 2,
    },
    profile: {
      bandHeight: [4, 6],
      shrinkBias: 0.58,
      growOps: [BAND_OP.jut, BAND_OP.jog, BAND_OP.grow, BAND_OP.shrinkOneSide],
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
    // Forma intermedia della linea residenziale: nasce dalla casa a schiera e
    // puo' culminare in una delle quattro verticali.
    evolvesFrom: ['terracedHousing'],
    priority: 2,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, courtyard: true, crownKind: CROWN_KIND.flat, minFootprint: 8 },
    profile: {
      bandHeight: [4, 6],
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
    // **Il primo scalino verticale, non piu' l'ultimo.** Era dichiarata
    // culminazione, e con `minLevel` a quattro era la piu' bassa delle quattro:
    // ogni lotto denso la adottava per primo e ci restava per i sedici livelli
    // successivi, perche' nessuna riga la dichiarava come provenienza. Le due
    // verticali che chiedono *piu'* di lei — la ricchezza, e un livello o due in
    // piu' — ora la elencano, e la torre liscia e' cio' da cui si parte quando il
    // quartiere e' solo fitto.
    evolvesFrom: ['terracedHousing', 'gardenHousing', 'rationedBlock', 'stackedTenement', 'courtyardBlock'],
    priority: 4,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, chamfer: 1, maxFootprint: 6 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.72,
      shrinkOps: [BAND_OP.stack, BAND_OP.setback, BAND_OP.shrinkOneSide],
      growOps: [BAND_OP.grow, BAND_OP.shear, BAND_OP.corner, BAND_OP.jog],
    },
  },
  {
    id: 'roundTower',
    label: 'Round tower',
    use: 0,
    minWealth: 0.6,
    minLevel: 6,
    // **Sul fronte strada, e non e' un dettaglio.** Le tre verticali alte
    // qualificano ormai negli stessi luoghi, e senza una condizione che le
    // separi il livello sei le porterebbe tutte allo stesso tamburo: l'isolato
    // tornerebbe fatto di un edificio solo, un piano piu' su. Il ruolo del lotto
    // e' l'unico fatto discreto che *dentro* un isolato cambia da un lotto
    // all'altro, quindi e' quello che fa comparire tre forme diverse sulla stessa
    // strada — lanterna sull'angolo, tamburo sul fronte, gradone abitato nel
    // cuore. E non costa niente: la maglia stradale il ruolo lo sa gia'.
    lotRole: LOT_ROLE.frontage,
    // La cima della linea: ci si arriva dalle forme basse, dalla torre liscia
    // quando arriva la ricchezza, o dal gradone abitato un livello piu' su. Mai
    // il contrario — la scala sale e non torna.
    evolvesFrom: [
      'terracedHousing', 'gardenHousing', 'rationedBlock', 'stackedTenement', 'courtyardBlock',
      'towerBlock', 'skyTerraces',
    ],
    // Sta **prima** di `skyTerraces` a parita' di priorita', e l'ordine e' la
    // regola: a livello 5 vince il gradone abitato, dal 6 in su il tamburo. E'
    // la sola riga del catalogo la cui pianta non e' un rettangolo.
    //
    // **Stava dopo, e questo la rendeva irraggiungibile.** `selectTypology`
    // tiene la prima a parita' di priorita', e `skyTerraces` chiede tutto quello
    // che chiede lei con un livello in meno: ogni luogo che accettava il tamburo
    // accettava anche il gradone, e vinceva il gradone. Non falliva niente — la
    // riga c'era, il test la trovava nel catalogo, e a schermo non e' mai
    // comparsa una volta. E' meta' della ragione per cui la citta' ricca era
    // fatta di un edificio solo.
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      chamfer: 2,
      crownKind: CROWN_KIND.lantern,
      minFootprint: 8,
    },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.7,
      body: PALETTE_SLOTS.concretePale,
      bodyAlt: PALETTE_SLOTS.glassPale,
      accent: PALETTE_SLOTS.glass,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stone,
      roofProp: PALETTE_SLOTS.metalGold,
    },
  },
  {
    id: 'skyTerraces',
    label: 'Sky terraces',
    use: 0,
    // `minWealth` non era usato da nessuna riga: la ricchezza entrava nella forma
    // solo come spinta continua su `shrinkBias`, che mezza fascia se la mangia.
    // Qui e' una soglia, e sopra di essa il quartiere cambia tipologia.
    minWealth: 0.6,
    minLevel: 5,
    // Il gradone abitato a cui arrivano la casa a schiera e le forme intermedie
    // quando la ricchezza le accompagna — **e anche la torre liscia**, che sta un
    // livello sotto e non chiede la ricchezza: un quartiere denso che diventa
    // ricco vede le sue torri mettere le terrazze, ed e' il passaggio che prima
    // non poteva succedere.
    evolvesFrom: [
      'terracedHousing', 'gardenHousing', 'rationedBlock', 'stackedTenement', 'courtyardBlock',
      'towerBlock',
    ],
    // Sopra `towerBlock`, che a questo livello qualifica quasi sempre: dove c'e'
    // anche la ricchezza, la torre liscia diventa un gradone abitato.
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.stepped,
      roofGarden: true,
      minFootprint: 7,
    },
    profile: {
      bandHeight: [4, 6],
      shrinkBias: 0.85,
      // Solo arretramenti profondi: e' l'unica riga che rinuncia del tutto alla
      // rientranza da un voxel, e infatti e' quella che deve produrre terrazze
      // su cui il giardino ci sta davvero.
      shrinkOps: [BAND_OP.setback, BAND_OP.stack, BAND_OP.shrink],
      // **Il ramo che sale non puo' arretrare anche lui.** Con `setback` in testa
      // qui, entrambi i rami davano lo stesso gesto: il tiro sceglieva fra due
      // elenchi che rispondevano la stessa cosa, e il gradone non era una
      // preferenza ma l'unica sagoma che questa riga sapesse produrre. Restano un
      // allargamento che restituisce spazio da arretrare piu' in su, e i due
      // scarti laterali che spostano il corpo senza rimpicciolirlo.
      growOps: [BAND_OP.grow, BAND_OP.jog, BAND_OP.shear],
      body: PALETTE_SLOTS.concreteWhite,
      bodyAlt: PALETTE_SLOTS.concretePale,
      accent: PALETTE_SLOTS.glass,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stone,
      garden: PALETTE_SLOTS.grassLight,
    },
  },
  {
    id: 'stackedTenement',
    label: 'Stacked tenement',
    use: 0,
    minDensity: 0.6,
    minLevel: 4,
    // Forma intermedia della linea residenziale: nasce dalla casa a schiera e
    // puo' culminare nelle quattro verticali.
    evolvesFrom: ['terracedHousing'],
    // Dopo `skyTerraces`, che ha la stessa priorita': dove c'e' anche la
    // ricchezza vince il gradone: qui resta la densita' senza la ricchezza, che
    // e' il caso da cui nasce la casa impilata invece della terrazza.
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.flat,
      maxFootprint: 6,
      // La riga che porta lo sbalzo in citta'. E' anche quella giusta: la casa
      // impilata nasce dove c'e' densita' e non ricchezza, ed e' esattamente il
      // posto in cui si guadagna spazio sporgendo sulla via invece che comprando
      // il lotto accanto.
      overhang: 2,
    },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.3,
      // L'unica riga che pesca le tre voci nuove: il corpo si sposta di un cubo
      // intero, gira su se' stesso invece di rastremarsi, e ogni tanto esce sul
      // marciapiede. E' la sagoma sfalsata che una catena di `shrink` non sa dare.
      shrinkOps: [BAND_OP.corner, BAND_OP.shrinkOneSide, BAND_OP.jog],
      growOps: [BAND_OP.jut, BAND_OP.shear, BAND_OP.corner, BAND_OP.jog],
      bayPeriod: 2,
      body: PALETTE_SLOTS.brickLight,
      bodyAlt: PALETTE_SLOTS.wood,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.metalRust,
      plinth: PALETTE_SLOTS.stoneDark,
      roofPropHeight: 0,
    },
  },
  // Le due righe concesse dai mandati stanno in fondo all'uso e a priorita' 6:
  // una decisione del giocatore e' l'affermazione piu' forte sulla forma di un
  // quartiere, e vince su cio' che le soglie locali avrebbero scelto da sole.
  {
    id: 'gardenHousing',
    label: 'Garden housing',
    use: 0,
    charter: ['communityGardens'],
    // Forma intermedia della linea residenziale, come le altre concesse dal
    // luogo: nasce dalla casa a schiera e puo' culminare nelle verticali.
    evolvesFrom: ['terracedHousing'],
    priority: 6,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      courtyard: true,
      crownKind: CROWN_KIND.flat,
      // Il mandato si chiama "orti di quartiere": era l'unica riga a portare il
      // verde nei soli slot di colore, e ora lo porta anche dove si sta.
      roofGarden: true,
      minFootprint: 7,
    },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.05,
      footprintBias: 2,
      body: PALETTE_SLOTS.brickLight,
      bodyAlt: PALETTE_SLOTS.wood,
      accent: PALETTE_SLOTS.grassLight,
      crown: PALETTE_SLOTS.grass,
      plinth: PALETTE_SLOTS.stoneWarm,
      roofPropHeight: 0,
      terrace: PALETTE_SLOTS.wood,
      garden: PALETTE_SLOTS.grassLight,
    },
  },
  {
    id: 'rationedBlock',
    label: 'Rationed block',
    use: 0,
    charter: ['rationing'],
    // Forma intermedia della linea residenziale, come sopra.
    evolvesFrom: ['terracedHousing'],
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, maxFootprint: 5 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.9,
      footprintBias: -2,
      body: PALETTE_SLOTS.concrete,
      bodyAlt: PALETTE_SLOTS.concrete,
      accent: PALETTE_SLOTS.concreteLight,
      crown: PALETTE_SLOTS.asphaltDark,
      plinth: PALETTE_SLOTS.stoneDark,
      roofPropHeight: 0,
    },
  },
  {
    id: 'canalHouse',
    label: 'Canal house',
    use: 0,
    roles: ['marina'],
    coastal: true,
    // La casa sul canale: dove la marina scava la riva, il tessuto che ci
    // cresce attorno e' la schiera bassa con il colmo sul fronte — la voce
    // dei lungomare costruiti sull'acqua, stretta per farci stare il canale.
    // **Sopra le torri d'angolo** (5), perche' il distretto deve leggersi dal
    // suo tessuto: una torre d'angolo sul canale e' la citta' che si allunga,
    // e qui la voce del posto conta piu' della gerarchia dell'isolato.
    evolvesFrom: ['terracedHousing'],
    priority: 6,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.gable,
      minFootprint: 4,
      maxFootprint: 6,
    },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0.3,
      footprintBias: -2,
      body: PALETTE_SLOTS.brickLight,
      bodyAlt: PALETTE_SLOTS.brick,
      accent: PALETTE_SLOTS.wood,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'terracedHousing',
    label: 'Terraced housing',
    use: 0,
    priority: 0,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, chamfer: 2 },
    profile: {
      shrinkBias: 0.48,
      shrinkOps: [BAND_OP.setback, BAND_OP.stack, BAND_OP.shrinkOneSide, BAND_OP.shrink],
      growOps: [BAND_OP.grow, BAND_OP.shear, BAND_OP.corner, BAND_OP.jog],
    },
  },

  // --- commerciale ---------------------------------------------------------
  {
    id: 'harborMarket',
    label: 'Harbor market',
    use: 1,
    roles: ['port'],
    coastal: true,
    // Tessuto basso della linea commerciale: nasce dalla fila di negozi e puo'
    // culminare nelle tre verticali.
    evolvesFrom: ['retailRow'],
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, crownKind: CROWN_KIND.flat, minFootprint: 6 },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.08,
      footprintBias: 4,
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
    // Culminazione verticale della linea commerciale: vi si arriva dalla fila
    // di negozi o da uno dei tessuti bassi, mai da un'altra verticale.
    evolvesFrom: ['retailRow', 'marketHall', 'arcadeRow', 'marketArcade', 'terraceArcade', 'harborMarket'],
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      podiumBands: 1,
      chamfer: 1,
      minFootprint: 6,
    },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.78,
      shrinkOps: [BAND_OP.stack, BAND_OP.setback, BAND_OP.shrinkOneSide],
      growOps: [BAND_OP.grow, BAND_OP.shear, BAND_OP.corner, BAND_OP.jog],
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
    // Culminazione verticale della linea commerciale, come `officeTower`.
    evolvesFrom: ['retailRow', 'marketHall', 'arcadeRow', 'marketArcade', 'terraceArcade', 'harborMarket'],
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      podiumBands: 1,
      arcade: true,
      minFootprint: 6,
    },
    profile: {
      bandHeight: [4, 6],
      shrinkBias: 0.28,
      shrinkOps: [BAND_OP.setback, BAND_OP.shrinkOneSide, BAND_OP.shrink],
      growOps: [BAND_OP.grow, BAND_OP.jog, BAND_OP.shrinkOneSide],
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
    // Culminazione verticale della linea commerciale, come le altre due.
    evolvesFrom: ['retailRow', 'marketHall', 'arcadeRow', 'marketArcade', 'terraceArcade', 'harborMarket'],
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 6 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.18,
      body: PALETTE_SLOTS.brickDark,
      bodyAlt: PALETTE_SLOTS.brick,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.metalBrass,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'marinaClub',
    label: 'Marina club',
    use: 1,
    roles: ['marina'],
    coastal: true,
    // Il club nautico: la casa bassa col tetto a falda che serve i moli, in
    // legno e ottone come il pontile che guarda. E' il commercio della marina,
    // e sta basso per lasciare il primo piano alla vela e non alla torre.
    evolvesFrom: ['retailRow'],
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.gable,
      minFootprint: 4,
      maxFootprint: 8,
    },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.15,
      footprintBias: 2,
      body: PALETTE_SLOTS.wood,
      bodyAlt: PALETTE_SLOTS.brickLight,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'harborOffice',
    label: 'Harbor office',
    use: 1,
    specialization: 'office',
    roles: ['port'],
    coastal: true,
    minLevel: 2,
    // L'ufficio del porto: il fronte amministrativo del molo, vetro su un
    // podio di pietra. Nasce dal mercato del porto quando il posto cresce.
    evolvesFrom: ['harborMarket', 'retailRow'],
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, chamfer: 1, minFootprint: 5 },
    profile: {
      bandHeight: [6, 7],
      shrinkBias: 0.5,
      body: PALETTE_SLOTS.glassDeep,
      bodyAlt: PALETTE_SLOTS.glassDark,
      accent: PALETTE_SLOTS.glassPale,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'pierCafe',
    label: 'Pier cafe',
    use: 1,
    roles: ['ferry'],
    coastal: true,
    // Il bar dell'imbarcadero: il chiosco basso che aspetta chi sbarca, il
    // commercio minimo di un posto il cui mestiere e' passare.
    evolvesFrom: ['retailRow'],
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.gable,
      minFootprint: 4,
      maxFootprint: 6,
    },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.2,
      body: PALETTE_SLOTS.wood,
      bodyAlt: PALETTE_SLOTS.concreteWhite,
      accent: PALETTE_SLOTS.glassPale,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'marketArcade',
    label: 'Market arcade',
    use: 1,
    charter: ['leasedSquare', 'localShops'],
    // Tessuto basso della linea commerciale, come gli altri concessi dal mandato.
    evolvesFrom: ['retailRow'],
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 2, minFootprint: 7 },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0.3,
      footprintBias: 2,
      body: PALETTE_SLOTS.stoneWarm,
      bodyAlt: PALETTE_SLOTS.brick,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stone,
    },
  },
  {
    id: 'terraceArcade',
    label: 'Terrace arcade',
    use: 1,
    // `minSatisfaction` era l'altro criterio dichiarato e mai usato. Un fronte
    // commerciale con la gente che ci sta sopra ha senso dove la gente sta bene,
    // e non dove il commercio e' solo fitto.
    minSatisfaction: 0.5,
    minLevel: 3,
    // **E' l'unico seguito che il commercio senza specializzazione abbia.** Le
    // tre verticali chiedono tutte una specializzazione, che la maggior parte
    // delle colonne non esprime: dichiarando la sola fila di negozi, ogni fronte
    // nato `arcadeRow` — cioe' quasi tutto il commercio denso — restava quello per
    // sempre, al livello zero, e questa riga non compariva mai. Ora la adottano
    // anche i tessuti bassi, che sono cio' da cui il fronte commerciale cresce
    // quando il quartiere comincia a stare bene.
    evolvesFrom: ['retailRow', 'arcadeRow', 'marketHall', 'marketArcade', 'harborMarket'],
    // Sotto le tre righe di specializzazione, che restano piu' specifiche di
    // "qui si sta bene": un albergo resta un albergo anche in un quartiere felice.
    priority: 4,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      podiumBands: 2,
      crownKind: CROWN_KIND.stepped,
      roofGarden: true,
      minFootprint: 7,
    },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0.7,
      footprintBias: 2,
      shrinkOps: [BAND_OP.setback, BAND_OP.shrinkOneSide, BAND_OP.shrink],
      growOps: [BAND_OP.keep, BAND_OP.jog, BAND_OP.grow],
      body: PALETTE_SLOTS.stone,
      bodyAlt: PALETTE_SLOTS.stoneWarm,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneDark,
      terrace: PALETTE_SLOTS.wood,
    },
  },
  {
    id: 'arcadeRow',
    label: 'Arcade row',
    use: 1,
    minDensity: 0.45,
    // Tessuto basso della linea commerciale, come `marketHall`.
    evolvesFrom: ['retailRow'],
    // Sotto `terraceArcade` (4): dove la gente sta bene il fronte commerciale si
    // porta anche le terrazze sopra, e qui resta il solo portico.
    priority: 3,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      arcade: true,
      podiumBands: 1,
      crownKind: CROWN_KIND.flat,
      minFootprint: 7,
      // Portico sotto e piani che sporgono sopra: e' la stessa strada guadagnata
      // due volte, ed e' la sezione che ogni via commerciale fitta ha davvero.
      overhang: 2,
    },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0.2,
      footprintBias: 2,
      body: PALETTE_SLOTS.stoneWarm,
      bodyAlt: PALETTE_SLOTS.brick,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stone,
      growOps: [BAND_OP.jut, BAND_OP.keep, BAND_OP.jog],
    },
  },
  {
    id: 'marketHall',
    label: 'Market hall',
    use: 1,
    // Tessuto basso della linea commerciale: nasce dalla fila di negozi e puo'
    // culminare nelle tre verticali.
    evolvesFrom: ['retailRow'],
    // Dove il commercio e' rado, un capannone di mercato con la falda: un tetto
    // piatto su un edificio basso e isolato legge come costruzione non finita.
    maxDensity: 0.45,
    priority: 2,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.gable, minFootprint: 7 },
    profile: {
      bandHeight: [5, 6],
      shrinkBias: 0,
      footprintBias: 4,
      body: PALETTE_SLOTS.wood,
      bodyAlt: PALETTE_SLOTS.stoneWarm,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stone,
      roofPropHeight: 0,
    },
  },
  {
    id: 'retailRow',
    label: 'Retail row',
    use: 1,
    priority: 0,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.flat,
      arcade: true,
      courtyard: true,
      maxFootprint: 6,
    },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.34,
      shrinkOps: [BAND_OP.stack, BAND_OP.setback, BAND_OP.shrinkOneSide, BAND_OP.shrink],
      growOps: [BAND_OP.grow, BAND_OP.jog, BAND_OP.shrinkOneSide],
    },
  },

  // --- industriale ---------------------------------------------------------
  {
    id: 'logisticsDepot',
    label: 'Logistics depot',
    use: 2,
    specialization: 'logistics',
    // Nasce dallo scalo industriale: il capannone della logistica e' il mestiere
    // che il cortile prende quando il luogo lo specializza.
    evolvesFrom: ['industrialYard'],
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 8 },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0,
      footprintBias: 4,
      body: PALETTE_SLOTS.asphalt,
      bodyAlt: PALETTE_SLOTS.metalDark,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
    },
  },
  {
    id: 'containerYard',
    label: 'Container yard',
    use: 2,
    specialization: 'logistics',
    roles: ['port'],
    coastal: true,
    // Il piazzale container: il capannone di logistica vestito di ruggine, con
    // l'attrezzatura sul tetto. Sul porto vince sul capannone neutro — il ruolo
    // dice piu' del fondo — e la linea resta quella della logistica.
    evolvesFrom: ['logisticsDepot', 'strippedYard'],
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 7 },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0,
      footprintBias: 2,
      body: PALETTE_SLOTS.metalRust,
      bodyAlt: PALETTE_SLOTS.metalDark,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
      roofPropHeight: 4,
    },
  },
  {
    id: 'productionLoft',
    label: 'Production loft',
    use: 2,
    minLevel: 2,
    // Nasce dallo scalo industriale e culmina nella torre idroponica.
    evolvesFrom: ['industrialYard'],
    priority: 2,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 6 },
    profile: { bandHeight: [4, 4], shrinkBias: 0.05, footprintBias: 4 },
  },
  {
    id: 'strippedYard',
    label: 'Stripped yard',
    use: 2,
    charter: ['soldReserves'],
    // Nasce dallo scalo industriale, come gli altri mestieri del cortile.
    evolvesFrom: ['industrialYard'],
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 7 },
    profile: {
      bandHeight: [5, 6],
      shrinkBias: 0,
      footprintBias: 2,
      body: PALETTE_SLOTS.metalRust,
      bodyAlt: PALETTE_SLOTS.metalDark,
      accent: PALETTE_SLOTS.concrete,
      crown: PALETTE_SLOTS.asphaltDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
      roofPropHeight: 0,
    },
  },
  {
    id: 'stackedWorks',
    label: 'Stacked works',
    use: 2,
    // `minIndustry` chiudeva la terna dei criteri dichiarati e mai usati. Dove
    // l'impatto industriale e' alto la fabbrica smette di allargarsi — non c'e'
    // piu' isolato — e comincia a impilarsi.
    minIndustry: 0.5,
    minLevel: 3,
    // Nasce dallo scalo industriale — e dal loft, che sta un livello sotto e non
    // chiede l'impatto industriale: senza, un capannone promosso a loft al livello
    // due non poteva piu' impilarsi, e la linea si spezzava a meta'. Culmina nella
    // torre idroponica: dove la terra finisce, l'officina cede il passo alla serra.
    evolvesFrom: ['industrialYard', 'productionLoft'],
    // Sopra `productionLoft` (2), sotto `logisticsDepot` (5): un polo logistico
    // resta un capannone anche in mezzo alle ciminiere.
    priority: 3,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.ridge, minFootprint: 7 },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0.5,
      footprintBias: 4,
      shrinkOps: [BAND_OP.stack, BAND_OP.shrinkOneSide],
      growOps: [BAND_OP.keep, BAND_OP.keep, BAND_OP.jog],
      body: PALETTE_SLOTS.stoneDeep,
      bodyAlt: PALETTE_SLOTS.metalRust,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
      roofPropHeight: 6,
    },
  },
  {
    id: 'hydroponicTower',
    label: 'Hydroponic tower',
    use: 2,
    specialization: 'farming',
    // **Il cibo che sale.** E' l'unica tipologia che cambia il bilancio invece
    // che la sola forma: la simulazione la conta fra i produttori di cibo e la
    // toglie dall'industria che fa materiali. Nasce dove il suolo e' finito —
    // densita' da centro — perche' in periferia un campo costa infinitamente
    // meno e rende di piu' per fondo speso; e' `districts.ts` a imporre le due
    // soglie, qui basta chiedere la specializzazione.
    //
    // **Cinque, e abbassarlo e' stato provato e disfatto.** Misurando la citta'
    // non nasceva una torre nemmeno con la soglia di distretto aperta, perche'
    // nessun edificio industriale arrivava al livello cinque; sembrava un
    // secondo cancello chiuso, e portarlo a tre lo apriva. Non era pero' un
    // fatto del gioco: era l'economia delle promozioni, in riscrittura in quel
    // momento, a tenere gli edifici bassi.
    //
    // Il conto lo presentava `priority: 7` qui sotto. A tre, la torre vince su
    // ogni altra tipologia industriale appena il distretto la esprime — cioe'
    // proprio dove un capannone avrebbe cominciato a impilarsi — e le sostituisce
    // con la propria sagoma tozza: la citta' smetteva di produrre torri alte, e
    // con loro sparivano le arcologie, che una citta' bassa non le chiede. La
    // soglia alta e' cio' che tiene questa tipologia un **premio** invece di un
    // tetto sullo skyline industriale.
    minLevel: 5,
    // La culminazione dell'intera linea industriale: vi si arriva dallo scalo,
    // dal loft o dall'officina impilata — la serra e' il tetto, non un passaggio.
    evolvesFrom: ['industrialYard', 'productionLoft', 'stackedWorks'],
    // Sopra tutte le altre industriali: dove il luogo esprime `farming` la torre
    // vince, o la specializzazione non si vedrebbe mai a schermo.
    priority: 7,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.flat,
      minFootprint: 4,
      // Le vasche in cima sono la stessa cosa che si vede in facciata, vista da
      // sopra: il tetto piantato non e' un ornamento, e' il primo piano di
      // coltura che si legge dall'alto in isometrica.
      roofGarden: true,
    },
    profile: {
      // Fasce alte e strette: una torre di serre e' un edificio a scaffali, e i
      // piani si contano da fuori.
      bandHeight: [5, 5],
      shrinkBias: 0.08,
      body: PALETTE_SLOTS.glassPale,
      bodyAlt: PALETTE_SLOTS.glassDeep,
      // **L'accento e' verde, e ad alto livello la grammatica lo emette `luminous`.**
      // Non c'e' un materiale nuovo e non c'e' un emettitore nuovo: le luci di
      // crescita sono la stessa lama che accende le torri di notte, con dentro
      // la coltura invece del vetro. E' il rendimento piu' alto per riga di
      // tabella di tutta la fase.
      accent: PALETTE_SLOTS.grassLight,
      garden: PALETTE_SLOTS.grassLight,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.concrete,
    },
  },
  {
    id: 'industrialYard',
    label: 'Industrial yard',
    use: 2,
    priority: 0,
    // Il ripiego di ogni uso porta la cima che distingue quell'uso da lontano:
    // e' la sola forma in cui "coronamenti per uso" resta una riga di tabella e
    // non un ramo dentro la grammatica. Qui una copertura lunga, da capannone.
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.ridge, chamfer: 2 },
    profile: {
      shrinkBias: 0.34,
      shrinkOps: [BAND_OP.stack, BAND_OP.setback, BAND_OP.shrinkOneSide],
      growOps: [BAND_OP.grow, BAND_OP.corner, BAND_OP.shear, BAND_OP.jog],
    },
  },

  // --- civico --------------------------------------------------------------
  {
    id: 'universityLab',
    label: 'University lab',
    use: 3,
    specialization: 'research',
    minLevel: 2,
    // La culminazione della linea civica: vi si arriva dalla guglia o dalla
    // lanterna, quando il luogo specializza.
    evolvesFrom: ['civicSpire', 'civicLantern'],
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, courtyard: true, crownKind: CROWN_KIND.flat, minFootprint: 8 },
    profile: {
      bandHeight: [6, 6],
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
    // La culminazione della linea civica, come il laboratorio.
    evolvesFrom: ['civicSpire', 'civicLantern'],
    priority: 4,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, minFootprint: 6 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.34,
      body: PALETTE_SLOTS.stoneWarm,
      bodyAlt: PALETTE_SLOTS.concreteWhite,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stone,
      roofProp: PALETTE_SLOTS.metalGold,
    },
  },
  {
    id: 'civicLantern',
    label: 'Civic lantern',
    use: 3,
    // L'unica condizione e' il livello, e non e' una condizione *sul luogo*:
    // `demandsPlace` non lo elenca, quindi la riga vale anche dove il profilo
    // non c'e' — un catalizzatore piazzato a mano, una fixture di scena. E' cosi'
    // che "coronamenti per livello" resta una riga e non un ramo.
    minLevel: 4,
    // La guglia cresce nella lanterna: e' il solo passo interno alla linea
    // civica che non culmini in una forma specializzata.
    evolvesFrom: ['civicSpire'],
    // Sopra il solo ripiego: `culturalPavilion` (4) e `universityLab` (5) restano
    // piu' specifici, perche' dicono qualcosa del luogo e non dell'edificio.
    priority: 1,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.lantern,
      chamfer: 1,
      minFootprint: 6,
    },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.68,
      shrinkOps: [BAND_OP.stack, BAND_OP.shrink, BAND_OP.setback],
      growOps: [BAND_OP.grow, BAND_OP.corner, BAND_OP.shear, BAND_OP.jog],
      roofProp: PALETTE_SLOTS.metalGold,
      roofPropHeight: 6,
    },
  },
  {
    id: 'ferryHouse',
    label: 'Ferry house',
    use: 3,
    roles: ['ferry'],
    coastal: true,
    // La casa dell'imbarco: la sala bassa con il colmo lungo, una stazione
    // d'acqua in miniatura accanto al molo. Il civico del traghetto sta basso
    // perche' il suo segnale e' la boa e la vela, non il campanile.
    evolvesFrom: ['civicSpire'],
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.gable,
      minFootprint: 4,
      maxFootprint: 8,
    },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.3,
      footprintBias: 2,
      body: PALETTE_SLOTS.brickLight,
      bodyAlt: PALETTE_SLOTS.concreteWhite,
      accent: PALETTE_SLOTS.glassPale,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'civicSpire',
    label: 'Civic spire',
    use: 3,
    priority: 0,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, chamfer: 2 },
    profile: {
      shrinkOps: [BAND_OP.stack, BAND_OP.setback, BAND_OP.shrinkOneSide],
      growOps: [BAND_OP.grow, BAND_OP.corner, BAND_OP.shear, BAND_OP.jog],
    },
  },
];

export type TypologyId = (typeof TYPOLOGIES)[number]['id'];

const TYPOLOGY_BY_ID = new Map<string, TypologyDefinition>(
  TYPOLOGIES.map((entry) => [entry.id, entry]),
);

export function typologyById(id: string): TypologyDefinition | null {
  return TYPOLOGY_BY_ID.get(id) ?? null;
}
