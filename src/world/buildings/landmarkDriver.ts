import {
  BALANCE,
  catalystById,
  catalystRoleOf,
  removeBuildings,
  setCatalystStrength,
  type Building,
  type BuildingClass,
  type CatalystId,
  type SimState,
} from '../../sim';
import { hashCoords } from '../rng';
import { GRADING } from '../grading/config';
import { GROUND } from '../grading/grade';
import { FACING, type Facing } from '../streets/streetGrid';
import { waterFacing } from '../sites/siteRules';
import { SITE } from '../sites/config';
import { LANDMARK, landmarkOf, maxStageOf } from '../landmarks/config';
import {
  generateLandmark,
  landmarkOrigin,
  landmarkSpan,
  stageForBuildings,
} from '../landmarks/generate';
import {
  footprintDepth,
  type BuildingRecord,
  type ReadonlyBuildingRegistry,
} from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { fitsChunkBudget } from './chunkBudget';
import {
  CLEARANCE_KIND,
  planClearance,
  type ClearanceRecord,
  type ClearanceRefusal,
} from './clearance';
import { BUILDER, CLASS_PROFILE } from './config';
import { anchorOf } from './growthQueue';
import { recordStamp } from './recordStamp';
import { buildWorks, groundKindAt, surveyGrade } from './siteWorks';
import type { SpanDriver } from './spanDriver';
import { EMPTY_STAMP } from './stamp';

/**
 * I monumenti dei catalizzatori: il piazzamento, il grembiule e gli stadi.
 *
 * **Un landmark e' un edificio con un altro generatore**, ed e' per questo che
 * vive accanto al Builder invece che dentro: entra nel registry come un record
 * qualunque e da li' eredita collisione, budget di chunk e comparsa a budget
 * senza una riga in piu'. Cio' che ha di proprio — quale ricetta lo disegna,
 * come si orienta, cosa lo fa avanzare di stadio — sta tutto qui.
 *
 * `level` e' lo **stadio**, non il livello urbano, e i record con `landmark`
 * restano fuori dagli istogrammi: la simulazione non li ha mai contati come
 * edifici, e continua a non sapere che esistono (invariante 7).
 */
/** Cosa il piazzamento di un landmark trova nel suo riquadro. */
export interface LandmarkSite {
  /** Edifici che porterebbe via. Zero dove il riquadro e' gia' libero. */
  readonly clears: number;
  /** Perche' non ci si puo' piantare, o null. */
  readonly refusal: ClearanceRefusal | null;
}

/** Riquadro gia' libero, o ruolo senza una ricetta da piantarci. */
const OPEN_SITE: LandmarkSite = { clears: 0, refusal: null };

/**
 * Un riquadro che si sta sgomberando, e cosa deve ancora cadere.
 *
 * I condannati **restano nel registry** finche' i loro voxel non sono spariti,
 * ed e' la parte che fa funzionare tutto il resto: il riquadro resta prenotato
 * da cio' che si sta abbattendo, non c'e' una finestra in cui il sito legge
 * libero con i voxel ancora dentro, e la passata di upgrade li salta da sola
 * perche' li vede in coda di comparsa.
 */
interface Demolition {
  readonly x: number;
  readonly y: number;
  readonly kind: CatalystId;
  readonly doomed: Map<number, BuildingRecord>;
}

export class LandmarkDriver {
  /** Cantieri aperti. Quasi sempre vuoto: e' un gesto del giocatore, non del tick. */
  private readonly sites: Demolition[] = [];

  private clearedCount = 0;

  constructor(
    private readonly ctx: BuildContext,
    private readonly spans: SpanDriver,
  ) {}

  /** Cantieri aperti ed edifici gia' portati via, per l'overlay di debug. */
  get clearing(): number {
    return this.sites.length;
  }

  get cleared(): number {
    return this.clearedCount;
  }

  /**
   * Costruisce il landmark di un catalizzatore, con il suo grembiule attorno.
   *
   * **Ha sostituito `decorateCatalyst`, che dipingeva un rombo di asfalto.**
   * Quel rombo era identico per tutti e otto i ruoli — cambiava il colore di un
   * voxel — e il porto in particolare non aveva nessuna struttura: quello che si
   * vedeva sull'acqua era la carreggiata dell'isolato costiero.
   *
   * **L'ingombro e' quello finale, riservato subito.** Uno stadio non allarga
   * mai l'impronta: la riempie. Cosi' un landmark non puo' restare bloccato a
   * meta' perche' nel frattempo e' cresciuto un edificio accanto, e la sagoma
   * dello stadio precedente non ha mai niente da cancellare.
   *
   * Un ruolo senza ricetta ottiene il solo grembiule, che e' esattamente cio'
   * che tutti e otto avevano prima.
   */
  place(x: number, y: number, kind: CatalystId): void {
    const built = this.buildStructure(x, y, kind);
    if (built !== null) this.paintApron(built, landmarkOf(kind)!.apron);
    // **Il riquadro pieno non e' piu' un rifiuto muto.** Finche' la struttura
    // poteva solo nascere su terreno vergine, un catalizzatore piantato in
    // centro si pagava e non si vedeva: nessun record, quindi nessuno stadio,
    // quindi un monumento invisibile per sempre. Adesso apre un cantiere, e la
    // struttura arriva quando il riquadro e' sgombero.
    else if (!this.open(x, y, kind)) this.paintPlaza(x, y, catalystById(kind).class);
    // Il grembiule da solo sarebbe una macchia in mezzo al verde: accodare
    // l'isolato che lo contiene lo porta contro una carreggiata vera.
    this.ctx.surface.enqueueBlockStreets(this.ctx.streets.blockAt(x, y));
  }

  /**
   * Cosa il piazzamento troverebbe qui, senza toccare niente.
   *
   * E' la domanda del cursore, e **la stessa che fa il click**: se rispondesse
   * con criteri diversi, "Valid position" tornerebbe a essere un'opinione. Non
   * consulta il terreno — a dire se l'opera regge e' `buildStructure`, al
   * momento di costruire — perche' qui interessa solo cosa e' gia' costruito.
   */
  siteAt(x: number, y: number, kind: CatalystId): LandmarkSite {
    const box = this.footprintOf(x, y, kind);
    if (box === null) return OPEN_SITE;

    const records = recordsIn(this.ctx.registry, box);
    if (records.length === 0) return OPEN_SITE;

    const plan = planClearance(
      records.map((record) => this.clearanceOf(record)),
      BALANCE.gameplay.catalyst.clearing,
    );
    return { clears: plan.doomed.length, refusal: plan.refusal };
  }

  /**
   * Miete i condannati che hanno finito di sparire, e chiude i cantieri vuoti.
   *
   * **Un record si toglie dal registry solo quando i suoi voxel non ci sono
   * piu'.** Toglierlo prima aprirebbe una finestra in cui il suolo legge libero
   * mentre l'edificio e' ancora li': un lotto ci nascerebbe dentro, e la
   * cancellazione in coda gli mangerebbe i voxel. E' la stessa ragione per cui
   * una campata si cancella di colpo invece che a rate — li' il volume e'
   * piccolo abbastanza da permetterselo, qui no.
   *
   * La spazzata finale su ciascun volume e' quasi gratis — `clearVolume` salta
   * le celle gia' vuote, e a questo punto lo sono quasi tutte — e serve a una
   * cosa sola: se la sagoma rigenerata divergesse anche di un voxel da quella
   * scritta, resterebbe un moncone dentro il riquadro del landmark.
   */
  clearancePass(state: SimState): SimState {
    if (this.sites.length === 0) return state;

    const { registry, growth } = this.ctx;
    const gone: Building[] = [];

    for (let i = this.sites.length - 1; i >= 0; i--) {
      const site = this.sites[i];

      for (const [id, record] of site.doomed) {
        if (growth.isGrowing(id)) continue;

        growth.clearVolume(
          record.x,
          record.y,
          record.footprint,
          footprintDepth(record),
          record.baseZ,
          record.baseZ + record.height,
        );
        site.doomed.delete(id);
        this.clearedCount++;

        // Due cantieri sovrapposti possono aver condannato lo stesso record: il
        // primo che lo miete lo toglie davvero, e il secondo non deve dirlo alla
        // simulazione una seconda volta, o le toglierebbe un edificio che non
        // esiste.
        if (registry.remove(id)) gone.push(simBuildingOf(record));
      }

      if (site.doomed.size > 0) continue;
      this.sites.splice(i, 1);
      this.finish(site);
    }

    return gone.length === 0 ? state : removeBuildings(state, gone);
  }

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
   * registry. **Non scende**, e adesso che lo sventramento demolisce e' una
   * garanzia esplicita e non piu' una conseguenza: il confronto con
   * `record.level` fa avanzare e basta, quindi un quartiere che perde edifici
   * non fa arretrare il monumento che li ha visti costruire.
   *
   * **Il ritorno alla simulazione e' un numero, non un meccanismo.** Un landmark
   * cresciuto rende il proprio catalizzatore un po' piu' forte, e lo fa da
   * `setCatalystStrength`, che esisteva gia': `src/sim/` continua a non sapere
   * cosa sia un landmark (invariante 7).
   */
  pass(state: SimState): SimState {
    let next = state;
    let advanced = 0;

    for (const record of this.ctx.registry.all) {
      if (advanced >= LANDMARK.stagesPerPass) break;
      if (this.ctx.growth.queued >= BUILDER.maxGrowing) break;

      const kind = record.landmark;
      if (kind === undefined) continue;
      if (this.ctx.growth.isGrowing(record.id)) continue;

      const recipe = landmarkOf(kind);
      if (recipe === null || record.level >= maxStageOf(recipe)) continue;

      // Il catalizzatore si ritrova dal riquadro e non da `record.x`, che e'
      // l'angolo minimo dell'ingombro: la colonna cliccata sta dentro il
      // riquadro ma quasi mai nel suo spigolo, perche' e' la ricetta a dire
      // dove cade — la banchina sotto il dito, il molo davanti.
      const index = catalystIn(next, record, kind);
      if (index === -1) continue;

      const catalyst = next.catalysts[index];
      const definition = catalystById(kind);
      const nearby = this.ctx.registry.withinRadius(
        catalyst.x, catalyst.y, definition.radius,
      ).length;
      if (stageForBuildings(recipe, nearby) <= record.level) continue;

      next = this.advance(next, record, kind, index);
      advanced++;
    }

    return next;
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
  private facingAt(x: number, y: number, kind: CatalystId): Facing {
    if (catalystById(kind).site === 'coastal') {
      const water = waterFacing(this.ctx.terrain, x, y, SITE.coastalRadius);
      if (water !== null) return water;
    }
    return this.ctx.streets.facingOf(x, y, 1)
      ?? ((hashCoords(this.ctx.seed, x, y) & 3) as Facing);
  }

  /**
   * Apre il cantiere: condanna cio' che occupa il riquadro e ne accoda la fine.
   *
   * **La demolizione passa dalla coda di comparsa, non da una passata sua.** Un
   * volume da togliere accodato con una sagoma vuota come "nuova" non scrive
   * niente e cancella tutto, a budget: la stessa macchina che fa salire un
   * edificio voxel per voxel lo fa scendere, e il cantiere si sgombera al ritmo
   * a cui la citta' cresce senza che nessuno lo abbia dovuto tarare.
   *
   * Le campate che poggiavano su un condannato cadono con lui, ed e' il vincolo
   * che c'era gia': segue o sparisce, mai resta a mezz'aria.
   */
  private open(x: number, y: number, kind: CatalystId): boolean {
    const box = this.footprintOf(x, y, kind);
    if (box === null) return false;

    const records = recordsIn(this.ctx.registry, box);
    const plan = planClearance(
      records.map((record) => this.clearanceOf(record)),
      BALANCE.gameplay.catalyst.clearing,
    );
    if (plan.refusal !== null || plan.doomed.length === 0) return false;

    const byId = new Map(records.map((record) => [record.id, record]));
    const doomed = new Map<number, BuildingRecord>();

    for (const id of plan.doomed) {
      const record = byId.get(id);
      if (record === undefined) continue;
      this.spans.dropSupportedBy(id);
      this.ctx.growth.enqueue(id, anchorOf(record), EMPTY_STAMP, recordStamp(record));
      doomed.set(id, record);
    }
    if (doomed.size === 0) return false;

    this.sites.push({ x, y, kind, doomed });
    this.paintFence(box);
    return true;
  }

  /** Chiude un cantiere: sul riquadro sgombero ci sta la struttura che lo ha aperto. */
  private finish(site: Demolition): void {
    const built = this.buildStructure(site.x, site.y, site.kind);
    if (built === null) this.paintPlaza(site.x, site.y, catalystById(site.kind).class);
    else this.paintApron(built, landmarkOf(site.kind)!.apron);
  }

  /**
   * Il recinto: l'anello attorno al riquadro, finche' il cantiere e' aperto.
   *
   * Sara' il grembiule a sostituirlo quando la struttura viene su — stessa
   * cornice, colore diverso — e il cambio di colore e' il solo momento in cui il
   * cantiere dichiara di aver finito.
   */
  private paintFence(box: Footprint): void {
    for (let py = box.y - 1; py <= box.y + box.sizeY; py++) {
      for (let px = box.x - 1; px <= box.x + box.sizeX; px++) {
        const edge = px < box.x || py < box.y ||
          px >= box.x + box.sizeX || py >= box.y + box.sizeY;
        if (!edge) continue;
        this.ctx.surface.enqueue({ x: px, y: py, palette: LANDMARK.fencePalette, priority: 1 });
      }
    }
  }

  /** L'ingombro che la ricetta occuperebbe cliccando qui, o null se non ne ha una. */
  private footprintOf(x: number, y: number, kind: CatalystId): Footprint | null {
    const facing = this.facingAt(x, y, kind);
    const span = landmarkSpan(kind, facing);
    const origin = landmarkOrigin(kind, facing, x, y);
    if (span === null || origin === null) return null;
    return { x: origin.x, y: origin.y, sizeX: span.sizeX, sizeY: span.sizeY };
  }

  /**
   * Come la regola dello sventramento deve leggere un record.
   *
   * `carries` sta accanto ad `aerial`, e non e' un caso a parte: un edificio che
   * ospita una mensola o porta una gamba **e'** citta' in quota, vista da sotto.
   * Farlo cadere farebbe cadere quello che ci sta sopra, e sarebbe la
   * demolizione a cascata che questa fase non vuole.
   */
  private clearanceOf(record: BuildingRecord): ClearanceRecord {
    const kind = record.span !== undefined
      ? CLEARANCE_KIND.span
      : record.landmark !== undefined || record.aerial !== undefined ||
        this.ctx.registry.carries(record.id)
        ? CLEARANCE_KIND.structure
        : CLEARANCE_KIND.building;
    return { id: record.id, level: record.level, kind };
  }

  /** Costruisce la struttura e ne restituisce il record, o null se il luogo non la regge. */
  private buildStructure(x: number, y: number, kind: CatalystId): BuildingRecord | null {
    const { world, terrain, registry, growth, surface, seed } = this.ctx;
    const facing = this.facingAt(x, y, kind);
    const span = landmarkSpan(kind, facing);
    const origin = landmarkOrigin(kind, facing, x, y);
    if (span === null || origin === null) return null;

    // Il seme del record si calcola qui e non alla riga di `registry.add`: lo
    // legge anche il generatore, per scegliere l'esemplare, e le due risposte
    // devono venire dallo stesso intero. Altrimenti la sagoma scritta non
    // sarebbe quella che il record dichiara, e un avanzamento — che il seme lo
    // rilegge dal record — ne ritroverebbe un'altra.
    const recordSeed = hashCoords(seed, x, y);
    const stamp = generateLandmark({ kind, stage: 0, facing, seed: recordSeed });
    if (stamp === null) return null;

    // `surveyGrade` e non il vincolo `nearLand` che ferma la carreggiata: un
    // molo **deve** poter uscire sull'acqua. Il limite qui e' la ricetta — un
    // ingombro dichiarato e finito — invece di una regola sul terreno, ed e' la
    // differenza fra una struttura progettata e una piattaforma che si allarga
    // finche' il fondale regge.
    const plan = surveyGrade(terrain, origin.x, origin.y, span.sizeX, span.sizeY);
    if (plan === null) return null;
    if (registry.overlaps(origin.x, origin.y, span.sizeX, plan.padZ, span.sizeZ, span.sizeY)) {
      return null;
    }
    if (!fitsChunkBudget(origin.x, origin.y, span.sizeX, span.sizeY, plan, stamp)) {
      return null;
    }

    surface.clearSiteDecor(origin.x, origin.y, span.sizeX, span.sizeY);
    buildWorks(world, terrain, origin.x, origin.y, span.sizeX, plan, span.sizeY);

    const record = registry.add({
      x: origin.x,
      y: origin.y,
      baseZ: plan.padZ,
      footprint: span.sizeX,
      footprintY: span.sizeY,
      height: span.sizeZ,
      class: catalystById(kind).class,
      level: 0,
      seed: recordSeed,
      facing,
      landmark: kind,
    });

    growth.enqueueSegments(record, stamp);
    return record;
  }

  /**
   * La cornice di suolo pubblico attorno a una struttura.
   *
   * E' un **anello attorno all'ingombro**, non un rombo attorno al click: con la
   * struttura al centro un rombo di raggio quattro finirebbe tutto sotto il
   * pavimento, e il filtro della coda lo scarterebbe colonna per colonna
   * lasciando il landmark posato sull'erba.
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
        this.ctx.surface.enqueue({ x: px, y: py, palette: LANDMARK.apronPalette, priority: 1 });
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
        this.ctx.surface.enqueue({
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
        if (groundKindAt(this.ctx.terrain, x + dx, y + dy) === GROUND.refused) continue;
        const height = this.ctx.terrain.heightAt(x + dx, y + dy);
        if (height < lowest) lowest = height;
        if (height > highest) highest = height;
      }
    }
    if (highest === 0 || highest - lowest < GRADING.plazaMinStep) return undefined;
    return highest;
  }

  /**
   * Scrive lo stadio successivo di un landmark.
   *
   * Non c'e' niente da cancellare, e non e' una scorciatoia: gli stadi sono
   * cumulativi dentro un riquadro che non cambia mai, quindi lo stadio nuovo
   * copre sempre il vecchio. E' anche il motivo per cui non serve rivalidare il
   * terreno o l'occupazione — l'ingombro e' lo stesso riservato al piazzamento.
   */
  private advance(
    state: SimState,
    record: BuildingRecord,
    kind: CatalystId,
    catalystIndex: number,
  ): SimState {
    const stage = record.level + 1;
    const facing = (record.facing ?? FACING.east) as Facing;
    // Lo stesso seme del piazzamento, che il record conserva: un avanzamento
    // deve ritrovare l'esemplare gia' scritto, non sceglierne un altro. E' anche
    // cio' che tiene vero l'invariante su cui poggia tutta questa funzione — lo
    // stadio nuovo copre il vecchio — perche' due esemplari diversi non si
    // coprono affatto, e la sagoma di prima resterebbe a pezzi in giro.
    const stamp = generateLandmark({ kind, stage, facing, seed: record.seed });
    if (stamp === null) return state;

    const replaced = this.ctx.registry.replace(record.id, { ...record, level: stage });
    if (replaced === null) return state;

    this.ctx.growth.enqueueSegments(replaced, stamp);

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
}

/**
 * Indice del catalizzatore che questo landmark rappresenta, o -1.
 *
 * Chiede **il ruolo e il riquadro insieme**: un ingombro largo venti colonne
 * ne contiene facilmente due, e il solo riquadro rinforzerebbe il mercato
 * accanto invece del porto che quella struttura e'.
 */
function catalystIn(state: SimState, record: BuildingRecord, kind: CatalystId): number {
  const depth = footprintDepth(record);
  return state.catalysts.findIndex((catalyst) =>
    catalystRoleOf(catalyst) === kind &&
    catalyst.x >= record.x && catalyst.x < record.x + record.footprint &&
    catalyst.y >= record.y && catalyst.y < record.y + depth);
}

/** L'ingombro in pianta di una ricetta, gia' portato sul verso vero. */
interface Footprint {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

/**
 * I record distinti che stanno dentro un riquadro, a qualunque quota.
 *
 * **Non guarda le quote, e non e' una svista.** `overlaps` le confronta perche'
 * deve dire se due volumi si toccano; qui la domanda e' un'altra — «questo
 * riquadro e' impegnato?» — e cio' che sta sopra un landmark alto venti voxel e'
 * una mensola o una campata, cioe' i due casi che la regola tratta comunque a
 * parte. Guardare la colonna intera e' quindi piu' severo di quanto serva
 * esattamente dove la severita' non cambia la risposta, e costa una lettura in
 * meno per colonna.
 */
function recordsIn(registry: ReadonlyBuildingRegistry, box: Footprint): BuildingRecord[] {
  const found = new Map<number, BuildingRecord>();
  for (let dy = 0; dy < box.sizeY; dy++) {
    for (let dx = 0; dx < box.sizeX; dx++) {
      for (const record of registry.at(box.x + dx, box.y + dy)) {
        found.set(record.id, record);
      }
    }
  }
  return [...found.values()];
}

/**
 * Un record come la simulazione lo aveva contato.
 *
 * Un'impronta di otto colonne e' **un** edificio per `src/sim/`, registrato
 * sulla sua origine: e' la stessa coppia che `buildPass` le aveva passato, ed e'
 * l'unica con cui si puo' ritrovare cio' che va tolto.
 */
function simBuildingOf(record: BuildingRecord): Building {
  return record.mixed === undefined
    ? { x: record.x, y: record.y, class: record.class }
    : { x: record.x, y: record.y, class: record.class, mixed: record.mixed };
}
