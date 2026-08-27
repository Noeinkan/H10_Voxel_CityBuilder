import {
  BALANCE,
  CATALYSTS,
  CATALYST_GROUPS,
  CLASS_LABELS,
  POLICIES,
  TRADE_MODES,
  catalystById,
  charterById,
  charterOfFamily,
  policyConflict,
  tradeLinksOf,
  type BuildingClass,
  type CatalystGroup,
  type CatalystId,
  type CatalystSite,
  type CharterId,
  type CityDecision,
  type DecisionOption,
  type PolicyId,
  type TradeMode,
} from '../sim';
import { typologiesForUses } from '../world/buildings/typology';
import { pairingLines, stageLines, unlockLines, yieldLine } from './prospects';
import { SITE } from '../world/sites/config';
import type { GrowthStats } from '../game/growthScene';
import type { CityCondition } from '../game/cityCondition';
import type { CoachSuggestion } from '../game/coach';
import type { ResourceTrend } from './ResourceTrend';
import { buildHudResources, commerceOf, type HudCommerce, type HudResource } from './GameHudEconomyModel';
import type { GameTool } from './GameHudControlsModel';
import { buildCityOverviewModel, type CityOverviewModel } from './CityOverviewModel';

export { daylightControl, selectionMessage } from './GameHudControlsModel';
export type { GameTool, HudDaylight } from './GameHudControlsModel';
export type { HudCommerce, HudFill, HudFlow, HudResource } from './GameHudEconomyModel';

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
  waterfront: 'Needs open water: the sea or a lake',
  open: `Needs a ${SITE.openSpan}×${SITE.openSpan} clearing, or a level 7+ facade at least 8 voxels wide`,
};

export interface HudAction {
  readonly id: string;
  readonly label: string;
  readonly cost: number;
  /** Materiali richiesti oltre ai fondi, solo per le opere fisiche. */
  readonly materialCost?: number;
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
   * Con chi accostarlo, e che quartiere ne esce.
   *
   * **E' l'anello di mezzo della catena, e mancava.** Un quartiere nasce dalla
   * **coppia** di due campi sovrapposti, e sono i quartieri ad aprire le forme
   * di `unlocks`: senza questa riga si leggeva la promessa e non la condizione
   * che la avvera, e l'unico modo di scoprirla era piazzare catalizzatori a
   * caso.
   */
  readonly pairs?: readonly string[];
  /**
   * Cosa arriva in cassa se il ruolo attecchisce.
   *
   * Un catalizzatore non produce niente: producono gli edifici che fa nascere.
   * E' la sola riga che leghi lo strumento in mano alla barra delle risorse in
   * cima allo schermo, e fra le due non c'era niente.
   */
  readonly yields?: string;
  /**
   * Quanto il landmark cresce, come righe di tooltip.
   *
   * Lo stadio e' la quarta dimensione dell'effetto di un catalizzatore: un
   * monumento piazzato presto rinforza il proprio campo a ogni soglia di edifici
   * vicini. Assente per i ruoli senza ricetta — la serra ce l'ha, il radio no.
   */
  readonly stages?: readonly string[];
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
  readonly overview: CityOverviewModel | null;
  readonly commerce: HudCommerce | null;
  readonly expansion: HudAction;
  /** La mensola posata a mano: il primo pezzo di citta' in quota che si sceglie. */
  readonly terrace: HudAction;
  /** La funivia: l'altro modo di scavalcare il vuoto, e l'unico sull'acqua. */
  readonly ropeway: HudAction;
  /** La gomma: demolisce cio' che si trascina sopra. Non costa fondi. */
  readonly demolish: HudAction;
  readonly policies: readonly HudPolicy[];
  readonly tradeModes: readonly HudTradeMode[];
  readonly tradeConnected: boolean;
  readonly decision: CityDecision | null;
  /**
   * true quando la decisione sospesa e' stata rimandata con «decidi piu' tardi»
   * e la carta deve restare nascosta per `decisions.snoozeTicks`.
   */
  readonly decisionSnoozed: boolean;
  /** Mandato attivo della famiglia della decisione sospesa, o null. */
  readonly decisionActiveCharter: CharterId | null;
  readonly paused: boolean;
  readonly speed: number;
  readonly message: string;
  readonly condition: CityCondition | null;
  /** La rotta suggerita dal coach, gia' calcolata dalla scena di crescita. */
  readonly coach: CoachSuggestion | null;
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
export function decisionMark(
  option: DecisionOption,
  activeCharter: CharterId | null = null,
): string | null {
  const parts: string[] = [];
  if (option.grant !== undefined) parts.push(`Builds a ${catalystById(option.grant.kind).label}.`);
  if (option.charter === null) {
    // «Solleva il mandato» ha senso solo se c'e' davvero un mandato da
    // sollevare: senza, l'alternativa non lascia segno e la riga tace.
    if (activeCharter !== null) parts.push('Lifts the standing mandate for this decision.');
  } else if (option.charter !== undefined) {
    parts.push(charterById(option.charter).spatialEffect);
  }
  return parts.length === 0 ? null : parts.join(' ');
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
  const materials = stats?.state.materials.stock ?? 0;
  const population = stats?.state.population.stock ?? 0;
  const ready = stats !== null;
  const expectedCatalyst = stats?.onboarding.expectedCatalyst ?? null;
  const resources = buildHudResources(stats, trend);

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
      pairs: pairingLines(catalyst.id),
      yields: yieldLine(catalyst.id) ?? undefined,
      stages: stageLines(catalyst.id) ?? undefined,
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
      // **Solo lo stato**, non piu' anche la descrizione: la frase che spiega
      // cosa fa il ruolo vive in `description` e la scheda la mostra sempre.
      // Concatenate, sparivano insieme appena il bottone si bloccava — e chi sta
      // risparmiando per il porto e' esattamente chi vuole sapere a cosa serve.
      reason: !ready
        ? 'The city is getting ready.'
        : !orderOk
          ? `Complete this first: ${stats?.onboarding.title ?? 'the initial tutorial'}.`
          : fundsOk
            ? 'Click a spot on the island to place it.'
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
          : `Click a coastline edge to buy it (${stats?.unlockedSectors.length ?? 0} sectors so far).`,
    description: 'Buys the next sector of coast: more land to build on.',
  };

  const terraceRequirement = BALANCE.gameplay.terrace;
  const terracePopulationOk = population >= terraceRequirement.population;
  const terraceFundsOk = funds >= terraceRequirement.cost;
  const terraceMaterialsOk = materials >= terraceRequirement.materials;
  const terrace: HudAction = {
    id: 'terrace',
    label: 'Terrace',
    cost: terraceRequirement.cost,
    materialCost: terraceRequirement.materials,
    available: ready && terracePopulationOk && terraceFundsOk && terraceMaterialsOk,
    // Bloccata non vuol dire nascosta, come per i catalizzatori: sapere che la
    // citta' potra' salire e' l'informazione che fa pianificare.
    locked: ready && !(terracePopulationOk && terraceFundsOk && terraceMaterialsOk),
    ...(ready && !(terracePopulationOk && terraceFundsOk && terraceMaterialsOk)
      ? bindingThreshold([
          { have: funds, need: terraceRequirement.cost, label: 'funds' },
          { have: materials, need: terraceRequirement.materials, label: 'materials' },
          { have: population, need: terraceRequirement.population, label: 'residents' },
        ])
      : {}),
    reason: !ready
      ? 'The city is getting ready.'
      : !terracePopulationOk
        ? `Requires ${terraceRequirement.population} residents.`
        : !terraceFundsOk
          ? 'Not enough funds.'
          : !terraceMaterialsOk
            ? 'Not enough materials: grow industry before building aloft.'
          : 'Click a tall building to hang a floor off it.',
    description: 'Hangs a floor off a tall building: new ground above the street.',
  };

  const ropewayRequirement = BALANCE.gameplay.ropeway;
  const ropewayPopulationOk = population >= ropewayRequirement.population;
  const ropewayFundsOk = funds >= ropewayRequirement.cost;
  const ropewayMaterialsOk = materials >= ropewayRequirement.materials;
  const ropeway: HudAction = {
    id: 'ropeway',
    label: 'Ropeway',
    cost: ropewayRequirement.cost,
    materialCost: ropewayRequirement.materials,
    available: ready && ropewayPopulationOk && ropewayFundsOk && ropewayMaterialsOk,
    locked: ready && !(ropewayPopulationOk && ropewayFundsOk && ropewayMaterialsOk),
    ...(ready && !(ropewayPopulationOk && ropewayFundsOk && ropewayMaterialsOk)
      ? bindingThreshold([
          { have: funds, need: ropewayRequirement.cost, label: 'funds' },
          { have: materials, need: ropewayRequirement.materials, label: 'materials' },
          { have: population, need: ropewayRequirement.population, label: 'residents' },
        ])
      : {}),
    reason: !ready
      ? 'The city is getting ready.'
      : !ropewayPopulationOk
        ? `Requires ${ropewayRequirement.population} residents.`
        : !ropewayFundsOk
          ? 'Not enough funds.'
          : !ropewayMaterialsOk
            ? 'Not enough materials: grow industry before crossing the water.'
          : 'Click a shore facing the water: the far end is found for you.',
    description: 'Two towers and a cable: crosses water no bridge would span.',
  };

  const demolish: HudAction = {
    id: 'demolish',
    label: 'Demolish',
    cost: 0,
    available: ready,
    // La gomma non si sblocca: togliere di mezzo e' l'altra meta' del costruire,
    // e nasconderla dietro una soglia insegnerebbe a convivere con un errore.
    locked: false,
    reason: !ready
      ? 'The city is getting ready.'
      : 'Drag across buildings to tear them down.',
    description: 'Tears down the buildings you drag across. The cost is the city you lose.',
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

  const pendingDecision = stats?.state.pendingDecision ?? null;
  const decisionSnoozed = pendingDecision !== null && stats !== null
    && stats.state.tickCount < stats.state.decisionDismissedUntil;
  const decisionActiveCharter = pendingDecision === null || stats === null
    ? null
    : charterOfFamily(stats.state.charters, pendingDecision.family);

  return {
    ready,
    resources,
    catalysts,
    catalystGroups,
    overview: buildCityOverviewModel(stats),
    commerce: commerceOf(stats),
    expansion,
    terrace,
    ropeway,
    demolish,
    policies,
    tradeModes,
    tradeConnected,
    decision: pendingDecision,
    decisionSnoozed,
    decisionActiveCharter,
    paused: stats?.paused ?? false,
    speed: stats?.speed ?? 1,
    message: stats === null
      ? 'Preparing the city…'
      : `${stats.condition.title} · ${stats.condition.message}`,
    condition: stats?.condition ?? null,
    coach: stats?.coach ?? null,
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

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}
