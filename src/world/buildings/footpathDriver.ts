import { FOOTPATHS } from '../footpaths/config';
import { FootpathNetwork } from '../footpaths/FootpathNetwork';
import type { Facing } from '../streets/streetGrid';
import { doorstepOf } from './siteWorks';
import type { BuildContext } from './buildContext';

/**
 * La passata del tessuto pedonale: tiene i vicoli e li manda in coda.
 *
 * **Non decide niente sulla forma di un vicolo** — quella la decide
 * `src/world/footpaths/`, che e' puro e non conosce il mondo — e non scrive
 * nessun voxel da se': tutto passa dalla coda di superficie, come ogni altro
 * pezzo di suolo pubblico.
 *
 * **Non ha una passata a cadenza, e non e' una dimenticanza.** Gli altri driver
 * hanno un `pass()` che gira ogni N tick perche' guardano una citta' che cambia
 * sotto di loro; qui l'unico evento che possa far nascere un vicolo e' un
 * edificio nuovo, e allora il posto giusto e' il momento in cui nasce. E' la
 * stessa scelta — e la stessa riga del `Builder` — del capillare carrabile:
 * costruisci, collega, affacciati.
 *
 * **Dopo il tracciato e mai prima.** `RoadNetwork.connect` aggiorna il proprio
 * indice in modo sincrono, quindi arrivando secondi si trova gia' davanti la
 * carreggiata appena tirata: se il capillare e' arrivato fino al portone, qui
 * non parte nessuna ricerca. Con l'ordine opposto ogni casa lontana dalla rete
 * pagherebbe due ricerche per disegnare due volte lo stesso collegamento.
 */
export class FootpathDriver {
  private readonly paths: FootpathNetwork;

  constructor(
    private readonly ctx: BuildContext,
    /** true se la carreggiata tiene questa colonna: il sentiero ci si innesta. */
    carries: (x: number, y: number) => boolean,
  ) {
    this.paths = new FootpathNetwork(
      ctx.terrain,
      (x, y) => ctx.registry.isOccupied(x, y),
      carries,
    );
  }

  /** Colonne di lastricato che il tessuto pedonale tiene. */
  get paved(): number {
    return this.paths.cells;
  }

  /**
   * Tira il vicolo di un edificio appena nato, se ne serve uno.
   *
   * Il lastricato non porta una quota di progetto: un sentiero **dipinge il
   * terreno dov'e'** e non solleva niente, quindi la coda non costruisce nessun
   * muro e la cella costa un voxel invece dei sei di una banchina. E' anche cio'
   * che lo rende leggibile su un pendio — segue il gradino invece di
   * spianarlo — ed e' la ragione per cui `FOOTPATHS.maxStep` puo' permettersi
   * di essere il doppio di quello di una strada.
   */
  connect(x: number, y: number, footprint: number, facing: Facing | undefined): void {
    const door = doorstepOf(this.ctx.terrain, x, y, footprint, facing);
    for (const cell of this.paths.connect(door.x, door.y)) {
      this.ctx.surface.enqueue({
        x: cell.x,
        y: cell.y,
        palette: FOOTPATHS.palette,
        priority: FOOTPATHS.priority,
      });
    }
  }
}
