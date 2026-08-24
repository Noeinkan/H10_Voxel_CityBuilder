import type { TerrainMap } from '../world/terrain/TerrainMap';
import { BALANCE } from './balance';
import { BUILDING_CLASS, type BuildingClass } from './classes';
import { resolveCommerce } from './commerce';
import { decisionAt } from './decisions';
import { FARM_KIND, farmUpkeepOf, farmWorkersOf, harvestOf } from './farms';
import { resolveWeights, type Weights } from './policies';
import { nextState, unitOf } from './rng';
import type { Resource, SimState } from './SimState';
import { servedFerryLines } from './ferry';
import { resolveExternalTrade, tradeLinksOf } from './trade';

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
 * **Bilancio.** In ordine: lavoro, industria, cibo, materiali e commercio,
 * fondi e manutenzione, commercio esterno, soddisfazione, popolazione. L'ordine
 * conta perche' ogni passo consuma cio' che il precedente ha appena prodotto: la
 * produzione di questo tick e' gia' mangiabile e gia' vendibile in questo tick,
 * e la fame che ne segue pesa sulla popolazione dello stesso tick.
 *
 * **Tre catene, un bacino.** Industria, commercio e agricoltura competono per la
 * stessa forza lavoro; le prime due si passano anche gli stessi materiali. E'
 * quella competizione — non tre bilanci separati — a rendere leggibile la
 * differenza fra una citta' di fabbriche, una di mercati e una che deve prima di
 * tutto darsi da mangiare.
 *
 * **Il cibo non esce piu' dalla fabbrica.** Lo producono i lotti agricoli e le
 * torri idroponiche, che il mondo dichiara con `addFarm`: e' l'unica risorsa che
 * chiede **terra** invece che desiderabilita', ed e' quello a darle un posto
 * sulla mappa. Una torre e' industria convertita — conta in `buildingCounts` e
 * in `farmCounts` insieme — quindi produrre cibo in verticale costa materiali.
 *
 * **Uso misto.** Un edificio misto conta una volta sotto il suo uso primario e
 * una frazione (`mixedUse.secondaryShare`) sotto il secondo. Il bilancio non sa
 * altro di lui: non e' una zona nuova, e' una capacita' in piu' nella stessa
 * colonna.
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

  const residential = effectiveCount(state, BUILDING_CLASS.residential);
  const commercial = effectiveCount(state, BUILDING_CLASS.commercial);
  const industrial = effectiveCount(state, BUILDING_CLASS.industrial);
  const civic = effectiveCount(state, BUILDING_CLASS.civic);

  const population = state.population.stock;
  const capacity = residential * weights.residentialCapacity;

  // --- Lavoro --------------------------------------------------------------
  //
  // Un solo bacino per tre catene: la quota di organico e' condivisa, quindi
  // aprire negozi mentre le fabbriche sono a corto di braccia rallenta anche
  // quelle — e adesso rallenta pure il raccolto. E' la tensione che rende una
  // scelta il rapporto fra le tre.
  //
  // **Una torre non e' anche una fabbrica.** Chi porta la specializzazione
  // `farming` sta in `buildingCounts[industrial]` per l'uso del suolo e in
  // `farmCounts[tower]` per cio' che produce: qui va tolto dall'industria che
  // fa materiali, o pagherebbe due volte l'organico e renderebbe due volte.

  const farmCounts = state.farmCounts;
  const towers = farmCounts[FARM_KIND.tower] ?? 0;
  const materialIndustry = Math.max(0, industrial - towers);

  const workersNeeded = materialIndustry * BALANCE.work.workersPerProduction +
    commercial * BALANCE.commerce.workersPerCommercial +
    farmWorkersOf(farmCounts);
  const workersAvailable = population * BALANCE.work.workforceShare;
  const staffing = workersNeeded > 0 ? Math.min(1, workersAvailable / workersNeeded) : 0;

  // La scomposizione e non il totale: la stessa aritmetica serve al bilancio e
  // al referto che l'HUD mostra, e due conti separati divergerebbero.
  const grown = harvestOf(farmCounts, staffing);
  let foodProduced = 0;
  for (const yielded of grown) foodProduced += yielded;
  const materialsProduced = materialIndustry * weights.productionYield * staffing;

  // --- Cibo ----------------------------------------------------------------

  const foodDemand = population * BALANCE.food.perResident;
  const foodAvailable = state.food.stock + foodProduced;
  const foodConsumed = Math.min(foodDemand, foodAvailable);
  const foodStock = finiteStock(foodAvailable - foodConsumed);
  const fed = foodDemand > 0 ? foodConsumed / foodDemand : 1;

  // --- Materiali e commercio interno --------------------------------------
  //
  // I materiali si contano prima dei fondi perche' il commercio li trasforma in
  // incasso: girare l'ordine rimanderebbe al tick dopo il ricavo di merce gia'
  // venduta in questo.

  const maintenance = state.buildings.length * BALANCE.materials.upkeepPerBuilding;
  const materialsAvailable = state.materials.stock + materialsProduced;
  const materialsAfterUpkeep = materialsAvailable - Math.min(maintenance, materialsAvailable);

  const commerce = resolveCommerce({
    commercial,
    population,
    staffing,
    materials: materialsAfterUpkeep,
    capacityPerBuilding: weights.commercialCapacity,
  });
  const materialsStock = finiteStock(materialsAfterUpkeep - commerce.goods);

  // --- Fondi ---------------------------------------------------------------

  const civicUpkeep = civic * weights.civicUpkeep;
  const policyUpkeep = state.policies.reduce(
    (sum, id) => sum + BALANCE.gameplay.policy[id].upkeep,
    0,
  );
  // La torre idroponica e' l'unico produttore di cibo che costa fondi per tick:
  // e' cio' che le impedisce di essere la risposta a tutto appena il suolo
  // stringe. Campo e frutteto valgono zero e la somma li attraversa gratis.
  const upkeep = civicUpkeep + policyUpkeep + farmUpkeepOf(farmCounts);
  const income = population * BALANCE.funds.taxPerResident + commerce.revenue;
  const fundsAvailable = state.funds.stock + income;
  const upkeepPaid = Math.min(upkeep, fundsAvailable);
  const fundsStock = finiteStock(fundsAvailable - upkeepPaid);
  const funded = civicUpkeep > 0 ? Math.min(civicUpkeep, upkeepPaid) / civicUpkeep : 1;

  // --- Commercio esterno ---------------------------------------------------

  const trade = resolveExternalTrade({
    links: tradeLinksOf(state.catalysts),
    mode: state.tradeMode,
    population,
    buildings: state.buildings.length,
    food: foodStock,
    materials: materialsStock,
    funds: fundsStock,
  });

  // --- Soddisfazione -------------------------------------------------------

  const satisfaction = nextSatisfaction(
    state.satisfaction,
    population,
    capacity,
    civic,
    funded,
    commerce.service,
    servedFerryLines(state.catalysts),
  );

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

  const next: SimState = {
    ...state,
    tickCount: state.tickCount + 1,
    rngState,
    population: moved(state.population, populationStock),
    food: moved(state.food, finiteStock(trade.foodStock)),
    materials: moved(state.materials, finiteStock(trade.materialsStock)),
    funds: moved(state.funds, finiteStock(trade.fundsStock)),
    satisfaction,
    commerce,
    // I sei numeri erano gia' tutti qui: venivano calcolati, usati per il saldo
    // e buttati via una riga dopo. Tenerli e' cio' che permette all'HUD di dire
    // **perche'** i fondi scendono invece che soltanto di quanto.
    flows: {
      tax: population * BALANCE.funds.taxPerResident,
      retail: commerce.revenue,
      trade: trade.funds,
      civic: civicUpkeep,
      policies: policyUpkeep,
      farms: farmUpkeepOf(farmCounts),
      paid: upkeepPaid,
    },
    // Stessa mossa di `flows`, sull'altra risorsa che ha piu' di una sorgente.
    // Il raccolto per produttore era gia' qui — serve al bilancio — e tenerlo e'
    // cio' che permette all'HUD di dire **da dove viene** il cibo invece che
    // soltanto quanto ce n'e'.
    harvest: {
      grown,
      imported: trade.food,
      eaten: foodConsumed,
    },
    trade: {
      connected: trade.connected,
      links: trade.links,
      food: trade.food,
      materials: trade.materials,
      funds: trade.funds,
    },
  };
  if (next.pendingDecision !== null) return next;
  const pendingDecision = decisionAt(next, next.nextDecisionTick);
  return pendingDecision === null ? next : { ...next, pendingDecision };
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

/**
 * Edifici efficaci di un uso: i suoi, piu' la quota di quelli che lo ospitano.
 *
 * E' l'unico punto in cui `buildingCounts` e `mixedCounts` si incontrano. Un
 * edificio misto vale uno sul suo uso primario e `secondaryShare` sul secondo:
 * ospita davvero due funzioni, ma in un volume solo, e la capacita' lo dice.
 */
export function effectiveCount(state: SimState, cls: BuildingClass): number {
  const mixed = state.mixedCounts[cls] ?? 0;
  return state.buildingCounts[cls] + mixed * BALANCE.mixedUse.secondaryShare;
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
  service: number,
  ferryLines: number,
): number {
  const occupancy =
    capacity > 0
      ? Math.min(BALANCE.satisfaction.maxOccupancy, population / capacity)
      : population > 0
        ? BALANCE.satisfaction.maxOccupancy
        : 0;

  const crowding = Math.max(0, occupancy - 1) * BALANCE.satisfaction.crowdingPenalty;
  // I negozi sono la seconda leva sulla soddisfazione, accanto ai servizi
  // civici: una citta' servita e' contenta anche senza un municipio ogni due
  // isolati, ed e' cio' che tiene in piedi una strategia mercantile.
  const retail = service * BALANCE.commerce.satisfactionPerService;
  // Una linea di traghetto e' la terza leva, e l'unica che nasce da *dove* si e'
  // costruito invece che da quanto: due imbarchi lontani valgono, due vicini no.
  const crossings = ferryLines * BALANCE.satisfaction.perFerryLine;
  const target = clamp01(
    BALANCE.satisfaction.base +
      funded * civic * BALANCE.satisfaction.perCivic +
      retail +
      crossings -
      crowding,
  );

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
