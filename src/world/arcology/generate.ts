import type { BuildingClass } from '../../sim';
import { generateFromRecipe, recipeOrigin, recipeSpan } from '../landmarks/generate';
import { orientPart } from '../landmarks/parts';
import type { Facing } from '../streets/streetGrid';
import type { VoxelStamp } from '../buildings/stamp';
import type { ArcologyRecipe } from './config';

/**
 * Il generatore delle arcologie.
 *
 * **Non conosce il mondo**, come `landmarks/generate.ts` e per la stessa
 * ragione: entrano una ricetta, uno stadio e un verso, esce uno stamp. Nessun
 * `VoxelWorld`, nessuna `TerrainMap`, nessun Three.js — cosi' gira in un test in
 * ambiente `node` e il driver puo' rigenerare a mille tick di distanza una
 * sagoma che non ha conservato.
 *
 * **Quasi tutto e' `generateFromRecipe`, e il "quasi" e' il punto di questo
 * file.** Il disegno e' quello dei landmark, invariato: stessa grammatica di
 * parti, stessi stadi cumulativi, stessa rotazione. Cio' che un'arcologia ha in
 * piu' non sono voxel, sono **due tabelle di posti** — dove stanno gli usi e
 * dove attracca la rete in quota — che vanno portate in coordinate di mondo con
 * la stessa rotazione delle parti. Farlo qui, con `orientPart`, e non con un
 * secondo conto scritto a mano, e' cio' che impedisce a una fascia di finire in
 * un punto diverso dai voxel che dovrebbe abitare su tre versi su quattro.
 */

/** Ingombro in pianta e in quota di un'arcologia su un verso. */
export function arcologySpan(recipe: ArcologyRecipe, facing: Facing): {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
} {
  return recipeSpan(recipe, facing);
}

/** Angolo minimo dell'ingombro, data la colonna che la condizione ha scelto. */
export function arcologyOrigin(
  recipe: ArcologyRecipe,
  facing: Facing,
  x: number,
  y: number,
): { x: number; y: number } {
  return recipeOrigin(recipe, facing, x, y);
}

/**
 * Lo stamp di un'arcologia.
 *
 * `from` e' cio' che distingue il piazzamento dall'avanzamento: senza, la
 * sagoma e' cumulativa e riscrive tutto il gia' scritto; con `from = stage` e'
 * il solo delta di quello stadio. Vedi `RecipeRequest.from`.
 */
export function generateArcology(recipe: ArcologyRecipe, request: {
  readonly stage: number;
  readonly facing: Facing;
  readonly seed?: number;
  readonly from?: number;
}): VoxelStamp {
  return generateFromRecipe(recipe, request);
}

/** Un uso dell'arcologia, gia' portato sulla colonna di mondo che lo ospita. */
export interface WorldBand {
  readonly stage: number;
  readonly use: BuildingClass;
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

/**
 * Gli usi di un'arcologia, sulle colonne vere.
 *
 * La rotazione passa da `orientPart` come quella dell'ancora, e per la stessa
 * ragione: e' la stessa trasformazione, e riscriverla qui con un altro segno e'
 * il modo classico di far divergere le due. Una fascia e' un punto, cioe' una
 * parte di lato uno.
 */
export function worldBands(
  recipe: ArcologyRecipe,
  facing: Facing,
  originX: number,
  originY: number,
): readonly WorldBand[] {
  const [long, short] = recipe.span;
  return recipe.bands.map((band) => {
    const spot = orientPart(
      { kind: 0, x: band.x, y: band.y, w: 1, h: 1, z: 0, height: 1, palette: 0, surface: 0 },
      facing,
      long,
      short,
    );
    return {
      stage: band.stage,
      use: band.use,
      x: originX + spot.x,
      y: originY + spot.y,
      label: band.label,
    };
  });
}

/** Un piazzale dell'arcologia, gia' portato sul riquadro di mondo. */
export interface WorldLanding {
  readonly stage: number;
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /** Prima quota libera sopra il piano, dal piano finito della struttura. */
  readonly z: number;
}

/** Gli attracchi della rete in quota, sui riquadri veri. */
export function worldLandings(
  recipe: ArcologyRecipe,
  facing: Facing,
  originX: number,
  originY: number,
): readonly WorldLanding[] {
  const [long, short] = recipe.span;
  return recipe.landings.map((landing) => {
    const rect = orientPart(
      {
        kind: 0,
        x: landing.x,
        y: landing.y,
        w: landing.w,
        h: landing.h,
        z: 0,
        height: 1,
        palette: 0,
        surface: 0,
      },
      facing,
      long,
      short,
    );
    return {
      stage: landing.stage,
      x: originX + rect.x,
      y: originY + rect.y,
      sizeX: rect.w,
      sizeY: rect.h,
      z: landing.z,
    };
  });
}
