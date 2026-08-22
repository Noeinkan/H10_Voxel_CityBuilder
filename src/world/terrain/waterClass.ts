import { WATER_CLASS, type WaterClass } from '../visualBlock';
import { TERRAIN } from './config';

/**
 * Che cos'e' uno specchio d'acqua, deciso dove la profondita' e' ancora nota.
 *
 * La classe viaggia nei tre bit di superficie del voxel d'acqua: il perche' di
 * quel sovraccarico sta su `WATER_CLASS`, in `visualBlock.ts`. Qui c'e' solo
 * chi decide, e decide **qui** perche' e' l'unico posto dove la profondita'
 * esiste: al momento della scrittura vale `seaLevel - top` ed e' gratis, mentre
 * al frammento arriverebbe soltanto una lastra piatta a quota costante.
 */

/** Le quattro direzioni cardinali, come in `sites/siteRules`. */
const AXES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Classifica una colonna sommersa dalla sua profondita' e dalle sponde vicine.
 *
 * `heightAt` e' il campo di quota, che e' funzione pura del seed: si puo'
 * interrogare fuori dal blocco in lavorazione senza stato ne cache, ed e' cio'
 * che permette di sondare le sponde senza cuciture al confine fra due chunk —
 * un sondaggio limitato al blocco classificherebbe la stessa insenatura in due
 * modi diversi ai due lati del bordo.
 *
 * Il canale si riconosce dall'essere **chiuso su un asse**: terra a portata su
 * entrambi i versi di x oppure di y. Una baia aperta ha una sponda sola e resta
 * mare; un braccio stretto ne ha due e diventa specchio.
 */
export function classifyWater(
  x: number,
  y: number,
  depth: number,
  heightAt: (x: number, y: number) => number,
): WaterClass {
  if (depth <= TERRAIN.shallowDepth) return WATER_CLASS.shallow;
  // Oltre il bassofondo un canale non e' piu' credibile: un braccio profondo e'
  // un fiordo, e si guarda come mare.
  if (depth > TERRAIN.canalMaxDepth) return WATER_CLASS.open;

  for (let axis = 0; axis < 2; axis++) {
    if (shoreWithin(x, y, AXES[axis * 2], heightAt) && shoreWithin(x, y, AXES[axis * 2 + 1], heightAt)) {
      return WATER_CLASS.canal;
    }
  }
  return WATER_CLASS.open;
}

function shoreWithin(
  x: number,
  y: number,
  [dx, dy]: readonly [number, number],
  heightAt: (x: number, y: number) => number,
): boolean {
  for (let d = 1; d <= TERRAIN.canalReach; d++) {
    if (heightAt(x + dx * d, y + dy * d) >= TERRAIN.seaLevel) return true;
  }
  return false;
}
