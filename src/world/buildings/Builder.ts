import {
  BUILDING_CLASS,
  addBuilding,
  nextBuildSites,
  urbanProfileAt,
  type Building,
  type BuildingClass,
  type LocalUrbanProfile,
  type SimState,
} from '../../sim';
import { CHUNK, keyOf, toChunk, toLocal } from '../chunkCoords';
import { hashCoords } from '../rng';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { paletteForDepth } from '../terrain/biomes';
import { TERRAIN } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';
import type { VoxelWorld } from '../VoxelWorld';
import { BuildingRegistry, type BuildingRecord, type ReadonlyBuildingRegistry } from './BuildingRegistry';
import {
  BUILDER,
  CLASS_PROFILE,
  DEFAULT_BUILDING_FORM,
  MAX_FOOTPRINT,
  type BuildingForm,
} from './config';
import { generateBuilding, startLevel } from './generate';
import { anchoredVoxel, stampSurface, STAMP_EMPTY, type VoxelAnchor, type VoxelStamp } from './stamp';

/**
 * Il ponte fra la simulazione e il mondo voxel.
 *
 * E' l'unico modulo autorizzato a scrivere edifici con `world.setBlock`. Il
 * terreno ha i suoi scrittori — `IslandGenerator` e `BiomeView` — ma nessuno
 * scrive un muro all'infuori di qui: e' cio' che rende vera l'affermazione "il
 * registry sa cosa esiste", perche' non c'e' un'altra strada per far comparire
 * un edificio.
 *
 * **La simulazione resta pura e non sa che esistiamo.** Il Builder legge le sue
 * decisioni (`nextBuildSites`) e il suo campo (`field.valueAt`), e le restituisce
 * una sola informazione: che su una certa colonna ora c'e' un edificio di una
 * certa classe. Non le passa il registry, non le passa il mondo, non le passa un
 * riferimento a se stesso.
 *
 * **Perche' un edificio nuovo costa una `addBuilding` sola.** Un'impronta 3x3
 * occupa nove colonne, ma la simulazione ne sente una: `buildingCounts` alimenta
 * il bilancio di `balance.ts`, e registrare nove edifici dove ce n'e' uno
 * moltiplicherebbe per nove il fabbisogno di cibo di quel lotto. L'occupazione
 * delle altre otto colonne vive nel registry, che e' anche l'unico che sappia
 * cosa sia un'impronta.
 */

/** Perche' un candidato della simulazione non e' diventato un edificio. */
export const REJECT_REASONS = [
  'notBuildable',
  'belowSea',
  'occupied',
  'tooSteep',
  'chunkBudget',
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export interface BuilderStats {
  /** Edifici completati piu' quelli ancora in crescita. */
  readonly placed: number;
  readonly upgraded: number;
  /** Edifici che stanno comparendo in questo momento. */
  readonly growing: number;
  /** Siti scartati per motivo, indicizzato come `REJECT_REASONS`. */
  readonly rejected: readonly number[];
  /** Siti bocciati in modo definitivo, che non verranno piu' riproposti. */
  readonly blacklisted: number;
  /** Celle di piazzole e sentieri ancora da applicare. */
  readonly surfaceQueued: number;
}

/** Un volume che cresce dal proprio voxel di ancoraggio. */
interface Growing {
  readonly record: BuildingRecord;
  readonly stamp: VoxelStamp;
  /** Impronta precedente: i soli voxel non coperti dalla nuova vengono rimossi. */
  readonly erase: VoxelStamp | null;
  voxelCursor: number;
  eraseCursor: number;
}

interface SurfacePaint {
  readonly x: number;
  readonly y: number;
  readonly palette: number;
  readonly priority: number;
}

interface SurfaceAnchor {
  readonly x: number;
  readonly y: number;
}

export class Builder {
  private readonly registryImpl = new BuildingRegistry();
  private readonly growing: Growing[] = [];
  private readonly surfaceQueue: string[] = [];
  private readonly surfacePending = new Map<string, SurfacePaint>();
  private readonly surfacePriority = new Map<string, number>();
  private readonly surfaceAnchors: SurfaceAnchor[] = [];
  private readonly surfaceAnchorKeys = new Set<string>();
  private surfaceHead = 0;

  /**
   * Siti bocciati in modo definitivo.
   *
   * Ogni motivo di scarto e' permanente: la pendenza di una colonna non cambia,
   * un'impronta non si sposta e nessuno demolisce. Riproporre un sito bocciato
   * significherebbe rifare lo stesso calcolo con lo stesso esito a ogni
   * infornata, per sempre. Se un giorno arrivera' la demolizione, questo insieme
   * andra' svuotato con `forget`.
   */
  private readonly blacklist = new Set<string>();

  private readonly rejectedCounts = new Array<number>(REJECT_REASONS.length).fill(0);

  private placedCount = 0;
  private upgradedCount = 0;
  private upgradeCursor = 0;

  constructor(
    private readonly world: VoxelWorld,
    private readonly terrainMap: TerrainMap,
    private readonly worldSeed: number,
  ) {}

  /** Sola lettura: nemmeno chi tiene il Builder puo' scrivere nel registry. */
  get registry(): ReadonlyBuildingRegistry {
    return this.registryImpl;
  }

  /**
   * Rende leggibile un catalizzatore senza aggiungerlo alla geometria degli
   * edifici: una piccola piazza usa soltanto il voxel di superficie e resta
   * quindi un dettaglio visivo, non una nuova regola della simulazione.
   */
  decorateCatalyst(x: number, y: number, cls: BuildingClass): void {
    const radius = BUILDER.catalystPlazaRadius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const centre = dx === 0 && dy === 0;
        this.enqueueSurface({
          x: x + dx,
          y: y + dy,
          palette: centre ? CLASS_PROFILE[cls].accent : PALETTE_SLOTS.asphalt,
          priority: centre ? 2 : 1,
        });
      }
    }
    this.addSurfaceAnchor({ x, y });
  }

  get stats(): BuilderStats {
    return {
      placed: this.placedCount,
      upgraded: this.upgradedCount,
      growing: this.growing.length,
      rejected: this.rejectedCounts,
      blacklisted: this.blacklist.size,
      surfaceQueued: this.surfacePending.size,
    };
  }

  /** Svuota i siti bocciati. Serve solo se qualcosa rende di nuovo libero il terreno. */
  forget(): void {
    this.blacklist.clear();
  }

  /**
   * Materializza gli edifici gia' presenti nello stato caricato o nello scenario.
   *
   * Non richiama `addBuilding`: il chiamante li ha gia' registrati nella
   * simulazione. Li scrive subito invece di animarli, cosi' una partita salvata
   * (e il nucleo della demo) torna visibile prima del primo tick.
   */
  materialize(buildings: readonly Building[]): void {
    for (const building of buildings) this.place(building.x, building.y, building.class, false);
  }

  /**
   * Da chiamare dopo ogni tick della simulazione.
   *
   * Restituisce il nuovo stato e ne prende possesso, come ogni operazione che
   * tocca il campo: lo stato passato non va piu' usato.
   */
  onTick(state: SimState): SimState {
    let next = state;
    if (state.tickCount % BUILDER.ticksPerBuild === 0) next = this.buildPass(next);
    if (state.tickCount % BUILDER.ticksPerUpgrade === 0) this.upgradePass(next);
    return next;
  }

  /**
   * Scrive singoli cubi degli edifici in crescita. Una chiamata per frame.
   *
   * Il costo per frame e' `maxGrowing * voxelsPerFrame` voxel, indipendente da
   * quanto e' grande la citta': e' il motivo per cui le comparse non fanno
   * cadere il frame rate quando gli edifici sono duemila invece di dieci.
   */
  step(): void {
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const entry = this.growing[i];
      let budget = BUILDER.voxelsPerFrame;

      if (entry.voxelCursor < entry.stamp.voxels.length) {
        const write = this.writeVoxelBatch(entry.record, entry.stamp, entry.voxelCursor, budget);
        entry.voxelCursor = write.cursor;
        budget -= write.written;
      }

      // Prima compare la nuova sagoma, poi spariscono soltanto le parti che non
      // le appartengono piu'. Cosi' un upgrade non cancella centinaia di voxel
      // in un singolo frame e l'edificio non lampeggia nel vuoto.
      if (entry.voxelCursor >= entry.stamp.voxels.length && entry.erase !== null && budget > 0) {
        const clear = this.clearObsoleteVoxelBatch(
          entry.record,
          entry.erase,
          entry.stamp,
          entry.eraseCursor,
          budget,
        );
        entry.eraseCursor = clear.cursor;
      }

      const writeDone = entry.voxelCursor >= entry.stamp.voxels.length;
      const clearDone = entry.erase === null || entry.eraseCursor >= entry.erase.voxels.length;
      if (writeDone && clearDone) this.growing.splice(i, 1);
    }

    this.stepSurface();
  }

  // --- Costruzione -----------------------------------------------------------

  /**
   * Un'infornata di costruzioni.
   *
   * Prende piu' candidati di quanti ne serva perche' la simulazione ragiona per
   * colonna: non sa cosa sia un'impronta, una pendenza o un chunk, quindi una
   * parte dei suoi candidati e' inevitabilmente inutilizzabile.
   */
  private buildPass(state: SimState): SimState {
    const wanted = BUILDER.sitesPerBuild;
    const sites = nextBuildSites(state, this.terrainMap, wanted * BUILDER.candidateOverfetch);

    let next = state;
    let accepted = 0;

    for (const site of sites) {
      if (accepted >= wanted) break;
      if (this.growing.length >= BUILDER.maxGrowing) break;

      const record = this.place(site.x, site.y, site.class, true, next);
      if (record === null) continue;

      next = addBuilding(next, { x: record.x, y: record.y, class: record.class });
      accepted++;
    }

    return next;
  }

  /** Valida il sito, getta la fondazione, accoda la comparsa. null se il sito non va. */
  private place(
    x: number,
    y: number,
    cls: BuildingClass,
    animate = true,
    state: SimState | null = null,
  ): BuildingRecord | null {
    const key = `${x},${y}`;
    if (this.blacklist.has(key)) return null;

    const seed = hashCoords(this.worldSeed, x, y);
    const profile = state === null
      ? null
      : urbanProfileAt(state.catalysts, state.policies, x, y);
    const form = formOf(profile);
    const level = Math.min(BUILDER.maxLevel, startLevel(seed) + localLevelBonus(form));
    const stamp = generateBuilding(cls, level, seed, MAX_FOOTPRINT, 1, form);
    const footprint = stamp.sizeX;

    const ground = this.surveyGround(x, y, footprint);
    if (ground === null) return this.reject(key, 'notBuildable');
    if (ground.minZ < TERRAIN.seaLevel) return this.reject(key, 'belowSea');
    if (ground.padZ - ground.minZ > BUILDER.maxTerrainStep) return this.reject(key, 'tooSteep');

    const baseZ = ground.padZ;
    if (this.registryImpl.overlaps(x, y, footprint, baseZ, stamp.sizeZ)) {
      return this.reject(key, 'occupied');
    }
    if (this.dirtyChunkCount(x, y, footprint, ground.minZ, baseZ + stamp.sizeZ) >
        BUILDER.maxDirtyChunksPerBuilding) {
      return this.reject(key, 'chunkBudget');
    }

    this.clearSiteDecor(x, y, footprint);
    this.pour(x, y, footprint, ground.padZ);

    const record = this.registryImpl.add({
      x,
      y,
      baseZ,
      footprint,
      height: stamp.sizeZ,
      class: cls,
      level,
      seed,
      form,
      district: profile?.district ?? 'outskirts',
    });

    if (animate) this.growing.push({ record, stamp, erase: null, voxelCursor: 0, eraseCursor: 0 });
    else this.writeStamp(record, stamp, 0, stamp.sizeZ, false);
    this.enqueueBuildingSurface(record);
    this.placedCount++;
    return record;
  }

  /**
   * Quote del terreno sotto l'impronta.
   *
   * `padZ` e' il **massimo** delle colonne, non il minimo, ed e' una scelta
   * deliberata: livellare verso il basso significherebbe cancellare voxel di
   * terreno, cioe' scavare buchi permanenti nell'isola per fare spazio a un
   * edificio che nessuno ha chiesto. Riempire non toglie niente a nessuno, e il
   * dislivello che riempie e' comunque limitato da `maxTerrainStep`.
   *
   * null se anche una sola colonna non e' edificabile o non e' generata.
   */
  private surveyGround(x: number, y: number, footprint: number): { minZ: number; padZ: number } | null {
    let minZ = Number.MAX_SAFE_INTEGER;
    let padZ = 0;

    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const column = this.terrainMap.columnAt(x + dx, y + dy);
        if (column === null || !column.buildable) return null;
        if (column.height < minZ) minZ = column.height;
        if (column.height > padZ) padZ = column.height;
      }
    }

    return { minZ, padZ };
  }

  /**
   * Getta la fondazione: porta ogni colonna dell'impronta alla quota del
   * pianoro, con la stratigrafia del bioma su cui poggia.
   *
   * Il colore esce da `paletteForDepth`, la stessa funzione che usa
   * `IslandGenerator`: una fondazione con un colore proprio si vedrebbe come una
   * toppa, e sarebbe una toppa.
   */
  private pour(x: number, y: number, footprint: number, padZ: number): void {
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const column = this.terrainMap.columnAt(x + dx, y + dy);
        if (column === null) continue;
        for (let z = column.height; z < padZ; z++) {
          this.world.setBlock(x + dx, y + dy, z, paletteForDepth(column.biome, padZ - 1 - z));
        }
      }
    }
  }

  // --- Upgrade ---------------------------------------------------------------

  /**
   * Promuove al livello successivo gli edifici su cui la desiderabilita' e'
   * salita abbastanza.
   *
   * E' la crescita verticale: quando l'isola si riempie, `nextBuildSites` smette
   * di produrre candidati e questa passata resta l'unico modo in cui la citta'
   * puo' ancora cambiare.
   *
   * La passata riparte da dove si era fermata invece di ricominciare da capo:
   * con duemila edifici, rileggere il campo su tutti a ogni passata sarebbe la
   * sola cosa nel ciclo il cui costo cresce con la citta'.
   */
  private upgradePass(state: SimState): void {
    const records = [...this.registryImpl.all];
    if (records.length === 0) return;

    const budget = Math.min(BUILDER.upgradesPerPass, records.length);
    for (let i = 0; i < budget; i++) {
      if (this.growing.length >= BUILDER.maxGrowing) break;

      const record = records[this.upgradeCursor % records.length];
      this.upgradeCursor++;
      if (this.growing.some((entry) => entry.record.id === record.id)) continue;
      if (record.level >= BUILDER.maxLevel) continue;

      const nextLevel = record.level + 1;
      const profile = urbanProfileAt(state.catalysts, state.policies, record.x, record.y);
      const threshold = BUILDER.upgradeThreshold[nextLevel] - localUpgradeDiscount(formOf(profile));
      if (state.field.valueAt(record.x, record.y, record.class) <= threshold) {
        continue;
      }

      this.upgrade(record, nextLevel, profile);
    }
  }

  /**
   * Sostituisce un edificio con la sua versione di livello superiore.
   *
   * Stesso seed e stesso ancoraggio, quindi la torre nuova si riconosce come la
   * vecchia cresciuta. L'impronta si allarga solo se il registry conferma che
   * l'anello aggiuntivo e' libero; altrimenti il livello nuovo viene rigenerato
   * con l'impronta vecchia come tetto, e cresce solo in altezza.
   */
  private upgrade(record: BuildingRecord, nextLevel: number, profile: LocalUrbanProfile): void {
    const oldForm = record.form ?? DEFAULT_BUILDING_FORM;
    const nextForm = formOf(profile);
    const old = generateBuilding(
      record.class,
      record.level,
      record.seed,
      record.footprint,
      record.footprint,
      oldForm,
    );

    let stamp = generateBuilding(
      record.class,
      nextLevel,
      record.seed,
      MAX_FOOTPRINT,
      record.footprint,
      nextForm,
    );
    if (stamp.sizeX > record.footprint && !this.fitsWider(record, stamp)) {
      stamp = generateBuilding(
        record.class,
        nextLevel,
        record.seed,
        record.footprint,
        record.footprint,
        nextForm,
      );
    }

    if (this.dirtyChunkCount(record.x, record.y, stamp.sizeX, record.baseZ, record.baseZ + stamp.sizeZ) >
        BUILDER.maxDirtyChunksPerBuilding) {
      return;
    }

    if (stamp.sizeX > record.footprint) {
      this.clearExpandedSiteDecor(record, stamp.sizeX);
    }

    const replaced = this.registryImpl.replace(record.id, {
      x: record.x,
      y: record.y,
      baseZ: record.baseZ,
      footprint: stamp.sizeX,
      height: stamp.sizeZ,
      class: record.class,
      level: nextLevel,
      seed: record.seed,
      form: nextForm,
      district: profile.district,
    });
    if (replaced === null) return;

    // La fondazione dell'anello aggiuntivo va gettata prima di salire: senza,
    // l'impronta allargata poggerebbe nel vuoto sulle colonne nuove.
    if (stamp.sizeX > record.footprint) {
      const ground = this.surveyGround(record.x, record.y, stamp.sizeX);
      if (ground !== null) this.pour(record.x, record.y, stamp.sizeX, record.baseZ);
    }

    this.enqueueBuildingSurface(replaced);
    this.growing.push({ record: replaced, stamp, erase: old, voxelCursor: 0, eraseCursor: 0 });
    this.upgradedCount++;
  }

  /** true se l'impronta allargata non tocca nessun altro edificio. */
  private fitsWider(record: BuildingRecord, stamp: VoxelStamp): boolean {
    const ground = this.surveyGround(record.x, record.y, stamp.sizeX);
    if (ground === null) return false;
    if (ground.padZ > record.baseZ) return false;

    for (let dy = 0; dy < stamp.sizeX; dy++) {
      for (let dx = 0; dx < stamp.sizeX; dx++) {
        for (const other of this.registryImpl.at(record.x + dx, record.y + dy)) {
          if (other.id === record.id) continue;
          if (other.baseZ < record.baseZ + stamp.sizeZ && record.baseZ < other.baseZ + other.height) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // --- Scrittura -------------------------------------------------------------

  /** Scrive le quote `[fromZ, toZ)` di uno stamp. `clear` scrive vuoto invece del colore. */
  private writeStamp(
    record: BuildingRecord,
    stamp: VoxelStamp,
    fromZ: number,
    toZ: number,
    clear: boolean,
  ): void {
    const anchor: VoxelAnchor = { x: record.x, y: record.y, z: record.baseZ };
    for (let sz = fromZ; sz < toZ; sz++) {
      for (let sy = 0; sy < stamp.sizeY; sy++) {
        for (let sx = 0; sx < stamp.sizeX; sx++) {
          const index = sx + stamp.sizeX * (sy + stamp.sizeY * sz);
          const id = stamp.voxels[index];
          if (id === STAMP_EMPTY) continue;
          const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
          this.world.setBlock(
            voxel.x,
            voxel.y,
            voxel.z,
            clear ? STAMP_EMPTY : id,
            clear ? undefined : stampSurface(stamp, index),
          );
        }
      }
    }
  }

  /** Scrive un numero limitato di cubi solidi, dal basso verso l'alto. */
  private writeVoxelBatch(
    record: BuildingRecord,
    stamp: VoxelStamp,
    from: number,
    budget: number,
  ): { cursor: number; written: number } {
    const anchor: VoxelAnchor = { x: record.x, y: record.y, z: record.baseZ };
    const plane = stamp.sizeX * stamp.sizeY;
    let cursor = from;
    let written = 0;
    while (cursor < stamp.voxels.length && written < budget) {
      const id = stamp.voxels[cursor];
      if (id !== STAMP_EMPTY) {
        const sz = Math.floor(cursor / plane);
        const within = cursor - sz * plane;
        const sy = Math.floor(within / stamp.sizeX);
        const sx = within - sy * stamp.sizeX;
        const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
        this.world.setBlock(voxel.x, voxel.y, voxel.z, id, stampSurface(stamp, cursor));
        written++;
      }
      cursor++;
    }
    return { cursor, written };
  }

  /** Rimuove a budget soltanto i voxel vecchi che la nuova sagoma non copre. */
  private clearObsoleteVoxelBatch(
    record: BuildingRecord,
    previous: VoxelStamp,
    next: VoxelStamp,
    from: number,
    budget: number,
  ): { cursor: number; written: number } {
    const anchor: VoxelAnchor = { x: record.x, y: record.y, z: record.baseZ };
    const previousPlane = previous.sizeX * previous.sizeY;
    let cursor = from;
    let written = 0;

    while (cursor < previous.voxels.length && written < budget) {
      if (previous.voxels[cursor] !== STAMP_EMPTY) {
        const sz = Math.floor(cursor / previousPlane);
        const within = cursor - sz * previousPlane;
        const sy = Math.floor(within / previous.sizeX);
        const sx = within - sy * previous.sizeX;
        const covered = sx < next.sizeX && sy < next.sizeY && sz < next.sizeZ &&
          next.voxels[sx + next.sizeX * (sy + next.sizeY * sz)] !== STAMP_EMPTY;
        if (!covered) {
          const voxel = anchoredVoxel(anchor, previous, sx, sy, sz);
          this.world.setBlock(voxel.x, voxel.y, voxel.z, STAMP_EMPTY);
          written++;
        }
      }
      cursor++;
    }

    return { cursor, written };
  }

  // --- Superficie urbana ----------------------------------------------------

  /** Bonifica tronchi e chiome nel lotto e nel suo bordo, senza toccare il suolo. */
  private clearSiteDecor(x: number, y: number, footprint: number): void {
    for (let py = y - 1; py <= y + footprint; py++) {
      for (let px = x - 1; px <= x + footprint; px++) {
        if (this.registryImpl.at(px, py).length > 0) continue;
        this.clearDecorColumn(px, py);
      }
    }
  }

  /** Bonifica soltanto l'anello aggiunto da un upgrade, preservando il volume vecchio. */
  private clearExpandedSiteDecor(record: BuildingRecord, footprint: number): void {
    for (let py = record.y - 1; py <= record.y + footprint; py++) {
      for (let px = record.x - 1; px <= record.x + footprint; px++) {
        const insideOld = px >= record.x && px < record.x + record.footprint &&
          py >= record.y && py < record.y + record.footprint;
        if (insideOld) continue;
        const occupied = this.registryImpl.at(px, py).some((other) => other.id !== record.id);
        if (occupied) continue;
        this.clearDecorColumn(px, py);
      }
    }
  }

  private clearDecorColumn(x: number, y: number): void {
    const column = this.terrainMap.columnAt(x, y);
    if (column === null) return;
    const top = column.height + BUILDER.decorClearanceHeight;
    for (let z = column.height; z < top; z++) {
      if (this.world.getBlock(x, y, z) !== STAMP_EMPTY) {
        this.world.setBlock(x, y, z, STAMP_EMPTY);
      }
    }
  }

  private enqueueBuildingSurface(record: BuildingRecord): void {
    const palette = record.class === BUILDING_CLASS.production
      ? PALETTE_SLOTS.asphaltDark
      : PALETTE_SLOTS.asphalt;
    for (let px = record.x - 1; px <= record.x + record.footprint; px++) {
      this.enqueueSurface({ x: px, y: record.y - 1, palette, priority: 1 });
      this.enqueueSurface({ x: px, y: record.y + record.footprint, palette, priority: 1 });
    }
    for (let py = record.y; py < record.y + record.footprint; py++) {
      this.enqueueSurface({ x: record.x - 1, y: py, palette, priority: 1 });
      this.enqueueSurface({ x: record.x + record.footprint, y: py, palette, priority: 1 });
    }

    const centre = {
      x: record.x + Math.floor((record.footprint - 1) * 0.5),
      y: record.y + Math.floor((record.footprint - 1) * 0.5),
    };
    const nearest = this.nearestSurfaceAnchor(centre);
    const door = nearest === null ? { x: record.x - 1, y: centre.y } : this.doorToward(record, nearest);
    if (nearest !== null && Math.abs(door.x - nearest.x) + Math.abs(door.y - nearest.y) <= BUILDER.pathLinkDistance) {
      const path = this.pathCells(door, nearest, record.seed);
      if (path.every((cell) => this.canPaintSurface(cell.x, cell.y))) {
        for (const cell of path) this.enqueueSurface({ ...cell, palette, priority: 1 });
      }
    }
    this.addSurfaceAnchor(door);
  }

  private doorToward(record: BuildingRecord, target: SurfaceAnchor): SurfaceAnchor {
    const centreX = record.x + Math.floor((record.footprint - 1) * 0.5);
    const centreY = record.y + Math.floor((record.footprint - 1) * 0.5);
    const dx = target.x - centreX;
    const dy = target.y - centreY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: dx < 0 ? record.x - 1 : record.x + record.footprint, y: centreY };
    }
    return { x: centreX, y: dy < 0 ? record.y - 1 : record.y + record.footprint };
  }

  private nearestSurfaceAnchor(from: SurfaceAnchor): SurfaceAnchor | null {
    let best: SurfaceAnchor | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of this.surfaceAnchors) {
      const distance = Math.abs(candidate.x - from.x) + Math.abs(candidate.y - from.y);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  private addSurfaceAnchor(anchor: SurfaceAnchor): void {
    const key = `${anchor.x},${anchor.y}`;
    if (this.surfaceAnchorKeys.has(key)) return;
    this.surfaceAnchorKeys.add(key);
    this.surfaceAnchors.push(anchor);
  }

  private pathCells(from: SurfaceAnchor, to: SurfaceAnchor, seed: number): SurfaceAnchor[] {
    const cells: SurfaceAnchor[] = [];
    let x = from.x;
    let y = from.y;
    const horizontalFirst = (hashCoords(seed, from.x, from.y) & 1) === 0;
    const walkX = (): void => {
      while (x !== to.x) {
        cells.push({ x, y });
        x += Math.sign(to.x - x);
      }
    };
    const walkY = (): void => {
      while (y !== to.y) {
        cells.push({ x, y });
        y += Math.sign(to.y - y);
      }
    };
    if (horizontalFirst) {
      walkX();
      walkY();
    } else {
      walkY();
      walkX();
    }
    cells.push({ x: to.x, y: to.y });
    return cells;
  }

  private canPaintSurface(x: number, y: number): boolean {
    const column = this.terrainMap.columnAt(x, y);
    return column !== null && column.buildable && this.registryImpl.at(x, y).length === 0;
  }

  private enqueueSurface(paint: SurfacePaint): void {
    if (!this.canPaintSurface(paint.x, paint.y)) return;
    const key = `${paint.x},${paint.y}`;
    if (paint.priority < (this.surfacePriority.get(key) ?? 0)) return;
    const current = this.surfacePending.get(key);
    if (current !== undefined) {
      if (paint.priority > current.priority) this.surfacePending.set(key, paint);
      return;
    }
    this.surfacePending.set(key, paint);
    this.surfaceQueue.push(key);
  }

  private stepSurface(): void {
    let painted = 0;
    while (this.surfaceHead < this.surfaceQueue.length && painted < BUILDER.surfaceCellsPerFrame) {
      const key = this.surfaceQueue[this.surfaceHead++];
      const paint = this.surfacePending.get(key);
      if (paint === undefined) continue;
      this.surfacePending.delete(key);
      if (!this.canPaintSurface(paint.x, paint.y)) continue;

      const column = this.terrainMap.columnAt(paint.x, paint.y);
      if (column === null) continue;
      this.clearDecorColumn(paint.x, paint.y);
      this.world.setBlock(paint.x, paint.y, column.height - 1, paint.palette);
      this.surfacePriority.set(key, paint.priority);
      painted++;
    }

    if (this.surfaceHead >= this.surfaceQueue.length) {
      this.surfaceQueue.length = 0;
      this.surfaceHead = 0;
    }
  }

  // --- Budget di chunk -------------------------------------------------------

  /**
   * Chunk che l'edificio marcherebbe sporchi, fondazione inclusa.
   *
   * Conta anche i vicini che una scrittura su cella di bordo costringe a
   * rimeshare, e li conta **senza chiedersi se esistono gia'**: un tetto che
   * vale solo finche' il chunk accanto non e' stato allocato non e' un tetto. La
   * stima e' quindi per eccesso, e qualche sito perfettamente buono viene
   * scartato come `chunkBudget` — sono le posizioni a cavallo di due cuciture,
   * meno dell'uno per cento della mappa.
   */
  private dirtyChunkCount(
    x: number,
    y: number,
    footprint: number,
    minZ: number,
    maxZ: number,
  ): number {
    const keys = new Set<string>();

    const cx0 = toChunk(x);
    const cx1 = toChunk(x + footprint - 1);
    const cy0 = toChunk(y);
    const cy1 = toChunk(y + footprint - 1);
    const cz0 = toChunk(minZ);
    const cz1 = toChunk(maxZ - 1);

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
      }
    }

    // Un vicino si aggiunge una volta per ogni combinazione delle altre due
    // coordinate di chunk: la faccia intera va rimeshata, non una cella.
    for (const cx of edgeChunks(x, x + footprint - 1)) {
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cy = cy0; cy <= cy1; cy++) keys.add(keyOf(cx, cy, cz));
      }
    }
    for (const cy of edgeChunks(y, y + footprint - 1)) {
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
      }
    }
    for (const cz of edgeChunks(minZ, maxZ - 1)) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
      }
    }

    return keys.size;
  }

  private reject(key: string, reason: RejectReason): null {
    this.blacklist.add(key);
    this.rejectedCounts[REJECT_REASONS.indexOf(reason)]++;
    return null;
  }
}

/**
 * Coordinate di chunk dei vicini che una scrittura su `[min, max]` marcherebbe.
 *
 * Sono al massimo due — uno sotto e uno sopra — perche' l'intervallo e' corto e
 * le celle di bordo di un chunk distano 32.
 */
function edgeChunks(min: number, max: number): readonly number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v++) {
    if (toLocal(v) === 0) out.push(toChunk(v) - 1);
    else if (toLocal(v) === CHUNK - 1) out.push(toChunk(v) + 1);
  }
  return out;
}

function formOf(profile: LocalUrbanProfile | null): BuildingForm {
  if (profile === null) return DEFAULT_BUILDING_FORM;
  return {
    density: profile.density,
    wealth: profile.wealth,
    accessibility: profile.accessibility,
    satisfaction: profile.satisfaction,
  };
}

function localLevelBonus(form: BuildingForm): number {
  const weight = BUILDER.localLevel;
  return Math.floor(
    form.density * weight.density +
    form.wealth * weight.wealth +
    form.accessibility * weight.accessibility +
    form.satisfaction * weight.satisfaction,
  );
}

function localUpgradeDiscount(form: BuildingForm): number {
  const weight = BUILDER.localUpgrade;
  return Math.min(
    weight.maxDiscount,
    Math.floor(
      form.density * weight.density +
      form.wealth * weight.wealth +
      form.accessibility * weight.accessibility +
      form.satisfaction * weight.satisfaction,
    ),
  );
}
