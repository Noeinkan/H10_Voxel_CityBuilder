import { addBuilding, removeBuildings, type Building, type SimState } from '../../sim';
import {
  footprintDepth,
  type BuildingRecord,
  type ReadonlyBuildingRegistry,
} from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import {
  CLEARANCE_KIND,
  planClearance,
  type ClearanceKind,
  type ClearanceRecord,
  type ClearanceRefusal,
  type ClearanceRule,
} from './clearance';
import { BUILDER, typologyById } from './config';
import { anchorOf } from './growthQueue';
import { recordStamp } from './recordStamp';
import type { SpanDriver } from './spanDriver';
import { EMPTY_STAMP } from './stamp';
import { STRUCTURE_KIND, structureKindOf } from './structureKind';

/**
 * Il cantiere: come una struttura grossa si fa spazio dentro la citta' costruita.
 *
 * **Viveva dentro `landmarkDriver.ts`, e non era roba dei landmark.** Un
 * riquadro da sgomberare, dei condannati che spariscono a budget, un recinto
 * finche' dura e una richiamata quando e' vuoto: niente di tutto questo sa cosa
 * ci verra' costruito sopra. A dirlo e' stata l'arcologia, che ne ha bisogno per
 * la stessa ragione e con un'altra regola — una seconda copia divergerebbe al
 * primo caso limite, e i casi limite qui sono la parte difficile.
 *
 * **Uno solo per Builder.** I cantieri aperti sono quasi sempre zero e non ha
 * senso che due domini tengano due liste: `pass` scorre l'unica, e due cantieri
 * che avessero condannato lo stesso record si accorgono l'uno dell'altro invece
 * di dirlo due volte alla simulazione.
 *
 * **La demolizione passa dalla coda di comparsa, non da una passata sua.** Un
 * volume da togliere accodato con una sagoma vuota come "nuova" non scrive
 * niente e cancella tutto, a budget: la stessa macchina che fa salire un
 * edificio voxel per voxel lo fa scendere, e il cantiere si sgombera al ritmo a
 * cui la citta' cresce senza che nessuno lo abbia dovuto tarare.
 */

/** L'ingombro in pianta che una struttura si riserva. */
export interface ClearanceBox {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

/** Cosa il piazzamento troverebbe in un riquadro, senza toccare niente. */
export interface ClearanceVerdict {
  /** Edifici che porterebbe via. Zero dove il riquadro e' gia' libero. */
  readonly clears: number;
  /**
   * Quanti dei condannati sono **landmark**.
   *
   * E' il numero che distingue «demolisco il costruito» da «demolisco un
   * monumento»: chi piazza a mano accetta entrambi, chi sceglie un posto per
   * un'opera automatica — la decisione concessa — puo' voler risparmiare i
   * monumenti e cercare altrove.
   */
  readonly landmarks: number;
  /** Perche' non ci si puo' piantare, o null. */
  readonly refusal: ClearanceRefusal | null;
}

/** Riquadro gia' libero. */
export const OPEN_SITE: ClearanceVerdict = { clears: 0, landmarks: 0, refusal: null };

interface Site {
  readonly box: ClearanceBox;
  readonly doomed: Map<number, BuildingRecord>;
  /** La fotografia dei condannati al momento dell'apertura: serve all'annullamento. */
  readonly original: readonly BuildingRecord[];
  /** Vero se il giocatore puo' annullare questo cantiere: solo la gomma. */
  readonly undoable: boolean;
  readonly onFinish: () => void;
}

export class ClearanceSites {
  /** Cantieri aperti. Quasi sempre vuoto: sono gesti rari, non un fatto del tick. */
  private readonly sites: Site[] = [];

  private clearedCount = 0;

  constructor(
    private readonly ctx: BuildContext,
    private readonly spans: SpanDriver,
  ) {}

  get open(): number {
    return this.sites.length;
  }

  get cleared(): number {
    return this.clearedCount;
  }

  /**
   * Cosa il riquadro porterebbe via, o perche' rifiuta. **Non scrive.**
   *
   * E' la domanda del cursore, e **la stessa che fa il click**: se rispondesse
   * con criteri diversi, "Valid position" tornerebbe a essere un'opinione.
   */
  survey(box: ClearanceBox, rule: ClearanceRule): ClearanceVerdict {
    const records = recordsIn(this.ctx.registry, box);
    if (records.length === 0) return OPEN_SITE;

    const plan = planClearance(
      records.map((record) => clearanceOf(this.ctx.registry, record)),
      rule,
    );
    const landmarks = records.filter((record) =>
      clearanceOf(this.ctx.registry, record).kind === CLEARANCE_KIND.landmark &&
      plan.doomed.includes(record.id)).length;
    return { clears: plan.doomed.length, landmarks, refusal: plan.refusal };
  }

  /**
   * Apre il cantiere: condanna cio' che occupa il riquadro e ne accoda la fine.
   *
   * `onFinish` scatta quando l'ultimo condannato e' sparito davvero — non quando
   * e' stato condannato — perche' fino a quel momento il suolo legge occupato e
   * la struttura non ci starebbe.
   *
   * Le campate che poggiavano su un condannato cadono con lui, ed e' il vincolo
   * che c'era gia': segue o sparisce, mai resta a mezz'aria.
   */
  start(
    box: ClearanceBox,
    rule: ClearanceRule,
    onFinish: () => void,
    options: { readonly fence?: boolean; readonly undoable?: boolean } = {},
  ): boolean {
    const records = recordsIn(this.ctx.registry, box);
    const plan = planClearance(
      records.map((record) => clearanceOf(this.ctx.registry, record)),
      rule,
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

    this.sites.push({ box, doomed, original: [...doomed.values()], undoable: options.undoable === true, onFinish });
    // Il riquadro si prenota per intero: la citta' continua a crescere mentre
    // il cantiere demolisce, e senza questa prenotazione gli angoli liberi del
    // riquadro si riempirebbero prima che la struttura arrivi — il preventivo
    // prometterebbe un posto che a meta' cantiere non esiste piu'.
    this.ctx.registry.reserveRect({ x: box.x, y: box.y, sizeX: box.sizeX, sizeY: box.sizeY });
    // La gomma non dipinge il recinto: li' non arriva nessuna struttura a
    // sostituire il vuoto, e un anello di recinto attorno a un prato rasato
    // resterebbe per sempre a dire "cantiere" di una cosa che non ci sara'.
    if (options.fence !== false) this.paintFence(box);
    return true;
  }

  /**
   * I record dentro il riquadro, divisi fra chi cadrebbe e chi resta in piedi.
   *
   * Serve all'anteprima della gomma: il giocatore deve vedere **quali** edifici
   * stanno per cadere, non solo quanti. `protected` raccoglie cio' che la regola
   * non tocca — la rete in quota, le arcologie, chi le porta — e che quindi
   * manda il riquadro in rifiuto se presente.
   */
  preview(box: ClearanceBox, rule: ClearanceRule): {
    readonly doomed: readonly BuildingRecord[];
    readonly protected: readonly BuildingRecord[];
  } {
    const records = recordsIn(this.ctx.registry, box);
    const plan = planClearance(
      records.map((record) => clearanceOf(this.ctx.registry, record)),
      rule,
    );
    const doomedIds = new Set(plan.doomed);
    const doomed: BuildingRecord[] = [];
    const protectedRecords: BuildingRecord[] = [];
    for (const record of records) {
      if (doomedIds.has(record.id)) {
        doomed.push(record);
        continue;
      }
      // Le campate cadono da sole e non sono un ostacolo: non si mostrano.
      if (clearanceOf(this.ctx.registry, record).kind === CLEARANCE_KIND.structure) {
        protectedRecords.push(record);
      }
    }
    return { doomed, protected: protectedRecords };
  }

  /**
   * Annulla l'ultimo cantiere della gomma, ricostruendo tutto cio' che stava
   * portando via.
   *
   * **Vale per ogni condannato, gia' rimosso o no.** Chi e' ancora nel registro
   * — la cancellazione dei suoi voxel e' in corso — si ferma e ricresce; chi era
   * gia' stato rimosso torna nel registro con la sua identita' e i suoi voxel
   * ripartono dalla coda di comparsa. Il conto si rifa alla simulazione con
   * `addBuilding`, una voce per edificio vero: i landmark non sono mai stati
   * contati, e non lo tornano adesso.
   */
  undo(state: SimState): { readonly state: SimState; readonly restored: number } {
    let index = -1;
    for (let i = this.sites.length - 1; i >= 0; i--) {
      if (this.sites[i].undoable) {
        index = i;
        break;
      }
    }
    if (index < 0) return { state, restored: 0 };

    const site = this.sites.splice(index, 1)[0];
    this.ctx.registry.releaseRect(site.box);

    const reinsert: Building[] = [];
    for (const record of site.original) {
      const gone = this.ctx.registry.get(record.id) === null;
      // Prima si ferma la cancellazione in corso, poi si ri-accoda lo stamp
      // vero: il volume ricresce a budget, com'era comparso.
      this.ctx.growth.cancel(record.id);
      this.ctx.growth.enqueue(record.id, anchorOf(record), recordStamp(record));

      if (gone) {
        this.ctx.registry.restore(record);
        // Solo gli edifici veri tornano alla simulazione: un landmark non vi e'
        // mai entrato, e ri-aggiungerlo lo conterebbe come una casa in piu'.
        if (clearanceOf(this.ctx.registry, record).kind === CLEARANCE_KIND.building) {
          reinsert.push(undoBuildingOf(record));
        }
      }
    }

    let next = state;
    for (const building of reinsert) next = addBuilding(next, building);
    return { state: next, restored: site.original.length };
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
   * scritta, resterebbe un moncone dentro il riquadro della struttura.
   */
  pass(state: SimState): SimState {
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
      // La prenotazione cade **prima** della richiamata: la struttura che sta
      // per comparire deve vedere il proprio posto libero, e da quel momento
      // il riquadro e' suo.
      this.ctx.registry.releaseRect(site.box);
      site.onFinish();
    }

    return gone.length === 0 ? state : removeBuildings(state, gone);
  }

  /**
   * Il recinto: l'anello attorno al riquadro, finche' il cantiere e' aperto.
   *
   * **Un cantiere deve leggersi come un cantiere**, non come un buco. Fra
   * l'apertura e la struttura passano diverse passate — gli edifici cadono uno
   * per volta, a budget — e senza un segno il giocatore vede solo case che
   * spariscono senza sapere perche'. Il colore del recinto e' il piu' lontano
   * dall'asfalto che lo sostituira': il passaggio da recinto a suolo pubblico si
   * vede, ed e' il modo in cui il cantiere dichiara di aver finito.
   */
  private paintFence(box: ClearanceBox): void {
    for (let py = box.y - 1; py <= box.y + box.sizeY; py++) {
      for (let px = box.x - 1; px <= box.x + box.sizeX; px++) {
        const edge = px < box.x || py < box.y ||
          px >= box.x + box.sizeX || py >= box.y + box.sizeY;
        if (!edge) continue;
        this.ctx.surface.enqueue({ x: px, y: py, palette: BUILDER.fencePalette, priority: 1 });
      }
    }
  }
}

/**
 * Come la regola dello sventramento deve leggere un record.
 *
 * `carries` sta accanto ad `aerial`, e non e' un caso a parte: un edificio che
 * ospita una mensola o porta una gamba **e'** citta' in quota, vista da sotto.
 * Farlo cadere farebbe cadere quello che ci sta sopra, e sarebbe la demolizione
 * a cascata che nessuno di questi domini vuole.
 *
 * **Un landmark e' un caso suo.** Non e' una struttura — il piazzamento di un
 * monumento lo demolisce come il resto del costruito — ma non e' nemmeno un
 * edificio: un'arcologia non se lo porta via per farsi spazio, perche' nessuno
 * gliel'ha chiesto. A deciderlo e' la regola del chiamante, non questa
 * classificazione.
 */
export function clearanceOf(
  registry: ReadonlyBuildingRegistry,
  record: BuildingRecord,
): ClearanceRecord {
  return { id: record.id, level: record.level, kind: clearanceKindOf(registry, record) };
}

/**
 * La traduzione dai sette tipi ai quattro casi dello sventramento.
 *
 * **Uno `switch` esaustivo e non una catena di ternari**: `ClearanceKind` sceglie
 * *cosa fare*, non risponde si' o no, quindi non e' una colonna della tabella dei
 * tratti — ed e' il compilatore, qui, a impedire che una struttura nuova finisca
 * per sbaglio nel ramo di ripiego. Prima ci finiva: il ramo finale diceva
 * `building`, e una funivia — che non e' un edificio — cadeva li' dentro senza
 * che nessuno l'avesse deciso. Adesso quella riga si vede.
 */
function clearanceKindOf(
  registry: ReadonlyBuildingRegistry,
  record: BuildingRecord,
): ClearanceKind {
  switch (structureKindOf(record)) {
    case STRUCTURE_KIND.span:
      return CLEARANCE_KIND.span;
    case STRUCTURE_KIND.landmark:
      return CLEARANCE_KIND.landmark;
    case STRUCTURE_KIND.rooftopLandmark:
    case STRUCTURE_KIND.aerial:
    case STRUCTURE_KIND.arcology:
      return CLEARANCE_KIND.structure;
    case STRUCTURE_KIND.plain:
    case STRUCTURE_KIND.ropeway:
      // **Chi porta qualcosa e' struttura anche se e' un edificio.** E' l'unica
      // parte della classificazione che non dipende dal tipo ma dalla citta'
      // intorno, e resta qui perche' e' qui che serve: gli altri cinque casi
      // hanno gia' risposto.
      //
      // La funivia sta accanto all'edificio per conservare il comportamento: il
      // ramo di ripiego di prima la mandava li' dentro, e la soglia di altezza
      // la tratta come tale.
      return registry.carries(record.id) ? CLEARANCE_KIND.structure : CLEARANCE_KIND.building;
  }
}

/**
 * I record distinti che stanno dentro un riquadro, a qualunque quota.
 *
 * **Non guarda le quote, e non e' una svista.** `overlaps` le confronta perche'
 * deve dire se due volumi si toccano; qui la domanda e' un'altra — «questo
 * riquadro e' impegnato?» — e cio' che sta sopra una struttura alta venti voxel
 * e' una mensola o una campata, cioe' i due casi che la regola tratta comunque a
 * parte. Guardare la colonna intera e' quindi piu' severo di quanto serva
 * esattamente dove la severita' non cambia la risposta, e costa una lettura in
 * meno per colonna.
 */
export function recordsIn(
  registry: ReadonlyBuildingRegistry,
  box: ClearanceBox,
): BuildingRecord[] {
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
export function simBuildingOf(record: BuildingRecord): Building {
  return record.mixed === undefined
    ? { x: record.x, y: record.y, class: record.class }
    : { x: record.x, y: record.y, class: record.class, mixed: record.mixed };
}

/**
 * Un record come la simulazione lo aveva **registrato** per intero.
 *
 * E' la meta' gemella di `simBuildingOf`, che serve solo a trovare cosa togliere.
 * Per ri-aggiungere serve la voce esatta: il livello decide la capacita', e la
 * specializzazione — derivata dalla tipologia costruita, non dal profilo del
 * luogo — decide se la torre contava anche come produttore di cibo.
 */
function undoBuildingOf(record: BuildingRecord): Building {
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
