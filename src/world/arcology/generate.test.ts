import { describe, expect, it } from 'vitest';
import { AERIAL } from '../aerial/config';
import {
  BUILDER,
  DEFAULT_BUILDING_FORM,
  LEVEL_CAPS,
  MAX_FOOTPRINT,
  TYPOLOGIES,
} from '../buildings/config';
import { dirtyChunkCount } from '../buildings/chunkBudget';
import { generateBuilding } from '../buildings/generate';
import { solidCount, trimStampZ, type VoxelStamp } from '../buildings/stamp';
import { typologyProfile } from '../buildings/typology';
import { maxStageOf } from '../landmarks/config';
import { FACING, type Facing } from '../streets/streetGrid';
import { ARCOLOGY, ARCOLOGY_RECIPES, type ArcologyRecipe } from './config';
import { arcologySpan, generateArcology, worldBands, worldLandings } from './generate';
import { fillRatio, skyWindowOf } from './window';

const FACINGS: readonly Facing[] = [FACING.east, FACING.west, FACING.north, FACING.south];

function finalStamp(recipe: ArcologyRecipe, facing: Facing = FACING.east): VoxelStamp {
  return generateArcology(recipe, { stage: maxStageOf(recipe), facing });
}

describe('il catalogo delle arcologie', () => {
  it('dichiara un ingombro che sta in un isolato e non chiede ritagli in pianta', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const [long, short] = recipe.span;
      // Sotto ci sono gli isolati stretti, che misurano quattordici colonne;
      // sopra c'e' il lato del segmento, oltre il quale la comparsa si spezza
      // anche in pianta. Fra i due c'e' un numero solo che vada bene per
      // entrambi, ed e' quello che le ricette usano.
      expect(long).toBeLessThanOrEqual(BUILDER.segmentSide);
      expect(short).toBeLessThanOrEqual(BUILDER.segmentSide);
      expect(Math.min(long, short)).toBeGreaterThan(MAX_FOOTPRINT);
    }
  });

  it('scavalca il vuoto: ogni ricetta ha una finestra di cielo', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const window = skyWindowOf(finalStamp(recipe), ARCOLOGY.window);

      expect(window, `${recipe.kind} non scavalca nessun vuoto`).not.toBeNull();
      expect(window!.z1 - window!.z0 + 1).toBeGreaterThanOrEqual(ARCOLOGY.window.minHeight);
      expect(window!.sizeX * window!.sizeY).toBeGreaterThanOrEqual(ARCOLOGY.window.minColumns);
    }
  });

  it('non riempie il proprio ingombro', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      expect(fillRatio(finalStamp(recipe)), recipe.kind).toBeLessThanOrEqual(ARCOLOGY.maxFill);
    }
  });

  it('una volta aperta, la finestra non si richiude piu a nessuno stadio', () => {
    // Gli stadi **aggiungono**, quindi uno stadio successivo puo' benissimo
    // tappare il vuoto che quello prima aveva aperto: e' il modo piu' facile di
    // perdere il tratto distintivo senza che nessuno se ne accorga, perche' la
    // sagoma finale continuerebbe ad averne un'altra da qualche altra parte.
    for (const recipe of ARCOLOGY_RECIPES) {
      let opened = false;
      for (let stage = 0; stage <= maxStageOf(recipe); stage++) {
        const stamp = generateArcology(recipe, { stage, facing: FACING.east });
        const window = skyWindowOf(stamp, ARCOLOGY.window);
        if (window !== null) opened = true;
        else expect(opened, `${recipe.kind} richiude la finestra allo stadio ${stage}`).toBe(false);
      }
      expect(opened, `${recipe.kind} non apre mai una finestra`).toBe(true);
    }
  });

  it('e il vertice della gerarchia: supera la torre piu alta che il catalogo sappia fare', () => {
    // La torre di punta: livello massimo, impronta massima, e **ogni** tipologia
    // del catalogo, perche' a dare le fasce piu' alte e' il profilo e non l'uso.
    // Se un edificio normale la raggiungesse, l'arcologia non sarebbe il vertice
    // di niente — sarebbe un'altra torre.
    let tallest = 0;
    for (const typology of TYPOLOGIES) {
      for (let seed = 1; seed <= 8; seed++) {
        const stamp = generateBuilding({
          class: typology.use,
          level: BUILDER.maxLevel,
          seed,
          footprintCap: MAX_FOOTPRINT,
          footprintFloor: MAX_FOOTPRINT,
          form: DEFAULT_BUILDING_FORM,
          profile: typologyProfile(typology),
          shape: typology.shape,
        });
        tallest = Math.max(tallest, stamp.sizeZ);
      }
    }

    expect(tallest).toBeGreaterThan(0);
    expect(LEVEL_CAPS.length).toBeGreaterThan(BUILDER.maxLevel);
    for (const recipe of ARCOLOGY_RECIPES) {
      expect(recipe.height, `${recipe.kind} non supera ${tallest}`).toBeGreaterThan(tallest);
    }
  });
});

describe('generateArcology', () => {
  it('e deterministico e cumulativo: lo stadio nuovo copre il vecchio', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const top = maxStageOf(recipe);
      let previous = generateArcology(recipe, { stage: 0, facing: FACING.east, seed: 7 });

      expect(previous.voxels).toEqual(
        generateArcology(recipe, { stage: 0, facing: FACING.east, seed: 7 }).voxels,
      );

      for (let stage = 1; stage <= top; stage++) {
        const next = generateArcology(recipe, { stage, facing: FACING.east, seed: 7 });
        for (let i = 0; i < previous.voxels.length; i++) {
          if (previous.voxels[i] === 0) continue;
          expect(next.voxels[i], `stadio ${stage}, cella ${i}`).not.toBe(0);
        }
        previous = next;
      }
    }
  });

  it('il delta di uno stadio non riscrive quello di prima, e insieme fanno il cumulativo', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      for (let stage = 1; stage <= maxStageOf(recipe); stage++) {
        const cumulative = generateArcology(recipe, { stage, facing: FACING.east, seed: 3 });
        const before = generateArcology(recipe, { stage: stage - 1, facing: FACING.east, seed: 3 });
        const delta = generateArcology(recipe, {
          stage,
          from: stage,
          facing: FACING.east,
          seed: 3,
        });

        for (let i = 0; i < cumulative.voxels.length; i++) {
          const union = delta.voxels[i] !== 0 ? delta.voxels[i] : before.voxels[i];
          expect(union, `stadio ${stage}, cella ${i}`).toBe(cumulative.voxels[i]);
        }
      }
    }
  });

  it('e invariante per rotazione: lo stesso conto di voxel su tutti e quattro i versi', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const counts = FACINGS.map((facing) => solidCount(finalStamp(recipe, facing)));
      for (const count of counts) expect(count).toBe(counts[0]);
    }
  });

  it('nessun ritaglio di nessuno stadio sfora il tetto di chunk sporchi', () => {
    // E' il difetto che si ripresenta a ogni cambio di scala: sforare non e' un
    // errore, e' uno scarto silenzioso. Con un inviluppo di quasi duecento
    // quote, misurarlo sulla sagoma **cumulativa** direbbe di no a ogni
    // avanzamento: e' il conto qui sotto a dire perche' il delta esiste.
    for (const recipe of ARCOLOGY_RECIPES) {
      for (const facing of FACINGS) {
        for (let stage = 0; stage <= maxStageOf(recipe); stage++) {
          const raw = generateArcology(recipe, {
            stage,
            from: stage === 0 ? 0 : stage,
            facing,
            seed: 11,
          });
          const { z0, stamp } = trimStampZ(raw);
          const count = dirtyChunkCount(
            0, 0, stamp.sizeX, z0, z0 + stamp.sizeZ, stamp.sizeY,
          );
          expect(count, `${recipe.kind} stadio ${stage}`)
            .toBeLessThanOrEqual(BUILDER.maxDirtyChunksPerBuilding);
        }
      }
    }
  });
});

describe('le fasce e i piazzali', () => {
  it('ogni fascia ha una colonna sua, dentro l ingombro e su ogni verso', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      for (const facing of FACINGS) {
        const span = arcologySpan(recipe, facing);
        const bands = worldBands(recipe, facing, 0, 0);
        const seen = new Set<string>();

        expect(bands.length).toBe(recipe.bands.length);
        for (const band of bands) {
          expect(band.x).toBeGreaterThanOrEqual(0);
          expect(band.y).toBeGreaterThanOrEqual(0);
          expect(band.x).toBeLessThan(span.sizeX);
          expect(band.y).toBeLessThan(span.sizeY);
          seen.add(`${band.x},${band.y}`);
        }
        // Distinte, o `addBuilding` ne rifiuterebbe una: la simulazione tiene
        // un edificio per cella, ed e' proprio quella regola a permettere di
        // contare quattro usi senza insegnarle la verticale.
        expect(seen.size).toBe(bands.length);
      }
    }
  });

  it('ogni uso della ricetta compare in uno stadio che esiste', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const uses = new Set(recipe.bands.map((band) => band.use));
      expect(uses.size).toBe(recipe.bands.length);
      for (const band of recipe.bands) {
        expect(band.stage).toBeGreaterThanOrEqual(0);
        expect(band.stage).toBeLessThanOrEqual(maxStageOf(recipe));
        expect(band.z).toBeLessThan(recipe.height);
      }
    }
  });

  it('ogni piazzale tocca il filo dell inviluppo, o la rete non ci arriverebbe', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      for (const facing of FACINGS) {
        const span = arcologySpan(recipe, facing);
        const landings = worldLandings(recipe, facing, 0, 0);

        expect(landings.length).toBeGreaterThan(0);
        for (const landing of landings) {
          const onEdge = landing.x === 0 || landing.y === 0 ||
            landing.x + landing.sizeX === span.sizeX ||
            landing.y + landing.sizeY === span.sizeY;
          expect(onEdge, `${recipe.kind} su verso ${facing}`).toBe(true);
          expect(landing.z).toBeGreaterThan(0);
          expect(landing.z).toBeLessThan(recipe.height);
        }
      }
    }
  });

  it('almeno un piazzale sta a una quota che la rete in quota sa raggiungere', () => {
    // Un percorso assorbe al massimo `maxNodes * stepPerNode` di dislivello, e
    // il capo piu' basso che gli si offre e' una mensola del centro. Con il solo
    // piazzale del mezzanino — settanta voxel sopra il piano finito — nessun
    // percorso ci attraccava **mai**: la struttura c'era, si raggiungeva solo
    // dalla propria scala interna, e la casella «innestarla nella rete» era
    // falsa nei fatti mentre tutto il resto della suite era verde.
    const reach = AERIAL.route.maxNodes * AERIAL.route.stepPerNode;
    for (const recipe of ARCOLOGY_RECIPES) {
      const lowest = Math.min(...recipe.landings.map((landing) => landing.z));
      expect(lowest, `${recipe.kind} attracca solo troppo in alto`).toBeLessThanOrEqual(reach);
    }
  });

  it('il piano di un piazzale e davvero costruito allo stadio che lo apre', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      for (const landing of recipe.landings) {
        const stamp = generateArcology(recipe, { stage: landing.stage, facing: FACING.east });
        // Sotto la prima quota libera c'e' il piano su cui si cammina: se non
        // fosse pieno, il piazzale sarebbe un riquadro appeso al niente.
        for (let dy = 0; dy < landing.h; dy++) {
          for (let dx = 0; dx < landing.w; dx++) {
            const index = (landing.x + dx) +
              stamp.sizeX * ((landing.y + dy) + stamp.sizeY * (landing.z - 1));
            expect(stamp.voxels[index], `${recipe.kind} piazzale ${dx},${dy}`).not.toBe(0);
          }
        }
      }
    }
  });
});
