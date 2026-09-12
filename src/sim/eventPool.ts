import { BALANCE } from './balance';
import type { CharterFamily } from './charters';
import type {
  CityDecision,
  DecisionFollowUp,
  DecisionOption,
  DecisionStateView,
  DecisionUrgency,
  EventMemory,
  PolicyLock,
  ScheduledEvent,
} from './decisions';
import type { PolicyId } from './policies';
import { EVENTS } from './eventCatalog';
import { unitOf } from './rng';

/**
 * Il bacino: quale voce di catalogo si apre adesso.
 *
 * Prima le decisioni erano tre generatori scritti a mano e una catena di `if`
 * decideva quale: la regola e il contenuto stavano nella stessa funzione, e
 * aggiungere un evento voleva dire riscrivere la scelta fra tutti gli altri.
 * Qui la regola sta da sola e vale per qualunque catalogo — le voci si
 * qualificano da se' in `eventCatalog.ts`, e questo file non sa cosa siano.
 *
 * **La pesca e' pesata ma deterministica.** Non c'e' nessun `Math.random`: il
 * valore esce da `unitOf(state.rngState)`, cioe' dallo stesso flusso che il
 * tick fa avanzare e che il salvataggio porta con se'. Due partite dallo stesso
 * seme vedono la stessa sequenza di eventi; due partite diverse no, ed e'
 * esattamente cio' che si voleva da «piu' dinamico». Lo stato del PRNG si
 * **legge** e non si consuma, perche' `decisionAt` deve restare una funzione
 * pura: consumarlo darebbe estrazioni diverse a seconda di quante volte il
 * chiamante interroga il bacino nello stesso tick.
 */

/** Il titolo e le alternative di un evento, prima che il bacino lo vesta. */
export interface EventDraft {
  readonly title: string;
  readonly message: string;
  readonly options: readonly DecisionOption[];
}

export interface EventDefinition {
  readonly id: string;
  readonly family: CharterFamily;
  readonly urgency: DecisionUrgency;
  /**
   * Peso della pesca fra le voci qualificate.
   *
   * Non e' una probabilita': conta solo rispetto alle **altre voci qualificate
   * in questo momento**, che sono quasi mai le stesse due volte. Un peso alto
   * dice «se questa citta' ha questo problema, e' probabilmente il piu' grosso
   * che ha adesso», non «questo evento e' frequente».
   */
  readonly weight: number;
  /** Raffreddamento proprio; assente vale quello della categoria. */
  readonly cooldownTicks?: number;
  /**
   * Vera quando la citta' ha davvero questo problema, o questa occasione.
   *
   * E' l'unico posto in cui una voce guarda lo stato, e per questo il catalogo
   * si legge come un elenco di condizioni invece che come un albero di casi.
   */
  readonly qualifies: (state: DecisionStateView) => boolean;
  readonly draft: (state: DecisionStateView) => EventDraft;
  /**
   * Vera sulle voci che esistono **solo** come seguito di una scelta.
   *
   * Non entrano mai nella pesca ordinaria: aspettano che qualcuno le prenoti, e
   * senza questo campo comparirebbero da sole svelando il finale di una catena
   * che nessuno ha ancora iniziato.
   */
  readonly chainedOnly?: boolean;
}

/** I due cancelli che `decisionAt` ha gia' valutato per conto del bacino. */
export interface EventGate {
  /** Vero quando la cadenza ordinaria e' scaduta. */
  readonly due: boolean;
  /** Vero quando la citta' e' cambiata, o e' passato il tetto di inattivita'. */
  readonly contextChanged: boolean;
}

const BY_ID = new Map<string, EventDefinition>(EVENTS.map((event) => [event.id, event]));

export function eventById(id: string): EventDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function isEventId(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * La scelta da aprire, in ordine di precedenza.
 *
 * 1. **Un seguito prenotato**, se la sua finestra e' aperta e la citta' lo
 *    regge ancora. Non passa dalla pesca: e' gia' stato scelto, tre minuti fa,
 *    da chi ha risolto l'evento che lo ha prenotato.
 * 2. **Una crisi**, pescata fra quelle qualificate e fredde. Non aspetta la
 *    cadenza ordinaria — un guasto in corso non ha un turno.
 * 3. **Una routine o un'occasione**, solo a cadenza scaduta e con la citta'
 *    davvero cambiata.
 */
export function selectDecision(state: DecisionStateView, gate: EventGate): CityDecision | null {
  const chained = scheduledPick(state);
  if (chained !== null) return dress(chained, state);

  const crisis = pick(state, candidates(state, 'crisis'));
  if (crisis !== null) return dress(crisis, state);

  if (!gate.due || !gate.contextChanged) return null;
  const ordinary = pick(state, [
    ...candidates(state, 'routine'),
    ...candidates(state, 'opportunity'),
  ]);
  return ordinary === null ? null : dress(ordinary, state);
}

/** Il primo seguito prenotato la cui finestra e' aperta e che si qualifica. */
function scheduledPick(state: DecisionStateView): EventDefinition | null {
  for (const scheduled of state.scheduledEvents) {
    if (state.tickCount < scheduled.at || state.tickCount > scheduled.until) continue;
    const event = BY_ID.get(scheduled.id);
    if (event === undefined || !event.qualifies(state)) continue;
    return event;
  }
  return null;
}

/** Le voci di una categoria che si qualificano e non sono in raffreddamento. */
function candidates(
  state: DecisionStateView,
  urgency: DecisionUrgency,
): readonly EventDefinition[] {
  const out: EventDefinition[] = [];
  for (const event of EVENTS) {
    if (event.urgency !== urgency) continue;
    if (event.chainedOnly === true) continue;
    if (!cool(state, event)) continue;
    if (!event.qualifies(state)) continue;
    out.push(event);
  }
  return out;
}

/** Vero quando il raffreddamento della voce e' passato. */
function cool(state: DecisionStateView, event: EventDefinition): boolean {
  const seen = state.eventMemory.find((entry) => entry.id === event.id);
  if (seen === undefined) return true;
  const pool = BALANCE.decisions.pool;
  const cooldown = event.cooldownTicks
    ?? (event.urgency === 'crisis' ? pool.crisisCooldownTicks : pool.cooldownTicks);
  return state.tickCount - seen.tick >= cooldown;
}

/**
 * La pesca pesata, deterministica sullo stato del PRNG.
 *
 * L'elenco arriva sempre in ordine di catalogo — `candidates` scorre `EVENTS`,
 * non un insieme — e questo e' cio' che rende l'estrazione riproducibile: con
 * un ordine dipendente dall'inserimento, lo stesso valore uniforme pescherebbe
 * voci diverse a seconda di come il filtro le ha incontrate.
 */
function pick(
  state: DecisionStateView,
  pool: readonly EventDefinition[],
): EventDefinition | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0] ?? null;

  let total = 0;
  for (const event of pool) total += Math.max(0, event.weight);
  if (total <= 0) return pool[0] ?? null;

  let cursor = unitOf(state.rngState) * total;
  for (const event of pool) {
    cursor -= Math.max(0, event.weight);
    if (cursor < 0) return event;
  }
  return pool[pool.length - 1] ?? null;
}

/**
 * Veste la voce di catalogo di cio' che il bacino sa e lei no: identita', slot,
 * registro e scadenza.
 *
 * La scadenza la porta **solo** una crisi. Una routine che scadesse costringerebbe
 * a rispondere a una domanda che non ha urgenza — e togliere al giocatore il
 * diritto di ignorare una piazza da assegnare mentre spegne un incendio.
 */
// --- La memoria che il bacino chiede allo stato ----------------------------
//
// Tre liste corte, tutte con la stessa forma: si aggiungono in coda, si
// riscrivono in posto quando la chiave c'e' gia', e si potano di cio' che e'
// scaduto. Stanno qui e non in `SimState.ts` perche' sono la meta' *scritta*
// della stessa regola che `cool` e `scheduledPick` leggono: separarle vorrebbe
// dire tenere il raffreddamento in un file e la sua unita' di misura in un
// altro.

/** Segna la voce come appena risolta, sostituendo la riga che c'era. */
export function rememberEvent(
  memory: readonly EventMemory[],
  id: string,
  tick: number,
): readonly EventMemory[] {
  const out = memory.filter((entry) => entry.id !== id);
  out.push({ id, tick });
  // Il tetto taglia dalla piu' vecchia: una voce dimenticata torna semplicemente
  // a essere fredda, che e' il comportamento giusto per un catalogo che cresce.
  return out.slice(-BALANCE.decisions.pool.memoryLimit);
}

/** Prenota un seguito, con la finestra oltre la quale si dimentica. */
export function scheduleFollowUp(
  scheduled: readonly ScheduledEvent[],
  followUp: DecisionFollowUp,
  tick: number,
): readonly ScheduledEvent[] {
  if (!BY_ID.has(followUp.eventId)) return scheduled;
  const out = scheduled.filter((entry) => entry.id !== followUp.eventId);
  out.push({
    id: followUp.eventId,
    at: tick + followUp.afterTicks,
    until: tick + followUp.afterTicks + BALANCE.decisions.pool.chainWindowTicks,
  });
  return out;
}

/** Toglie i seguiti la cui finestra e' passata. */
export function pruneSchedule(
  scheduled: readonly ScheduledEvent[],
  tick: number,
): readonly ScheduledEvent[] {
  return scheduled.filter((entry) => entry.until >= tick);
}

/** Blocca una policy fino al tick indicato. */
export function lockPolicy(
  locks: readonly PolicyLock[],
  id: PolicyId,
  until: number,
): readonly PolicyLock[] {
  const out = locks.filter((lock) => lock.id !== id);
  out.push({ id, until });
  return out;
}

/** Toglie i blocchi scaduti. */
export function pruneLocks(
  locks: readonly PolicyLock[],
  tick: number,
): readonly PolicyLock[] {
  return locks.filter((lock) => lock.until > tick);
}

function dress(event: EventDefinition, state: DecisionStateView): CityDecision {
  const draft = event.draft(state);
  return {
    id: `${event.id}-${state.tickCount}`,
    eventId: event.id,
    family: event.family,
    urgency: event.urgency,
    title: draft.title,
    message: draft.message,
    options: draft.options,
    expiresAt: event.urgency === 'crisis'
      ? state.tickCount + BALANCE.decisions.pool.crisisExpiryTicks
      : 0,
  };
}
