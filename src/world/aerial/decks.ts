import { isBuildable, type AerialPart } from './config';
import type { DeckRect } from './deckPlan';

/**
 * Le quote su cui si puo' costruire, sopra una colonna.
 *
 * **E' il punto in cui «edificabile» smette di essere un bit per `(x, y)`.**
 * `TerrainMap` continua a tenere una altezza e un bit per colonna, e non e' una
 * rinuncia: duplicarla per livello moltiplicherebbe per il numero di quote tutta
 * la memoria densa del terreno, per rappresentare qualcosa che esiste su una
 * manciata di colonne. Il livello si risolve **dove si risolve il lotto** — qui,
 * da cio' che il registry gia' sa — e la mappa resta quella che era.
 *
 * **La quota si porta dietro il proprio riquadro.** E' la differenza fra questa
 * fase e il tentativo che l'ha preceduta: li' l'impalcato era grande abbastanza
 * da ospitare un lotto qualunque, e bastava dire *a che quota*; qui gli impalcati
 * sono piccoli e di forme diverse, quindi il lotto in quota **e'** l'impalcato, e
 * chi sceglie deve sapere anche dove finisce.
 *
 * Puro e senza stato come `skyline/tiers.ts`: entrano dei record ridotti all'osso
 * e una quota di terreno, esce un elenco di piani. Chi il registry ce l'ha in
 * mano fa la raccolta, come `cluster.ts` riceve un `GradePlan` invece del mondo.
 */

/** Un `BuildingRecord` ridotto a cio' che serve per dire se offre un piano. */
export interface DeckSource {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Lato dell'impronta, con i nomi del record: `footprintY` assente vale quadrata. */
  readonly footprint: number;
  readonly footprintY?: number;
  /** Prima quota occupata. */
  readonly baseZ: number;
  /** Voxel occupati in altezza a partire da `baseZ`. */
  readonly height: number;
  /** Parte della citta' in quota, se il record e' una delle sue. */
  readonly aerial?: AerialPart;
}

/** Una quota su cui un'impronta puo' poggiare. */
export interface BuildDeck {
  /** Prima cella su cui si costruisce: il piano calpestabile sta subito sotto. */
  readonly z: number;
  readonly kind: 'ground' | 'aerial';
  /** Di quanto il piano sta sopra il terreno. Zero al suolo. */
  readonly rise: number;
  /** Il riquadro entro cui il lotto deve stare. Assente al suolo, che non ne ha. */
  readonly rect?: DeckRect;
  /**
   * Il record che offre questo piano. Zero al suolo, che non e' di nessuno.
   *
   * Serve a chi costruisce per dire all'impalcato che ora e' **abitato**: un
   * impalcato vuoto puo' cadere quando il suo ospite cresce, uno abitato no.
   */
  readonly id: number;
}

/**
 * I piani che una colonna ha a disposizione, dal piu' basso al piu' alto.
 *
 * Il suolo c'e' sempre: e' il piano che l'isola offre da sempre, e resta il primo
 * della lista perche' e' il piu' basso — una citta' che non ha ancora riempito il
 * suolo continua a riempirlo. Sopra ci sono le mensole e i nodi che passano di
 * qui: **non i tratti di percorso**, dove si passa e basta, e non le gambe.
 *
 * Questa funzione dice *dove si potrebbe*, non *dove si puo'*: che il volume
 * sopra un piano sia libero lo sa `overlaps`, e resta compito suo.
 */
export function decksAt(at: readonly DeckSource[], groundZ: number): readonly BuildDeck[] {
  const out: BuildDeck[] = [{ z: groundZ, kind: 'ground', rise: 0, id: 0 }];

  for (const source of at) {
    if (source.aerial === undefined || !isBuildable(source.aerial)) continue;
    const z = source.baseZ + source.height;
    out.push({
      z,
      kind: 'aerial',
      rise: z - groundZ,
      id: source.id,
      rect: {
        x: source.x,
        y: source.y,
        sizeX: source.footprint,
        sizeY: source.footprintY ?? source.footprint,
      },
    });
  }

  return out.sort((a, b) => a.z - b.z);
}
