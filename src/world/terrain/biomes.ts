import { BIOME, BIOME_STRATA, BUILDABLE_BIOMES, TERRAIN, type BiomeId } from './config';

/**
 * Classificazione per colonna. Le uniche due grandezze in ingresso sono altezza
 * e pendenza, e ogni soglia arriva da `TERRAIN`: qui non ci sono costanti.
 */

/**
 * Bioma di una colonna.
 *
 * L'ordine dei test e' la definizione stessa delle fasce: acqua, costa, poi le
 * tre fasce di rilievo dall'alto in basso, infine la pianura come resto. Ogni
 * fascia si prende una colonna o perche' e' abbastanza alta o perche' e'
 * abbastanza ripida, cosi' una parete a mezza quota diventa comunque roccia.
 *
 * @param height altezza intera della colonna, in voxel
 * @param slope dislivello massimo verso i quattro vicini ortogonali
 */
export function classifyBiome(height: number, slope: number): BiomeId {
  if (height < TERRAIN.seaLevel) return BIOME.ocean;
  if (height < TERRAIN.beachMaxHeight) return BIOME.beach;
  if (height >= TERRAIN.rockMinHeight || slope >= TERRAIN.rockMinSlope) return BIOME.rock;
  if (height >= TERRAIN.hillMinHeight || slope >= TERRAIN.hillMinSlope) return BIOME.hill;
  if (height >= TERRAIN.forestMinHeight || slope >= TERRAIN.forestMinSlope) return BIOME.forest;
  return BIOME.plain;
}

/**
 * Edificabilita' di una colonna: bioma ammesso e pendenza sotto soglia.
 *
 * Nessun'altra regola. Il fatto che nessuna colonna edificabile stia sotto il
 * livello del mare non e' un controllo aggiuntivo, e' una conseguenza: i biomi
 * ammessi partono tutti da `beachMaxHeight`, che sta sopra `seaLevel`.
 */
export function isBuildable(biome: number, slope: number): boolean {
  return BUILDABLE_BIOMES[biome] === true && slope < TERRAIN.buildableMaxSlope;
}

/**
 * Indice di palette per una cella della colonna, data la profondita' sotto la
 * superficie (0 = voxel di superficie).
 */
export function paletteForDepth(biome: number, depth: number): number {
  const strata = BIOME_STRATA[biome];
  if (depth === 0) return strata.surface;
  if (depth <= TERRAIN.subsoilDepth) return strata.subsoil;
  return strata.deep;
}
