import {
  addBuilding,
  nextBuildSites,
  setIslandConnections,
  urbanProfileAt,
  type Building,
  type BuildingClass,
  type CatalystId,
  type CellRect,
  type SimState,
} from '../../sim';
import { dirtyChunkCount } from './chunkBudget';
import { poleRectAt } from './growthPoles';
import {
  buildWorks,
  groundKindAt,
  hasUnworkableColumn,
  isCoastal,
  nearLand,
  surveyGrade,
} from './siteWorks';
import type { BuildContext } from './buildContext';
import {
  LandmarkDriver,
  type AloftRefusal,
  type AloftVerdict,
  type LandmarkSite,
} from './landmarkDriver';
import { ARCOLOGY } from '../arcology/config';
import type { ArcologyDriverRefusal } from './arcologyDriver';
import { ArcologyDriver } from './arcologyDriver';
import { ClearanceSites } from './clearanceSite';
import { SpanDriver } from './spanDriver';
import { AerialDriver } from './aerialDriver';
import { GuideDriver } from './guideDriver';
import { UpgradeDriver } from './upgradeDriver';
import { FarmDriver } from './farmDriver';
import { FARMS } from '../farms/config';
import {
  RopewayDriver,
  type RopewayCable,
  type RopewayRide,
} from './ropewayDriver';
import type { RopewayResult } from '../ropeway/ropewayPlan';
import { allowedLevel } from './hierarchy';
import { formOf, localLevelBonus } from './urbanForm';
import { hashCoords } from '../rng';
import type { TerrainMap } from '../terrain/TerrainMap';
import type { VoxelWorld } from '../VoxelWorld';
import {
  BuildingRegistry,
  type BuildingRecord,
  type ReadonlyBuildingRegistry,
} from './BuildingRegistry';
import {
  BUILDER,
  CLUSTER,
  MAX_FOOTPRINT,
  MIN_FOOTPRINT,
  typologyById,
} from './config';
import { planCluster, type ClusterTerms } from './cluster';
import { generateBuilding, startLevel } from './generate';
import { selectTypology, typologyProfile } from './typology';
import { styleAt, styledProfile } from './style';
import { lotRoleOf } from './blockForm';
import { envelopeOf } from './BuildingRegistry';
import { groundSideOf, overhangFor } from './generate';
import { GrowthQueue, anchorOf } from './growthQueue';
import { SurfaceQueue } from './surfaceQueue';
import {
  GROUND,
  WORKS,
  type GradePlan,
} from '../grading/grade';
import { StreetNetwork } from '../streets/StreetNetwork';
import { placeLot, type Lot } from '../streets/lots';
import { FACING, type Facing } from '../streets/streetGrid';
import { SPANS } from '../spans/config';
import { AERIAL } from '../aerial/config';
import { decksAt, type BuildDeck } from '../aerial/decks';
import type { TerraceResult } from '../aerial/terracePlan';
import { CROSSINGS } from '../crossings/config';
import type { Region } from '../terrain/region';
import { CrossingDriver } from './crossingDriver';

/**
 * Il ponte fra la simulazione e il mondo voxel.
 *
 * E' l'unico modulo autorizzato a scrivere edifici con `world.setBlock`. Il
 * terreno ha i suoi scrittori — `IslandGenerator` e `BiomeView` — ma nessuno
 * scrive un muro all'infuori di qui: e' cio' che rende vera l'affermazione "il
 * registry sa cosa esiste", perche' non c'e' un'altra strada per far comparire
 * un edificio.
 *
 * **La simulazione resta pura e non sa che esistiamo.** Il Builder legge le sue
 * decisioni (`nextBuildSites`) e il suo campo (`field.valueAt`), e le restituisce
 * una sola informazione: che su una certa colonna ora c'e' un edificio di certi
 * usi. Non le passa il registry, non le passa il mondo, non le passa un
 * riferimento a se stesso.
 *
 * **La tipologia si decide qui, non nella simulazione.** `src/sim/` sa che una
 * colonna vuole ospitare commercio; che quel commercio diventi un mercato sul
 * porto o una torre di uffici dipende da terreno, costa e catalizzatori vicini,
 * cioe' da cose che vivono da questa parte del confine. La simulazione non ha
 * un campo per la forma degli edifici e non deve averne uno.
 *
 * **Perche' un edificio nuovo costa una `addBuilding` sola.** Un'impronta 3x3
 * occupa nove colonne, ma la simulazione ne sente una: `buildingCounts` alimenta
 * il bilancio di `balance.ts`, e registrare nove edifici dove ce n'e' uno
 * moltiplicherebbe per nove il fabbisogno di cibo di quel lotto. L'occupazione
 * delle altre otto colonne vive nel registry, che e' anche l'unico che sappia
 * cosa sia un'impronta.
 */

/**
 * Perche' un candidato della simulazione non e' diventato un edificio.
 *
 * Dalla 4.2 sono quattro e non piu' cinque: `notBuildable` e `belowSea`
 * dicevano entrambi "il terreno non e' gia' piano e asciutto", che ha smesso di
 * essere un motivo — un terrapieno o una banchina lo rendono tale. Restano i
 * rifiuti veri: la colonna che nessuna opera regge, quella gia' occupata, il
 * dislivello oltre il tetto strutturale e il budget di chunk.
 */
export const REJECT_REASONS = [
  'unworkable',
  'occupied',
  'worksTooTall',
  'chunkBudget',
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

// Chi tiene il `Builder` interroga il riquadro di un landmark passando di qui:
// il driver e' un dettaglio di questa cartella.
export type { AloftRefusal, AloftVerdict, LandmarkSite };

/**
 * Il record come lo vede la simulazione.
 *
 * **La specializzazione la dichiara la tipologia, non il luogo.** Il record porta
 * `profile.specialization`, che dice cosa il quartiere *esprime*; qui serve cosa
 * e' stato **costruito**, e sono due cose diverse: in un distretto che esprime
 * `farming` un edificio sotto `minLevel` prende comunque una tipologia normale, e
 * contarlo come torre idroponica lo farebbe produrre cibo senza esserlo.
 * Chiedendolo al catalogo la regola resta dati: qualunque riga che dichiari una
 * specializzazione che il bilancio conosce arriva alla simulazione da sola.
 */
function simBuilding(record: BuildingRecord): Building {
  const built = record.typology === undefined
    ? undefined
    : typologyById(record.typology)?.specialization;
  return {
    x: record.x,
    y: record.y,
    class: record.class,
    level: record.level,
    ...(record.mixed === undefined ? {} : { mixed: record.mixed }),
    ...(built === undefined ? {} : { specialization: built }),
  };
}

export interface BuilderStats {
  /** Edifici completati piu' quelli ancora in crescita. */
  readonly placed: number;
  readonly upgraded: number;
  /** Edifici che stanno comparendo in questo momento. */
  readonly growing: number;
  /** Siti scartati per motivo, indicizzato come `REJECT_REASONS`. */
  readonly rejected: readonly number[];
  /** Siti bocciati in modo definitivo, che non verranno piu' riproposti. */
  readonly blacklisted: number;
  /** Celle di piazzole e sentieri ancora da applicare. */
  readonly surfaceQueued: number;
  /**
   * Edifici che stanno in fila con almeno un vicino.
   *
   * E' il numero con cui si verifica il gate della 4.4 senza guardare a occhio:
   * se resta a zero mentre la citta' cresce, l'aggregazione non sta avvenendo e
   * i distretti densi sono tornati a essere volumi vicini.
   */
  readonly clustered: number;
  /**
   * Campate esistenti, e isolati distinti che la loro componente piu' larga
   * raggiunge.
   *
   * Il secondo e' il gate della 4.5 reso leggibile senza aprire una console: a
   * uno la rete e' un ornamento — dei ponti che non portano da nessuna parte —
   * e da due in su e' un secondo piano stradale.
   */
  readonly spans: number;
  readonly spanReach: number;
  /**
   * La citta' in quota, in cinque numeri.
   *
   * Sono il gate della 4.9 reso leggibile senza aprire una console, come
   * `spanReach` lo e' per la 4.5, e sono cinque perche' i modi di fallire sono
   * cinque e diversi fra loro: `terraces` a zero vuol dire che nessun fronte
   * regge una mensola; `routes` a zero che la citta' non si intreccia; `piers` a
   * zero con le altre due piene che tutto sta in piedi a sbalzo, cioe' che
   * `reach` e' troppo largo; `stacked` a zero che le quote nascono e nessuno ci
   * costruisce sopra; `lifts` a zero che **non c'e' modo di arrivarci** — si
   * abita sopra la citta' e non ci si muove fra i livelli, che e' esattamente la
   * meta' del gate che la fase aveva lasciato aperta.
   */
  readonly terraces: number;
  readonly routes: number;
  readonly piers: number;
  readonly stacked: number;
  readonly lifts: number;
  /**
   * Quante funivie il giocatore ha tirato.
   *
   * Non e' un gate come i cinque numeri sopra — una funivia non nasce da sola, e
   * zero significa soltanto che nessuno ne ha voluta una — ma sta accanto a loro
   * perche' e' l'altro modo in cui la citta' scavalca il vuoto.
   */
  readonly ropeways: number;
  /**
   * Lotti agricoli vivi adesso.
   *
   * E' un numero che deve **scendere** mentre la citta' cresce, e guardarlo salire
   * per sempre e' il modo in cui questa meccanica si romperebbe in silenzio: vuol
   * dire che nessun lotto si ritira, cioe' che la citta' non si mangia piu' la
   * propria campagna e la fame non arriva mai.
   */
  readonly farmPlots: number;
  /**
   * Arcologie in piedi. Zero, una o due, e mai di piu'.
   *
   * E' il numero che dice se la condizione della 4.14 e' mai stata vera: resta a
   * zero su ogni partita che non arriva a un centro **saturo**, ed e' voluto —
   * la megastruttura e' la risposta a «qui non c'e' piu' niente da diventare»,
   * non un premio di anzianita'.
   */
  readonly arcologies: number;
  /**
   * Perche' l'ultima passata non ne ha fondata una, o null se non c'era niente
   * da rifiutare.
   *
   * **Senza questa riga `arcologies: 0` non significa niente**, perche' e' il
   * valore normale per quasi tutta la partita. Con `notCapped` la citta' sta
   * ancora crescendo e prima o poi ci arrivera'; con `notPeak` su ogni seed
   * vorrebbe dire che la condizione e' insoddisfacibile e che il numero da
   * rivedere e' un altro.
   */
  readonly arcologyRefusal: ArcologyDriverRefusal | null;
  /**
   * Lo sventramento in due numeri: cantieri aperti adesso, edifici gia' portati
   * via in tutta la partita.
   *
   * Servono a distinguere i due modi in cui la meccanica puo' rompersi senza
   * dirlo: `clearing` che non torna mai a zero vuol dire un cantiere bloccato —
   * qualcuno non finisce di sparire — mentre `cleared` fermo a zero mentre il
   * giocatore pianta monumenti in centro vuol dire che la soglia di livello sta
   * rifiutando tutto.
   */
  readonly clearing: number;
  readonly cleared: number;
}

export class Builder {
  private readonly registryImpl = new BuildingRegistry();
  private readonly growth: GrowthQueue;
  private readonly surface: SurfaceQueue;

  /**
   * Isolati senza piu' un lotto libero sul fronte strada.
   *
   * Vale la stessa ragione della blacklist dei siti: ricercare un lotto sul
   * perimetro di un isolato pieno a ogni infornata significherebbe riscorrerlo
   * per sempre. Un candidato che cade qui dentro viene scartato prima ancora di
   * generare uno stamp.
   *
   * **Non e' piu' per sempre.** Da quando un landmark sventra, un isolato pieno
   * puo' tornare ad avere lotti: `onTick` svuota questo insieme con `forget`
   * appena un cantiere porta via qualcosa.
   */
  private readonly fullBlocks = new Set<string>();

  /**
   * Siti bocciati in modo definitivo.
   *
   * Ogni motivo di scarto e' permanente finche' il luogo non cambia: la
   * pendenza di una colonna non cambia e un'impronta non si sposta. Riproporre
   * un sito bocciato significherebbe rifare lo stesso calcolo con lo stesso
   * esito a ogni infornata.
   *
   * **La demolizione e' arrivata**, e con lei il caso che questo commento
   * aspettava: quando un cantiere di landmark porta via degli edifici, `onTick`
   * svuota l'insieme con `forget`, perche' una colonna bocciata perche' occupata
   * adesso puo' essere libera.
   */
  private readonly blacklist = new Set<string>();

  private readonly rejectedCounts = new Array<number>(REJECT_REASONS.length).fill(0);

  /**
   * Infornate fatte: e' il giro da cui `poleRectAt` ricava il polo di turno.
   *
   * Sta qui e non nel modulo che lo legge per la stessa ragione per cui il
   * cursore della passata di upgrade sta nel suo driver: e' lo stato di **chi fa
   * le passate**, e la regola che lo consuma resta pura.
   */
  private buildTurn = 0;

  private placedCount = 0;

  /**
   * Prossima identita' di fila da assegnare.
   *
   * Un contatore e non un hash della posizione: l'identita' di una fila non e' un
   * luogo — la fila cresce, si accosta e si spezza — ed e' l'unica cosa del
   * cluster che non serve a rigenerare niente. Chi entra adotta quella del
   * vicino, quindi questo sale solo quando una fila nuova si apre davvero.
   */
  private nextClusterId = 1;

  /**
   * Membri per fila, e quanti stanno in una fila di almeno due.
   *
   * Serve alla sola statistica, e si tiene incrementale invece di ricavarlo dai
   * record a domanda: contare le file scandendo la citta' sarebbe l'unica cosa
   * nel ciclo il cui costo cresce con il numero di edifici, cioe' esattamente
   * quello che il gate della 4.4 chiede di non fare.
   */
  private readonly clusterSizes = new Map<number, number>();
  private clusteredCount = 0;


  /** Edifici che poggiano su un impalcato in quota invece che sul terreno. */
  private stackedCount = 0;

  /**
   * La rete stradale nasce dal solo seed del mondo: non ha stato, non va
   * salvata e non va passata da fuori. E' la stessa rete per chiunque
   * costruisca su questa isola.
   */
  private readonly streets: StreetNetwork;

  /** Cio' che i driver hanno in mano. Si costruisce una volta e non cambia mai. */
  private readonly ctx: BuildContext;

  private readonly clearance: ClearanceSites;
  private readonly landmarks: LandmarkDriver;
  private readonly spans: SpanDriver;
  private readonly crossings: CrossingDriver;
  private readonly aerial: AerialDriver;
  private readonly guides: GuideDriver;
  private readonly upgrades: UpgradeDriver;
  private readonly ropeways: RopewayDriver;
  private readonly farms: FarmDriver;
  private readonly arcologies: ArcologyDriver;

  constructor(
    private readonly world: VoxelWorld,
    private readonly terrainMap: TerrainMap,
    private readonly worldSeed: number,
    primaryRegion: Region | null = null,
  ) {
    this.streets = new StreetNetwork(worldSeed);
    this.growth = new GrowthQueue(world);
    this.surface = new SurfaceQueue(world, terrainMap, this.streets, this.registryImpl);
    this.ctx = {
      world,
      terrain: terrainMap,
      streets: this.streets,
      registry: this.registryImpl,
      growth: this.growth,
      surface: this.surface,
      seed: worldSeed,
    };
    this.spans = new SpanDriver(this.ctx);
    this.crossings = new CrossingDriver(this.ctx, primaryRegion);
    // Il cantiere ha bisogno delle campate prima di se stesso: sventrando fa
    // cadere quelle che poggiavano su cio' che abbatte. Ed e' **uno solo** per
    // Builder: due liste di cantieri potrebbero condannare lo stesso record e
    // dirlo due volte alla simulazione.
    this.clearance = new ClearanceSites(this.ctx, this.spans);
    this.aerial = new AerialDriver(this.ctx, this.spans);
    this.landmarks = new LandmarkDriver(this.ctx, this.clearance, this.aerial);
    // La guida viene dopo la citta' in quota e le chiede due cose: come vede il
    // luogo, e quali impalcati qualcuno abita. La freccia va in un verso solo —
    // la citta' in quota non sa che la guida esiste.
    this.guides = new GuideDriver(
      this.ctx,
      this.aerial.siteProbe,
      (deckId) => this.aerial.isInhabited(deckId),
    );
    this.upgrades = new UpgradeDriver(this.ctx, this.spans, this.aerial);
    // La funivia non chiede niente a nessuno degli altri, e nessuno chiede
    // niente a lei: due torri a terra e una fune che non e' materia non hanno
    // modo di entrare in conflitto con una campata o con una mensola. E' l'unico
    // driver senza una freccia che entra o che esce.
    this.ropeways = new RopewayDriver(this.ctx);
    // Nemmeno la campagna chiede niente agli altri driver, e per una ragione
    // strutturale: un lotto agricolo non entra negli indici di collisione, quindi
    // non puo' contendere una colonna a nessuno. Legge il registry — per sapere
    // cosa la citta' ha gia' preso — e non ci scrive mai.
    this.farms = new FarmDriver(this.ctx);
    // Ultima, e con due frecce che entrano e nessuna che esce: legge la
    // gerarchia della 4.6 per sapere se la citta' qui e' satura, e il cantiere
    // per farsi spazio. Nessuno degli altri driver sa che le arcologie esistono.
    this.arcologies = new ArcologyDriver(this.ctx, this.clearance, this.aerial);
  }

  /** Sola lettura: nemmeno chi tiene il Builder puo' scrivere nel registry. */
  get registry(): ReadonlyBuildingRegistry {
    return this.registryImpl;
  }

  /**
   * Costruisce il landmark di un catalizzatore, con il suo grembiule attorno.
   *
   * La ricetta, l'orientamento e gli stadi stanno in `landmarkDriver.ts`: qui
   * resta solo la porta, perche' e' il `Builder` che il gioco tiene in mano.
   */
  placeLandmark(x: number, y: number, kind: CatalystId): void {
    this.landmarks.place(x, y, kind);
  }

  /** Registra un territorio esterno su cui la crescita puo' aprire un ponte. */
  registerSecondaryRegion(id: string, region: Region): void {
    this.crossings.register(id, region);
  }

  /**
   * Cosa il riquadro di un landmark troverebbe qui: quanti edifici porta via, o
   * perche' non ci si puo' piantare.
   *
   * La porta del cursore. Sta sul `Builder` e non sul driver perche' e' il
   * `Builder` che il gioco tiene in mano, come gia' per `placeLandmark`.
   */
  landmarkClearance(x: number, y: number, kind: CatalystId): LandmarkSite {
    return this.landmarks.siteAt(x, y, kind);
  }

  /**
   * La facciata che questa colonna offre a un ruolo, o perche' non ne offre una.
   *
   * Stessa porta di `landmarkClearance`, altra domanda: quella chiede cosa il
   * riquadro porterebbe via a terra, questa se fuori da un edificio ci sia posto.
   * Il gioco le fa entrambe prima del click e mostra la sola che si applica —
   * un edificio sotto la colonna esclude l'altra, ed e' il modo in cui lo stesso
   * strumento produce due strutture senza chiedere una scelta in piu'.
   */
  landmarkAloftSite(x: number, y: number, kind: CatalystId): AloftVerdict {
    return this.landmarks.aloftSiteAt(x, y, kind);
  }

  /**
   * La mensola che nascerebbe su questa colonna, o perche' no. Non scrive.
   *
   * La porta del cursore, come `landmarkClearance`: sta sul `Builder` e non sul
   * driver perche' e' il `Builder` che il gioco tiene in mano.
   */
  terraceSite(x: number, y: number): TerraceResult {
    return this.aerial.terraceSite(x, y);
  }

  /** Posa una mensola sull'edificio di questa colonna. La porta del click. */
  placeTerrace(x: number, y: number): boolean {
    return this.aerial.placeTerrace(x, y);
  }

  /**
   * La funivia che partirebbe da questa colonna, o perche' no. Non scrive.
   *
   * Stessa porta di `terraceSite`, altra domanda: quella chiede se una facciata
   * regge un piano, questa se di qua si attraversa.
   */
  ropewaySite(x: number, y: number): RopewayResult {
    return this.ropeways.siteAt(x, y);
  }

  /** Tira una funivia dalla colonna cliccata. La porta del click. */
  placeRopeway(x: number, y: number): boolean {
    return this.ropeways.place(x, y);
  }

  /**
   * Le funi da disegnare e le corse delle cabine.
   *
   * Due liste e non una struttura sola perche' hanno due lettori — la vista e il
   * traffico — e nessuno dei due deve trasformare la lista dell'altro a ogni
   * frame: e' il riferimento stabile a dire «niente da rifare».
   */
  get ropewayCables(): readonly RopewayCable[] {
    return this.ropeways.cables;
  }

  get ropewayRides(): readonly RopewayRide[] {
    return this.ropeways.rides;
  }

  get stats(): BuilderStats {
    return {
      placed: this.placedCount,
      upgraded: this.upgrades.count,
      growing: this.growth.queued,
      rejected: this.rejectedCounts,
      blacklisted: this.blacklist.size,
      surfaceQueued: this.surface.queued,
      clustered: this.clusteredCount,
      spans: this.registryImpl.spanCount,
      spanReach: this.spans.reach(),
      terraces: this.aerial.terraces,
      routes: this.aerial.routes,
      piers: this.aerial.piers,
      lifts: this.guides.lifts,
      ropeways: this.ropeways.count,
      farmPlots: this.farms.count,
      arcologies: this.arcologies.count,
      arcologyRefusal: this.arcologies.refusal,
      stacked: this.stackedCount,
      clearing: this.clearance.open,
      cleared: this.clearance.cleared,
    };
  }

  /** Svuota i siti bocciati. Serve solo se qualcosa rende di nuovo libero il terreno. */
  forget(): void {
    this.blacklist.clear();
    // Un isolato dichiarato pieno lo era rispetto al terreno di allora:
    // un'espansione puo' avergli aggiunto colonne edificabili sul fronte.
    this.fullBlocks.clear();
  }

  /**
   * Materializza gli edifici gia' presenti nello stato caricato o nello scenario.
   *
   * Non richiama `addBuilding`: il chiamante li ha gia' registrati nella
   * simulazione. Li scrive subito invece di animarli, cosi' una partita salvata
   * (e il nucleo della demo) torna visibile prima del primo tick.
   */
  materialize(buildings: readonly Building[]): void {
    for (const building of buildings) {
      this.place({
        x: building.x,
        y: building.y,
        class: building.class,
        mixed: building.mixed,
        level: building.level,
        animate: false,
        state: null,
        // Le coordinate arrivano da una partita gia' giocata: spostarle sul
        // fronte strada sposterebbe edifici che la simulazione conta gia' dove
        // sono, e il salvataggio non tornerebbe piu' uguale a se stesso.
        snapToStreet: false,
      });
    }
  }

  /**
   * Da chiamare dopo ogni tick della simulazione.
   *
   * Restituisce il nuovo stato e ne prende possesso, come ogni operazione che
   * tocca il campo: lo stato passato non va piu' usato.
   */
  onTick(state: SimState): SimState {
    let next = state;
    // **Prima si sgombera, poi si costruisce.** Un cantiere che chiude libera
    // colonne che l'infornata di questo tick puo' gia' usare, e il contrario
    // farebbe aspettare un tick intero a ogni edificio dietro a un landmark.
    const clearedBefore = this.clearance.cleared;
    next = this.clearance.pass(next);
    // Il commento sulla blacklist lo diceva da prima che servisse: «se un giorno
    // arrivera' la demolizione, questo insieme andra' svuotato con `forget`».
    // Un sito bocciato lo era rispetto a una colonna che adesso e' libera.
    if (this.clearance.cleared !== clearedBefore) this.forget();
    if (state.tickCount % BUILDER.ticksPerBuild === 0) next = this.buildPass(next);
    // Il megaprogetto maturo prenota il magazzino prima degli upgrade ordinari.
    // Altrimenti una passata da sessantaquattro torri spenderebbe fino all'ultima
    // unita' disponibile e l'arcologia, pur avendo tutte le condizioni urbane,
    // resterebbe in attesa per sempre per una pura conseguenza dell'ordine.
    if (state.tickCount % ARCOLOGY.ticksPerPass === 0) next = this.arcologies.pass(next);
    if (state.tickCount % BUILDER.ticksPerUpgrade === 0) {
      next = this.upgrades.pass(next);
      next = this.landmarks.pass(next);
    }
    // La rete in quota non legge la simulazione: una campata dipende da dove
    // stanno i tetti, non da quanto una colonna e' desiderabile. E' anche il
    // motivo per cui questa passata non prende ne' restituisce lo stato.
    if (state.tickCount % SPANS.ticksPerPass === 0) this.spans.pass();
    // Il ponte lungo viene dopo le campate locali: prima una citta' costruisce
    // la propria rete, poi uno skyline maturo puo' scavalcare il mare.
    if (state.tickCount % CROSSINGS.automatic.ticksPerPass === 0) this.crossings.pass();
    // E nemmeno la citta' in quota: una mensola dipende da come e' fatta una
    // facciata e un percorso da cosa c'e' fra due edifici, non da quanto una
    // colonna e' desiderabile — per questo nessuna delle due prende ne'
    // restituisce lo stato. Due passate distinte perche' sono due atti urbani
    // distinti — il dettaglio e il collegamento — e vanno a cadenze diverse.
    if (state.tickCount % AERIAL.terrace.ticksPerPass === 0) this.aerial.terracePass();
    if (state.tickCount % AERIAL.route.ticksPerPass === 0) this.aerial.routePass();
    // E la via da terra viene per ultima, perche' serve un impalcato che qualcuno
    // abiti gia': prima si costruisce sopra la citta', poi si guadagna il modo di
    // arrivarci.
    if (state.tickCount % AERIAL.guide.ticksPerPass === 0) this.guides.pass();
    // La campagna per ultima, e a cadenza sua. Dopo la crescita perche' e' la
    // crescita a mangiarsela: valutata prima, un lotto appena coperto dagli
    // edifici di questo tick resterebbe contato come produttore fino al giro
    // dopo, e la citta' rincorrerebbe la fame con un ritardo permanente.
    if (state.tickCount % FARMS.ticksPerPass === 0) next = this.farms.pass(next);
    return setIslandConnections(next, this.crossings.count);
  }

  /**
   * Scrive singoli cubi degli edifici in crescita. Una chiamata per frame.
   *
   * Il costo per frame e' `maxGrowing * voxelsPerFrame` voxel, indipendente da
   * quanto e' grande la citta': e' il motivo per cui le comparse non fanno
   * cadere il frame rate quando gli edifici sono duemila invece di dieci.
   */
  step(): void {
    this.growth.step();
    this.surface.step();
  }

  /** Volumi in coda o in attesa: e' il numero su cui le passate si fermano. */
  private get queued(): number {
    return this.growth.queued;
  }


  // --- Costruzione -----------------------------------------------------------

  /**
   * Un'infornata di costruzioni: prima il polo di turno, poi la citta' intera.
   *
   * **Il turno viene prima, e non e' una preferenza.** La classifica dei
   * candidati e' globale e il punteggio e' assoluto: senza un giro, i posti in
   * lista li prende sempre il nucleo piu' maturo e ogni catalizzatore piantato
   * lontano — o su un'isola — resta senza una casa per sempre. Il perche' per
   * esteso sta in `growthPoles.ts`, che sceglie di chi e' il turno.
   *
   * **Il ripiego globale viene dopo, e non e' un ripensamento.** Un polo il cui
   * quartiere e' finito — niente terreno, niente lotti, tutto costruito — non
   * deve costare all'intera citta' l'infornata del suo turno: cio' che non ha
   * speso lo spende la classifica di sempre, e il ritmo complessivo resta quello
   * tarato su `ticksPerBuild`.
   */
  private buildPass(state: SimState): SimState {
    const wanted = BUILDER.sitesPerBuild;
    const pole = poleRectAt(state.catalysts, this.buildTurn++);

    const turn = pole === null ? null : this.buildRound(state, wanted, pole);
    const after = turn === null ? state : turn.state;
    const left = wanted - (turn === null ? 0 : turn.accepted);
    if (left <= 0) return after;
    return this.buildRound(after, left, undefined).state;
  }

  /**
   * Un giro d'infornata dentro un riquadro, o su tutta la mappa senza.
   *
   * Prende piu' candidati di quanti ne serva perche' la simulazione ragiona per
   * colonna: non sa cosa sia un'impronta, una pendenza o un chunk, quindi una
   * parte dei suoi candidati e' inevitabilmente inutilizzabile.
   */
  private buildRound(
    state: SimState,
    wanted: number,
    within: CellRect | undefined,
  ): BuildRound {
    const sites = nextBuildSites(state, this.terrainMap, wanted * BUILDER.candidateOverfetch, {
      headroomAt: this.aerial.headroomAt,
      within,
    });

    let next = state;
    let accepted = 0;

    for (const site of sites) {
      if (accepted >= wanted) break;
      if (this.queued >= BUILDER.maxGrowing) break;

      const record = this.place({
        x: site.x,
        y: site.y,
        class: site.class,
        mixed: site.mixed === -1 ? undefined : site.mixed,
        animate: true,
        state: next,
        snapToStreet: true,
      });
      if (record === null) continue;

      next = addBuilding(next, simBuilding(record));
      accepted++;
    }

    return { state: next, accepted };
  }

  /**
   * Valida il sito, getta la fondazione, accoda la comparsa. null se il sito
   * non va.
   *
   * **La colonna proposta e' un'indicazione, non un indirizzo.** Con
   * `snapToStreet` il candidato della simulazione designa l'isolato, e
   * l'edificio nasce sul lotto libero del suo perimetro piu' vicino a quella
   * colonna. E' il passaggio che allinea la citta' alle strade senza chiedere
   * niente a `src/sim/`, che continua a ragionare per cella e a non sapere che
   * le strade esistono.
   */
  private place(request: PlaceRequest): BuildingRecord | null {
    const { class: cls, mixed, state } = request;

    let x = request.x;
    let y = request.y;
    let facing: Facing | undefined;
    let footprintCap = MAX_FOOTPRINT;

    if (request.snapToStreet) {
      const lot = this.findLot(request.x, request.y);
      if (lot === null) return null;

      x = lot.x;
      y = lot.y;
      facing = lot.facing;
      footprintCap = lot.footprint;
    } else {
      // Senza lotto l'orientamento si legge comunque dalla rete, quando
      // l'ancora tocca gia' una carreggiata: al portale serve solo quello.
      facing = this.streets.facingOf(request.x, request.y, 1) ?? undefined;
    }

    const key = `${x},${y}`;
    if (this.blacklist.has(key)) return null;

    // **Su quale piano.** Il suolo finche' e' libero — ed e' il caso di ogni
    // edificio finche' nessuno ha costruito niente in quota, quindi il percorso
    // di sempre resta quello di sempre — altrimenti l'impalcato piu' basso che
    // passa di qui. E' questa riga a togliere a «edificabile» il suo essere un
    // bit per colonna, e non una struttura nel campo della simulazione.
    const deck = this.pickDeck(x, y, footprintCap);
    const onGround = deck.kind === 'ground';

    // **In quota il lotto e' l'impalcato.** Non si passa da `findLot`, che
    // risolve la maglia stradale: sopra non c'e' una carreggiata a cui
    // accostarsi, c'e' un riquadro che qualcuno ha costruito, e l'edificio ci
    // sta dentro centrato — cio' che avanza resta terrazza, ed e' esattamente la
    // proporzione delle immagini di riferimento.
    if (deck.rect !== undefined) {
      const side = Math.min(deck.rect.sizeX, deck.rect.sizeY, MAX_FOOTPRINT);
      if (side < MIN_FOOTPRINT) return null;
      x = deck.rect.x + ((deck.rect.sizeX - side) >> 1);
      y = deck.rect.y + ((deck.rect.sizeY - side) >> 1);
      footprintCap = side;
    }

    // Il seme resta quello dell'origine del lotto anche se l'impronta si
    // accosta al fronte piu' avanti: e' il lotto a essere stabile, non
    // l'angolo dell'edificio, e il record se lo porta dietro comunque.
    const seed = hashCoords(this.worldSeed, x, y);
    const profile = state === null ? null : urbanProfileAt(state, x, y);
    const form = formOf(profile);

    // La gerarchia vale anche alla nascita, non solo agli upgrade: in periferia
    // `builtNeighbours` e' basso per definizione, ed e' cosi' che attorno
    // all'edificato resta una corona bassa invece di torri sparse nel prato.
    // In quota vale con la quota gia' spesa scalata dal tetto: una mensola e' il
    // modo in cui la gerarchia sale, non il modo di aggirarla.
    const allowed = allowedLevel(this.ctx, x, y, state, deck.rise);
    if (allowed < 0) return null;
    // Dove il lotto cade dentro l'isolato. In quota non c'e' un isolato a cui
    // appartenere — il lotto **e'** l'impalcato — quindi non c'e' nemmeno un
    // angolo, e le righe che lo chiedono restano fuori.
    const lotRole = onGround
      ? lotRoleOf(this.streets.blockRect(this.streets.blockAt(x, y)), x, y, footprintCap)
      : undefined;
    // **L'angolo cambia forma, non quota**: il ruolo del lotto entra nella scelta
    // della tipologia e non nel livello. Un bonus di livello sull'angolo e' stato
    // provato e tolto — spegneva i montanti della citta' in quota. La misura e il
    // perche' stanno accanto a `BLOCK` in `config.ts`.
    const level = request.level === undefined
      ? Math.min(allowed, startLevel(seed) + localLevelBonus(form))
      : Math.min(BUILDER.maxLevel, Math.max(0, Math.floor(request.level)));
    const typology = selectTypology({
      use: cls,
      mixed,
      level,
      profile,
      coastal: isCoastal(this.terrainMap, x, y),
      lotRole,
    });
    // Lo stile e' del quartiere, non dell'edificio: si chiede all'isolato in cui
    // la colonna cade, e due edifici dello stesso isolato lo ricevono uguale per
    // costruzione. Non e' un tiro e non e' uno stato — vedi `style.ts`.
    const style = styleAt(this.worldSeed, this.streets.blockAt(x, y));
    const drawProfile = styledProfile(typologyProfile(typology), style);
    const draft = generateBuilding({
      class: cls,
      level,
      seed,
      footprintCap,
      footprintFloor: 1,
      form,
      profile: drawProfile,
      shape: typology.shape,
      mixed,
      facing,
    });
    // **Nucleo e inviluppo si separano qui, e da qui in poi non vanno confusi.**
    // `footprint` e' cio' che poggia — lo leggono lotto, opera di terra, fila,
    // decoro e carreggiata — mentre lo stamp puo' essere piu' largo di `over`
    // sopra il marciapiede. Sono lo stesso numero su ogni edificio che non
    // sporge, cioe' su quasi tutti.
    const over = overhangFor(typology.shape, facing);
    const footprint = groundSideOf(draft, over, facing);

    // L'impronta puo' uscire piu' stretta del lotto verificato. La si accosta
    // al fronte invece di lasciarla al centro: un edificio che non tocca la
    // carreggiata legge come arretrato a caso, e il quadrato ridotto sta
    // comunque dentro quello gia' dichiarato libero.
    // Solo chi ha davvero prenotato un lotto largo `footprintCap` puo'
    // scorrere dentro di esso: chi costruisce a coordinate date — una partita
    // salvata — deve restare esattamente dove la simulazione lo conta.
    if (onGround && request.snapToStreet && facing !== undefined && footprint < footprintCap) {
      const slack = footprintCap - footprint;
      if (facing === FACING.east) x += slack;
      else if (facing === FACING.north) y += slack;

      // ...e lungo il fronte si accosta al vicino, con la stessa logica e per la
      // stessa ragione: fra due edifici di una fila un solco da un voxel non
      // legge come separazione, legge come crepa.
      const along = this.snapAlongFrontage(x, y, footprint, facing, slack);
      if (facing === FACING.east || facing === FACING.west) y += along;
      else x += along;
    }

    // **Il terreno si guarda solo se e' lui a reggere.** Sopra un impalcato il
    // piano c'e' gia', ed e' costruito: non c'e' un'opera da progettare, non
    // c'e' una fila a cui accostarsi — le file sono un fatto del fronte strada,
    // che in quota non esiste ancora — e non c'e' decoro da bonificare.
    const plan = onGround ? surveyGrade(this.terrainMap, x, y, footprint) : null;
    if (onGround && plan === null) {
      return this.reject(key, hasUnworkableColumn(this.terrainMap, x, y, footprint)
        ? 'unworkable'
        : 'worksTooTall');
    }

    // A cosa si aggrega questo lotto. La quota che ne esce sostituisce quella
    // del piano proprio: e' l'unico punto in cui un edificio smette di rispondere
    // solo al terreno sotto di se' e comincia a rispondere anche al vicino.
    const terms = plan === null
      ? null
      : this.joinCluster(x, y, footprint, facing, plan, form.density);
    const baseBand = terms?.base ?? 0;

    // Con un corso di base condiviso lo stamp si rigenera: cambia l'altezza
    // della fascia zero e nient'altro — stessa sequenza di PRNG, stessa sagoma.
    // Gira solo dove la fila un basamento ce l'ha davvero, e sta comunque fuori
    // dal ciclo di frame.
    const shaped = baseBand > 0
      ? generateBuilding({
        class: cls,
        level,
        seed,
        footprintCap,
        footprintFloor: 1,
        form,
        profile: drawProfile,
        shape: typology.shape,
        mixed,
        facing,
        baseBandHeight: baseBand,
      })
      : draft;

    const baseZ = terms?.deck ?? deck.z;

    // **Lo sbalzo si negozia prima di rinunciare al posto.** Se a bloccare e' la
    // sola striscia sopra il marciapiede — un'altra sporgenza, una campata —
    // l'edificio ci rinuncia e sale diritto, invece di perdere un lotto buono per
    // dell'aria. E' la stessa mossa di `fitsWider` nell'upgrade.
    //
    // La sagoma che ne esce e' **esattamente** quella che sarebbe uscita se la
    // tipologia non avesse mai chiesto uno sbalzo: `over` allarga il solo filtro
    // di `nextRect`, e le candidate si costruiscono tutte comunque, quindi lo
    // stesso seme consuma gli stessi tiri. `footprint` in particolare e' gia'
    // stato tirato molto prima, e non si muove.
    let overhang = over;
    let stamp = shaped;
    if (overhang > 0) {
      const wide = envelopeOf({ x, y, footprint, overhang, facing });
      if (this.registryImpl.overlaps(wide.x, wide.y, wide.sizeX, baseZ, shaped.sizeZ, wide.sizeY) &&
        !this.registryImpl.overlaps(x, y, footprint, baseZ, shaped.sizeZ)) {
        overhang = 0;
        stamp = generateBuilding({
          class: cls,
          level,
          seed,
          footprintCap,
          footprintFloor: 1,
          form,
          profile: drawProfile,
          shape: { ...typology.shape, overhang: 0 },
          mixed,
          facing,
          baseBandHeight: baseBand > 0 ? baseBand : undefined,
        });
      }
    }

    // L'inviluppo, cioe' cio' che nessun altro puo' attraversare. Su un edificio
    // che non sporge coincide con l'impronta, e queste righe non fanno niente.
    const env = envelopeOf({ x, y, footprint, overhang, facing });
    // Al suolo vince l'edificio: una campata che passa di qui cade invece di
    // impedirlo. Senza, `overlaps` direbbe `occupied` e un ponte toglierebbe un
    // lotto — il contrario esatto di «una campata non prende suolo».
    this.spans.dropIntersecting(env.x, env.y, env.sizeX, env.sizeY, baseZ, baseZ + stamp.sizeZ);
    if (this.registryImpl.overlaps(env.x, env.y, env.sizeX, baseZ, stamp.sizeZ, env.sizeY)) {
      // In quota il rifiuto non e' definitivo: la colonna resta buona al suolo,
      // e a quella soletta ci si potra' riprovare quando il posto si libera.
      // Blacklistarla toglierebbe il lotto a terra per un ingombro di sopra.
      return this.reject(key, 'occupied', plan !== null);
    }
    if (dirtyChunkCount(env.x, env.y, env.sizeX, plan?.footZ ?? baseZ, baseZ + stamp.sizeZ,
      env.sizeY) > BUILDER.maxDirtyChunksPerBuilding) {
      return this.reject(key, 'chunkBudget', plan !== null);
    }

    if (plan !== null) {
      this.surface.clearSiteDecor(x, y, footprint);
      // Il salto che la fila aggiunge sotto il membro e' costruito, non versato:
      // senza questo il dislivello verso il deck verrebbe riempito di stratigrafia
      // di bioma e leggerebbe come terreno nudo invece che come muro. E' lo stesso
      // ritocco che l'upgrade fa gia' sull'anello allargato.
      buildWorks(this.world, this.terrainMap, x, y, footprint, {
        ...plan,
        padZ: baseZ,
        works: baseZ > plan.padZ && plan.works === WORKS.none ? WORKS.terrace : plan.works,
      });
    }

    const record = this.registryImpl.add({
      x,
      y,
      baseZ,
      footprint,
      height: stamp.sizeZ,
      class: cls,
      mixed,
      level,
      seed,
      form,
      typology: typology.id,
      style: style.id,
      // Zero non si scrive, come per `baseBand`: un edificio che non sporge non
      // deve portarsi dietro un campo che dice «non sporgo».
      overhang: overhang > 0 ? overhang : undefined,
      district: profile?.district ?? 'outskirts',
      specialization: profile?.specialization ?? null,
      facing,
      cluster: terms?.id,
      // Zero non si scrive: una fila senza corso di base non deve portarsi
      // dietro un campo che dice "non ne ho uno".
      baseBand: baseBand > 0 ? baseBand : undefined,
    });

    if (request.animate) this.growth.enqueue(record.id, anchorOf(record), stamp);
    else this.growth.writeStamp(anchorOf(record), stamp, 0, stamp.sizeZ, false);
    this.surface.enqueueBlockStreets(this.streets.blockAt(x, y));
    this.placedCount++;
    if (plan === null) {
      this.stackedCount++;
      // Da adesso quell'impalcato non cade piu': togliergli l'ospite sotto
      // sarebbe una demolizione, e demolire non e' nel vocabolario di questo
      // progetto.
      this.aerial.markInhabited(deck.id);
    }
    return record;
  }

  // --- Quote edificabili -----------------------------------------------------

  /**
   * Su quale piano poggia un'impronta larga `side` con l'angolo qui.
   *
   * Il suolo per primo, e finche' e' libero non si guarda oltre: e' cio' che
   * tiene identica la citta' di prima, dove in quota non c'e' niente e questa
   * funzione risponde alla prima riga. Solo su una colonna gia' presa si sale, e
   * si prende **l'impalcato piu' basso** che abbia il volume sopra di se' libero:
   * riempire il secondo livello prima del terzo e' la stessa regola con cui la
   * citta' riempie il suolo prima di alzarsi.
   *
   * **In quota l'impalcato porta il proprio riquadro**, e chi chiama ci sposta
   * dentro il lotto. Il suolo non ne ha uno: li' il lotto l'ha gia' risolto la
   * maglia stradale.
   */
  private pickDeck(x: number, y: number, side: number): BuildDeck {
    const decks = decksAt(this.registryImpl.at(x, y), this.terrainMap.heightAt(x, y));

    for (const deck of decks) {
      if (deck.kind === 'ground') {
        if (!this.groundTaken(x, y, side)) return deck;
        continue;
      }
      // Una cella sola sopra il piano: se e' libera lo e' anche il resto, perche'
      // qualunque volume in quota parte da li'. La collisione vera la fa
      // `overlaps` sull'impronta e sull'altezza definitive.
      if (!this.registryImpl.overlaps(x, y, 1, deck.z, 1)) return deck;
    }
    // Nessun piano libero: torna il suolo, e il rifiuto arriva da `overlaps` con
    // il motivo giusto invece che da qui con un ramo in piu'.
    return decks[0];
  }

  /** true se un edificio prende il suolo di una qualunque colonna dell'impronta. */
  private groundTaken(x: number, y: number, side: number): boolean {
    for (let dy = 0; dy < side; dy++) {
      for (let dx = 0; dx < side; dx++) {
        if (this.registryImpl.isOccupied(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  // --- Aggregazione ----------------------------------------------------------

  /**
   * Di quanto l'impronta scorre lungo il fronte per accostarsi a un vicino.
   *
   * E' la mossa gemella dello scorrimento verso la carreggiata, e nasce dallo
   * stesso scarto: il lotto e' prenotato largo `footprintCap`, l'impronta puo'
   * uscire piu' stretta, e quello che avanza oggi resta prato in mezzo a una
   * fila. Si guarda in giu' fino a `CLUSTER.maxSnap` e in su fino allo scarto
   * disponibile, e vince il vicino piu' vicino; a parita' il basso, per fissare
   * l'ordine.
   *
   * **Il compromesso, dichiarato.** Accostarsi puo' portare l'impronta fuori dal
   * passo di `STREETS.align`, che esiste per non far cadere un edificio a meta'
   * di un cubo di terreno. Dove la citta' e' densa il terreno e' quasi sempre
   * piatto e non costa niente — `planGrade` non chiede opere quando le colonne
   * stanno alla stessa quota; dove e' mosso costa un cubo di riempimento in piu',
   * ed e' meno di quanto costi un solco da un voxel in mezzo a due case in fila.
   */
  private snapAlongFrontage(
    x: number,
    y: number,
    footprint: number,
    facing: Facing,
    slack: number,
  ): number {
    const alongY = facing === FACING.east || facing === FACING.west;
    const occupied = (offset: number): boolean =>
      this.frontageOccupied(x, y, footprint, alongY, offset);

    // Scendere esce dal lotto prenotato, quindi il riquadro dell'isolato torna a
    // essere il limite: senza, accostarsi a un vicino porterebbe l'impronta in
    // mezzo alla carreggiata, che e' esattamente cio' che la 4.1 ha tolto.
    // Salire e' gia' dentro lo scarto del lotto, e non ha bisogno di un tetto.
    const rect = this.streets.blockRect(this.streets.blockAt(x, y));
    const room = alongY ? y - rect.y0 : x - rect.x0;
    const down = Math.min(CLUSTER.maxSnap, Math.max(0, room));

    for (let step = 0; step <= Math.max(down, slack); step++) {
      // Il lato basso per primo: e' l'ordine totale che rende la scelta
      // indipendente da quale vicino il registry ha registrato prima.
      if (step <= down && occupied(-step - 1)) return -step;
      if (step <= slack && occupied(footprint + step)) return step;
    }
    return 0;
  }

  /**
   * true se un edificio copre la colonna a `offset` lungo il fronte.
   *
   * Guarda l'intera sezione dell'impronta e non la sola colonna d'angolo: due
   * edifici in fila condividono il fronte ma non per forza tutta la profondita',
   * e cercare il vicino su una colonna sola lo mancherebbe proprio dove le due
   * impronte sono di misura diversa.
   */
  private frontageOccupied(
    x: number,
    y: number,
    footprint: number,
    alongY: boolean,
    offset: number,
  ): boolean {
    for (let d = 0; d < footprint; d++) {
      const cx = alongY ? x + d : x + offset;
      const cy = alongY ? y + offset : y + d;
      if (this.registryImpl.isOccupied(cx, cy)) return true;
    }
    return false;
  }

  /**
   * Termini della fila a cui questo lotto appartiene, e conteggio dei membri.
   *
   * La regola sta in `cluster.ts` ed e' pura: qui c'e' solo la raccolta dei
   * vicini, che e' l'unica parte che ha bisogno del registry. I due lati del
   * fronte si guardano sempre nello stesso ordine — prima il basso — perche'
   * senza un ordine totale la fila scelta dipenderebbe da quale record il
   * registry ha indicizzato prima.
   */
  private joinCluster(
    x: number,
    y: number,
    footprint: number,
    facing: Facing | undefined,
    plan: GradePlan,
    density: number,
  ): ClusterTerms {
    const neighbours = facing === undefined
      ? EMPTY_TERMS
      : this.frontageTerms(x, y, footprint, facing);

    const terms = planCluster({
      own: plan,
      density,
      neighbours,
      nextId: this.nextClusterId,
    });
    if (terms.id === this.nextClusterId) this.nextClusterId++;

    const size = (this.clusterSizes.get(terms.id) ?? 0) + 1;
    this.clusterSizes.set(terms.id, size);
    // Il secondo membro porta in conto anche il primo: prima di lui la fila era
    // un edificio solo, e un edificio solo non e' una fila.
    if (size === 2) this.clusteredCount += 2;
    else if (size > 2) this.clusteredCount++;

    return terms;
  }

  /** I termini dei vicini di fronte, dal lato basso a quello alto. */
  private frontageTerms(
    x: number,
    y: number,
    footprint: number,
    facing: Facing,
  ): readonly ClusterTerms[] {
    const alongY = facing === FACING.east || facing === FACING.west;
    const out: ClusterTerms[] = [];

    for (const offset of [-1, footprint]) {
      for (let d = 0; d < footprint; d++) {
        const cx = alongY ? x + d : x + offset;
        const cy = alongY ? y + offset : y + d;
        for (const other of this.registryImpl.at(cx, cy)) {
          // Un landmark non entra in fila: ha un altro generatore, cresce di
          // stadio e non di livello, e adottarne la quota darebbe a un isolato
          // il piano di un molo. Un vicino orientato altrove nemmeno — due file
          // che si incontrano su un angolo restano due file.
          if (other.landmark !== undefined) continue;
          if (other.facing !== facing) continue;
          if (other.cluster === undefined) continue;
          if (out.some((terms) => terms.id === other.cluster)) continue;
          out.push({ id: other.cluster, deck: other.baseZ, base: other.baseBand ?? 0 });
        }
      }
    }

    return out;
  }

  /**
   * Lotto libero piu' vicino alla colonna proposta, anche fuori dal suo isolato.
   *
   * **Perche' non basta il proprio isolato.** I candidati della simulazione
   * arrivano ordinati per punteggio, e su un campo saturo — dove interi
   * quartieri toccano il massimo — a decidere e' il criterio di parita', cioe'
   * `x` e poi `y`. Il risultato e' che la simulazione ripropone all'infinito lo
   * stesso pugno di colonne nell'angolo minimo dell'area satura. Finche' quel
   * primo isolato aveva posto la citta' cresceva; appena si riempiva, ogni
   * infornata successiva ricadeva su un isolato gia' dichiarato pieno e la
   * crescita si fermava del tutto — quattordici edifici su un'isola intera.
   *
   * La colonna proposta designa quindi **un luogo, non un isolato**: se il suo
   * e' pieno si cerca in quelli attorno, dal piu' vicino al piu' lontano. Lo
   * scarto resta limitato dal raggio in isolati, cioe' da poche decine di
   * colonne: abbastanza per non fermarsi, troppo poco perche' un edificio nasca
   * dove la desiderabilita' non lo voleva.
   */
  private findLot(x: number, y: number): Lot | null {
    const origin = this.streets.blockAt(x, y);

    for (let radius = 0; radius <= BUILDER.blockSearchRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          // Solo il bordo dell'anello: l'interno l'hanno gia' visto i raggi
          // precedenti, e ripassarlo costerebbe una `placeLot` per niente.
          if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

          const block = { kx: origin.kx + dx, ky: origin.ky + dy };
          const key = this.streets.keyOf(block);
          if (this.fullBlocks.has(key)) continue;

          const lot = placeLot({
            rect: this.streets.blockRect(block),
            x,
            y,
            footprint: MAX_FOOTPRINT,
            accepts: (lx, ly, side) => this.lotIsFree(lx, ly, side),
          });
          if (lot !== null) return lot;
          this.fullBlocks.add(key);
        }
      }
    }

    return null;
  }




  // --- Scrittura -------------------------------------------------------------

  // --- Superficie urbana ----------------------------------------------------

  /** Tipologia registrata di un edificio, o quella di ripiego del suo uso. */

  /**
   * true se il quadrato e' libero, edificabile e non gia' bocciato.
   *
   * E' il predicato con cui `placeLot` scorre un fronte, quindi viene chiamato
   * molte volte per candidato: fa solo letture per colonna — `TerrainMap` e
   * registry — e non genera niente. La pendenza **non** si controlla qui: la
   * verifica `surveyGround` a valle, e un lotto bocciato per pendenza finisce
   * nella blacklist, che questa funzione consulta al giro dopo.
   */
  private lotIsFree(x: number, y: number, footprint: number): boolean {
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        // Letture senza allocazione: `columnAt` costruirebbe un oggetto e
        // `at` un array di record per ogni colonna, e qui le colonne si
        // contano a migliaia per infornata.
        // **Il suolo preso non chiude piu' la colonna per sempre.** Se sopra
        // corre una soletta il lotto esiste ancora, una quota piu' su: e' la
        // seconda delle tre assunzioni di colonna che la 4.9 rompe. La domanda
        // in piu' si paga solo su questo ramo — cioe' sulle sole colonne gia'
        // costruite — quindi una citta' senza piattaforme costa quello di prima.
        if (this.registryImpl.isOccupied(cx, cy) && !this.aerial.hasDeck(cx, cy)) {
          return false;
        }
        // Dalla 4.2 la battigia e il fianco in pendenza sono lotti come gli
        // altri: costano un'opera, non un rifiuto. Restano fuori solo la roccia
        // e l'acqua troppo profonda per una banchina.
        if (groundKindAt(this.terrainMap, cx, cy) === GROUND.refused) return false;
        // E l'acqua che una banchina reggerebbe ma che nessuno vorrebbe
        // edificata: un lotto al largo poggia su un pad isolato in mezzo al
        // mare, che e' lo stesso difetto dell'anello di carreggiata.
        if (!nearLand(this.terrainMap, cx, cy)) return false;
        if (this.blacklist.has(`${cx},${cy}`)) return false;
      }
    }
    return true;
  }

  /**
   * Conta uno scarto, e di norma lo rende definitivo.
   *
   * `permanent` a false esiste per una sola situazione, ed e' la 4.9: un
   * candidato in quota che non entra dice qualcosa sulla **soletta**, non sulla
   * colonna. Blacklistarla toglierebbe per sempre un lotto a terra per via di un
   * ingombro che sta trenta voxel piu' su.
   */
  private reject(key: string, reason: RejectReason, permanent = true): null {
    if (permanent) this.blacklist.add(key);
    this.rejectedCounts[REJECT_REASONS.indexOf(reason)]++;
    return null;
  }
}

/** Nessun vicino: chi costruisce a coordinate date non ha un fronte da guardare. */
const EMPTY_TERMS: readonly ClusterTerms[] = [];

/** Cosa un giro d'infornata lascia: lo stato nuovo e quanto ha speso del budget. */
interface BuildRound {
  readonly state: SimState;
  readonly accepted: number;
}

/** Cosa serve al Builder per valutare un sito. */
interface PlaceRequest {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
  readonly mixed?: BuildingClass;
  /** Livello gia' salvato; assente per una costruzione nuova. */
  readonly level?: number;
  readonly animate: boolean;
  /** Senza stato non c'e' profilo locale: le tipologie condizionate restano fuori. */
  readonly state: SimState | null;
  /**
   * Se true la colonna proposta designa l'isolato e l'edificio nasce sul suo
   * fronte strada. Chi ha gia' delle coordinate vere — una partita salvata —
   * lo lascia a false e costruisce esattamente li'.
   */
  readonly snapToStreet: boolean;
}

