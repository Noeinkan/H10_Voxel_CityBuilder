import { CLUSTER } from './config';
import { planCluster, type ClusterTerms } from './cluster';
import { FACING, type Facing } from '../streets/streetGrid';
import type { GradePlan } from '../grading/grade';
import type { BuildContext } from './buildContext';

/**
 * Il fronte strada di un lotto: chi ha accanto, e a quale fila appartiene.
 *
 * **Perche' e' un modulo e non due metodi del `Builder`.** La regola pura sta
 * gia' in `cluster.ts`; qui c'e' la meta' che ha bisogno del registry — chi
 * tocca chi — e i tre contatori che la fila si porta dietro. Sono stato di
 * **chi mette in fila**, non del ciclo: il `Builder` li leggeva soltanto per la
 * statistica, e tenerli li' voleva dire che l'aggregazione non si poteva
 * guardare senza aprire il file che tiene anche il tick.
 *
 * **L'ordine dei due lati e' parte del contratto.** Sia lo scorrimento sia la
 * raccolta dei vicini guardano prima il lato basso: senza un ordine totale la
 * fila scelta dipenderebbe da quale record il registry ha indicizzato per primo,
 * cioe' la citta' non sarebbe piu' una funzione del seed.
 */
export class Frontage {
  /**
   * Prossima identita' di fila da assegnare.
   *
   * Un contatore e non un hash della posizione: l'identita' di una fila non e' un
   * luogo — la fila cresce, si accosta e si spezza — ed e' l'unica cosa del
   * cluster che non serve a rigenerare niente. Chi entra adotta quella del
   * vicino, quindi questo sale solo quando una fila nuova si apre davvero.
   */
  private nextId = 1;

  /**
   * Membri per fila, e quanti stanno in una fila di almeno due.
   *
   * Serve alla sola statistica, e si tiene incrementale invece di ricavarlo dai
   * record a domanda: contare le file scandendo la citta' sarebbe l'unica cosa
   * nel ciclo il cui costo cresce con il numero di edifici, cioe' esattamente
   * quello che il gate della 4.4 chiede di non fare.
   */
  private readonly sizes = new Map<number, number>();
  private clusteredCount = 0;

  constructor(private readonly ctx: BuildContext) {}

  /** Edifici che stanno in fila con almeno un vicino. */
  get clustered(): number {
    return this.clusteredCount;
  }

  /**
   * Rimette i contatori al passo con una fila che esisteva gia'.
   *
   * Senza, una citta' caricata farebbe ripartire `nextId` da uno, assegnando a
   * una fila nuova l'identita' di una che sta gia' in piedi.
   */
  adopt(cluster: number): void {
    if (cluster >= this.nextId) this.nextId = cluster + 1;
    this.enrol(cluster);
  }

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
  snap(
    x: number,
    y: number,
    footprint: number,
    facing: Facing,
    slack: number,
  ): number {
    const alongY = facing === FACING.east || facing === FACING.west;
    const occupied = (offset: number): boolean =>
      this.occupiedAt(x, y, footprint, alongY, offset);

    // Scendere esce dal lotto prenotato, quindi il riquadro dell'isolato torna a
    // essere il limite: senza, accostarsi a un vicino porterebbe l'impronta in
    // mezzo alla carreggiata, che e' esattamente cio' che la 4.1 ha tolto.
    // Salire e' gia' dentro lo scarto del lotto, e non ha bisogno di un tetto.
    const streets = this.ctx.streets;
    const rect = streets.blockRect(streets.blockAt(x, y));
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
   * Termini della fila a cui questo lotto appartiene, e conteggio dei membri.
   *
   * La regola sta in `cluster.ts` ed e' pura: qui c'e' solo la raccolta dei
   * vicini, che e' l'unica parte che ha bisogno del registry.
   */
  join(
    x: number,
    y: number,
    footprint: number,
    facing: Facing | undefined,
    plan: GradePlan,
    density: number,
  ): ClusterTerms {
    const neighbours = facing === undefined
      ? EMPTY_TERMS
      : this.termsAround(x, y, footprint, facing);

    const terms = planCluster({
      own: plan,
      density,
      neighbours,
      nextId: this.nextId,
    });
    if (terms.id === this.nextId) this.nextId++;

    this.enrol(terms.id);
    return terms;
  }

  /**
   * true se un edificio copre la colonna a `offset` lungo il fronte.
   *
   * Guarda l'intera sezione dell'impronta e non la sola colonna d'angolo: due
   * edifici in fila condividono il fronte ma non per forza tutta la profondita',
   * e cercare il vicino su una colonna sola lo mancherebbe proprio dove le due
   * impronte sono di misura diversa.
   */
  private occupiedAt(
    x: number,
    y: number,
    footprint: number,
    alongY: boolean,
    offset: number,
  ): boolean {
    for (let d = 0; d < footprint; d++) {
      const cx = alongY ? x + d : x + offset;
      const cy = alongY ? y + offset : y + d;
      if (this.ctx.registry.isOccupied(cx, cy)) return true;
    }
    return false;
  }

  /** I termini dei vicini di fronte, dal lato basso a quello alto. */
  private termsAround(
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
        for (const other of this.ctx.registry.at(cx, cy)) {
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

  /** Un membro in piu' in questa fila, e la statistica che ne consegue. */
  private enrol(id: number): void {
    const size = (this.sizes.get(id) ?? 0) + 1;
    this.sizes.set(id, size);
    // Il secondo membro porta in conto anche il primo: prima di lui la fila era
    // un edificio solo, e un edificio solo non e' una fila.
    if (size === 2) this.clusteredCount += 2;
    else if (size > 2) this.clusteredCount++;
  }
}

/** Nessun vicino: chi costruisce a coordinate date non ha un fronte da guardare. */
const EMPTY_TERMS: readonly ClusterTerms[] = [];
