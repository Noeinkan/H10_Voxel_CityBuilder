import {
  addCatalyst,
  BALANCE,
  catalystById,
  defaultCatalystOfClass,
  policyConflict,
  policyById,
  resolveDecision,
  setPolicyActive,
  setTradeMode,
  snoozeDecision,
  spendConstructionMaterials,
  type BuildingClass,
  type CatalystId,
  type PolicyId,
  type SimState,
  type TradeMode,
} from '../sim';
import { buildWeightOf, GROUND, groundKindOf, type GroundKind } from '../world/grading/grade';
import { siteRefusal } from '../world/sites/siteRules';
import type { TerraceRefusal } from '../world/aerial/terracePlan';
import type { RopewayRefusal } from '../world/ropeway/ropewayPlan';
import type { TerrainMap } from '../world/terrain/TerrainMap';

/**
 * **Lo sventramento non e' qui, ed e' una scelta.** Che il riquadro di un
 * landmark sia troppo alto da sgomberare non impedisce di piazzare il
 * catalizzatore: il campo di desiderabilita' funziona lo stesso, e due
 * catalizzatori vicini che si sovrappongono sono proprio il gesto che il gioco
 * chiede. A non comparire e' la struttura, che ripiega sulla piazzola come ha
 * sempre fatto per i ruoli senza ricetta. Il cursore lo dice prima del click —
 * e' quello il difetto che questa fase chiude, non un rifiuto in piu'.
 */
export type ActionFailure =
  | 'terrain-loading'
  | 'not-buildable'
  | 'needs-coast'
  | 'needs-open-ground'
  | 'too-close'
  | 'insufficient-funds'
  | 'insufficient-materials'
  | 'population-required'
  | 'already-active'
  | 'already-unlocked'
  | 'onboarding-order'
  | 'policy-incompatible'
  | 'decision-option-invalid'
  /**
   * I rifiuti della mensola, tradotti dal dominio in quota.
   *
   * Sono tre e non uno perche' chiedono tre gesti diversi: cercare un edificio,
   * cercarne uno **piu' alto**, cercare un altro posto. Un «non si puo'» solo
   * manderebbe a riprovare a caso proprio dove la regola e' meno intuitiva —
   * che una facciata debba essere alta abbastanza perche' ci si appenda un piano
   * non lo indovina nessuno.
   */
  | 'needs-building'
  | 'building-too-short'
  | 'no-room-aloft'
  /**
   * I rifiuti della funivia, tradotti dal dominio della linea.
   *
   * Tre e non uno, e chiedono tre gesti diversi: puntare una riva, puntare una
   * riva **di fronte a qualcosa**, cercare un altro punto della stessa costa.
   * Un «non si puo'» solo manderebbe a cliccare a caso lungo tutto il perimetro
   * dell'isola, che e' il posto peggiore in cui far tirare a indovinare.
   */
  | 'needs-shore'
  | 'needs-crossing'
  | 'no-room-for-line';

export type ActionResult =
  | { readonly success: true; readonly state: SimState }
  | { readonly success: false; readonly reason: ActionFailure };

export function placeCatalyst(
  state: SimState,
  map: TerrainMap,
  x: number,
  y: number,
  target: BuildingClass | CatalystId,
  aloft = false,
): ActionResult {
  const definition = catalystDefinition(target);
  const failure = catalystFailure(state, map, x, y, target, aloft);
  if (failure !== null) return { success: false, reason: failure };

  // Il prezzo e' quello che il cursore mostrava: si ricalcola dalla stessa
  // colonna invece di fidarsi del listino, altrimenti la mesa si pagherebbe
  // come il prato appena il click arriva.
  const site = catalystSiteCost(map, x, y, target);
  const paid = spendFunds(state, site === null ? definition.cost : site.cost);
  return {
    success: true,
    state: addCatalyst(paid, {
      x,
      y,
      class: definition.class,
      kind: definition.id,
      strength: definition.strength,
      radius: definition.radius,
    }),
  };
}

/** Cosa chiede il terreno sotto una colonna, e quanto costa costruirci. */
export interface SiteCost {
  readonly ground: GroundKind;
  /** Moltiplicatore applicato al listino. `Infinity` dove non si costruisce. */
  readonly weight: number;
  /** Prezzo effettivo, gia' pesato e arrotondato. */
  readonly cost: number;
}

/**
 * Prezzo di un catalizzatore su una colonna, o null se non e' ancora generata.
 *
 * Su terreno rifiutato il prezzo torna al listino: e' un numero che nessuno
 * paghera' mai — `catalystFailure` blocca prima — e serve solo perche' il
 * cursore mostri un cartellino invece di `Infinity` mentre spiega il rifiuto.
 */
export function catalystSiteCost(
  map: TerrainMap,
  x: number,
  y: number,
  target: BuildingClass | CatalystId,
): SiteCost | null {
  const definition = catalystDefinition(target);
  const column = map.columnAt(x, y);
  if (column === null) return null;

  const ground = groundKindOf(column.biome, column.slope, column.height);
  const weight = buildWeightOf(ground);
  const cost = Number.isFinite(weight) ? Math.round(definition.cost * weight) : definition.cost;
  return { ground, weight, cost };
}

/**
 * Stessa convalida usata dal click, esposta per il feedback sul cursore.
 *
 * Il bit `buildable` della `TerrainMap` non decide piu' niente qui: diceva
 * "piano e asciutto per costruzione", e su una mesa piana rispondeva no per
 * via della sola quota. Adesso decide `groundKindOf`, la stessa funzione con
 * cui il Builder sceglie i lotti, cosi' il giocatore e la citta' automatica
 * rifiutano le stesse colonne invece di due insiemi diversi.
 *
 * Sopra quel giudizio, uguale per tutti, sta il vincolo del **ruolo**: da quando
 * il terreno si paga invece di essere vietato, "ci si puo' costruire" ha smesso
 * di implicare "ha senso costruirci questo". I due controlli restano distinti
 * anche nell'ordine — prima cosa regge il terreno, poi cosa ci sta — perche'
 * sono due rifiuti diversi e il giocatore deve leggere quello giusto.
 *
 * **`aloft` toglie di mezzo il terreno, non i controlli.** Una struttura che si
 * posa su un tetto non ha niente da chiedere alla colonna sotto — non ci
 * costruisce, e il vincolo di sito del ruolo parla di *quel* suolo: un aeroporto
 * pretende un pianoro perche' una pista lo pretende, e sopra un grattacielo non
 * c'e' nessuna pista. Il tetto ha una regola sua, e la applica `src/world/`
 * prima di arrivare qui, come gia' fa per la mensola.
 */
export function catalystFailure(
  state: SimState,
  map: TerrainMap,
  x: number,
  y: number,
  target: BuildingClass | CatalystId,
  aloft = false,
): ActionFailure | null {
  const definition = catalystDefinition(target);
  const site = catalystSiteCost(map, x, y, target);
  if (site === null) return 'terrain-loading';
  if (!aloft && site.ground === GROUND.refused) return 'not-buildable';

  // Il vincolo di sito precede quello di distanza: e' una proprieta' del luogo,
  // mentre la distanza e' una proprieta' della citta' gia' costruita, e sentirsi
  // dire "troppo vicino a un altro porto" dove un porto non starebbe comunque
  // manderebbe a cercare spazio invece che acqua.
  const refusal = aloft ? null : siteRefusal(map, x, y, definition.site);
  if (refusal !== null) return refusal;

  const minDistance = BALANCE.gameplay.catalyst.minDistance;
  for (const catalyst of state.catalysts) {
    const kind = catalyst.kind ?? defaultCatalystOfClass(catalyst.class);
    if (kind !== definition.id) continue;
    if (Math.max(Math.abs(catalyst.x - x), Math.abs(catalyst.y - y)) < minDistance) {
      return 'too-close';
    }
  }

  if (state.funds.stock < site.cost) return 'insufficient-funds';
  return null;
}

/**
 * Perche' il gioco rifiuta una mensola, dato cosa ne dice il mondo.
 *
 * **La convalida del luogo non si duplica**: entra gia' risolta, dalla stessa
 * `terraceSite` che il cursore interroga e che il click ripercorre. Qui restano
 * le due cose che il mondo non sa — quanto costa e se la citta' e' pronta — e la
 * traduzione dei rifiuti del dominio in gesti che il giocatore possa fare.
 *
 * L'ordine e' quello in cui li si incontra: prima cosa manca al luogo, poi cosa
 * manca alla citta'. Sentirsi dire «non abbastanza fondi» davanti a un prato,
 * dove nessuna mensola starebbe comunque, manderebbe a cercare soldi invece che
 * un edificio.
 */
export function terraceFailure(
  state: SimState,
  refusal: TerraceRefusal | null,
): ActionFailure | null {
  if (refusal !== null) return TERRACE_FAILURE[refusal];

  const requirement = BALANCE.gameplay.terrace;
  if (state.population.stock < requirement.population) return 'population-required';
  if (state.funds.stock < requirement.cost) return 'insufficient-funds';
  if (state.materials.stock < requirement.materials) return 'insufficient-materials';
  return null;
}

/**
 * Il rifiuto del dominio, detto come un gesto.
 *
 * `noRun` e `tooLow` dicono la stessa cosa al giocatore — la facciata non e'
 * abbastanza alta perche' ci si appenda un piano — anche se al dominio dicono
 * due cose diverse: la prima che non c'e' una corsa di parete, la seconda che il
 * piano starebbe troppo vicino al suolo. Il resto e' «qui no, altrove si'».
 */
const TERRACE_FAILURE: Readonly<Record<TerraceRefusal, ActionFailure>> = {
  noHost: 'needs-building',
  noRun: 'building-too-short',
  tooLow: 'building-too-short',
  hostFull: 'no-room-aloft',
  blocked: 'no-room-aloft',
  tooNarrow: 'no-room-aloft',
  noFooting: 'no-room-aloft',
  onStreet: 'no-room-aloft',
  tooTall: 'no-room-aloft',
};

/** Posa una mensola e ne paga il prezzo. Il mondo l'ha gia' convalidata. */
export function placeTerrace(state: SimState, refusal: TerraceRefusal | null): ActionResult {
  const failure = terraceFailure(state, refusal);
  if (failure !== null) return { success: false, reason: failure };
  const funded = spendFunds(state, BALANCE.gameplay.terrace.cost);
  const supplied = spendConstructionMaterials(funded, BALANCE.gameplay.terrace.materials);
  return supplied === null
    ? { success: false, reason: 'insufficient-materials' }
    : { success: true, state: supplied };
}

/**
 * Perche' il gioco rifiuta una funivia, dato cosa ne dice il mondo.
 *
 * Stessa forma di `terraceFailure`, e per la stessa ragione: la convalida del
 * luogo entra gia' risolta dalla `ropewaySite` che il cursore interroga, e qui
 * restano solo le due cose che il mondo non sa — quanto costa e se la citta' e'
 * pronta.
 */
export function ropewayFailure(
  state: SimState,
  refusal: RopewayRefusal | null,
): ActionFailure | null {
  if (refusal !== null) return ROPEWAY_FAILURE[refusal];

  const requirement = BALANCE.gameplay.ropeway;
  if (state.population.stock < requirement.population) return 'population-required';
  if (state.funds.stock < requirement.cost) return 'insufficient-funds';
  if (state.materials.stock < requirement.materials) return 'insufficient-materials';
  return null;
}

/**
 * Il rifiuto del dominio, detto come un gesto.
 *
 * `dryGap` e `noPartner` dicono al giocatore la stessa cosa — di qua non c'e'
 * niente da attraversare — anche se al dominio dicono due cose diverse: la prima
 * che l'acqua non c'e' o e' una pozza, la seconda che nessuna delle quattro
 * direzioni ha portato da qualche parte. `tooTall` e `noPad` invece sono «qui
 * no, poco piu' in la' si'», ed e' quello che il giocatore deve leggere.
 */
const ROPEWAY_FAILURE: Readonly<Record<RopewayRefusal, ActionFailure>> = {
  notAshore: 'needs-shore',
  noPartner: 'needs-crossing',
  dryGap: 'needs-crossing',
  tooShort: 'needs-crossing',
  tooLong: 'needs-crossing',
  noPad: 'no-room-for-line',
  tooTall: 'no-room-for-line',
};

/** Tira una funivia e ne paga il prezzo. Il mondo l'ha gia' convalidata. */
export function placeRopeway(state: SimState, refusal: RopewayRefusal | null): ActionResult {
  const failure = ropewayFailure(state, refusal);
  if (failure !== null) return { success: false, reason: failure };
  const funded = spendFunds(state, BALANCE.gameplay.ropeway.cost);
  const supplied = spendConstructionMaterials(funded, BALANCE.gameplay.ropeway.materials);
  return supplied === null
    ? { success: false, reason: 'insufficient-materials' }
    : { success: true, state: supplied };
}

export function togglePolicy(state: SimState, id: PolicyId): ActionResult {
  if (state.policies.includes(id)) {
    return { success: true, state: setPolicyActive(state, id, false) };
  }

  const requirement = BALANCE.gameplay.policy[id];
  if (policyConflict(state.policies, id) !== null) {
    return { success: false, reason: 'policy-incompatible' };
  }
  if (state.population.stock < requirement.population) {
    return { success: false, reason: 'population-required' };
  }
  if (state.funds.stock < requirement.cost) {
    return { success: false, reason: 'insufficient-funds' };
  }

  // Convalida anche il catalogo prima di trasferire la proprieta' del campo.
  policyById(id);
  return { success: true, state: setPolicyActive(spendFunds(state, requirement.cost), id, true) };
}

/**
 * Primo sito accettabile per l'opera concessa da una decisione, o null.
 *
 * L'opera non si paga — il prezzo l'ha gia' pagato l'alternativa scelta — ma
 * tutto il resto della convalida resta: il terreno deve reggere e la distanza
 * minima dal proprio ruolo va rispettata, altrimenti una decisione poserebbe un
 * mercato dentro un mercato. E' per questo che l'unico rifiuto ammesso e'
 * quello sui fondi.
 */
export function grantSite(
  state: SimState,
  map: TerrainMap,
  kind: CatalystId,
  sites: readonly { readonly x: number; readonly y: number }[],
): { readonly x: number; readonly y: number } | null {
  for (const site of sites) {
    const failure = catalystFailure(state, map, site.x, site.y, kind);
    if (failure === null || failure === 'insufficient-funds') return site;
  }
  return null;
}

export function chooseDecision(state: SimState, optionId: string): ActionResult {
  const next = resolveDecision(state, optionId);
  return next === null
    ? { success: false, reason: 'decision-option-invalid' }
    : { success: true, state: next };
}

/** Rimanda la decisione sospesa senza scegliere: si nasconde e ricompare dopo. */
export function deferDecision(state: SimState): ActionResult {
  if (state.pendingDecision === null) {
    return { success: false, reason: 'decision-option-invalid' };
  }
  return { success: true, state: snoozeDecision(state) };
}

export function changeTradeMode(state: SimState, mode: TradeMode): ActionResult {
  return { success: true, state: setTradeMode(state, mode) };
}

export function buyExpansion(state: SimState, alreadyUnlocked = false): ActionResult {
  const failure = expansionFailure(state, alreadyUnlocked);
  if (failure !== null) return { success: false, reason: failure };
  return { success: true, state: spendFunds(state, BALANCE.gameplay.expansion.cost) };
}

export function expansionFailure(state: SimState, alreadyUnlocked = false): ActionFailure | null {
  if (alreadyUnlocked) return 'already-unlocked';
  const requirement = BALANCE.gameplay.expansion;
  if (state.population.stock < requirement.population) {
    return 'population-required';
  }
  if (state.funds.stock < requirement.cost) {
    return 'insufficient-funds';
  }
  return null;
}

function spendFunds(state: SimState, cost: number): SimState {
  return { ...state, funds: { stock: state.funds.stock - cost, delta: state.funds.delta } };
}

function catalystDefinition(target: BuildingClass | CatalystId) {
  return catalystById(typeof target === 'number' ? defaultCatalystOfClass(target) : target);
}
