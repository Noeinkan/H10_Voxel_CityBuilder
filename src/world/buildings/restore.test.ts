import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  addCatalyst,
  createSimState,
  tick,
  type SimState,
} from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { SUNKEN_COURT } from '../arcology/config';
import { arcologySpan } from '../arcology/generate';
import { FACING } from '../streets/streetGrid';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import type { BuildingRecord } from './BuildingRegistry';

/**
 * Il giro che il salvataggio deve reggere: una citta' costruita davvero, i suoi
 * record portati in un mondo vuoto, e i voxel che tornano identici.
 *
 * **E' l'unico posto in cui `restore` viene provato contro la macchina vera.**
 * I test di `src/game/save/` coprono il formato e la potatura su record scritti
 * a mano; qui la citta' la costruisce il Builder, con le tipologie, gli stili,
 * le file e le opere di terra che sceglie da solo — cioe' esattamente i campi
 * che un record deve portarsi dietro perche' `recordStamp` sappia ridisegnarlo.
 */

const SEED = 1337;

interface City {
  readonly world: VoxelWorld;
  readonly builder: Builder;
  readonly state: SimState;
}

/** Una citta' piccola ma vera: catalizzatore, tick, costruzione fino in fondo. */
function buildCity(rounds = 40): City {
  const world = new VoxelWorld();
  const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
  const builder = new Builder(world, terrain, SEED);

  let state = createSimState();
  state = addCatalyst(state, {
    x: 128,
    y: 128,
    class: BUILDING_CLASS.residential,
    strength: 255,
    radius: 96,
  });

  for (let i = 0; i < rounds; i++) {
    state = tick(state, terrain);
    state = builder.onTick(state);
    while (builder.stats.growing > 0) builder.step();
  }
  while (builder.stats.surfaceQueued > 0) builder.step();

  return { world, builder, state };
}

/** I record, in ordine di id: e' l'ordine in cui `restore` li rivuole. */
function recordsOf(builder: Builder): readonly BuildingRecord[] {
  return [...builder.registry.all].sort((a, b) => a.id - b.id);
}

/**
 * I voxel scritti, in una forma confrontabile.
 *
 * Si legge il mondo per colonne dei chunk toccati invece di confrontare i buffer:
 * due `VoxelWorld` possono avere gli stessi voxel in chunk allocati in ordine
 * diverso, e un confronto di strutture direbbe che differiscono quando non e'
 * vero.
 */
function voxelDigest(world: VoxelWorld, records: readonly BuildingRecord[]): string {
  const parts: string[] = [];
  for (const record of records) {
    for (let z = record.baseZ; z < record.baseZ + record.height; z++) {
      for (let y = record.y - 1; y <= record.y + record.footprint; y++) {
        for (let x = record.x - 1; x <= record.x + record.footprint; x++) {
          const block = world.getBlock(x, y, z);
          if (block !== 0) parts.push(`${x},${y},${z}=${block}`);
        }
      }
    }
  }
  return parts.join('|');
}

describe('caricamento di un earthscraper', () => {
  /**
   * **Il salvataggio e' il modo in cui questa famiglia puo' rompersi in
   * silenzio.** Il file non contiene il terreno — si rifa' dal seme, perche' e'
   * una funzione pura — quindi al caricamento la roccia torna dov'era e il pozzo
   * si richiude sopra la struttura. Non si vedrebbe come un errore: si vedrebbe
   * come una megastruttura che sparisce, e solo una vista di sezione lo direbbe.
   *
   * Il record si scrive a mano invece di far crescere una citta': la condizione
   * che fonda un earthscraper chiede un quartiere maturo e mille tick, e qui il
   * soggetto e' `reopenPit`, non `found`.
   */
  const TERRAIN_HEIGHT = 24;
  /** Un indice di palette qualunque: allo scavo interessa solo «diverso da zero». */
  const ROCK = 3;
  const recipe = SUNKEN_COURT;
  const DEPTH = recipe.sunken!.depth;
  const BASE_Z = TERRAIN_HEIGHT - DEPTH;

  function pitRecord(): BuildingRecord {
    const span = arcologySpan(recipe, FACING.east);
    return {
      id: 1,
      x: 40,
      y: 40,
      baseZ: BASE_Z,
      footprint: span.sizeX,
      footprintY: span.sizeY,
      height: span.sizeZ,
      class: BUILDING_CLASS.civic,
      level: recipe.parts.length - 1,
      seed: 7,
      facing: FACING.east,
      arcology: recipe.kind,
      foundedNeighbours: 99,
      uses: [],
    };
  }

  /**
   * Un mondo con la roccia davvero scritta, non solo dichiarata dalla heightmap.
   *
   * `testTerrain` costruisce una `TerrainMap` — le quote — e non tocca i voxel:
   * negli altri test di questo file non importa, perche' gli edifici stanno
   * sopra il terreno e nessuno guarda cosa c'e' sotto. Per un pozzo importa
   * moltissimo: senza roccia scritta lo scavo non avrebbe niente da togliere e
   * ogni asserzione sarebbe verde per il motivo sbagliato.
   */
  function loadPit(): { world: VoxelWorld; record: BuildingRecord } {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: TERRAIN_HEIGHT });
    // La roccia deve debordare dall'impronta, che da quando la corte e'
    // multi-blocco copre 48 colonne per lato: senza il margine i controlli «fuori
    // dall'impronta» leggerebbero il vuoto invece del terreno intatto.
    for (let y = 20; y < 100; y++) {
      for (let x = 20; x < 100; x++) world.fillColumn(x, y, 0, TERRAIN_HEIGHT, ROCK);
    }

    const loaded = new Builder(world, terrain, SEED);
    const record = pitRecord();
    loaded.restore([record]);
    while (loaded.stats.surfaceQueued > 0) loaded.step();
    return { world, record };
  }

  it('riapre il pozzo: la colonna centrale torna vuota fino al cielo', () => {
    const { world, record } = loadPit();
    // Il centro dell'ingombro cade nel vuoto piu' profondo della corte.
    const cx = record.x + 24;
    const cy = record.y + 24;

    for (let z = BASE_Z + 1; z < TERRAIN_HEIGHT; z++) {
      expect(world.getBlock(cx, cy, z), `roccia rimasta a ${cx},${cy},${z}`).toBe(0);
    }
    // Il fondo resta: e' il giardino della corte, non un buco senza pavimento.
    expect(world.getBlock(cx, cy, BASE_Z)).not.toBe(0);
  });

  it('ridisegna la struttura dentro il pozzo che ha appena aperto', () => {
    // **L'ordine e' il punto.** Lo scavo cancella tutto cio' che trova
    // nell'imbuto: girato dopo `writeStamp` porterebbe via la struttura appena
    // ridisegnata, e il record resterebbe con un cratere vuoto dentro.
    const { world, record } = loadPit();
    // Il selciato della piazza, all'ultima quota sotto il piano di campagna.
    expect(world.getBlock(record.x + 1, record.y + 1, TERRAIN_HEIGHT - 1)).not.toBe(0);
  });

  it('non tocca un voxel fuori dall impronta', () => {
    // Lo scavo e' la terza eccezione a «si riempie e non si scava», e ha lo
    // stesso confine delle prime due: l'impronta della struttura, mai oltre.
    const { world, record } = loadPit();
    for (let z = BASE_Z; z < TERRAIN_HEIGHT; z++) {
      const east = record.x + record.footprint;
      expect(world.getBlock(record.x - 1, record.y + 24, z), `fuori a ovest, z=${z}`).not.toBe(0);
      expect(world.getBlock(east, record.y + 24, z), `fuori a est, z=${z}`).not.toBe(0);
    }
  });

  it('e deterministico: due caricamenti danno lo stesso mondo', () => {
    const a = loadPit();
    const b = loadPit();
    expect(voxelDigest(a.world, [a.record])).toBe(voxelDigest(b.world, [b.record]));
  });
});

describe('caricamento di una citta costruita', () => {
  it('rimette gli stessi record, con gli stessi id, in un mondo vuoto', () => {
    const built = buildCity();
    const records = recordsOf(built.builder);
    expect(records.length).toBeGreaterThan(5);

    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const loaded = new Builder(world, terrain, SEED);
    loaded.restore(records);

    expect(recordsOf(loaded)).toEqual(records);
    expect(loaded.registry.count).toBe(built.builder.registry.count);
  });

  it('ridisegna gli stessi voxel', () => {
    // E' la promessa vera del salvataggio: la citta' torna com'era, non simile.
    const built = buildCity();
    const records = recordsOf(built.builder);

    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const loaded = new Builder(world, terrain, SEED);
    loaded.restore(records);
    while (loaded.stats.surfaceQueued > 0) loaded.step();

    expect(voxelDigest(world, records)).toBe(voxelDigest(built.world, records));
  });

  it('non riassegna a cio che costruisce dopo un id gia caricato', () => {
    // `supports` cita gli id: un id riusato legherebbe una struttura nuova a un
    // appoggio che non e' il suo.
    const built = buildCity();
    const records = recordsOf(built.builder);
    const maxId = Math.max(...records.map((record) => record.id));

    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const loaded = new Builder(world, terrain, SEED);
    loaded.restore(records);

    let state = createSimState();
    state = addCatalyst(state, {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });
    for (let i = 0; i < 20; i++) {
      state = tick(state, terrain);
      state = loaded.onTick(state);
      while (loaded.stats.growing > 0) loaded.step();
    }

    const fresh = recordsOf(loaded).filter((record) => record.id > maxId);
    const known = new Set(records.map((record) => record.id));
    for (const record of fresh) expect(known.has(record.id)).toBe(false);
  });

  it('conta gli edifici caricati invece di ripartire da zero', () => {
    const built = buildCity();
    const records = recordsOf(built.builder);

    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const loaded = new Builder(world, terrain, SEED);
    loaded.restore(records);

    expect(loaded.stats.placed).toBe(records.length);
  });
});
