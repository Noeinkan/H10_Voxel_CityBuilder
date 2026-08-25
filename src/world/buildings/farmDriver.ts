import {
  addFarm,
  BALANCE,
  FARM_KIND,
  missingPlotsFor,
  removeFarm,
  type FarmKind,
  type SimState,
} from '../../sim';
import { BUILDER } from './config';
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
 * Lotti piantati al massimo in una passata.
 *
 * **E' un tetto, non il ritmo**, e la differenza e' tutta la meccanica: quanti
 * piantarne lo dice `missingPlotsFor`, e questo numero e' solo il punto in cui
 * una passata si ferma perche' mezza campagna non compaia in un istante.
 *
 * **Ed e' derivato apposta.** Stava scritto a mano in `FARMS` — `6` — con la
 * propria derivazione nel commento accanto: il caso peggiore che il costruttore
 * sa produrre e' `sitesPerBuild / ticksPerBuild` edifici per tick, tutti
 * residenziali, cioe' venti in una passata da quaranta tick; a un campo ogni due
 * case fanno dieci lotti, e con il margine a cui la campagna punta
 * (`food.targetCoverage`) dodici. Il conto era li' e dava il doppio del numero
 * scritto sotto.
 *
 * Non era un dettaglio. Sotto il tetto giusto l'offerta torna a essere una
 * costante contro una domanda che cresce con la citta' — il difetto che
 * `missingPlotsOf` era nato per chiudere, riaperto un livello piu' in basso — e
 * per tutta la crescita la citta' mangia i due terzi di cio' che le serve con la
 * dispensa a zero. Misurato su terreno pianeggiante: 1394 tick di fame contro
 * 212, cioe' due minuti di carestia contro venti secondi di stretta iniziale.
 *
 * Un prodotto e non un letterale perche' i tre numeri da cui dipende vivono in
 * due file lontani, e questa e' esattamente la relazione che si e' gia' rotta
 * una volta per distrazione: cambiare la cadenza del costruttore, o quanto un
 * campo sfama, adesso muove il tetto da solo.
 */
export const PLOTS_PER_PASS = Math.ceil(
  ((BUILDER.sitesPerBuild / BUILDER.ticksPerBuild) * FARMS.ticksPerPass) /
    BALANCE.farms[FARM_KIND.field].houses *
    BALANCE.food.targetCoverage,
);

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

  /**
   * Dove passa una carreggiata.
   *
   * Legata una volta sola perche' lo stamp di un frutteto la chiama qualche
   * centinaio di volte per lotto. La rete e' una funzione pura del seme, quindi
   * non c'e' nessuno stato da rileggere e la stessa chiusura vale per tutta la
   * partita — che e' anche cio' che permette alla cancellazione di ricostruire
   * esattamente l'impronta che era stata scritta.
   */
  private readonly paved = (x: number, y: number): boolean =>
    this.ctx.streets.isPavement(x, y);

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
    const next = this.retirePass(state);
    const wanted = this.wants(next);
    return wanted > 0 ? this.plantPass(next, wanted) : next;
  }

  /**
   * Quanti lotti questa passata deve provare a piantare.
   *
   * **Una quantita' e non un si'/no.** La simulazione dice quanti campi mancano;
   * fermarsi a `> 0` significava piantarne comunque `PLOTS_PER_PASS` che ne
   * mancasse uno o cento, cioe' un'offerta a ritmo costante contro una domanda
   * che cresce con la citta'. Il tetto per passata resta — la campagna deve
   * comparire, non apparire — ma adesso e' un tetto e non piu' il ritmo.
   *
   * **La domanda si pone alla simulazione e basta.** Chiedeva quanti lotti
   * mancassero *a organico pieno*, passando un `1` scritto qui: una stima su
   * un'aritmetica diversa da quella con cui il tick calcola davvero il raccolto,
   * e una citta' a due terzi di organico ne raccoglieva due terzi credendosi in
   * pareggio. Quale organico usare non e' una scelta di chi pianta — e' della
   * simulazione, che sa cosa ne fara' — quindi adesso attraversa il confine solo
   * la risposta.
   */
  private wants(state: SimState): number {
    return Math.min(PLOTS_PER_PASS, missingPlotsFor(state));
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
          orchardStamp(plot, this.ctx.seed, this.paved),
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

  /** Pianta fino a `wanted` lotti, cercando dal cursore in avanti. */
  private plantPass(state: SimState, wanted: number): SimState {
    let next = state;
    let planted = 0;
    const centre = this.centre;

    for (let step = 0; step < FARMS.searchDepth; step++) {
      if (planted >= wanted) break;

      const corner = this.candidateAt(this.cursor + step, centre);
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
          orchardStamp(plan.plot, this.ctx.seed, this.paved),
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
   * Centro della spirale: il centro dell'isola, portato sul reticolo dei lotti.
   *
   * **Non l'origine del mondo, ed e' la correzione.** L'isola sta in `[0, 512]`
   * e il suo centro e' `(256, 256)`: una spirale ancorata a `(0, 0)` parte da un
   * angolo di oceano, spende tre quarti dei propri candidati su coordinate che
   * non esistono — misurati: 529 dei 2025 cadono sulla mappa — e non arriva mai
   * oltre il quadrante sud-ovest. Una citta' cresciuta a nord-est non vedeva
   * nascere un campo nemmeno affamata.
   *
   * Non si vedeva nei test perche' `testTerrain` genera a partire dal chunk
   * `(0, 0)`: la fixture mette il terreno esattamente dove la spirale guardava.
   * Senza maschera si ricade li', che e' il comportamento giusto per quelle.
   *
   * Lo snap al reticolo non e' cosmetico: l'angolo di un lotto deve restare
   * multiplo del cubo di terreno, o l'impronta trova sotto di se' due quote
   * diverse dove il terreno e' piatto.
   */
  private get centre(): { readonly x: number; readonly y: number } {
    const shape = this.ctx.terrain.shape;
    if (shape === null) return { x: 0, y: 0 };
    return {
      x: Math.round(shape.centreX / FARMS.lattice) * FARMS.lattice,
      y: Math.round(shape.centreY / FARMS.lattice) * FARMS.lattice,
    };
  }

  /**
   * L'angolo di reticolo di indice `n`, su una spirale quadrata attorno a `centre`.
   *
   * **Una spirale e non una scansione per righe.** Per righe, i primi lotti
   * nascerebbero tutti sul bordo sud dell'isola comunque stia la citta'; a
   * spirale la ricerca parte dal centro e si allarga, cioe' trova per prima la
   * campagna *appena fuori* dall'edificato — che e' dove un campo si vede e ha
   * senso.
   */
  private candidateAt(n: number, centre: { readonly x: number; readonly y: number }): { x: number; y: number } {
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
    if (ring === 0) return { x: centre.x, y: centre.y };

    // Ogni lato dell'anello porta `2r` celle: l'angolo appartiene al lato
    // successivo, o si conterebbe due volte.
    const side = 2 * ring;
    const offset = index - start;
    const edge = Math.floor(offset / side);
    const cell = ring * FARMS.lattice;
    const step = (offset % side) * FARMS.lattice;

    if (edge === 0) return { x: centre.x - cell + step, y: centre.y - cell };
    if (edge === 1) return { x: centre.x + cell, y: centre.y - cell + step };
    if (edge === 2) return { x: centre.x + cell - step, y: centre.y + cell };
    return { x: centre.x - cell, y: centre.y + cell - step };
  }
}
