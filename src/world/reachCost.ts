import { BALANCE, type StepCost } from '../sim';
import type { StreetNetwork } from './streets/StreetNetwork';
import { BIOME } from './terrain/config';
import type { TerrainMap } from './terrain/TerrainMap';

/**
 * Quanto costa all'influenza di un catalizzatore attraversare una colonna.
 *
 * **Sta in `src/world/` perche' e' l'unico posto da cui si possono leggere
 * terreno e strade insieme.** `src/sim/` non importa `src/engine/` per
 * contratto, e le configurazioni di entrambi ci passano; la simulazione riceve
 * quindi una funzione gia' fatta invece del mondo, com'e' gia' per
 * `SkylineQuery.waterDistance` e `BuildSiteQuery.headroomAt`.
 *
 * **L'acqua si controlla prima della strada, e non e' un dettaglio d'ordine.**
 * La rete stradale e' una funzione pura del seed e non conosce la
 * `TerrainMap`: una carreggiata esiste anche in mezzo al mare, e chiedere prima
 * della pavimentazione farebbe nuotare l'influenza lungo una strada fantasma
 * fino all'isola di fronte.
 *
 * **Una colonna non ancora generata vale acqua.** `biomeAt` risponde `ocean`
 * dove il terreno non e' arrivato, ed e' la risposta giusta: l'influenza non
 * deve entrare in terra che non esiste. Quando l'isola si allarga, il costo
 * cambia sotto le portate gia' calcolate, e a rimetterle in pari e'
 * `rebuildField`.
 */
export function createReachCost(map: TerrainMap, streets: StreetNetwork): StepCost {
  const { pavement, land, steep, water } = BALANCE.reach;

  return (x, y) => {
    if (map.biomeAt(x, y) === BIOME.ocean) return water;
    if (streets.isPavement(x, y)) return pavement;
    if (map.isBuildable(x, y)) return land;
    // Roccia e cigli: ci si passa, ma il giro si sente.
    return steep;
  };
}
