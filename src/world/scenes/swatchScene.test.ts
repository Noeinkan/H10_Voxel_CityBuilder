import { describe, expect, it } from 'vitest';
import { PALETTE_SIZE } from '../../engine/paletteSlots';
import { BIOME, BIOME_NAMES, BIOME_STRATA, TERRAIN, WATER_IDS } from '../terrain/config';
import { TREE_SHAPES } from '../terrain/flora';
import { STRATA_DEPTH } from '../terrain/biomes';
import { SURFACE_KIND_NAMES } from '../visualBlock';
import { VoxelWorld } from '../VoxelWorld';
import { createScene } from './cityScene';
import {
  CELL_FOOTPRINT,
  CELL_HEIGHT,
  CELL_TIERS,
  matrixCellRect,
  SCALE_ITEMS,
  SCALE_ORIGIN_Y,
  strataPillarRect,
  SWATCH,
  SWATCH_COLUMNS,
  SWATCH_PILLARS,
  SWATCH_ROWS,
  SWATCH_WATERS,
  swatchCellAt,
  swatchExtent,
} from './swatchLayout';

/** Genera tutto in una volta: il budget serve solo al frame loop. */
function generate(budgetMs = Number.POSITIVE_INFINITY): VoxelWorld {
  const world = new VoxelWorld();
  const scene = createScene(world, {
    kind: 'swatch',
    seed: 1337,
    originX: 0,
    originY: 0,
    sizeX: 64,
    sizeY: 64,
    sizeZ: 64,
  });
  let guard = 0;
  while (!scene.step(budgetMs)) {
    if (++guard > 10_000) throw new Error('generatore che non termina');
  }
  expect(scene.done).toBe(true);
  expect(scene.progress).toBe(1);
  return world;
}

/**
 * Coppie (palette, superficie) dentro un riquadro, **sopra il basamento**.
 *
 * La quota di partenza non e' un dettaglio: il basamento e' continuo sotto tutta
 * la griglia, e contarlo farebbe risultare piena anche la colonna dello slot
 * zero, che deve restare un buco.
 */
function pairsIn(world: VoxelWorld, x0: number, y0: number, x1: number, y1: number): Set<string> {
  const found = new Set<string>();
  const extent = swatchExtent();
  for (let z = SWATCH.groundZ; z < extent.sizeZ; z++) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const id = world.getBlock(x, y, z);
        if (id === 0) continue;
        found.add(`${id}/${world.getSurfaceKind(x, y, z)}`);
      }
    }
  }
  return found;
}

/** Voxel pieni che cadono dentro l'estensione dichiarata. */
function solidsInExtent(world: VoxelWorld): number {
  const extent = swatchExtent();
  let count = 0;
  for (let z = 0; z < extent.sizeZ; z++) {
    for (let y = extent.minY; y < extent.minY + extent.sizeY; y++) {
      for (let x = extent.minX; x < extent.minX + extent.sizeX; x++) {
        if (world.getBlock(x, y, z) !== 0) count++;
      }
    }
  }
  return count;
}

/**
 * Byte di rendering diversi fra due mondi.
 *
 * Il confronto sta in un ciclo e non in un `expect` per cella: mezzo milione di
 * asserzioni costano secondi, e a fallire sarebbe comunque una sola.
 */
function blockMismatches(a: VoxelWorld, b: VoxelWorld): number {
  let diff = 0;
  for (const [key, chunk] of a.chunks) {
    const other = b.chunks.get(key);
    if (other === undefined) {
      diff += chunk.solidCount;
      continue;
    }
    for (let i = 0; i < chunk.blocks.length; i++) {
      if (chunk.blocks[i] !== other.blocks[i]) diff++;
    }
  }
  return diff;
}

describe('swatchScene', () => {
  it('mostra ogni combinazione di slot e linguaggio di superficie', () => {
    const world = generate();

    // E' il test che la 4.10 chiede per nome: il modo per accorgersi che uno
    // slot nuovo non e' mai stato aggiunto al campionario. Percorre le tabelle e
    // non dei letterali, quindi un trentatreesimo slot o un nono linguaggio
    // farebbero cadere questo controllo prima di arrivare a schermo.
    const missing: string[] = [];
    for (let row = 0; row < SWATCH_ROWS; row++) {
      for (let col = 1; col < SWATCH_COLUMNS; col++) {
        const rect = matrixCellRect(row, col);
        const pairs = pairsIn(world, rect.x0, rect.y0, rect.x1, rect.y1);
        if (!pairs.has(`${col}/${row}`)) missing.push(`${col}/${row}`);
      }
    }

    expect(missing).toEqual([]);
    expect((SWATCH_COLUMNS - 1) * SWATCH_ROWS).toBe((PALETTE_SIZE - 1) * SURFACE_KIND_NAMES.length);
  });

  it('lascia vuota la colonna dello slot zero, perche\' zero e\' il vuoto', () => {
    const world = generate();

    // Non un voxel nero: **nessun** voxel. `packVisualBlock` restituisce zero per
    // palette zero, e la colonna mancante e' l'unico modo onesto di mostrarlo.
    for (let row = 0; row < SWATCH_ROWS; row++) {
      const rect = matrixCellRect(row, 0);
      expect(pairsIn(world, rect.x0, rect.y0, rect.x1, rect.y1).size).toBe(0);
    }
  });

  it('taglia ogni bioma nei suoi tre strati, ciascuno alto un numero intero di celle', () => {
    const world = generate();

    for (let biome = 0; biome < BIOME_NAMES.length; biome++) {
      const rect = strataPillarRect(biome);
      const strata = BIOME_STRATA[biome];
      const top = SWATCH.groundZ + SWATCH.pillarHeight;

      // La colonna si legge dall'alto, com'e' scritta: superficie spessa una
      // cella, poi il sottosuolo, poi il fondo.
      const column: number[] = [];
      for (let z = SWATCH.groundZ; z < top; z++) column.push(world.getBlock(rect.x0, rect.y0, z));

      expect(column[column.length - 1]).toBe(strata.surface);
      expect(column[column.length - 1 - STRATA_DEPTH.surface]).toBe(strata.subsoil);
      expect(column[0]).toBe(strata.deep);

      // L'invariante che il pilastro esiste per rendere visibile: i due confini
      // cadono su un multiplo della cella di terreno, non a meta' di un cubo.
      expect(STRATA_DEPTH.surface % TERRAIN.cellSize).toBe(0);
      expect(STRATA_DEPTH.subsoil % TERRAIN.cellSize).toBe(0);
      expect(SWATCH.pillarHeight % TERRAIN.cellSize).toBe(0);
    }
  });

  it('porta i tre specchi d\'acqua, che nella matrice non potrebbero comparire', () => {
    const world = generate();

    // Sugli slot d'acqua il fragment cortocircuita lo switch delle facciate:
    // questi tre pilastri sono l'unico posto del campionario in cui `WATER_CLASS`
    // si vede. Un tema con uno specchio morto si riconosce solo qui.
    for (let index = BIOME_NAMES.length; index < SWATCH_PILLARS; index++) {
      const rect = strataPillarRect(index);
      const water = SWATCH_WATERS[index - BIOME_NAMES.length];
      const top = SWATCH.groundZ + SWATCH.pillarHeight - 1;

      expect(world.getBlock(rect.x0, rect.y0, top)).toBe(WATER_IDS.surface);
      expect(world.getSurfaceKind(rect.x0, rect.y0, top)).toBe(water.kind);

      // Sotto la superficie c'e' l'acqua profonda, e sotto ancora il fondale
      // dell'oceano: e' la stessa colonna che il terreno scrive davvero.
      const deep = SWATCH.groundZ + SWATCH.waterFloor;
      expect(world.getBlock(rect.x0, rect.y0, deep)).toBe(WATER_IDS.deep);
      expect(world.getBlock(rect.x0, rect.y0, deep - 1)).toBe(BIOME_STRATA[BIOME.ocean].surface);
    }
  });

  it('affianca cella di terreno, alberi ed edificio nella stessa fascia', () => {
    const world = generate();
    const extent = swatchExtent();

    // Il catalogo delle specie si percorre per intero: una specie aggiunta a
    // `TREE_SHAPES` deve comparire senza che nessuno se ne ricordi.
    const trees = SCALE_ITEMS.filter((item) => item.kind === 'tree');
    expect(trees).toHaveLength(TREE_SHAPES.length);

    const heightAt = (x0: number, width: number, depth: number): number => {
      let top = 0;
      for (let z = 0; z < extent.sizeZ; z++) {
        for (let y = SCALE_ORIGIN_Y; y < SCALE_ORIGIN_Y + depth; y++) {
          for (let x = x0; x < x0 + width; x++) {
            if (world.getBlock(x, y, z) !== 0) top = Math.max(top, z + 1);
          }
        }
      }
      return top - SWATCH.groundZ;
    };

    const cells = SCALE_ITEMS[0];
    const building = SCALE_ITEMS[SCALE_ITEMS.length - 1];
    expect(cells.kind).toBe('cells');
    expect(building.kind).toBe('building');

    // La scala e' il punto della fascia: il cubo di terreno e' la cella, l'albero
    // la supera di molto, l'edificio supera l'albero.
    const cubeTop = heightAt(cells.x0, TERRAIN.cellSize, TERRAIN.cellSize);
    const treeTopZ = heightAt(trees[0].x0, trees[0].width, trees[0].depth);
    const buildingTop = heightAt(building.x0, building.width, building.depth);

    expect(cubeTop).toBe(TERRAIN.cellSize);
    expect(treeTopZ).toBeGreaterThan(cubeTop);
    expect(buildingTop).toBeGreaterThan(treeTopZ);

    // L'ingombro dichiarato in `SWATCH` non e' una speranza: se lo stamp di
    // riferimento crescesse oltre la riserva, uscirebbe dall'estensione e
    // l'inquadratura lo taglierebbe senza dirlo.
    expect(buildingTop).toBeLessThanOrEqual(SWATCH.referenceHeight);
  });

  it('scrive un provino a gradoni, non una scatola', () => {
    const world = generate();

    // **Il punto di questo test e' il perche', non la forma.** Su un prisma
    // isolato con la sommita' piatta tre famiglie di `microGeometry.ts` non
    // possono scattare affatto — `emitSoffits` vuole un intradosso con aria
    // sotto, `emitTerraceBoxes` una sommita' scoperta con volume di fianco,
    // `emitFinials` una cella senza vicini in piano — e il campionario
    // mostrerebbe un vocabolario piu' povero di quello vero. I tre gradoni sono
    // le tre condizioni; appiattirli tornerebbe a nascondere gli emettitori
    // senza che niente segnali il perche'.
    const widths = CELL_TIERS.map((tier) => tier.side);
    expect(Math.max(...widths.slice(1))).toBeGreaterThan(widths[0]);
    expect(widths[widths.length - 1]).toBe(1);
    let overhangs = false;
    let setbacks = false;
    for (let i = 1; i < CELL_TIERS.length; i++) {
      if (CELL_TIERS[i].side > CELL_TIERS[i - 1].side) overhangs = true;
      if (CELL_TIERS[i].side < CELL_TIERS[i - 1].side) setbacks = true;
    }
    expect(overhangs).toBe(true);
    expect(setbacks).toBe(true);

    // Ogni gradone e' centrato nel proprio ingombro: la sagoma dev'essere la
    // stessa da qualunque lato la guardi la camera, o meta' campionario
    // mostrerebbe gli sbalzi e meta' no a seconda dell'azimut.
    for (const tier of CELL_TIERS) {
      expect(tier.inset * 2 + tier.side).toBe(CELL_FOOTPRINT);
    }

    // E quel che sta scritto nel mondo e' davvero questo profilo, letto per
    // livello su una cella qualunque.
    const rect = matrixCellRect(1, 12);
    let z = SWATCH.groundZ;
    for (const tier of CELL_TIERS) {
      for (let level = 0; level < tier.levels; level++) {
        let solid = 0;
        for (let x = rect.x0; x < rect.x1; x++) {
          if (world.getBlock(x, rect.y0 + Math.floor(CELL_FOOTPRINT / 2), z) !== 0) solid++;
        }
        expect(solid).toBe(tier.side);
        z++;
      }
    }
    expect(z - SWATCH.groundZ).toBe(CELL_HEIGHT);
  });

  it('tiene l\'interasse sopra l\'occlusione della fila davanti', () => {
    // In isometrica vera un voxel di quota si proietta in alto esattamente il
    // doppio di un voxel di profondita': la fila davanti ne nasconde percio'
    // `CELL_HEIGHT - cellPitch / 2`. Con interasse pari all'altezza sparirebbe
    // meta' di ogni provino, ed e' il difetto che si vedeva a schermo prima che
    // questo controllo esistesse.
    const hidden = CELL_HEIGHT - SWATCH.cellPitch / 2;
    const ledge = CELL_TIERS[0].levels + CELL_TIERS[1].levels;

    // Sotto il filo dell'arretramento puo' anche sparire: li' c'e' il podio. Da
    // quel filo in su — mensole, parapetti, fioriere, guglia — dev'essere tutto
    // visibile senza ruotare la camera.
    expect(hidden).toBeLessThan(ledge);
    expect(SWATCH.cellPitch).toBeGreaterThan(CELL_FOOTPRINT);
  });

  it('e\' deterministica e non cambia se la si genera a passi', () => {
    const whole = generate();

    // Budget zero: un'unita' di lavoro per passo, che e' il caso peggiore del
    // frame loop.
    const world = new VoxelWorld();
    const scene = createScene(world, {
      kind: 'swatch', seed: 1337, originX: 0, originY: 0, sizeX: 64, sizeY: 64, sizeZ: 64,
    });
    let steps = 0;
    while (!scene.step(0)) {
      if (++steps > 10_000) throw new Error('generatore che non termina');
    }

    expect(steps).toBeGreaterThan(1);
    expect(world.chunkCount).toBe(whole.chunkCount);
    expect(world.solidVoxelCount).toBe(whole.solidVoxelCount);
    expect(blockMismatches(world, whole)).toBe(0);
  });

  it('non scrive fuori dall\'estensione che dichiara, ne\' nel layer data', () => {
    const world = generate();

    // Conteggio esatto invece di un confronto sull'AABB: `world.bounds` e'
    // granulare al chunk, quindi direbbe di si' anche a una scrittura sfuggita
    // trenta colonne oltre l'estensione. L'inquadratura di `main.ts` si fida di
    // `swatchExtent()`, e quel che ne esce fuori non lo vedrebbe nessuno.
    expect(solidsInExtent(world)).toBe(world.solidVoxelCount);

    for (const chunk of world.chunks.values()) {
      expect(chunk.data.some((value) => value !== 0)).toBe(false);
    }
  });

  it('sa dire cosa si sta guardando, cella per cella', () => {
    // E' l'inverso di `matrixCellRect`, ed e' la sola etichetta che il
    // campionario abbia: in-world non ce ne sono.
    for (let row = 0; row < SWATCH_ROWS; row++) {
      for (let col = 0; col < SWATCH_COLUMNS; col++) {
        const rect = matrixCellRect(row, col);
        const cell = swatchCellAt(rect.x0, rect.y0);
        expect(cell?.band).toBe('matrix');
        expect(cell?.row).toBe(row);
        expect(cell?.col).toBe(col);
      }
    }

    // Il vuoto fra due celle appartiene a quella che lo precede: senza, il
    // referto sfarfallerebbe mentre il cursore attraversa la griglia.
    const gap = matrixCellRect(0, 0);
    expect(swatchCellAt(gap.x1, gap.y0)?.col).toBe(0);

    const extent = swatchExtent();
    expect(swatchCellAt(-1, 0)).toBeNull();
    expect(swatchCellAt(0, extent.minY + extent.sizeY)).toBeNull();

    // Le due colonne d'acqua devono dirlo: li' i tre bit non sono una facciata.
    expect(swatchCellAt(matrixCellRect(0, 24).x0, matrixCellRect(0, 24).y0)?.note).toContain('acqua');
  });
});
