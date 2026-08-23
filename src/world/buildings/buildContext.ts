import type { TerrainMap } from '../terrain/TerrainMap';
import type { VoxelWorld } from '../VoxelWorld';
import type { StreetNetwork } from '../streets/StreetNetwork';
import type { BuildingRegistry } from './BuildingRegistry';
import type { GrowthQueue } from './growthQueue';
import type { SurfaceQueue } from './surfaceQueue';

/**
 * Cio' che ogni sottosistema della costruzione ha bisogno di avere in mano.
 *
 * **Un oggetto solo invece di sei parametri ripetuti.** I driver — landmark,
 * campate, citta' in quota — vogliono tutti la stessa cosa: il mondo per
 * scrivere, il terreno per leggere, la rete stradale per orientarsi, il registry
 * per sapere cosa esiste, e le due code per far comparire quello che decidono.
 * Elencarli uno per uno in ogni costruttore vorrebbe dire cambiare tre firme
 * ogni volta che se ne aggiunge uno.
 *
 * **Il registry e' scrivibile qui e non lo e' fuori.** Un driver aggiunge record
 * — e' il suo mestiere — mentre chi tiene il `Builder` vede solo
 * `ReadonlyBuildingRegistry`: la garanzia «nessuno scrive un edificio
 * all'infuori di qui» resta vera, e «qui» e' adesso questa cartella invece di
 * un file solo.
 */
export interface BuildContext {
  readonly world: VoxelWorld;
  readonly terrain: TerrainMap;
  readonly streets: StreetNetwork;
  readonly registry: BuildingRegistry;
  readonly growth: GrowthQueue;
  readonly surface: SurfaceQueue;
  readonly seed: number;
}
