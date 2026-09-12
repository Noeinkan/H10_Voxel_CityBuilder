import { BALANCE } from './balance';
import type { CatalystId } from './catalysts';
import type { CharterFamily, CharterId } from './charters';
import type { CommerceReport } from './commerce';
import type { CoverageReport } from './coverage';
import type { FoodReport } from './farms';
import type { FundsReport } from './flows';
import type { MaterialsReport } from './materials';
import type { PolicyId } from './policies';
import type { TradeReport } from './trade';
import { selectDecision } from './eventPool';

/**
 * Il vocabolario delle decisioni: cosa un evento e' e cosa una scelta lascia.
 *
 * Le tre decisioni scritte a mano che stavano qui sono diventate un **bacino**:
 * le voci vivono in `eventCatalog.ts`, la regola con cui se ne pesca una in
 * `eventPool.ts`, e qui restano i tipi che tutti e tre condividono con lo stato
 * e con la HUD. La separazione non e' estetica — il catalogo e' una tabella di
 * dati che cresce a ogni incremento, mentre la regola di pesca e' logica che
 * deve restare corta e leggibile.
 */

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

/**
 * Cosa un'alternativa fa al pannello delle policy.
 *
 * **E' la cerniera fra le due meta' del governo cittadino.** Prima un evento
 * spostava risorse e lasciava un mandato, e le policy stavano in un pannello
 * che nessun evento sapeva di avere: si potevano leggere le due schermate per
 * un'intera partita senza mai sospettare che parlassero della stessa citta'.
 * Da qui una crisi puo' **revocare** la policy che l'ha causata, o **vararne**
 * una al posto tuo, ed e' quello che fa di una scelta una conseguenza.
 */
export interface DecisionPolicyEffect {
  readonly id: PolicyId;
  /** Vero se l'alternativa la vara, falso se la revoca. */
  readonly enable: boolean;
  /**
   * Per quanto la policy resta bloccata dopo la mossa.
   *
   * Riaccendere il tick dopo cio' che una crisi ha appena revocato annullerebbe
   * la scelta senza costo: il blocco e' la parte che la rende una decisione.
   * Assente vale `pool.policyLockTicks`; zero significa nessun blocco.
   */
  readonly lockTicks?: number;
}

/** L'evento che una scelta prepara: e' la memoria lunga delle decisioni. */
export interface DecisionFollowUp {
  readonly eventId: string;
  readonly afterTicks: number;
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
  readonly policy?: DecisionPolicyEffect;
  readonly followUp?: DecisionFollowUp;
  /**
   * L'alternativa che scatta da sola quando la crisi scade.
   *
   * Al massimo una per evento, ed e' obbligatoria su ogni evento con scadenza:
   * senza, allo scadere non ci sarebbe niente da applicare e il tempo tornerebbe
   * a essere gratis. La carta la mostra **prima** che il giocatore rimandi —
   * sapere cosa succede se non rispondi e' meta' della decisione.
   */
  readonly onLapse?: boolean;
}

/**
 * Il registro con cui un evento si presenta.
 *
 * `crisis` scavalca la cadenza ordinaria — un guasto non aspetta il turno — e
 * porta una scadenza; `routine` e `opportunity` aspettano `nextDecisionTick` e
 * restano aperte finche' il giocatore risponde.
 */
export type DecisionUrgency = 'crisis' | 'routine' | 'opportunity';

export interface CityDecision {
  readonly id: string;
  /** Voce di catalogo da cui viene: raffreddamento e catene si contano su questo. */
  readonly eventId: string;
  /** Slot che la scelta occupa. Una famiglia tiene un solo mandato per volta. */
  readonly family: CharterFamily;
  readonly urgency: DecisionUrgency;
  readonly title: string;
  readonly message: string;
  readonly options: readonly DecisionOption[];
  /** Tick oltre il quale l'alternativa `onLapse` si applica da sola. Zero: mai. */
  readonly expiresAt: number;
}

export interface DecisionOutcome {
  readonly tick: number;
  readonly decisionId: string;
  /** Voce di catalogo risolta. Vuoto sui salvataggi scritti prima del bacino. */
  readonly eventId: string;
  /** Famiglia della decisione risolta: e' lo slot che quella scelta ha occupato. */
  readonly family: CharterFamily;
  readonly optionId: string;
  readonly summary: string;
  /** Vero quando la scadenza ha deciso al posto del giocatore. */
  readonly lapsed?: boolean;
}

/** Quando una voce di catalogo e' stata risolta l'ultima volta. */
export interface EventMemory {
  readonly id: string;
  readonly tick: number;
}

/** Un seguito prenotato da una scelta precedente. */
export interface ScheduledEvent {
  readonly id: string;
  /** Primo tick in cui il seguito puo' qualificarsi. */
  readonly at: number;
  /** Ultimo tick utile: oltre, il seguito si dimentica. */
  readonly until: number;
}

/** Una policy che un evento ha bloccato, e fino a quando. */
export interface PolicyLock {
  readonly id: PolicyId;
  readonly until: number;
}

/**
 * Cio' che serve a decidere quale scelta aprire, e nient'altro.
 *
 * **E' cresciuta molto, ed e' il punto.** Portava popolazione, edifici e
 * raccolto: tre segnali, e infatti gli eventi possibili erano tre. Il bacino
 * qualifica le proprie voci su tutto cio' che la citta' sa gia' dire di se' —
 * cassa, copertura dei servizi, scontento, riserva di materiali, commercio,
 * policy in piedi — e ogni campo qui e' la condizione di almeno un evento.
 * Una vista che dichiara piu' di quello che guarda non e' un dettaglio: e' il
 * posto dove si va a cercare *su cosa* si decide.
 */
export interface DecisionStateView {
  readonly tickCount: number;
  readonly population: { readonly stock: number };
  readonly food: { readonly stock: number };
  readonly materials: { readonly stock: number };
  /** Cassa **e** ritmo: l'allarme di bilancio si misura sull'autonomia, non sul saldo. */
  readonly funds: { readonly stock: number; readonly delta: number };
  readonly satisfaction: number;
  readonly buildingCounts: readonly number[];
  readonly capacityCounts: readonly number[];
  readonly mixedCapacityCounts: readonly number[];
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
  /** Policy in piedi: sono la condizione di meta' delle crisi del catalogo. */
  readonly policies: readonly PolicyId[];
  readonly policyLocks: readonly PolicyLock[];
  readonly coverageReport: CoverageReport;
  readonly decayPressure: number;
  readonly flows: FundsReport;
  readonly materialFlows: MaterialsReport;
  readonly commerce: CommerceReport;
  readonly trade: TradeReport;
  /** Voci gia' viste e loro ultimo tick: e' il raffreddamento del bacino. */
  readonly eventMemory: readonly EventMemory[];
  /** Seguiti prenotati da scelte precedenti. */
  readonly scheduledEvents: readonly ScheduledEvent[];
  /**
   * Stato del PRNG. Non viene consumato: la pesca pesata lo **legge** insieme
   * al tick, perche' `decisionAt` deve restare una funzione pura dello stato e
   * far avanzare il flusso da qui darebbe due estrazioni diverse a seconda di
   * quante volte il chiamante interroga il bacino.
   */
  readonly rngState: number;
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
 * La scelta da aprire adesso, o null.
 *
 * Due cancelli, e sono diversi apposta. Le **crisi** non guardano l'orologio
 * ordinario: descrivono un guasto in corso, e farle aspettare il turno vorrebbe
 * dire che la citta' brucia e il consiglio ne parla fra novanta secondi. A
 * frenarle e' il raffreddamento della singola voce. Il resto — routine e
 * occasioni — aspetta la scadenza **e** un cambiamento reale della citta', o il
 * tetto di inattivita' che impedisce a una partita ferma di restare muta.
 */
export function decisionAt(state: DecisionStateView, nextDecisionTick: number): CityDecision | null {
  const due = state.tickCount >= nextDecisionTick;
  // Sotto il tetto di inattivita', una scelta ordinaria attende che la citta'
  // sia davvero cambiata. Il conto e' lo stesso di prima, spostato qui perche'
  // adesso vale per un'intera categoria di eventi invece che per due generatori.
  const idle = state.tickCount - (nextDecisionTick - BALANCE.decisions.intervalTicks);
  const contextChanged = decisionFingerprint(state) !== state.decisionStamp
    || idle >= BALANCE.decisions.maxIdleTicks;
  return selectDecision(state, { due, contextChanged });
}

export function decisionOption(decision: CityDecision, id: string): DecisionOption | null {
  return decision.options.find((option) => option.id === id) ?? null;
}

/** L'alternativa che la scadenza applica al posto del giocatore, o null. */
export function lapseOption(decision: CityDecision): DecisionOption | null {
  return decision.options.find((option) => option.onLapse === true) ?? null;
}

/** Vera quando la scadenza dell'evento e' passata. Zero significa «non scade». */
export function decisionExpired(decision: CityDecision, tickCount: number): boolean {
  return decision.expiresAt > 0 && tickCount >= decision.expiresAt;
}
