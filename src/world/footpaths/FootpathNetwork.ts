import { GROUND, groundKindOf } from '../grading/grade';
import { FOOTPATHS } from './config';
import {
  walkBounds,
  walkFootpath,
  type FootpathProbe,
  type FootpathStep,
  type WalkBounds,
} from './walk';

/**
 * Il tessuto pedonale tenuto e interrogato: le sonde sul luogo e l'indice.
 *
 * **Cresce e non si rifa' mai**, ed e' l'opposto esatto di `RoadNetwork`. Quella
 * rete e' un albero sui poli e si ricostruisce intera quando i poli cambiano;
 * questa e' un insieme di colonne che si aggiunge una casa per volta e non ha
 * niente da invalidare, perche' non c'e' nessuna forma d'insieme da ricalcolare:
 * un vicolo posato resta dov'e' anche quando la citta' attorno raddoppia.
 *
 * Da qui l'unica cosa che questa classe tiene — l'indice delle colonne — e le due
 * cose che chiede a chi la costruisce: dov'e' il suolo occupato e dov'e' la
 * carreggiata. Il resto lo legge dal terreno.
 *
 * **Non scrive nessun voxel.** Come per il tracciato, tutto passa dalla coda di
 * superficie del `Builder`: qui si decide *dove* passa un sentiero, non quando
 * compare.
 */
/**
 * Il terreno ridotto a cio' che un sentiero deve sapere. `TerrainMap` lo
 * soddisfa, ed e' la stessa scelta di `DigProbe` in `buildings/sunkenDig.ts`:
 * quattro letture invece della mappa intera rendono questa classe provabile in
 * Node scrivendo a mano una collina, senza generare un'isola.
 */
export interface FootpathGround {
  readonly has: (x: number, y: number) => boolean;
  readonly heightAt: (x: number, y: number) => number;
  readonly biomeAt: (x: number, y: number) => number;
  readonly slopeAt: (x: number, y: number) => number;
}

export class FootpathNetwork {
  private readonly index = new Set<string>();

  constructor(
    private readonly terrain: FootpathGround,
    /** true se un edificio tiene questa colonna. */
    private readonly occupied: (x: number, y: number) => boolean,
    /** true se la carreggiata — o un impalcato — tiene questa colonna. */
    private readonly paved: (x: number, y: number) => boolean,
  ) {}

  /** Colonne di lastricato che il tessuto tiene. */
  get cells(): number {
    return this.index.size;
  }

  /** true se qui passa gia' un sentiero. */
  has(x: number, y: number): boolean {
    return this.index.has(`${x},${y}`);
  }

  /**
   * Tira il vicolo da un portone al primo suolo pubblico, e lo registra.
   *
   * Torna le sole colonne **nuove**, che sono quelle da far comparire: il tratto
   * gia' posato da un vicino non si ridipinge, e la colonna di carreggiata su
   * cui il vicolo si innesta non e' sua da dipingere — li' vince la strada,
   * adesso e a posteriori.
   *
   * **Non fa niente per la quasi totalita' degli edifici**, ed e' il caso
   * normale: una casa costruita sul fronte ha il portone sulla carreggiata, la
   * prima domanda risponde subito e non parte nessuna ricerca. Il vicolo nasce
   * dove il tessuto si e' allontanato dalla strada — dietro la prima fila, nel
   * cuore di un isolato, sul fianco di una collina — che e' esattamente la
   * fascia che `ROADS.frontageReach` lascia scoperta di proposito.
   */
  connect(x: number, y: number): readonly FootpathStep[] {
    if (this.isPublic(x, y)) return [];
    // **Un vicolo non parte da dove non si puo' stare**, e il caso esiste:
    // `doorstepOf` ripiega sull'ancora del lotto quando il fronte guarda la
    // battigia, e l'ancora sta *dentro* l'edificio. La ricerca partirebbe lo
    // stesso — il capo non paga il proprio costo — e restituirebbe una prima
    // colonna che `SurfaceQueue.canPaint` scarta in silenzio.
    if (!(this.costOf(x, y) < Number.POSITIVE_INFINITY)) return [];

    const bounds = walkBounds(x, y, FOOTPATHS.reach);
    const walk = walkFootpath({
      fromX: x,
      fromY: y,
      toAny: (cx, cy) => this.isPublic(cx, cy),
      bounds,
      probe: this.probe(bounds),
    });
    if (walk === null) return [];

    const fresh: FootpathStep[] = [];
    for (const step of walk.steps) {
      if (this.isPublic(step.x, step.y)) continue;
      this.index.add(`${step.x},${step.y}`);
      fresh.push(step);
    }
    return fresh;
  }

  /** Carreggiata o sentiero: il suolo che il vicolo cerca e non ridipinge. */
  private isPublic(x: number, y: number): boolean {
    return this.paved(x, y) || this.index.has(`${x},${y}`);
  }

  /**
   * La sonda del sentiero, con le proprie risposte tenute da parte sul riquadro.
   *
   * Stessa mossa di `RoadNetwork.probe` e per la stessa ragione, in piccolo: la
   * ricerca chiede il costo di una colonna una volta per ogni vicino che la
   * guarda, cioe' fino a otto, e ogni domanda costa cinque interrogazioni del
   * registry — la colonna piu' i quattro assi di `hugsWall`. Non e' una cache da
   * invalidare: terreno e suolo occupato non cambiano *durante* una ricerca,
   * perche' `connect` e' sincrona e chi scrive nel registry sta aspettando che
   * ritorni, quindi la memoria vive quanto un vicolo e non un tick di piu'.
   *
   * `NaN` vuol dire «non ancora chiesto» e non puo' essere `Infinity`: quello e'
   * un valore legale — dice che di li' non si passa — e usarlo come segnaposto
   * farebbe ricalcolare per sempre proprio i muri, che sono la meta' delle
   * colonne di un vicolo.
   */
  private probe(bounds: WalkBounds): FootpathProbe {
    const width = bounds.x1 - bounds.x0 + 1;
    const height = bounds.y1 - bounds.y0 + 1;
    const cells = width > 0 && height > 0 ? width * height : 0;
    const memo = new Float64Array(cells).fill(Number.NaN);

    return {
      levelAt: (x: number, y: number): number => this.terrain.heightAt(x, y),
      costAt: (x: number, y: number): number => {
        const cx = x - bounds.x0;
        const cy = y - bounds.y0;
        // Fuori dal riquadro si calcola e non si tiene: capita solo al bordo,
        // dove la regola della diagonale guarda una colonna che la ricerca non
        // visitera' mai.
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) return this.costOf(x, y);
        const at = cy * width + cx;
        const known = memo[at];
        if (!Number.isNaN(known)) return known;
        const value = this.costOf(x, y);
        memo[at] = value;
        return value;
      },
    };
  }

  /**
   * Quanto costa al sentiero stare in una colonna, e `Infinity` se non ci sta.
   *
   * **La battigia e' un rifiuto, e non e' un dettaglio.** Un sentiero dipinge il
   * voxel di sommita' della colonna e non solleva niente: su un bassofondo quella
   * sommita' e' il **fondale**, quindi il lastricato comparirebbe sott'acqua. E'
   * la banchina di `grading/` a saper costruire un piano sulla riva, e un vicolo
   * non e' una banchina.
   */
  private costOf(x: number, y: number): number {
    if (!this.terrain.has(x, y)) return Number.POSITIVE_INFINITY;
    if (this.occupied(x, y)) return Number.POSITIVE_INFINITY;

    const kind = groundKindOf(
      this.terrain.biomeAt(x, y),
      this.terrain.slopeAt(x, y),
      this.terrain.heightAt(x, y),
    );
    if (kind === GROUND.refused || kind === GROUND.shore) return Number.POSITIVE_INFINITY;

    // Il suolo pubblico e' dove la ricerca si ferma, non dove passa: questo
    // costo non entra mai in un cammino piu' lungo, serve a farsi trovare. Il
    // minimo della sezione, cosi' che fra due colonne pubbliche ugualmente
    // lontane decida la distanza e non il colore di cio' che sta in mezzo.
    if (this.isPublic(x, y)) return FOOTPATHS.pavedCost;

    return this.hugsWall(x, y) ? FOOTPATHS.wallCost : FOOTPATHS.openCost;
  }

  /**
   * true se la colonna ha un muro su almeno uno dei quattro assi.
   *
   * Solo gli assi e non gli angoli: un vicolo che corre lungo una facciata la
   * tocca di lato, mentre una colonna che vede una casa solo in diagonale e'
   * gia' in mezzo al prato — contarla farebbe preferire le diagonali fra due
   * cortili, che e' il tessuto sfilacciato che questo costo esiste per evitare.
   */
  private hugsWall(x: number, y: number): boolean {
    return this.occupied(x + 1, y) || this.occupied(x - 1, y) ||
      this.occupied(x, y + 1) || this.occupied(x, y - 1);
  }
}
