import {
  addBuilding,
  BALANCE,
  isDecayArmed,
  nextBuildSites,
  setIslandConnections,
  urbanProfileAt,
  type Building,
  type BuildingClass,
  type BuildSite,
  type CatalystId,
  type CellRect,
  type SimState,
} from '../../sim';
import { columnKey } from '../chunkCoords';
import { dirtyChunkCount, fitsChunkBudget } from './chunkBudget';
import { buildStamp } from './assemble';
import { poleRectAt } from './growthPoles';
import {
  hasUnworkableColumn,
  isCoastal,
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
import type { ArcologyStanding } from '../arcology/prospect';
import type { ArcologyDriverRefusal } from './arcologyDriver';
import { ArcologyDriver } from './arcologyDriver';
import { ClearanceSites, type ClearanceVerdict } from './clearanceSite';
import { SpanDriver } from './spanDriver';
import { AerialDriver } from './aerialDriver';
import { GuideDriver } from './guideDriver';
import { UpgradeDriver } from './upgradeDriver';
import { ArchDriver } from './archDriver';
import { FusionDriver } from './fusionDriver';
import { DecayDriver } from './decayDriver';
import { FarmDriver } from './farmDriver';
import { FARMS } from '../farms/config';
import { HarborDriver } from './harborDriver';
import { HARBOR } from '../harbor/config';
import type { FarmPlot } from '../farms/plotPlan';
import {
  RopewayDriver,
  type RopewayCable,
  type RopewayPlacement,
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
  ARCH,
  BUILDER,
  FUSION,
  MAX_FOOTPRINT,
  MIN_FOOTPRINT,
  typologyById,
} from './config';
import { startLevel } from './generate';
import { selectTypology, typologyProfile } from './typology';
import { styleAt, styledProfile } from './style';
import { lotRoleOf } from './blockForm';
import { envelopeOf } from './BuildingRegistry';
import { groundSideOf, overhangFor } from './generate';
import { recordStamp } from './recordStamp';
import { GrowthQueue, anchorOf } from './growthQueue';
import { LotSearch } from './lotSearch';
import { Frontage } from './frontage';
import { SurfaceQueue } from './surfaceQueue';
import { RoadDriver } from './roadDriver';
import { ROADS } from '../roads/config';
import type { RoadNetwork } from '../roads/RoadNetwork';
import { StreetNetwork } from '../streets/StreetNetwork';
import { FACING, type BlockId, type Facing } from '../streets/streetGrid';
import { SPANS } from '../spans/config';
import { AERIAL } from '../aerial/config';
import type { AerialFace, TerraceResult } from '../aerial/terracePlan';
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
   * Lo stesso rifiuto **con i numeri dentro**, piu' la quota che la citta' ammette.
   *
   * `arcologyRefusal` risponde a chi guarda l'overlay — «la condizione e'
   * insoddisfacibile?» — e per quella domanda un enum basta. Al giocatore serve
   * l'altra, «ci stiamo arrivando?», e `notCapped` non distingue `1/2` da `0/2`:
   * sono due partite diverse, e finora l'interfaccia non aveva modo di dirlo.
   */
  readonly arcology: ArcologyStanding;
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

  /**
   * Edifici che il declino ha portato via da inizio partita.
   *
   * **Non e' `cleared`**, ed e' la distinzione che serve: quello conta tutto
   * cio' che un cantiere ha sgomberato — un monumento che si fa posto, la gomma
   * del giocatore — cioe' demolizioni *volute*. Questo conta solo quelle che
   * nessuno ha voluto, ed e' l'unico numero da cui l'HUD puo' dire che la citta'
   * sta arretrando invece che cambiando.
   */
  readonly abandoned: number;
}

export class Builder {
  private readonly registryImpl = new BuildingRegistry();
  private readonly growth: GrowthQueue;
  private readonly surface: SurfaceQueue;

  /**
   * Dove c'e' posto: la ricerca del lotto con i suoi memo e i siti bocciati.
   *
   * Sta in `lotSearch.ts` perche' ha uno stato tutto suo che nessun'altra parte
   * del ciclo legge, e perche' e' l'unica porta di «questa colonna e' libera?»:
   * tre memorie con tre scadenze diverse divergerebbero se si potesse
   * consultarne una senza le altre.
   */
  private readonly lots: LotSearch;

  /** Il fronte strada: chi ha accanto un lotto, e a quale fila appartiene. */
  private readonly frontage: Frontage;

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
  private readonly arches: ArchDriver;
  private readonly fusions: FusionDriver;
  private readonly decay: DecayDriver;
  private readonly ropeways: RopewayDriver;
  private readonly farms: FarmDriver;
  private readonly harbors: HarborDriver;
  private readonly arcologies: ArcologyDriver;
  private readonly roadNetwork: RoadDriver;

  constructor(
    world: VoxelWorld,
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
    // Il tracciato non ha bisogno di nessun altro driver e nessun altro driver
    // ha bisogno di lui: legge terreno e occupazione, e scrive solo sulla coda
    // di superficie. E' anche il motivo per cui puo' stare qui in cima.
    this.roadNetwork = new RoadDriver(this.ctx);
    // Il cantiere ha bisogno delle campate prima di se stesso: sventrando fa
    // cadere quelle che poggiavano su cio' che abbatte. Ed e' **uno solo** per
    // Builder: due liste di cantieri potrebbero condannare lo stesso record e
    // dirlo due volte alla simulazione.
    this.clearance = new ClearanceSites(this.ctx, this.spans);
    this.aerial = new AerialDriver(this.ctx, this.spans);
    // La ricerca del lotto viene dopo la citta' in quota perche' le chiede due
    // cose sole — se sopra una colonna presa corre una soletta, e quante ne sono
    // nate — e nient'altro: la freccia va in un verso solo.
    // Il driver *e'* la sonda del tracciato: passa lui e non `network`, cosi'
    // la ricerca vede le tre domande che le servono e non la rete intera.
    this.lots = new LotSearch(this.ctx, this.aerial, this.roadNetwork);
    this.frontage = new Frontage(this.ctx);
    this.landmarks = new LandmarkDriver(this.ctx, this.clearance, this.aerial);
    // La guida viene dopo la citta' in quota e le chiede due cose: come vede il
    // luogo, e quali impalcati qualcuno abita. La freccia va in un verso solo —
    // la citta' in quota non sa che la guida esiste.
    this.guides = new GuideDriver(
      this.ctx,
      this.aerial.siteProbe,
      (deckId) => this.aerial.isInhabited(deckId),
    );
    this.upgrades = new UpgradeDriver(
      this.ctx,
      this.spans,
      this.aerial,
      (x, y) => this.roadNetwork.carries(x, y),
    );
    // La campata dell'edificio non chiede niente agli altri driver, ed e' la
    // conseguenza di cosa e': un braccio e' massa di due record che esistono
    // gia', quindi non ha appoggi da registrare ne' una rete da tenere. Le basta
    // il registry per sapere che il volume fuori dall'impronta e' aria.
    this.arches = new ArchDriver(this.ctx);
    // La fusione chiede le due cose che servono a togliere di mezzo un vicino
    // senza scriversi una seconda demolizione: il cantiere di sgombero, che e'
    // l'unico percorso di rimozione del progetto, e le campate, che cadono
    // davanti a un volume che cresce come gia' cadono davanti a una promozione.
    this.fusions = new FusionDriver(this.ctx, this.clearance, this.spans);
    // Il declino non chiede niente agli altri driver: gli bastano il registry —
    // per sapere chi e' un edificio ordinario e chi porta qualcosa in quota — e
    // il cantiere di sgombero, che e' l'unico percorso di rimozione che esista.
    this.decay = new DecayDriver(this.ctx, this.clearance);
    // La funivia non chiede niente a nessuno degli altri driver: due torri a
    // terra e una fune che non e' materia non hanno modo di entrare in
    // conflitto con una campata o con una mensola. Le serve pero' il cantiere,
    // perche' le due rive che si guardano sono anche le prime che la citta'
    // costruisce, e una piazzola deve poter sgomberare il lungomare.
    this.ropeways = new RopewayDriver(this.ctx, this.clearance);
    // Nemmeno la campagna chiede niente agli altri driver, e per una ragione
    // strutturale: un lotto agricolo non entra negli indici di collisione, quindi
    // non puo' contendere una colonna a nessuno. Legge il registry — per sapere
    // cosa la citta' ha gia' preso — e non ci scrive mai.
    this.farms = new FarmDriver(this.ctx);
    // Il distretto costiero vive come la campagna: legge il registry — i
    // record dei landmark e il loro stadio — e non ci scrive mai. Le sue opere
    // viaggiano sulle code di sempre, e i suoi edifici li fa nascere la
    // macchina ordinaria del Builder quando glieli chiede in infornata.
    this.harbors = new HarborDriver(this.ctx);
    // Ultima, e con due frecce che entrano e nessuna che esce: legge la
    // gerarchia della 4.6 per sapere se la citta' qui e' satura, e il cantiere
    // per farsi spazio. Nessuno degli altri driver sa che le arcologie esistono.
    this.arcologies = new ArcologyDriver(this.ctx, this.clearance, this.aerial);
  }

  /** Sola lettura: nemmeno chi tiene il Builder puo' scrivere nel registry. */
  get registry(): ReadonlyBuildingRegistry {
    return this.registryImpl;
  }

  /** I lotti agricoli vivi, per la vista informativa del cibo. */
  get farmPlots(): readonly FarmPlot[] {
    return [...this.farms.registry.all];
  }

  /**
   * Costruisce il landmark di un catalizzatore, con il suo grembiule attorno.
   *
   * La ricetta, l'orientamento e gli stadi stanno in `landmarkDriver.ts`: qui
   * resta solo la porta, perche' e' il `Builder` che il gioco tiene in mano.
   */
  placeLandmark(
    x: number,
    y: number,
    kind: CatalystId,
    aloft?: boolean,
    preferred?: AerialFace,
  ): void {
    this.landmarks.place(x, y, kind, aloft, preferred);
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
  landmarkClearance(
    x: number,
    y: number,
    kind: CatalystId,
    aloft?: boolean,
    preferred?: AerialFace,
  ): LandmarkSite {
    return this.landmarks.siteAt(x, y, kind, aloft, preferred);
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
  landmarkAloftSite(x: number, y: number, kind: CatalystId, preferred?: AerialFace): AloftVerdict {
    return this.landmarks.aloftSiteAt(x, y, kind, preferred);
  }

  /**
   * Cosa la gomma porterebbe via dal riquadro, senza toccare niente.
   *
   * La porta del cursore dello strumento di demolizione. E' la stessa domanda
   * che fa il click — `clearance.survey` con la regola della gomma — quindi il
   * conteggio che il giocatore legge prima del rilascio e' quello che accade.
   */
  demolishSurvey(x: number, y: number, sizeX: number, sizeY: number): ClearanceVerdict {
    return this.clearance.survey(
      { x, y, sizeX, sizeY },
      BALANCE.gameplay.demolition.clearing,
    );
  }

  /**
   * I record che la gomma porterebbe via, e quelli che le restano in mezzo.
   *
   * La porta dell'anteprima: il giocatore vede **quali** edifici cadranno
   * (rossi) e quali strutture la fermano (ambra) invece del solo conteggio.
   */
  demolishPreview(x: number, y: number, sizeX: number, sizeY: number): {
    readonly doomed: readonly BuildingRecord[];
    readonly protected: readonly BuildingRecord[];
  } {
    return this.clearance.preview(
      { x, y, sizeX, sizeY },
      BALANCE.gameplay.demolition.clearing,
    );
  }

  /**
   * Apre il cantiere di demolizione sul riquadro, a budget, senza recinto e
   * annullabile.
   *
   * E' lo stesso `ClearanceSites` dei landmark e delle arcologie — stessa coda
   * di comparsa, stesse campate che cadono con i loro appoggi, stessa resa del
   * conto alla simulazione — ma senza una struttura in arrivo: il riquadro resta
   * prato rasato, e la prenotazione cade appena l'ultimo condannato sparisce.
   */
  demolish(x: number, y: number, sizeX: number, sizeY: number): boolean {
    return this.clearance.start(
      { x, y, sizeX, sizeY },
      BALANCE.gameplay.demolition.clearing,
      () => {},
      { fence: false, undoable: true },
    );
  }

  /**
   * Annulla l'ultima passata della gomma, ricostruendo cio' che stava cadendo.
   *
   * Restituisce il nuovo stato — gli edifici gia' rimossi tornano alla
   * simulazione — e quanti condannati sono stati ricostruiti. Zero quando non
   * c'e' nessun cantiere di demolizione aperto.
   */
  undoDemolition(state: SimState): { readonly state: SimState; readonly restored: number } {
    return this.clearance.undo(state);
  }

  /**
   * La mensola che nascerebbe su questa colonna, o perche' no. Non scrive.
   *
   * La porta del cursore, come `landmarkClearance`: sta sul `Builder` e non sul
   * driver perche' e' il `Builder` che il gioco tiene in mano.
   */
  terraceSite(x: number, y: number, preferred?: AerialFace): TerraceResult {
    return this.aerial.terraceSite(x, y, preferred);
  }

  /** Posa una mensola sull'edificio di questa colonna. La porta del click. */
  placeTerrace(x: number, y: number, preferred?: AerialFace): boolean {
    return this.aerial.placeTerrace(x, y, preferred);
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

  /**
   * Tira una funivia dalla colonna cliccata. La porta del click.
   *
   * `'clearing'` non e' un mezzo si': la linea e' decisa e i due riquadri sono
   * prenotati: mancano solo i voxel del lungomare che il cantiere sta portando
   * via.
   */
  placeRopeway(x: number, y: number): RopewayPlacement {
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
      blacklisted: this.lots.blacklisted,
      surfaceQueued: this.surface.queued,
      clustered: this.frontage.clustered,
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
      arcology: this.arcologies.standing,
      stacked: this.stackedCount,
      clearing: this.clearance.open,
      cleared: this.clearance.cleared,
      abandoned: this.decay.count,
    };
  }

  /** Svuota i siti bocciati. Serve solo se qualcosa rende di nuovo libero il terreno. */
  forget(): void {
    this.lots.forget();
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
        chooseLot: false,
      });
    }
  }

  /**
   * Rimette in piedi una citta' salvata: i record tornano nel registry e i loro
   * voxel nel mondo.
   *
   * **Non passa da `place`, e non e' una scorciatoia.** `place` decide *dove* si
   * costruisce — lotto sul fronte strada, opera di terra, fila, sbalzo,
   * tipologia del luogo — e qui non c'e' niente da decidere: il posto e' quello
   * che il record dichiara, e ogni scelta rifatta adesso sarebbe una citta'
   * diversa da quella salvata. Si ridisegna e basta, con `recordStamp`, che e'
   * la funzione nata per rigenerare una sagoma scritta mille tick fa.
   *
   * **Subito, non a comparsa.** Una partita caricata e' gia' costruita: farla
   * crescere davanti a chi la riapre vorrebbe dire mostrargli un cantiere al
   * posto della sua citta'. Il costo si paga dentro la finestra di caricamento,
   * dove il budget per frame e' gia' largo.
   *
   * I record arrivano in ordine di id — lo garantisce `readSave` — perche' e'
   * l'ordine in cui `adopt` ritrova gli appoggi gia' dentro.
   */
  restore(records: readonly BuildingRecord[]): void {
    const blocks = new Map<string, BlockId>();

    for (const record of records) {
      // Un id gia' preso vuol dire file malformato: si lascia cadere invece di
      // sovrascrivere, che lascerebbe gli indici pieni del record di prima.
      if (this.registryImpl.get(record.id) !== null) continue;
      this.registryImpl.restore(record);

      // **Il pozzo prima della sagoma.** Un earthscraper vive in un vuoto che il
      // file non contiene — terreno e strade si rifanno dal seme — quindi al
      // caricamento la roccia e' tornata dov'era. Riaprirlo dopo aver scritto la
      // struttura la porterebbe via insieme al terreno: lo scavo cancella tutto
      // cio' che trova nell'imbuto. Su ogni altro record e' un `return` immediato.
      this.arcologies.reopenPit(record);

      const stamp = recordStamp(record);
      if (stamp.sizeZ > 0) {
        this.growth.writeStamp(anchorOf(record), stamp, 0, stamp.sizeZ, false);
      }

      // Le strade dell'isolato una volta sola: la coda di superficie le
      // ridipinge per isolato, e chiederlo per ogni edificio significherebbe
      // rifare lo stesso isolato una volta per casa che ci sta dentro.
      const block = this.streets.blockAt(record.x, record.y);
      blocks.set(`${block.kx},${block.ky}`, block);

      this.countRestored(record);
    }

    for (const block of blocks.values()) this.surface.enqueueBlockStreets(block);

    // I due driver che tengono un indice proprio oltre al registry lo
    // ricostruiscono da cio' che e' appena rientrato. Gli altri non ne hanno
    // bisogno: il distretto costiero riparte da stadio zero e replica gli stadi
    // del landmark da solo, e la campagna ripianta.
    //
    // **Le arcologie per prime**: le loro piazzole sono record in quota, e
    // nascono qui. Nell'ordine opposto la citta' in quota indicizzerebbe le
    // colonne prima che quelle piazzole esistano, e sopra un'arcologia caricata
    // non si potrebbe piu' costruire.
    this.arcologies.adopt();
    this.aerial.adopt();
  }

  /**
   * Rimette i contatori del Builder al passo con cio' che e' stato adottato.
   *
   * Sono statistiche e non stato di gioco, ma nascono a zero a ogni costruttore:
   * senza questa riga una citta' caricata direbbe «zero edifici costruiti»
   * nell'overlay, e le identita' di fila ripartirebbero da uno — il perche' sta
   * in `Frontage.adopt`.
   */
  private countRestored(record: BuildingRecord): void {
    this.placedCount++;
    if (record.supports !== undefined && record.aerial === undefined &&
      record.span === undefined && record.aloft !== true) {
      this.stackedCount++;
    }

    const cluster = record.cluster;
    if (cluster === undefined) return;
    this.frontage.adopt(cluster);
  }

  /**
   * Da chiamare dopo ogni tick della simulazione.
   *
   * Restituisce il nuovo stato e ne prende possesso, come ogni operazione che
   * tocca il campo: lo stato passato non va piu' usato.
   */
  onTick(state: SimState): SimState {
    let next = state;
    // **Il tracciato prima di tutto**, e non e' l'ordine di comodo: i candidati
    // di questo tick si ordinano per distanza dalla carreggiata, e con l'ordine
    // opposto un catalizzatore appena piantato farebbe nascere il proprio primo
    // quartiere sulla rete di prima. Non fa quasi mai niente — `update`
    // confronta una firma — ed e' per questo che puo' stare in cima.
    this.roadNetwork.onTick(state.catalysts);
    // **Prima si sgombera, poi si costruisce.** Un cantiere che chiude libera
    // colonne che l'infornata di questo tick puo' gia' usare, e il contrario
    // farebbe aspettare un tick intero a ogni edificio dietro a un landmark.
    const clearedBefore = this.clearance.cleared;
    next = this.clearance.pass(next);
    // Il commento sulla blacklist lo diceva da prima che servisse: «se un giorno
    // arrivera' la demolizione, questo insieme andra' svuotato con `forget`».
    // Un sito bocciato lo era rispetto a una colonna che adesso e' libera.
    if (this.clearance.cleared !== clearedBefore) this.forget();
    // **Il declino prima della crescita, e non e' l'ordine di comodo.** Una
    // colonna appena liberata torna candidata subito — e' vuota, ed e' anche
    // appena diventata piu' desiderabile, perche' l'edificio che se n'e' andato
    // portava via la propria congestione. Con l'ordine opposto la citta'
    // ricostruirebbe nel punto in cui ha appena rinunciato, un tick dopo l'altro.
    // A impedirlo davvero e' il fronte dentro `buildPass`; questo ordine e' la
    // seconda meta' della stessa risposta.
    if (state.tickCount % BUILDER.ticksPerDecay === 0) this.decay.pass(next);
    if (state.tickCount % BUILDER.ticksPerBuild === 0) next = this.buildPass(next);
    // Il megaprogetto maturo prenota il magazzino prima degli upgrade ordinari.
    // Altrimenti una passata da sessantaquattro torri spenderebbe fino all'ultima
    // unita' disponibile e l'arcologia, pur avendo tutte le condizioni urbane,
    // resterebbe in attesa per sempre per una pura conseguenza dell'ordine.
    if (state.tickCount % ARCOLOGY.ticksPerPass === 0) next = this.arcologies.pass(next);
    if (state.tickCount % BUILDER.ticksPerUpgrade === 0) {
      // I landmark hanno gia' soddisfatto una soglia urbana e prendono il
      // proprio posto prima degli upgrade ordinari. In una citta' matura questi
      // ultimi riempiono `maxGrowing` a ogni giro: eseguiti per primi potevano
      // affamare per sempre un landmark anche con decine di edifici nel raggio.
      next = this.landmarks.pass(next);
      next = this.upgrades.pass(next);
    }
    // **La fusione dopo la promozione, e non e' l'ordine di comodo.** Il lato
    // che l'isolato concede dipende dal livello raggiunto: valutata prima,
    // leggerebbe il gradino d'impronta di un tick fa e proporrebbe di prendersi
    // il vicino a un edificio che questo stesso tick avrebbe allargato da solo,
    // sul prato, senza portare via niente a nessuno.
    if (state.tickCount % FUSION.ticksPerPass === 0) next = this.fusions.pass(next);
    // Il distretto costiero segue i landmark, e a cadenza propria: lo stadio
    // che il quartiere ha appena meritato e' anche l'anello che il fronte si
    // prende, ma non c'e' fretta — le opere viaggiano sulle code di sempre.
    if (state.tickCount % HARBOR.ticksPerPass === 0) this.harbors.pass();
    // La rete in quota non legge la simulazione: una campata dipende da dove
    // stanno i tetti, non da quanto una colonna e' desiderabile. E' anche il
    // motivo per cui questa passata non prende ne' restituisce lo stato.
    // **Prima l'arco, poi il ponte.** Le due passate guardano lo stesso vuoto e
    // la prima che arriva se lo prende: dando la precedenza alla campata di
    // `spans/`, un ponte occuperebbe la quota di fascia su cui i due corpi si
    // sarebbero incontrati e l'arco non nascerebbe mai. L'ordine opposto non ha
    // il difetto speculare — un arco esiste solo dove le due fasce coincidono,
    // che e' raro, e ovunque non coincidano il ponte trova il vuoto libero.
    if (state.tickCount % ARCH.ticksPerPass === 0) this.arches.pass();
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
    // **Una citta' che non serve quello che ha non fonda altro.** E' il fronte
    // del declino letto dall'altro lato: prima la crescita si ferma, poi la
    // citta' arretra, e si riparte solo quando la copertura rientra. Senza
    // questa riga l'abbandono sarebbe churn — la stessa colonna liberata e
    // ricostruita a ogni infornata, perche' togliere un edificio *alza* la
    // desiderabilita' dei vicini invece di abbassarla.
    if (isDecayArmed(state)) return state;

    const wanted = BUILDER.sitesPerBuild;
    // Da qui alla fine del metodo niente rende libera una colonna che era presa:
    // e' la finestra in cui il memo della ricerca e' esatto.
    this.lots.beginPass();

    // **Il distretto costiero viene prima del polo di turno.** E' un rivolo
    // — un edificio per infornata, al massimo — e senza la precedenza si
    // perderebbe in fondo alla coda dei siti: il quartiere che il landmark
    // deve creare resterebbe una promessa mentre la citta' cresce altrove.
    let next = state;
    let placed = 0;
    for (const site of this.harbors.drainSites(HARBOR.sitesPerPass)) {
      if (placed >= wanted || this.queued >= BUILDER.maxGrowing) break;
      const record = this.place({
        x: site.x,
        y: site.y,
        class: site.class,
        animate: true,
        state: next,
        chooseLot: true,
      });
      if (record === null) continue;
      next = addBuilding(next, simBuilding(record));
      placed++;
    }

    const pole = poleRectAt(next.catalysts, this.buildTurn++);

    const turn = pole === null ? null : this.buildRound(next, wanted - placed, pole);
    const after = turn === null ? next : turn.state;
    const left = wanted - placed - (turn === null ? 0 : turn.accepted);
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
    const sites = this.byFrontage(
      nextBuildSites(state, this.terrainMap, wanted * BUILDER.candidateOverfetch, {
        headroomAt: this.aerial.headroomAt,
        within,
      }),
    );

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
        chooseLot: true,
      });
      if (record === null) continue;

      next = addBuilding(next, simBuilding(record));
      accepted++;
    }

    return { state: next, accepted };
  }

  /**
   * Gli stessi candidati, chi sta sulla strada per primo.
   *
   * **Una preferenza e non un rifiuto**, ed e' la differenza che si vede: un
   * gate scarterebbe ogni colonna lontana dalla carreggiata e la citta'
   * nascerebbe a nastri con dei vuoti netti in mezzo, che e' un difetto quanto
   * il tappeto di prima. Riordinando, la stessa infornata prende prima cio' che
   * ha un affaccio e ripiega sul resto quando il fronte e' pieno: il tessuto si
   * addensa lungo le strade e si dirada allontanandosene, senza che nessuno
   * disegni il confine.
   *
   * L'ordinamento e' stabile e la distanza e' tagliata a `frontageReach`, quindi
   * fra due candidati ugualmente lontani decide ancora la desiderabilita': la
   * classifica della simulazione resta quella, e questo e' un criterio in piu' a
   * monte, non uno al posto suo.
   */
  private byFrontage(sites: readonly BuildSite[]): readonly BuildSite[] {
    const roads = this.roadNetwork.network;
    if (!roads.hasAnyRoad) return sites;

    const ranked = sites.map((site) => ({
      site,
      distance: roads.distanceToRoad(site.x, site.y, ROADS.frontageReach),
    }));
    ranked.sort((a, b) => a.distance - b.distance);
    return ranked.map((entry) => entry.site);
  }

  /** Il tracciato: dove passano le strade, per chi deve saperlo da fuori. */
  get roads(): RoadNetwork {
    return this.roadNetwork.network;
  }

  /**
   * Valida il sito, getta la fondazione, accoda la comparsa. null se il sito
   * non va.
   *
   * **La colonna proposta resta il centro della ricerca.** Con `chooseLot` il
   * candidato della simulazione viene adattato a impronta, terreno e occupazione
   * in uno spazio continuo che attraversa la maglia, ma non viene riscritto come
   * un indirizzo sul perimetro. E' il passaggio che conserva la crescita radiale
   * dei landmark senza chiedere a `src/sim/` di conoscere lotti o strade.
   */
  private place(request: PlaceRequest): BuildingRecord | null {
    const { class: cls, mixed, state } = request;

    let x = request.x;
    let y = request.y;
    let facing: Facing | undefined;
    let footprintCap = MAX_FOOTPRINT;

    if (request.chooseLot) {
      if (state === null) return null;
      const lot = this.lots.findLot(request.x, request.y);
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

    const key = columnKey(x, y);
    if (this.lots.isBanned(key)) return null;

    // **Su quale piano.** Il suolo finche' e' libero — ed e' il caso di ogni
    // edificio finche' nessuno ha costruito niente in quota, quindi il percorso
    // di sempre resta quello di sempre — altrimenti l'impalcato piu' basso che
    // passa di qui. E' questa riga a togliere a «edificabile» il suo essere un
    // bit per colonna, e non una struttura nel campo della simulazione.
    const deck = this.lots.pickDeck(x, y, footprintCap);
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

    // Il seme resta quello dell'origine del lotto anche se l'impronta finale si
    // assesta dentro lo spazio prenotato: e' il lotto a essere stabile, non il
    // singolo voxel candidato, e il record se lo porta dietro comunque.
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
    const roleRect = this.streets.blockRect(this.streets.blockAt(x, y));
    const insideRoleRect = x >= roleRect.x0 && y >= roleRect.y0 &&
      x + footprintCap - 1 <= roleRect.x1 && y + footprintCap - 1 <= roleRect.y1;
    const lotRole = onGround && insideRoleRect
      ? lotRoleOf(roleRect, x, y, footprintCap)
      : undefined;
    // **L'angolo cambia forma, non quota**: il ruolo del lotto entra nella scelta
    // della tipologia e non nel livello. Un bonus di livello sull'angolo e' stato
    // provato e tolto — spegneva i montanti della citta' in quota. La misura e il
    // perche' stanno accanto a `BLOCK` in `config.ts`.
    const level = request.level === undefined
      ? Math.min(allowed, startLevel(seed) + localLevelBonus(form))
      : Math.min(BUILDER.maxLevel, Math.max(0, Math.floor(request.level)));
    const coastal = isCoastal(this.terrainMap, x, y);
    const typology = selectTypology({
      use: cls,
      mixed,
      level,
      profile,
      coastal,
      lotRole,
    });
    // Lo stamp serve subito per l'impronta, ma il profilo di disegno lo porta
    // solo come vernice: la sagoma (e quindi `sizeX`) non cambia con lo stile.
    // Il primo build usa il profilo nudo; lo stile si aggancia dopo, quando
    // l'impronta ha finito di scorrere e si sa in quale isolato cade davvero.
    let draft = buildStamp({
      class: cls,
      level,
      seed,
      footprintCap,
      footprintFloor: 1,
      form,
      profile: typologyProfile(typology),
      shape: typology.shape,
      mixed,
      facing,
    }, footprintCap);
    // **Nucleo e inviluppo si separano qui, e da qui in poi non vanno confusi.**
    // `footprint` e' cio' che poggia — lo leggono lotto, opera di terra, fila,
    // decoro e carreggiata — mentre lo stamp puo' essere piu' largo di `over`
    // sopra il marciapiede. Sono lo stesso numero su ogni edificio che non
    // sporge, cioe' su quasi tutti.
    // Un lotto oltre il modulo e' un assemblaggio: riempie l'impronta e non
    // aggetta, quindi lo sbalzo si azzera. Cosi' `groundSideOf` coincide con
    // `footprintCap`, e le righe di scorrimento/slack qui sotto restano inattive.
    const assembled = footprintCap > MAX_FOOTPRINT;
    const over = assembled ? 0 : overhangFor(typology.shape, facing);
    const footprint = groundSideOf(draft, over, facing);

    // L'impronta puo' uscire piu' stretta del lotto verificato. Nel tessuto
    // ordinario resta centrata sul punto eletto dal campo; `facing` orienta la
    // facciata ma non sposta la massa fino alla strada. Solo sulla costa il
    // bordo e' parte fisica dell'opera e continua quindi a vincolare la posa.
    // Solo chi ha davvero prenotato un lotto largo `footprintCap` puo'
    // scorrere dentro di esso: chi costruisce a coordinate date — una partita
    // salvata — deve restare esattamente dove la simulazione lo conta.
    if (onGround && request.chooseLot && facing !== undefined && footprint < footprintCap) {
      const slack = footprintCap - footprint;
      if (coastal) {
        // Sulla costa l'accesso e' anche l'opera: arretrare la sagoma toglierebbe
        // la banchina dall'acqua. Qui resta la posa sul fronte di sempre.
        if (facing === FACING.east) x += slack;
        else if (facing === FACING.north) y += slack;

        const along = this.frontage.snap(x, y, footprint, facing, slack);
        if (facing === FACING.east || facing === FACING.west) y += along;
        else x += along;
      } else {
        // Il lotto e' una riserva, non un indirizzo: la sagoma piu' stretta si
        // assesta in entrambe le direzioni verso il centro desiderato.
        const wantedX = Math.round(request.x - (footprint - 1) * 0.5);
        const wantedY = Math.round(request.y - (footprint - 1) * 0.5);
        x = Math.min(x + slack, Math.max(x, wantedX));
        y = Math.min(y + slack, Math.max(y, wantedY));
      }
    }

    // Lo stile e' del quartiere, non dell'edificio: si chiede all'isolato in cui
    // la colonna **cade davvero**, dopo lo scorrimento qui sopra. Due edifici
    // dello stesso isolato lo ricevono uguale per costruzione — vedi `style.ts`.
    const style = styleAt(this.worldSeed, this.streets.blockAt(x, y));
    const drawProfile = styledProfile(typologyProfile(typology), style);
    // Stesso seme, stessa sagoma: si rigenera solo per portare la vernice giusta.
    draft = buildStamp({
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
    }, footprintCap);

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
      : this.frontage.join(x, y, footprint, facing, plan, form.density);
    const baseBand = terms?.base ?? 0;

    // Con un corso di base condiviso lo stamp si rigenera: cambia l'altezza
    // della fascia zero e nient'altro — stessa sequenza di PRNG, stessa sagoma.
    // Gira solo dove la fila un basamento ce l'ha davvero, e sta comunque fuori
    // dal ciclo di frame.
    const shaped = baseBand > 0
      ? buildStamp({
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
      }, footprintCap)
      : draft;

    // **Gli edifici sorgono dal terreno e non lo livellano.** La base scende
    // alla quota piu' bassa dell'impronta — anche sulla battigia, dove prima
    // nasceva una banchina — e la sagoma si inserisce nel fianco: niente muro
    // di contenimento, niente banchina, niente cumulo di terra sotto la casa. Su
    // terreno piatto la base non cambia: `footZ` e `deck.z` coincidono.
    const baseZ = plan !== null ? plan.footZ : terms?.deck ?? deck.z;

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
        stamp = buildStamp({
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
        }, footprintCap);
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
    // Un assemblaggio puo' superare `segmentSide` in pianta: la fondazione si
    // getta in un colpo e la sagoma si spezza in ritagli che compaiono uno per
    // volta, quindi il tetto di chunk va verificato per ritaglio, come gia'
    // fanno landmark e arcologie con `fitsChunkBudget`. Un edificio singolo
    // resta sul conto intero di sempre.
    const overBudget = assembled
      ? plan === null || !fitsChunkBudget(env.x, env.y, env.sizeX, env.sizeY, plan, stamp)
      : dirtyChunkCount(env.x, env.y, env.sizeX, plan?.footZ ?? baseZ, baseZ + stamp.sizeZ,
        env.sizeY) > BUILDER.maxDirtyChunksPerBuilding;
    if (overBudget) {
      return this.reject(key, 'chunkBudget', plan !== null);
    }

    if (plan !== null) {
      this.surface.clearSiteDecor(x, y, footprint);
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
      // **Su cosa poggia, quando non poggia a terra.** Il suolo non e' di
      // nessuno e non ha un id: `deck.id` vale zero, e il campo non si scrive.
      // Sopra un impalcato invece l'appoggio ha un record, e senza questa riga
      // il legame esisteva in un verso solo — l'impalcato sapeva di essere
      // abitato, l'ospite non sapeva su cosa stesse. E' la stessa informazione
      // che `span` e `aerial` portano da sempre, e serve a chiunque debba
      // decidere se questo volume regge da solo: il pannello di selezione lo
      // mostra, e il salvataggio ci si appoggia per non scrivere un edificio
      // sospeso in aria senza cio' che lo tiene su.
      supports: deck.id === 0 ? undefined : [deck.id],
    });

    if (request.animate) this.growth.enqueueSegments(record, stamp);
    else this.growth.writeStamp(anchorOf(record), stamp, 0, stamp.sizeZ, false);
    this.surface.enqueueBlockStreets(this.streets.blockAt(x, y));
    // Il capillare si tira **adesso**, non alla passata dopo: cosi' il lotto
    // successivo trova gia' una carreggiata su cui affacciarsi, ed e' quella
    // catena — costruisci, collega, affacciati — a far crescere il tessuto lungo
    // le strade invece che attorno a loro.
    this.roadNetwork.connect(x, y, footprint, facing);
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

  /**
   * Conta uno scarto, e di norma lo rende definitivo.
   *
   * `permanent` a false esiste per una sola situazione, ed e' la 4.9: un
   * candidato in quota che non entra dice qualcosa sulla **soletta**, non sulla
   * colonna. Bocciarla toglierebbe per sempre un lotto a terra per via di un
   * ingombro che sta trenta voxel piu' su.
   */
  private reject(key: number, reason: RejectReason, permanent = true): null {
    if (permanent) this.lots.ban(key);
    this.rejectedCounts[REJECT_REASONS.indexOf(reason)]++;
    return null;
  }
}

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
   * Se true la colonna proposta viene adattata al lotto libero piu' vicino.
   * Chi ha gia' delle coordinate vere — una partita salvata — lo lascia a
   * false e costruisce esattamente li'.
   */
  readonly chooseLot: boolean;
}

