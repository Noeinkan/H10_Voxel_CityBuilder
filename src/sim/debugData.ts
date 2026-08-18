import { CHUNK } from '../world/chunkCoords';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { cellIndexOf, DesirabilityField } from './DesirabilityField';
import type { SimState } from './SimState';

/**
 * L'unico punto in cui la simulazione scrive nel `VoxelWorld`, ed e' per debug.
 *
 * Scrive la desiderabilita' della classe selezionata nel layer `data`, una cella
 * per colonna, alla quota della superficie. Non tocca `blocks`: nessun voxel
 * viene creato, modificato o distrutto, nessun chunk viene marcato sporco e
 * nessuna mesh viene invalidata — sono le due garanzie che `VoxelWorld` da' sul
 * secondo layer, e questa funzione e' scritta per non poterle violare.
 *
 * L'import di `VoxelWorld` e' solo di tipo: a runtime `src/sim/` non tira dentro
 * niente del mondo voxel, e i test girano in Node senza toccare questo file.
 */
export function writeDesirabilityData(
  world: VoxelWorld,
  state: SimState,
  terrainMap: TerrainMap,
): number {
  const cls = state.selectedClass;
  let written = 0;

  for (const chunk of state.field.chunks.values()) {
    if (!terrainMap.hasChunk(chunk.ccx, chunk.ccy)) continue;

    const values = chunk.values[cls];
    const originX = DesirabilityField.originOf(chunk.ccx);
    const originY = DesirabilityField.originOf(chunk.ccy);

    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = originX + lx;
        const y = originY + ly;

        // Quota del voxel di superficie: `heightAt` conta i voxel pieni, quindi
        // l'ultimo sta a `height - 1`.
        const z = Math.max(0, terrainMap.heightAt(x, y) - 1);
        world.setData(x, y, z, values[cellIndexOf(lx, ly)]);
        written++;
      }
    }
  }

  return written;
}
