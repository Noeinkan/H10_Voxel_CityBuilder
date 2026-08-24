import type { SurfacePaint } from '../buildings/surfaceQueue';
import { STAMP_EMPTY } from '../buildings/stamp';
import { cropCover } from '../terrain/groundcover';
import { plotRows, type FarmPlot } from './plotPlan';

/**
 * Da un lotto pianificato alle colonne da dipingere.
 *
 * **Non scrive voxel.** Come ogni generatore di questa cartella produce una
 * descrizione — qui delle `SurfacePaint` — e chi la applica e' la coda del
 * suolo, a budget. E' la stessa divisione fra `generateBuilding` e
 * `growthQueue`, con la differenza che un campo non ha volume da far comparire:
 * ha una superficie, quindi passa dalla coda della superficie.
 *
 * **Il terreno non si tocca.** Ogni paint porta `palette: 0`, cioe' «lascia il
 * suolo dov'e' e posa solo il solco». Non c'e' uno slot di terra arata nella
 * palette e non se ne aggiunge uno (invarianti 4 e 5): a leggere come campo, a
 * distanza isometrica, e' la **regolarita' dei solchi** e non il colore del
 * suolo. E' lo stesso argomento che il terreno fa gia' per la roccia — a dare
 * varieta' e' il ciglio, non la tinta.
 */

/**
 * Priorita' di un solco nella coda del suolo.
 *
 * **La piu' bassa che esista**, sotto la carreggiata secondaria che vale 1: dove
 * un campo e una strada rivendicano la stessa colonna vince sempre la strada, e
 * vince anche a posteriori. Un lotto non contende il suolo a nessuno — e' la
 * versione in coda dello stesso principio per cui non entra negli indici di
 * collisione del registry.
 */
export const FARM_PAINT_PRIORITY = 0;

/** Le colonne di un lotto, pronte per `SurfaceQueue.enqueue`. */
export function paintPlot(plot: FarmPlot): SurfacePaint[] {
  return columns(plot, cropCover(plot.alongY));
}

/**
 * Le colonne di un lotto da spogliare quando si ritira.
 *
 * Sono le stesse di `paintPlot` con `cover: 0`, che per la coda significa
 * «togli il marcatore e lascia il prato». Non c'e' niente da demolire perche'
 * non c'era niente di costruito, ed e' esattamente per questo che un campo
 * mangiato dalla citta' non passa da `clearance.ts`: quella resta l'unica
 * demolizione del progetto, e deve restare tale.
 *
 * Le colonne che nel frattempo un edificio ha preso le scarta la coda da se'
 * (`canPaint` legge `isOccupied`): li' il marcatore l'aveva gia' portato via la
 * bonifica del lotto.
 */
export function clearPlot(plot: FarmPlot): SurfacePaint[] {
  return columns(plot, CLEAR_COVER);
}

/** `cover: 0` e' la richiesta esplicita di togliere: `undefined` sarebbe «non toccare». */
const CLEAR_COVER = 0;

function columns(plot: FarmPlot, cover: number): SurfacePaint[] {
  const out: SurfacePaint[] = [];
  for (const cell of plotRows(plot)) {
    out.push({
      x: cell.x,
      y: cell.y,
      palette: STAMP_EMPTY,
      priority: FARM_PAINT_PRIORITY,
      cover,
    });
  }
  return out;
}
