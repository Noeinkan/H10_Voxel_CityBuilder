import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  BUILDING_CLASS,
  FARM_KIND,
  addCatalyst,
  catalystById,
  createSimState,
  type SimState,
} from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { CHUNK, idx } from '../chunkCoords';
import { FARMS } from '../farms/config';
import { COVER } from '../terrain/groundcover';
import { VoxelWorld } from '../VoxelWorld';
import { coverMarkKind, isCoverMark } from '../visualBlock';
import { Builder } from './Builder';
import { BUILDER } from './config';
import { PLOTS_PER_PASS } from './farmDriver';

/**
 * Una citta' che ha fame: popolazione vera, nessun lotto agricolo.
 *
 * Senza popolazione il deficit e' zero e il driver non pianta niente — che e' il
 * comportamento giusto e un pessimo punto di partenza per un test.
 */
function hungryCity(): SimState {
  const state = createSimState();
  return { ...state, population: { stock: 240, delta: 0 } };
}

/** Applica tutta la coda della superficie: i test guardano i voxel, non la coda. */
function drain(builder: Builder): void {
  for (let i = 0; i < 400 && builder.stats.surfaceQueued > 0; i++) builder.step();
}

/**
 * Tutti i marcatori di copertura del mondo, con il tipo che portano.
 *
 * Si scandiscono i chunk e non le colonne: `getBlock` di un marcatore vale 0 —
 * per chi cerca un ostacolo un'erbetta non c'e' — quindi dal di fuori non e'
 * distinguibile dal vuoto. Il byte vero sta in `Chunk.blocks`, ed e' li' che
 * `isCoverMark` sa leggerlo.
 */
function coverMarks(world: VoxelWorld): { x: number; y: number; kind: number }[] {
  const out: { x: number; y: number; kind: number }[] = [];
  for (const chunk of world.chunks.values()) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let ly = 0; ly < CHUNK; ly++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const block = chunk.blocks[idx(lx, ly, lz)];
          if (!isCoverMark(block)) continue;
          out.push({
            x: chunk.cx * CHUNK + lx,
            y: chunk.cy * CHUNK + ly,
            kind: coverMarkKind(block),
          });
        }
      }
    }
  }
  return out;
}

describe('FarmDriver — la campagna nasce fuori dalla citta’', () => {
  it('una citta’ affamata pianta lotti, e il contatore della simulazione li segue', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    const after = builder.onTick(hungryCity());

    expect(builder.stats.farmPlots).toBeGreaterThan(0);
    expect(after.farmCounts[FARM_KIND.field]).toBe(builder.stats.farmPlots);
  });

  it('una citta’ senza fame non pianta niente', () => {
    // Popolazione zero: nessuno da sfamare, nessun campo. E' il caso della
    // partita appena aperta, e un driver che piantasse comunque riempirebbe
    // l'isola di campi prima del primo abitante.
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    builder.onTick(createSimState());

    expect(builder.stats.farmPlots).toBe(0);
  });

  it('la serra e’ la cintura fertile: i lotti nascono attorno a lei, non al centro', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    const greenhouse = catalystById('greenhouse');
    const state = addCatalyst(hungryCity(), {
      x: 120,
      y: 120,
      kind: 'greenhouse',
      class: greenhouse.class,
      strength: greenhouse.strength,
      radius: greenhouse.radius,
    });

    builder.onTick(state);
    drain(builder);

    const marks = coverMarks(world);
    expect(marks.length).toBeGreaterThan(0);

    // Il baricentro dei solchi deve cadere vicino alla serra, non vicino
    // all'origine da cui partiva la spirale prima della cintura fertile.
    let sx = 0;
    let sy = 0;
    for (const mark of marks) {
      sx += mark.x;
      sy += mark.y;
    }
    const cx = sx / marks.length;
    const cy = sy / marks.length;
    expect((cx - 120) ** 2 + (cy - 120) ** 2).toBeLessThan(cx ** 2 + cy ** 2);
  });

  /**
   * Il driver chiedeva quanti lotti mancassero *a organico pieno*, passando un
   * `1` scritto a mano: una stima su un'aritmetica diversa da quella con cui il
   * tick calcola poi il raccolto. Una citta' a meta' organico ne raccoglieva la
   * meta' e la campagna si fermava credendosi in pareggio.
   */
  it('a corto di braccia pianta dove a organico pieno si fermerebbe', () => {
    const plots = (staffing: number): number => {
      const world = new VoxelWorld();
      const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
      const builder = new Builder(world, terrain, 1337);
      // Sei campi per 240 abitanti: sopra il bersaglio a braccia piene, sotto
      // appena le braccia mancano. E' esattamente la citta' che si credeva a
      // posto mentre raccoglieva la meta'.
      builder.onTick({ ...hungryCity(), farmCounts: [6, 0, 0], staffing });
      return builder.stats.farmPlots;
    };

    expect(plots(1)).toBe(0);
    expect(plots(0.5)).toBeGreaterThan(0);
  });

  it('non pianta piu’ di `PLOTS_PER_PASS` per passata', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    builder.onTick(hungryCity());

    expect(builder.stats.farmPlots).toBeLessThanOrEqual(PLOTS_PER_PASS);
  });

  it('il tetto copre il caso peggiore del costruttore', () => {
    // **E' la relazione che si e' gia' rotta una volta.** Scritto a mano il tetto
    // valeva `6` contro i `12` della propria derivazione, e sotto quel numero la
    // campagna non poteva raggiungere la citta' per costruzione: l'offerta
    // tornava una costante contro una domanda che cresce. Qui si lega il conto,
    // non il numero — cambiare la cadenza del costruttore deve muovere il tetto,
    // non farlo mentire.
    const worstCase = (BUILDER.sitesPerBuild / BUILDER.ticksPerBuild) * FARMS.ticksPerPass;
    const housesPerPlot = BALANCE.farms[FARM_KIND.field].houses;

    expect(PLOTS_PER_PASS).toBeGreaterThanOrEqual(worstCase / housesPerPlot);
  });
});

describe('FarmDriver — i solchi nel mondo', () => {
  it('posa marcatori di solco e non ripavimenta il terreno', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    const before = world.solidVoxelCount;
    builder.onTick(hungryCity());
    drain(builder);

    const marks = coverMarks(world);
    expect(marks.length).toBeGreaterThan(0);
    // Solo solchi, e tutti dello stesso verso dentro lo stesso lotto.
    for (const mark of marks) {
      expect([COVER.cropX, COVER.cropY]).toContain(mark.kind);
    }
    // Il terreno non e' stato ridipinto: i voxel solidi sono quelli di prima
    // piu' i marcatori, che sono celle piene senza palette.
    expect(world.solidVoxelCount).toBe(before + marks.length);
  });

  it('un lotto corre tutto in un verso solo', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    builder.onTick(hungryCity());
    drain(builder);

    // Raggruppa per lotto: due lotti possono avere versi diversi — e' la
    // trapunta — ma dentro un lotto il verso e' uno solo, o non sono solchi.
    const byPlot = new Map<string, Set<number>>();
    for (const mark of coverMarks(world)) {
      const key = `${Math.floor(mark.x / FARMS.lattice)},${Math.floor(mark.y / FARMS.lattice)}`;
      const seen = byPlot.get(key) ?? new Set<number>();
      seen.add(mark.kind);
      byPlot.set(key, seen);
    }

    expect(byPlot.size).toBeGreaterThan(0);
    for (const [key, kinds] of byPlot) {
      expect({ key, versi: kinds.size }).toEqual({ key, versi: 1 });
    }
  });
});

describe('FarmDriver — la citta’ si mangia i propri campi', () => {
  it('un lotto non impedisce di costruirci sopra', () => {
    // E' l'invariante che tiene in piedi tutta la meccanica: se un campo
    // occupasse le colonne, la citta' non potrebbe crescerci sopra e la fame
    // non arriverebbe mai.
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    let state = builder.onTick(hungryCity());
    const planted = builder.stats.farmPlots;
    expect(planted).toBeGreaterThan(0);

    // Un catalizzatore forte proprio dove la campagna e' appena nata.
    state = addCatalyst(state, {
      x: 12,
      y: 12,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 60,
    });

    const before = builder.stats.placed;
    for (let i = 1; i < 400; i++) state = builder.onTick({ ...state, tickCount: i });

    expect(builder.stats.placed).toBeGreaterThan(before);
  });

  it('quando la citta’ prende le sue colonne, il lotto si ritira e il contatore scende', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    let state = builder.onTick(hungryCity());
    const planted = builder.stats.farmPlots;
    expect(planted).toBeGreaterThan(0);
    expect(state.farmCounts[FARM_KIND.field]).toBe(planted);

    state = addCatalyst(state, {
      x: 12,
      y: 12,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 80,
    });

    // Abbastanza tick perche' la crescita copra la campagna e il driver rifaccia
    // almeno una passata.
    for (let i = 1; i < 1200; i++) {
      state = builder.onTick({ ...state, tickCount: i, population: { stock: 240, delta: 0 } });
    }

    // Il contatore della simulazione e il registro del mondo restano d'accordo,
    // qualunque cosa sia successa in mezzo.
    expect(state.farmCounts[FARM_KIND.field]).toBe(builder.stats.farmPlots);
  });
});
