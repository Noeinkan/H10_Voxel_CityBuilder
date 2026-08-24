import type { FarmPlot } from './plotPlan';

/**
 * I lotti agricoli che esistono adesso.
 *
 * **Non e' il `BuildingRegistry`, ed e' una scelta e non una pigrizia.** Quel
 * registry tiene due indici per colonna — `columns`, che `overlaps` legge per
 * impedire di costruire *attraverso* qualcosa, e `groundColumns`, che
 * `isOccupied` legge per sapere cosa prende suolo. Un lotto agricolo non
 * appartiene a nessuno dei due: se stesse in `columns` nessun edificio potrebbe
 * mai nascere su un campo, e se stesse in `groundColumns` non potrebbe nascerci
 * nemmeno una strada. La citta' **deve** poter costruire sopra i propri campi:
 * e' il ciclo che questa fase esiste per creare.
 *
 * Quello che serve davvero e' molto meno — sapere dove si e' gia' piantato, per
 * non piantare due volte — e un `Map` per cella di reticolo lo dice. Aggiungere
 * un quinto tipo di record con regole d'indice tutte sue a un file di
 * settecento righe sarebbe costato di piu' e avrebbe indebolito un invariante
 * che regge quattro cose.
 *
 * **Un lotto non e' un ostacolo.** Ne segue tutto il resto: la collisione degli
 * edifici non lo vede, il picking non lo vede, il budget di chunk non lo conta.
 * Un campo e' una superficie, come la carreggiata.
 */
export class FarmRegistry {
  private readonly plots = new Map<string, FarmPlot>();

  /** Chiave di reticolo di un angolo di lotto. */
  private static keyOf(x: number, y: number): string {
    return `${x},${y}`;
  }

  get count(): number {
    return this.plots.size;
  }

  /** I lotti in ordine di inserimento: e' l'ordine in cui il driver li rivede. */
  get all(): Iterable<FarmPlot> {
    return this.plots.values();
  }

  /** true se in questo angolo di reticolo c'e' gia' un lotto. */
  has(x: number, y: number): boolean {
    return this.plots.has(FarmRegistry.keyOf(x, y));
  }

  add(plot: FarmPlot): void {
    this.plots.set(FarmRegistry.keyOf(plot.x, plot.y), plot);
  }

  /** Toglie un lotto. `false` se non c'era: e' il caso di chi ritira due volte. */
  remove(plot: FarmPlot): boolean {
    return this.plots.delete(FarmRegistry.keyOf(plot.x, plot.y));
  }
}
