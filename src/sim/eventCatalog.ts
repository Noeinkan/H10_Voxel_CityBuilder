import { BALANCE } from './balance';
import { charterOfFamily } from './charters';
import { BUILDING_CLASS } from './classes';
import type {
  DecisionEffect,
  DecisionFollowUp,
  DecisionGrant,
  DecisionOption,
  DecisionStateView,
} from './decisions';
import type { EventDefinition } from './eventPool';
import { policyById, POLICIES, type PolicyId } from './policies';
import {
  budgetAlarm,
  civicStrain,
  councilReady,
  fedShare,
  harvestSurplus,
  housingPressure,
  materialsStalled,
  policyActive,
  policyLocked,
  shortCountryside,
  unrest,
} from './strain';

/**
 * Il catalogo degli eventi: cosa la citta' puo' trovarsi a decidere.
 *
 * E' una **tabella di dati**, non logica: la regola con cui una di queste voci
 * si apre sta tutta in `eventPool.ts`, e qui ogni voce dice soltanto tre cose —
 * quando la riguarda (`qualifies`), quanto pesa fra le sue pari (`weight`) e
 * cosa mostra (`draft`). E' per questo che il file e' lungo e resta leggibile:
 * si scorre come un elenco, non si segue come un albero.
 *
 * **Le crisi guardano quasi sempre una policy.** Non e' un caso ne' una moda: e'
 * il modo in cui le due meta' del governo cittadino si parlano. Sovvenzionare
 * l'industria porta un giorno il quartiere sotto le ciminiere a chiedere conto;
 * densificare porta la citta' a scoppiare. La conseguenza torna dove la causa e'
 * stata scelta — nel pannello delle policy — e in genere l'alternativa piu'
 * onesta e' **revocare** cio' che si era varato.
 */

/** Taglia della citta' in edifici residenziali pieni: ci si scalano i costi. */
function scaleOf(state: DecisionStateView): number {
  return Math.max(1, Math.floor(state.population.stock / BALANCE.decisions.populationScale));
}

/** Il respiro che una risposta all'emergenza alimentare compra, in cibo. */
function reliefOf(state: DecisionStateView): number {
  return state.population.stock * BALANCE.food.perResident * BALANCE.decisions.reliefTicks;
}

interface OptionMark {
  readonly charter?: DecisionOption['charter'];
  readonly grant?: DecisionGrant;
  readonly policy?: DecisionOption['policy'];
  readonly followUp?: DecisionFollowUp;
  readonly onLapse?: boolean;
}

function option(
  id: string,
  label: string,
  description: string,
  effect: DecisionEffect,
  mark: OptionMark = {},
): DecisionOption {
  return { id, label, description, effect, ...mark };
}

/** Un seguito, con la finestra gia' calcolata dai numeri del bacino. */
function follows(eventId: string): DecisionFollowUp {
  return { eventId, afterTicks: BALANCE.decisions.pool.chainDelayTicks };
}

/**
 * La policy attiva che costa di piu' da tenere, o null.
 *
 * Serve alla crisi di bilancio, ed e' il motivo per cui `draft` riceve lo stato:
 * l'alternativa «taglia» deve **nominare** cosa taglia. Una scelta che dicesse
 * «taglia una policy» senza dire quale sarebbe una scommessa, non una decisione.
 */
function costliestPolicy(state: DecisionStateView): PolicyId | null {
  let found: PolicyId | null = null;
  let worst = -1;
  for (const policy of POLICIES) {
    if (!state.policies.includes(policy.id)) continue;
    if (policy.upkeep <= worst) continue;
    worst = policy.upkeep;
    found = policy.id;
  }
  return found;
}

/** Le due voci con cui una stessa scelta si ripresenta, scelte dal tick. */
function flavor<T>(entries: readonly T[], state: DecisionStateView): T {
  const index = Math.floor(state.tickCount / BALANCE.decisions.intervalTicks) % entries.length;
  return entries[index] as T;
}

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
const INVESTMENT_TITLES = ['Neighborhood investment', 'Where the city invests next'] as const;

export const EVENTS: readonly EventDefinition[] = [
  // --- Approvvigionamento ---------------------------------------------------
  {
    id: 'food-emergency',
    family: 'supply',
    urgency: 'crisis',
    weight: 12,
    qualifies: (state) =>
      state.population.stock > 0
      && state.supplyArmed
      && shortCountryside(state)
      && fedShare(state) < BALANCE.decisions.hungerThreshold,
    draft: (state) => {
      const scale = scaleOf(state);
      const relief = reliefOf(state);
      return {
        title: 'Supplies under pressure',
        message: 'The city can no longer feed all of its residents. Choose an emergency response.',
        options: [
          option('buy-food', 'Buy food supplies', 'Spend funds to restock the warehouses immediately.', {
            funds: -BALANCE.decisions.decisionCost * scale,
            food: relief,
          }, { charter: 'importedSupply', followUp: follows('supply-price-shock') }),
          // L'alternativa che il consiglio prende da solo se nessuno risponde:
          // e' la piu' facile da firmare e la piu' cara da subire, ed e' scritta
          // sulla carta **prima** che il giocatore decida di rimandare.
          option('ration', 'Ration supplies', 'Preserve resources at the cost of happiness.', {
            satisfaction: -BALANCE.decisions.satisfactionStep,
            food: relief,
          }, { charter: 'rationing', onLapse: true }),
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
    },
  },
  {
    id: 'supply-price-shock',
    family: 'supply',
    urgency: 'crisis',
    weight: 10,
    chainedOnly: true,
    // Il seguito di «compra il cibo»: la citta' che si e' messa a importare
    // scopre che il prezzo lo fa qualcun altro. Si qualifica solo finche' quel
    // mandato e' ancora in piedi — se nel frattempo e' stato sostituito, la
    // catena non ha piu' un soggetto e si dimentica da sola.
    qualifies: (state) => state.charters.includes('importedSupply'),
    draft: (state) => {
      const scale = scaleOf(state);
      return {
        title: 'The price of imported food',
        message: 'The suppliers the city now depends on have raised their prices.',
        options: [
          option('pay-up', 'Pay the new price', 'Keep the shipments coming and absorb the cost.', {
            funds: -BALANCE.decisions.decisionCost * scale * 2,
          }, { charter: 'importedSupply' }),
          option('switch-to-local', 'Turn back to local growers', 'Spend materials to rebuild the local supply.', {
            materials: -BALANCE.decisions.materialGrant * scale,
            satisfaction: BALANCE.decisions.satisfactionStep,
          }, { charter: 'communityGardens', grant: { kind: 'park' } }),
          option('let-it-bite', 'Let the shortage bite', 'Refuse the price and let the shelves thin out.', {
            food: -BALANCE.decisions.foodGrant * scale,
            satisfaction: -BALANCE.decisions.satisfactionStep,
          }, { onLapse: true }),
        ],
      };
    },
  },
  {
    id: 'harvest-glut',
    family: 'supply',
    urgency: 'opportunity',
    weight: 6,
    qualifies: (state) => harvestSurplus(state) && state.population.stock > 0,
    draft: (state) => {
      const scale = scaleOf(state);
      return {
        title: 'More harvest than the city can eat',
        message: 'The countryside has produced a surplus. It will not keep forever.',
        options: [
          option('sell-surplus', 'Sell the surplus', 'Turn the extra harvest into funds.', {
            food: -BALANCE.decisions.foodGrant * scale,
            funds: BALANCE.decisions.fundsGrant * scale,
          }, { charter: null }),
          option('granary', 'Build a granary', 'Spend materials to keep the surplus for a lean year.', {
            materials: -BALANCE.decisions.materialGrant * scale,
            food: BALANCE.decisions.foodGrant * scale,
          }),
          option('feed-everyone', 'Open the stores', 'Give the surplus away and win public support.', {
            food: -BALANCE.decisions.foodGrant * scale,
            satisfaction: BALANCE.decisions.satisfactionStep * 1.5,
          }, { charter: 'communityGardens' }),
        ],
      };
    },
  },

  // --- Spazio pubblico ------------------------------------------------------
  {
    id: 'public-space',
    family: 'publicSpace',
    urgency: 'routine',
    weight: 8,
    qualifies: (state) =>
      state.population.stock >= BALANCE.decisions.populationScale
      && (state.buildingCounts[BUILDING_CLASS.civic] ?? 0) > 0,
    draft: (state) => {
      const active = charterOfFamily(state.charters, 'publicSpace');
      return {
        title: flavor(PUBLIC_SQUARE_TITLES, state),
        message: flavor(PUBLIC_SQUARE_MESSAGES, state),
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
            { charter: 'leasedSquare', grant: { kind: 'market' }, followUp: follows('rent-dispute') },
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
    },
  },
  {
    id: 'rent-dispute',
    family: 'publicSpace',
    urgency: 'crisis',
    weight: 8,
    chainedOnly: true,
    qualifies: (state) => state.charters.includes('leasedSquare'),
    draft: (state) => {
      const scale = scaleOf(state);
      return {
        title: 'A dispute over the square',
        message: 'The stallholders who lease the square want the rent settled, and so do their neighbors.',
        options: [
          option('cap-rents', 'Cap the rents', 'Give up the income to keep the peace.', {
            funds: -BALANCE.decisions.decisionCost * scale,
            satisfaction: BALANCE.decisions.satisfactionStep,
          }, { charter: 'festivalGrounds' }),
          option('back-the-traders', 'Back the traders', 'Keep the lease and collect the higher rent.', {
            funds: BALANCE.decisions.fundsGrant * scale,
            satisfaction: -BALANCE.decisions.satisfactionStep,
          }, { charter: 'leasedSquare' }),
          option('end-the-lease', 'End the lease', 'Clear the stalls and let the dispute die with them.', {
            funds: -BALANCE.decisions.decisionCost,
          }, { charter: null, onLapse: true }),
        ],
      };
    },
  },

  // --- Investimento ---------------------------------------------------------
  {
    id: 'investment',
    family: 'investment',
    urgency: 'routine',
    weight: 8,
    qualifies: (state) => {
      const buildings = state.buildingCounts.reduce((sum, value) => sum + value, 0);
      return buildings >= BALANCE.decisions.minimumBuildings
        && (state.buildingCounts[BUILDING_CLASS.industrial] ?? 0) > 0;
    },
    draft: (state) => {
      const scale = scaleOf(state);
      const buildings = state.buildingCounts.reduce((sum, value) => sum + value, 0);
      const active = charterOfFamily(state.charters, 'investment');
      const title = flavor(INVESTMENT_TITLES, state);
      return {
        title,
        message: title === INVESTMENT_TITLES[0]
          ? `The city now has ${buildings} buildings. Choose where to direct its next investment.`
          : `With ${buildings} buildings, the council can back one new direction.`,
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
    },
  },
  {
    id: 'industrial-smog',
    family: 'investment',
    urgency: 'crisis',
    weight: 9,
    // La crisi che una policy si e' comprata: la sovvenzione industriale rende
    // di piu' e sconta la desiderabilita' residenziale, e quando lo scontento
    // arriva il quartiere sotto le ciminiere chiede conto proprio di quella.
    qualifies: (state) =>
      policyActive(state, 'industrialSubsidy')
      && unrest(state)
      && (state.buildingCounts[BUILDING_CLASS.industrial] ?? 0) > 0,
    draft: (state) => {
      const scale = scaleOf(state);
      return {
        title: 'Smoke over the housing',
        message: 'The subsidized workshops are running day and night, and the neighborhoods downwind have had enough.',
        options: [
          option('repeal-subsidy', 'Repeal the subsidy', 'End the industrial subsidy and let the air clear.', {
            satisfaction: BALANCE.decisions.satisfactionStep * 1.5,
          }, { policy: { id: 'industrialSubsidy', enable: false } }),
          option('fit-filters', 'Pay for filters', 'Spend funds and materials to clean up the works.', {
            funds: -BALANCE.decisions.decisionCost * scale,
            materials: -BALANCE.decisions.materialGrant * scale,
            satisfaction: BALANCE.decisions.satisfactionStep,
          }, { charter: 'localShops' }),
          option('double-down', 'Rezone around them', 'Accept the smoke and open the district further to industry.', {
            materials: BALANCE.decisions.materialGrant * scale,
            satisfaction: -BALANCE.decisions.satisfactionStep,
          }, { charter: 'soldReserves', policy: { id: 'zoningRelief', enable: true, lockTicks: 0 }, onLapse: true }),
        ],
      };
    },
  },
  {
    id: 'works-backlog',
    family: 'investment',
    urgency: 'routine',
    weight: 6,
    qualifies: (state) => materialsStalled(state) && state.buildingCounts.length > 0,
    draft: (state) => {
      const scale = scaleOf(state);
      return {
        title: 'The building sites have stopped',
        message: 'There are no materials left to build with, and the yards are standing idle.',
        options: [
          option('emergency-order', 'Order materials', 'Buy materials at a premium to restart the works.', {
            funds: -BALANCE.decisions.decisionCost * scale * 2,
            materials: BALANCE.decisions.materialGrant * scale * 2,
          }),
          option('subsidize-industry', 'Subsidize the works', 'Enact the industrial subsidy to raise output.', {
            funds: -BALANCE.gameplay.policy.industrialSubsidy.cost,
          }, { policy: { id: 'industrialSubsidy', enable: true, lockTicks: 0 } }),
          option('pause-works', 'Pause the works', 'Wait it out. The city grows slower and knows it.', {
            satisfaction: -BALANCE.decisions.satisfactionStep,
          }, { charter: null }),
        ],
      };
    },
  },
  {
    id: 'trade-charter',
    family: 'investment',
    urgency: 'opportunity',
    weight: 5,
    qualifies: (state) =>
      state.trade.connected
      && state.commerce.revenue > 0
      && !policyLocked(state, 'marketCharter')
      && !policyLocked(state, 'tariffShield')
      && !policyActive(state, 'marketCharter')
      && !policyActive(state, 'tariffShield'),
    draft: () => ({
      title: 'The merchants want a decision',
      message: 'With the port working, the council can open the market wide or shelter what the city already makes.',
      options: [
        option('open-market', 'Grant the market charter', 'Wider commercial reach, at the cost of quiet housing.', {
          funds: -BALANCE.gameplay.policy.marketCharter.cost,
        }, { policy: { id: 'marketCharter', enable: true, lockTicks: 0 }, charter: 'localShops' }),
        option('shelter-industry', 'Raise a tariff shield', 'More local production, at the cost of what shops can sell.', {
          funds: -BALANCE.gameplay.policy.tariffShield.cost,
        }, { policy: { id: 'tariffShield', enable: true, lockTicks: 0 }, charter: 'soldReserves' }),
        option('stay-neutral', 'Decide nothing yet', 'Keep both options open and spend nothing.', {}),
      ],
    }),
  },

  // --- Governo --------------------------------------------------------------
  {
    id: 'budget-crisis',
    family: 'governance',
    urgency: 'crisis',
    weight: 11,
    // **Non chiede che ci sia una policy da tagliare.** Lo chiedeva, e una citta'
    // in rosso senza nessuna policy attiva — cioe' esattamente la citta' che il
    // taglio ha gia' spogliato — restava senza nessun evento di bilancio. Il
    // taglio e' un'alternativa in piu' quando c'e' qualcosa da tagliare, non la
    // condizione dell'allarme.
    qualifies: (state) => budgetAlarm(state),
    draft: (state) => {
      const scale = scaleOf(state);
      const cut = costliestPolicy(state);
      const options: DecisionOption[] = [
        option('emergency-levy', 'Raise an emergency levy', 'Take the money now and take the anger with it.', {
          funds: BALANCE.decisions.fundsGrant * scale * 2,
          satisfaction: -BALANCE.decisions.satisfactionStep * 1.5,
        }, {
          charter: 'emergencyPowers',
          // Il ripiego quando non c'e' niente da tagliare: un consiglio che non
          // puo' risparmiare incassa. Una crisi deve avere sempre **una**
          // alternativa che scatta da sola, o la scadenza non applica niente.
          ...(cut === null ? { onLapse: true } : {}),
        }),
        option('open-the-books', 'Open the books', 'Publish the accounts: every policy gets cheaper to run.', {
          funds: -BALANCE.decisions.decisionCost,
          satisfaction: BALANCE.decisions.satisfactionStep,
        }, { charter: 'openBooks' }),
      ];
      if (cut !== null) {
        // Quando c'e' da tagliare, tagliare e' cio' che il consiglio fa da solo —
        // e l'alternativa dice **cosa**: «taglia una policy» sarebbe una
        // scommessa, non una decisione.
        options.push(option(
          'cut-policy',
          `Repeal ${policyById(cut).label}`,
          `Drop the most expensive policy the city runs and stop paying ${policyById(cut).upkeep.toFixed(1)} funds a tick.`,
          {},
          { policy: { id: cut, enable: false }, onLapse: true },
        ));
      }
      return {
        title: 'The treasury will not last',
        message: 'At the current rate the city runs out of money. The council needs a decision now.',
        options,
      };
    },
  },
  {
    id: 'overcrowding',
    family: 'governance',
    urgency: 'crisis',
    weight: 9,
    qualifies: (state) =>
      policyActive(state, 'denseHousing')
      && housingPressure(state) >= BALANCE.decisions.triggers.crowdingRatio,
    draft: (state) => {
      const scale = scaleOf(state);
      return {
        title: 'Every room is taken',
        message: 'Dense housing has filled the city to its walls, and the blocks that hold it are the ones nobody wants.',
        options: [
          option('repeal-density', 'Repeal dense housing', 'Let the blocks breathe again and lose the extra capacity.', {
            satisfaction: BALANCE.decisions.satisfactionStep,
          }, { policy: { id: 'denseHousing', enable: false } }),
          option('new-quarters', 'Open a new quarter', 'Spend to lay out green space where the city can spread.', {
            funds: -BALANCE.decisions.decisionCost * scale,
            materials: -BALANCE.decisions.materialGrant * scale,
          }, { grant: { kind: 'park' }, charter: 'openBooks' }),
          option('emergency-powers', 'Build by decree', 'Suspend the usual process. It works, and nobody likes it.', {
            satisfaction: -BALANCE.decisions.satisfactionStep * 1.5,
            materials: BALANCE.decisions.materialGrant * scale,
          }, { charter: 'emergencyPowers', onLapse: true }),
        ],
      };
    },
  },
  {
    id: 'civic-overload',
    family: 'governance',
    urgency: 'crisis',
    weight: 9,
    qualifies: (state) => civicStrain(state),
    draft: (state) => {
      const scale = scaleOf(state);
      return {
        title: 'The services cannot keep up',
        message: 'The civic buildings serve far more city than they were built for, and it shows everywhere.',
        options: [
          option('emergency-funding', 'Fund them properly', 'Pay what the services actually cost.', {
            funds: -BALANCE.decisions.decisionCost * scale * 2,
            satisfaction: BALANCE.decisions.satisfactionStep,
          }, { charter: 'openBooks' }),
          option('enact-austerity', 'Cut the service standard', 'Enact austerity: cheaper civic buildings, worse ones.', {
            funds: -BALANCE.gameplay.policy.austerity.cost,
          }, { policy: { id: 'austerity', enable: true, lockTicks: 0 }, charter: 'emergencyPowers' }),
          option('let-it-slip', 'Let it slip', 'Do nothing and watch the coverage fall.', {
            satisfaction: -BALANCE.decisions.satisfactionStep * 1.5,
          }, { onLapse: true }),
        ],
      };
    },
  },
  {
    id: 'council-reform',
    family: 'governance',
    urgency: 'opportunity',
    weight: 5,
    // L'unica occasione che cambia **come** si governa invece di cosa si fa: e'
    // il posto da cui arriva lo slot di policy in piu', ed e' deliberatamente
    // raggiungibile solo da una citta' che ha gia' un consiglio da riformare.
    qualifies: (state) => councilReady(state) && charterOfFamily(state.charters, 'governance') === null,
    draft: (state) => {
      const scale = scaleOf(state);
      return {
        title: 'How the city governs itself',
        message: 'The council is large enough to need rules of its own. Choose the ones it will keep.',
        options: [
          option('emergency-powers', 'Standing emergency powers', 'One more policy can run at a time, and the city pays in patience.', {
            satisfaction: -BALANCE.decisions.satisfactionStep,
          }, { charter: 'emergencyPowers' }),
          option('open-books', 'Open books', 'Every policy costs less to run. The audit costs funds.', {
            funds: -BALANCE.decisions.decisionCost * scale,
          }, { charter: 'openBooks' }),
          option('chamber-of-trade', 'A chamber of trade', 'Enacting a policy costs less. The merchants expect a hall.', {
            materials: -BALANCE.decisions.materialGrant * scale,
          }, { charter: 'chamberOfTrade', grant: { kind: 'market' } }),
        ],
      };
    },
  },
];
