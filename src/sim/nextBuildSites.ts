import { CHUNK } from '../world/chunkCoords';
import { columnIndex } from '../world/terrain/columnBlock';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { BALANCE } from './balance';
import { BUILDING_CLASS, type BuildingClass } from './classes';
import { cellIndexOf, DesirabilityField } from './DesirabilityField';
import type { SimState } from './SimState';

/**
 * Decisioni della simulazione: dove crescera' il prossimo edificio.
 *
 * E' l'unico output "di volonta'" della simulazione, e non scrive niente da
 * nessuna parte. Restituisce candidati ordinati; chi costruisce sta fuori da
 * `src/sim/` e resta libero di ignorarli.
 */

export interface BuildSite {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
  /** Desiderabilita' della cella per quella classe, 0..255. */
  readonly score: number;
}

export interface BuildSiteQuery {
  /**
   * Se presente, si valuta solo questa classe: la risposta dice dove mettere il
   * prossimo edificio *di quel tipo*, non dove mettere il prossimo edificio.
   * Senza, ogni cella corre con la sua classe migliore.
   */
  readonly class?: BuildingClass;
}

/**
 * Fino a `n` candidati, dal migliore al peggiore.
 *
 * Una cella e' candidata solo se soddisfa tutte e tre le condizioni:
 *
 * 1. la colonna e' `buildable` nella `TerrainMap`;
 * 2. nessun edificio la occupa;
 * 3. la sua desiderabilita' **supera** la soglia della classe.
 *
 * Ogni cella compare al massimo una volta, con la classe che ci prende il
 * punteggio piu' alto: tre righe per la stessa cella direbbero tre volte la
 * stessa cosa e riempirebbero i primi dieci posti con un solo isolato.
 *
 * **Dove si guarda.** Solo dentro le colonne di chunk che il campo ha allocato,
 * e il campo alloca solo dove un catalizzatore o un edificio l'ha toccato. Una
 * mappa senza catalizzatori non ha candidati e non costa nulla da interrogare,
 * per quanto sia grande.
 *
 * **Come si guarda.** I tre `Uint8Array` della colonna di chunk si prendono una
 * volta sola e poi si scorrono per indice. La versione con un accesso per cella
 * e per classe attraverso l'API pubblica del campo costava venticinque volte
 * tanto, ed e' una scansione che la scena di debug fa a ogni ridisegno.
 *
 * **Ordinamento totale.** A parita' di punteggio decidono `x`, poi `y`, poi la
 * classe. Serve al determinismo: senza, il risultato dipenderebbe dall'ordine di
 * allocazione dei chunk, che a sua volta dipende dall'ordine in cui il giocatore
 * ha piazzato i catalizzatori.
 */
export function nextBuildSites(
  state: SimState,
  terrainMap: TerrainMap,
  n: number,
  query: BuildSiteQuery = {},
): readonly BuildSite[] {
  if (n <= 0) return EMPTY_SITES;

  const only = query.class;
  const thresholds = BALANCE.desirability.siteThreshold;

  // Una classe esclusa riceve una soglia irraggiungibile invece di un ramo in
  // piu' nel ciclo: 256 e' fuori dal dominio di un `Uint8Array`, quindi nessun
  // valore la supera mai.
  const unreachable = BALANCE.limits.maxDesirability + 1;
  const minOf = (cls: BuildingClass): number =>
    only === undefined || only === cls ? thresholds[cls] : unreachable;

  const minResidential = minOf(BUILDING_CLASS.residential);
  const minProduction = minOf(BUILDING_CLASS.production);
  const minCivic = minOf(BUILDING_CLASS.civic);

  const best: BuildSite[] = [];

  for (const chunk of state.field.chunks.values()) {
    // Fuori dalle colonne generate non si costruisce: la `TerrainMap` direbbe
    // comunque "non edificabile" per ogni cella, tanto vale saltare il blocco.
    const terrainChunk = terrainMap.getChunk(chunk.ccx, chunk.ccy);
    if (terrainChunk === null) continue;

    // Campo e `TerrainMap` hanno la stessa chunkatura e la stessa disposizione
    // per colonna, quindi un solo indice serve a entrambi.
    const buildable = terrainChunk.buildable;
    const residential = chunk.values[BUILDING_CLASS.residential];
    const production = chunk.values[BUILDING_CLASS.production];
    const civic = chunk.values[BUILDING_CLASS.civic];
    const occupancy = chunk.occupancy;

    const originX = DesirabilityField.originOf(chunk.ccx);
    const originY = DesirabilityField.originOf(chunk.ccy);

    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = cellIndexOf(lx, ly);

        // Prima il campo: e' la lettura piu' economica e scarta quasi tutto.
        let bestClass: BuildingClass = BUILDING_CLASS.residential;
        let bestScore = 0;
        if (residential[i] > minResidential) bestScore = residential[i];
        if (production[i] > minProduction && production[i] > bestScore) {
          bestScore = production[i];
          bestClass = BUILDING_CLASS.production;
        }
        if (civic[i] > minCivic && civic[i] > bestScore) {
          bestScore = civic[i];
          bestClass = BUILDING_CLASS.civic;
        }
        if (bestScore === 0) continue;

        if (occupancy[i] !== 0) continue;
        if (buildable[columnIndex(lx, ly)] !== 1) continue;

        insertSite(best, { x: originX + lx, y: originY + ly, class: bestClass, score: bestScore }, n);
      }
    }
  }

  return best;
}

/** Inserimento ordinato in una lista lunga al massimo `limit`. */
function insertSite(list: BuildSite[], site: BuildSite, limit: number): void {
  if (list.length === limit && compareSites(site, list[list.length - 1]) >= 0) return;

  let at = list.length;
  while (at > 0 && compareSites(site, list[at - 1]) < 0) at--;
  list.splice(at, 0, site);
  if (list.length > limit) list.pop();
}

/** Punteggio decrescente, poi `x`, `y` e classe crescenti. Ordine totale. */
function compareSites(a: BuildSite, b: BuildSite): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  return a.class - b.class;
}

const EMPTY_SITES: readonly BuildSite[] = [];
