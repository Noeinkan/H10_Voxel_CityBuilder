import { describe, expect, it } from 'vitest';
import { CATALYSTS, type CatalystId } from '../../sim';
import { PALETTE_SIZE } from '../../engine/paletteSlots';
import { FACING, type Facing } from '../streets/streetGrid';
import { solidCount, STAMP_EMPTY, type VoxelStamp } from '../buildings/stamp';
import { LANDMARKS, maxStageOf, type LandmarkRecipe } from './config';
import { generateLandmark, landmarkOrigin, landmarkSpan, stageForBuildings } from './generate';
import { partBounds } from './parts';

const RECIPES = Object.values(LANDMARKS).filter(
  (recipe): recipe is LandmarkRecipe => recipe !== undefined,
);

const ALL_FACINGS: readonly Facing[] = [FACING.east, FACING.west, FACING.north, FACING.south];

/** Indici dei voxel pieni, per confrontare due stadi come insiemi. */
function solidSet(stamp: VoxelStamp): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < stamp.voxels.length; i++) {
    if (stamp.voxels[i] !== STAMP_EMPTY) out.add(i);
  }
  return out;
}

describe('catalogo dei landmark', () => {
  it('ogni parte sta dentro l ingombro che la ricetta dichiara', () => {
    for (const recipe of RECIPES) {
      const [long, short] = recipe.span;
      for (const stage of recipe.parts) {
        for (const part of stage) {
          const bounds = partBounds(part);
          expect(bounds.x0, `${recipe.kind} x0`).toBeGreaterThanOrEqual(0);
          expect(bounds.y0, `${recipe.kind} y0`).toBeGreaterThanOrEqual(0);
          expect(bounds.z0, `${recipe.kind} z0`).toBeGreaterThanOrEqual(0);
          expect(bounds.x1, `${recipe.kind} x1`).toBeLessThan(long);
          expect(bounds.y1, `${recipe.kind} y1`).toBeLessThan(short);
          expect(bounds.z1, `${recipe.kind} z1`).toBeLessThan(recipe.height);
        }
      }
    }
  });

  it('usa solo indici di palette esistenti', () => {
    for (const recipe of RECIPES) {
      const stamp = generateLandmark({
        kind: recipe.kind,
        stage: maxStageOf(recipe),
        facing: FACING.east,
      });
      expect(stamp).not.toBeNull();
      for (const id of stamp!.voxels) expect(id).toBeLessThan(PALETTE_SIZE);
    }
  });

  it('le soglie di stadio salgono e partono da zero', () => {
    for (const recipe of RECIPES) {
      expect(recipe.stages[0], recipe.kind).toBe(0);
      expect(recipe.stages, recipe.kind).toHaveLength(recipe.parts.length);
      for (let i = 1; i < recipe.stages.length; i++) {
        expect(recipe.stages[i], recipe.kind).toBeGreaterThan(recipe.stages[i - 1]);
      }
    }
  });

  it('a parita di ruolo, stadio e verso lo stamp e identico byte per byte', () => {
    for (const recipe of RECIPES) {
      const request = { kind: recipe.kind, stage: maxStageOf(recipe), facing: FACING.north };
      const first = generateLandmark(request)!;
      const second = generateLandmark(request)!;
      expect(second.voxels).toEqual(first.voxels);
      expect(second.surfaces).toEqual(first.surfaces);
    }
  });

  it('uno stadio copre sempre quello precedente: cancellare non ha niente da togliere', () => {
    // E' l'invariante su cui poggia l'avanzamento: `Builder.upgrade` rigenera la
    // sagoma vecchia per toglierne i voxel scoperti, e qui non ce ne sono mai.
    for (const recipe of RECIPES) {
      for (let stage = 1; stage <= maxStageOf(recipe); stage++) {
        const before = solidSet(generateLandmark({ kind: recipe.kind, stage: stage - 1, facing: FACING.east })!);
        const after = solidSet(generateLandmark({ kind: recipe.kind, stage, facing: FACING.east })!);
        for (const index of before) {
          expect(after.has(index), `${recipe.kind} stadio ${stage}`).toBe(true);
        }
        expect(after.size).toBeGreaterThan(before.size);
      }
    }
  });

  it('ruotare cambia il verso e non la quantita di struttura', () => {
    for (const recipe of RECIPES) {
      const stage = maxStageOf(recipe);
      const counts = ALL_FACINGS.map(
        (facing) => solidCount(generateLandmark({ kind: recipe.kind, stage, facing })!),
      );
      for (const count of counts) expect(count, recipe.kind).toBe(counts[0]);

      const [long, short] = recipe.span;
      expect(landmarkSpan(recipe.kind, FACING.east)).toEqual({
        sizeX: long,
        sizeY: short,
        sizeZ: recipe.height,
      });
      expect(landmarkSpan(recipe.kind, FACING.north)).toEqual({
        sizeX: short,
        sizeY: long,
        sizeZ: recipe.height,
      });
    }
  });

  it('la colonna cliccata cade dentro l ingombro, su ogni verso', () => {
    for (const recipe of RECIPES) {
      for (const facing of ALL_FACINGS) {
        const origin = landmarkOrigin(recipe.kind, facing, 100, 100)!;
        const span = landmarkSpan(recipe.kind, facing)!;
        expect(100 - origin.x, `${recipe.kind} ${facing}`).toBeGreaterThanOrEqual(0);
        expect(100 - origin.y, `${recipe.kind} ${facing}`).toBeGreaterThanOrEqual(0);
        expect(100 - origin.x, `${recipe.kind} ${facing}`).toBeLessThan(span.sizeX);
        expect(100 - origin.y, `${recipe.kind} ${facing}`).toBeLessThan(span.sizeY);
      }
    }
  });

  it('ogni landmark ha una firma verticale, non e un decalcomania', () => {
    // Il ruolo si deve riconoscere dalla sagoma in isometrica, e una sagoma e'
    // fatta di altezza: una struttura alta due voxel su un'impronta larga venti
    // e' una macchia di colore, cioe' esattamente il rombo di asfalto di prima.
    for (const recipe of RECIPES) {
      const stamp = generateLandmark({
        kind: recipe.kind,
        stage: maxStageOf(recipe),
        facing: FACING.east,
      })!;

      let top = 0;
      for (let z = 0; z < stamp.sizeZ; z++) {
        for (let i = 0; i < stamp.sizeX * stamp.sizeY; i++) {
          if (stamp.voxels[i + stamp.sizeX * stamp.sizeY * z] !== STAMP_EMPTY) top = z;
        }
      }
      expect(top, recipe.kind).toBeGreaterThanOrEqual(Math.floor(recipe.height / 2));
    }
  });

  it('lo stadio segue quello che la citta ha costruito intorno', () => {
    for (const recipe of RECIPES) {
      expect(stageForBuildings(recipe, 0), recipe.kind).toBe(0);
      expect(stageForBuildings(recipe, recipe.stages[1] - 1), recipe.kind).toBe(0);
      expect(stageForBuildings(recipe, recipe.stages[1]), recipe.kind).toBe(1);
      // Oltre l'ultima soglia non si sale piu': il tetto e' la ricetta.
      expect(stageForBuildings(recipe, 100_000), recipe.kind).toBe(maxStageOf(recipe));
    }
  });

  it('tutti e otto i ruoli hanno una struttura propria', () => {
    expect(RECIPES).toHaveLength(CATALYSTS.length);
    for (const definition of CATALYSTS) {
      expect(LANDMARKS[definition.id], definition.id).toBeDefined();
    }
  });

  it('ogni ruolo si distingue dagli altri per sagoma, non solo per colore', () => {
    // Il difetto da cui e' nata questa fase: otto ruoli con lo stesso rombo di
    // asfalto e un voxel d'accento diverso. Ingombro e altezza insieme sono la
    // firma piu' grossolana possibile, e devono gia' bastare a separarli.
    const signatures = new Set<string>();
    for (const recipe of RECIPES) {
      const stamp = generateLandmark({
        kind: recipe.kind,
        stage: maxStageOf(recipe),
        facing: FACING.east,
      })!;
      signatures.add(`${stamp.sizeX}x${stamp.sizeY}x${stamp.sizeZ}:${solidCount(stamp)}`);
    }
    expect(signatures.size).toBe(RECIPES.length);
  });

  it('un ruolo senza ricetta non produce uno stamp invece di produrne uno vuoto', () => {
    // Il ripiego deve restare riconoscibile dal chiamante anche ora che il
    // catalogo e' completo: un landmark assente e un landmark di zero voxel sono
    // due cose diverse, e confonderle riserverebbe un'impronta nel registry per
    // una struttura che non c'e'. Vale per il ruolo che un giorno verra'
    // aggiunto a `CATALYSTS` prima che qualcuno gli disegni una forma.
    const unknown = 'observatory' as CatalystId;
    expect(generateLandmark({ kind: unknown, stage: 0, facing: FACING.east })).toBeNull();
    expect(landmarkSpan(unknown, FACING.east)).toBeNull();
    expect(landmarkOrigin(unknown, FACING.east, 0, 0)).toBeNull();
  });
});
