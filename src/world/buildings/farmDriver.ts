import { addFarm, FARM_KIND, foodDeficitOf, removeFarm, type FarmKind, type SimState } from '../../sim';
import { FARMS } from '../farms/config';
import { FarmRegistry } from '../farms/FarmRegistry';
import { clearPlot, paintPlot } from '../farms/generate';
import { orchardStamp } from '../farms/orchard';
import { planPlot, plotRows, PLOT_KIND, type FarmPlot } from '../farms/plotPlan';
import { hashCoords } from '../rng';
import { EMPTY_STAMP } from './stamp';
import type { BuildContext } from './buildContext';

/** Celle della spirale entro `searchRings`: il quadrato di lato `2r + 1`. */
const SPIRAL_CELLS = (2 * FARMS.searchRings + 1) ** 2;

/**
 * Il produttore della simulazione che corrisponde a un lotto del mondo.
 *
 * E' l'**unico** punto in cui i due vocabolari si toccano: `PLOT_KIND` dice cosa
 * si disegna, `FARM_KIND` cosa rende. Tenerli separati e' cio' che permette a
 * `src/world/farms/` di non importare `src/sim/`.
 */
function kindOf(plot: FarmPlot): FarmKind {
  return plot.kind === PLOT_KIND.orchard ? FARM_KIND.orchard : FARM_KIND.field;
}

/**
 * La campagna attorno alla citta': dove nasce e quando se ne va.
 *
 * **La citta' si mangia i propri campi, ed e' il punto della fase.** Un lotto
 * nasce dove la citta' non e' ancora arrivata; quando gli isolati lo raggiungono,
 * le sue colonne finiscono sotto gli edifici e il lotto si ritira. La dispensa
 * per abitante cala mentre la citta' cresce, ed e' quella pressione — non un
 * numero scritto in `balance.ts` — a rendere una torre idroponica una scelta
 * invece di un edificio in piu'.
 *
 * **Un lotto non e' un ostacolo.** Non entra negli indici di collisione del
 * `BuildingRegistry` (vedi `FarmRegistry` per il perche'), quindi gli edifici
 * nascono sopra i campi senza sapere che esistono e senza un rifiuto in piu' nel
 * percorso caldo. Chi cede e' sempre il campo.
 *
 * **Un solo numero attraversa il confine.** La simulazione dice *quanto cibo
 * manca*; dove stia la terra fertile lo sa il mondo. E' la stessa divisione di
 * `headroomAt` in `nextBuildSites`, percorsa nel verso opposto.
 */
export class FarmDriver {
  readonly registry = new FarmRegistry();

  /**
   * Da dove riparte la scansione del prossimo giro.
   *
   * Senza, ogni passata ricomincerebbe dallo stesso angolo e ripagherebbe i
   * rifiuti gia' pagati: la citta' cresce da una parte sola, e i primi lotti del
   * reticolo restano occupati per sempre. Avanzando, il costo per passata resta
   * `searchDepth` comunque sia grande l'isola.
   */
  private cursor = 0;

  constructor(private readonly ctx: BuildContext) {}

  /** Lotti vivi adesso. Lo legge l'overlay di debug. */
  get count(): number {
    return this.registry.count;
  }

  /**
   * Una passata: prima ritira cio' che la citta' ha preso, poi pianta se manca.
   *
   * **L'ordine conta.** Ritirando dopo, un lotto gia' mangiato conterebbe ancora
   * come produttore nello stesso giro in cui si decide se piantarne un altro, e
   * la citta' rincorrerebbe la fame con un tick di ritardo permanente.
   */
  pass(state: SimState): SimState {
    let next = this.retirePass(state);
    if (this.wants(next)) next = this.plantPass(next);
    return next;
  }

  /** true se il raccolto di adesso non copre la domanda di adesso. */
  private wants(state: SimState): boolean {
    // L'organico pieno e' deliberatamente ottimista: un lotto in piu' si valuta
    // sul raccolto che *potrebbe* dare, non su quello che da' oggi con meta'
    // delle braccia. Chiedere il contrario farebbe piantare campi a una citta'
    // che ha gia' piu' campi che lavoratori.
    return foodDeficitOf(state.population.stock, state.farmCounts, 1) > 0;
  }

  /**
   * Ritira i lotti che la citta' ha preso.
   *
   * La soglia e' una **frazione** e non una colonna sola: un angolo occupato non
   * toglie un campo, e ritirarlo al primo edificio che lo sfiora farebbe sparire
   * la campagna proprio quando la si guarda di piu'.
   */
  private retirePass(state: SimState): SimState {
    let next = state;
    const doomed: FarmPlot[] = [];

    for (const plot of this.registry.all) {
      let free = 0;
      let total = 0;
      for (const cell of plotRows(plot)) {
        total++;
        if (!this.ctx.registry.isOccupied(cell.x, cell.y)) free++;
      }
      if (total > 0 && free / total < FARMS.minFreeShare) doomed.push(plot);
    }

    for (const plot of doomed) {
      // Prima si spoglia, poi si dimentica: la coda legge il lotto adesso, e un
      // record gia' tolto non avrebbe piu' colonne da restituire al prato.
      for (const paint of clearPlot(plot)) this.ctx.surface.enqueue(paint);
      // Un frutteto ha anche del volume da togliere, e si toglie come si toglie
      // una sagoma vecchia: uno stamp vuoto con il volume da cancellare come
      // `erase`. E' la stessa strada dell'upgrade di un edificio, a budget e
      // senza un secondo percorso di scrittura.
      if (plot.kind === PLOT_KIND.orchard) {
        this.ctx.growth.enqueue(
          this.ownerIdOf(plot),
          { x: plot.x, y: plot.y, z: this.ctx.terrain.heightAt(plot.x, plot.y) },
          EMPTY_STAMP,
          orchardStamp(plot, this.ctx.seed),
        );
      }
      this.registry.remove(plot);
      next = removeFarm(next, kindOf(plot));
    }

    return next;
  }

  /**
   * Identita' di un lotto nella coda della crescita.
   *
   * **Negativa apposta.** Quella coda indicizza per `BuildingRecord.id`, che e'
   * un contatore positivo del registry; un lotto non ha un record e non deve
   * averlo, quindi prende uno spazio di identificatori che non puo' collidere
   * con nessun edificio. Serve solo a distinguere due frutteti fra loro.
   */
  private ownerIdOf(plot: FarmPlot): number {
    return -1 - Math.abs(hashCoords(FARMS.salt, plot.x, plot.y) % 0x7f_ff_ff);
  }

  /** Pianta fino a `plotsPerPass` lotti, cercando dal cursore in avanti. */
  private plantPass(state: SimState): SimState {
    let next = state;
    let planted = 0;

    for (let step = 0; step < FARMS.searchDepth; step++) {
      if (planted >= FARMS.plotsPerPass) break;

      const corner = this.candidateAt(this.cursor + step);
      if (this.registry.has(corner.x, corner.y)) continue;

      const plan = planPlot({
        x: corner.x,
        y: corner.y,
        seed: this.ctx.seed,
        // Il mandato dei giardini di quartiere si legge dallo stato e non dal
        // profilo locale: qui non c'e' un edificio di cui decidere la forma, c'e'
        // un pezzo di campagna, e la lista dei mandati e' globale.
        preferOrchard: state.charters.includes('communityGardens'),
        biomeAt: (x, y) => this.ctx.terrain.biomeAt(x, y),
        slopeAt: (x, y) => this.ctx.terrain.slopeAt(x, y),
        occupied: (x, y) => this.ctx.registry.isOccupied(x, y),
        builtNear: (x, y) => this.ctx.registry.countWithinRadius(x, y, FARMS.edgeRadius),
      });
      if (!plan.ok) continue;

      for (const paint of paintPlot(plan.plot)) this.ctx.surface.enqueue(paint);
      // Gli alberi di un frutteto passano dalla coda della crescita come ogni
      // altro volume: sono un migliaio di voxel, e scriverli nel tick che li
      // decide farebbe cadere proprio il frame in cui la campagna compare.
      if (plan.plot.kind === PLOT_KIND.orchard) {
        this.ctx.growth.enqueue(
          this.ownerIdOf(plan.plot),
          { x: plan.plot.x, y: plan.plot.y, z: this.ctx.terrain.heightAt(plan.plot.x, plan.plot.y) },
          orchardStamp(plan.plot, this.ctx.seed),
        );
      }
      this.registry.add(plan.plot);
      next = addFarm(next, kindOf(plan.plot));
      planted++;
    }

    this.cursor += FARMS.searchDepth;
    return next;
  }

  /**
   * L'angolo di reticolo di indice `n`, su una spirale quadrata attorno all'origine.
   *
   * **Una spirale e non una scansione per righe.** Per righe, i primi lotti
   * nascerebbero tutti sul bordo sud dell'isola comunque stia la citta'; a
   * spirale la ricerca parte dal centro e si allarga, cioe' trova per prima la
   * campagna *appena fuori* dall'edificato — che e' dove un campo si vede e ha
   * senso. Il centro della spirale e' l'origine del mondo, che e' anche dove la
   * citta' comincia.
   */
  private candidateAt(n: number): { x: number; y: number } {
    // Il giro si chiude su `searchRings`: oltre non c'e' isola, e senza un tetto
    // il cursore continuerebbe a crescere scandendo oceano per sempre.
    const index = ((n % SPIRAL_CELLS) + SPIRAL_CELLS) % SPIRAL_CELLS;

    // Anello `r`: contiene `8r` celle (una sola al centro). Si trova sottraendo
    // un anello per volta — sono al massimo `searchRings` giri di aritmetica
    // intera, senza tabelle e senza radici quadrate.
    let ring = 0;
    let start = 0;
    for (;;) {
      const cells = ring === 0 ? 1 : 8 * ring;
      if (index < start + cells) break;
      start += cells;
      ring++;
    }
    if (ring === 0) return { x: 0, y: 0 };

    // Ogni lato dell'anello porta `2r` celle: l'angolo appartiene al lato
    // successivo, o si conterebbe due volte.
    const side = 2 * ring;
    const offset = index - start;
    const edge = Math.floor(offset / side);
    const cell = ring * FARMS.lattice;
    const step = (offset % side) * FARMS.lattice;

    if (edge === 0) return { x: -cell + step, y: -cell };
    if (edge === 1) return { x: cell, y: -cell + step };
    if (edge === 2) return { x: cell - step, y: cell };
    return { x: -cell, y: cell - step };
  }
}
