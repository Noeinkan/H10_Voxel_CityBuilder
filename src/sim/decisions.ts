import { BALANCE } from './balance';
import type { CatalystId } from './catalysts';
import { charterOfFamily, type CharterFamily, type CharterId } from './charters';
import { BUILDING_CLASS } from './classes';
import { fedShareOf, foodDeficitOf, type FoodReport } from './farms';

export interface DecisionEffect {
  readonly food?: number;
  readonly materials?: number;
  readonly funds?: number;
  readonly satisfaction?: number;
}

/**
 * L'opera che un'alternativa fa costruire davvero sul terreno.
 *
 * Solo il ruolo: forza e raggio vengono da `BALANCE.decisions.grant` e la
 * classe da `catalystById`, cosi' un'opera non puo' raccontare di un mercato
 * diverso da quello della toolbar.
 */
export interface DecisionGrant {
  readonly kind: CatalystId;
}

export interface DecisionOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly effect: DecisionEffect;
  /**
   * Mandato concesso, o `null` per revocare quello della famiglia.
   *
   * Assente significa «non tocca lo slot»; `null` significa «lo svuota», ed e'
   * cio' che rende l'alternativa «non fare niente» una scelta con un effetto
   * invece di un ramo morto.
   */
  readonly charter?: CharterId | null;
  readonly grant?: DecisionGrant;
}

export interface CityDecision {
  readonly id: string;
  /** Slot che la scelta occupa. Una famiglia tiene un solo mandato per volta. */
  readonly family: CharterFamily;
  readonly title: string;
  readonly message: string;
  readonly options: readonly DecisionOption[];
}

export interface DecisionOutcome {
  readonly tick: number;
  readonly decisionId: string;
  /** Famiglia della decisione risolta: e' lo slot che quella scelta ha occupato. */
  readonly family: CharterFamily;
  readonly optionId: string;
  readonly summary: string;
}

/**
 * Cio' che serve a decidere quale scelta aprire, e nient'altro.
 *
 * Portava anche `food`, `materials` e `funds`: il primo era la condizione
 * dell'emergenza alimentare — sostituita da `harvest` — e gli altri due non li
 * leggeva nessuno. Una vista che dichiara piu' di quello che guarda non e' un
 * dettaglio: e' il posto dove si va a cercare *su cosa* si decide.
 */
export interface DecisionStateView {
  readonly tickCount: number;
  readonly population: { readonly stock: number };
  readonly buildingCounts: readonly number[];
  readonly decisionHistory: readonly DecisionOutcome[];
  /**
   * Referto dell'ultimo raccolto: e' da qui che si legge se la citta' mangia.
   * Il livello della dispensa non lo dice — vale zero tanto in carestia quanto
   * in pareggio.
   */
  readonly harvest: FoodReport;
  /** Falso finche' un'emergenza alimentare gia' risolta non e' rientrata. */
  readonly supplyArmed: boolean;
  /**
   * Lotti e torri della citta', e quante braccia ci vanno davvero.
   *
   * **Servono a distinguere una carestia da un inverno.** Con la resa
   * stagionale, una citta' che ha appena superato la propria campagna smette di
   * mangiare a dicembre e ricomincia a marzo: il referto del raccolto lo dice, e
   * da solo farebbe aprire un'emergenza che la primavera risolve senza che
   * nessuno abbia fatto niente. Da qui si chiede l'altra meta' — se la campagna
   * basti **all'anno medio** — e le due insieme sono la condizione.
   */
  readonly farmCounts: readonly number[];
  readonly staffing: number;
  /**
   * Mandati attivi: servono a dire se un'alternativa rinnova o solleva un
   * mandato gia' in piedi, invece di ripetere sempre la stessa scelta.
   */
  readonly charters: readonly CharterId[];
  /**
   * Impronta della citta' all'ultima risoluzione: finche' non cambia, una
   * scelta contestuale non si riapre solo perche' e' scaduto il tempo.
   */
  readonly decisionStamp: number;
}

/**
 * Un'impronta grossolana e deterministica della forma della citta'.
 *
 * Cambia solo quando succede qualcosa di decidibile: compare una classe di
 * edifici nuova, oppure la popolazione attraversa un ordine di grandezza. Non
 * conta gli edifici uno a uno — quella cambierebbe ogni tick mentre la citta'
 * cresce, e la scelta si riaprirebbe per qualunque cantiere. E' il confronto
 * con `decisionStamp` a decidere se una scelta contestuale ha davvero qualcosa
 * di nuovo da chiedere.
 */
export function decisionFingerprint(state: DecisionStateView): number {
  const population = state.population.stock;
  const popBucket = population <= 0 ? 0 : Math.floor(Math.log2(population + 1));
  let classes = 0;
  for (let cls = 0; cls < state.buildingCounts.length; cls++) {
    classes = classes * 2 + ((state.buildingCounts[cls] ?? 0) > 0 ? 1 : 0);
  }
  return classes * 64 + popBucket;
}

/**
 * Le due voci con cui una stessa scelta si ripresenta, scelte dal numero di
 * scadenza: la stessa decisione non si legge identica ogni volta.
 */
const PUBLIC_SQUARE_TITLES = [
  'A contested square',
  'A square in need of purpose',
  'The new square opens',
] as const;
const PUBLIC_SQUARE_MESSAGES = [
  'A growing civic district needs a use for its new public square.',
  'Residents, merchants and the town hall each want the square for something different.',
  'The civic district has opened a public square: what should it become?',
] as const;
const INVESTMENT_TITLES = [
  'Neighborhood investment',
  'Where the city invests next',
] as const;

/** Apre una scelta soltanto alla scadenza; la scelta resta ferma finche' il giocatore risponde. */
export function decisionAt(state: DecisionStateView, nextDecisionTick: number): CityDecision | null {
  if (state.tickCount < nextDecisionTick) return null;
  const population = state.population.stock;
  const buildings = state.buildingCounts.reduce((sum, value) => sum + value, 0);
  const scale = Math.max(1, Math.floor(state.population.stock / BALANCE.decisions.populationScale));
  // La dotazione si conta in **tempo**: tanti tick di spesa vera della citta'.
  // Una quantita', anche scalata a edifici interi, non dice quanto respiro
  // compra — e cento tick di respiro, misurati a schermo, erano dieci secondi.
  const relief = population * BALANCE.food.perResident * BALANCE.decisions.reliefTicks;
  // Quanta della domanda alimentare e' stata davvero servita, non quanta ne
  // resta in dispensa: le due coincidono solo in una citta' che ha una scorta,
  // e questa simulazione non ne costruisce nessuna. Il fronte lo tiene
  // `supplyArmed`, che `tick` ricarica quando la citta' torna a mangiare.
  // La seconda meta' della condizione e' **strutturale**, e senza di essa la
  // resa stagionale renderebbe l'emergenza un appuntamento invernale: qui si
  // chiede se la campagna basti all'anno medio, cioe' se ci sia qualcosa da
  // risolvere. `foodDeficitOf` non passa il fattore di stagione apposta.
  const shortCountryside =
    foodDeficitOf(population, state.farmCounts, state.staffing) > 0;
  if (population > 0 && state.supplyArmed && shortCountryside
    && fedShareOf(state.harvest, population) < BALANCE.decisions.hungerThreshold) {
    return {
      id: `food-${state.tickCount}`,
      family: 'supply',
      title: 'Supplies under pressure',
      message: 'The city can no longer feed all of its residents. Choose an emergency response.',
      options: [
        option('buy-food', 'Buy food supplies', 'Spend funds to restock the warehouses immediately.', {
          funds: -BALANCE.decisions.decisionCost * scale,
          food: relief,
        }, { charter: 'importedSupply' }),
        option('ration', 'Ration supplies', 'Preserve resources at the cost of happiness.', {
          satisfaction: -BALANCE.decisions.satisfactionStep,
          food: relief,
        }, { charter: 'rationing' }),
        // Anche il costo scala, o a citta' grande i giardini sarebbero cibo
        // gratis: la dotazione e la sua contropartita sono la stessa taglia
        // vista da due lati.
        option('community-gardens', 'Community gardens', 'Convert materials into food and public support.', {
          materials: -BALANCE.decisions.materialGrant * scale,
          food: relief,
          satisfaction: BALANCE.decisions.satisfactionStep,
        }, { charter: 'communityGardens', grant: { kind: 'park' } }),
      ],
    };
  }

  const publicSpaceAvailable = population >= BALANCE.decisions.populationScale
    && (state.buildingCounts[BUILDING_CLASS.civic] ?? 0) > 0;
  const investmentAvailable = buildings >= BALANCE.decisions.minimumBuildings
    && (state.buildingCounts[BUILDING_CLASS.industrial] ?? 0) > 0;
  if (!publicSpaceAvailable && !investmentAvailable) return null;

  // Una scelta contestuale attende un cambiamento reale: sotto il tetto di
  // inattivita' non si riapre solo perche' il tempo e' scaduto. L'emergenza
  // alimentare e' gia' passata sopra: quella e' un guasto, non una routine.
  const idle = state.tickCount - (nextDecisionTick - BALANCE.decisions.intervalTicks);
  if (decisionFingerprint(state) === state.decisionStamp
    && idle < BALANCE.decisions.maxIdleTicks) {
    return null;
  }

  // La famiglia dell'ultima decisione risolta, non il prefisso del suo id: da
  // quando ogni decisione dichiara il proprio slot, la rotazione fra le due
  // scelte contestuali si legge dal campo invece che da una stringa.
  const lastFamily = state.decisionHistory.at(-1)?.family;
  if (publicSpaceAvailable && (lastFamily !== 'publicSpace' || !investmentAvailable)) {
    return publicSpaceDecision(state, nextDecisionTick);
  }

  if (!investmentAvailable) return null;
  return investmentDecision(state, nextDecisionTick, buildings, scale);
}

/** La piazza contesa, con le alternative che riflettono il mandato in piedi. */
function publicSpaceDecision(
  state: DecisionStateView,
  nextDecisionTick: number,
): CityDecision {
  const flavor = nextDecisionTick % PUBLIC_SQUARE_TITLES.length;
  const active = charterOfFamily(state.charters, 'publicSpace');
  return {
    id: `public-space-${state.tickCount}`,
    family: 'publicSpace',
    title: PUBLIC_SQUARE_TITLES[flavor],
    message: PUBLIC_SQUARE_MESSAGES[flavor],
    options: [
      option(
        'festival',
        active === 'festivalGrounds' ? 'Renew the festival' : 'Fund a festival',
        active === 'festivalGrounds'
          ? 'Spend funds to keep the festival going and raise happiness.'
          : 'Spend funds to increase happiness.',
        {
          funds: -BALANCE.decisions.decisionCost,
          satisfaction: BALANCE.decisions.satisfactionStep,
        },
        { charter: 'festivalGrounds' },
      ),
      option(
        'materials-market',
        active === 'leasedSquare' ? 'Renew the market lease' : 'Lease it to the market',
        active === 'leasedSquare'
          ? 'Trade away materials to keep the lease and gain funds.'
          : 'Gain funds by trading away materials.',
        {
          materials: -BALANCE.decisions.materialGrant,
          funds: BALANCE.decisions.fundsGrant,
        },
        { charter: 'leasedSquare', grant: { kind: 'market' } },
      ),
      // L'unica alternativa che *toglie*: tenere la piazza libera revoca il
      // mandato della famiglia invece di non fare niente. Se non c'e' nessun
      // mandato da revocare, resta una scelta senza conseguenze.
      option(
        'leave-open',
        'Keep the space open',
        active === null
          ? 'No cost: the city retains flexibility.'
          : 'Lift the standing mandate and keep the square flexible.',
        {},
        { charter: null },
      ),
    ],
  };
}

/** L'investimento di quartiere, con le alternative che riflettono il mandato in piedi. */
function investmentDecision(
  state: DecisionStateView,
  nextDecisionTick: number,
  buildings: number,
  scale: number,
): CityDecision {
  const flavor = nextDecisionTick % INVESTMENT_TITLES.length;
  const active = charterOfFamily(state.charters, 'investment');
  const message = flavor === 0
    ? `The city now has ${buildings} buildings. Choose where to direct its next investment.`
    : `With ${buildings} buildings, the council can back one new direction.`;
  return {
    id: `investment-${state.tickCount}`,
    family: 'investment',
    title: INVESTMENT_TITLES[flavor],
    message,
    options: [
      option(
        'local-grant',
        active === 'localShops' ? 'Renew support for local shops' : 'Support local shops',
        active === 'localShops'
          ? 'Convert funds into materials and keep the arcades alive.'
          : 'Convert funds into materials and public trust.',
        {
          funds: -BALANCE.decisions.decisionCost,
          materials: BALANCE.decisions.materialGrant,
          satisfaction: BALANCE.decisions.satisfactionStep,
        },
        { charter: 'localShops', grant: { kind: 'market' } },
      ),
      option(
        'sell-reserve',
        active === 'soldReserves' ? 'Sell more of the reserves' : 'Sell the reserves',
        active === 'soldReserves'
          ? 'Gain more funds by consuming materials.'
          : 'Gain immediate funds by consuming materials.',
        {
          materials: -BALANCE.decisions.materialGrant,
          funds: BALANCE.decisions.fundsGrant,
        },
        { charter: 'soldReserves' },
      ),
      // Ultimo numero alimentare rimasto piatto, e per la stessa ragione degli
      // altri non poteva restarci: una fiera che costa 120 di cibo a qualunque
      // taglia e' soddisfazione gratis appena la citta' cresce, cioe' non e' piu'
      // una scelta fra tre alternative ma una sola ovvia.
      option(
        'food-fair',
        active === 'foodFair' ? 'Hold the food fair again' : 'Food fair',
        active === 'foodFair'
          ? 'Use food supplies to keep morale high.'
          : 'Use food supplies to strengthen morale.',
        {
          food: -BALANCE.decisions.foodGrant * scale,
          satisfaction: BALANCE.decisions.satisfactionStep,
        },
        { charter: 'foodFair' },
      ),
    ],
  };
}

export function decisionOption(decision: CityDecision, id: string): DecisionOption | null {
  return decision.options.find((option) => option.id === id) ?? null;
}

function option(
  id: string,
  label: string,
  description: string,
  effect: DecisionEffect,
  mark: { readonly charter?: CharterId | null; readonly grant?: DecisionGrant } = {},
): DecisionOption {
  return { id, label, description, effect, ...mark };
}
