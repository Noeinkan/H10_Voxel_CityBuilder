import type { Region } from '../terrain/region';
import { CROSSINGS } from './config';
import {
  chooseCrossing,
  type CrossingPlan,
  type CrossingProbe,
  type CrossingTower,
} from './crossingPlan';

/** I due territori e le torri fra cui cercare il collegamento. */
export interface SecondaryBridgeQuery {
  readonly primary: Region;
  readonly secondary: Region;
  readonly towers: readonly CrossingTower[];
  readonly probe: CrossingProbe;
}

/**
 * Il ponte piu' corto fra un settore secondario e la citta' primaria.
 *
 * `chooseCrossing` sa gia' dire se due torri si guardano, sono abbastanza alte
 * e hanno aria fra loro. Qui resta la sola informazione che quel dominio non
 * possiede: i due capi devono appartenere a territori diversi e sotto il vuoto
 * deve correre acqua vera. Senza quest'ultimo controllo una fila urbana lunga
 * verrebbe premiata come se avesse unito due isole.
 */
export function chooseSecondaryBridge(query: SecondaryBridgeQuery): CrossingPlan | null {
  const secondary = query.towers.filter((tower) =>
    inside(query.secondary, tower) && mature(tower));
  const primary = query.towers.filter((tower) =>
    inside(query.primary, tower) && mature(tower));

  let best: CrossingPlan | null = null;
  let bestRun = Number.POSITIVE_INFINITY;

  for (const from of secondary) {
    const result = chooseCrossing({
      ...query.probe,
      x: from.x,
      y: from.y,
      from,
      towers: primary,
    });
    if (!result.ok || !crossesWater(result.plan, query.probe)) continue;

    const run = result.plan.axis === 0 ? result.plan.sizeX : result.plan.sizeY;
    if (run >= bestRun) continue;
    best = result.plan;
    bestRun = run;
  }

  return best;
}

function inside(region: Region, tower: CrossingTower): boolean {
  return tower.x >= region.minX && tower.x < region.minX + region.sizeX &&
    tower.y >= region.minY && tower.y < region.minY + region.sizeY;
}

/** Altezza del corpo che garantisce il salto minimo anche su terreno piano. */
function mature(tower: CrossingTower): boolean {
  return tower.height >= CROSSINGS.minSkyRise + CROSSINGS.skyDeckDrop + 1;
}

/** true se la mezzeria attraversa un canale continuo abbastanza largo. */
function crossesWater(plan: CrossingPlan, probe: CrossingProbe): boolean {
  const run = plan.axis === 0 ? plan.sizeX : plan.sizeY;
  const across = plan.axis === 0
    ? plan.y + (plan.sizeY >> 1)
    : plan.x + (plan.sizeX >> 1);

  let wet = 0;
  for (let along = CROSSINGS.corbel; along < run - CROSSINGS.corbel; along++) {
    const x = plan.axis === 0 ? plan.x + along : across;
    const y = plan.axis === 0 ? across : plan.y + along;
    wet = probe.land(x, y) ? 0 : wet + 1;
    if (wet >= CROSSINGS.automatic.minWaterRun) return true;
  }
  return false;
}
