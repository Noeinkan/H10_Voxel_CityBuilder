import { describe, expect, it } from 'vitest';
import { testTerrain } from '../../sim/testTerrain';
import { BERTH, landmarkOf } from '../landmarks/config';
import { landmarkMoorings, landmarkOrigin } from '../landmarks/generate';
import { seawardDrift } from './landmarkSiting';
import { FACING, type Facing } from '../streets/streetGrid';
import { BIOME, TERRAIN } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import type { BuildingRecord } from './BuildingRegistry';
import { footprintDepth } from './BuildingRegistry';

/**
 * La banchina va incontro al mare.
 *
 * **Il difetto che questi test bloccano si vedeva solo a schermo, e si vedeva
 * come un'assenza.** Il vincolo di sito ammette il click fino a sei colonne
 * dalla costa; gli ormeggi del porto stanno quattro e cinque colonne oltre il
 * click; e su meta' del fronte costiero di un'isola vera la battigia e' una
 * piattaforma di bassofondo *asciutta* larga dieci colonne e passa. Le tre cose
 * insieme davano un porto perfettamente costruito, con la sua fila di gru, e
 * niente in acqua: la darsena cadeva sulla sabbia, `planTraffic` scartava ogni
 * ormeggio a galla, e nessun test se ne accorgeva perche' la struttura c'era.
 *
 * Il rilievo qui e' scritto a mano e non generato: `heightAt` fa passare la
 * fixture da `classifyBiome`, quindi «bassofondo asciutto» e' bassofondo
 * asciutto davvero e non per dichiarazione, e le colonne si contano invece di
 * dipendere da un seed.
 */

const DRY = TERRAIN.beachMaxHeight + 6;
const DEEP = TERRAIN.seaLevel - 6;

/** Colonna del primo terreno asciutto: e' li' che il giocatore clicca. */
const LAND = 26;
const ROW = 64;

/**
 * Costa con una piattaforma di bassofondo fra la terra e il mare aperto.
 *
 * Le colonne fra `water` e `LAND` stanno a quota **esatta** del pelo del mare:
 * `IslandGenerator` non ci scrive nessun voxel d'acqua, quindi sono asciutte e
 * `classifyBiome` le chiama spiaggia — eppure `seesWater` le vede, ed e' giusto
 * cosi', sono battigia. E' esattamente la fascia su cui il porto si fermava.
 */
function shelfCoast(water: number): TerrainMap {
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: (x) => {
      if (x < water) return DEEP;
      if (x < LAND) return TERRAIN.seaLevel;
      return DRY;
    },
  });
}

function builtPortAt(
  map: TerrainMap,
  x: number,
  y: number,
): { world: VoxelWorld; record: BuildingRecord | null } {
  const world = new VoxelWorld();
  const builder = new Builder(world, map, 4242);
  builder.placeLandmark(x, y, 'port');
  while (builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) builder.step();
  for (const record of builder.registry.all) {
    if (record.landmark === 'port') return { world, record };
  }
  return { world, record: null };
}

function portAt(map: TerrainMap, x: number, y: number): BuildingRecord | null {
  return builtPortAt(map, x, y).record;
}

/** Gli ormeggi che pretendono acqua sotto di se', com'e' scritto in `routes.ts`. */
function afloatBerths(record: BuildingRecord): readonly { x: number; y: number }[] {
  return landmarkMoorings('port', (record.facing ?? FACING.east) as Facing, record.x, record.y)
    .filter((mooring) => mooring.berth === BERTH.cargo || mooring.berth === BERTH.vessel);
}

describe('lo scorrimento verso il mare', () => {
  const port = landmarkOf('port')!;
  const drift = (distance: number): number =>
    seawardDrift(port, { facing: FACING.west, distance });

  it('porta la linea d acqua della ricetta sulla colonna bagnata', () => {
    // Il porto se l'aspetta due colonne oltre l'ancora: a due non si muove, e da
    // li' in avanti scorre esattamente di quanto il mare e' piu' lontano.
    expect(drift(2)).toBe(0);
    expect(drift(5)).toBe(3);
    expect(drift(9)).toBe(7);
  });

  it('non arretra dove il mare comincia prima del previsto', () => {
    // Arretrare sembrava simmetrico e non lo era: tirava indietro anche gli
    // ormeggi, e su una costa in diagonale bastava a lasciarne uno all'asciutto.
    expect(drift(1)).toBe(0);
  });

  it('non spinge la colonna cliccata fuori dal proprio ingombro', () => {
    // Oltre l'ancora il click uscirebbe dall'ingombro dalla parte di terra, e
    // `catalystIn` non ritroverebbe piu' il catalizzatore: monumento fermo allo
    // stadio zero per sempre, senza che niente lo dica.
    expect(drift(40)).toBe(port.anchor[0]);
  });

  it('non muove una ricetta che l acqua non la guarda', () => {
    // Sette ruoli su nove non dichiarano una linea d'acqua, e per loro questa
    // domanda non si pone nemmeno quando il mare c'e'.
    expect(seawardDrift(landmarkOf('market')!, { facing: FACING.west, distance: 5 })).toBe(0);
    expect(seawardDrift(port, null)).toBe(0);
  });
});

describe('un porto costiero', () => {
  it('resta sul piano di banchina invece di affondare fino al fondale', () => {
    const map = shelfCoast(LAND - 6);
    const { world, record } = builtPortAt(map, LAND, ROW);
    expect(record).not.toBeNull();

    // Il minimo dell'impronta e' il fondale a `DEEP`: usarlo come base lascia
    // fuori dall'acqua soltanto la cima della capitaneria. La banchina segue il
    // piano finito, che su questa costa incontra il terreno asciutto a `DRY`.
    expect(record!.baseZ).toBe(DRY);
    expect(record!.baseZ).toBeGreaterThan(DEEP);

    // Non e' una soletta sospesa: dove la ricetta poggia sull'oceano, l'opera
    // scende dal piano fino al fondale. Basta una colonna per bloccare sia il
    // ritorno all'affondamento sia un ripiego che alzasse la forma senza muro.
    let supported = 0;
    const depth = footprintDepth(record!);
    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < record!.footprint; dx++) {
        const x = record!.x + dx;
        const y = record!.y + dy;
        if (map.biomeAt(x, y) !== BIOME.ocean) continue;
        if (world.getBlock(x, y, record!.baseZ - 1) !== 0) supported++;
      }
    }
    expect(supported).toBeGreaterThan(0);
  });

  it('scorre fin sopra l acqua vera invece di fermarsi sul bassofondo', () => {
    // Sei colonne di bassofondo: il vincolo di sito dice di si' al primo terreno
    // asciutto, e senza lo scorrimento la darsena resterebbe tutta di qua.
    const map = shelfCoast(LAND - 6);
    const record = portAt(map, LAND, ROW);
    expect(record).not.toBeNull();

    const berths = afloatBerths(record!);
    expect(berths).toHaveLength(2);
    for (const berth of berths) {
      expect(map.biomeAt(Math.floor(berth.x), Math.floor(berth.y))).toBe(BIOME.ocean);
    }
  });

  it('guarda il mare aperto, non l orlo bagnato che ha davanti', () => {
    const map = shelfCoast(LAND - 6);
    const record = portAt(map, LAND, ROW);
    // Il mare sta a ovest, e il fronte della ricetta deve guardare li': un molo
    // che esce dalla parte sbagliata e' un molo dentro la collina.
    expect(record!.facing).toBe(FACING.west);
  });

  it('non si sposta di una colonna dove il mare comincia subito', () => {
    // Nessun bassofondo: la ricetta trova l'acqua dove se l'aspettava, e
    // arretrare porterebbe indietro anche gli ormeggi senza guadagnarci niente.
    const map = shelfCoast(LAND);
    const record = portAt(map, LAND, ROW);
    const still = landmarkOrigin('port', FACING.west, LAND, ROW)!;

    expect({ x: record!.x, y: record!.y }).toEqual(still);
    for (const berth of afloatBerths(record!)) {
      expect(map.biomeAt(Math.floor(berth.x), Math.floor(berth.y))).toBe(BIOME.ocean);
    }
  });

  it('tiene comunque la colonna cliccata dentro il proprio ingombro', () => {
    // E' l'invariante su cui `catalystIn` ritrova il catalizzatore a ogni
    // avanzamento: perderla vorrebbe dire un monumento fermo allo stadio zero
    // per sempre, senza che niente lo dica. Lo scorrimento e' percio' limitato
    // dall'ancora della ricetta, e qui si verifica al bassofondo piu' largo.
    for (const shelf of [0, 3, 6, 10, 14]) {
      const map = shelfCoast(LAND - shelf);
      const record = portAt(map, LAND, ROW);
      expect(record).not.toBeNull();

      const depth = footprintDepth(record!);
      expect(LAND).toBeGreaterThanOrEqual(record!.x);
      expect(LAND).toBeLessThan(record!.x + record!.footprint);
      expect(ROW).toBeGreaterThanOrEqual(record!.y);
      expect(ROW).toBeLessThan(record!.y + depth);
    }
  });
});
