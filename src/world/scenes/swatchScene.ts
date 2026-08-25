import { typologyById, type TypologyDefinition } from '../buildings/config';
import { generateBuilding } from '../buildings/generate';
import { anchoredVoxel, stampSurface, STAMP_EMPTY, type VoxelStamp } from '../buildings/stamp';
import { typologyProfile } from '../buildings/typology';
import { FACING } from '../streets/streetGrid';
import { BIOME, BIOME_STRATA, BIOME_NAMES, TERRAIN, WATER_IDS } from '../terrain/config';
import { TREE_SHAPES } from '../terrain/flora';
import { STRATA_DEPTH } from '../terrain/biomes';
import { treeSpec, writeTree } from '../terrain/decor';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';
import type { VoxelWorld } from '../VoxelWorld';
import type { SceneGenerator } from './cityScene';
import {
  CELL_FOOTPRINT,
  CELL_HEIGHT,
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
} from './swatchLayout';
import {
  SWATCH_CATALOG_SUBJECTS,
  swatchExtent,
  swatchPlinthSpanAt,
  type SwatchCatalogSubject,
} from './swatchCatalog';

/**
 * Il campionario dei voxel: tutto il vocabolario visuale in una inquadratura.
 *
 * **E' una scena come le altre, non un percorso di rendering.** Nessuna
 * geometria speciale, nessun materiale, nessuno slot di palette e nessun tipo di
 * superficie in piu' (invarianti 4 e 5): il campionario mostra quello che
 * esiste, e se una combinazione si vede male il difetto sta altrove. Passare da
 * un tema all'altro lo rilegge senza rigenerarlo, perche' un tema riscrive solo
 * uniform.
 *
 * **Non ridisegna niente**, per la stessa ragione del diorama: la stratigrafia
 * esce dagli stessi tre tagli di `writeBlockColumns`, gli alberi da `writeTree`
 * e l'edificio da `generateBuilding`. Se campionario e citta' mostrassero due
 * vocabolari diversi, il campionario non servirebbe a giudicare la citta'.
 *
 * Tre fasce lungo +y, su un basamento continuo: la matrice palette x superficie,
 * la stratigrafia di ogni bioma piu' i tre specchi d'acqua, e la fascia di scala
 * fra cella di terreno, albero ed edificio. Piu' in la' lungo +y seguono le due
 * gallerie del catalogo — tutte le tipologie edilizie e tutti i landmark — che
 * `swatchCatalog.ts` deriva dagli stamp reali. Dove stanno le prime tre lo dice
 * `swatchLayout.ts`, dove stanno le gallerie `swatchCatalog.ts`; qui si scrive
 * soltanto.
 */

/** Righe di basamento scritte per passo: e' l'unita' di lavoro piu' grossa. */
const PLINTH_STRIP = 10;

/**
 * Un'unita' di lavoro. Nessuna supera qualche migliaio di celle, che e' cio' che
 * tiene la generazione dentro `GENERATION_BUDGET_MS` senza spezzare a meta' un
 * soggetto — una riga della matrice comparsa a meta' si vedrebbe.
 */
type SwatchTask =
  | { readonly kind: 'plinth'; readonly index: number }
  | { readonly kind: 'row'; readonly index: number }
  | { readonly kind: 'pillar'; readonly index: number }
  | { readonly kind: 'scale'; readonly index: number }
  | { readonly kind: 'subject'; readonly index: number };

export function createSwatchScene(world: VoxelWorld): SceneGenerator {
  return new SwatchGenerator(world);
}

class SwatchGenerator implements SceneGenerator {
  private readonly world: VoxelWorld;
  private readonly tasks: readonly SwatchTask[];
  private readonly reference: VoxelStamp;

  private task = 0;
  private written = 0;
  private finished = false;

  constructor(world: VoxelWorld) {
    this.world = world;
    this.reference = composeReference();

    const extent = swatchExtent();
    const tasks: SwatchTask[] = [];
    for (let index = 0; index * PLINTH_STRIP < extent.sizeY; index++) {
      tasks.push({ kind: 'plinth', index });
    }
    for (let index = 0; index < SWATCH_ROWS; index++) tasks.push({ kind: 'row', index });
    for (let index = 0; index < SWATCH_PILLARS; index++) tasks.push({ kind: 'pillar', index });
    for (let index = 0; index < SCALE_ITEMS.length; index++) tasks.push({ kind: 'scale', index });
    for (let index = 0; index < SWATCH_CATALOG_SUBJECTS.length; index++) {
      tasks.push({ kind: 'subject', index });
    }
    this.tasks = tasks;
  }

  get done(): boolean {
    return this.finished;
  }

  get voxelsWritten(): number {
    return this.written;
  }

  get progress(): number {
    return this.finished ? 1 : this.task / this.tasks.length;
  }

  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const start = performance.now();

    while (this.task < this.tasks.length) {
      this.run(this.tasks[this.task]);
      this.task++;
      if (performance.now() - start >= budgetMs) break;
    }

    this.finished = this.task >= this.tasks.length;
    return this.finished;
  }

  private run(task: SwatchTask): void {
    switch (task.kind) {
      case 'plinth':
        this.writePlinth(task.index);
        return;
      case 'row':
        this.writeMatrixRow(task.index);
        return;
      case 'pillar':
        this.writePillar(task.index);
        return;
      case 'scale':
        this.writeScaleItem(task.index);
        return;
      case 'subject':
        this.writeSubject(SWATCH_CATALOG_SUBJECTS[task.index]);
        return;
    }
  }

  /**
   * Il piano di lettura, continuo sotto le fasce e sotto le due gallerie.
   *
   * E' `plain` e in uno slot neutro: qualunque linguaggio di superficie qui
   * aggiungerebbe dettaglio a un fondo che serve a non averne, e i prismi del
   * basamento si sommerebbero a quelli delle celle nello stesso chunk.
   */
  private writePlinth(strip: number): void {
    const extent = swatchExtent();
    const y0 = extent.minY + strip * PLINTH_STRIP;
    const y1 = Math.min(extent.minY + extent.sizeY, y0 + PLINTH_STRIP);

    for (let y = y0; y < y1; y++) {
      // La riga e' larga quanto la fascia che regge, non quanto l'estensione:
      // e' il profilo a gradini che dichiara le fasce senza etichette.
      const span = swatchPlinthSpanAt(y);
      for (let x = span.x0; x < span.x1; x++) {
        this.written += this.world.fillColumn(x, y, 0, SWATCH.groundZ, SWATCH.plinthSlot);
      }
    }
  }

  /**
   * Una riga della matrice: un linguaggio di superficie su tutti gli slot.
   *
   * La colonna zero **resta un buco**, e non e' una dimenticanza:
   * `packVisualBlock` restituisce zero per palette zero, quindi non c'e' niente
   * da scrivere — ed e' esattamente cio' che l'indice zero significa. Le
   * combinazioni vere sono percio' `PALETTE_SIZE - 1` per riga.
   *
   * Il provino e' la sagoma di `CELL_PARTS`, uguale in ogni cella: podio
   * smussato, sbalzo a filo, quattro lame di corona attorno a un cortile,
   * quattro pinnacoli isolati. La forma sta li' e non qui perche' la legge anche
   * chi inquadra, chi ne conta i prismi e chi nomina la cella sotto il cursore.
   *
   * Si scrive per **corsa verticale** e non per pezzo: i pezzi si sovrappongono
   * in quota — la corona e i pinnacoli sono lo stesso piano — e ripassarci sopra
   * scriverebbe due volte le stesse colonne. `cellSolidAt` risponde una volta
   * per cella, e `fillColumn` prende il tratto intero.
   */
  private writeMatrixRow(row: number): void {
    const surface = row as SurfaceKind;

    for (let col = 1; col < SWATCH_COLUMNS; col++) {
      const rect = matrixCellRect(row, col);
      for (let ly = 0; ly < CELL_FOOTPRINT; ly++) {
        for (let lx = 0; lx < CELL_FOOTPRINT; lx++) {
          let level = 0;
          while (level < CELL_HEIGHT) {
            if (!cellSolidAt(lx, ly, level)) {
              level++;
              continue;
            }
            let end = level + 1;
            while (end < CELL_HEIGHT && cellSolidAt(lx, ly, end)) end++;
            this.written += this.world.fillColumn(
              rect.x0 + lx,
              rect.y0 + ly,
              SWATCH.groundZ + level,
              SWATCH.groundZ + end,
              col,
              surface,
            );
            level = end;
          }
        }
      }
    }
  }

  /**
   * Un pilastro tagliato: prima i sei biomi, poi i tre specchi d'acqua.
   *
   * I tagli sono quelli di `writeBlockColumns`, letti da `STRATA_DEPTH`: e' cio'
   * che impedisce al campionario di raccontare una stratigrafia che l'isola non
   * ha. Dal fianco si vede quel che dall'alto non si vedrebbe mai, cioe' che
   * ogni strato e' alto un numero intero di celle.
   */
  private writePillar(index: number): void {
    const rect = strataPillarRect(index);
    const isWater = index >= BIOME_NAMES.length;
    const top = SWATCH.groundZ + SWATCH.pillarHeight;
    const groundTop = isWater ? SWATCH.groundZ + SWATCH.waterFloor : top;
    const strata = BIOME_STRATA[isWater ? BIOME.ocean : index];

    // `Math.max` con il piede del pilastro, come nel terreno: su un fondale
    // basso il tratto profondo e' vuoto invece di scendere sotto il basamento.
    const surfaceZ = Math.max(SWATCH.groundZ, groundTop - STRATA_DEPTH.surface);
    const subsoilZ = Math.max(SWATCH.groundZ, groundTop - STRATA_DEPTH.subsoil);
    const deepTop = Math.max(groundTop, top - TERRAIN.waterSurfaceDepth);
    const waterClass = isWater
      ? (SWATCH_WATERS[index - BIOME_NAMES.length].kind as SurfaceKind)
      : SURFACE_KIND.plain;

    for (let y = rect.y0; y < rect.y1; y++) {
      for (let x = rect.x0; x < rect.x1; x++) {
        this.written += this.world.fillColumn(x, y, SWATCH.groundZ, subsoilZ, strata.deep);
        this.written += this.world.fillColumn(x, y, subsoilZ, surfaceZ, strata.subsoil);
        this.written += this.world.fillColumn(x, y, surfaceZ, groundTop, strata.surface);
        if (!isWater) continue;
        this.written += this.world.fillColumn(x, y, groundTop, deepTop, WATER_IDS.deep);
        this.written += this.world.fillColumn(x, y, deepTop, top, WATER_IDS.surface, waterClass);
      }
    }
  }

  /** Cella di terreno, alberi ed edificio: il rapporto di scala fra i tre. */
  private writeScaleItem(index: number): void {
    const item = SCALE_ITEMS[index];
    switch (item.kind) {
      case 'cells':
        this.writeTerrainCells(item.x0);
        return;
      case 'tree':
        this.writeTree(item.x0, item.species);
        return;
      case 'building':
        this.writeReference(item.x0);
        return;
    }
  }

  /**
   * Il cubo di terreno e la scaletta che lo ripete.
   *
   * Il cubo solo dice quanto e' grosso il cubo; la scaletta dice che le quote si
   * muovono di quello e non di un voxel — e' la meta' dell'invariante che dal
   * pilastro non si legge, perche' li' gli strati sono contigui.
   */
  private writeTerrainCells(x0: number): void {
    const cell = TERRAIN.cellSize;
    this.writeBox(x0, SCALE_ORIGIN_Y, SWATCH.groundZ, cell, cell, cell, PALETTE_SLOTS.grass);

    const stairX = x0 + cell + SWATCH.scaleGap;
    for (let step = 0; step < SWATCH.stairSteps; step++) {
      this.writeBox(
        stairX + step * cell,
        SCALE_ORIGIN_Y,
        SWATCH.groundZ,
        cell,
        cell,
        (step + 1) * cell,
        PALETTE_SLOTS.grass,
      );
    }
  }

  /**
   * Un esemplare per specie, con il tronco al minimo del profilo.
   *
   * Il minimo e non un tiro: `treeAt` estrae dal PRNG, e qui non c'e' un seed da
   * cui estrarre senza inventarne uno. La chioma resta quella vera, perche' la
   * varieta' di `writeTree` esce dalla posizione dell'albero.
   */
  private writeTree(x0: number, species: number): void {
    const shape = TREE_SHAPES[species];
    const centreX = x0 + Math.floor(SWATCH.treePitch / 2);
    const centreY = SCALE_ORIGIN_Y + Math.floor(SWATCH.treePitch / 2);
    const tree = treeSpec(centreX, centreY, species, shape.trunk[0]);

    this.written += writeTree(
      this.world,
      tree,
      SWATCH.groundZ,
      x0,
      SCALE_ORIGIN_Y,
      x0 + SWATCH.treePitch,
      SCALE_ORIGIN_Y + SWATCH.treePitch,
    );
  }

  /** Lo stesso stamp che il Builder metterebbe in citta', su un fronte a est. */
  private writeReference(x0: number): void {
    this.writeStamp(this.reference, x0, SCALE_ORIGIN_Y, SWATCH.groundZ);
  }

  /** Un modello del catalogo, nello stesso posto del suo riquadro dichiarato. */
  private writeSubject(subject: SwatchCatalogSubject): void {
    this.writeStamp(subject.stamp, subject.rect.x0, subject.rect.y0, SWATCH.groundZ);
  }

  /** Scrive uno stamp ancorato al suo angolo, voxel per voxel. */
  private writeStamp(stamp: VoxelStamp, x0: number, y0: number, z0: number): void {
    const anchor = { x: x0, y: y0, z: z0 };

    for (let sz = 0; sz < stamp.sizeZ; sz++) {
      for (let sy = 0; sy < stamp.sizeY; sy++) {
        for (let sx = 0; sx < stamp.sizeX; sx++) {
          const index = sx + stamp.sizeX * (sy + stamp.sizeY * sz);
          const id = stamp.voxels[index];
          if (id === STAMP_EMPTY) continue;
          const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
          this.world.setBlock(voxel.x, voxel.y, voxel.z, id, stampSurface(stamp, index));
          this.written++;
        }
      }
    }
  }

  private writeBox(
    x0: number,
    y0: number,
    z0: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    id: number,
  ): void {
    for (let y = y0; y < y0 + sizeY; y++) {
      for (let x = x0; x < x0 + sizeX; x++) {
        this.written += this.world.fillColumn(x, y, z0, z0 + sizeZ, id);
      }
    }
  }
}

/**
 * Lo stamp dell'edificio di riferimento.
 *
 * La tipologia e' forzata per id e non scelta: senza citta' intorno
 * `selectTypology` puo' solo ripiegare, e il ripiego cambierebbe insieme al
 * catalogo — il metro di paragone della fascia di scala si sposterebbe da solo.
 * Il seme e' costante per la stessa ragione: qui non c'e' un seed di partita.
 */
function composeReference(): VoxelStamp {
  const typology = typologyById(SWATCH.referenceTypology) as TypologyDefinition;
  return generateBuilding({
    class: typology.use,
    level: SWATCH.referenceLevel,
    seed: 0,
    profile: typologyProfile(typology),
    shape: typology.shape,
    facing: FACING.east,
  });
}
