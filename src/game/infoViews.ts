import {
  createSimInfoSampler,
  FARM_KIND,
  infoViewSpecOf,
  type InfoSampler,
  type InfoViewKind,
  type SimState,
} from '../sim';
import { PLOT_KIND, plotRows, type FarmPlot } from '../world/farms/plotPlan';

/**
 * La composizione delle viste informative: la simulazione da' le sue quattro,
 * il mondo porta i lotti agricoli che rendono la vista del cibo.
 *
 * **E' cablaggio, non logica.** Qui non si calcola niente che non sia un indice
 * di categoria o un rinvio: i campionatori veri stanno in `src/sim/infoViews.ts`,
 * e questa funzione esiste solo perche' la posizione dei campi non e' della
 * simulazione — il mondo la sa e la consegna qui.
 */

/** Categoria di cibo di un lotto del mondo, allineata a `FOOD_CATEGORIES`. */
function foodCategoryOf(plot: FarmPlot): number {
  return plot.kind === PLOT_KIND.orchard ? FARM_KIND.orchard : FARM_KIND.field;
}

/**
 * Il campionatore per una vista, con i lotti agricoli del mondo.
 *
 * Le quattro viste della simulazione passano a `createSimInfoSampler`; il cibo
 * rasterizza i lotti su una mappa per colonna e vi sovrappone le torri
 * idroponiche lette dagli edifici. `'off'` non ha campionatore: chi lo chiede
 * ha gia' deciso di spegnere l'overlay.
 */
export function createInfoSampler(
  kind: InfoViewKind,
  state: SimState,
  farmPlots: Iterable<FarmPlot>,
): InfoSampler {
  if (kind === 'food') {
    const spec = infoViewSpecOf(kind);
    const cells = new Map<string, number>();
    for (const plot of farmPlots) {
      const category = foodCategoryOf(plot);
      for (const cell of plotRows(plot)) cells.set(`${cell.x},${cell.y}`, category);
    }
    for (const building of state.buildings) {
      if (building.specialization === 'farming') {
        cells.set(`${building.x},${building.y}`, FARM_KIND.tower);
      }
    }
    return {
      kind,
      mode: spec.mode,
      normalized: spec.normalized,
      sparse: spec.sparse,
      categories: spec.categories,
      sample(x: number, y: number): number {
        return cells.get(`${x},${y}`) ?? -1;
      },
    };
  }

  return createSimInfoSampler(kind, state);
}
