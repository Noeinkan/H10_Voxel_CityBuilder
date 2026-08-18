import { addBuilding, nextBuildSites, type Building, type BuildingClass, type SimState } from '../../sim';
import { CHUNK, keyOf, toChunk, toLocal } from '../chunkCoords';
import { hashCoords } from '../rng';
import { paletteForDepth } from '../terrain/biomes';
import { TERRAIN } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';
import type { VoxelWorld } from '../VoxelWorld';
import { BuildingRegistry, type BuildingRecord, type ReadonlyBuildingRegistry } from './BuildingRegistry';
import { BUILDER } from './config';
import { generateBuilding, startLevel } from './generate';
import { anchoredVoxel, STAMP_EMPTY, type VoxelAnchor, type VoxelStamp } from './stamp';

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
}

/** Un volume che cresce dal proprio voxel di ancoraggio. */
interface Growing {
  readonly record: BuildingRecord;
  readonly stamp: VoxelStamp;
  /** Impronta del livello precedente, da cancellare prima di scrivere. */
  readonly erase: VoxelStamp | null;
  voxelCursor: number;
  cleared: boolean;
}

export class Builder {
  private readonly registryImpl = new BuildingRegistry();
  private readonly growing: Growing[] = [];

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

  get stats(): BuilderStats {
    return {
      placed: this.placedCount,
      upgraded: this.upgradedCount,
      growing: this.growing.length,
      rejected: this.rejectedCounts,
      blacklisted: this.blacklist.size,
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

      // La demolizione del livello precedente non e' animata: un edificio che
      // svanisce fascia per fascia mentre quello nuovo non c'e' ancora si legge
      // come un errore, non come un upgrade.
      if (!entry.cleared) {
        if (entry.erase !== null) this.writeStamp(entry.record, entry.erase, 0, entry.erase.sizeZ, true);
        entry.cleared = true;
      }

      entry.voxelCursor = this.writeVoxelBatch(
        entry.record,
        entry.stamp,
        entry.voxelCursor,
        BUILDER.voxelsPerFrame,
      );
      if (entry.voxelCursor >= entry.stamp.voxels.length) this.growing.splice(i, 1);
    }
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

      const record = this.place(site.x, site.y, site.class);
      if (record === null) continue;

      next = addBuilding(next, { x: record.x, y: record.y, class: record.class });
      accepted++;
    }

    return next;
  }

  /** Valida il sito, getta la fondazione, accoda la comparsa. null se il sito non va. */
  private place(x: number, y: number, cls: BuildingClass, animate = true): BuildingRecord | null {
    const key = `${x},${y}`;
    if (this.blacklist.has(key)) return null;

    const seed = hashCoords(this.worldSeed, x, y);
    const level = startLevel(seed);
    const stamp = generateBuilding(cls, level, seed);
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
    });

    if (animate) this.growing.push({ record, stamp, erase: null, voxelCursor: 0, cleared: true });
    else this.writeStamp(record, stamp, 0, stamp.sizeZ, false);
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
      if (record.level >= BUILDER.maxLevel) continue;

      const nextLevel = record.level + 1;
      if (state.field.valueAt(record.x, record.y, record.class) <= BUILDER.upgradeThreshold[nextLevel]) {
        continue;
      }

      this.upgrade(record, nextLevel);
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
  private upgrade(record: BuildingRecord, nextLevel: number): void {
    const old = generateBuilding(record.class, record.level, record.seed, record.footprint);

    let stamp = generateBuilding(record.class, nextLevel, record.seed);
    if (stamp.sizeX > record.footprint && !this.fitsWider(record, stamp)) {
      stamp = generateBuilding(record.class, nextLevel, record.seed, record.footprint);
    }

    if (this.dirtyChunkCount(record.x, record.y, stamp.sizeX, record.baseZ, record.baseZ + stamp.sizeZ) >
        BUILDER.maxDirtyChunksPerBuilding) {
      return;
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
    });
    if (replaced === null) return;

    // La fondazione dell'anello aggiuntivo va gettata prima di salire: senza,
    // l'impronta allargata poggerebbe nel vuoto sulle colonne nuove.
    if (stamp.sizeX > record.footprint) {
      const ground = this.surveyGround(record.x, record.y, stamp.sizeX);
      if (ground !== null) this.pour(record.x, record.y, stamp.sizeX, record.baseZ);
    }

    this.growing.push({ record: replaced, stamp, erase: old, voxelCursor: 0, cleared: false });
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
          const id = stamp.voxels[sx + stamp.sizeX * (sy + stamp.sizeY * sz)];
          if (id === STAMP_EMPTY) continue;
          const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
          this.world.setBlock(voxel.x, voxel.y, voxel.z, clear ? STAMP_EMPTY : id);
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
  ): number {
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
        this.world.setBlock(voxel.x, voxel.y, voxel.z, id);
        written++;
      }
      cursor++;
    }
    return cursor;
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
