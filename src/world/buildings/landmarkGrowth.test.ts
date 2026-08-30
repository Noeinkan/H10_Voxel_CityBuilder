import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  addCatalyst,
  createSimState,
  tick,
  type SimState,
} from '../../sim';
import { catalystById } from '../../sim/catalysts';
import { testTerrain } from '../../sim/testTerrain';
import type { TerrainMap } from '../terrain/TerrainMap';
import { footprintOf, growsFootprint, LANDMARKS } from '../landmarks/config';
import { landmarkOrigin, landmarkSpan } from '../landmarks/generate';
import { FACING, type Facing } from '../streets/streetGrid';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';
import { recordsIn, type ClearanceBox } from './clearanceSite';
import { BUILDER } from './config';
import { ringStrips } from './landmarkDriver';

/**
 * La crescita del sedime, a livello di driver.
 *
 * **Il difetto che questa fase toglie.** Un landmark riservava l'ingombro
 * finale dal primo stadio: lo stadietto di paese sedeva gia' nel catino da
 * mondiali, e non c'era niente da far crescere. Ora lo stadio e il transito
 * dichiarano un sedime per stadio: il piazzamento riserva solo lo stadio zero,
 * e l'avanzamento allarga l'impronta sventrando cio' che il quartiere ha
 * costruito sul terreno nuovo, con l'ancora che resta ferma.
 */

const CENTRE = 128;

function flatBuilder(): { builder: Builder; terrain: TerrainMap } {
  const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 12 });
  return { builder: new Builder(new VoxelWorld(), terrain, 1337), terrain };
}

function stadiumOf(builder: Builder): BuildingRecord {
  for (const record of builder.registry.all) {
    if (record.landmark === 'stadium') return record;
  }
  throw new Error('stadio non piazzato');
}

function settle(builder: Builder): void {
  let guard = 0;
  while ((builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) && guard++ < 5000) {
    builder.step();
  }
}

/**
 * Una cella dell'anello di crescita su cui un edificio si puo' davvero posare.
 *
 * La maglia stradale riserva alcune righe e colonne, quindi non ogni cella
 * dell'anello e' edificabile: si scandiscono le strisce finche' una casa
 * materializza, e quella diventa l'edificio che lo sventramento dovra' togliere.
 */
function materializableRingCell(
  builder: Builder,
  oldBox: ClearanceBox,
  newBox: ClearanceBox,
): BuildingRecord {
  for (const strip of ringStrips(oldBox, newBox)) {
    for (let dy = 0; dy < strip.sizeY; dy++) {
      for (let dx = 0; dx < strip.sizeX; dx++) {
        const x = strip.x + dx;
        const y = strip.y + dy;
        const before = builder.registry.count;
        builder.materialize([{ x, y, class: BUILDING_CLASS.residential }]);
        if (builder.registry.count === before) continue;
        for (const record of builder.registry.at(x, y)) {
          if (record.landmark === undefined) return record;
        }
      }
    }
  }
  throw new Error('nessuna cella dell anello di crescita e edificabile');
}

/** Vero se l'impronta del record e quel riquadro condividono almeno una colonna. */
function overlapsBox(record: BuildingRecord, box: ClearanceBox): boolean {
  return record.x < box.x + box.sizeX && record.x + record.footprint > box.x &&
    record.y < box.y + box.sizeY && record.y + footprintDepth(record) > box.y;
}

/** Edifici sparsi attorno al catalizzatore, sulle celle che la maglia concede. */
function materializablePositions(builder: Builder, count: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let d = 16; d < 90 && out.length < count; d += 8) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) {
      if (out.length >= count) break;
      const x = CENTRE + dx;
      const y = CENTRE + dy;
      const before = builder.registry.count;
      builder.materialize([{ x, y, class: BUILDING_CLASS.residential }]);
      if (builder.registry.count > before) out.push({ x, y });
    }
  }
  return out;
}

/** Lo stato con il solo catalizzatore dello stadio, al centro. */
function stadiumState(): SimState {
  const definition = catalystById('stadium');
  return addCatalyst(createSimState(), {
    x: CENTRE,
    y: CENTRE,
    class: definition.class,
    kind: 'stadium',
    strength: 255,
    radius: definition.radius,
  });
}

/**
 * Lo stadio zero con attorno il quartiere che gli fara' alzare lo stadio.
 *
 * Una casa dentro l'anello che il sedime uno prendera' — quella che lo
 * sventramento dovra' togliere — e il vicinato fuori dall'impronta, che conta
 * per la soglia senza cadere sotto la crescita.
 */
function stadiumAboutToGrow(): {
  readonly builder: Builder;
  readonly terrain: TerrainMap;
  readonly newBox: ClearanceBox;
  readonly ring: BuildingRecord;
  /** I record in piedi prima dell'avanzamento, per dire dopo chi e' caduto. */
  readonly standing: Map<number, BuildingRecord>;
} {
  const { builder, terrain } = flatBuilder();
  const recipe = LANDMARKS.stadium!;

  builder.placeLandmark(CENTRE, CENTRE, 'stadium');
  settle(builder);

  const before = stadiumOf(builder);
  const facing = (before.facing ?? FACING.east) as Facing;
  const oldBox = {
    x: before.x,
    y: before.y,
    sizeX: before.footprint,
    sizeY: footprintDepth(before),
  };
  const origin1 = landmarkOrigin('stadium', facing, CENTRE, CENTRE, undefined, 1)!;
  const span1 = landmarkSpan('stadium', facing, undefined, 1)!;
  const newBox = { x: origin1.x, y: origin1.y, sizeX: span1.sizeX, sizeY: span1.sizeY };

  const ring = materializableRingCell(builder, oldBox, newBox);
  const neighbours = materializablePositions(builder, recipe.stages[1]);
  expect(neighbours).toHaveLength(recipe.stages[1]);
  const standing = new Map(
    [...builder.registry.all].map((record) => [record.id, record] as const),
  );
  expect(standing.size).toBeGreaterThanOrEqual(recipe.stages[1] + 2);

  return { builder, terrain, newBox, ring, standing };
}

describe('un landmark che cresce di sedime', () => {
  it('parte dal sedime dello stadio zero e lo allarga a ogni stadio', () => {
    const { builder, terrain } = flatBuilder();
    const definition = catalystById('stadium');
    const recipe = LANDMARKS.stadium!;
    expect(growsFootprint(recipe)).toBe(true);

    builder.placeLandmark(CENTRE, CENTRE, 'stadium');
    settle(builder);

    // Il piazzamento riserva lo stadio zero, non il catino finale.
    const stage0 = footprintOf(recipe, 0);
    const record0 = stadiumOf(builder);
    expect(record0.level).toBe(0);
    expect([record0.footprint, footprintDepth(record0)]).toEqual(stage0.span);
    expect(record0.height).toBe(stage0.height);

    // Edifici attorno al catalizzatore, fuori dall'impronta riservata: fanno
    // scattare lo stadio senza cadere dentro il terreno che crescera'.
    let state: SimState = stadiumState();
    const ring: { x: number; y: number }[] = [];
    for (let dy = -24; dy <= 24; dy += 8) {
      for (let dx = -24; dx <= 24; dx += 8) {
        if (Math.abs(dx) <= 8 && Math.abs(dy) <= 8) continue;
        ring.push({ x: CENTRE + dx, y: CENTRE + dy });
      }
    }
    builder.materialize(ring.map(({ x, y }) => ({ x, y, class: BUILDING_CLASS.residential })));
    expect(builder.registry.countWithinRadius(CENTRE, CENTRE, definition.radius))
      .toBeGreaterThanOrEqual(recipe.stages[1]);
    expect(stadiumOf(builder).level).toBe(0);

    state = tick(state, terrain);
    state = { ...state, tickCount: BUILDER.ticksPerUpgrade };
    state = builder.onTick(state);
    // Lo sventramento avanza soltanto dentro `onTick`; `step()` muove la
    // crescita e la superficie, non i cantieri. Aspettare `clearing` a colpi di
    // `step()` e' un ciclo che non puo' chiudersi, ed e' cosi' che questo file
    // teneva la suite appesa a tempo indefinito.
    let guard = 0;
    while ((builder.stats.growing > 0 || builder.stats.clearing > 0) && guard++ < 5000) {
      state = tick(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }

    const stage1 = footprintOf(recipe, 1);
    const record1 = stadiumOf(builder);
    expect(record1.level).toBe(1);
    expect([record1.footprint, footprintDepth(record1)]).toEqual(stage1.span);
    expect(record1.height).toBe(stage1.height);
  });

  it('sventra l edificio sul terreno nuovo, e la struttura resta una', () => {
    const { builder, terrain, newBox, ring, standing } = stadiumAboutToGrow();
    let state = stadiumState();

    // Lo sventramento apre un cantiere: la passata che lo miete e' quella dopo,
    // quindi si alterna tick e comparsa finche' non c'e' piu' nulla in volo.
    state = { ...state, tickCount: BUILDER.ticksPerUpgrade };
    state = builder.onTick(state);
    let guard = 0;
    while ((builder.stats.growing > 0 || builder.stats.clearing > 0) && guard++ < 5000) {
      state = tick(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }

    // L'edificio nell'anello e' caduto, e con lui soltanto cio' che stava sul
    // sedime nuovo: il vicinato fuori dall'impronta e' ancora in piedi.
    //
    // **Non si conta quanti ne cadono**, e la differenza non e' cosmetica. La
    // passata di costruzione gira nello stesso tick dell'avanzamento e prima di
    // esso: puo' posare un'altra casa proprio sul terreno che lo stadio sta per
    // prendere, e il cantiere la trova li' un istante dopo. E' il patto che la
    // crescita dichiara — la citta' non aspetta la demolizione — quindi il conto
    // dipende da cosa il quartiere stava facendo, non dal sedime. Cio' che deve
    // restare vero e' **dove** cadono.
    const fallen = [...standing.values()].filter(
      (record) => builder.registry.get(record.id) === null,
    );
    expect(fallen.map((record) => record.id)).toContain(ring.id);
    for (const record of fallen) expect(overlapsBox(record, newBox)).toBe(true);
    // E il sedime nuovo e' rimasto allo stadio: nessuno ci e' cresciuto dentro
    // mentre il cantiere sgomberava le altre strisce.
    for (const record of recordsIn(builder.registry, newBox)) {
      expect(record.landmark).toBe('stadium');
    }
    expect(stadiumOf(builder).level).toBe(1);
    expect([stadiumOf(builder).footprint, footprintDepth(stadiumOf(builder))])
      .toEqual([newBox.sizeX, newBox.sizeY]);
  });

  it('tiene prenotato il sedime nuovo finche il cantiere lavora', () => {
    const { builder, newBox } = stadiumAboutToGrow();

    builder.onTick({ ...stadiumState(), tickCount: BUILDER.ticksPerUpgrade });
    expect(builder.stats.clearing).toBeGreaterThan(0);

    // **Il cantiere apre solo dove c'e' da abbattere.** Una striscia dell'anello
    // gia' vuota non ne apre nessuno, quindi senza una prenotazione sul sedime
    // intero resterebbe edificabile per tutte le passate che servono a
    // sgomberare le altre — e l'impronta, allargandosi, si troverebbe dentro un
    // edificio che nessuno ha condannato.
    for (let dy = 0; dy < newBox.sizeY; dy++) {
      for (let dx = 0; dx < newBox.sizeX; dx++) {
        expect(builder.registry.isOccupied(newBox.x + dx, newBox.y + dy)).toBe(true);
      }
    }
  });
});
