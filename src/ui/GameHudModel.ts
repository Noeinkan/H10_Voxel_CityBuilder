import {
  BALANCE,
  CATALYSTS,
  CATALYST_GROUPS,
  CLASS_LABELS,
  FARM_KIND,
  FARM_LABELS,
  POLICIES,
  TRADE_MODES,
  catalystById,
  charterById,
  policyConflict,
  tradeLinksOf,
  type BuildingClass,
  type FoodReport,
  type CatalystGroup,
  type CatalystId,
  type CatalystSite,
  type CityDecision,
  type DecisionOption,
  type PolicyId,
  type TradeMode,
} from '../sim';
import { DAYLIGHT, DAYLIGHT_MODE, nextDaylightMode, type DaylightMode } from '../engine/daylight';
import { typologiesForUses } from '../world/buildings/typology';
import { unlockLines } from './prospects';
import { SITE } from '../world/sites/config';
import type { GrowthStats } from '../game/growthScene';
import type { CityCondition } from '../game/cityCondition';
import type { FundsReport } from '../sim/flows';
import type { ResourceTrend, TrendDirection } from './ResourceTrend';

/**
 * Il vincolo di sito detto al giocatore, non al codice.
 *
 * `undefined` per `'any'` e non una frase: "nessun vincolo" e' rumore in un
 * tooltip: le righe che compaiono devono essere tutte informative, o si smette
 * di leggerle.
 */
const SITE_LABEL: Readonly<Record<CatalystSite, string | undefined>> = {
  any: undefined,
  coastal: 'Waterfront only',
  open: `Needs a ${SITE.openSpan}×${SITE.openSpan} clearing`,
};

export type GameTool =
  | { readonly kind: 'catalyst'; readonly class: BuildingClass; readonly id?: CatalystId }
  | { readonly kind: 'expansion' }
  /** La mensola: si indica un edificio, e gli si appende un piano in quota. */
  | { readonly kind: 'terrace' }
  /** La funivia: si indica una riva, e la regola trova l'altra da sola. */
  | { readonly kind: 'ropeway' }
  | { readonly kind: 'none' };

export interface HudResource {
  readonly id: 'funds' | 'population' | 'food' | 'materials' | 'satisfaction';
  readonly label: string;
  readonly value: string;
  /**
   * L'ultimo passo, gia' formattato. **Vuoto quando non succede niente.**
   *
   * Prima qui compariva `±0`, cinque volte su cinque nei momenti tranquilli:
   * cinque righe di rumore che occupavano lo spazio della sola informazione che
   * conta, cioe' quale risorsa si sta muovendo.
   */
  readonly delta: string;
  readonly tone: 'positive' | 'negative' | 'neutral';
  /** Dove sta andando sulla finestra recente: e' la freccia. */
  readonly trend: TrendDirection;
  /** Quanto forte, 0..1: e' l'opacita' della freccia, non un secondo numero. */
  readonly magnitude: number;
  /** La finestra recente, per la sparkline. Vuota finche' non c'e' storia. */
  readonly series: readonly number[];
  /**
   * Il tetto, dove ne esiste uno: e' un anello, non un numero nudo.
   *
   * `undefined` per denaro e materiali, che non hanno un massimo: inventarne uno
   * per riempire un anello direbbe che esiste un "pieno" che non c'e'.
   */
  readonly fill?: HudFill;
  /**
   * Da dove viene e dove va, voce per voce. Solo dove la domanda ha senso.
   *
   * «Perche' sto perdendo denaro» non aveva risposta nell'HUD: il saldo dice di
   * quanto, non di chi e' la colpa. Le voci arrivano dal referto del tick, non
   * ricalcolate qui — duplicare il bilanciamento sarebbe il modo sicuro di farle
   * divergere dal numero che le sta sopra.
   */
  readonly breakdown?: readonly HudFlow[];
}

/** Un riempimento 0..1 con la sua lettura in chiaro. */
export interface HudFill {
  readonly value: number;
  readonly label: string;
}

/** Una voce del bilancio: quanto, come si chiama, e da che parte va. */
export interface HudFlow {
  readonly label: string;
  readonly amount: number;
  readonly direction: 'in' | 'out';
}

export interface HudAction {
  readonly id: string;
  readonly label: string;
  readonly cost: number;
  readonly available: boolean;
  readonly reason: string;
  readonly radius?: number;
  /**
   * Vincolo di sito del ruolo, gia' in un'etichetta leggibile.
   *
   * Sta nel tooltip e non solo sul cursore perche' e' l'unica informazione che
   * cambia *dove* si clicca: scoprire che il porto vuole la costa dopo aver
   * scelto il punto significa scoprirlo dal rifiuto.
   */
  readonly site?: string;
  readonly class?: BuildingClass;
  readonly catalystId?: CatalystId;
  readonly description?: string;
  readonly group?: CatalystGroup;
  /** Usi favoriti e penalizzati, gia' in etichette leggibili. */
  readonly favours?: readonly string[];
  readonly penalises?: readonly string[];
  /** Tipologie che quel ruolo puo' far comparire dal solo uso, per nome di catalogo. */
  readonly typologies?: readonly string[];
  /**
   * Forme che **solo** questo ruolo rende possibili, con il quartiere da
   * attraversare per arrivarci.
   *
   * E' l'altra meta' di `typologies`, e la ragione per cui quell'elenco si e'
   * accorciato: una forma dietro una specializzazione non e' qualcosa che si
   * ottiene piazzando il catalizzatore, e prometterla senza la sua condizione
   * insegnava a diffidare del tooltip. Qui la condizione c'e'.
   */
  readonly unlocks?: readonly string[];
  /**
   * true se l'azione e' bloccata ma resta visibile.
   *
   * Un catalizzatore che non si puo' ancora permettere non sparisce dalla
   * toolbar: sapere che il porto esiste e costa 320 e' l'informazione che fa
   * pianificare, e nasconderlo trasformerebbe la progressione in una sorpresa.
   */
  readonly locked?: boolean;
  /**
   * Quanto manca, 0..1, quando cio' che manca e' una **risorsa**.
   *
   * E' la meta' che rendeva `locked` indistinguibile da `disabled`: un bottone
   * sbiadito dice "rotto", un bottone che si riempie dice "manca poco", e sono
   * due messaggi opposti nel momento in cui la progressione dovrebbe motivare.
   *
   * Assente quando il blocco **non** si scioglie aspettando — l'ordine del
   * tutorial, un conflitto fra policy, la citta' che non e' pronta. Riempire lì
   * prometterebbe che accumulare denaro basta, e non basta.
   */
  readonly progress?: number;
  /** Il requisito che sta vincolando, gia' leggibile: `240 / 320 funds`. */
  readonly requirement?: string;
  /** Lo stesso, in due cifre, per stare sotto una tessera: `240/320`. */
  readonly requirementShort?: string;
}

/** Una soglia da superare: quanto se ne ha, quanto ne serve, come si chiama. */
interface Threshold {
  readonly have: number;
  readonly need: number;
  readonly label: string;
}

/**
 * La soglia **vincolante** fra piu' soglie, come frazione e come etichetta.
 *
 * La piu' lontana, non la media ne' la prima: chi ha i fondi ma non gli abitanti
 * deve vedere gli abitanti, o il riempimento prometterebbe che il bottone e'
 * quasi pronto mentre manca tutt'altro. Con una soglia sola degenera in quella.
 */
function bindingThreshold(thresholds: readonly Threshold[]): {
  readonly progress: number;
  readonly requirement: string;
  readonly requirementShort: string;
} {
  let worst = thresholds[0];
  for (const candidate of thresholds) {
    if (ratio(candidate) < ratio(worst)) worst = candidate;
  }
  return {
    progress: ratio(worst),
    requirement: `${Math.floor(worst.have)} / ${worst.need} ${worst.label}`,
    // La stessa cosa senza la parola: sotto una tessera da 62px «0 / 48
    // residents» non ci sta, e andava a finire sopra il costo. La parola resta
    // nel tooltip, dove c'e' spazio e dove serve a distinguere fondi da
    // abitanti; sulla tessera bastano le due cifre, perche' la barra che si
    // riempie dice gia' di che grandezza si parla.
    requirementShort: `${Math.floor(worst.have)}/${worst.need}`,
  };
}

function ratio(threshold: Threshold): number {
  if (threshold.need <= 0) return 1;
  return Math.min(1, Math.max(0, threshold.have / threshold.need));
}

export interface HudPolicy extends HudAction {
  readonly id: PolicyId;
  readonly population: number;
  readonly active: boolean;
  /** Cosa fa, in una frase. Sta sulla scheda. */
  readonly description: string;
  /**
   * **Dove** agisce, in una frase. Sta nel `title`, non sulla scheda.
   *
   * Era concatenata a `description`, e la scheda ne usciva con due frasi che
   * dicono quasi la stessa cosa: sette schede da quattro righe l'una sono
   * esattamente lo scroll che il pannello non riusciva a farsi leggere. La
   * seconda frase resta a disposizione, ma a domanda.
   */
  readonly effect: string;
  readonly upkeep: number;
}

export interface HudTradeMode {
  readonly id: TradeMode;
  readonly label: string;
  readonly description: string;
  readonly active: boolean;
  readonly available: boolean;
}

/** Una sezione della toolbar: crescita, connessioni o identita'. */
export interface HudCatalystGroup {
  readonly id: CatalystGroup;
  readonly label: string;
  readonly actions: readonly HudAction[];
}

export interface GameHudModel {
  readonly ready: boolean;
  readonly resources: readonly HudResource[];
  readonly catalysts: readonly HudAction[];
  /** Gli stessi catalizzatori, raggruppati per funzione e in ordine di toolbar. */
  readonly catalystGroups: readonly HudCatalystGroup[];
  readonly commerce: HudCommerce | null;
  readonly expansion: HudAction;
  /** La mensola posata a mano: il primo pezzo di citta' in quota che si sceglie. */
  readonly terrace: HudAction;
  /** La funivia: l'altro modo di scavalcare il vuoto, e l'unico sull'acqua. */
  readonly ropeway: HudAction;
  readonly policies: readonly HudPolicy[];
  readonly tradeModes: readonly HudTradeMode[];
  readonly tradeConnected: boolean;
  readonly decision: CityDecision | null;
  readonly paused: boolean;
  readonly speed: number;
  readonly message: string;
  readonly condition: CityCondition | null;
  readonly unlockedSectors: number;
}

export type EscapeTarget =
  | 'views'
  | 'themes'
  | 'policies'
  | 'help'
  | 'tool'
  | 'selection'
  | 'lock'
  | 'view'
  | 'none';

/** Mantiene stabili i bottoni durante il gesto pointerdown/click. */
export function decisionNeedsRepaint(
  paintedDecisionId: string | null,
  decision: CityDecision | null,
): boolean {
  return paintedDecisionId !== (decision?.id ?? null);
}

/**
 * Il segno che un'alternativa lascia sulla citta', in una riga.
 *
 * Null quando l'alternativa non ne lascia nessuno: e' un caso vero — non ogni
 * scelta deve cambiare la forma di un quartiere — e va distinto da una riga
 * vuota, che sembrerebbe un difetto di disegno.
 */
export function decisionMark(option: DecisionOption): string | null {
  const parts: string[] = [];
  if (option.grant !== undefined) parts.push(`Builds a ${catalystById(option.grant.kind).label}.`);
  if (option.charter === null) parts.push('Lifts the standing mandate for this decision.');
  else if (option.charter !== undefined) parts.push(charterById(option.charter).spatialEffect);
  return parts.length === 0 ? null : parts.join(' ');
}

/** Riepilogo del ciclo commerciale, la seconda catena economica della citta'. */
export interface HudCommerce {
  readonly demand: number;
  readonly served: number;
  /** Quota di domanda servita, 0..100. */
  readonly service: number;
  /** Quota di banchi occupati, 0..100. */
  readonly occupancy: number;
  readonly revenue: number;
  readonly goods: number;
  readonly mixedBuildings: number;
  readonly message: string;
}

const POLICY_DESCRIPTION: Readonly<Record<PolicyId, string>> = {
  denseHousing: 'Increases residential building capacity.',
  industrialSubsidy: 'Increases material production.',
  austerity: 'Reduces the cost of civic services.',
  greenBelt: 'Makes residential areas more desirable.',
  zoningRelief: 'Encourages growth in industrial areas.',
  civicPride: 'Encourages civic building growth.',
  marketCharter: 'Increases retail reach and revenue.',
};

export function buildGameHudModel(
  stats: GrowthStats | null,
  trend?: ResourceTrend,
): GameHudModel {
  const funds = stats?.state.funds.stock ?? 0;
  const population = stats?.state.population.stock ?? 0;
  const ready = stats !== null;
  const expectedCatalyst = stats?.onboarding.expectedCatalyst ?? null;
  const resources: readonly HudResource[] = stats === null
    ? emptyResources()
    : [
        resource(
          'funds',
          'Funds',
          stats.state.funds.stock,
          stats.state.funds.delta,
          trend,
          undefined,
          fundsBreakdown(stats.state.flows),
        ),
        resource('population', 'Residents', stats.state.population.stock, stats.state.population.delta, trend),
        resource(
          'food',
          'Food',
          stats.state.food.stock,
          stats.state.food.delta,
          trend,
          // Il cibo ha un tetto che il numero nudo non mostra: quanti tick la
          // citta' regge con le scorte che ha. E' la lettura che risponde a
          // «sto per avere fame», e nessuna cifra di magazzino la da'.
          foodReserve(stats.state.food.stock, population),
          // E l'altra meta' della stessa domanda: **da dove viene**. Prima della
          // 3.1 non aveva risposta perche' non c'era una risposta — il cibo
          // usciva dal termine industriale, e la voce sarebbe stata «fabbriche».
          foodBreakdown(stats.state.harvest),
        ),
        resource('materials', 'Materials', stats.state.materials.stock, stats.state.materials.delta, trend),
        {
          id: 'satisfaction',
          label: 'Happiness',
          value: `${Math.round(stats.state.satisfaction * 100)}%`,
          delta: '',
          tone: 'neutral',
          trend: trend?.direction('satisfaction') ?? 'flat',
          magnitude: trend?.magnitude('satisfaction') ?? 0,
          series: trend?.window('satisfaction') ?? [],
          // Gia' 0..1 per costruzione: e' l'unica delle cinque il cui tetto non
          // va calcolato, perche' e' una quota e non uno stock.
          fill: {
            value: stats.state.satisfaction,
            label: `${Math.round(stats.state.satisfaction * 100)}% of the city is content`,
          },
        },
      ];

  const catalysts: readonly HudAction[] = CATALYSTS.map((catalyst) => {
    const cost = catalyst.cost;
    const orderOk = expectedCatalyst === null || expectedCatalyst === catalyst.id;
    const fundsOk = funds >= cost;
    const available = ready && orderOk && fundsOk;
    const favours = catalyst.favours.map((cls) => CLASS_LABELS[cls]);
    const penalises = catalyst.penalises.map((cls) => CLASS_LABELS[cls]);
    return {
      id: `catalyst-${catalyst.id}`,
      label: catalyst.label,
      cost,
      radius: catalyst.radius,
      site: SITE_LABEL[catalyst.site],
      class: catalyst.class,
      catalystId: catalyst.id,
      group: catalyst.group,
      description: catalyst.description,
      favours,
      penalises,
      typologies: typologiesForUses(catalyst.favours),
      unlocks: unlockLines(catalyst.id),
      available,
      // Bloccato non vuol dire nascosto: il bottone resta nella toolbar e dice
      // perche' non si puo' ancora usare.
      locked: ready && !available,
      // Solo quando a mancare sono i fondi: se e' il tutorial a fermarlo, un
      // riempimento direbbe che basta aspettare, e invece bisogna costruire
      // dell'altro.
      ...(ready && orderOk && !fundsOk
        ? bindingThreshold([{ have: funds, need: cost, label: 'funds' }])
        : {}),
      reason: !ready
        ? 'The city is getting ready.'
        : !orderOk
          ? `Complete this first: ${stats?.onboarding.title ?? 'the initial tutorial'}.`
          : fundsOk
            ? `${catalyst.description} Select and place it on the island.`
            : 'Not enough funds.',
    };
  });

  const catalystGroups: readonly HudCatalystGroup[] = CATALYST_GROUPS.map((group) => ({
    ...group,
    actions: catalysts.filter((action) => action.group === group.id),
  }));

  const expansionRequirement = BALANCE.gameplay.expansion;
  const expansionPopulationOk = population >= expansionRequirement.population;
  const expansionFundsOk = funds >= expansionRequirement.cost;
  const expansion: HudAction = {
    id: 'expansion',
    label: 'Expand',
    cost: expansionRequirement.cost,
    available: ready && expansionPopulationOk && expansionFundsOk,
    locked: ready && !(expansionPopulationOk && expansionFundsOk),
    ...(ready && !(expansionPopulationOk && expansionFundsOk)
      ? bindingThreshold([
          { have: funds, need: expansionRequirement.cost, label: 'funds' },
          { have: population, need: expansionRequirement.population, label: 'residents' },
        ])
      : {}),
    reason: !ready
      ? 'The city is getting ready.'
      : !expansionPopulationOk
        ? `Requires ${expansionRequirement.population} residents.`
        : !expansionFundsOk
          ? 'Not enough funds.'
          : `Purchase a coastal sector (${stats?.unlockedSectors.length ?? 0} already unlocked).`,
  };

  const terraceRequirement = BALANCE.gameplay.terrace;
  const terracePopulationOk = population >= terraceRequirement.population;
  const terraceFundsOk = funds >= terraceRequirement.cost;
  const terrace: HudAction = {
    id: 'terrace',
    label: 'Terrace',
    cost: terraceRequirement.cost,
    available: ready && terracePopulationOk && terraceFundsOk,
    // Bloccata non vuol dire nascosta, come per i catalizzatori: sapere che la
    // citta' potra' salire e' l'informazione che fa pianificare.
    locked: ready && !(terracePopulationOk && terraceFundsOk),
    ...(ready && !(terracePopulationOk && terraceFundsOk)
      ? bindingThreshold([
          { have: funds, need: terraceRequirement.cost, label: 'funds' },
          { have: population, need: terraceRequirement.population, label: 'residents' },
        ])
      : {}),
    reason: !ready
      ? 'The city is getting ready.'
      : !terracePopulationOk
        ? `Requires ${terraceRequirement.population} residents.`
        : !terraceFundsOk
          ? 'Not enough funds.'
          : 'Hang a floor off a tall building: the city gains ground above the street.',
    description: 'Hang a floor off a tall building, above the street.',
  };

  const ropewayRequirement = BALANCE.gameplay.ropeway;
  const ropewayPopulationOk = population >= ropewayRequirement.population;
  const ropewayFundsOk = funds >= ropewayRequirement.cost;
  const ropeway: HudAction = {
    id: 'ropeway',
    label: 'Ropeway',
    cost: ropewayRequirement.cost,
    available: ready && ropewayPopulationOk && ropewayFundsOk,
    locked: ready && !(ropewayPopulationOk && ropewayFundsOk),
    ...(ready && !(ropewayPopulationOk && ropewayFundsOk)
      ? bindingThreshold([
          { have: funds, need: ropewayRequirement.cost, label: 'funds' },
          { have: population, need: ropewayRequirement.population, label: 'residents' },
        ])
      : {}),
    reason: !ready
      ? 'The city is getting ready.'
      : !ropewayPopulationOk
        ? `Requires ${ropewayRequirement.population} residents.`
        : !ropewayFundsOk
          ? 'Not enough funds.'
          : 'Point at a shore: the line crosses water no bridge would span.',
    description: 'Two towers and a cable across the water.',
  };

  const activePolicies = stats?.state.policies ?? [];
  const policies = POLICIES.map((policy): HudPolicy => {
    const requirement = BALANCE.gameplay.policy[policy.id];
    const active = activePolicies.includes(policy.id);
    const populationOk = population >= requirement.population;
    const fundsOk = funds >= requirement.cost;
    const conflict = policyConflict(activePolicies, policy.id);
    return {
      id: policy.id,
      label: capitalize(policy.label),
      cost: requirement.cost,
      population: requirement.population,
      active,
      upkeep: requirement.upkeep,
      available: ready && (active || (populationOk && fundsOk && conflict === null)),
      reason: active
        ? 'Active: select to deactivate it.'
        : !ready
          ? 'The city is getting ready.'
          : conflict !== null
            ? `Incompatible with ${POLICIES.find((entry) => entry.id === conflict)?.label ?? conflict}.`
          : !populationOk
            ? `Requires ${requirement.population} residents.`
            : !fundsOk
              ? 'Not enough funds.'
              : `${POLICY_DESCRIPTION[policy.id]} ${policy.spatialEffect}`,
      description: POLICY_DESCRIPTION[policy.id],
      effect: policy.spatialEffect,
    };
  });

  // Stessa funzione che usa il tick, e non piu' un `.some` scritto qui: quello
  // cercava `kind === 'port'` e ignorava i catalizzatori senza `kind`, cioe' i
  // salvataggi dell'MVP e le fixture di scena, che per il tick sono collegamenti
  // validi. L'HUD diceva "nessun porto" mentre il commercio girava.
  const tradeConnected = tradeLinksOf(stats?.state.catalysts ?? []).length > 0;
  const tradeModes: readonly HudTradeMode[] = TRADE_MODES.map((mode) => ({
    ...mode,
    active: stats?.state.tradeMode === mode.id,
    available: ready && tradeConnected,
  }));

  return {
    ready,
    resources,
    catalysts,
    catalystGroups,
    commerce: commerceOf(stats),
    expansion,
    terrace,
    ropeway,
    policies,
    tradeModes,
    tradeConnected,
    decision: stats?.state.pendingDecision ?? null,
    paused: stats?.paused ?? false,
    speed: stats?.speed ?? 1,
    message: stats === null
      ? 'Preparing the city…'
      : `${stats.condition.title} · ${stats.condition.message}`,
    condition: stats?.condition ?? null,
    unlockedSectors: stats?.unlockedSectors.length ?? 0,
  };
}

/**
 * Cosa chiude Escape, in ordine di priorita'.
 *
 * I parametri sono nello stesso ordine in cui vengono provati: la firma si legge
 * come la regola. Si sfoglia dall'alto: prima i pannelli aperti sopra il gioco,
 * poi lo strumento in mano, e per **ultima** la vista.
 *
 * Che la vista fosse esclusa era una decisione, ed era sbagliata. Il
 * ragionamento — non e' un pannello, e' il modo in cui si guarda la citta' —
 * regge finche' esiste un altro modo ovvio di tornare indietro, e non esisteva:
 * restavano `V` premuto fino a completare il giro delle cinque viste, oppure
 * riaprire il picker e scegliere Normal. Chi si trovava la citta' retinata non
 * aveva una via d'uscita ma un labirinto, e un tasto di annullamento che si
 * rifiuta di annullare l'unica cosa evidentemente in corso non protegge niente.
 *
 * Ultima e non prima: con uno strumento in mano il toast promette gia' "Esc to
 * cancel", e mangiare quel colpo per spegnere una vista tradirebbe la promessa
 * scritta a schermo. Prima si posa lo strumento, poi si esce.
 */
export function resolveEscapeTarget(
  viewsOpen: boolean,
  themesOpen: boolean,
  policiesOpen: boolean,
  helpOpen: boolean,
  tool: GameTool,
  viewActive: boolean,
  blockLocked = false,
  selectionOpen = false,
): EscapeTarget {
  if (viewsOpen) return 'views';
  if (themesOpen) return 'themes';
  if (policiesOpen) return 'policies';
  if (helpOpen) return 'help';
  if (tool.kind !== 'none') return 'tool';
  // Dopo lo strumento e prima del soggetto di studio, e non a caso. Con uno
  // strumento in mano il toast promette gia' "Esc to cancel", e mangiare quel
  // colpo per chiudere una scheda tradirebbe la promessa scritta a schermo; ma
  // la scheda e' l'ultima cosa che il giocatore ha aperto, quindi viene prima di
  // cio' che stava gia' guardando.
  if (selectionOpen) return 'selection';
  // Prima si molla il soggetto, poi si esce dalla vista. Sono due passi e non uno
  // perche' sono due decisioni diverse: chi sta studiando un isolato e preme Esc
  // vuole quasi sempre tornare a scegliere, non spegnere la lente e ritrovarsi la
  // citta' intera. Un secondo colpo fa comunque il resto.
  if (blockLocked) return 'lock';
  return viewActive ? 'view' : 'none';
}

/** Il ciclo del giorno come lo vede il giocatore: un bottone e tre stati. */
export interface HudDaylight {
  readonly mode: DaylightMode;
  readonly label: string;
  readonly tooltip: string;
  /** Il modo che il prossimo clic mette: il bottone e' uno, i modi tre. */
  readonly next: DaylightMode;
  /** Orologio fermo: il bottone si accende, come fa la pausa. */
  readonly frozen: boolean;
}

const DAYLIGHT_LABEL: Readonly<Record<DaylightMode, string>> = {
  [DAYLIGHT_MODE.cycle]: 'Auto',
  [DAYLIGHT_MODE.day]: 'Day',
  [DAYLIGHT_MODE.night]: 'Night',
};

/**
 * Cosa cambia ogni modo, in mezza riga.
 *
 * «Auto» da solo non dice niente a chi sta guardando un tramonto e si chiede se
 * durera': la durata del giro e' l'unica informazione che risponde, e viene da
 * `DAYLIGHT` perche' e' la stessa che l'orologio usa per camminare.
 */
const DAYLIGHT_NOTE: Readonly<Record<DaylightMode, string>> = {
  [DAYLIGHT_MODE.cycle]: `the clock runs, a full day takes ${Math.round(DAYLIGHT.daySeconds / 60)} minutes`,
  [DAYLIGHT_MODE.day]: 'the sun stays up',
  [DAYLIGHT_MODE.night]: 'the city stays lit',
};

/** Etichetta, nota e prossimo stato del bottone del ciclo giorno/notte. */
export function daylightControl(mode: DaylightMode): HudDaylight {
  const next = nextDaylightMode(mode);
  return {
    mode,
    label: DAYLIGHT_LABEL[mode],
    tooltip: `Daylight: ${DAYLIGHT_LABEL[mode]} — ${DAYLIGHT_NOTE[mode]}. Click for ${DAYLIGHT_LABEL[next]}, or press L.`,
    next,
    frozen: mode !== DAYLIGHT_MODE.cycle,
  };
}

export function selectionMessage(tool: GameTool, catalysts: readonly HudAction[]): string | null {
  if (tool.kind === 'catalyst') {
    if (tool.id === undefined) {
      const legacyLabel = CLASS_LABELS[tool.class] ?? 'Catalyst';
      return `${legacyLabel} selected · click the island to place it · Esc to cancel`;
    }
    const action = catalysts.find((candidate) => candidate.catalystId === tool.id);
    return `${action?.label ?? 'Catalyst'} selected · click the island to place it · Esc to cancel`;
  }
  if (tool.kind === 'expansion') {
    return 'Expansion selected · choose a coastline edge · Esc to cancel';
  }
  if (tool.kind === 'terrace') {
    return 'Terrace selected · click a tall building · Esc to cancel';
  }
  if (tool.kind === 'ropeway') {
    // Si punta la **riva**, non l'acqua: e' l'unico strumento che chiede un capo
    // e trova l'altro da solo, e senza dirlo si clicca in mezzo al mare.
    return 'Ropeway selected · click a shore facing the water · Esc to cancel';
  }
  return null;
}

/**
 * Riassunto del ciclo commerciale.
 *
 * Il messaggio nomina la strozzatura, non lo stato: "manca personale" e "manca
 * merce" chiedono due azioni diverse, e senza dirlo il giocatore vede solo dei
 * negozi vuoti.
 */
function commerceOf(stats: GrowthStats | null): HudCommerce | null {
  if (stats === null) return null;
  const report = stats.state.commerce;
  const mixedBuildings = stats.state.mixedCounts.reduce((sum, value) => sum + value, 0);

  const message = report.capacity === 0
    ? 'No shops yet: place a Market to let commerce grow.'
    : report.demand === 0
      ? 'No residents to serve yet.'
      : report.served < report.capacity * 0.95 && report.goods === 0
        ? 'Shops have no goods to sell: industry is not producing enough materials.'
        : report.service < 0.7
          ? 'Demand outruns the shops: more commercial ground would raise happiness.'
          : report.occupancy < 0.5
            ? 'Shops are half empty: there are more of them than the city needs.'
            : 'Commerce is balanced with demand.';

  return {
    demand: report.demand,
    served: report.served,
    service: Math.round(report.service * 100),
    occupancy: Math.round(report.occupancy * 100),
    revenue: report.revenue,
    goods: report.goods,
    mixedBuildings,
    message,
  };
}

/**
 * Il bilancio dei fondi in voci leggibili, senza gli zeri.
 *
 * Una riga a zero non e' informazione: chi non ha ancora policy attive non deve
 * leggere «Policies 0», o le due voci che contano finiscono in mezzo al rumore.
 * Gli oneri portano `paid` e non la somma nominale, perche' a cassa vuota si
 * paga il possibile — ed e' quella la cifra che ha davvero lasciato la cassa.
 */
function fundsBreakdown(flows: FundsReport): readonly HudFlow[] {
  const owed = flows.civic + flows.policies + flows.farms;
  // Se non si e' potuto pagare tutto, ogni voce scala in proporzione: e' cio'
  // che tiene la somma delle righe uguale al saldo scritto sopra.
  const share = owed > 0 ? flows.paid / owed : 0;
  const rows: readonly HudFlow[] = [
    { label: 'Taxes', amount: flows.tax, direction: 'in' },
    { label: 'Shops', amount: flows.retail, direction: 'in' },
    { label: 'Trade', amount: Math.max(0, flows.trade), direction: 'in' },
    { label: 'Imports', amount: Math.max(0, -flows.trade), direction: 'out' },
    { label: 'Civic services', amount: flows.civic * share, direction: 'out' },
    { label: 'Policies', amount: flows.policies * share, direction: 'out' },
    { label: 'Farms', amount: flows.farms * share, direction: 'out' },
  ];
  return rows.filter((row) => row.amount >= 0.005);
}

/**
 * Da dove viene il cibo, voce per voce.
 *
 * Le righe arrivano dal referto del tick e **non si ricalcolano qui**: e' la
 * stessa regola di `fundsBreakdown`, e vale a maggior ragione per il cibo, dove
 * il listino sta in case sfamate e rifarne il conto nell'interfaccia
 * significherebbe copiare `FOOD_PER_HOUSE` in un secondo posto.
 *
 * Le etichette sono i produttori e non i tipi di lotto: chi guarda l'HUD vede
 * campi e frutteti a schermo, e «Fields» e' il nome di quello che vede.
 */
function foodBreakdown(harvest: FoodReport): readonly HudFlow[] {
  const rows: readonly HudFlow[] = [
    { label: FARM_LABELS[FARM_KIND.field], amount: harvest.grown[FARM_KIND.field] ?? 0, direction: 'in' },
    { label: FARM_LABELS[FARM_KIND.orchard], amount: harvest.grown[FARM_KIND.orchard] ?? 0, direction: 'in' },
    { label: FARM_LABELS[FARM_KIND.tower], amount: harvest.grown[FARM_KIND.tower] ?? 0, direction: 'in' },
    { label: 'Imports', amount: harvest.imported, direction: 'in' },
    { label: 'Eaten', amount: harvest.eaten, direction: 'out' },
  ];
  return rows.filter((row) => row.amount >= 0.005);
}

function resource(
  id: HudResource['id'],
  label: string,
  stock: number,
  delta: number,
  trend?: ResourceTrend,
  fill?: HudFill,
  breakdown?: readonly HudFlow[],
): HudResource {
  return {
    id,
    label,
    value: formatInteger(stock),
    // Vuoto e non `±0`: un indicatore che ripete "non e' successo niente" cinque
    // volte insegna a non leggere la riga in cui compare.
    delta: delta === 0 ? '' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`,
    tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
    trend: trend?.direction(id) ?? 'flat',
    magnitude: trend?.magnitude(id) ?? 0,
    series: trend?.window(id) ?? [],
    ...(fill === undefined ? {} : { fill }),
    ...(breakdown === undefined || breakdown.length === 0 ? {} : { breakdown }),
  };
}

/**
 * Quanto margine c'e' sopra la linea della carestia.
 *
 * L'anello e' pieno finche' le scorte stanno sopra `crisis.foodReserve` — la
 * stessa soglia sotto la quale `cityCondition` dichiara la penuria — e si
 * svuota avvicinandosi. Ancorarlo li' e non a un massimo inventato e' cio' che
 * lo rende una risposta: «sto per avere fame» si legge dall'anello prima che il
 * toast lo annunci, e le due superfici non possono dire cose diverse perche'
 * leggono lo stesso numero.
 *
 * La riga in chiaro porta anche i tick di autonomia, che sono la lettura che
 * il magazzino da solo non da': trecento unita' di cibo non dicono niente
 * finche' non si sa quante bocche ci sono.
 */
function foodReserve(stock: number, population: number): HudFill {
  const floor = BALANCE.gameplay.crisis.foodReserve;
  const perTick = population * BALANCE.food.perResident;
  const autonomy = perTick <= 0
    ? 'no one to feed yet'
    : `about ${Math.floor(stock / perTick)} ticks of eating`;
  return {
    value: floor <= 0 ? 1 : Math.min(1, stock / floor),
    label: `${Math.floor(stock)} food — ${autonomy}; shortage below ${floor}`,
  };
}

function emptyResource(id: HudResource['id'], label: string): HudResource {
  return { id, label, value: '—', delta: '', tone: 'neutral', trend: 'flat', magnitude: 0, series: [] };
}

function emptyResources(): readonly HudResource[] {
  return [
    emptyResource('funds', 'Funds'),
    emptyResource('population', 'Residents'),
    emptyResource('food', 'Food'),
    emptyResource('materials', 'Materials'),
    emptyResource('satisfaction', 'Happiness'),
  ];
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function formatInteger(value: number): string {
  return Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
