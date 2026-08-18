import type { TerrainMap } from '../world/terrain/TerrainMap';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { resolveWeights, type Weights } from './policies';
import { nextState, unitOf } from './rng';
import type { Resource, SimState } from './SimState';

/**
 * Un tick di simulazione.
 *
 * **Puro.** Non muta lo stato in ingresso, non legge `Date.now()` ne'
 * `Math.random()`, non tocca il mondo voxel e non costruisce nulla: restituisce
 * un nuovo stato e basta. Il rumore della migrazione esce dal PRNG con seed che
 * vive dentro lo stato, quindi la sequenza e' riproducibile a partire dal solo
 * `rngState`.
 *
 * **Non tocca il campo di desiderabilita'.** Niente cambia il campo durante un
 * tick — non nascono catalizzatori, non nascono edifici — quindi il nuovo stato
 * riceve lo stesso oggetto `field` senza copiarlo e senza ricalcolare una sola
 * cella. E' il motivo per cui il costo del tick non dipende dall'estensione
 * della mappa.
 *
 * **Bilancio.** In ordine: lavoro e produzione, cibo, fondi e manutenzione,
 * soddisfazione, popolazione. L'ordine conta perche' ogni passo consuma cio' che
 * il precedente ha appena prodotto: la produzione di questo tick e' gia'
 * mangiabile in questo tick, e la fame che ne segue pesa sulla popolazione dello
 * stesso tick.
 *
 * **Perche' nessuno stock puo' andare sotto zero.** Ogni consumo e' un
 * `min(domanda, disponibile)`, mai una sottrazione secca: cio' che manca diventa
 * un rapporto di soddisfacimento in [0, 1] (`fed`, `funded`) che degrada la
 * simulazione invece di scavare un buco nello stock. `finiteStock` chiude il
 * discorso come rete di sicurezza, non come meccanismo.
 *
 * `terrainMap` entra nel bilancio con un solo numero, le colonne edificabili:
 * un'isola che si sta riempiendo smette di attirare gente. E' una lettura O(1)
 * su un contatore che la mappa gia' mantiene, non una scansione del terreno.
 */
export function tick(state: SimState, terrainMap: TerrainMap): SimState {
  const weights = resolveWeights(state.policies);

  const residential = state.buildingCounts[BUILDING_CLASS.residential];
  const production = state.buildingCounts[BUILDING_CLASS.production];
  const civic = state.buildingCounts[BUILDING_CLASS.civic];

  const population = state.population.stock;
  const capacity = residential * weights.residentialCapacity;

  // --- Lavoro e produzione -------------------------------------------------

  const workersNeeded = production * BALANCE.work.workersPerProduction;
  const workersAvailable = population * BALANCE.work.workforceShare;
  const staffing = workersNeeded > 0 ? Math.min(1, workersAvailable / workersNeeded) : 0;

  const foodProduced = production * BALANCE.food.perProduction * staffing;
  const materialsProduced = production * weights.productionYield * staffing;

  // --- Cibo ----------------------------------------------------------------

  const foodDemand = population * BALANCE.food.perResident;
  const foodAvailable = state.food.stock + foodProduced;
  const foodConsumed = Math.min(foodDemand, foodAvailable);
  const foodStock = finiteStock(foodAvailable - foodConsumed);
  const fed = foodDemand > 0 ? foodConsumed / foodDemand : 1;

  // --- Fondi ---------------------------------------------------------------

  const upkeep = civic * weights.civicUpkeep;
  const income = population * BALANCE.funds.taxPerResident;
  const fundsAvailable = state.funds.stock + income;
  const upkeepPaid = Math.min(upkeep, fundsAvailable);
  const fundsStock = finiteStock(fundsAvailable - upkeepPaid);
  const funded = upkeep > 0 ? upkeepPaid / upkeep : 1;

  // --- Materiali -----------------------------------------------------------

  const maintenance = state.buildings.length * BALANCE.materials.upkeepPerBuilding;
  const materialsAvailable = state.materials.stock + materialsProduced;
  const materialsStock = finiteStock(materialsAvailable - Math.min(maintenance, materialsAvailable));

  // --- Soddisfazione -------------------------------------------------------

  const satisfaction = nextSatisfaction(state.satisfaction, population, capacity, civic, funded);

  // --- Popolazione ---------------------------------------------------------

  const rngState = nextState(state.rngState);
  // `unitOf` sta in [0, 1): il rimappaggio a [-1, 1) e' aritmetica, l'ampiezza
  // sta in `balance.ts`.
  const jitter = (unitOf(rngState) * 2 - 1) * BALANCE.population.migrationJitter;

  const populationStock = finiteStock(
    nextPopulation(population, capacity, {
      fed,
      satisfaction,
      jitter,
      landFactor: landFactor(state.buildings.length, terrainMap),
    }),
  );

  return {
    ...state,
    tickCount: state.tickCount + 1,
    rngState,
    population: moved(state.population, populationStock),
    food: moved(state.food, foodStock),
    materials: moved(state.materials, materialsStock),
    funds: moved(state.funds, fundsStock),
    satisfaction,
  };
}

/** Esegue `count` tick di fila. Comodo nei test e nel passo automatico della scena. */
export function tickMany(state: SimState, terrainMap: TerrainMap, count: number): SimState {
  let current = state;
  for (let i = 0; i < count; i++) current = tick(current, terrainMap);
  return current;
}

/**
 * Pesi effettivi dello stato. E' la stessa funzione che usa `tick`, esposta
 * perche' l'overlay possa mostrare cosa stanno facendo le policy.
 */
export function weightsOf(state: SimState): Weights {
  return resolveWeights(state.policies);
}

interface PopulationInputs {
  readonly fed: number;
  readonly satisfaction: number;
  readonly jitter: number;
  readonly landFactor: number;
}

/**
 * Popolazione del tick successivo.
 *
 * Sotto capacita' la citta' riempie una frazione dello spazio libero, tanto piu'
 * grande quanto e' nutrita, contenta e ancora circondata da terra libera. Sopra
 * capacita' — cosa che succede solo se un edificio residenziale sparisce o se
 * una policy di densita' viene spenta — l'eccedenza se ne va a un ritmo suo.
 *
 * La frazione riempita per tick resta sotto 1 anche col rumore al massimo
 * (`growthRate * (1 + migrationJitter)`): e' cio' che fa convergere la
 * popolazione alla capacita' invece di farla oscillare intorno.
 */
function nextPopulation(
  population: number,
  capacity: number,
  inputs: PopulationInputs,
): number {
  const headroom = capacity - population;

  const growth =
    headroom >= 0
      ? headroom *
        BALANCE.population.growthRate *
        inputs.fed *
        satisfactionFactor(inputs.satisfaction) *
        inputs.landFactor *
        (1 + inputs.jitter)
      : headroom * BALANCE.population.declineRate;

  const starvation = population * (1 - inputs.fed) * BALANCE.population.starvationRate;
  return population + growth - starvation;
}

/**
 * Soddisfazione del tick successivo: si muove di una frazione fissa verso il
 * bersaglio, cosi' non salta da un tick all'altro quando un edificio civico
 * resta senza fondi per un tick solo.
 */
function nextSatisfaction(
  current: number,
  population: number,
  capacity: number,
  civic: number,
  funded: number,
): number {
  const occupancy =
    capacity > 0
      ? Math.min(BALANCE.satisfaction.maxOccupancy, population / capacity)
      : population > 0
        ? BALANCE.satisfaction.maxOccupancy
        : 0;

  const crowding = Math.max(0, occupancy - 1) * BALANCE.satisfaction.crowdingPenalty;
  const target = clamp01(BALANCE.satisfaction.base + funded * civic * BALANCE.satisfaction.perCivic - crowding);

  return clamp01(current + (target - current) * BALANCE.satisfaction.inertia);
}

/**
 * Quanto resta di appetibile l'isola. Va a zero quando gli edifici pareggiano le
 * colonne edificabili: e' il freno che impedisce alla popolazione di crescere
 * oltre il territorio disponibile.
 */
function landFactor(buildings: number, terrainMap: TerrainMap): number {
  const buildable = Math.max(1, terrainMap.buildableCount);
  return clamp01(1 - (buildings / buildable) * BALANCE.population.landPressure);
}

function moved(previous: Resource, stock: number): Resource {
  return { stock, delta: stock - previous.stock };
}

/**
 * Rete di sicurezza sugli stock: mai negativi, mai `NaN`, mai `Infinity`.
 *
 * Il bilancio e' gia' costruito per non produrre nessuno dei tre; questa
 * funzione esiste perche' un coefficiente ritoccato male in `balance.ts` deve
 * degradare la simulazione, non corromperla in modo irreversibile.
 */
function finiteStock(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.min(BALANCE.limits.maxStock, value);
}

/** Fattore di crescita dovuto alla soddisfazione, sempre in `[1 - k, 1]`. */
function satisfactionFactor(satisfaction: number): number {
  const k = BALANCE.population.satisfactionInfluence;
  return 1 - k + k * satisfaction;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
