import {
  ALL_CLASSES,
  BALANCE,
  BUILDING_CLASS,
  catalystById,
  catalystRoleOf,
  type CatalystId,
  type SimState,
} from '../sim';

/**
 * La scala di sblocco dei ruoli.
 *
 * **Il problema che chiude.** I primi tre ruoli erano in ordine perche' li
 * ordinava il tutorial; finito quello, i sedici restanti erano tutti aperti
 * insieme e l'unico cancello era il prezzo. Al minuto tre il giocatore aveva
 * l'intero catalogo davanti e nessuna ragione per preferire un ruolo a un altro:
 * la citta' non chiedeva niente, e i landmark smettevano di essere un traguardo
 * per diventare un menu.
 *
 * **Due livelli, come in Cities: Skylines.** Il gradino dice *quando* — e' una
 * misura della citta', uguale per tutti i ruoli che apre — e la condizione
 * propria dice *cosa hai fatto per meritarlo*, ed e' la meta' che da' carattere:
 * lo stadio vuole i negozi che riempiranno le gradinate, il teatro un quartiere
 * civico gia' vivo, l'aeroporto una facciata su cui posare lo Skyport.
 *
 * **Derivata, non scritta.** Le soglie sono quelle che il gioco gia' usa —
 * la mensola, l'espansione, `civicPride`, la condizione di vittoria, il gate dei
 * landmark grandi — rilette da `BALANCE` invece che ricopiate. Una scala con
 * numeri suoi sarebbe stata una terza tabella da tenere allineata a mano, e
 * girare una qualsiasi di quelle manopole avrebbe lasciato indietro il gemello.
 *
 * **Pura e senza flag.** Ogni soglia si misura sullo stato, esattamente come i
 * passi di `onboarding.ts`: un salvataggio non ha bisogno di sapere a che punto
 * era. L'unica cosa che la scena tiene da parte e' il **massimo storico** — vedi
 * `advanceMilestone` — perche' quello non e' derivabile e serve a due cose che
 * lo stato non sa: che uno sblocco non si richiuda quando la citta' cala, e che
 * il premio si paghi una volta sola.
 */

export type MilestoneId = 'foundation' | 'settlement' | 'trading-post' | 'district' | 'metropolis';

/** Una soglia da coprire, nella forma che l'HUD sa gia' disegnare. */
export interface MilestoneThreshold {
  readonly have: number;
  readonly need: number;
  /** Unita' al plurale, come la legge il giocatore: `12 / 24 residents`. */
  readonly label: string;
}

export interface Milestone {
  readonly id: MilestoneId;
  /** Nome a schermo del gradino. */
  readonly label: string;
  /** I ruoli che questo gradino apre, in ordine di catalogo. */
  readonly opens: readonly CatalystId[];
  /** Fondi versati al primo attraversamento. Il primo gradino non ne ha. */
  readonly grant: number;
  /** Cosa chiede, misurato su uno stato. Vuoto solo per il primo gradino. */
  readonly thresholds: (state: SimState) => readonly MilestoneThreshold[];
}

const GRANT = BALANCE.gameplay.milestone.grant;
const ROLE = BALANCE.gameplay.milestone.role;

/** I tre passi del tutorial: aprono la scala e non sono aperti da nessuno. */
const STARTERS: readonly CatalystId[] = ['market', 'factory', 'park'];

/**
 * I gradini bassi contano anche gli **edifici**, non solo gli abitanti.
 *
 * **E' una misura, non un'intuizione.** Una partita registrata arriva a 2163
 * abitanti in cento secondi: sulle soglie ereditate dalla mensola (24) e
 * dall'espansione (48) i primi due gradini si attraversavano in una manciata di
 * secondi, e la scala non pesava niente proprio dove doveva insegnare il ritmo.
 * Gli edifici invece li fa il campo di desiderabilita' un lotto alla volta, ed e'
 * quello che il giocatore sta guardando mentre aspetta.
 *
 * Un quarto e la meta' del gate dei landmark grandi: cosi' i tre traguardi di
 * costruito — quattro, otto, sedici — sono lo stesso numero girato una volta
 * sola, e non tre manopole che possono divergere.
 */
const QUARTER = Math.round(BALANCE.gameplay.landmark.requiredBuildings / 4);
const HALF = Math.round(BALANCE.gameplay.landmark.requiredBuildings / 2);

/**
 * La scala, dal primo gradino all'ultimo.
 *
 * L'ordine e' il contratto: `milestoneReached` restituisce un indice in questo
 * array, e un ruolo e' aperto quando il suo gradino ha indice minore o uguale al
 * massimo raggiunto.
 */
export const MILESTONES: readonly Milestone[] = [
  {
    id: 'foundation',
    label: 'Foundation',
    // I due ruoli che rispondono alle prime due difficolta' vere: la serra al
    // cibo, la centrale all'industria che si ferma. Aprirli **con** il tutorial
    // e non prima e' cio' che impedisce di comprarli al posto del parco.
    opens: ['greenhouse', 'power'],
    grant: 0,
    thresholds: (state) => [
      { have: startersPlaced(state), need: STARTERS.length, label: 'starter roles' },
    ],
  },
  {
    id: 'settlement',
    label: 'Settlement',
    opens: ['school', 'transport'],
    grant: GRANT.settlement,
    thresholds: (state) => [
      residents(state, BALANCE.gameplay.terrace.population),
      built(state, QUARTER),
    ],
  },
  {
    id: 'trading-post',
    label: 'Trading post',
    // La costa si apre tutta insieme: sono tre modi diversi di usare la stessa
    // riva, e sceglierne uno e' la prima decisione geografica della partita.
    opens: ['port', 'ferry', 'lighthouse'],
    grant: GRANT.tradingPost,
    thresholds: (state) => [
      residents(state, BALANCE.gameplay.expansion.population),
      built(state, HALF),
    ],
  },
  {
    id: 'district',
    label: 'District',
    opens: ['radio', 'university', 'monument'],
    grant: GRANT.district,
    thresholds: (state) => [
      residents(state, BALANCE.gameplay.policy.civicPride.population),
      built(state, BALANCE.gameplay.landmark.requiredBuildings),
    ],
  },
  {
    id: 'metropolis',
    label: 'Metropolis',
    opens: ['museum', 'cathedral', 'theatre', 'stadium', 'marina', 'airport'],
    grant: GRANT.metropolis,
    thresholds: (state) => [
      residents(state, BALANCE.gameplay.success.population),
      // La stessa misura della condizione di vittoria, uso misto compreso:
      // chiedere quattro quartieri separati a una citta' che ne ha tre e un
      // isolato che ne fa due sarebbe chiedere di disfare cio' che il gioco
      // premia.
      { have: classesServed(state), need: ALL_CLASSES.length, label: 'classes' },
    ],
  },
];

/** Il gradino che apre un ruolo, o `null` per i tre del tutorial. */
export function milestoneOfRole(id: CatalystId): Milestone | null {
  return MILESTONES.find((milestone) => milestone.opens.includes(id)) ?? null;
}

/**
 * Il gradino raggiunto **adesso**, come indice in `MILESTONES`.
 *
 * Si ferma al primo gradino non coperto: la scala e' una scala, e saltarne uno
 * perche' la popolazione e' arrivata prima degli edifici renderebbe illeggibile
 * la barra che dice quanto manca.
 */
export function milestoneReached(state: SimState): number {
  let reached = -1;
  for (let i = 0; i < MILESTONES.length; i += 1) {
    if (!covered(MILESTONES[i].thresholds(state))) break;
    reached = i;
  }
  return reached;
}

/**
 * Il massimo storico, aggiornato di un tick.
 *
 * **Il gradino non si richiude.** Una carestia che porta la citta' sotto i
 * centoventi abitanti non deve far sparire dalla mensola il monumento gia'
 * sbloccato: sarebbe l'unico posto del gioco in cui un progresso si annulla, e
 * il giocatore lo leggerebbe come un difetto. Vale anche per il premio, che
 * altrimenti si ripagherebbe a ogni oscillazione — la popolazione **scende**, e
 * un cancello non monotono sarebbe stato una stampante di soldi.
 */
export function advanceMilestone(reached: number, state: SimState): number {
  return Math.max(reached, milestoneReached(state));
}

/** I fondi da versare passando da un massimo storico a un altro. */
export function milestoneGrant(from: number, to: number): number {
  let total = 0;
  for (let i = Math.max(0, from + 1); i <= to; i += 1) total += MILESTONES[i].grant;
  return total;
}

/**
 * Cosa manca a un ruolo, o array vuoto se e' aperto.
 *
 * `reached` e' il **massimo storico**, non il gradino di adesso: e' la sola cosa
 * che questa funzione non sa dedurre dallo stato, e il motivo per cui la scena
 * la tiene.
 *
 * Le soglie tornano tutte, non solo la prima che manca: chi disegna sceglie da
 * se' quale mostrare — `bindingThreshold` prende la piu' lontana — e restituirne
 * una sola gli toglierebbe la scelta.
 */
export function roleThresholds(
  state: SimState,
  id: CatalystId,
  reached: number,
): readonly MilestoneThreshold[] {
  const milestone = milestoneOfRole(id);
  if (milestone === null) return [];

  const index = MILESTONES.indexOf(milestone);
  const missing: MilestoneThreshold[] = index <= reached
    ? []
    : milestone.thresholds(state).filter((threshold) => threshold.have < threshold.need);

  const own = roleCondition(state, id);
  if (own !== null && own.have < own.need) missing.push(own);
  return missing;
}

/** true se il ruolo si puo' piazzare, per quanto riguarda la scala. */
export function roleUnlocked(state: SimState, id: CatalystId, reached: number): boolean {
  return roleThresholds(state, id, reached).length === 0;
}

/**
 * La condizione propria di un ruolo, o `null` se non ne ha.
 *
 * Sono le sole misure che il gradino non porta gia': un contatore di edifici per
 * uso, la quota di soddisfazione, l'altezza raggiunta dalla citta'. Ognuna e' la
 * traduzione in numero della frase che il giocatore legge sul bottone.
 */
export function roleCondition(state: SimState, id: CatalystId): MilestoneThreshold | null {
  switch (id) {
    case 'stadium':
      return { have: builtOf(state, BUILDING_CLASS.commercial), need: ROLE.stadium.commercial, label: 'shops' };
    case 'theatre':
      return { have: builtOf(state, BUILDING_CLASS.civic), need: ROLE.theatre.civic, label: 'civic buildings' };
    case 'airport':
      return { have: tallest(state) >= ROLE.airport.level ? 1 : 0, need: 1, label: `level ${ROLE.airport.level} building` };
    case 'cathedral':
      // In centesimi, non in frazione: «0.42 / 0.5 satisfaction» su un bottone
      // da 62px non si legge, e la barra di riempimento vuole comunque due
      // interi.
      return {
        have: Math.round(state.satisfaction * 100),
        need: Math.round(ROLE.cathedral.satisfaction * 100),
        label: 'satisfaction',
      };
    case 'museum':
      // Una catena e non una soglia: la vetrina della conoscenza dopo la
      // conoscenza. E' l'unica condizione che nomina un altro ruolo, ed e'
      // esattamente cio' che la rende una scelta di percorso.
      return { have: placed(state, 'university') ? 1 : 0, need: 1, label: 'University' };
    case 'marina':
      // La costa deve gia' lavorare. Un porto turistico davanti a una riva su
      // cui non e' mai passato niente e' un molo nel vuoto, e il vincolo di sito
      // — che chiede acqua — non sa dire questa differenza.
      return { have: coastalRoles(state) > 0 ? 1 : 0, need: 1, label: 'coastal role' };
    default:
      return null;
  }
}

/** L'etichetta del gradino che apre un ruolo, per la scheda del bottone. */
export function milestoneLabelOf(id: CatalystId): string | null {
  return milestoneOfRole(id)?.label ?? null;
}

function residents(state: SimState, need: number): MilestoneThreshold {
  return { have: Math.floor(state.population.stock), need, label: 'residents' };
}

function built(state: SimState, need: number): MilestoneThreshold {
  return { have: state.buildings.length, need, label: 'buildings' };
}

function covered(thresholds: readonly MilestoneThreshold[]): boolean {
  return thresholds.every((threshold) => threshold.have >= threshold.need);
}

function startersPlaced(state: SimState): number {
  return STARTERS.filter((id) => placed(state, id)).length;
}

function placed(state: SimState, id: CatalystId): boolean {
  return state.catalysts.some((catalyst) => catalystRoleOf(catalyst) === id);
}

/** Quanti ruoli costieri la citta' ha gia' acceso, qualunque essi siano. */
function coastalRoles(state: SimState): number {
  return state.catalysts.filter((catalyst) => {
    const site = catalystById(catalystRoleOf(catalyst)).site;
    return site === 'coastal' || site === 'waterfront';
  }).length;
}

/** Edifici di un uso, uso misto compreso: la stessa somma di `isSelfSufficient`. */
function builtOf(state: SimState, cls: number): number {
  return state.buildingCounts[cls] + state.mixedCounts[cls];
}

function classesServed(state: SimState): number {
  const target = BALANCE.gameplay.success.buildingsPerClass;
  return ALL_CLASSES.filter((cls) => builtOf(state, cls) >= target).length;
}

/** Il livello dell'edificio piu' alto. Zero su una citta' che non ne ha. */
function tallest(state: SimState): number {
  let best = 0;
  for (const building of state.buildings) best = Math.max(best, building.level ?? 1);
  return best;
}
