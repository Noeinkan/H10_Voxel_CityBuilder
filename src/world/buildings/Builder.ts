import {
  BALANCE,
  addBuilding,
  catalystById,
  catalystRoleOf,
  nextBuildSites,
  setCatalystStrength,
  urbanProfileAt,
  type Building,
  type BuildingClass,
  type CatalystId,
  type LocalUrbanProfile,
  type SimState,
} from '../../sim';
import { CHUNK, keyOf, toChunk, toLocal } from '../chunkCoords';
import { SURFACE_KIND } from '../visualBlock';
import { hashCoords } from '../rng';
import { paletteForDepth } from '../terrain/biomes';
import type { TerrainMap } from '../terrain/TerrainMap';
import type { VoxelWorld } from '../VoxelWorld';
import {
  BuildingRegistry,
  footprintDepth,
  type BuildingRecord,
  type ReadonlyBuildingRegistry,
} from './BuildingRegistry';
import {
  BUILDER,
  CLASS_PROFILE,
  CLUSTER,
  DEFAULT_BUILDING_FORM,
  MAX_FOOTPRINT,
  type BuildingForm,
} from './config';
import { planCluster, type ClusterTerms } from './cluster';
import { generateBuilding, startLevel } from './generate';
import { selectTypology, typologyProfile } from './typology';
import { typologyById, type TypologyDefinition } from './config';
import { anchoredVoxel, stampSurface, STAMP_EMPTY, type VoxelAnchor, type VoxelStamp } from './stamp';
import { GRADING } from '../grading/config';
import {
  GROUND,
  WORKS,
  groundKindOf,
  isDryLand,
  planGrade,
  rampField,
  type GradePlan,
  type GroundKind,
} from '../grading/grade';
import { StreetNetwork, type PavementCell } from '../streets/StreetNetwork';
import { placeLot, type Lot } from '../streets/lots';
import { FACING, STREET_ROLE, type BlockId, type Facing } from '../streets/streetGrid';
import { STREETS } from '../streets/config';
import { seesWater, waterFacing } from '../sites/siteRules';
import { SITE } from '../sites/config';
import { LANDMARK, landmarkOf, maxStageOf } from '../landmarks/config';
import {
  generateLandmark,
  landmarkOrigin,
  landmarkSpan,
  stageForBuildings,
} from '../landmarks/generate';

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
}

/** Un volume che cresce dal proprio voxel di ancoraggio. */
interface Growing {
  readonly record: BuildingRecord;
  readonly stamp: VoxelStamp;
  /** Impronta precedente: i soli voxel non coperti dalla nuova vengono rimossi. */
  readonly erase: VoxelStamp | null;
  voxelCursor: number;
  eraseCursor: number;
}

/**
 * Una colonna di superficie urbana da applicare.
 *
 * Dalla 4.2 porta anche una **quota di progetto**. Finche' la superficie era
 * solo colore, il piano era per forza quello del terreno e il salto restava
 * terreno nudo; con `deck` la stessa coda costruisce il salto, e le tre cose
 * che nella 4.2 devono salire — la rampa che porta alla banchina, il molo, la
 * piazza sopraelevata — sono la stessa operazione con tre quote diverse invece
 * di tre sottosistemi.
 */
interface SurfacePaint {
  readonly x: number;
  readonly y: number;
  readonly palette: number;
  readonly priority: number;
  /** Quota del piano finito. Se manca, si dipinge il terreno dov'e'. */
  readonly deck?: number;
  /** Palette del muro che regge il piano, quando `deck` supera il terreno. */
  readonly wall?: number;
  /** Coronamento del muro: l'ultimo voxel sotto il piano calpestabile. */
  readonly coping?: number;
}

export class Builder {
  private readonly registryImpl = new BuildingRegistry();
  private readonly growing: Growing[] = [];
  private readonly surfaceQueue: string[] = [];
  private readonly surfacePending = new Map<string, SurfacePaint>();
  private readonly surfacePriority = new Map<string, number>();
  private surfaceHead = 0;

  /** Isolati la cui carreggiata e' gia' stata accodata: si dipinge una volta sola. */
  private readonly paintedBlocks = new Set<string>();

  /**
   * Isolati senza piu' un lotto libero sul fronte strada.
   *
   * Vale la stessa ragione della blacklist dei siti: un isolato pieno resta
   * pieno finche' nessuno demolisce, e ricercargli un lotto a ogni infornata
   * significherebbe riscorrere il suo perimetro per sempre. Un candidato che
   * cade qui dentro viene scartato prima ancora di generare uno stamp.
   */
  private readonly fullBlocks = new Set<string>();

  /**
   * Siti bocciati in modo definitivo.
   *
   * Ogni motivo di scarto e' permanente: la pendenza di una colonna non cambia,
   * un'impronta non si sposta e nessuno demolisce. Riproporre un sito bocciato
   * significherebbe rifare lo stesso calcolo con lo stesso esito a ogni
   * infornata, per sempre. Se un giorno arrivera' la demolizione, questo insieme
   * andra' svuotato con `forget`.
   */
  private readonly blacklist = new Set<string>();

  private readonly rejectedCounts = new Array<number>(REJECT_REASONS.length).fill(0);

  private placedCount = 0;
  private upgradedCount = 0;
  private upgradeCursor = 0;

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

  /**
   * La rete stradale nasce dal solo seed del mondo: non ha stato, non va
   * salvata e non va passata da fuori. E' la stessa rete per chiunque
   * costruisca su questa isola.
   */
  private readonly streets: StreetNetwork;

  constructor(
    private readonly world: VoxelWorld,
    private readonly terrainMap: TerrainMap,
    private readonly worldSeed: number,
  ) {
    this.streets = new StreetNetwork(worldSeed);
  }

  /** Sola lettura: nemmeno chi tiene il Builder puo' scrivere nel registry. */
  get registry(): ReadonlyBuildingRegistry {
    return this.registryImpl;
  }

  /**
   * Costruisce il landmark di un catalizzatore, con il suo grembiule attorno.
   *
   * **Ha sostituito `decorateCatalyst`, che dipingeva un rombo di asfalto.**
   * Quel rombo era identico per tutti e otto i ruoli — cambiava il colore di un
   * voxel — e il porto in particolare non aveva nessuna struttura: quello che si
   * vedeva sull'acqua era la carreggiata dell'isolato costiero.
   *
   * **Il landmark e' un edificio con un altro generatore.** Entra nel registry
   * come un record qualunque, quindi eredita senza una riga in piu' la
   * collisione, il budget di chunk, la comparsa a budget e l'avanzamento di
   * livello. A distinguerlo c'e' `record.landmark`, che dice quale generatore
   * disegna lo stamp e tiene il record fuori dagli istogrammi degli edifici.
   *
   * **L'ingombro e' quello finale, riservato subito.** Uno stadio non allarga
   * mai l'impronta: la riempie. Cosi' un landmark non puo' restare bloccato a
   * meta' perche' nel frattempo e' cresciuto un edificio accanto, e la sagoma
   * dello stadio precedente non ha mai niente da cancellare.
   *
   * Un ruolo senza ricetta ottiene il solo grembiule, che e' esattamente cio'
   * che tutti e otto avevano prima.
   */
  placeLandmark(x: number, y: number, kind: CatalystId): void {
    const definition = catalystById(kind);
    const built = this.buildLandmarkStructure(x, y, kind);
    if (built === null) this.paintPlaza(x, y, definition.class);
    else this.paintApron(built, landmarkOf(kind)!.apron);
    // Il grembiule da solo sarebbe una macchia in mezzo al verde: accodare
    // l'isolato che lo contiene lo porta contro una carreggiata vera.
    this.enqueueBlockStreets(this.streets.blockAt(x, y));
  }

  /**
   * Il verso in cui la struttura guarda.
   *
   * Un ruolo costiero guarda l'acqua — un molo che esce dalla parte sbagliata e'
   * un molo dentro la collina — e tutti gli altri la strada, come gia' fa
   * l'impronta di un edificio. Senza ne' l'una ne' l'altra resta il seme, che e'
   * arbitrario ma stabile: due partite sullo stesso seed mettono il monumento
   * nello stesso verso.
   */
  private landmarkFacing(x: number, y: number, kind: CatalystId): Facing {
    if (catalystById(kind).site === 'coastal') {
      const water = waterFacing(this.terrainMap, x, y, SITE.coastalRadius);
      if (water !== null) return water;
    }
    return this.streets.facingOf(x, y, 1)
      ?? ((hashCoords(this.worldSeed, x, y) & 3) as Facing);
  }

  /** Costruisce la struttura e ne restituisce il record, o null se il luogo non la regge. */
  private buildLandmarkStructure(x: number, y: number, kind: CatalystId): BuildingRecord | null {
    const facing = this.landmarkFacing(x, y, kind);
    const span = landmarkSpan(kind, facing);
    const origin = landmarkOrigin(kind, facing, x, y);
    if (span === null || origin === null) return null;

    const stamp = generateLandmark({ kind, stage: 0, facing });
    if (stamp === null) return null;

    // `surveyGrade` e non il vincolo `nearLand` che ferma la carreggiata: un
    // molo **deve** poter uscire sull'acqua. Il limite qui e' la ricetta — un
    // ingombro dichiarato e finito — invece di una regola sul terreno, ed e' la
    // differenza fra una struttura progettata e una piattaforma che si allarga
    // finche' il fondale regge.
    const plan = this.surveyGrade(origin.x, origin.y, span.sizeX, span.sizeY);
    if (plan === null) return null;
    if (this.registryImpl.overlaps(origin.x, origin.y, span.sizeX, plan.padZ, span.sizeZ, span.sizeY)) {
      return null;
    }
    if (this.dirtyChunkCount(
      origin.x, origin.y, span.sizeX, plan.footZ, plan.padZ + span.sizeZ, span.sizeY,
    ) > LANDMARK.maxDirtyChunks) {
      return null;
    }

    this.clearSiteDecor(origin.x, origin.y, span.sizeX, span.sizeY);
    this.buildWorks(origin.x, origin.y, span.sizeX, plan, span.sizeY);

    const record = this.registryImpl.add({
      x: origin.x,
      y: origin.y,
      baseZ: plan.padZ,
      footprint: span.sizeX,
      footprintY: span.sizeY,
      height: span.sizeZ,
      class: catalystById(kind).class,
      level: 0,
      seed: hashCoords(this.worldSeed, x, y),
      facing,
      landmark: kind,
    });

    this.growing.push({ record, stamp, erase: null, voxelCursor: 0, eraseCursor: 0 });
    return record;
  }

  /**
   * La cornice di suolo pubblico attorno a una struttura.
   *
   * E' un **anello attorno all'ingombro**, non un rombo attorno al click: con la
   * struttura al centro un rombo di raggio quattro finirebbe tutto sotto il
   * pavimento, e `canPaintSurface` lo scarterebbe colonna per colonna lasciando
   * il landmark posato sull'erba.
   *
   * Segue il terreno invece di livellarsi. La struttura ha gia' la propria
   * fondazione; portare anche la cornice alla quota del piano costruirebbe un
   * muro di contenimento largo quanto tutto l'anello, cioe' un podio che nessun
   * dislivello ha chiesto.
   */
  private paintApron(record: BuildingRecord, margin: number): void {
    const depth = footprintDepth(record);
    for (let py = record.y - margin; py < record.y + depth + margin; py++) {
      for (let px = record.x - margin; px < record.x + record.footprint + margin; px++) {
        this.enqueueSurface({ x: px, y: py, palette: LANDMARK.apronPalette, priority: 1 });
      }
    }
  }

  /**
   * La piazzola di un ruolo senza ricetta: il rombo di prima, con il suo voxel
   * d'accento al centro.
   *
   * Sopravvive perche' e' il ripiego, non perche' sia rimasto indietro: un ruolo
   * aggiunto a `CATALYSTS` prima che qualcuno gli disegni una forma resta
   * giocabile e visibile.
   */
  private paintPlaza(x: number, y: number, cls: BuildingClass): void {
    const radius = BUILDER.catalystPlazaRadius;
    const deck = this.plazaDeck(x, y, radius);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const centre = dx === 0 && dy === 0;
        this.enqueueSurface({
          x: x + dx,
          y: y + dy,
          palette: centre ? CLASS_PROFILE[cls].accent : LANDMARK.apronPalette,
          priority: centre ? 2 : 1,
          deck,
          wall: GRADING.terraceWall,
          coping: GRADING.terraceCoping,
        });
      }
    }
  }

  /**
   * Quota di una piazza, o `undefined` se il terreno non chiede di livellarla.
   *
   * Una piazza e' un piano: seguire il terreno voxel per voxel la fa leggere
   * come un pezzo di prato colorato di grigio. Ma livellare un dislivello di un
   * voxel produce un gradino che nessuno legge come progetto, quindi sotto
   * `plazaMinStep` la piazza resta dipinta dov'e' — che e' anche il motivo per
   * cui su terreno piano questa fase non cambia niente.
   *
   * Le colonne che nessuna opera regge non entrano nel massimo: una piazza sul
   * ciglio non deve alzarsi fino alla roccia che le sta accanto.
   */
  private plazaDeck(x: number, y: number, radius: number): number | undefined {
    let lowest = Number.MAX_SAFE_INTEGER;
    let highest = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        if (this.groundKindAt(x + dx, y + dy) === GROUND.refused) continue;
        const height = this.terrainMap.heightAt(x + dx, y + dy);
        if (height < lowest) lowest = height;
        if (height > highest) highest = height;
      }
    }
    if (highest === 0 || highest - lowest < GRADING.plazaMinStep) return undefined;
    return highest;
  }

  get stats(): BuilderStats {
    return {
      placed: this.placedCount,
      upgraded: this.upgradedCount,
      growing: this.growing.length,
      rejected: this.rejectedCounts,
      blacklisted: this.blacklist.size,
      surfaceQueued: this.surfacePending.size,
      clustered: this.clusteredCount,
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
    if (state.tickCount % BUILDER.ticksPerBuild === 0) next = this.buildPass(next);
    if (state.tickCount % BUILDER.ticksPerUpgrade === 0) {
      this.upgradePass(next);
      next = this.landmarkPass(next);
    }
    return next;
  }

  /**
   * Scrive singoli cubi degli edifici in crescita. Una chiamata per frame.
   *
   * Il costo per frame e' `maxGrowing * voxelsPerFrame` voxel, indipendente da
   * quanto e' grande la citta': e' il motivo per cui le comparse non fanno
   * cadere il frame rate quando gli edifici sono duemila invece di dieci.
   */
  step(): void {
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const entry = this.growing[i];
      let budget = BUILDER.voxelsPerFrame;

      if (entry.voxelCursor < entry.stamp.voxels.length) {
        const write = this.writeVoxelBatch(entry.record, entry.stamp, entry.voxelCursor, budget);
        entry.voxelCursor = write.cursor;
        budget -= write.written;
      }

      // Prima compare la nuova sagoma, poi spariscono soltanto le parti che non
      // le appartengono piu'. Cosi' un upgrade non cancella centinaia di voxel
      // in un singolo frame e l'edificio non lampeggia nel vuoto.
      if (entry.voxelCursor >= entry.stamp.voxels.length && entry.erase !== null && budget > 0) {
        const clear = this.clearObsoleteVoxelBatch(
          entry.record,
          entry.erase,
          entry.stamp,
          entry.eraseCursor,
          budget,
        );
        entry.eraseCursor = clear.cursor;
      }

      const writeDone = entry.voxelCursor >= entry.stamp.voxels.length;
      const clearDone = entry.erase === null || entry.eraseCursor >= entry.erase.voxels.length;
      if (writeDone && clearDone) this.growing.splice(i, 1);
    }

    this.stepSurface();
  }

  // --- Costruzione -----------------------------------------------------------

  /**
   * Un'infornata di costruzioni.
   *
   * Prende piu' candidati di quanti ne serva perche' la simulazione ragiona per
   * colonna: non sa cosa sia un'impronta, una pendenza o un chunk, quindi una
   * parte dei suoi candidati e' inevitabilmente inutilizzabile.
   */
  private buildPass(state: SimState): SimState {
    const wanted = BUILDER.sitesPerBuild;
    const sites = nextBuildSites(state, this.terrainMap, wanted * BUILDER.candidateOverfetch);

    let next = state;
    let accepted = 0;

    for (const site of sites) {
      if (accepted >= wanted) break;
      if (this.growing.length >= BUILDER.maxGrowing) break;

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

      next = addBuilding(next, record.mixed === undefined
        ? { x: record.x, y: record.y, class: record.class }
        : { x: record.x, y: record.y, class: record.class, mixed: record.mixed });
      accepted++;
    }

    return next;
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

    // Il seme resta quello dell'origine del lotto anche se l'impronta si
    // accosta al fronte piu' avanti: e' il lotto a essere stabile, non
    // l'angolo dell'edificio, e il record se lo porta dietro comunque.
    const seed = hashCoords(this.worldSeed, x, y);
    const profile = state === null ? null : urbanProfileAt(state, x, y);
    const form = formOf(profile);
    const level = Math.min(BUILDER.maxLevel, startLevel(seed) + localLevelBonus(form));
    const typology = selectTypology({
      use: cls,
      mixed,
      level,
      profile,
      coastal: this.isCoastal(x, y),
    });
    const draft = generateBuilding({
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
    });
    const footprint = draft.sizeX;

    // L'impronta puo' uscire piu' stretta del lotto verificato. La si accosta
    // al fronte invece di lasciarla al centro: un edificio che non tocca la
    // carreggiata legge come arretrato a caso, e il quadrato ridotto sta
    // comunque dentro quello gia' dichiarato libero.
    // Solo chi ha davvero prenotato un lotto largo `footprintCap` puo'
    // scorrere dentro di esso: chi costruisce a coordinate date — una partita
    // salvata — deve restare esattamente dove la simulazione lo conta.
    if (request.snapToStreet && facing !== undefined && footprint < footprintCap) {
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

    // Il piano si progetta sull'impronta vera, non sul lotto prenotato: e'
    // quello che l'opera dovra' reggere.
    const plan = this.surveyGrade(x, y, footprint);
    if (plan === null) return this.reject(key, this.gradeRefusal(x, y, footprint));

    // A cosa si aggrega questo lotto. La quota che ne esce sostituisce quella
    // del piano proprio: e' l'unico punto in cui un edificio smette di rispondere
    // solo al terreno sotto di se' e comincia a rispondere anche al vicino.
    const terms = this.joinCluster(x, y, footprint, facing, plan, form.density);

    // Con un corso di base condiviso lo stamp si rigenera: cambia l'altezza
    // della fascia zero e nient'altro — stessa sequenza di PRNG, stessa sagoma.
    // Gira solo dove la fila un basamento ce l'ha davvero, e sta comunque fuori
    // dal ciclo di frame.
    const stamp = terms.base > 0
      ? generateBuilding({
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
        baseBandHeight: terms.base,
      })
      : draft;

    const baseZ = terms.deck;
    if (this.registryImpl.overlaps(x, y, footprint, baseZ, stamp.sizeZ)) {
      return this.reject(key, 'occupied');
    }
    if (this.dirtyChunkCount(x, y, footprint, plan.footZ, baseZ + stamp.sizeZ) >
        BUILDER.maxDirtyChunksPerBuilding) {
      return this.reject(key, 'chunkBudget');
    }

    this.clearSiteDecor(x, y, footprint);
    // Il salto che la fila aggiunge sotto il membro e' costruito, non versato:
    // senza questo il dislivello verso il deck verrebbe riempito di stratigrafia
    // di bioma e leggerebbe come terreno nudo invece che come muro. E' lo stesso
    // ritocco che l'upgrade fa gia' sull'anello allargato.
    this.buildWorks(x, y, footprint, {
      ...plan,
      padZ: baseZ,
      works: baseZ > plan.padZ && plan.works === WORKS.none ? WORKS.terrace : plan.works,
    });

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
      district: profile?.district ?? 'outskirts',
      specialization: profile?.specialization ?? null,
      facing,
      cluster: terms.id,
      // Zero non si scrive: una fila senza corso di base non deve portarsi
      // dietro un campo che dice "non ne ho uno".
      baseBand: terms.base > 0 ? terms.base : undefined,
    });

    if (request.animate) this.growing.push({ record, stamp, erase: null, voxelCursor: 0, eraseCursor: 0 });
    else this.writeStamp(record, stamp, 0, stamp.sizeZ, false);
    this.enqueueBlockStreets(this.streets.blockAt(x, y));
    this.placedCount++;
    return record;
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

  /**
   * Come si presenta una colonna a chi deve costruirci sopra.
   *
   * Tre letture senza allocazione invece di `columnAt`, che costruirebbe un
   * oggetto: questa funzione sta nel percorso caldo di `placeLot`, dove le
   * colonne si contano a migliaia per infornata.
   */
  private groundKindAt(x: number, y: number): GroundKind {
    if (!this.terrainMap.has(x, y)) return GROUND.refused;
    return groundKindOf(
      this.terrainMap.biomeAt(x, y),
      this.terrainMap.slopeAt(x, y),
      this.terrainMap.heightAt(x, y),
    );
  }

  /**
   * L'opera che regge l'impronta, o null se non ce n'e' una.
   *
   * Ha sostituito `surveyGround`, che rispondeva soltanto "il terreno e' gia'
   * piano?" e in caso contrario perdeva il sito per sempre. La domanda ora e'
   * cosa costruire perche' lo diventi, e le tre risposte — niente, un
   * terrapieno, una banchina — vivono in `grading/`.
   */
  private surveyGrade(x: number, y: number, w: number, h: number = w): GradePlan | null {
    const columns: { kind: GroundKind; height: number }[] = [];
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const kind = this.groundKindAt(x + dx, y + dy);
        if (kind === GROUND.refused) return null;
        columns.push({ kind, height: this.terrainMap.heightAt(x + dx, y + dy) });
      }
    }
    return planGrade(columns);
  }

  /**
   * Perche' l'impronta non ha un piano. Gira solo sul ramo di rifiuto.
   *
   * Ripete la scansione invece di farsi restituire il motivo da `planGrade`:
   * quella funzione risponde a una domanda sola, e allargarla a un risultato
   * con causa la costringerebbe ad allocare un oggetto anche nelle migliaia di
   * chiamate che vanno a buon fine.
   */
  private gradeRefusal(x: number, y: number, w: number, h: number = w): RejectReason {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (this.groundKindAt(x + dx, y + dy) === GROUND.refused) return 'unworkable';
      }
    }
    return 'worksTooTall';
  }

  /**
   * Costruisce l'opera sotto l'impronta: terra dentro, muro sul perimetro.
   *
   * **Il perimetro e' l'unica parte che si vede**, ed e' l'unica che diventa
   * muratura. Le colonne interne restano stratigrafia di bioma, con lo stesso
   * `paletteForDepth` che usa `IslandGenerator`: sotto un edificio non le
   * guarda nessuno, e rivestirle costerebbe voxel per niente.
   *
   * Il corso di coronamento e' cio' che distingue un muro di contenimento da un
   * blocco di roccia: una riga chiara in cima al salto, che a distanza di gioco
   * e' il solo segno che dichiari il dislivello costruito invece che scavato.
   */
  private buildWorks(x: number, y: number, w: number, plan: GradePlan, h: number = w): void {
    const quay = plan.works === WORKS.quay;
    const wall = quay ? GRADING.quayWall : GRADING.terraceWall;
    const coping = quay ? GRADING.quayCoping : GRADING.terraceCoping;

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        const height = this.terrainMap.heightAt(cx, cy);
        if (height >= plan.padZ) continue;

        const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
        if (plan.works !== WORKS.none && edge) {
          for (let z = height; z < plan.padZ; z++) {
            this.world.setBlock(cx, cy, z, z === plan.padZ - 1 ? coping : wall, SURFACE_KIND.utility);
          }
          continue;
        }

        const biome = this.terrainMap.biomeAt(cx, cy);
        for (let z = height; z < plan.padZ; z++) {
          this.world.setBlock(cx, cy, z, paletteForDepth(biome, plan.padZ - 1 - z));
        }
      }
    }
  }

  // --- Upgrade ---------------------------------------------------------------

  /**
   * Promuove al livello successivo gli edifici su cui la desiderabilita' e'
   * salita abbastanza.
   *
   * E' la crescita verticale: quando l'isola si riempie, `nextBuildSites` smette
   * di produrre candidati e questa passata resta l'unico modo in cui la citta'
   * puo' ancora cambiare.
   *
   * La passata riparte da dove si era fermata invece di ricominciare da capo:
   * con duemila edifici, rileggere il campo su tutti a ogni passata sarebbe la
   * sola cosa nel ciclo il cui costo cresce con la citta'.
   */
  private upgradePass(state: SimState): void {
    const records = [...this.registryImpl.all];
    if (records.length === 0) return;

    const budget = Math.min(BUILDER.upgradesPerPass, records.length);
    for (let i = 0; i < budget; i++) {
      if (this.growing.length >= BUILDER.maxGrowing) break;

      const record = records[this.upgradeCursor % records.length];
      this.upgradeCursor++;
      if (this.growing.some((entry) => entry.record.id === record.id)) continue;
      // Un landmark cresce di stadio, non di livello, e su un altro segnale:
      // `landmarkPass` se ne occupa con la propria soglia e il proprio generatore.
      if (record.landmark !== undefined) continue;
      if (record.level >= BUILDER.maxLevel) continue;

      const nextLevel = record.level + 1;
      const profile = urbanProfileAt(state, record.x, record.y);
      const threshold = BUILDER.upgradeThreshold[nextLevel] - localUpgradeDiscount(formOf(profile));
      if (state.field.valueAt(record.x, record.y, record.class) <= threshold) {
        continue;
      }

      this.upgrade(record, nextLevel, profile);
    }
  }

  /**
   * Sostituisce un edificio con la sua versione di livello superiore.
   *
   * Stesso seed e stesso ancoraggio, quindi la torre nuova si riconosce come la
   * vecchia cresciuta. L'impronta si allarga solo se il registry conferma che
   * l'anello aggiuntivo e' libero; altrimenti il livello nuovo viene rigenerato
   * con l'impronta vecchia come tetto, e cresce solo in altezza.
   */
  private upgrade(record: BuildingRecord, nextLevel: number, profile: LocalUrbanProfile): void {
    const oldTypology = this.typologyOf(record);
    // Salendo di livello la colonna puo' meritare una tipologia diversa: una
    // casa-bottega che diventa podio commerciale e' proprio il racconto che
    // questa fase deve rendere visibile.
    const nextTypology = selectTypology({
      use: record.class,
      mixed: record.mixed,
      level: nextLevel,
      profile,
      coastal: this.isCoastal(record.x, record.y),
    });

    const oldForm = record.form ?? DEFAULT_BUILDING_FORM;
    const nextForm = formOf(profile);

    // Lo stamp da cancellare si rigenera con la tipologia **registrata**, non
    // con quella che il luogo esprime adesso: se un catalizzatore nuovo ha
    // cambiato la tipologia di questa colonna, la sagoma da togliere resta
    // quella che era stata scritta. Rigenerarla con la tipologia nuova
    // lascerebbe voxel orfani a terra.
    // Il corso di base condiviso viaggia con il record e non si ricalcola dalla
    // fila di adesso: e' l'altra meta' della rigenerabilita'. Va passato a
    // **tutte** le generazioni di questa funzione — se la sagoma da cancellare
    // partisse da un'altra quota, l'erase bucherebbe lo zoccolo sotto il vicino.
    const old = generateBuilding({
      class: record.class,
      level: record.level,
      seed: record.seed,
      footprintCap: record.footprint,
      footprintFloor: record.footprint,
      form: oldForm,
      profile: typologyProfile(oldTypology),
      shape: oldTypology.shape,
      mixed: record.mixed,
      facing: record.facing,
      baseBandHeight: record.baseBand,
    });

    // L'allargamento non puo' sfondare l'isolato: la fascia di base riempie
    // sempre l'impronta, e un voxel in piu' verso est finirebbe in mezzo alla
    // carreggiata. Un edificio gia' accostato al fronte ha stanza zero e cresce
    // solo in altezza — che e' anche il motivo per cui i lotti d'angolo
    // diventano le torri dell'isolato invece di allargarsi sulla strada.
    const room = this.blockRoom(record);
    let stamp = generateBuilding({
      class: record.class,
      level: nextLevel,
      seed: record.seed,
      footprintCap: Math.min(MAX_FOOTPRINT, room),
      footprintFloor: record.footprint,
      form: nextForm,
      profile: typologyProfile(nextTypology),
      shape: nextTypology.shape,
      mixed: record.mixed,
      facing: record.facing,
      baseBandHeight: record.baseBand,
    });
    if (stamp.sizeX > record.footprint && !this.fitsWider(record, stamp)) {
      stamp = generateBuilding({
        class: record.class,
        level: nextLevel,
        seed: record.seed,
        footprintCap: record.footprint,
        footprintFloor: record.footprint,
        form: nextForm,
        profile: typologyProfile(nextTypology),
        shape: nextTypology.shape,
        mixed: record.mixed,
        facing: record.facing,
        baseBandHeight: record.baseBand,
      });
    }

    if (this.dirtyChunkCount(record.x, record.y, stamp.sizeX, record.baseZ, record.baseZ + stamp.sizeZ) >
        BUILDER.maxDirtyChunksPerBuilding) {
      return;
    }

    if (stamp.sizeX > record.footprint) {
      this.clearExpandedSiteDecor(record, stamp.sizeX);
    }

    const replaced = this.registryImpl.replace(record.id, {
      x: record.x,
      y: record.y,
      baseZ: record.baseZ,
      footprint: stamp.sizeX,
      height: stamp.sizeZ,
      class: record.class,
      mixed: record.mixed,
      level: nextLevel,
      seed: record.seed,
      form: nextForm,
      typology: nextTypology.id,
      district: profile.district,
      specialization: profile.specialization,
      facing: record.facing,
      // La fila non si rinegozia a ogni livello: un membro che promuove resta lo
      // stesso membro, con la stessa quota e lo stesso zoccolo. Ricalcolarli qui
      // spezzerebbe la continuita' della fila proprio mentre cresce.
      cluster: record.cluster,
      baseBand: record.baseBand,
    });
    if (replaced === null) return;

    // La fondazione dell'anello aggiuntivo va gettata prima di salire: senza,
    // l'impronta allargata poggerebbe nel vuoto sulle colonne nuove.
    if (stamp.sizeX > record.footprint) {
      const widened = this.surveyGrade(record.x, record.y, stamp.sizeX);
      // La quota resta quella dell'edificio, non quella che l'opera nuova
      // proporrebbe: l'anello aggiunto deve raggiungere il piano gia' costruito,
      // e rialzare il piano sotto una torre che c'e' gia' la lascerebbe sepolta.
      if (widened !== null) {
        this.buildWorks(record.x, record.y, stamp.sizeX, { ...widened, padZ: record.baseZ });
      }
    }

    this.enqueueBlockStreets(this.streets.blockAt(replaced.x, replaced.y));
    this.growing.push({ record: replaced, stamp, erase: old, voxelCursor: 0, eraseCursor: 0 });
    this.upgradedCount++;
  }

  /**
   * Lato massimo che l'impronta puo' raggiungere restando dentro l'isolato.
   *
   * Non scende mai sotto l'impronta attuale: un edificio materializzato da una
   * partita salvata puo' avere l'ancora su una colonna che la rete di oggi
   * considera carreggiata, e in quel caso il riquadro dell'isolato non lo
   * contiene. Rimpicciolirlo per questo sarebbe una demolizione mascherata da
   * upgrade.
   */
  private blockRoom(record: BuildingRecord): number {
    const rect = this.streets.blockRect(this.streets.blockAt(record.x, record.y));
    return Math.max(
      record.footprint,
      Math.min(rect.x1 - record.x + 1, rect.y1 - record.y + 1),
    );
  }

  /** true se l'impronta allargata non tocca nessun altro edificio. */
  private fitsWider(record: BuildingRecord, stamp: VoxelStamp): boolean {
    const widened = this.surveyGrade(record.x, record.y, stamp.sizeX);
    if (widened === null) return false;
    if (widened.padZ > record.baseZ) return false;

    for (let dy = 0; dy < stamp.sizeX; dy++) {
      for (let dx = 0; dx < stamp.sizeX; dx++) {
        for (const other of this.registryImpl.at(record.x + dx, record.y + dy)) {
          if (other.id === record.id) continue;
          if (other.baseZ < record.baseZ + stamp.sizeZ && record.baseZ < other.baseZ + other.height) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // --- Landmark --------------------------------------------------------------

  /**
   * Porta avanti di uno stadio il landmark che il suo quartiere ha meritato.
   *
   * **Cosa fa avanzare uno stadio.** Il numero di edifici costruiti entro il
   * raggio del catalizzatore, non la desiderabilita'. Il campo, sotto un
   * catalizzatore, e' quasi sempre saturo — il catalizzatore *e'* la sorgente di
   * quel valore — e un landmark che leggesse quello salterebbe tutti gli stadi
   * al primo tick. Contare i record misura invece cio' che la citta' ha
   * davvero costruito li' attorno: e' il modello dei monumenti di Anno 1800,
   * una costruzione a fasi che corona una citta' gia' edificata, detto con il
   * solo dato che il Builder possiede.
   *
   * Non serve nessuno stato: lo stadio e' una funzione pura del contenuto del
   * registry, e cresce da solo perche' nessuno demolisce. Quando la demolizione
   * arrivera', bastera' non lasciarlo scendere sotto `record.level`.
   *
   * **Il ritorno alla simulazione e' un numero, non un meccanismo.** Un landmark
   * cresciuto rende il proprio catalizzatore un po' piu' forte, e lo fa da
   * `setCatalystStrength`, che esisteva gia': `src/sim/` continua a non sapere
   * cosa sia un landmark (invariante 7).
   */
  private landmarkPass(state: SimState): SimState {
    let next = state;
    let advanced = 0;

    for (const record of this.registryImpl.all) {
      if (advanced >= LANDMARK.stagesPerPass) break;
      if (this.growing.length >= BUILDER.maxGrowing) break;

      const kind = record.landmark;
      if (kind === undefined) continue;
      if (this.growing.some((entry) => entry.record.id === record.id)) continue;

      const recipe = landmarkOf(kind);
      if (recipe === null || record.level >= maxStageOf(recipe)) continue;

      // Il catalizzatore si ritrova dal riquadro e non da `record.x`, che e'
      // l'angolo minimo dell'ingombro: la colonna cliccata sta dentro il
      // riquadro ma quasi mai nel suo spigolo, perche' e' la ricetta a dire
      // dove cade — la banchina sotto il dito, il molo davanti.
      const index = this.catalystIn(next, record, kind);
      if (index === -1) continue;

      const catalyst = next.catalysts[index];
      const definition = catalystById(kind);
      const nearby = this.registryImpl.withinRadius(
        catalyst.x, catalyst.y, definition.radius,
      ).length;
      if (stageForBuildings(recipe, nearby) <= record.level) continue;

      next = this.advanceLandmark(next, record, kind, index);
      advanced++;
    }

    return next;
  }

  /**
   * Indice del catalizzatore che questo landmark rappresenta, o -1.
   *
   * Chiede **il ruolo e il riquadro insieme**: un ingombro largo venti colonne
   * ne contiene facilmente due, e il solo riquadro rinforzerebbe il mercato
   * accanto invece del porto che quella struttura e'.
   */
  private catalystIn(state: SimState, record: BuildingRecord, kind: CatalystId): number {
    const depth = footprintDepth(record);
    return state.catalysts.findIndex((catalyst) =>
      catalystRoleOf(catalyst) === kind &&
      catalyst.x >= record.x && catalyst.x < record.x + record.footprint &&
      catalyst.y >= record.y && catalyst.y < record.y + depth);
  }

  /**
   * Scrive lo stadio successivo di un landmark.
   *
   * Non c'e' niente da cancellare, e non e' una scorciatoia: gli stadi sono
   * cumulativi dentro un riquadro che non cambia mai, quindi lo stadio nuovo
   * copre sempre il vecchio. E' anche il motivo per cui non serve rivalidare il
   * terreno o l'occupazione — l'ingombro e' lo stesso riservato al piazzamento.
   */
  private advanceLandmark(
    state: SimState,
    record: BuildingRecord,
    kind: CatalystId,
    catalystIndex: number,
  ): SimState {
    const stage = record.level + 1;
    const facing = (record.facing ?? FACING.east) as Facing;
    const stamp = generateLandmark({ kind, stage, facing });
    if (stamp === null) return state;

    const replaced = this.registryImpl.replace(record.id, { ...record, level: stage });
    if (replaced === null) return state;

    this.growing.push({ record: replaced, stamp, erase: null, voxelCursor: 0, eraseCursor: 0 });

    // Il ritorno alla simulazione e' un numero: il catalizzatore diventa un po'
    // piu' forte, e `src/sim/` non sa perche'. La base si rilegge dal catalogo
    // invece di sommarsi a quella corrente, cosi' due avanzamenti non si
    // accumulano oltre quello che lo stadio dichiara.
    const base = catalystById(kind).strength;
    return setCatalystStrength(
      state,
      catalystIndex,
      base + stage * BALANCE.gameplay.catalyst.stageBonus,
    );
  }

  // --- Scrittura -------------------------------------------------------------

  /** Scrive le quote `[fromZ, toZ)` di uno stamp. `clear` scrive vuoto invece del colore. */
  private writeStamp(
    record: BuildingRecord,
    stamp: VoxelStamp,
    fromZ: number,
    toZ: number,
    clear: boolean,
  ): void {
    const anchor: VoxelAnchor = { x: record.x, y: record.y, z: record.baseZ };
    for (let sz = fromZ; sz < toZ; sz++) {
      for (let sy = 0; sy < stamp.sizeY; sy++) {
        for (let sx = 0; sx < stamp.sizeX; sx++) {
          const index = sx + stamp.sizeX * (sy + stamp.sizeY * sz);
          const id = stamp.voxels[index];
          if (id === STAMP_EMPTY) continue;
          const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
          this.world.setBlock(
            voxel.x,
            voxel.y,
            voxel.z,
            clear ? STAMP_EMPTY : id,
            clear ? undefined : stampSurface(stamp, index),
          );
        }
      }
    }
  }

  /** Scrive un numero limitato di cubi solidi, dal basso verso l'alto. */
  private writeVoxelBatch(
    record: BuildingRecord,
    stamp: VoxelStamp,
    from: number,
    budget: number,
  ): { cursor: number; written: number } {
    const anchor: VoxelAnchor = { x: record.x, y: record.y, z: record.baseZ };
    const plane = stamp.sizeX * stamp.sizeY;
    let cursor = from;
    let written = 0;
    while (cursor < stamp.voxels.length && written < budget) {
      const id = stamp.voxels[cursor];
      if (id !== STAMP_EMPTY) {
        const sz = Math.floor(cursor / plane);
        const within = cursor - sz * plane;
        const sy = Math.floor(within / stamp.sizeX);
        const sx = within - sy * stamp.sizeX;
        const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
        this.world.setBlock(voxel.x, voxel.y, voxel.z, id, stampSurface(stamp, cursor));
        written++;
      }
      cursor++;
    }
    return { cursor, written };
  }

  /** Rimuove a budget soltanto i voxel vecchi che la nuova sagoma non copre. */
  private clearObsoleteVoxelBatch(
    record: BuildingRecord,
    previous: VoxelStamp,
    next: VoxelStamp,
    from: number,
    budget: number,
  ): { cursor: number; written: number } {
    const anchor: VoxelAnchor = { x: record.x, y: record.y, z: record.baseZ };
    const previousPlane = previous.sizeX * previous.sizeY;
    let cursor = from;
    let written = 0;

    while (cursor < previous.voxels.length && written < budget) {
      if (previous.voxels[cursor] !== STAMP_EMPTY) {
        const sz = Math.floor(cursor / previousPlane);
        const within = cursor - sz * previousPlane;
        const sy = Math.floor(within / previous.sizeX);
        const sx = within - sy * previous.sizeX;
        const covered = sx < next.sizeX && sy < next.sizeY && sz < next.sizeZ &&
          next.voxels[sx + next.sizeX * (sy + next.sizeY * sz)] !== STAMP_EMPTY;
        if (!covered) {
          const voxel = anchoredVoxel(anchor, previous, sx, sy, sz);
          this.world.setBlock(voxel.x, voxel.y, voxel.z, STAMP_EMPTY);
          written++;
        }
      }
      cursor++;
    }

    return { cursor, written };
  }

  // --- Superficie urbana ----------------------------------------------------

  /** Bonifica tronchi e chiome nel lotto e nel suo bordo, senza toccare il suolo. */
  private clearSiteDecor(x: number, y: number, w: number, h: number = w): void {
    for (let py = y - 1; py <= y + h; py++) {
      for (let px = x - 1; px <= x + w; px++) {
        if (this.registryImpl.at(px, py).length > 0) continue;
        this.clearDecorColumn(px, py);
      }
    }
  }

  /** Bonifica soltanto l'anello aggiunto da un upgrade, preservando il volume vecchio. */
  private clearExpandedSiteDecor(record: BuildingRecord, footprint: number): void {
    for (let py = record.y - 1; py <= record.y + footprint; py++) {
      for (let px = record.x - 1; px <= record.x + footprint; px++) {
        const insideOld = px >= record.x && px < record.x + record.footprint &&
          py >= record.y && py < record.y + record.footprint;
        if (insideOld) continue;
        const occupied = this.registryImpl.at(px, py).some((other) => other.id !== record.id);
        if (occupied) continue;
        this.clearDecorColumn(px, py);
      }
    }
  }

  /**
   * true se la colonna vede il mare entro `BUILDER.coastalRadius`.
   *
   * La ricerca sta in `sites/siteRules.ts` perche' e' la stessa che decide se
   * un porto puo' essere piazzato qui. A cambiare e' solo il raggio, e non e' un
   * dettaglio: qui la domanda e' d'aspetto — un mercato sul porto deve *vedere*
   * l'acqua, anche da lontano — mentre il vincolo di piazzamento pretende il
   * fronte mare.
   */
  private isCoastal(x: number, y: number): boolean {
    return seesWater(this.terrainMap, x, y, BUILDER.coastalRadius);
  }

  /** Tipologia registrata di un edificio, o quella di ripiego del suo uso. */
  private typologyOf(record: BuildingRecord): TypologyDefinition {
    const stored = record.typology === undefined ? null : typologyById(record.typology);
    return stored ?? selectTypology({
      use: record.class,
      mixed: record.mixed,
      level: record.level,
      profile: null,
      coastal: false,
    });
  }

  private clearDecorColumn(x: number, y: number): void {
    const column = this.terrainMap.columnAt(x, y);
    if (column === null) return;
    const top = column.height + BUILDER.decorClearanceHeight;
    for (let z = column.height; z < top; z++) {
      if (this.world.getBlock(x, y, z) !== STAMP_EMPTY) {
        this.world.setBlock(x, y, z, STAMP_EMPTY);
      }
    }
  }

  /**
   * Accoda la carreggiata che circonda un isolato, una volta sola.
   *
   * La strada compare **per isolato** e non per edificio: appena il primo
   * edificio lo giustifica, l'anello di carreggiata entra in coda tutto
   * insieme, e la citta' mostra una strada chiusa invece dei monconi che il
   * vecchio collegamento fra ancore allungava di due celle per infornata. Le
   * colonne non edificabili — mare, roccia, pendenza — le scarta
   * `canPaintSurface`, ed e' cosi' che la maglia si ritaglia da sola sulla
   * forma dell'isola senza che la rete sappia dove finisce la terra.
   */
  private enqueueBlockStreets(block: BlockId): void {
    const key = this.streets.keyOf(block);
    if (this.paintedBlocks.has(key)) return;
    this.paintedBlocks.add(key);

    const ring = this.streets.pavementRing(block);
    const grade = this.rampAround(ring);

    for (const cell of ring) {
      // Una banchina e' il bordo costruito della terra: oltre `quayReach` la
      // carreggiata smette invece di proseguire sul fondale.
      if (!this.nearLand(cell.x, cell.y)) continue;

      const arterial = cell.role === STREET_ROLE.arterial;
      const shore = this.groundKindAt(cell.x, cell.y) === GROUND.shore;
      const deck = grade.levelAt(cell.x, cell.y);
      const raised = deck > this.terrainMap.heightAt(cell.x, cell.y);
      this.enqueueSurface({
        x: cell.x,
        y: cell.y,
        // Sulla banchina la carreggiata smette di essere asfalto: un molo
        // asfaltato leggerebbe come una strada finita nell'acqua, che e'
        // esattamente l'impressione che questa fase deve togliere.
        palette: shore
          ? GRADING.quayDeck
          : arterial ? STREETS.arterialPalette : STREETS.minorPalette,
        // L'asse principale vince l'incrocio: e' la sua continuita' a rendere
        // leggibile la gerarchia, e una corsia di svolta dipinta col colore
        // secondario la spezzerebbe proprio dove si vede di piu'.
        priority: arterial ? 2 : 1,
        deck,
        wall: raised ? (shore ? GRADING.quayWall : GRADING.terraceWall) : undefined,
        coping: shore ? GRADING.quayCoping : GRADING.terraceCoping,
      });
    }
  }

  /**
   * Quota di progetto della carreggiata attorno a un isolato.
   *
   * La battigia ancora la strada alla quota della banchina; tutto il resto
   * parte dal terreno. `rampField` alza poi il campo alla pendenza uno, ed e'
   * quella relazione a produrre la rampa: la carreggiata che scende al molo ci
   * arriva con un voxel per colonna invece di finirci sopra a picco.
   *
   * Il rettangolo e' quello dell'anello, interno dell'isolato compreso: le
   * colonne interne non si dipingono ma servono a propagare la distanza, e
   * lasciarle fuori spezzerebbe la rampa proprio negli angoli.
   */
  private rampAround(ring: readonly PavementCell[]): {
    levelAt: (x: number, y: number) => number;
  } {
    let x0 = Number.MAX_SAFE_INTEGER;
    let y0 = Number.MAX_SAFE_INTEGER;
    let x1 = Number.MIN_SAFE_INTEGER;
    let y1 = Number.MIN_SAFE_INTEGER;
    for (const cell of ring) {
      if (cell.x < x0) x0 = cell.x;
      if (cell.y < y0) y0 = cell.y;
      if (cell.x > x1) x1 = cell.x;
      if (cell.y > y1) y1 = cell.y;
    }

    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    const level = new Int32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const wx = x0 + x;
        const wy = y0 + y;
        const ground = this.terrainMap.heightAt(wx, wy);
        level[y * width + x] = this.groundKindAt(wx, wy) === GROUND.shore
          ? Math.max(ground, GRADING.quayLevel)
          : ground;
      }
    }
    rampField(level, width, height);

    return {
      levelAt: (x: number, y: number): number => level[(y - y0) * width + (x - x0)],
    };
  }

  /**
   * true se la colonna e' terra emersa o ha terra a portata di banchina.
   *
   * **E' il vincolo di forma che mancava alla 4.2.** `maxQuayDepth` risponde a
   * una domanda strutturale — fin dove il fondale regge un muro — e su un
   * bassofondo dolce dice di si' per una quindicina di colonne al largo. Nessuno
   * aveva mai deciso che la citta' dovesse arrivarci: l'anello di carreggiata di
   * un isolato costiero se le prendeva tutte, e quello che si vedeva era una
   * piattaforma rettangolare in mezzo al mare.
   *
   * Guarda i quattro assi e non il quadrato, per la stessa ragione di
   * `seesWater` in `sites/`: e' la domanda opposta con lo stesso costo, e una
   * colonna raggiungibile solo in diagonale e' comunque una colonna a cui
   * conviene non allungare la banchina.
   */
  private nearLand(x: number, y: number): boolean {
    if (isDryLand(this.terrainMap.biomeAt(x, y))) return true;

    for (let d = 1; d <= GRADING.quayReach; d++) {
      for (const [dx, dy] of QUAY_AXES) {
        const cx = x + dx * d;
        const cy = y + dy * d;
        if (!this.terrainMap.has(cx, cy)) continue;
        if (isDryLand(this.terrainMap.biomeAt(cx, cy))) return true;
      }
    }
    return false;
  }

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
        if (this.registryImpl.isOccupied(cx, cy)) return false;
        // Dalla 4.2 la battigia e il fianco in pendenza sono lotti come gli
        // altri: costano un'opera, non un rifiuto. Restano fuori solo la roccia
        // e l'acqua troppo profonda per una banchina.
        if (this.groundKindAt(cx, cy) === GROUND.refused) return false;
        // E l'acqua che una banchina reggerebbe ma che nessuno vorrebbe
        // edificata: un lotto al largo poggia su un pad isolato in mezzo al
        // mare, che e' lo stesso difetto dell'anello di carreggiata.
        if (!this.nearLand(cx, cy)) return false;
        if (this.blacklist.has(`${cx},${cy}`)) return false;
      }
    }
    return true;
  }

  private canPaintSurface(x: number, y: number): boolean {
    return this.groundKindAt(x, y) !== GROUND.refused && !this.registryImpl.isOccupied(x, y);
  }

  private enqueueSurface(paint: SurfacePaint): void {
    if (!this.canPaintSurface(paint.x, paint.y)) return;
    const key = `${paint.x},${paint.y}`;
    if (paint.priority < (this.surfacePriority.get(key) ?? 0)) return;
    const current = this.surfacePending.get(key);
    if (current !== undefined) {
      if (paint.priority > current.priority) this.surfacePending.set(key, paint);
      return;
    }
    this.surfacePending.set(key, paint);
    this.surfaceQueue.push(key);
  }

  /**
   * Applica la superficie a budget.
   *
   * Il budget conta **voxel scritti, non celle**: una cella su un molo puo'
   * costarne sei, e contarla come una lascerebbe passare nello stesso frame sei
   * volte il lavoro previsto proprio dove il terreno e' piu' mosso — cioe' dove
   * il frame e' gia' piu' caro. Una cella iniziata si finisce comunque, per non
   * lasciare mezzo muro in piedi fra un frame e l'altro.
   */
  private stepSurface(): void {
    let written = 0;
    while (this.surfaceHead < this.surfaceQueue.length && written < BUILDER.surfaceVoxelsPerFrame) {
      const key = this.surfaceQueue[this.surfaceHead++];
      const paint = this.surfacePending.get(key);
      if (paint === undefined) continue;
      this.surfacePending.delete(key);
      if (!this.canPaintSurface(paint.x, paint.y)) continue;

      const ground = this.terrainMap.heightAt(paint.x, paint.y);
      const deck = Math.max(paint.deck ?? ground, ground);
      this.clearDecorColumn(paint.x, paint.y);

      if (paint.wall !== undefined) {
        for (let z = ground; z < deck - 1; z++) {
          this.world.setBlock(paint.x, paint.y, z, z === deck - 2 && paint.coping !== undefined
            ? paint.coping
            : paint.wall, SURFACE_KIND.utility);
          written++;
        }
      }

      this.world.setBlock(paint.x, paint.y, deck - 1, paint.palette);
      this.surfacePriority.set(key, paint.priority);
      written++;
    }

    if (this.surfaceHead >= this.surfaceQueue.length) {
      this.surfaceQueue.length = 0;
      this.surfaceHead = 0;
    }
  }

  // --- Budget di chunk -------------------------------------------------------

  /**
   * Chunk che l'edificio marcherebbe sporchi, fondazione inclusa.
   *
   * Conta anche i vicini che una scrittura su cella di bordo costringe a
   * rimeshare, e li conta **senza chiedersi se esistono gia'**: un tetto che
   * vale solo finche' il chunk accanto non e' stato allocato non e' un tetto. La
   * stima e' quindi per eccesso, e qualche sito perfettamente buono viene
   * scartato come `chunkBudget` — sono le posizioni a cavallo di due cuciture,
   * meno dell'uno per cento della mappa.
   */
  private dirtyChunkCount(
    x: number,
    y: number,
    footprint: number,
    minZ: number,
    maxZ: number,
    footprintY: number = footprint,
  ): number {
    const keys = new Set<string>();

    const cx0 = toChunk(x);
    const cx1 = toChunk(x + footprint - 1);
    const cy0 = toChunk(y);
    const cy1 = toChunk(y + footprintY - 1);
    const cz0 = toChunk(minZ);
    const cz1 = toChunk(maxZ - 1);

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
      }
    }

    // Un vicino si aggiunge una volta per ogni combinazione delle altre due
    // coordinate di chunk: la faccia intera va rimeshata, non una cella.
    for (const cx of edgeChunks(x, x + footprint - 1)) {
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cy = cy0; cy <= cy1; cy++) keys.add(keyOf(cx, cy, cz));
      }
    }
    for (const cy of edgeChunks(y, y + footprintY - 1)) {
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
      }
    }
    for (const cz of edgeChunks(minZ, maxZ - 1)) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
      }
    }

    return keys.size;
  }

  private reject(key: string, reason: RejectReason): null {
    this.blacklist.add(key);
    this.rejectedCounts[REJECT_REASONS.indexOf(reason)]++;
    return null;
  }
}

/** I quattro assi cardinali, per la ricerca della terra da una colonna d'acqua. */
const QUAY_AXES: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Nessun vicino: chi costruisce a coordinate date non ha un fronte da guardare. */
const EMPTY_TERMS: readonly ClusterTerms[] = [];

/**
 * Coordinate di chunk dei vicini che una scrittura su `[min, max]` marcherebbe.
 *
 * Sono al massimo due — uno sotto e uno sopra — perche' l'intervallo e' corto e
 * le celle di bordo di un chunk distano 32.
 */
function edgeChunks(min: number, max: number): readonly number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v++) {
    if (toLocal(v) === 0) out.push(toChunk(v) - 1);
    else if (toLocal(v) === CHUNK - 1) out.push(toChunk(v) + 1);
  }
  return out;
}

/** Cosa serve al Builder per valutare un sito. */
interface PlaceRequest {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
  readonly mixed?: BuildingClass;
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

function formOf(profile: LocalUrbanProfile | null): BuildingForm {
  if (profile === null) return DEFAULT_BUILDING_FORM;
  return {
    density: profile.density,
    wealth: profile.wealth,
    accessibility: profile.accessibility,
    satisfaction: profile.satisfaction,
  };
}

function localLevelBonus(form: BuildingForm): number {
  const weight = BUILDER.localLevel;
  return Math.floor(
    form.density * weight.density +
    form.wealth * weight.wealth +
    form.accessibility * weight.accessibility +
    form.satisfaction * weight.satisfaction,
  );
}

function localUpgradeDiscount(form: BuildingForm): number {
  const weight = BUILDER.localUpgrade;
  return Math.min(
    weight.maxDiscount,
    Math.floor(
      form.density * weight.density +
      form.wealth * weight.wealth +
      form.accessibility * weight.accessibility +
      form.satisfaction * weight.satisfaction,
    ),
  );
}
