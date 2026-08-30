import {
  addCatalyst,
  BALANCE,
  catalystById,
  catalystRoleOf,
  createSimState,
  defaultCatalystOfClass,
  decisionOption,
  nextBuildSites,
  reviveSimState,
  tick,
  type BuildingClass,
  type CatalystId,
  type DecisionGrant,
  type PolicyId,
  type SimState,
  type TradeMode,
} from '../sim';
import type { ScenarioRegion } from '../sim/scenario';
import {
  Builder,
  type AloftRefusal,
  type AloftVerdict,
  type BuilderStats,
  type LandmarkSite,
} from '../world/buildings/Builder';
import type { FarmPlot } from '../world/farms/plotPlan';
import {
  footprintDepth,
  type BuildingRecord,
  type ReadonlyBuildingRegistry,
} from '../world/buildings/BuildingRegistry';
import type { ClearanceVerdict } from '../world/buildings/clearanceSite';
import { hasFacadeForm, landmarkOf, maxStageOf } from '../world/landmarks/config';
import { landmarkWaterColumn } from '../world/landmarks/generate';
import { createReachCost } from '../world/reachCost';
import { StreetNetwork } from '../world/streets/StreetNetwork';
import type { Facing } from '../world/streets/streetGrid';
import { SKYLINE } from '../world/skyline/config';
import { BIOME, WATER_IDS } from '../world/terrain/config';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { puffsAt, type SmokePuff } from '../world/traffic/plume';
import { posesAt, type VehiclePose } from '../world/traffic/poses';
import { planTraffic, type TrafficRoute, type TrafficStructure } from '../world/traffic/routes';
import { wakeAt, type WakeMark } from '../world/traffic/wake';
import type { VoxelWorld } from '../world/VoxelWorld';
import { FixedStepLoop } from './loop';
import {
  buyExpansion,
  catalystFailure,
  catalystSiteCost,
  changeTradeMode,
  chooseDecision,
  deferDecision,
  expansionFailure,
  grantSite,
  placeCatalyst,
  placeRopeway,
  placeTerrace,
  ropewayFailure,
  terraceFailure,
  togglePolicy,
  type ActionFailure,
  type ActionResult,
  type SiteCost,
} from './actions';
import type { AerialFace, TerraceRefusal } from '../world/aerial/terracePlan';
import type { RopewayRefusal } from '../world/ropeway/ropewayPlan';
import type { RopewayCable, RopewayRide } from '../world/buildings/ropewayDriver';
import { planRopewayRoutes } from '../world/traffic/ropewayRoutes';
import { cityCondition, isSelfSufficient, type CityCondition } from './cityCondition';
import { captureSave } from './save/capture';
import type { SaveGame } from './save/format';
import { onboardingAllows, onboardingOf, type OnboardingState } from './onboarding';
import {
  coachSuggestion,
  type CoachContext,
  type CoachLandmark,
  type CoachSuggestion,
} from './coach';

const TICK_RATE = 10;

/**
 * Quanto una riga della voce resta prima di poter essere sostituita.
 *
 * Otto secondi: il tempo di leggerla e di guardare la citta' per capire di cosa
 * parla. Le crisi non aspettano — quelle interrompono — quindi questo numero
 * governa solo il passaggio fra consigli che possono aspettare.
 */
const COACH_DWELL_TICKS = 80;

/**
 * I rifiuti della facciata, detti come gesti che il giocatore possa fare.
 *
 * Riusano i tre motivi della mensola invece di aggiungerne quattro: dicono gia'
 * le stesse cose — cerca un edificio, cercane uno piu' alto, cercane uno libero
 * — e un rifiuto nuovo si paga in una riga di testo per lingua ogni volta che si
 * aggiunge un modo di costruire in quota.
 */
const ALOFT_FAILURE: Readonly<Record<AloftRefusal, ActionFailure>> = {
  'needs-facade': 'needs-building',
  'facade-too-narrow': 'no-room-aloft',
  'facade-too-low': 'building-too-short',
  'facade-occupied': 'no-room-aloft',
};

/** Il ruolo dietro uno strumento, che sia gia' un ruolo o solo un uso urbano. */
function roleOf(target: BuildingClass | CatalystId): CatalystId {
  return typeof target === 'number' ? defaultCatalystOfClass(target) : target;
}

/**
 * Se la riga tenuta e quella nuova sono lo stesso argomento.
 *
 * **Il coach si confronta per id, il resto per titolo.** Lo stesso consiglio
 * deve riscriversi con i numeri aggiornati — l'organico che sale mentre la riga
 * lo cita — e due suggerimenti diversi possono pure condividere il titolo; un
 * id stabile li distingue senza ambiguita'. Per le righe che il coach non
 * produce vale il titolo, com'era prima.
 */
function sameCoachLine(
  held: { readonly condition: CityCondition; readonly coachId: string | null },
  next: CityCondition,
  suggestion: CoachSuggestion | null,
): boolean {
  if (next.kind === 'coach') return held.coachId === (suggestion?.id ?? null);
  return held.condition.title === next.title;
}
/**
 * Un settore comprato, per quel poco che la crescita deve saperne: come si
 * chiama e che rettangolo occupa. A ricavarlo dall'identificatore e' il
 * chiamante, che l'isola ce l'ha in mano.
 */
export interface SectorRegion {
  readonly id: string;
  readonly region: Region;
}

export interface GrowthStats {
  readonly ready: true;
  readonly tick: number;
  readonly tickMs: number;
  readonly buildings: number;
  readonly countsByClass: readonly number[];
  /** Edifici che ospitano un uso come secondo, per indice di uso. */
  readonly mixedByClass: readonly number[];
  /** Edifici per tipologia, dalla piu' comune alla piu' rara. */
  readonly typologies: readonly (readonly [string, number])[];
  readonly levels: readonly number[];
  readonly builder: BuilderStats;
  readonly state: SimState;
  readonly paused: boolean;
  readonly speed: number;
  readonly message: string;
  readonly onboarding: OnboardingState;
  readonly condition: CityCondition;
  /** La rotta di sviluppo suggerita adesso: alimenta toast e artefatti in-world. */
  readonly coach: CoachSuggestion | null;
  readonly unlockedSectors: readonly string[];
}

/** Cablaggio esclusivo di `?grow=1`: la scena sim normale non costruisce voxel. */
export class GrowthScene {
  private state: SimState;
  private readonly builder: Builder;
  private readonly loop = new FixedStepLoop(TICK_RATE, TICK_RATE);
  private lastTickMs = 0;
  private paused = false;
  private speed = 1;
  private healthyTicks = 0;
  /**
   * La riga che la voce sta mostrando, e da quando.
   *
   * **Sta qui perche' la permanenza ha bisogno di memoria**, e `cityCondition`
   * non ne ha ne' deve averne: e' una funzione pura dello stato, e la stessa
   * citta' deve dire sempre la stessa cosa. Ma le condizioni si valutano dieci
   * volte al secondo su segnali che oscillano — l'organico attraversa la propria
   * soglia mentre la citta' cresce — e senza un tempo minimo la riga sfarfallava
   * fra due consigli ogni secondo e mezzo, che e' il modo piu' rapido per
   * rendere illeggibile un testo giusto.
   */
  private coach: {
    readonly condition: CityCondition;
    readonly sinceTick: number;
    /** Id del suggerimento dietro la condizione, per la permanenza: null senza coach. */
    readonly coachId: string | null;
  } | null = null;
  /** La rotta suggerita adesso, ricalcolata a ogni tick e mostrata dall'overlay. */
  private suggestion: CoachSuggestion | null = null;
  private readonly unlocked = new Set<string>();
  private message = 'Choose a catalyst and place it on the island.';
  private clearanceMemo: { readonly key: string; readonly site: LandmarkSite } | null = null;
  private terraceMemo: {
    readonly key: string;
    readonly refusal: TerraceRefusal | null;
    /** La faccia del piano, quando il piano c'e': il mirino la chiede. */
    readonly face: AerialFace | null;
  } | null = null;
  private aloftMemo: { readonly key: string; readonly verdict: AloftVerdict } | null = null;
  private ropewayMemo: { readonly key: string; readonly refusal: RopewayRefusal | null } | null = null;

  /**
   * L'orologio del traffico, in secondi di gioco.
   *
   * Avanza con la velocita' scelta e si ferma in pausa: e' l'unica cosa che rende
   * le barche parte della simulazione invece che un'animazione che gira per conto
   * suo mentre la citta' e' congelata.
   */
  private clock = 0;

  private routes: readonly TrafficRoute[] = [];
  /** Il mondo voxel, per distinguere l'acqua scavata di un bacino dal bioma. */
  private world!: VoxelWorld;
  /** Le corse di funivia da cui le cabine di `routes` sono state calcolate. */
  private rides: readonly RopewayRide[] = [];
  /** Firma delle strutture da cui `routes` e' stato calcolato. */
  private routeKey = '';
  /** Conto grossolano che dice se valga la pena ricostruire quella firma. */
  private routeStamp = -1;

  /** Settori comprati e non ancora seminati: aspettano che il terreno arrivi. */
  private readonly pendingSectors: Region[] = [];

  constructor(
    world: VoxelWorld,
    private readonly map: TerrainMap,
    region: ScenarioRegion,
    private readonly seed: number,
  ) {
    // Il costo di attraversamento entra qui e da nessun'altra parte: e' cio' che
    // rende geodetica l'influenza dei catalizzatori invece che in linea retta.
    // Senza, la simulazione ricadrebbe sulla Chebyshev di sempre, che su
    // un'isola di canali e terrazze prometteva citta' dall'altra parte del mare.
    this.state = createSimState({
      rngState: seed,
      reachCost: createReachCost(map, new StreetNetwork(seed)),
    });
    this.world = world;
    this.builder = new Builder(world, map, seed, region);
  }

  /**
   * Rimette la scena come il salvataggio l'ha lasciata.
   *
   * **Il campo si ricostruisce, non si carica**, ed e' la stessa ragione per cui
   * non sta nel file: `reviveSimState` lo rifa' da catalizzatori, edifici e
   * policy ottenendo lo stesso contenuto byte per byte. Il costo di
   * attraversamento va ripassato qui come nel costruttore — e' l'unico ingresso
   * del campo che non stia nei dati salvati, e ometterlo darebbe la stessa
   * citta' su un'isola piatta.
   *
   * **I settori arrivano gia' risolti in regioni**, perche' e' il chiamante ad
   * avere in mano l'isola: qui si sa cosa se ne fa la crescita, non come si
   * ricava un rettangolo da un identificatore.
   *
   * Niente `pendingSectors`: il borgo che il settore si porta dietro e' un
   * catalizzatore, ed e' gia' dentro lo stato salvato. Rimetterlo in coda ne
   * pianterebbe un secondo a ogni caricamento.
   */
  restore(save: SaveGame, sectors: readonly SectorRegion[]): void {
    // Il seme e' quello della **scena**, non quello scritto nel file: il mondo e'
    // gia' stato generato da questo, e il Builder ci e' stato costruito sopra.
    // Se i due divergessero, l'influenza leggerebbe strade che non esistono —
    // e chi carica ha gia' fatto in modo che coincidano.
    this.state = reviveSimState(save.sim, createReachCost(this.map, new StreetNetwork(this.seed)));
    this.builder.restore(save.records);

    for (const sector of sectors) {
      this.unlocked.add(sector.id);
      this.builder.registerSecondaryRegion(sector.id, sector.region);
    }

    this.paused = save.scene.paused;
    this.speed = save.scene.speed;
    this.clock = save.scene.clock;
    this.healthyTicks = save.scene.healthyTicks;
    // Le rotte si ricalcolano da sole al primo `trafficPoses`, ma la firma
    // tenuta da prima direbbe che le strutture non sono cambiate: da un mondo
    // vuoto a una citta' intera e' il caso in cui quella cache va invalidata.
    this.routeKey = '';
    this.routeStamp = -1;
    this.message = 'Game loaded.';
  }

  /**
   * La partita in un oggetto salvabile.
   *
   * L'ordine di `unlocked` e' quello di acquisto — un `Set` conserva l'ordine di
   * inserimento — ed e' l'ordine con cui il caricamento deve rigenerare la
   * costa: ogni settore estende la sagoma su cui il successivo viene generato.
   */
  toSave(seed: number, savedAt: number): SaveGame {
    return captureSave({
      seed,
      state: this.state,
      records: this.builder.registry.all,
      sectors: [...this.unlocked],
      scene: {
        paused: this.paused,
        speed: this.speed,
        clock: this.clock,
        healthyTicks: this.healthyTicks,
      },
      savedAt,
    });
  }

  advance(dt: number): void {
    if (!this.paused) this.clock += dt * this.speed;
    if (!this.paused) this.loop.advance(dt * this.speed, () => {
      const start = performance.now();
      this.state = tick(this.state, this.map);
      this.state = this.builder.onTick(this.state);
      this.healthyTicks = isSelfSufficient(this.state) ? this.healthyTicks + 1 : 0;
      this.refreshCoach();
      this.lastTickMs = performance.now() - start;
      // Le passate del Builder sono l'unico momento in cui il registry cambia:
      // quello che il cursore sapeva del riquadro sotto di se' e' di un tick fa.
      this.clearanceMemo = null;
      this.terraceMemo = null;
      this.aloftMemo = null;
    });
    this.builder.step();
  }

  placeCatalyst(
    x: number,
    y: number,
    target: BuildingClass | CatalystId,
    aloft = false,
    preferred?: AerialFace,
  ): ActionResult {
    const failure = this.catalystFailure(x, y, target, aloft, preferred);
    if (failure !== null) return { success: false, reason: failure };

    // Prima di piazzare: dopo, i condannati sono ancora nel registry — restano
    // finche' i loro voxel non spariscono — e la stessa domanda risponderebbe di
    // nuovo lo stesso numero, facendo il doppio del lavoro per dirlo.
    const clears = this.clearanceAt(x, y, target, aloft, preferred).clears;

    const result = placeCatalyst(this.state, this.map, x, y, target, aloft);
    if (result.success) {
      const placed = result.state.catalysts[result.state.catalysts.length - 1];
      // Il ruolo e non la classe: e' il ruolo a decidere quale struttura
      // compare, e passare `placed.class` — come si faceva finche' il segno era
      // un voxel colorato — perdeva proprio l'informazione che serve.
      if (placed !== undefined) {
        this.builder.placeLandmark(x, y, catalystRoleOf(placed), aloft, preferred);
      }
      this.clearanceMemo = null;
      this.aloftMemo = null;
    }

    return this.apply(result, clears === 0
      ? 'Catalyst placed.'
      : `Catalyst placed. Clearing ${clears} ${clears === 1 ? 'building' : 'buildings'} to make room.`);
  }

  catalystFailure(
    x: number,
    y: number,
    target: BuildingClass | CatalystId,
    aloft = false,
    preferred?: AerialFace,
  ): ActionFailure | null {
    if (!onboardingAllows(this.state, target)) return 'onboarding-order';

    // In quota la facciata parla per prima: senza un edificio sotto la colonna non
    // c'e' niente a cui appendersi, e «non e' terreno edificabile» sarebbe la
    // risposta a una domanda che nessuno ha fatto.
    if (aloft) {
      const site = this.aloftSiteAt(x, y, target, preferred);
      if (site.refusal !== null) return ALOFT_FAILURE[site.refusal];
      if (site.site === null) return 'needs-building';
    }
    const failure = catalystFailure(this.state, this.map, x, y, target, aloft);
    if (failure !== null) return failure;

    // A terra, un monumento gia' presente rifiuta il riquadro: un landmark non
    // sostituisce un altro landmark, e il cursore lo deve dire in rosso. E' lo
    // stesso verdetto che `place()` rileggera' al click, quindi il preventivo e
    // il gesto restano la stessa domanda.
    if (!aloft && this.clearanceAt(x, y, target, aloft).refusal === 'landmark-in-the-way') {
      return 'landmark-in-the-way';
    }
    return null;
  }

  /**
   * true se questo ruolo, puntato su un edificio, si appende alla facciata.
   *
   * Serve a chi tiene il puntatore in mano: la colonna da interrogare non e'
   * quella del terreno dietro la torre ma quella della torre, e chi non lo sa
   * chiederebbe il posto sbagliato. E' la stessa distinzione della mensola.
   */
  catalystUsesFacade(target: BuildingClass | CatalystId): boolean {
    return hasFacadeForm(roleOf(target));
  }

  /** Prezzo pesato dal terreno, per il cartellino sul cursore. */
  catalystSiteCost(x: number, y: number, target: BuildingClass | CatalystId): SiteCost | null {
    return catalystSiteCost(this.map, x, y, target);
  }

  /**
   * Cosa il riquadro del landmark troverebbe qui: quanti edifici porta via, o
   * perche' la struttura non ci sta.
   *
   * **Non e' un rifiuto**, ed e' per questo che non passa da `catalystFailure`:
   * il catalizzatore si piazza comunque e il suo campo funziona lo stesso. Cio'
   * che cambia e' quanto costa in citta' e se il monumento comparira' — due
   * cose che il giocatore deve sapere **prima** del click, ed e' l'unico posto
   * dove puo' saperle.
   */
  catalystSite(
    x: number,
    y: number,
    target: BuildingClass | CatalystId,
    aloft = false,
    preferred?: AerialFace,
  ): LandmarkSite {
    return this.clearanceAt(x, y, target, aloft, preferred);
  }

  /**
   * La faccia su cui lo scalo nascerebbe in quota, per orientare il mirino.
   *
   * E' la stessa domanda di `catalystFailure` — stesso memo, stessa risposta —
   * e non un'ipotesi del puntatore: il click passera' la stessa faccia
   * preferita e otterra' lo stesso verdetto, quindi il mirino mostra sempre la
   * faccia su cui lo scalo comparira' davvero.
   */
  aloftFacingAt(
    x: number,
    y: number,
    target: BuildingClass | CatalystId,
    preferred?: AerialFace,
  ): AerialFace | null {
    const verdict = this.aloftSiteAt(x, y, target, preferred);
    return verdict.site === null ? null : verdict.site.facing;
  }

  /**
   * Lo sventramento della colonna interrogata, con una voce di memoria.
   *
   * Il cursore fa **due** domande sulla stessa colonna a ogni movimento — «si
   * puo' piazzare?» e «quanti ne porta via?» — e la risposta e' la stessa
   * lettura del registry su tutto il riquadro del landmark. Una voce sola basta
   * a non pagarla due volte: le due domande arrivano di fila, e il click cade
   * dove il cursore ha appena chiesto.
   *
   * Si invalida a ogni tick e a ogni piazzamento, che sono gli unici due momenti
   * in cui il registry cambia: `step` scrive voxel, non record.
   */
  private clearanceAt(
    x: number,
    y: number,
    target: BuildingClass | CatalystId,
    aloft = false,
    preferred?: AerialFace,
  ): LandmarkSite {
    const role = typeof target === 'number' ? defaultCatalystOfClass(target) : target;
    const key = `${x},${y},${role},${aloft ? 'a' : 'g'},${preferred ?? ''}`;
    if (this.clearanceMemo !== null && this.clearanceMemo.key === key) {
      return this.clearanceMemo.site;
    }
    const site = this.builder.landmarkClearance(x, y, role, aloft, preferred);
    this.clearanceMemo = { key, site };
    return site;
  }

  /**
   * Cosa la facciata offre a un ruolo, con una voce di memoria.
   *
   * La stessa ragione di `clearanceAt`, ma per una domanda che oggi arriva tre
   * volte per pointermove — il rifiuto, il sito e la faccia del mirino. Una voce
   * sola tiene la risposta, e la chiave porta la faccia preferita perche' la
   * risposta cambia con lei.
   */
  private aloftSiteAt(
    x: number,
    y: number,
    target: BuildingClass | CatalystId,
    preferred?: AerialFace,
  ): AloftVerdict {
    const role = roleOf(target);
    const key = `${x},${y},${role},${preferred ?? ''}`;
    if (this.aloftMemo !== null && this.aloftMemo.key === key) {
      return this.aloftMemo.verdict;
    }
    const verdict = this.builder.landmarkAloftSite(x, y, role, preferred);
    this.aloftMemo = { key, verdict };
    return verdict;
  }

  /**
   * Perche' una mensola non si puo' posare qui, o null se si puo'.
   *
   * La porta del cursore. Chiede al mondo con `terraceSite`, che **non scrive**,
   * e passa il rifiuto al gioco: e' la stessa coppia di domande dei
   * catalizzatori — cosa dice il luogo, cosa dice il bilancio — nello stesso
   * ordine.
   */
  terraceFailure(x: number, y: number, preferred?: AerialFace): ActionFailure | null {
    return terraceFailure(this.state, this.terraceRefusalAt(x, y, preferred));
  }

  /**
   * La faccia su cui la mensola nascerebbe, per orientare il mirino.
   *
   * Gemella di `terraceFailure`: la faccia preferita del puntatore entra nel
   * giudizio, e il mirino mostra quella che il click piazzera' davvero — mai
   * una faccia e una posa diverse.
   */
  terraceFacingAt(x: number, y: number, preferred?: AerialFace): AerialFace | null {
    return this.terraceSiteAt(x, y, preferred).face;
  }

  /**
   * Posa una mensola sull'edificio di questa colonna.
   *
   * **Si paga solo cio' che compare.** Il budget di chunk e' l'ultima parola e
   * si scopre scrivendo: se `placeTerrace` dice di no dopo che la convalida e'
   * passata, i fondi restano dove sono e il messaggio lo dice, invece di
   * addebitare una struttura che non c'e'.
   */
  placeTerrace(x: number, y: number, preferred?: AerialFace): ActionResult {
    const result = placeTerrace(this.state, this.terraceRefusalAt(x, y, preferred));
    if (!result.success) return result;

    if (!this.builder.placeTerrace(x, y, preferred)) {
      return { success: false, reason: 'no-room-aloft' };
    }
    this.terraceMemo = null;
    this.aloftMemo = null;
    return this.apply(result, 'Terrace built: the city gains a floor above the street.');
  }

  /**
   * Cosa il mondo dice di questa colonna, con una voce di memoria.
   *
   * Vale la stessa ragione di `clearanceAt`: il cursore fa la stessa domanda a
   * ogni `pointermove` e il click cade dove il cursore ha appena chiesto. Si
   * invalida a ogni tick, che e' l'unico momento in cui il registry cambia da
   * solo, e a ogni posa. La chiave porta la faccia preferita perche' la
   * risposta — piano e faccia del piano — cambia con lei.
   */
  private terraceSiteAt(
    x: number,
    y: number,
    preferred?: AerialFace,
  ): { readonly refusal: TerraceRefusal | null; readonly face: AerialFace | null } {
    const key = `${x},${y},${preferred ?? ''}`;
    if (this.terraceMemo !== null && this.terraceMemo.key === key) {
      return this.terraceMemo;
    }
    const site = this.builder.terraceSite(x, y, preferred);
    const memo = {
      key,
      refusal: site.ok ? null : site.refusal,
      face: site.ok ? site.plan.face : null,
    };
    this.terraceMemo = memo;
    return memo;
  }

  private terraceRefusalAt(x: number, y: number, preferred?: AerialFace): TerraceRefusal | null {
    return this.terraceSiteAt(x, y, preferred).refusal;
  }

  /**
   * Perche' una funivia non parte da qui, o null se parte.
   *
   * La porta del cursore, gemella di `terraceFailure`: chiede al mondo con
   * `ropewaySite`, che **non scrive**, e passa il rifiuto al gioco.
   */
  ropewayFailure(x: number, y: number): ActionFailure | null {
    return ropewayFailure(this.state, this.ropewayRefusalAt(x, y));
  }

  /**
   * Tira una funivia dalla colonna cliccata.
   *
   * **Si paga solo cio' che compare**, come per la mensola: se il budget di
   * chunk dice di no dopo che la convalida e' passata, i fondi restano dove sono
   * invece di addebitare due torri che non ci sono.
   */
  placeRopeway(x: number, y: number): ActionResult {
    const result = placeRopeway(this.state, this.ropewayRefusalAt(x, y));
    if (!result.success) return result;

    if (!this.builder.placeRopeway(x, y)) {
      return { success: false, reason: 'no-room-for-line' };
    }
    this.ropewayMemo = null;
    return this.apply(result, 'Ropeway open: the crossing no longer needs the ground.');
  }

  /** La stessa memoria di `terraceRefusalAt`, e per la stessa ragione. */
  private ropewayRefusalAt(x: number, y: number): RopewayRefusal | null {
    const key = `${x},${y}`;
    if (this.ropewayMemo !== null && this.ropewayMemo.key === key) {
      return this.ropewayMemo.refusal;
    }
    const site = this.builder.ropewaySite(x, y);
    const refusal = site.ok ? null : site.refusal;
    this.ropewayMemo = { key, refusal };
    return refusal;
  }

  /** Le funi da disegnare. Riferimento stabile finche' non ne nasce una. */
  ropewayCables(): readonly RopewayCable[] {
    return this.builder.ropewayCables;
  }

  /** Cosa la gomma porterebbe via dal riquadro, senza toccare niente. */
  demolishSurvey(x: number, y: number, sizeX: number, sizeY: number): ClearanceVerdict {
    return this.builder.demolishSurvey(x, y, sizeX, sizeY);
  }

  /**
   * I record che la gomma porterebbe via, e quelli che la fermano.
   *
   * Per l'anteprima: il gioco non deve sapere come leggere il registry, gli
   * basta l'elenco per colorare i condannati e le strutture protette.
   */
  demolishPreview(x: number, y: number, sizeX: number, sizeY: number): {
    readonly doomed: readonly BuildingRecord[];
    readonly protected: readonly BuildingRecord[];
  } {
    return this.builder.demolishPreview(x, y, sizeX, sizeY);
  }

  /**
   * Demolisce cio' che occupa il riquadro, a budget.
   *
   * Il gioco tiene la gomma in mano: una passata non e' una decisione, e chi
   * sbaglia area fa un secondo colpo. Il costo non e' in fondi — lo presenta
   * `tick` con il `crowdingPenalty` che ha gia'.
   */
  demolish(x: number, y: number, sizeX: number, sizeY: number): boolean {
    const done = this.builder.demolish(x, y, sizeX, sizeY);
    if (done) this.message = 'Demolition under way.';
    return done;
  }

  /**
   * Demolisce il solo edificio sotto la colonna, senza trascinare.
   *
   * E' il gesto corto della gomma: un clic su una casa porta via quella casa e
   * nient'altro. Il bersaglio e' il record piu' alto della colonna che non sia
   * una campata ne' un impalcato; il riquadro e' la sua impronta esatta.
   */
  demolishAt(x: number, y: number): { readonly verdict: ClearanceVerdict; readonly done: boolean } {
    let target: BuildingRecord | null = null;
    for (const record of this.registry.at(x, y)) {
      if (record.span !== undefined || record.aerial !== undefined) continue;
      if (target === null || record.baseZ + record.height > target.baseZ + target.height) {
        target = record;
      }
    }
    if (target === null) {
      return { verdict: { clears: 0, landmarks: 0, refusal: null }, done: false };
    }
    const sizeY = footprintDepth(target);
    const verdict = this.builder.demolishSurvey(target.x, target.y, target.footprint, sizeY);
    const done = this.builder.demolish(target.x, target.y, target.footprint, sizeY);
    if (done) this.message = 'Demolition under way.';
    return { verdict, done };
  }

  /**
   * Annulla l'ultima passata della gomma.
   *
   * Restituisce il nuovo stato — chi era gia' stato tolto alla simulazione
   * torna — e quanti condannati sono stati ricostruiti.
   */
  undoDemolition(): { readonly restored: number } {
    const result = this.builder.undoDemolition(this.state);
    this.state = result.state;
    if (result.restored > 0) this.message = 'Demolition undone.';
    return { restored: result.restored };
  }

  togglePolicy(id: PolicyId): ActionResult {
    const active = !this.state.policies.includes(id);
    return this.apply(togglePolicy(this.state, id), active ? 'Policy activated.' : 'Policy deactivated.');
  }

  /**
   * Applica un'alternativa e, se ne concede una, ne costruisce l'opera.
   *
   * L'opera si legge **prima** di risolvere: `resolveDecision` azzera
   * `pendingDecision`, e dopo non ci sarebbe piu' niente da cui ricavarla.
   */
  chooseDecision(optionId: string): ActionResult {
    const pending = this.state.pendingDecision;
    const grant = pending === null ? undefined : decisionOption(pending, optionId)?.grant;

    const result = this.apply(chooseDecision(this.state, optionId), 'Decision applied to the city.');
    if (result.success && grant !== undefined) this.buildGrant(grant);
    return result;
  }

  /** Rimanda la decisione sospesa: si nasconde e ricompare dopo `snoozeTicks`. */
  snoozeDecision(): ActionResult {
    return this.apply(deferDecision(this.state), 'Decision postponed.');
  }

  /**
   * Posa l'opera sul miglior sito che la citta' offre.
   *
   * Prima si cercano i candidati dell'uso che il ruolo porta, cosi' un mercato
   * nasce fra i negozi; se quell'uso non ha ancora niente si ripiega sui
   * candidati migliori in assoluto, che e' comunque il cuore della citta'.
   * Senza nessun candidato l'opera non si fa: la decisione resta valida e il
   * messaggio lo dice, invece di lasciare il giocatore a chiedersi cosa sia
   * successo.
   */
  private buildGrant(grant: DecisionGrant): void {
    const definition = catalystById(grant.kind);
    const depth = BALANCE.decisions.grant.searchDepth;
    const preferred = nextBuildSites(this.state, this.map, depth, { class: definition.class });
    const everywhere = nextBuildSites(this.state, this.map, depth);
    // L'opera automatica rispetta i monumenti che ci sono gia': la citta' non
    // demolisce da sola cio' che il giocatore ha fatto sorgere — la gomma e'
    // un gesto, non una decisione. Un riquadro che ne ospita uno rifiuta, e
    // solo se ogni sito li toccherebbe si ripiega sulla regola piena.
    const spares = (x: number, y: number): boolean =>
      this.builder.landmarkClearance(x, y, grant.kind).refusal !== 'landmark-in-the-way';
    const site = grantSite(this.state, this.map, grant.kind, preferred, spares)
      ?? grantSite(this.state, this.map, grant.kind, everywhere, spares)
      ?? grantSite(this.state, this.map, grant.kind, preferred)
      ?? grantSite(this.state, this.map, grant.kind, everywhere);
    if (site === null) {
      this.message = `The city had no room for the new ${definition.label.toLowerCase()}.`;
      return;
    }

    this.state = addCatalyst(this.state, {
      x: site.x,
      y: site.y,
      class: definition.class,
      kind: grant.kind,
      strength: BALANCE.decisions.grant.strength,
      radius: BALANCE.decisions.grant.radius,
    });
    this.builder.placeLandmark(site.x, site.y, grant.kind);
    this.message = `${definition.label} built where the decision landed.`;
  }

  setTradeMode(mode: TradeMode): ActionResult {
    return this.apply(changeTradeMode(this.state, mode), 'Trade strategy updated.');
  }

  buyExpansion(sectorId: string, region: Region): ActionResult {
    const result = buyExpansion(this.state, this.unlocked.has(sectorId));
    if (result.success) {
      this.unlocked.add(sectorId);
      this.builder.registerSecondaryRegion(sectorId, region);
      // Il nucleo non si pianta adesso: il terreno del settore non esiste
      // ancora, e la ricerca del sito guarderebbe colonne non generate.
      this.pendingSectors.push(region);
    }
    return this.apply(result, 'Coastal sector purchased.');
  }

  expansionFailure(sectorId: string): ActionFailure | null {
    return expansionFailure(this.state, this.unlocked.has(sectorId));
  }

  /**
   * Il settore e' arrivato: ci si pianta il nucleo che lo fa crescere.
   *
   * **Terra e crescita non sono la stessa cosa**, ed e' il difetto che questa
   * chiamata chiude. La citta' nasce dove il campo di desiderabilita' esiste, e
   * il campo esiste solo dove un catalizzatore l'ha acceso: un settore comprato
   * restava quindi un pezzo d'isola vuoto per sempre, mentre il messaggio
   * prometteva che ci sarebbe cresciuta la citta'. Il borgo che arriva con la
   * terra e' quella promessa mantenuta al minimo — abbastanza da far attecchire
   * le prime case, non abbastanza da decidere cosa diventera' il settore.
   */
  markSectorReady(): void {
    this.message = this.seedSectors()
      ? 'Coastal sector ready. A market opened on the new land: the city grows from there.'
      : 'Coastal sector ready. The new land can support city growth.';
  }

  /** Pianta il nucleo di ogni settore che ha ormai terreno sotto. */
  private seedSectors(): boolean {
    let seeded = false;
    for (let i = this.pendingSectors.length - 1; i >= 0; i--) {
      const spot = this.sectorSeedSite(this.pendingSectors[i]);
      if (spot === null) continue;
      this.pendingSectors.splice(i, 1);

      const seed = BALANCE.gameplay.expansion.seed;
      const kind = seed.kind as CatalystId;
      const definition = catalystById(kind);
      this.state = addCatalyst(this.state, {
        x: spot.x,
        y: spot.y,
        class: definition.class,
        kind,
        strength: seed.strength,
        radius: seed.radius,
      });
      this.builder.placeLandmark(spot.x, spot.y, kind);
      seeded = true;
    }
    return seeded;
  }

  /**
   * La colonna piu' centrale del settore su cui si possa costruire.
   *
   * Al centro e non al margine: un nucleo sul bordo spingerebbe meta' della
   * propria influenza sull'acqua, e il settore crescerebbe da un angolo invece
   * che da se stesso. Il passo grosso basta — si cerca un punto, non il punto.
   */
  private sectorSeedSite(region: Region): { readonly x: number; readonly y: number } | null {
    const centreX = region.minX + region.sizeX / 2;
    const centreY = region.minY + region.sizeY / 2;
    const step = 4;

    let best: { x: number; y: number } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let y = region.minY + step; y < region.minY + region.sizeY - step; y += step) {
      for (let x = region.minX + step; x < region.minX + region.sizeX - step; x += step) {
        const column = this.map.columnAt(x, y);
        if (column === null || !column.buildable) continue;
        if (this.builder.registry.isOccupied(x, y)) continue;
        const score = Math.abs(x - centreX) + Math.abs(y - centreY);
        if (score >= bestScore) continue;
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }

  /**
   * Dove stanno i mezzi in questo istante.
   *
   * Le rotte si ricalcolano **solo quando cambiano le strutture**: cercare una
   * rotta di mare visita qualche migliaio di celle, e rifarlo a ogni frame per
   * spostare una barca di un decimo di voxel sarebbe l'unica cosa qui dentro a
   * costare qualcosa.
   */
  trafficPoses(): readonly VehiclePose[] {
    this.syncTraffic();
    return posesAt(this.routes, this.clock);
  }

  /**
   * Il fumo dei fumaioli in questo istante.
   *
   * Una seconda lettura delle stesse rotte, non un secondo stato: uno sbuffo e'
   * dov'era la nave qualche secondo fa, quindi il pennacchio non ha niente da
   * conservare fra un frame e l'altro. In pausa si ferma con tutto il resto,
   * perche' l'orologio e' lo stesso.
   */
  trafficPuffs(): readonly SmokePuff[] {
    this.syncTraffic();
    return puffsAt(this.routes, this.clock);
  }

  /**
   * La schiuma che gli scafi hanno lasciato dietro di se'.
   *
   * La terza lettura delle stesse rotte, e non un terzo stato: un segno di scia
   * e' dov'era la nave qualche secondo fa, come uno sbuffo di fumo. Chi vola e
   * chi pende non ne lascia — la selezione sta in `wake.ts`, che sa quali mezzi
   * galleggiano; qui non c'e' un tipo da controllare.
   */
  trafficWake(): readonly WakeMark[] {
    this.syncTraffic();
    return wakeAt(this.routes, this.clock);
  }

  private syncTraffic(): void {
    // **Il caso comune e' un confronto fra due interi e un riferimento.** La
    // firma vera scorre il registry, che con duemila edifici e' l'unica cosa qui
    // dentro il cui costo cresce con la citta': i landmark e i catalizzatori sono
    // unita' e cambiano di numero solo quando il giocatore fa qualcosa, quindi
    // basta quel numero a sapere che non c'e' niente da rifare. Le funivie
    // portano gia' la propria risposta: il loro array cambia identita' solo
    // quando ne nasce una.
    const rides = this.builder.ropewayRides;
    // **La citta' che cresce alza le rotte di volo**, quindi non basta piu' che
    // cambino le strutture: un circuito calcolato quando l'aeroporto era in
    // mezzo ai campi resterebbe alla propria quota mentre attorno crescono
    // torri da centoquaranta voxel, e l'aereo ci passerebbe dentro. A scaglioni
    // pero', e non a ogni edificio — quello sarebbe una ricerca di rotta di mare
    // ogni volta che spunta una villetta. Sessantaquattro edifici e' molto meno
    // di quanto serve a cambiare la sagoma di un quartiere.
    const skyline = this.builder.registry.count >> 6;
    const stamp = this.builder.registry.landmarkCount * 1024 + this.state.catalysts.length
      + skyline * 1_048_576;
    if (stamp === this.routeStamp && rides === this.rides) return;
    this.routeStamp = stamp;

    const structures = this.trafficStructures();
    const key = `${skyline}|${structures
      .map((item) => `${item.id}@${item.cx},${item.cy}:${item.facing}:${item.form ?? 'ground'}`)
      .join('|')}`;
    if (key === this.routeKey && rides === this.rides) return;
    this.routeKey = key;
    this.rides = rides;
    this.routes = [
      ...planTraffic(
        structures,
        (x, y) => this.isOpenWater(x, y),
        (x, y) => this.ceilingAt(x, y),
      ),
      ...planRopewayRoutes(rides),
    ];
  }

  /**
   * Quanto e' alto cio' che occupa una colonna: terreno o costruito.
   *
   * E' l'unica cosa che `world/traffic/` sa della citta' vera, e arriva come
   * predicato per la stessa ragione dell'acqua — quel dominio non ha un registry
   * e non deve averne uno. Il terreno entra nel massimo insieme agli edifici:
   * un circuito che scavalcasse le torri e non la collina dietro sarebbe lo
   * stesso difetto guardato dall'altra parte.
   */
  private ceilingAt(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const ground = this.map.has(cx, cy) ? this.map.heightAt(cx, cy) : 0;
    return Math.max(this.builder.registry.supportAt(cx, cy).z, ground);
  }

  /**
   * Acqua navigabile: mare **gia' generato**, oppure acqua scritta nel mondo.
   *
   * Il bioma di una colonna che non esiste ancora e' `ocean`, ed e' la risposta
   * giusta per il terreno e quella sbagliata per una barca: una rotta ci
   * passerebbe attraverso e la barca navigherebbe sul vuoto oltre il bordo del
   * mondo. Il bioma pero' non vede il **bacino scavato** — la marina scava
   * l'acqua dentro una riva che per il terreno resta terra emersa — quindi il
   * giudizio finale chiede ai voxel: acqua e' dove sotto il pelo della colonna
   * c'e' un voxel d'acqua vero.
   */
  private isOpenWater(x: number, y: number): boolean {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (!this.map.has(cx, cy)) return false;
    if (this.map.biomeAt(cx, cy) === BIOME.ocean) return true;
    return this.world.getBlock(cx, cy, this.map.waterTopAt(cx, cy) - 1) === WATER_IDS.surface;
  }

  /** I landmark, ridotti a cio' che il traffico deve sapere di loro. */
  private trafficStructures(): readonly TrafficStructure[] {
    const out: TrafficStructure[] = [];
    for (const record of this.builder.registry.all) {
      const kind = record.landmark;
      if (kind === undefined) continue;
      const catalyst = this.catalystOf(record, kind);
      if (catalyst === null) continue;
      const column = landmarkWaterColumn(
        kind,
        (record.facing ?? 0) as Facing,
        record.x,
        record.y,
        record.landmarkForm,
      );
      out.push({
        id: record.id,
        kind,
        class: record.class,
        cx: catalyst.x,
        cy: catalyst.y,
        x: record.x,
        y: record.y,
        facing: (record.facing ?? 0) as Facing,
        z: record.baseZ,
        form: record.landmarkForm,
        // Il pelo dello specchio davanti alla struttura: sul mare e' il livello
        // del mare, sul lago quello della conca. Gli ormeggi a galla ci posano
        // i mezzi, cosi' uno yacht non resta sospeso a mezz'aria sulla riva.
        // Il record lo porta gia' per chi scava il bacino; gli altri lo
        // ricalcolano dalla `waterline`, che il piazzamento ha messo sull'acqua.
        waterZ: record.waterZ
          ?? (column === null ? undefined : this.map.waterTopAt(column.x, column.y)),
      });
    }
    return out;
  }

  /**
   * Il catalizzatore che questo landmark rappresenta, o null.
   *
   * Ruolo **e** riquadro insieme, come in `landmarkDriver`: un ingombro largo
   * venti colonne ne contiene facilmente due, e il solo riquadro darebbe al
   * porto le linee del traghetto accanto.
   */
  private catalystOf(
    record: BuildingRecord,
    kind: CatalystId,
  ): { readonly x: number; readonly y: number } | null {
    const host = record.aloft === true
      ? this.builder.registry.get(record.supports?.[0] ?? 0)
      : null;
    const anchor = host ?? record;
    const depth = footprintDepth(anchor);
    for (const catalyst of this.state.catalysts) {
      if (catalystRoleOf(catalyst) !== kind) continue;
      if (catalyst.x < anchor.x || catalyst.x >= anchor.x + anchor.footprint) continue;
      if (catalyst.y < anchor.y || catalyst.y >= anchor.y + depth) continue;
      return catalyst;
    }
    return null;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setSpeed(speed: number): void {
    this.speed = speed === 2 || speed === 4 ? speed : 1;
  }

  setMessage(message: string): void {
    this.message = message;
  }

  get simState(): SimState {
    return this.state;
  }

  get statusMessage(): string {
    return this.message;
  }

  get registry(): ReadonlyBuildingRegistry {
    return this.builder.registry;
  }

  /** I lotti agricoli vivi, per la vista informativa del cibo. */
  get farmPlots(): readonly FarmPlot[] {
    return this.builder.farmPlots;
  }

  get stats(): GrowthStats {
    return {
      ready: true,
      tick: this.state.tickCount,
      tickMs: this.lastTickMs,
      buildings: this.builder.registry.count,
      countsByClass: [...this.builder.registry.countsByClass],
      mixedByClass: [...this.builder.registry.mixedByClass],
      typologies: [...this.builder.registry.typologyHistogram]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      levels: [...this.builder.registry.levelHistogram],
      builder: this.builder.stats,
      state: this.state,
      paused: this.paused,
      speed: this.speed,
      message: this.message,
      onboarding: onboardingOf(this.state),
      // Quella tenuta, non quella di adesso: fra un tick e l'altro sono la
      // stessa cosa, e prima del primo tick non c'e' ancora niente da tenere.
      condition: this.coach?.condition
        ?? cityCondition(this.state, this.healthyTicks, this.suggestion),
      coach: this.suggestion,
      unlockedSectors: [...this.unlocked],
    };
  }

  /**
   * Sceglie la riga della voce, e la lascia stare abbastanza da poterla leggere.
   *
   * Tre regole, in ordine. **Lo stesso argomento si riscrive sempre**: se il
   * titolo non cambia sono numeri nuovi sulla stessa frase — l'organico che sale
   * mentre la riga lo cita — e tenerli fermi sarebbe peggio che cambiare riga.
   * **L'urgenza passa subito**, in tutte e due le direzioni: una crisi non
   * aspetta il proprio turno, e la fine di una crisi nemmeno, perche' sapere che
   * e' finita e' meta' dell'informazione. **Tutto il resto aspetta**, che e' cio'
   * che spegne il tremolio fra un collo di bottiglia e un'opportunita'.
   */
  private refreshCoach(): void {
    const suggestion = coachSuggestion(this.buildCoachContext());
    this.suggestion = suggestion;
    const next = cityCondition(this.state, this.healthyTicks, suggestion);    const now = this.state.tickCount;
    const held = this.coach;

    if (held === null || sameCoachLine(held, next, suggestion)) {
      this.coach = {
        condition: next,
        sinceTick: held?.sinceTick ?? now,
        coachId: suggestion?.id ?? null,
      };
      return;
    }

    const urgent = next.kind === 'crisis' ||
      next.kind === 'onboarding' ||
      held.condition.kind === 'crisis';
    if (urgent || now - held.sinceTick >= COACH_DWELL_TICKS) {
      this.coach = {
        condition: next,
        sinceTick: now,
        coachId: suggestion?.id ?? null,
      };
    }
  }

  /**
   * I fatti del mondo che il coach legge, raccolti una volta per tick.
   *
   * Gli stadi si ricavano con `landmarkOf`/`maxStageOf`/`withinRadius`, le
   * stesse funzioni di `landmarkDriver.pass`: cosi' i numeri che il coach cita
   * coincidono con quelli che fanno davvero avanzare il landmark.
   */
  private buildCoachContext(): CoachContext {
    const stats = this.builder.stats;
    const scanned = this.scanLandmarks();
    return {
      state: this.state,
      tallestLevel: this.tallestLevel(),
      center: this.densestColumn(),
      clearing: stats.clearing > 0,
      // Quota, candidato e lacune arrivano gia' misurati dalla passata: qui non
      // si ricalcola niente, o la voce prometterebbe una condizione che il
      // driver poi valuta diversamente.
      arcology: stats.arcology,
      hasAloftLandmark: scanned.hasAloftLandmark,
      aerial: {
        terraces: stats.terraces,
        routes: stats.routes,
        lifts: stats.lifts,
        piers: stats.piers,
        stacked: stats.stacked,
      },
      spans: stats.spans,
      ropeways: stats.ropeways,
      landmarks: scanned.landmarks,
    };
  }

  /**
   * Una sola passata sul registry: i landmark non ancora al massimo, con gli
   * edifici dentro il loro raggio, e se esiste gia' un landmark in quota.
   *
   * Gli stadi si ricavano con `landmarkOf`/`maxStageOf`/`countWithinRadius`, le
   * stesse misure di `landmarkDriver.pass`: cosi' i numeri che il coach cita
   * coincidono con quelli che fanno davvero avanzare il landmark. Il conteggio
   * passa da `countWithinRadius` e non da `withinRadius().length`, che
   * materializzerebbe un array per ogni landmark a ogni tick.
   */
  private scanLandmarks(): {
    readonly landmarks: CoachLandmark[];
    readonly hasAloftLandmark: boolean;
  } {
    const landmarks: CoachLandmark[] = [];
    let hasAloftLandmark = false;
    for (const record of this.builder.registry.all) {
      const kind = record.landmark;
      if (kind === undefined) continue;
      if (record.aloft === true) hasAloftLandmark = true;

      const recipe = landmarkOf(kind, record.landmarkForm);
      if (recipe === null || record.level >= maxStageOf(recipe)) continue;
      const catalyst = this.catalystOf(record, kind);
      if (catalyst === null) continue;
      const nextAt = recipe.stages[record.level + 1];
      if (nextAt === undefined) continue;

      const nearby = this.builder.registry.countWithinRadius(
        catalyst.x,
        catalyst.y,
        catalystById(kind).radius,
      );
      landmarks.push({ kind, x: catalyst.x, y: catalyst.y, stage: record.level, nextAt, nearby });
    }
    return { landmarks, hasAloftLandmark };
  }

  /** Il livello piu' alto raggiunto dal costruito, o zero su una citta' vuota. */
  private tallestLevel(): number {
    const levels = this.builder.registry.levelHistogram;
    for (let level = levels.length - 1; level >= 0; level--) {
      if ((levels[level] ?? 0) > 0) return level;
    }
    return 0;
  }

  /**
   * La colonna piu' densa: l'ancora del record con piu' edifici nel raggio dello
   * skyline. Null finche' nessuna raggiunge la densita' del nucleo — prima di
   * allora il centro e' un problema di costruito, non di catalizzatori.
   */
  private densestColumn(): { readonly x: number; readonly y: number } | null {
    let best: { readonly x: number; readonly y: number } | null = null;
    let bestCount: number = SKYLINE.edgeCore;
    for (const record of this.builder.registry.all) {
      const count = this.builder.registry.countWithinRadius(record.x, record.y, SKYLINE.edgeRadius);
      if (count > bestCount) {
        bestCount = count;
        best = { x: record.x, y: record.y };
      }
    }
    return best;
  }

  private apply(result: ActionResult, successMessage: string): ActionResult {
    if (result.success) {
      this.state = result.state;
      this.message = successMessage;
    }
    return result;
  }
}
