import { BALANCE } from './balance';
import { ALL_CLASSES, BUILDING_CLASS, CLASS_COUNT, isBuildingClass, type BuildingClass } from './classes';
import {
  DesirabilityField,
  type Building,
  type Catalyst,
} from './DesirabilityField';
import {
  classOfWeight,
  isPolicyId,
  policyById,
  resolveWeights,
  withPolicy,
  type PolicyId,
} from './policies';

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

  readonly buildings: readonly Building[];

  /** Conteggio edifici per classe, indicizzato come `BUILDING_CLASS`. */
  readonly buildingCounts: readonly number[];

  readonly catalysts: readonly Catalyst[];

  /** Policy attive, sempre in ordine di catalogo. */
  readonly policies: readonly PolicyId[];

  /** Classe di cui la scena di debug disegna la heatmap e scrive `VoxelWorld.data`. */
  readonly selectedClass: BuildingClass;
}

export interface SimState extends SimStateData {
  readonly field: DesirabilityField;
}

export interface SimStateOptions {
  readonly rngState?: number;
  readonly catalysts?: readonly Catalyst[];
  readonly policies?: readonly PolicyId[];
  readonly selectedClass?: BuildingClass;
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
    buildings: [],
    buildingCounts: new Array<number>(CLASS_COUNT).fill(0),
    catalysts: catalysts.map(normaliseCatalyst),
    policies: canonicalPolicies(policies),
    selectedClass: options.selectedClass ?? BUILDING_CLASS.residential,
  };

  const field = new DesirabilityField();
  field.rebuild(data.catalysts, data.buildings, resolveWeights(data.policies));
  return { ...data, field };
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

  const buildingCounts = state.buildingCounts.slice();
  buildingCounts[building.class]++;

  return {
    ...state,
    buildings: [...state.buildings, { x: building.x, y: building.y, class: building.class }],
    buildingCounts,
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

// --- Serializzazione -------------------------------------------------------

/**
 * La parte da salvare: e' lo stato meno il campo, che e' derivato.
 *
 * Non copia in profondita': `SimStateData` e i suoi elementi sono gia'
 * immutabili per contratto e non contengono cicli, funzioni o array tipizzati.
 */
export function toSimStateData(state: SimState): SimStateData {
  const { field: _field, ...data } = state;
  return data;
}

/**
 * Ricostruisce uno stato completo da dati letti da JSON.
 *
 * Il campo viene ricostruito, non caricato: essendo funzione pura di
 * catalizzatori, edifici e policy, il risultato coincide con quello che si
 * aveva prima di serializzare.
 */
export function reviveSimState(data: SimStateData): SimState {
  const field = new DesirabilityField();
  field.rebuild(data.catalysts, data.buildings, resolveWeights(data.policies));
  return { ...data, field };
}

/** Ricostruisce il campo dallo stato corrente. Serve dopo un caricamento o in un test. */
export function rebuildField(state: SimState): void {
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
  return {
    x: Math.round(catalyst.x),
    y: Math.round(catalyst.y),
    class: isBuildingClass(catalyst.class) ? catalyst.class : BUILDING_CLASS.residential,
    strength,
    radius: Math.max(0, Math.round(catalyst.radius)),
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
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
export type { BuildingClass, PolicyId };
