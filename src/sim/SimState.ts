import { BALANCE } from './balance';
import { ALL_CLASSES, BUILDING_CLASS, CLASS_COUNT, isBuildingClass, type BuildingClass } from './classes';
import { isCatalystId } from './catalysts';
import {
  canonicalCharters,
  withCharter,
  withoutFamily,
  type CharterId,
} from './charters';
import {
  decisionFingerprint,
  decisionOption,
  type CityDecision,
  type DecisionOutcome,
} from './decisions';
import {
  DesirabilityField,
  type Building,
  type Catalyst,
} from './DesirabilityField';
import {
  EMPTY_HARVEST,
  FARM_COUNT,
  FARM_KIND,
  isFarmKind,
  type FarmKind,
  type FoodReport,
} from './farms';
import {
  classOfWeight,
  isPolicyId,
  policyById,
  resolveWeights,
  withPolicy,
  type PolicyId,
} from './policies';
import { EMPTY_COMMERCE, type CommerceReport } from './commerce';
import type { ReachCache, StepCost } from './reach';
import { NO_FUNDS_FLOW, type FundsReport } from './flows';
import {
  capacityAtLevel,
  EMPTY_MATERIALS,
  type MaterialsReport,
} from './materials';
import { EMPTY_TRADE, isTradeMode, type TradeMode, type TradeReport } from './trade';

/**
 * Stato della simulazione.
 *
 * Lo stato e' diviso in due parti con regole diverse:
 *
 * - **I dati** (`SimStateData`) sono JSON puro: numeri, stringhe, array di
 *   oggetti piatti. Sopravvivono a `JSON.parse(JSON.stringify(...))` senza
 *   perdita, e sono cio' che `tick` legge e riscrive.
 * - **Il campo** (`field`) e' un indice mutabile derivato interamente dai dati.
 *   Non viene serializzato perche' non c'e' niente da salvare: `reviveSimState`
 *   lo ricostruisce da catalizzatori, edifici e policy ottenendo lo stesso
 *   contenuto byte per byte. Metterlo nel JSON significherebbe scrivere un
 *   `Uint8Array` per classe per chunk, che JSON non sa rappresentare senza
 *   trasformarlo in un oggetto di indici numerici.
 *
 * **Proprieta' del campo.** `tick` non tocca mai `field`, quindi resta puro. Le
 * operazioni del giocatore (`addCatalyst`, `addBuilding`, `setPolicyActive`,
 * ...) invece lo aggiornano in place e restituiscono un nuovo oggetto stato che
 * ne prende possesso: lo stato precedente non va piu' usato. E' la stessa regola
 * di un buffer trasferito, ed e' cio' che permette l'aggiornamento incrementale
 * senza clonare il campo a ogni piazzamento.
 */

/** Una risorsa: quanto ce n'e' adesso e quanto e' cambiato nell'ultimo tick. */
export interface Resource {
  readonly stock: number;
  readonly delta: number;
}

export type { Building, Catalyst } from './DesirabilityField';

/** La parte serializzabile dello stato. */
export interface SimStateData {
  /** Tick completati da `createSimState`. */
  readonly tickCount: number;

  /** Stato del PRNG, intero a 32 bit senza segno. */
  readonly rngState: number;

  readonly population: Resource;
  readonly food: Resource;
  readonly materials: Resource;
  readonly funds: Resource;

  /** Modificatore di soddisfazione, sempre in [0, 1]. */
  readonly satisfaction: number;

  /** Ponti in quota vivi fra citta' primaria e settori secondari. */
  readonly islandConnections: number;

  readonly buildings: readonly Building[];

  /** Edifici per **uso primario**, indicizzato come `BUILDING_CLASS`. */
  readonly buildingCounts: readonly number[];

  /** Capacita' primaria, comprensiva del livello, indicizzata per uso. */
  readonly capacityCounts: readonly number[];

  /**
   * Edifici per **uso secondario**, con la stessa indicizzazione.
   *
   * Un edificio misto compare una volta in `buildingCounts` sotto il suo uso
   * primario e una volta qui sotto il secondo: la somma delle due tabelle non e'
   * il numero di edifici, ed e' giusto cosi'. Il bilancio legge la capacita'
   * efficace come `buildingCounts[uso] + secondaryShare * mixedCounts[uso]`,
   * che e' l'unico posto in cui i due conteggi si incontrano.
   */
  readonly mixedCounts: readonly number[];

  /** Capacita' secondaria prima della quota per uso misto. */
  readonly mixedCapacityCounts: readonly number[];

  /**
   * Produttori di cibo, indicizzato come `FARM_KIND`.
   *
   * **Non e' un quinto `buildingCounts`.** Campo e frutteto non sono edifici e
   * non compaiono altrove: sono lotti, vivono in `src/world/farms/` e la
   * simulazione ne conosce solo il numero. La torre invece e' un edificio, e
   * compare **due volte** — in `buildingCounts[industrial]` per il suolo che
   * occupa e qui per cio' che produce. La somma delle due tabelle non e' il
   * numero di cose costruite, esattamente come per `mixedCounts`.
   *
   * Nessuno di questi tre tocca il campo di desiderabilita': un produttore di
   * cibo compete per la **terra**, non per l'attrattivita' di una colonna.
   */
  readonly farmCounts: readonly number[];

  readonly catalysts: readonly Catalyst[];

  /** Policy attive, sempre in ordine di catalogo. */
  readonly policies: readonly PolicyId[];

  /**
   * Mandati lasciati dalle decisioni: al massimo uno per famiglia, in ordine di
   * catalogo.
   *
   * Non sono policy e non entrano in `resolveWeights`: agiscono sul profilo
   * locale, quindi su forma e tipologia di cio' che cresce, non sul bilancio di
   * un tick. E' per questo che risolvere una decisione non ricostruisce il
   * campo di desiderabilita', mentre attivare una policy lo fa.
   */
  readonly charters: readonly CharterId[];

  /** Strategia del collegamento esterno; senza porto resta inattiva. */
  readonly tradeMode: TradeMode;
  readonly trade: TradeReport;

  /** Ultimo giro del commercio interno. Derivato dal tick, non un accumulo. */
  readonly commerce: CommerceReport;

  /**
   * Da dove e' venuto il cibo dell'ultimo tick e dove e' andato.
   *
   * Stessa natura di `commerce` e `flows`, e sta qui accanto per la stessa
   * ragione: derivato dal tick, non accumulato. Risponde a «da dove viene quello
   * che mangiamo», che con un saldo netto solo non ha risposta — ed e' la
   * domanda che la 3.1 esiste per rendere ponibile.
   */
  readonly harvest: FoodReport;

  /** Produzione, consumi e cantieri dei materiali nell'ultimo giro. */
  readonly materialFlows: MaterialsReport;

  /**
   * Da dove sono venuti i fondi dell'ultimo tick e dove sono andati.
   *
   * Stessa natura di `commerce`, e per la stessa ragione sta qui accanto:
   * derivato dal tick, non accumulato, quindi ricostruirlo non richiede
   * storia. Risponde a «perche' sto perdendo denaro», che con un saldo netto
   * solo non ha risposta.
   */
  readonly flows: FundsReport;

  /**
   * Quota di organico dell'ultimo tick, in [0, 1]: braccia disponibili su braccia
   * richieste da industria, commercio e campagna insieme.
   *
   * Stessa natura di `commerce`, `flows` e `harvest`, e sta qui per la stessa
   * ragione: era gia' calcolato dentro `tick`, moltiplicava ogni produzione e
   * veniva buttato via una riga dopo. Tenerlo non aggiunge un conto, ne toglie
   * uno a chi lo rifaceva a modo suo.
   *
   * **Lo legge chi pianta.** Il `FarmDriver` chiedeva quanti lotti mancassero *a
   * organico pieno*, cioe' su un'aritmetica diversa da quella con cui il tick
   * calcola poi il raccolto: una citta' a 0,7 di organico raccoglieva il 70% di
   * cio' per cui aveva piantato e nessuno se ne accorgeva. Da qui passa il numero
   * vero.
   *
   * Vale `1` in uno stato mai ticcato — non c'e' ancora niente da tenere in piedi,
   * e l'ottimismo e' il comportamento che c'era prima.
   */
  readonly staffing: number;

  /** Decisione sospesa e registro compatto degli esiti scelti. */
  readonly pendingDecision: CityDecision | null;
  readonly decisionHistory: readonly DecisionOutcome[];
  readonly nextDecisionTick: number;
  /**
   * Impronta della citta' all'ultima decisione risolta.
   *
   * Serve alla cadenza a eventi: finche' resta uguale, una scelta contestuale
   * non si riapre solo perche' il tempo e' scaduto. Vale `-1` finche' nessuna
   * decisione e' stata presa, cosi' la prima si apre comunque.
   */
  readonly decisionStamp: number;
  /**
   * Tick fino al quale la decisione sospesa resta nascosta.
   *
   * Il «decidi piu' tardi» non risolve e non cambia la decisione: nasconde la
   * carta per `decisions.snoozeTicks` e poi la ripropone identica. Sta nello
   * stato perche' e' un fatto del gioco, non dell'HUD.
   */
  readonly decisionDismissedUntil: number;

  /**
   * Se l'emergenza alimentare puo' scattare.
   *
   * **E' il fronte che alla scelta mancava.** `nextDecisionTick` e' un
   * intervallo, non una memoria: da solo riapre l'emergenza a ogni scadenza
   * finche' la condizione e' vera, e la condizione — in una citta' che non
   * riesce a sfamarsi — e' vera per sempre. Qui sta l'altra meta': risolvere
   * un'emergenza la disarma, e a ricaricarla e' `tick` quando la citta' torna a
   * coprire la propria spesa sopra `decisions.recoveryCoverage`.
   *
   * Una carestia cronica quindi viene chiesta **una volta**, non ogni novanta
   * secondi: che sia in corso lo dice la HUD, e una scelta d'emergenza che si
   * ripete senza che nulla sia cambiato non e' una scelta.
   */
  readonly supplyArmed: boolean;

  /** Classe di cui la scena di debug disegna la heatmap e scrive `VoxelWorld.data`. */
  readonly selectedClass: BuildingClass;
}

export interface SimState extends SimStateData {
  readonly field: DesirabilityField;
  /**
   * Le portate dei catalizzatori. E' sempre `field.reach`: il campo ne e' il
   * proprietario, e qui sta perche' anche `urbanProfileAt` e la gerarchia dello
   * skyline devono leggere le stesse, e perche' `UrbanSources` resti un
   * sottoinsieme strutturale dello stato invece di doverne elencare i campi.
   */
  readonly reach: ReachCache;
}

export interface SimStateOptions {
  readonly rngState?: number;
  readonly catalysts?: readonly Catalyst[];
  readonly policies?: readonly PolicyId[];
  readonly charters?: readonly CharterId[];
  readonly selectedClass?: BuildingClass;
  readonly tradeMode?: TradeMode;
  /**
   * Costo di attraversamento di una cella, da cui la forma dell'influenza.
   *
   * Senza, la portata e' la distanza di Chebyshev di sempre: uno stato costruito
   * senza mondo — un test, un bench — si comporta esattamente come prima che
   * l'influenza diventasse geodetica.
   */
  readonly reachCost?: StepCost;
}

const ZERO_DELTA = 0;

function resource(stock: number): Resource {
  return { stock, delta: ZERO_DELTA };
}

/** Stato iniziale con i valori di `BALANCE.start`. */
export function createSimState(options: SimStateOptions = {}): SimState {
  const catalysts = options.catalysts ?? [];
  const policies = options.policies ?? [];

  const data: SimStateData = {
    tickCount: 0,
    rngState: (options.rngState ?? BALANCE.start.rngState) >>> 0,
    population: resource(BALANCE.start.population),
    food: resource(BALANCE.start.food),
    materials: resource(BALANCE.start.materials),
    funds: resource(BALANCE.start.funds),
    satisfaction: BALANCE.start.satisfaction,
    islandConnections: 0,
    buildings: [],
    buildingCounts: new Array<number>(CLASS_COUNT).fill(0),
    capacityCounts: new Array<number>(CLASS_COUNT).fill(0),
    mixedCounts: new Array<number>(CLASS_COUNT).fill(0),
    mixedCapacityCounts: new Array<number>(CLASS_COUNT).fill(0),
    farmCounts: new Array<number>(FARM_COUNT).fill(0),
    catalysts: catalysts.map(normaliseCatalyst),
    policies: canonicalPolicies(policies),
    charters: canonicalCharters(options.charters ?? []),
    tradeMode: options.tradeMode ?? 'balanced',
    trade: EMPTY_TRADE,
    commerce: EMPTY_COMMERCE,
    harvest: EMPTY_HARVEST,
    materialFlows: EMPTY_MATERIALS,
    flows: NO_FUNDS_FLOW,
    staffing: 1,
    pendingDecision: null,
    decisionHistory: [],
    nextDecisionTick: BALANCE.decisions.firstTick,
    decisionStamp: -1,
    decisionDismissedUntil: 0,
    supplyArmed: true,
    selectedClass: options.selectedClass ?? BUILDING_CLASS.residential,
  };

  const field = new DesirabilityField(options.reachCost);
  field.rebuild(data.catalysts, data.buildings, resolveWeights(data.policies));
  return { ...data, field, reach: field.reach };
}

// --- Operazioni del giocatore ---------------------------------------------
//
// Ognuna restituisce un nuovo oggetto stato e passa la proprieta' del campo:
// lo stato in ingresso non va piu' usato dopo la chiamata.

/** Aggiunge un catalizzatore e ricalcola solo le celle nel suo raggio. */
export function addCatalyst(state: SimState, catalyst: Catalyst): SimState {
  const normalised = normaliseCatalyst(catalyst);
  const catalysts = [...state.catalysts, normalised];
  state.field.applyCatalystChange(normalised, catalysts, resolveWeights(state.policies));
  return { ...state, catalysts };
}

/**
 * Rimuove il catalizzatore all'indice indicato e ricalcola solo le celle che
 * erano nel suo raggio. Un indice fuori lista lascia lo stato invariato.
 */
export function removeCatalyst(state: SimState, index: number): SimState {
  const removed = state.catalysts[index];
  if (removed === undefined) return state;

  const catalysts = state.catalysts.filter((_, i) => i !== index);
  state.field.applyCatalystChange(removed, catalysts, resolveWeights(state.policies));
  return { ...state, catalysts };
}

/**
 * Cambia l'intensita' di un catalizzatore.
 *
 * Ricalcola l'unione dei due raggi — quello vecchio e quello nuovo coincidono,
 * perche' il raggio non cambia — sempre per la sola classe interessata.
 */
export function setCatalystStrength(state: SimState, index: number, strength: number): SimState {
  const previous = state.catalysts[index];
  if (previous === undefined) return state;

  const updated = normaliseCatalyst({ ...previous, strength });
  const catalysts = state.catalysts.map((catalyst, i) => (i === index ? updated : catalyst));
  state.field.applyCatalystChange(updated, catalysts, resolveWeights(state.policies));
  return { ...state, catalysts };
}

/**
 * Registra un edificio nella cella indicata.
 *
 * La simulazione non costruisce nulla da sola: questa e' la porta da cui il
 * costruttore, che vive fuori da `src/sim/`, dichiara cos'e' stato eretto. Il
 * campo aggiorna occupazione e congestione nel solo raggio breve.
 *
 * Una cella gia' occupata lascia lo stato invariato.
 */
export function addBuilding(state: SimState, building: Building): SimState {
  const placed = state.field.addBuilding(building, state.catalysts, resolveWeights(state.policies));
  if (!placed) return state;

  // Un uso secondario uguale al primario non e' un edificio misto, e' un errore
  // di chi chiama: viene lasciato cadere invece di contare due volte lo stesso
  // uso nella capacita' efficace.
  const mixed = building.mixed !== undefined &&
    isBuildingClass(building.mixed) &&
    building.mixed !== building.class
      ? building.mixed
      : undefined;

  const buildingCounts = state.buildingCounts.slice();
  buildingCounts[building.class]++;

  const level = normaliseLevel(building.level);
  const capacity = capacityAtLevel(level);
  const capacityCounts = state.capacityCounts.slice();
  capacityCounts[building.class] += capacity;

  const mixedCounts = state.mixedCounts.slice();
  if (mixed !== undefined) mixedCounts[mixed]++;
  const mixedCapacityCounts = state.mixedCapacityCounts.slice();
  if (mixed !== undefined) mixedCapacityCounts[mixed] += capacity;

  // **Una torre si registra da una porta sola.** Chiedere a chi costruisce di
  // chiamare anche `addFarm` vorrebbe dire che prima o poi qualcuno registra il
  // volume e dimentica il raccolto, e il difetto sarebbe una citta' che affama
  // se stessa senza che nulla lo dica. La specializzazione viaggia sul record,
  // quindi `removeBuildings` sa disfare esattamente cio' che e' stato contato.
  const farmCounts = state.farmCounts.slice();
  if (building.specialization === 'farming') farmCounts[FARM_KIND.tower] += capacity;

  const record: Building = {
    x: building.x,
    y: building.y,
    class: building.class,
    ...(level === 0 ? {} : { level }),
    ...(mixed === undefined ? {} : { mixed }),
    ...(building.specialization === undefined ? {} : { specialization: building.specialization }),
  };

  return {
    ...state,
    buildings: [...state.buildings, record],
    buildingCounts,
    capacityCounts,
    mixedCounts,
    mixedCapacityCounts,
    farmCounts,
  };
}

/**
 * Registra un produttore di cibo che non e' un edificio.
 *
 * E' la porta gemella di `addBuilding` per campi e frutteti: lotti che vivono in
 * `src/world/farms/`, occupano terra e non compaiono in nessun istogramma di
 * edifici. La torre non passa di qui — la registra `addBuilding` insieme al suo
 * volume, perche' un edificio e' *anche* un edificio.
 *
 * **Non tocca il campo di desiderabilita' e non tiene una lista.** Un lotto non
 * fa congestione, non attira nessuno e non va ricostruito da JSON per posizione:
 * a sapere dove sta e' il mondo, che ce l'ha in mano. Qui serve un contatore, e
 * un contatore e' tutto quello che c'e'.
 */
export function addFarm(state: SimState, kind: FarmKind): SimState {
  if (!isFarmKind(kind) || kind === FARM_KIND.tower) return state;
  const farmCounts = state.farmCounts.slice();
  farmCounts[kind]++;
  return { ...state, farmCounts };
}

/**
 * Toglie un produttore di cibo. E' la porta opposta ad `addFarm`.
 *
 * La chiama chi ha visto la citta' costruire sopra un lotto: un campo mangiato
 * da un isolato nuovo e' il modo in cui la crescita si porta via la propria
 * dispensa, ed e' voluto. Un contatore gia' a zero resta a zero invece di
 * scendere sotto, come `addBuilding` lascia cadere una cella piena.
 */
export function removeFarm(state: SimState, kind: FarmKind): SimState {
  if (!isFarmKind(kind) || kind === FARM_KIND.tower) return state;
  if ((state.farmCounts[kind] ?? 0) <= 0) return state;
  const farmCounts = state.farmCounts.slice();
  farmCounts[kind]--;
  return { ...state, farmCounts };
}

/**
 * Toglie degli edifici dalla simulazione. E' la porta opposta a `addBuilding`.
 *
 * **Non e' un bulldozer.** La simulazione non demolisce niente da sola: questa
 * e' la dichiarazione che il costruttore, che vive fuori da `src/sim/`, fa
 * quando ha tolto di mezzo qualcosa. Chi la chiama oggi e' il cantiere di un
 * landmark, ma qui non c'e' e non deve esserci niente che sappia cosa sia un
 * landmark: entrano edifici, escono conteggi.
 *
 * **Non serve una penalita' scritta apposta**, ed e' la ragione per cui questa
 * funzione e' cosi' corta. Meno edifici residenziali vuol dire meno `capacity`,
 * quindi un'occupazione sopra uno, quindi il `crowdingPenalty` che `tick` gia'
 * applica; meno civico e meno commercio abbassano soddisfazione e servizio per
 * la stessa strada. Il costo di uno sventramento e' il bilancio che c'era gia'.
 *
 * L'abbinamento e' per cella **e** uso, e consuma una voce per edificio chiesto:
 * su una colonna con due volumi sovrapposti toglie quello indicato e non
 * entrambi. Cio' che non trova viene lasciato cadere in silenzio, come
 * `addBuilding` lascia cadere una cella piena.
 */
export function removeBuildings(state: SimState, doomed: readonly Building[]): SimState {
  if (doomed.length === 0) return state;

  const wanted = new Map<string, number>();
  for (const building of doomed) {
    const key = `${building.x},${building.y},${building.class}`;
    wanted.set(key, (wanted.get(key) ?? 0) + 1);
  }

  const survivors: Building[] = [];
  const removed: Building[] = [];
  for (const building of state.buildings) {
    const key = `${building.x},${building.y},${building.class}`;
    const left = wanted.get(key) ?? 0;
    if (left > 0) {
      wanted.set(key, left - 1);
      removed.push(building);
    } else {
      survivors.push(building);
    }
  }
  if (removed.length === 0) return state;

  const buildingCounts = state.buildingCounts.slice();
  const capacityCounts = state.capacityCounts.slice();
  const mixedCounts = state.mixedCounts.slice();
  const mixedCapacityCounts = state.mixedCapacityCounts.slice();
  const farmCounts = state.farmCounts.slice();
  for (const building of removed) {
    buildingCounts[building.class]--;
    const capacity = capacityAtLevel(building.level ?? 0);
    capacityCounts[building.class] -= capacity;
    // `addBuilding` normalizza `mixed` prima di conservarlo, quindi cio' che
    // c'e' qui e' esattamente cio' che era stato contato: si decrementa senza
    // rifare la validazione, altrimenti due regole diverse conterebbero al
    // contrario sullo stesso edificio.
    if (building.mixed !== undefined) {
      mixedCounts[building.mixed]--;
      mixedCapacityCounts[building.mixed] -= capacity;
    }
    // Stessa ragione per la torre: si disfa cio' che il record dichiara, non
    // cio' che il luogo esprimerebbe adesso. Uno sventramento che ricalcolasse
    // la specializzazione lascerebbe il contatore fuori posto per sempre.
    if (building.specialization === 'farming') farmCounts[FARM_KIND.tower] -= capacity;
  }

  state.field.removeBuildings(removed, survivors, state.catalysts, resolveWeights(state.policies));

  return {
    ...state,
    buildings: survivors,
    buildingCounts,
    capacityCounts,
    mixedCounts,
    mixedCapacityCounts,
    farmCounts,
  };
}

/**
 * Attiva o disattiva una policy.
 *
 * Un peso di desiderabilita' moltiplica ogni cella della sua classe, quindi
 * quella classe va ricostruita per intero. Non e' un ricalcolo globale della
 * mappa: il costo resta quello dei catalizzatori e degli edifici esistenti, e
 * comunque non sta sul percorso del tick ma su un'azione del giocatore.
 */
export function setPolicyActive(state: SimState, id: PolicyId, active: boolean): SimState {
  const policies = withPolicy(state.policies, id, active);
  if (policies.length === state.policies.length && policies.every((p, i) => p === state.policies[i])) {
    return state;
  }

  const touched = classOfWeight(policyById(id).weight);
  if (touched !== -1) {
    state.field.rebuildClasses(state.catalysts, state.buildings, resolveWeights(policies), [touched]);
  }
  return { ...state, policies };
}

/** Spegne tutte le policy in un colpo solo. */
export function clearPolicies(state: SimState): SimState {
  let next = state;
  for (const id of [...state.policies]) next = setPolicyActive(next, id, false);
  return next;
}

/** Classe di cui la scena di debug mostra il campo. Non tocca la simulazione. */
export function setSelectedClass(state: SimState, cls: BuildingClass): SimState {
  if (cls === state.selectedClass) return state;
  return { ...state, selectedClass: cls };
}

/** Sincronizza i collegamenti costruiti dal mondo senza toccare il campo. */
export function setIslandConnections(state: SimState, count: number): SimState {
  const islandConnections = Math.max(0, Math.min(
    BALANCE.satisfaction.maxIslandBridges,
    Math.floor(Number.isFinite(count) ? count : 0),
  ));
  if (islandConnections === state.islandConnections) return state;
  return { ...state, islandConnections };
}

/** Cambia la priorita commerciale; non effettua scambi fuori dal tick. */
export function setTradeMode(state: SimState, mode: TradeMode): SimState {
  if (state.tradeMode === mode) return state;
  return { ...state, tradeMode: mode };
}

/**
 * Applica una delle alternative della decisione corrente.
 *
 * Oltre alle risorse sposta lo slot della famiglia: un'alternativa con un
 * mandato lo mette al posto di quello che c'era, una con `charter: null` svuota
 * lo slot, una senza il campo lo lascia com'e'. Il campo di desiderabilita' non
 * si tocca — i mandati non sono pesi.
 */
export function resolveDecision(state: SimState, optionId: string): SimState | null {
  if (state.pendingDecision === null) return null;
  const option = decisionOption(state.pendingDecision, optionId);
  if (option === null) return null;
  const effect = option.effect;
  const family = state.pendingDecision.family;
  const history = [...state.decisionHistory, {
    tick: state.tickCount,
    decisionId: state.pendingDecision.id,
    family,
    optionId,
    summary: option.description,
  }].slice(-BALANCE.decisions.historyLimit);
  const charters = option.charter === undefined
    ? state.charters
    : option.charter === null
      ? withoutFamily(state.charters, family)
      : withCharter(state.charters, option.charter);
  return {
    ...state,
    food: shifted(state.food, effect.food ?? 0),
    materials: shifted(state.materials, effect.materials ?? 0),
    funds: shifted(state.funds, effect.funds ?? 0),
    satisfaction: clamp01(state.satisfaction + (effect.satisfaction ?? 0)),
    charters,
    pendingDecision: null,
    decisionHistory: history,
    nextDecisionTick: state.tickCount + BALANCE.decisions.intervalTicks,
    // L'impronta riparte da qui: la prossima scelta contestuale attende un
    // cambiamento reale invece di ripresentarsi alla scadenza.
    decisionStamp: decisionFingerprint(state),
    decisionDismissedUntil: 0,
    // Un'emergenza risolta non si ripropone alla scadenza successiva: torna a
    // scattare solo dopo essere rientrata, e a dirlo e' `tick`. Le altre due
    // famiglie non hanno un fronte perche' non descrivono un guasto — una
    // piazza da assegnare si ripresenta, una carestia gia' dichiarata no.
    supplyArmed: family === 'supply' ? false : state.supplyArmed,
  };
}

/**
 * Rimanda la decisione sospesa senza risolverla.
 *
 * La scelta resta com'e': si nasconde per `decisions.snoozeTicks` e poi
 * riappare identica. Non tocca `nextDecisionTick` ne' l'impronta, perche' non
 * e' una risoluzione — e' il giocatore che si prende tempo.
 */
export function snoozeDecision(state: SimState): SimState {
  if (state.pendingDecision === null) return state;
  return { ...state, decisionDismissedUntil: state.tickCount + BALANCE.decisions.snoozeTicks };
}

// --- Serializzazione -------------------------------------------------------

/**
 * La parte da salvare: e' lo stato meno il campo, che e' derivato.
 *
 * Non copia in profondita': `SimStateData` e i suoi elementi sono gia'
 * immutabili per contratto e non contengono cicli, funzioni o array tipizzati.
 */
export function toSimStateData(state: SimState): SimStateData {
  const { field: _field, reach: _reach, ...data } = state;
  return data;
}

/**
 * Ricostruisce uno stato completo da dati letti da JSON.
 *
 * Il campo viene ricostruito, non caricato: essendo funzione pura di
 * catalizzatori, edifici, policy **e costo di attraversamento**, il risultato
 * coincide con quello che si aveva prima di serializzare. Il costo va quindi
 * ripassato: e' l'unico ingresso del campo che non stia nei dati salvati, e
 * ometterlo da una citta' identica su un'isola piatta.
 */
export function reviveSimState(data: SimStateData, reachCost?: StepCost): SimState {
  const compatible = data as SimStateData & Partial<Pick<
    SimStateData,
    'tradeMode' | 'trade' | 'commerce' | 'mixedCounts' | 'charters' | 'farmCounts'
    | 'capacityCounts' | 'mixedCapacityCounts' | 'flows' | 'harvest' | 'materialFlows' | 'staffing'
    | 'pendingDecision' | 'decisionHistory' | 'nextDecisionTick' | 'supplyArmed'
    | 'decisionStamp' | 'decisionDismissedUntil'
    | 'islandConnections'
  >>;
  const normalised: SimStateData = {
    ...data,
    catalysts: data.catalysts.map(normaliseCatalyst),
    mixedCounts: compatible.mixedCounts ?? countMixed(data.buildings),
    capacityCounts: compatible.capacityCounts ?? countCapacities(data.buildings, false),
    mixedCapacityCounts: compatible.mixedCapacityCounts ?? countCapacities(data.buildings, true),
    // Delle tre voci solo la torre e' ricostruibile dai dati salvati, perche' e'
    // un edificio e sta nella lista. Campo e frutteto sono lotti del mondo: un
    // salvataggio che non li porta torna con zero, e a ripopolare il contatore
    // e' il driver al primo giro. E' il verso giusto — la terra la sa il mondo.
    farmCounts: compatible.farmCounts ?? countFarms(data.buildings),
    commerce: compatible.commerce ?? EMPTY_COMMERCE,
    // Un salvataggio piu' vecchio non ha i flussi: si ricostruiscono al primo
    // tick, come il commercio, perche' nessuno dei due e' un accumulo. Vale
    // parola per parola anche per il referto del raccolto.
    flows: compatible.flows ?? NO_FUNDS_FLOW,
    harvest: compatible.harvest ?? EMPTY_HARVEST,
    materialFlows: compatible.materialFlows ?? EMPTY_MATERIALS,
    // Idem per l'organico: un salvataggio che non lo porta torna ottimista, che
    // e' come si comportava il driver prima che questo numero esistesse, e il
    // primo tick lo riscrive con quello vero.
    staffing: compatible.staffing ?? 1,
    policies: canonicalPolicies(data.policies),
    charters: canonicalCharters(compatible.charters ?? []),
    tradeMode: compatible.tradeMode !== undefined && isTradeMode(compatible.tradeMode)
      ? compatible.tradeMode
      : 'balanced',
    // `links` non esisteva finche' il commercio era acceso da un booleano: lo
    // spread su `EMPTY_TRADE` lo aggiunge vuoto invece di lasciarlo `undefined`,
    // e al primo tick viene ricalcolato comunque dai catalizzatori.
    trade: compatible.trade === undefined ? EMPTY_TRADE : { ...EMPTY_TRADE, ...compatible.trade },
    pendingDecision: compatible.pendingDecision ?? null,
    decisionHistory: compatible.decisionHistory ?? [],
    nextDecisionTick: compatible.nextDecisionTick ?? BALANCE.decisions.firstTick,
    // Un salvataggio che non porta l'impronta torna a `-1`: la prima scelta
    // contestuale si apre comunque, come in una partita nuova.
    decisionStamp: compatible.decisionStamp ?? -1,
    decisionDismissedUntil: compatible.decisionDismissedUntil ?? 0,
    // Un salvataggio che non porta il fronte torna armato: al primo tick, se la
    // citta' mangia, resta armato senza aver disturbato nessuno; se non mangia,
    // l'emergenza e' proprio la cosa che va chiesta.
    supplyArmed: compatible.supplyArmed ?? true,
    islandConnections: compatible.islandConnections ?? 0,
  };
  const field = new DesirabilityField(reachCost);
  field.rebuild(normalised.catalysts, normalised.buildings, resolveWeights(normalised.policies));
  return { ...normalised, field, reach: field.reach };
}

/**
 * Ricostruisce il campo dallo stato corrente. Serve dopo un caricamento o in un
 * test, **e dopo che il terreno e' cambiato sotto**: allargare l'isola sposta
 * il costo di attraversamento, e le portate gia' calcolate parlerebbero di una
 * costa che non c'e' piu'.
 */
export function rebuildField(state: SimState): void {
  state.reach.clear();
  state.field.rebuild(state.catalysts, state.buildings, resolveWeights(state.policies));
}

// --- Normalizzazione -------------------------------------------------------

/**
 * Porta un catalizzatore nel dominio dichiarato: `strength` intero in 0..255,
 * `radius` intero >= 0, coordinate intere.
 *
 * Serve a due cose: rendere il campo indipendente da come e' stato costruito il
 * dato in ingresso, e garantire che il giro in JSON non cambi nulla — un
 * `strength` di 12.5 tornerebbe identico da JSON, ma darebbe un campo diverso da
 * quello di un intero, e ogni confronto per uguaglianza profonda diventerebbe
 * una questione di virgola mobile.
 */
function normaliseCatalyst(catalyst: Catalyst): Catalyst {
  const strength = clampInt(catalyst.strength, 0, BALANCE.limits.maxDesirability);
  const cls = isBuildingClass(catalyst.class) ? catalyst.class : BUILDING_CLASS.residential;
  return {
    x: Math.round(catalyst.x),
    y: Math.round(catalyst.y),
    class: cls,
    ...(catalyst.kind !== undefined && isCatalystId(catalyst.kind) ? { kind: catalyst.kind } : {}),
    strength,
    radius: Math.max(0, Math.round(catalyst.radius)),
  };
}

/** Ricostruisce i conteggi di uso secondario dalla lista degli edifici. */
function countMixed(buildings: readonly Building[]): readonly number[] {
  const counts = new Array<number>(CLASS_COUNT).fill(0);
  for (const building of buildings) {
    if (building.mixed === undefined || !isBuildingClass(building.mixed)) continue;
    if (building.mixed === building.class) continue;
    counts[building.mixed]++;
  }
  return counts;
}

/**
 * Ricostruisce i contatori dei produttori dalla lista degli edifici.
 *
 * Puo' ricostruire **solo le torri**, ed e' una limitazione dichiarata: campo e
 * frutteto non sono edifici e non stanno nella lista. Vedi la nota in
 * `reviveSimState`.
 */
function countFarms(buildings: readonly Building[]): readonly number[] {
  const counts = new Array<number>(FARM_COUNT).fill(0);
  for (const building of buildings) {
    if (building.specialization === 'farming') {
      counts[FARM_KIND.tower] += capacityAtLevel(building.level ?? 0);
    }
  }
  return counts;
}

function countCapacities(buildings: readonly Building[], mixed: boolean): readonly number[] {
  const counts = new Array<number>(CLASS_COUNT).fill(0);
  for (const building of buildings) {
    const cls = mixed ? building.mixed : building.class;
    if (cls === undefined || !isBuildingClass(cls)) continue;
    counts[cls] += capacityAtLevel(building.level ?? 0);
  }
  return counts;
}

function normaliseLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return 0;
  return Math.max(0, Math.floor(level));
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function shifted(value: Resource, delta: number): Resource {
  return { ...value, stock: Math.min(BALANCE.limits.maxStock, Math.max(0, value.stock + delta)) };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function canonicalPolicies(policies: readonly string[]): readonly PolicyId[] {
  let out: readonly PolicyId[] = [];
  for (const id of policies) {
    if (!isPolicyId(id)) continue;
    out = withPolicy(out, id, true);
  }
  return out;
}

/** Le tre classi in ordine, riesportate per chi lavora sullo stato. */
export { ALL_CLASSES, BUILDING_CLASS };
export type { BuildingClass, CharterId, PolicyId };
