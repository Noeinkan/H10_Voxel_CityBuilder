import { addBuilding, type BuildingClass, type SimState } from '../../sim';
import { STREETS } from '../streets/config';
import { urbanFootprintCap } from './assemble';
import { blockRoom } from './blockForm';
import type { BuildContext } from './buildContext';
import { boundsOf, envelopeOf, type BuildingRecord, type PlanRect } from './BuildingRegistry';
import { dirtyChunkCount } from './chunkBudget';
import { clearanceOf, recordsIn, type ClearanceSites } from './clearanceSite';
import { BUILDER, MAX_FOOTPRINT } from './config';
import { FUSION } from './config/fusion';
import type { BuildingArch } from './archPlan';
import { planFusion, type FusionMember } from './fusion';
import { anchorOf } from './growthQueue';
import { allowedLevel, riseOf } from './hierarchy';
import { recordStamp } from './recordStamp';
import { buildWorks, surveyGrade } from './siteWorks';
import type { SpanDriver } from './spanDriver';
import { STRUCTURE_KIND, structureKindOf, traitsOf } from './structureKind';

/**
 * La fusione: due edifici che si incontrano e diventano uno.
 *
 * **E' l'evento che mancava, non una geometria nuova.** `assembleBuilding`
 * disegna gia' *un* record come piu' masse su un podio condiviso, con il vuoto
 * fra loro dipinto a terrazza: la citta' ha sempre avuto l'edificio che si
 * separa e si ritrova, e a non esistere era soltanto il momento in cui due
 * lotti diventano quel lotto. Qui la promozione smette di essere «un livello in
 * piu'» e diventa «il lotto del vicino».
 *
 * **Non demolisce da se'.** Apre i cantieri di sgombero e aspetta, come il
 * declino: a smontare i voxel a budget, a togliere i record e a dirlo alla
 * simulazione e' `ClearanceSites`, che e' anche la sola cosa che sappia
 * rispondere ai casi difficili — una campata che poggiava, due cantieri
 * sovrapposti, un record gia' condannato da un altro. Un secondo percorso di
 * rimozione divergerebbe dal primo al primo caso limite.
 *
 * **La fusione si compie qui e non nel callback del cantiere**, ed e' una
 * questione di chi possiede lo stato: il record fuso deve dichiarare alla
 * simulazione gli usi che ha ereditato, e `clearance.pass` non e' il posto in
 * cui restituire un `SimState`. Il cantiere segnala di aver finito, e la
 * passata successiva raccoglie.
 *
 * **Un edificio in meno non e' un abitante in meno.** Il sopravvissuto dichiara
 * in `uses` anche l'uso di chi ha assorbito — la stessa macchina con cui
 * un'arcologia vale quattro edifici — e la simulazione riceve una `addBuilding`
 * per voce. Senza, fondere due torri dimezzerebbe la capacita' dell'isolato, che
 * sarebbe una regressione di bilancio travestita da forma urbana.
 */

/** Una cella liberata da un cantiere: va ridichiarata alla simulazione. */
interface FreedCell {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
}

/**
 * Una fusione decisa, in attesa che i suoi cantieri finiscano.
 *
 * **Due forme, e la differenza sta tutta in `side`.** Una fusione *larga* prende
 * i lotti attaccati al proprio e diventa un quadrato piu' grande: un rettangolo
 * solo, la macchina di sempre. Una fusione *attraverso* prende il dirimpettaio
 * di la' dalla strada, e il quadrato non c'e' — restano due sedimi con in mezzo
 * la carreggiata, che resta carreggiata. La seconda esiste solo per chi ha gia'
 * gettato un arco: quel braccio e' cio' che rende i due corpi un edificio invece
 * di due, ed e' anche cio' che diventa la campata piena del nuovo.
 */
interface Pending {
  readonly hostId: number;
  /** Il lato quadrato nuovo, o zero quando la fusione attraversa invece di allargarsi. */
  readonly side: number;
  /** I sedimi in piu' del record fuso. Vuoto per una fusione larga. */
  readonly parts: readonly PlanRect[];
  /** L'arco intero che unira' i due sedimi, o null per una fusione larga. */
  readonly arch: BuildingArch | null;
  /** Le celle che i cantieri liberano: da ridichiarare alla simulazione. */
  readonly cells: readonly FreedCell[];
  /** Cantieri ancora aperti. A zero, la fusione si puo' compiere. */
  open: number;
}

export class FusionDriver {
  private cursor = 0;
  private fused = 0;
  private readonly pending: Pending[] = [];

  constructor(
    private readonly ctx: BuildContext,
    private readonly clearance: ClearanceSites,
    private readonly spans: SpanDriver,
  ) {}

  /** Fusioni compiute da inizio partita. */
  get count(): number {
    return this.fused;
  }

  /**
   * Compie le fusioni che i cantieri hanno liberato, poi ne apre una nuova.
   *
   * **In quest'ordine, e non e' indifferente.** Un quadrato appena liberato e'
   * anche un quadrato che la crescita ordinaria vede vuoto: compiendo prima, il
   * lotto largo esiste gia' quando il resto del tick guarda il suolo.
   */
  pass(state: SimState): SimState {
    const next = this.settle(state);
    this.open(next);
    return next;
  }

  /** Porta a termine le fusioni i cui cantieri sono chiusi. */
  private settle(state: SimState): SimState {
    let next = state;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const entry = this.pending[i];
      if (entry.open > 0) continue;

      const host = this.ctx.registry.get(entry.hostId);
      if (host === null) {
        // Il candidato se n'e' andato mentre i cantieri lavoravano — un
        // landmark, la gomma, il declino. I lotti restano liberi, ed e' un esito
        // legittimo: la citta' li riempira' come qualunque altro suolo.
        this.pending.splice(i, 1);
        continue;
      }
      // Chi sta ancora comparendo aspetta un giro: sovrascrivere la coda con una
      // sagoma nuova lascerebbe a meta' quella vecchia.
      if (this.ctx.growth.isGrowing(host.id)) continue;

      this.pending.splice(i, 1);
      next = this.complete(host, entry, next);
    }
    return next;
  }

  /** Porta a termine la fusione: quella larga si allarga, quella attraverso si sdoppia. */
  private complete(host: BuildingRecord, entry: Pending, state: SimState): SimState {
    return entry.side > 0
      ? this.completeWide(host, entry, state)
      : this.completeAcross(host, entry, state);
  }

  /**
   * La fusione attraverso: il record prende il sedime del dirimpettaio.
   *
   * **Non c'e' niente da fondare e niente da allargare.** Il secondo lotto una
   * fondazione ce l'ha gia' — ci stava sopra l'edificio che se n'e' appena
   * andato, alla stessa quota, che e' la condizione che l'arco imponeva gia' —
   * e l'impronta principale non si muove di un voxel. Cambiano due campi:
   * `parts`, che dice dove sta l'altro corpo, e `arch`, che da mezzo braccio
   * diventa la campata intera fra i due.
   */
  private completeAcross(host: BuildingRecord, entry: Pending, state: SimState): SimState {
    const { registry, growth, surface, streets } = this.ctx;
    if (entry.arch === null) return state;

    const draft = { ...host, parts: entry.parts, arch: entry.arch };
    const stamp = recordStamp(draft);
    const bounds = boundsOf(draft);
    if (dirtyChunkCount(
      bounds.x, bounds.y, bounds.sizeX, host.baseZ, host.baseZ + stamp.sizeZ, bounds.sizeY,
    ) > BUILDER.maxDirtyChunksPerBuilding) {
      return state;
    }
    // I sedimi devono essere davvero liberi: fra la decisione e adesso la citta'
    // ha continuato a girare, e la prenotazione del cantiere e' finita con lui.
    for (const part of entry.parts) {
      if (registry.overlaps(
        part.x, part.y, part.sizeX, host.baseZ, stamp.sizeZ, part.sizeY, [host.id],
      )) {
        return state;
      }
    }

    const old = recordStamp(host);
    this.spans.dropSupportedBy(host.id);
    this.spans.dropIntersecting(
      bounds.x, bounds.y, bounds.sizeX, bounds.sizeY, host.baseZ, host.baseZ + stamp.sizeZ,
    );

    const replaced = registry.replace(host.id, {
      ...host,
      parts: entry.parts,
      arch: entry.arch,
      height: stamp.sizeZ,
    });
    if (replaced === null) return state;

    const next = this.declare(state, replaced, entry.cells);
    surface.enqueueBlockStreets(streets.blockAt(replaced.x, replaced.y));
    for (const part of entry.parts) {
      surface.enqueueBlockStreets(streets.blockAt(part.x, part.y));
    }
    growth.enqueue(replaced.id, anchorOf(replaced), stamp, old);
    this.fused++;
    return next;
  }

  /** Riscrive il candidato sull'impronta larga e gli intesta gli usi ereditati. */
  private completeWide(host: BuildingRecord, entry: Pending, state: SimState): SimState {
    const { world, terrain, registry, growth, surface, streets } = this.ctx;
    const side = entry.side;

    // La sagoma si chiede a `recordStamp` con l'impronta nuova, e non a
    // `buildStamp` con una richiesta scritta a mano: e' la stessa funzione che
    // domani dovra' ridisegnarla per cancellarla, quindi passare di li' e' cio'
    // che garantisce che le due coincidano.
    const stamp = recordStamp({ ...host, footprint: side });
    if (dirtyChunkCount(host.x, host.y, side, host.baseZ, host.baseZ + stamp.sizeZ, side) >
      BUILDER.maxDirtyChunksPerBuilding) {
      return state;
    }
    // Il quadrato dev'essere davvero libero: fra la decisione e adesso la citta'
    // ha continuato a girare, e la prenotazione del cantiere e' finita con lui.
    if (registry.overlaps(host.x, host.y, side, host.baseZ, stamp.sizeZ, side, [host.id])) {
      return state;
    }

    const old = recordStamp(host);
    // La fondazione dell'anello aggiuntivo prima di salire, alla quota che
    // l'edificio ha gia': rialzare il piano sotto una torre in piedi la
    // sotterrerebbe.
    const works = surveyGrade(terrain, host.x, host.y, side);
    if (works !== null) {
      buildWorks(world, terrain, host.x, host.y, side, { ...works, padZ: host.baseZ });
    }

    // Le campate che poggiavano sul candidato cadono con la sua sagoma vecchia,
    // e quelle che il volume nuovo attraverserebbe cadono davanti a lui: e' il
    // vincolo della 4.5, lo stesso che rispetta la promozione.
    this.spans.dropSupportedBy(host.id);
    this.spans.dropIntersecting(
      host.x, host.y, side, side, host.baseZ, host.baseZ + stamp.sizeZ,
    );

    const replaced = registry.replace(host.id, {
      ...host,
      footprint: side,
      height: stamp.sizeZ,
      // Un assemblaggio riempie il lotto e non aggetta: `assembleBuilding` forza
      // gia' `overhang: 0` sui sotto-volumi, e un inviluppo che lo dichiarasse
      // prenoterebbe una striscia che la sagoma non ha.
      overhang: side > MAX_FOOTPRINT ? undefined : host.overhang,
    });
    if (replaced === null) return state;

    const next = this.declare(state, replaced, entry.cells);
    surface.enqueueBlockStreets(streets.blockAt(replaced.x, replaced.y));
    surface.clearExpandedSiteDecor(host, side);
    // **La sagoma vecchia si cancella**, e qui non e' facoltativo come per una
    // promozione: un assemblaggio ha una corte dove prima c'era il corpo, quindi
    // il volume nuovo non copre affatto quello vecchio. E' anche la ragione per
    // cui `FUSION.maxSide` esiste — oltre la scala mega la coppia
    // sagoma+cancellazione non sta piu' nel budget di chunk di una struttura.
    growth.enqueue(replaced.id, anchorOf(replaced), stamp, old);
    this.fused++;
    return next;
  }

  /**
   * Intesta al record fuso gli usi che ha ereditato, e li dichiara.
   *
   * **`addBuilding` puo' rifiutare, e il rifiuto va creduto**, come per le fasce
   * di un'arcologia: la simulazione tiene un edificio per cella, e se quella
   * colonna fosse gia' sua il conteggio direbbe una cosa e il registry un'altra.
   * `uses` entra nel record solo per le voci accettate, cosi' i due conti
   * restano la stessa affermazione.
   */
  private declare(
    state: SimState,
    record: BuildingRecord,
    cells: readonly FreedCell[],
  ): SimState {
    let next = state;
    const uses: BuildingClass[] = [record.class];
    for (const cell of cells) {
      const grown = addBuilding(next, { x: cell.x, y: cell.y, class: cell.class });
      if (grown.buildings.length === next.buildings.length) continue;
      next = grown;
      uses.push(cell.class);
    }
    if (uses.length > 1) this.ctx.registry.replace(record.id, { ...record, uses });
    return next;
  }

  /** Cerca un candidato e apre i cantieri sui vicini che si prende. */
  private open(state: SimState): void {
    if (this.pending.length >= FUSION.perPass) return;
    const records = [...this.ctx.registry.all];
    if (records.length === 0) return;

    const budget = Math.min(FUSION.perPassRecords, records.length);
    for (let i = 0; i < budget; i++) {
      const record = records[this.cursor % records.length];
      this.cursor++;
      if (!this.ready(record)) continue;
      if (this.start(record, state)) return;
    }
  }

  /**
   * true se questo record potrebbe assorbire un vicino.
   *
   * Le domande che rispondono di no senza leggere il mondo, e stanno qui in alto
   * per la stessa ragione della passata di promozione: quasi tutta la citta'
   * esce di qui, e non deve costare una lettura del terreno.
   *
   * **Chi ha gettato un arco puo' fondere solo attraverso.** Allargarsi
   * sposterebbe la parete d'imposta e lascerebbe la meta' di fronte a puntare il
   * vuoto; prendersi il dirimpettaio invece e' l'unica cosa che quella parete
   * non la sposta — anzi, e' proprio il braccio a diventare la campata piena del
   * record fuso. La distinzione la fa `start`, non questa domanda.
   */
  private ready(record: BuildingRecord): boolean {
    if (structureKindOf(record) !== STRUCTURE_KIND.plain) return false;
    if (!traitsOf(record).promotes) return false;
    if (record.parts !== undefined) return false;
    if (record.level < FUSION.minLevel) return false;
    if (this.ctx.growth.isGrowing(record.id)) return false;
    if (this.ctx.registry.decksOf(record.id).length > 0) return false;
    // Un edificio nato su un impalcato non ha un isolato sotto di se': la scala
    // d'impronta non lo riguarda, e nemmeno il lotto del vicino.
    return riseOf(this.ctx, record) === 0;
  }

  /** Apre i cantieri della fusione, se la regola la concede. Torna true se ne ha aperta una. */
  private start(host: BuildingRecord, state: SimState): boolean {
    // **Prima si guarda di la' dalla strada.** Chi ha un braccio ha gia' scelto
    // con chi fondersi, e quella coppia si e' gia' guadagnata la quota comune e
    // la parete: proporgli invece un allargamento nel proprio isolato sarebbe
    // ricominciare da capo la stessa domanda, con una risposta peggiore.
    if (host.arch !== undefined) return this.startAcross(host);
    const side = this.roomFor(host, state);
    if (side <= host.footprint) return false;

    const square = { x: host.x, y: host.y, sizeX: side, sizeY: side };
    const inside: FusionMember[] = [];
    for (const other of recordsIn(this.ctx.registry, square)) {
      if (other.id === host.id) continue;
      inside.push(this.memberOf(other));
    }

    const plan = planFusion({ host: { ...this.memberOf(host), footprint: host.footprint }, side, inside });
    if (!plan.ok) return false;

    // Il terreno regge l'impronta nuova alla quota che l'edificio ha gia': se
    // no, non si apre niente — i cantieri sarebbero gia' partiti quando la
    // fondazione dice di no.
    const works = surveyGrade(this.ctx.terrain, host.x, host.y, side);
    if (works === null || works.padZ > host.baseZ) return false;

    return this.openSites(host, plan.plan.absorb, {
      hostId: host.id, side, parts: [], arch: null, cells: plan.plan.cells, open: 0,
    });
  }

  /**
   * La fusione attraverso la strada: il record si prende il dirimpettaio.
   *
   * **E' la campata che diventa un edificio.** I due si sono gia' trovati — la
   * quota comune, la parete d'imposta, il braccio che si incontra a meta' — e
   * qui smettono di essere due: il secondo lotto diventa un sedime del primo,
   * e il mezzo arco diventa la campata intera che li unisce. Il vuoto in mezzo
   * resta vuoto e resta suolo pubblico: `plotOf` non lo prenota, quindi sotto
   * l'arco la carreggiata continua a dipingersi.
   */
  private startAcross(host: BuildingRecord): boolean {
    const arch = host.arch;
    if (arch === undefined || arch.mate === 0) return false;

    const mate = this.ctx.registry.get(arch.mate);
    if (mate === null || !this.ready(mate)) return false;
    if (mate.arch === undefined || mate.arch.mate !== host.id) return false;

    const member = this.memberOf(mate);
    const plan = planFusion({
      host: { ...this.memberOf(host), footprint: host.footprint },
      // Il lato non e' in gioco: qui non ci si allarga, ci si sdoppia. Si dichiara
      // uno in piu' dell'impronta perche' la regola condivisa non abbia bisogno
      // di un ramo per una domanda che questa forma non pone.
      side: host.footprint + 1,
      inside: [member],
    });
    if (!plan.ok) return false;

    const part = {
      x: mate.x,
      y: mate.y,
      sizeX: mate.footprint,
      sizeY: mate.footprintY ?? mate.footprint,
    };
    // Il braccio diventa intero: dal filo dell'impronta principale fino alla
    // parete dell'altro sedime, rientranza compresa. E' la somma esatta dei due
    // mezzi archi piu' cio' che il dirimpettaio si era rientrato, piu' **una**
    // colonna: le due punte si toccavano senza sovrapporsi, e adesso una sola
    // corsa deve arrivare fin dove l'altra cominciava.
    const whole = {
      ...arch,
      reach: arch.reach + mate.arch.reach + mate.arch.inset + 1,
      // Zero vuol dire «non incontro nessuno»: il rinfianco si specchia e
      // l'arco ha una spalla a tutti e due i capi. Vedi `armColumns`.
      mate: 0,
    };

    return this.openSites(host, plan.plan.absorb, {
      hostId: host.id, side: 0, parts: [part], arch: whole, cells: plan.plan.cells, open: 0,
    });
  }

  /**
   * Apre un cantiere per ogni assorbito e mette la fusione in attesa.
   *
   * **Un cantiere per assorbito, sul suo inviluppo.** Uno solo sul riquadro che
   * li contiene tutti condannerebbe anche il candidato: `planClearance` non
   * conosce eccezioni, ed e' giusto che non ne conosca — il rifiuto e' del
   * riquadro. Il prezzo e' il controllo qui sotto: se in quell'inviluppo c'e'
   * anche qualcun altro, la fusione rinuncia invece di portarselo via per
   * sbaglio.
   */
  private openSites(
    host: BuildingRecord,
    absorb: readonly number[],
    entry: Pending,
  ): boolean {
    const boxes: ReturnType<typeof envelopeOf>[] = [];
    for (const id of absorb) {
      const record = this.ctx.registry.get(id);
      if (record === null) return false;
      const box = envelopeOf(record);
      if (recordsIn(this.ctx.registry, box).some((other) => other.id !== id)) return false;
      boxes.push(box);
    }

    for (const box of boxes) {
      const opened = this.clearance.start(
        box,
        { maxLevel: host.level },
        () => { entry.open--; },
        { fence: false },
      );
      // Un cantiere rifiutato lascia la fusione monca: si rinuncia, e i cantieri
      // gia' aperti fanno comunque il loro lavoro — un lotto liberato non e' un
      // danno, e la citta' lo riprende come qualunque suolo.
      if (!opened) return entry.open > 0 ? this.abandon(entry) : false;
      entry.open++;
    }

    this.pending.push(entry);
    return true;
  }

  /** Lascia cadere una fusione i cui cantieri sono partiti solo in parte. */
  private abandon(entry: Pending): boolean {
    entry.open = Number.POSITIVE_INFINITY;
    return false;
  }

  /**
   * Il lato quadrato che l'isolato concederebbe a questo edificio.
   *
   * E' la stessa aritmetica della promozione — il gate gerarchico piu' lo spazio
   * fisico dell'isolato — con in piu' il tetto della fusione. Ricalcolarla qui
   * invece di condividerla con `upgradeDriver` sarebbe la copia che diverge al
   * primo ritocco dei gradini d'impronta: le due leggono `urbanFootprintCap` e
   * `blockRoom`, che sono le funzioni che quella regola la tengono.
   */
  private roomFor(host: BuildingRecord, state: SimState): number {
    const rect = this.ctx.streets.blockRect(this.ctx.streets.blockAt(host.x, host.y));
    const cap = urbanFootprintCap(
      rect,
      (x, y) => allowedLevel(this.ctx, x, y, state),
      host.level,
    );
    const room = Math.min(cap, blockRoom(rect, host.x, host.y, host.footprint), FUSION.maxSide);
    // Al passo della maglia, come i lotti: un'impronta a meta' cubo di terreno
    // troverebbe sotto di se' due quote diverse su terreno piatto.
    return Math.floor(room / STREETS.align) * STREETS.align;
  }

  /** Il record come lo guarda la regola: cio' che si puo' togliere, e cosa lo ferma. */
  private memberOf(record: BuildingRecord): FusionMember {
    return {
      id: record.id,
      x: record.x,
      y: record.y,
      baseZ: record.baseZ,
      level: record.level,
      class: record.class,
      kind: clearanceOf(this.ctx.registry, record).kind,
      carries: this.ctx.registry.decksOf(record.id).length > 0,
      growing: this.ctx.growth.isGrowing(record.id),
    };
  }
}
