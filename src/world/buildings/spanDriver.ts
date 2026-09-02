import { BUILDING_CLASS } from '../../sim';
import { hashCoords } from '../rng';
import { SPANS, SPAN_KIND, type SpanKind } from '../spans/config';
import { generateSpan } from '../spans/generate';
import { planPlaza } from '../spans/plazaPlan';
import { SpanNetwork, widestReach } from '../spans/network';
import {
  SPAN_HEIGHT,
  planSpan,
  spanBaseZ,
  type SpanPlan,
  type SpanProbe,
  type SpanSupport,
} from '../spans/spanPlan';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount } from './chunkBudget';
import { MAX_FOOTPRINT } from './config';
import { STAMP_EMPTY } from './stamp';
import { traitsOf } from './structureKind';

/**
 * La rete in quota: ponti, mezzanini e piazze fra i tetti.
 *
 * **L'invariante del dominio e' che una campata non prende suolo**, ed e'
 * l'unica cosa che il modello dei landmark non sapeva gia' dire. Sotto un ponte
 * la carreggiata si dipinge ancora e il lotto si costruisce ancora; se un
 * edificio cresce attraverso la campata, a cedere e' la campata — ed e' per
 * questo che `dropSpansIntersecting` e' pubblico qui: lo chiamano il
 * piazzamento, l'upgrade e la citta' in quota, tutti e tre per dire «questo
 * volume vince».
 *
 * **La rete e' un albero**, e non per eleganza: fra due campate possibili vince
 * quella che unisce due componenti separate, e chi chiuderebbe un ciclo non si
 * costruisce. E' cio' che rende il gate — un percorso continuo fra due isolati
 * — una conseguenza della regola invece di una speranza.
 */
export class SpanDriver {
  /** Isolati che una piazza ce l'hanno gia': si costruisce una volta sola. */

  private cursor = 0;
  private reachValue = 0;
  private reachStale = true;

  /**
   * Come si presenta il luogo alla regola delle campate.
   *
   * Si costruisce una volta sola e non a ogni candidata: `planFrom` la passa a
   * `planSpan` per ogni coppia che esamina, e allocare due chiusure per coppia
   * sarebbe spazzatura per niente. Non tiene stato — sono tre letture — quindi
   * riusarla e' sicuro.
   */
  private readonly probe: SpanProbe;

  constructor(private readonly ctx: BuildContext) {
    this.probe = {
      ground: (x, y) => ({
        height: ctx.terrain.heightAt(x, y),
        pavement: ctx.streets.isPavement(x, y),
        // «Il suolo e' preso»: le campate non ci entrano, ed e' l'invariante che
        // permette a un ponte di scavalcare una carreggiata senza toglierla.
        free: !ctx.registry.isOccupied(x, y),
      }),
      solid: (x, y, z) => ctx.world.getBlock(x, y, z) !== STAMP_EMPTY,
    };
  }

  /**
   * Costruisce le campate che allargano la rete in quota.
   *
   * **Vince chi unisce due componenti separate.** Il settimo punto della fase non
   * chiede dei ponti ma una *rete*, e il riferimento del Minneapolis Skyway dice
   * perche': un secondo livello diventa il piano principale quando e' continuo, e
   * resta un ornamento finche' non lo e'. Costruire per merito locale — i due
   * tetti piu' compatibili — darebbe ponti sparsi che non portano da nessuna
   * parte; chiedere che ogni campata **fonda due componenti** fa crescere un
   * albero che si allarga di isolato in isolato, e il gate diventa una
   * conseguenza della regola invece di una speranza.
   *
   * Una campata che chiuderebbe un ciclo non si costruisce: fra due posti gia'
   * raggiungibili l'uno dall'altro un secondo percorso aggiunge ingombro e non
   * aggiunge raggiungibilita'.
   *
   * La passata ha un cursore come `upgradePass`, quindi il costo non cresce con
   * la citta'. Il grafo si **ricostruisce** a ogni passata: un union-find non sa
   * disfare un'unione, e qui le campate spariscono davvero.
   */
  pass(): void {
    const records = [...this.ctx.registry.all];
    if (records.length === 0) return;

    const network = SpanNetwork.of(this.ctx.registry.spans);
    const budget = Math.min(SPANS.examinedPerPass, records.length);
    let built = 0;

    // **Nessuna guardia sulla coda, e non e' una dimenticanza.** Le altre
    // passate si fermano su `maxGrowing` perche' il loro tetto e' quello; questa
    // ne ha uno proprio e molto piu' stretto — `perPass` campate ogni
    // `ticksPerPass` tick. Guardare la coda qui significava non costruire mai
    // niente: `upgradePass` gira sullo stesso tick e la riempie fino al tetto,
    // quindi questa passata la trovava piena e usciva al primo giro, sempre. La
    // coda `pending` esiste proprio per separare quanto lavoro si crea da quanto
    // ne vola insieme.
    // Gli appoggi gia' tentati in questa passata. Il tessuto non appartiene piu'
    // a un isolato teorico: il limite resta sui tentativi, non sulle celle della
    // maglia che per caso contengono i record.
    const tried = new Set<string>();
    const busy = this.ctx.growth.busyIds();

    for (let i = 0; i < budget && built < SPANS.perPass; i++) {
      const record = records[this.cursor % records.length];
      this.cursor++;

      // La piazza si prova per prima: e' un nodo, e un nodo vale piu' di un
      // ponte perche' da li' la rete puo' ripartire in piu' direzioni.
      let plan: SpanPlan | null = null;
      if (tried.size < SPANS.plaza.attemptsPerPass) {
        const key = String(record.id);
        if (!tried.has(key)) {
          const attempt = this.plazaOn(record, network, busy);
          if (attempt !== undefined) {
            tried.add(key);
            plan = attempt;
          }
        }
      }
      if (plan === null) plan = this.planFrom(record, network, busy);
      if (plan === null) continue;
      if (!this.build(plan)) continue;

      network.add({ supports: plan.supports });
      built++;
    }

    if (built > 0) this.reachStale = true;
  }

  /**
   * Toglie le campate che poggiano su un edificio che sta per cambiare.
   *
   * **E' il vincolo della fase, detto in codice**: se l'edificio che la sostiene
   * cambia livello o sagoma, la campata segue o sparisce, mai resta a mezz'aria.
   * Qui sparisce; a farla *seguire* e' la passata successiva, che la ripropone
   * alla quota nuova se il luogo la regge ancora. E' anche il comportamento
   * giusto: la rete in quota insegue la citta' invece di fossilizzarla.
   */
  dropSupportedBy(supportId: number): void {
    for (const span of this.ctx.registry.spansOf(supportId)) this.drop(span);
  }

  /**
   * Toglie le campate che attraversano un volume che sta per essere costruito.
   *
   * Al suolo vince l'edificio: senza questo, `overlaps` rifiuterebbe il
   * piazzamento con `occupied` e un ponte impedirebbe una casa — che e'
   * esattamente il contrario dell'invariante «una campata non prende suolo».
   */
  dropIntersecting(
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
    minZ: number,
    maxZ: number,
  ): void {
    const doomed = new Map<number, BuildingRecord>();
    for (let dy = 0; dy < sizeY; dy++) {
      for (let dx = 0; dx < sizeX; dx++) {
        for (const other of this.ctx.registry.at(x + dx, y + dy)) {
          if (other.span === undefined) continue;
          if (other.baseZ >= maxZ || minZ >= other.baseZ + other.height) continue;
          doomed.set(other.id, other);
        }
      }
    }
    for (const span of doomed.values()) this.drop(span);
  }

  /**
   * Quanti isolati distinti tocca la componente piu' larga della rete in quota.
   *
   * **Si ricalcola a domanda, non a ogni cambio.** Una passata di upgrade toglie
   * le campate di ogni edificio che promuove, e ricostruire il grafo a ogni
   * caduta significava rifarlo una dozzina di volte dentro lo stesso tick per un
   * numero che nessuno stava guardando. Il flag lo rimanda a chi lo legge, che e'
   * l'overlay, una volta per cambio.
   */
  reach(): number {
    if (this.reachStale) {
      this.reachValue = widestReach(this.ctx.registry.spans, (supportId) => {
        const support = this.ctx.registry.get(supportId);
        if (support === null) return null;
        return this.ctx.streets.keyOf(this.ctx.streets.blockAt(support.x, support.y));
      });
      this.reachStale = false;
    }
    return this.reachValue;
  }

  /**
   * La piazza che il vuoto attorno a questo edificio puo' reggere.
   *
   * `undefined` se il luogo non e' nemmeno da provare — ha gia' una piazza, o
   * non ha abbastanza edifici — e `null` se il tentativo c'e' stato e non regge:
   * e' la differenza che tiene il conto dei tentativi onesto, perche' la
   * scansione del cuore e' la cosa piu' cara del dominio.
   *
   * Non assume un cortile al centro della maglia. Prova i vuoti che iniziano
   * subito oltre le pareti reali degli appoggi: se tre edifici delimitano una
   * tasca, `planPlaza` la allarga fino ai muri; se il tessuto e' aperto, non
   * inventa un quadrato solo perche' esiste un isolato teorico.
   */
  private plazaOn(
    record: BuildingRecord,
    network: SpanNetwork,
    busy: ReadonlySet<number>,
  ): SpanPlan | null | undefined {
    const radius = SPANS.plaza.maxSide + MAX_FOOTPRINT;

    const supports: SpanSupport[] = [];
    for (const other of this.ctx.registry.withinRadius(record.x, record.y, radius)) {
      if (other.span === SPAN_KIND.plaza) return undefined;
      if (!canSupport(other, network, busy)) continue;
      supports.push(supportOf(other));
    }
    if (supports.length < SPANS.plaza.minSupports) return undefined;

    const side = SPANS.plaza.maxSide;
    const half = (side - 1) >> 1;
    const seeds = new Map<string, { readonly x: number; readonly y: number }>();
    for (const support of supports) {
      const midX = support.x + ((support.sizeX - 1) >> 1);
      const midY = support.y + ((support.sizeY - 1) >> 1);
      const candidates = [
        { x: support.x - 1, y: midY },
        { x: support.x + support.sizeX, y: midY },
        { x: midX, y: support.y - 1 },
        { x: midX, y: support.y + support.sizeY },
      ];
      for (const seed of candidates) seeds.set(`${seed.x},${seed.y}`, seed);
    }

    let examined = 0;
    for (const seed of seeds.values()) {
      const column = this.probe.ground(seed.x, seed.y);
      if (!column.free || column.pavement) continue;
      if (examined >= SPANS.plaza.pocketsPerAttempt) break;
      examined++;
      const rect = {
        x0: seed.x - half,
        y0: seed.y - half,
        x1: seed.x - half + side - 1,
        y1: seed.y - half + side - 1,
      };
      const result = planPlaza({ rect, supports, ...this.probe });
      if (result.ok) return result.plan;
    }
    return null;
  }

  /**
   * La campata che questo edificio puo' dare, o null.
   *
   * I partner si scorrono in ordine di id e solo verso l'alto: la coppia si
   * valuta una volta sola, e quale delle due la propone non dipende da chi il
   * registry ha indicizzato prima. Il ponte si prova prima del mezzanino perche'
   * e' la forma che porta piu' lontano; se il luogo non lo regge, il mezzanino
   * e' cio' che resta dentro l'isolato.
   */
  private planFrom(
    record: BuildingRecord,
    network: SpanNetwork,
    busy: ReadonlySet<number>,
  ): SpanPlan | null {
    if (!canSupport(record, network, busy)) return null;

    const a = supportOf(record);
    const reach = SPANS.maxGap + MAX_FOOTPRINT;
    const partners = [...this.ctx.registry.withinRadius(record.x, record.y, reach)]
      .filter((other) => other.id > record.id && canSupport(other, network, busy))
      .sort((first, second) => first.id - second.id);

    for (const other of partners) {
      // Chiudere un ciclo non aggiunge raggiungibilita': si scarta prima di
      // pagare la scansione del vuoto, che e' la parte cara.
      if (network.connected(record.id, other.id)) continue;

      const b = supportOf(other);
      for (const kind of SPAN_ORDER) {
        const result = planSpan({ a, b, kind, ...this.probe });
        if (result.ok) return result.plan;
      }
    }

    return null;
  }

  /**
   * Scrive una campata, o dice di no.
   *
   * Il tetto di chunk sporchi si misura sul **segmento**, che e' l'unita' di
   * scrittura: e' tutto il senso di averli spezzati.
   */
  private build(plan: SpanPlan): boolean {
    const baseZ = spanBaseZ(plan.deckZ);
    // Gli appoggi sono esclusi: l'impalcato atterra dove i corpi si affacciano
    // davvero, quindi sporge sopra le loro fasce basse. Toccare cio' a cui si e'
    // attaccati non e' una collisione — `boxIsClear` ha gia' verificato che li'
    // dentro non ci sia niente di solido.
    if (this.ctx.registry.overlaps(
      plan.x, plan.y, plan.sizeX, baseZ, SPAN_HEIGHT, plan.sizeY, plan.supports,
    )) {
      return false;
    }

    for (const segment of plan.segments) {
      const count = dirtyChunkCount(
        segment.x, segment.y, segment.sizeX, baseZ, baseZ + SPAN_HEIGHT, segment.sizeY,
      );
      if (count > SPANS.maxDirtyChunks) return false;
    }

    const record = this.ctx.registry.add({
      x: plan.x,
      y: plan.y,
      baseZ,
      footprint: plan.sizeX,
      footprintY: plan.sizeY,
      height: SPAN_HEIGHT,
      // Una campata non ha un uso urbano: `tally` la salta come salta i landmark,
      // e questo campo non entra in nessun istogramma. Civico e' il meno
      // arbitrario dei quattro — un passaggio pubblico e' spazio pubblico — ma
      // resta inerte per costruzione.
      class: BUILDING_CLASS.civic,
      level: 0,
      seed: hashCoords(this.ctx.seed, plan.x, plan.y),
      span: plan.kind,
      supports: plan.supports,
    });

    for (const segment of plan.segments) {
      this.ctx.growth.enqueue(
        record.id,
        { x: segment.x, y: segment.y, z: baseZ },
        generateSpan(plan, segment),
      );
    }
    return true;
  }

  /** Cancella i voxel di una campata e la toglie dal registry. */
  private drop(record: BuildingRecord): void {
    // Subito e non a budget: il volume di una campata e' minuscolo — poche
    // centinaia di celle — e toglierlo a rate lascerebbe una finestra in cui il
    // registry la dice sparita mentre i suoi voxel sono ancora li'. In quella
    // finestra un edificio potrebbe nascerci dentro, e la cancellazione in coda
    // gli mangerebbe i voxel.
    this.ctx.growth.clearVolume(
      record.x,
      record.y,
      record.footprint,
      footprintDepth(record),
      record.baseZ,
      record.baseZ + record.height,
    );
    this.ctx.registry.remove(record.id);
    this.reachStale = true;
  }
}

/**
 * In che ordine si prova a collegare due edifici.
 *
 * Il ponte per primo perche' e' la forma che porta piu' lontano — scavalca la
 * carreggiata e collega due isolati — e il mezzanino e' cio' che resta quando il
 * luogo non regge un ponte, cioe' dentro l'isolato. La piazza non e' qui: non
 * nasce da una coppia ma da un cortile, e ha una passata propria.
 */
const SPAN_ORDER: readonly SpanKind[] = [SPAN_KIND.bridge, SPAN_KIND.mezzanine];

/**
 * true se un record puo' reggere un'altra campata.
 *
 * `busy` sono i record che stanno comparendo, raccolti **una volta per
 * passata**: la domanda si fa per ogni partner di ogni record esaminato —
 * qualche migliaio di volte — e rispondervi scandendo le due code ogni volta
 * era la voce piu' cara del giro.
 */
function canSupport(
  record: BuildingRecord,
  network: SpanNetwork,
  busy: ReadonlySet<number>,
): boolean {
  // Una campata non regge una campata, e un landmark cresce di stadio: la sua
  // sagoma cambia sotto i piedi di chi ci si appoggiasse. La colonna `hostsSpan`
  // di `structureKind.ts` dice per quali tipi vale — comprese le due risposte
  // che sorprendono, la citta' in quota e la torre di funivia, che questa regola
  // non ha mai escluso.
  if (!traitsOf(record).hostsSpan) return false;
  if (busy.has(record.id)) return false;
  return network.degreeOf(record.id) < SPANS.maxPerSupport;
}

/** Un record ridotto a cio' che la regola pura ha bisogno di sapere. */
function supportOf(record: BuildingRecord): SpanSupport {
  return {
    id: record.id,
    x: record.x,
    y: record.y,
    sizeX: record.footprint,
    sizeY: footprintDepth(record),
    baseZ: record.baseZ,
    height: record.height,
    level: record.level,
    baseBand: record.baseBand ?? 0,
    cluster: record.cluster,
  };
}
