import { describe, expect, it } from 'vitest';
import { PALETTE_SIZE } from '../../engine/paletteSlots';
import { buildPaddedVolume } from '../../engine/mesher/buildPaddedVolume';
import { MAX_DETAIL_QUADS_PER_CHUNK } from '../../engine/mesher/microGeometry';
import { CHUNK, PADDED_VOL } from '../chunkCoords';
import { BIOME, BIOME_NAMES, BIOME_STRATA, TERRAIN, WATER_IDS } from '../terrain/config';
import { TREE_SHAPES } from '../terrain/flora';
import { STRATA_DEPTH } from '../terrain/biomes';
import { SURFACE_KIND, SURFACE_KIND_NAMES } from '../visualBlock';
import { VoxelWorld } from '../VoxelWorld';
import { TYPOLOGIES } from '../buildings/config';
import { CATALYSTS } from '../../sim/catalysts';
import {
  LANDMARKS,
  contextualFormsOf,
  footprintOf,
  growsFootprint,
  maxStageOf,
  variantsOf,
} from '../landmarks/config';
import { ARCOLOGY_RECIPES, SUNKEN_ARCOLOGY_RECIPES } from '../arcology/config';
import { createScene } from './cityScene';
import {
  CELL_FOOTPRINT,
  CELL_HEIGHT,
  CELL_LEDGE,
  CELL_PARTS,
  cellSolidAt,
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
} from './swatchLayout';
import {
  SWATCH_ARCOLOGIES,
  SWATCH_BUILDINGS,
  SWATCH_BUILDING_LEVEL,
  SWATCH_CATALOG_SUBJECTS,
  SWATCH_ITEM_GAP,
  SWATCH_LANDMARKS,
  SWATCH_LINES,
  SWATCH_LINE_LEVELS,
  SWATCH_LINE_TYPOLOGIES,
  SWATCH_SUBJECTS,
  swatchExtent,
  swatchSubjectAt,
  type SwatchSubject,
} from './swatchCatalog';
import { cellDetail, countDetail } from './swatchProbe';

/** Genera tutto in una volta: il budget serve solo al frame loop. */
function buildSwatch(): VoxelWorld {
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
  while (!scene.step(Number.POSITIVE_INFINITY)) {
    if (++guard > 10_000) throw new Error('generatore che non termina');
  }
  expect(scene.done).toBe(true);
  expect(scene.progress).toBe(1);
  return world;
}

/**
 * Il campionario, costruito una volta sola per file.
 *
 * **Nessuno di questi test lo modifica**: lo leggono e basta, e la scena e'
 * deterministica per costruzione — c'e' un test apposta che lo verifica
 * generandone una seconda a passi. Ricostruirla a ogni `it` voleva dire pagare
 * dieci volte la scena piu' alta del progetto, dove un'arcologia sola porta
 * 735 quote per 48 colonne di lato, per rileggere gli stessi voxel.
 */
let shared: VoxelWorld | null = null;
function generate(): VoxelWorld {
  if (shared === null) shared = buildSwatch();
  return shared;
}

/**
 * Coppie (palette, superficie) dentro un riquadro, **sopra il basamento**.
 *
 * La quota di partenza non e' un dettaglio: il basamento e' continuo sotto tutta
 * la griglia, e contarlo farebbe risultare piena anche la colonna dello slot
 * zero, che deve restare un buco.
 */
function pairsIn(
  world: VoxelWorld,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  zTop = swatchExtent().sizeZ,
): Set<string> {
  const found = new Set<string>();
  for (let z = SWATCH.groundZ; z < zTop; z++) {
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

/**
 * Voxel pieni che cadono **fuori** dall'estensione dichiarata.
 *
 * **Si percorrono i chunk, che sono sparsi, non il riquadro, che e' denso.** La
 * domanda e' la stessa di prima — nessuna scrittura fuori dall'estensione — ma
 * il riquadro dichiarato arriva a 735 quote per via dell'arcologia piu' alta, e
 * interrogarlo cella per cella costava trentotto secondi: da solo piu' di tutto
 * il resto del file, oltre il `testTimeout`. Un chunk interamente dentro
 * l'estensione non si apre nemmeno.
 */
function solidsOutsideExtent(world: VoxelWorld): number {
  const extent = swatchExtent();
  const maxX = extent.minX + extent.sizeX;
  const maxY = extent.minY + extent.sizeY;
  let outside = 0;

  for (const chunk of world.chunks.values()) {
    const ox = chunk.cx * CHUNK;
    const oy = chunk.cy * CHUNK;
    const oz = chunk.cz * CHUNK;
    const contained = ox >= extent.minX && ox + CHUNK <= maxX &&
      oy >= extent.minY && oy + CHUNK <= maxY &&
      oz >= 0 && oz + CHUNK <= extent.sizeZ;
    if (contained) continue;

    for (let i = 0; i < chunk.blocks.length; i++) {
      if (chunk.blocks[i] === 0) continue;
      const x = ox + (i % CHUNK);
      const y = oy + (((i / CHUNK) | 0) % CHUNK);
      const z = oz + ((i / (CHUNK * CHUNK)) | 0);
      if (x < extent.minX || x >= maxX) outside++;
      else if (y < extent.minY || y >= maxY) outside++;
      else if (z < 0 || z >= extent.sizeZ) outside++;
    }
  }

  return outside;
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
    // La colonna si ferma a `CELL_HEIGHT`, che e' l'altezza della sagoma: senza
    // il taglio queste 256 letture salirebbero fino alla quota del soggetto piu'
    // alto del campionario — un'arcologia — per leggere aria. Che sopra la
    // sagoma non ci sia altro non e' un'assunzione: lo verifica «scrive nel
    // mondo esattamente la sagoma che dichiara», qui sotto.
    const cellTop = SWATCH.groundZ + CELL_HEIGHT;
    const missing: string[] = [];
    for (let row = 0; row < SWATCH_ROWS; row++) {
      for (let col = 1; col < SWATCH_COLUMNS; col++) {
        const rect = matrixCellRect(row, col);
        const pairs = pairsIn(world, rect.x0, rect.y0, rect.x1, rect.y1, cellTop);
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

  it('scrive una sagoma simmetrica alla rotazione, non una scatola', () => {
    // **Il vincolo e' la simmetria C4, e la ragione e' la camera.** La sagoma
    // dev'essere la stessa da qualunque lato la si guardi, o a un quarto di giro
    // meta' campionario mostrerebbe gli sbalzi e meta' no. Questa e' la versione
    // forte del vecchio «ogni gradone e' centrato»: quella verificava la
    // centratura di un quadrato, questa l'invarianza della pianta vera — cortili,
    // smussi e pinnacoli compresi.
    for (let level = 0; level < CELL_HEIGHT; level++) {
      for (let ly = 0; ly < CELL_FOOTPRINT; ly++) {
        for (let lx = 0; lx < CELL_FOOTPRINT; lx++) {
          const turned = cellSolidAt(ly, CELL_FOOTPRINT - 1 - lx, level);
          if (cellSolidAt(lx, ly, level) === turned) continue;
          expect({ lx, ly, level, ruotata: turned }).toEqual({ lx, ly, level, ruotata: !turned });
        }
      }
    }

    // Si allarga almeno una volta e si stringe almeno una volta: senza sbalzo non
    // c'e' intradosso, senza arretramento non c'e' sommita' con volume di fianco.
    // Si conta l'area, non il lato: un anello ha il lato del pieno che sostituisce.
    const areas: number[] = [];
    for (let level = 0; level < CELL_HEIGHT; level++) {
      let area = 0;
      for (let ly = 0; ly < CELL_FOOTPRINT; ly++) {
        for (let lx = 0; lx < CELL_FOOTPRINT; lx++) if (cellSolidAt(lx, ly, level)) area++;
      }
      areas.push(area);
    }
    expect(Math.max(...areas)).toBeGreaterThan(areas[0]);
    expect(areas[areas.length - 1]).toBeLessThan(Math.max(...areas));
  });

  it('porta le quattro precondizioni che la microgeometria chiede', () => {
    // **Il punto di questo test e' il perche', non la forma.** Su un prisma
    // isolato con la sommita' piatta quattro famiglie di `microGeometry.ts` non
    // possono scattare affatto, e il campionario mostrerebbe un vocabolario piu'
    // povero di quello vero. Qui si verificano le condizioni una per una sulla
    // sagoma pura: appiattirla tornerebbe a spegnere gli emettitori, e a cadere
    // sarebbe questa riga invece di niente.
    const solid = (lx: number, ly: number, level: number): boolean =>
      lx >= 0 && ly >= 0 && lx < CELL_FOOTPRINT && ly < CELL_FOOTPRINT &&
      level >= 0 && level < CELL_HEIGHT && cellSolidAt(lx, ly, level);

    // Sotto il livello zero c'e' il basamento, che e' pieno: l'aria sotto esiste
    // solo dove un pezzo sporge oltre quello che lo regge.
    const under = (lx: number, ly: number, level: number): boolean =>
      level === 0 ? true : solid(lx, ly, level - 1);

    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    let isolatedTip = false;   // emitFinials
    let soffit = false;        // emitSoffits
    let setbackTop = false;    // emitTerraceBoxes
    let interiorRoof = false;  // emitRoofMasts, emitRoofCrowns, emitPergolas

    const open = (lx: number, ly: number, level: number): boolean =>
      solid(lx, ly, level) && !solid(lx, ly, level + 1);

    for (let level = 0; level < CELL_HEIGHT; level++) {
      for (let ly = 0; ly < CELL_FOOTPRINT; ly++) {
        for (let lx = 0; lx < CELL_FOOTPRINT; lx++) {
          if (!solid(lx, ly, level)) continue;
          const neighbours = sides.map(([dx, dy]) => solid(lx + dx, ly + dy, level));

          if (open(lx, ly, level) && neighbours.every((full) => !full)) isolatedTip = true;
          if (!under(lx, ly, level) && neighbours.some((full) => !full)) soffit = true;
          if (open(lx, ly, level) &&
            sides.some(([dx, dy]) => solid(lx + dx, ly + dy, level + 1))) {
            setbackTop = true;
          }
          if (open(lx, ly, level) &&
            sides.every(([dx, dy]) => open(lx + dx, ly + dy, level))) {
            interiorRoof = true;
          }
        }
      }
    }

    expect({ isolatedTip, soffit, setbackTop, interiorRoof })
      .toEqual({ isolatedTip: true, soffit: true, setbackTop: true, interiorRoof: true });
  });

  it('scrive nel mondo esattamente la sagoma che dichiara', () => {
    const world = generate();
    const rect = matrixCellRect(1, 12);

    for (let level = 0; level < CELL_HEIGHT; level++) {
      for (let ly = 0; ly < CELL_FOOTPRINT; ly++) {
        for (let lx = 0; lx < CELL_FOOTPRINT; lx++) {
          const written = world.getBlock(rect.x0 + lx, rect.y0 + ly, SWATCH.groundZ + level) !== 0;
          if (written === cellSolidAt(lx, ly, level)) continue;
          expect({ lx, ly, level, scritto: written }).toEqual({ lx, ly, level, scritto: !written });
        }
      }
    }

    // E sopra la sagoma non c'e' altro: `CELL_HEIGHT` e' un'altezza dichiarata,
    // non una speranza, e la consuma anche l'inquadratura di `main.ts`.
    for (let ly = 0; ly < CELL_FOOTPRINT; ly++) {
      for (let lx = 0; lx < CELL_FOOTPRINT; lx++) {
        expect(world.getBlock(rect.x0 + lx, rect.y0 + ly, SWATCH.groundZ + CELL_HEIGHT)).toBe(0);
      }
    }
  });

  it('tiene l\'interasse sopra l\'occlusione della fila davanti', () => {
    // In isometrica vera un voxel di quota si proietta in alto esattamente il
    // doppio di un voxel di profondita': la fila davanti ne nasconde percio'
    // `CELL_HEIGHT - cellPitch / 2`. Con interasse pari all'altezza sparirebbe
    // meta' di ogni provino, ed e' il difetto che si vedeva a schermo prima che
    // questo controllo esistesse.
    const hidden = CELL_HEIGHT - SWATCH.cellPitch / 2;

    // Sotto il filo dello sbalzo puo' anche sparire: li' c'e' il podio. Da quel
    // filo in su — mensole, parapetti, fioriere, cortile, pinnacoli — dev'essere
    // tutto visibile senza ruotare la camera.
    expect(hidden).toBeLessThan(CELL_LEDGE);
    expect(SWATCH.cellPitch).toBeGreaterThan(CELL_FOOTPRINT);

    // L'impronta la dichiara il pezzo piu' largo, e nessuno esce dal riquadro:
    // `matrixCellRect` promette quell'ingombro a chi cerca una combinazione.
    for (const part of CELL_PARTS) expect(part.side).toBeLessThanOrEqual(CELL_FOOTPRINT);
  });

  it('accende ogni linguaggio di superficie, e resta sotto il tetto dei quad', () => {
    // **Due misure, non una.** Il pavimento per linguaggio dice che una famiglia
    // di emettitori non si e' spenta in silenzio — e' il difetto che la sagoma
    // vecchia aveva su `emitRoofMasts` e compagni, e che non lasciava traccia da
    // guardare. Il tetto dice che arricchire non ha spinto un chunk oltre
    // `MAX_DETAIL_QUADS_PER_CHUNK`, dove il troncamento fa sparire industrial e
    // civic a meta' chunk.
    //
    // I numeri sono misurati su questa sagoma e tenuti bassi apposta: servono a
    // far cadere un appiattimento, non a inseguire ogni ritocco di un emettitore.
    const floors: Record<string, number> = {
      habitat: 20,
      industrial: 80,
      civic: 80,
      luminous: 80,
      portal: 60,
      roofTech: 40,
    };
    for (const [name, floor] of Object.entries(floors)) {
      const row = SURFACE_KIND_NAMES.indexOf(name);
      expect({ name, prismi: cellDetail(row, 12).prisms >= floor })
        .toEqual({ name, prismi: true });
    }

    // `plain` e `utility` restano a zero, e non e' un difetto: la prima non e' un
    // linguaggio, la seconda e' metallo strutturale la cui forma arriva dalla
    // mesh. `collectSurfaceCells` le salta entrambe prima di qualunque emettitore.
    expect(cellDetail(SURFACE_KIND.plain, 12).prisms).toBe(0);
    expect(cellDetail(SURFACE_KIND.utility, 12).prisms).toBe(0);

    // Il conto vero, chunk per chunk: `buildPaddedVolume` da' lo stesso volume
    // che riceve il mesher, cuciture comprese, quindi le celle a cavallo di un
    // confine contano da entrambi i lati come contano davvero.
    const world = generate();
    const padded = new Uint8Array(PADDED_VOL);
    let peak = 0;
    for (const chunk of world.chunks.values()) {
      padded.fill(0);
      buildPaddedVolume(world, chunk, padded);
      const origin = [chunk.cx * CHUNK, chunk.cy * CHUNK, chunk.cz * CHUNK] as const;
      peak = Math.max(peak, countDetail(padded, origin).quads);
    }
    expect(peak).toBeLessThan(MAX_DETAIL_QUADS_PER_CHUNK);
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
    expect(solidsOutsideExtent(world)).toBe(0);

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

  it('cataloga ogni tipologia una volta sola, derivata dal catalogo', () => {
    // Il conteggio si deriva da `TYPOLOGIES`, non da un letterale: una tipologia
    // nuova compare qui da se', e l'id porta l'id del catalogo quindi un
    // doppione emergerebbe come id ripetuto.
    expect(SWATCH_BUILDINGS.length).toBe(TYPOLOGIES.length);

    const ids = SWATCH_BUILDINGS.map((subject) => subject.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const subject of SWATCH_BUILDINGS) {
      expect(subject.kind).toBe('building');
      expect(subject.stamp.sizeX).toBeGreaterThan(0);
      expect(subject.stamp.sizeZ).toBeGreaterThan(0);
      // Livello, seme e fronte uniformi: e' cio' che li rende confrontabili.
      expect(infoValue(subject, 'Livello')).toBe(String(SWATCH_BUILDING_LEVEL));
      expect(infoValue(subject, 'Seed')).toBe('0');
      expect(infoValue(subject, 'Fronte')).toBe('est');
    }
  });

  it('porta le quattro linee evolutive alle cinque soglie visuali', () => {
    // Quattro ripieghi — uno per uso — e le cinque soglie condivise per
    // ciascuno: e' la galleria che mostra la crescita cambiare il volto di un
    // edificio a parita' di seme e di regola.
    expect(SWATCH_LINES.length).toBe(SWATCH_LINE_TYPOLOGIES.length * SWATCH_LINE_LEVELS.length);

    const ids = SWATCH_LINES.map((subject) => subject.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const typology of SWATCH_LINE_TYPOLOGIES) {
      for (const level of SWATCH_LINE_LEVELS) {
        const subject = SWATCH_LINES.find((entry) => entry.id === `building:line:${typology}:${level}`);
        expect(subject, `${typology}@${level}`).toBeDefined();
        expect(infoValue(subject!, 'Livello')).toBe(String(level));
      }
    }

    // La linea cresce davvero: a parita' di tipologia il soggetto di skyline e'
    // piu' alto di quello base, e non per un seme diverso.
    for (const typology of SWATCH_LINE_TYPOLOGIES) {
      const base = SWATCH_LINES.find((entry) => entry.id === `building:line:${typology}:0`)!;
      const skyline = SWATCH_LINES.find((entry) => entry.id === `building:line:${typology}:${SWATCH_LINE_LEVELS[SWATCH_LINE_LEVELS.length - 1]}`)!;
      expect(skyline.stamp.sizeZ).toBeGreaterThan(base.stamp.sizeZ);
    }
  });

  it('cataloga i landmark per stadio, variante e forma, senza conteggi a mano', () => {
    // Quanti soggetti landmark ci siano lo decide il catalogo: i quattro stadi
    // di crescita, le varianti e le forme contestuali, per ogni ruolo con una
    // ricetta. Nessun numero scritto.
    const expected = CATALYSTS.reduce((total, catalyst) => {
      const recipe = LANDMARKS[catalyst.id];
      if (recipe === undefined) return total;
      return total + maxStageOf(recipe) + 1 + variantsOf(recipe).length + contextualFormsOf(catalyst.id).length;
    }, 0);
    expect(SWATCH_LANDMARKS.length).toBe(expected);

    const ids = SWATCH_LANDMARKS.map((subject) => subject.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const subject of SWATCH_LANDMARKS) {
      expect(subject.kind).toBe('landmark');
      expect(subject.stamp.sizeX).toBeGreaterThan(0);
      expect(subject.stamp.sizeZ).toBeGreaterThan(0);
      expect(infoValue(subject, 'Fronte')).toBe('est');
    }

    // Ogni ruolo mostra i suoi quattro stadi, e lo stadio zero resta il piu'
    // piccolo: la crescita e' quella che la citta' costruisce, non un'esposizione
    // di masse gia' finite.
    for (const catalyst of CATALYSTS) {
      const recipe = LANDMARKS[catalyst.id];
      if (recipe === undefined) continue;
      const stages = SWATCH_LANDMARKS.filter(
        (subject) => subject.id.startsWith(`landmark:${catalyst.id}:stage:`),
      );
      expect(stages.length, catalyst.id).toBe(maxStageOf(recipe) + 1);
      for (let stage = 0; stage < stages.length; stage++) {
        // Una ricetta a sedime fisso tiene la stessa quota a ogni stadio; una
        // che cresce alza il tetto stadio per stadio, e la campionaria lo mostra.
        expect(stages[stage].stamp.sizeZ).toBe(
          growsFootprint(recipe) ? footprintOf(recipe, stage).height : recipe.height,
        );
      }
    }
  });

  it('cataloga le arcologie dallo stesso catalogo delle megastrutture', () => {
    // Le megastrutture vengono da `ARCOLOGY_RECIPES`, senza conteggi a mano:
    // una ricetta nuova comparirebbe qui da sola.
    expect(SWATCH_ARCOLOGIES.length).toBe(ARCOLOGY_RECIPES.length);

    const ids = SWATCH_ARCOLOGIES.map((subject) => subject.id);
    expect(new Set(ids).size).toBe(ids.length);

    const sunken = new Set(SUNKEN_ARCOLOGY_RECIPES.map((recipe) => recipe.kind as string));
    for (const subject of SWATCH_ARCOLOGIES) {
      expect(subject.kind).toBe('arcology');
      expect(subject.stamp.sizeX).toBeGreaterThan(0);
      // **Il tratto che le distingue non e' piu' l'altezza, ed e' il punto
      // dell'earthscraper.** Una megastruttura che sale supera i cento voxel;
      // una che scava ne ha meno di quaranta e la sua scala sta nell'area del
      // vuoto, non nella quota. Chiedere l'altezza a entrambe avrebbe voluto
      // dire scrivere la seconda come la prima.
      const isSunken = sunken.has(subject.id.replace('arcology:', ''));
      expect(subject.stamp.sizeZ, subject.id)
        .toBeGreaterThan(isSunken ? 16 : 100);
      expect(infoValue(subject, 'Seed')).toBe('0');
      expect(infoValue(subject, 'Fronte')).toBe('est');
    }
  });

  it('apre il catalogo con le arcologie, in cima alla sequenza delle gallerie', () => {
    // La megastruttura sta in testa: e' il vertice della gerarchia e compare
    // prima delle linee evolutive, degli edifici e dei landmark.
    const arcologiesMinY = Math.min(...SWATCH_ARCOLOGIES.map((subject) => subject.rect.y0));
    for (const band of [SWATCH_LINES, SWATCH_BUILDINGS, SWATCH_LANDMARKS]) {
      const bandMinY = Math.min(...band.map((subject) => subject.rect.y0));
      expect(arcologiesMinY).toBeLessThan(bandMinY);
    }
  });

  it('tiene il vuoto minimo e nessuna sovrapposizione fra i soggetti del catalogo', () => {
    // A due a due i riquadri non si toccano: su un solo asse devono essere
    // disgiunti, altrimenti la galleria si leggerebbe come una massa unica.
    for (let i = 0; i < SWATCH_CATALOG_SUBJECTS.length; i++) {
      const a = SWATCH_CATALOG_SUBJECTS[i];
      for (let j = i + 1; j < SWATCH_CATALOG_SUBJECTS.length; j++) {
        const b = SWATCH_CATALOG_SUBJECTS[j];
        const overlap = a.rect.x0 < b.rect.x1 && b.rect.x0 < a.rect.x1 &&
          a.rect.y0 < b.rect.y1 && b.rect.y0 < a.rect.y1;
        expect({ overlap, a: a.id, b: b.id }).toEqual({ overlap: false, a: a.id, b: b.id });
      }
    }

    // I primi due edifici stanno in fila: il vuoto fra loro e' esattamente il
    // minimo, e quel vuoto non appartiene a nessuno dei due.
    const first = SWATCH_BUILDINGS[0];
    const second = SWATCH_BUILDINGS[1];
    expect(second.rect.x0).toBe(first.rect.x1 + SWATCH_ITEM_GAP);
    expect(swatchSubjectAt(first.rect.x1, first.rect.y0)).toBeNull();
    expect(swatchSubjectAt(first.rect.x0, first.rect.y0)?.id).toBe(first.id);
  });

  it('l\'estensione dichiarata contiene ogni soggetto, e le gallerie sono scritte', () => {
    const extent = swatchExtent();
    for (const subject of SWATCH_SUBJECTS) {
      expect(subject.rect.x0).toBeGreaterThanOrEqual(extent.minX);
      expect(subject.rect.y0).toBeGreaterThanOrEqual(extent.minY);
      expect(subject.rect.x1).toBeLessThanOrEqual(extent.minX + extent.sizeX);
      expect(subject.rect.y1).toBeLessThanOrEqual(extent.minY + extent.sizeY);
      expect(subject.z1).toBeLessThanOrEqual(extent.sizeZ);
    }

    // La galleria non e' solo dichiarata: ogni soggetto ha almeno un voxel pieno.
    const world = generate();
    for (const subject of SWATCH_CATALOG_SUBJECTS) {
      expect({ id: subject.id, written: hasSolidIn(world, subject) })
        .toEqual({ id: subject.id, written: true });
    }
  });
});

/** Il valore di una riga della scheda, o null se la riga non c'e'. */
function infoValue(subject: SwatchSubject, label: string): string | null {
  return subject.info.find((row) => row.label === label)?.value ?? null;
}

/** true se dentro il riquadro del soggetto c'e' almeno un voxel pieno. */
function hasSolidIn(world: VoxelWorld, subject: SwatchSubject): boolean {
  for (let y = subject.rect.y0; y < subject.rect.y1; y++) {
    for (let x = subject.rect.x0; x < subject.rect.x1; x++) {
      for (let z = SWATCH.groundZ; z < subject.z1; z++) {
        if (world.getBlock(x, y, z) !== 0) return true;
      }
    }
  }
  return false;
}
