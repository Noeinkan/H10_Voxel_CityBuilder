import type { LandmarkRecipe } from '../landmarks/config';
import { recipeOrigin, recipeSpan } from '../landmarks/generate';
import type { WaterSight } from '../sites/siteRules';
import { FACING, type Facing } from '../streets/streetGrid';
import { TERRAIN } from '../terrain/config';

/**
 * Dove una struttura si posa davvero, data la colonna cliccata e cosa il terreno
 * dice dell'acqua.
 *
 * **Puro, e sta a parte per questo.** `landmarkDriver.ts` ha il mondo in mano —
 * registry, terreno, coda di comparsa — e questa domanda non ne ha bisogno:
 * entrano una ricetta, un verso, una colonna e un avvistamento d'acqua, esce un
 * riquadro. E' anche l'unica parte del piazzamento che un test puo' interrogare
 * al voxel senza far crescere un'isola.
 */

/** Verso, ingombro e angolo minimo di una struttura. */
export interface Placement {
  readonly facing: Facing;
  readonly span: { readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number };
  /** Angolo minimo dell'ingombro, gia' portato incontro all'acqua. */
  readonly x: number;
  readonly y: number;
}

/**
 * Verso il mare, per verso della struttura. L'ordine e' quello di `FACING`.
 *
 * E' la stessa tabella di `sites/siteRules.ts`, dove la ricerca dell'acqua la
 * percorre per trovare l'asse: qui la si percorre al contrario, dall'asse allo
 * spostamento.
 */
const SEAWARD: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Il riquadro che questa ricetta occupa cliccando qui.
 *
 * **Verso, ingombro e origine escono insieme**, e non e' comodita': il cursore e
 * il click devono ottenere la stessa risposta, e finche' erano tre chiamate
 * ripetute in due posti bastava aggiungerne una quarta in uno solo per far
 * mentire «Valid position».
 */
export function placeRecipe(
  recipe: LandmarkRecipe,
  facing: Facing,
  x: number,
  y: number,
  coast: WaterSight | null,
): Placement {
  // Lo stadio zero: una struttura che cresce di sedime riserva al piazzamento
  // soltanto l'ingombro iniziale, e l'avanzamento lo allarga sventrando.
  const origin = recipeOrigin(recipe, facing, x, y, 0);
  const drift = seawardDrift(recipe, coast);
  const [dx, dy] = SEAWARD[facing] ?? SEAWARD[FACING.east];

  return {
    facing,
    span: recipeSpan(recipe, facing, 0),
    x: origin.x + dx * drift,
    y: origin.y + dy * drift,
  };
}

/**
 * Di quante colonne la struttura scorre lungo il proprio fronte per incontrare
 * l'acqua.
 *
 * **Il catalizzatore resta dove il dito l'ha messo, la banchina no.** Il vincolo
 * di sito ammette il click fino a `SITE.coastalRadius` colonne dal mare — sei, e
 * di proposito: la scelta fra la banchina e il primo terreno asciutto dietro *e'*
 * la decisione che un porto comporta — mentre la ricetta disegna il proprio
 * bacino a una distanza fissa dall'ancora. Le due cose non possono essere
 * entrambe vere, e finche' a cedere e' stata la ricetta il risultato era un
 * porto con la darsena sulla sabbia: l'opera di terra la riempiva, e
 * `planTraffic` scartava ogni ormeggio a galla. Un porto senza barche.
 *
 * Lo scarto e' quindi «quanto lontano e' il mare» meno «quanto lontano la
 * ricetta lo aspettava», e **solo in avanti**. Arretrare da una battigia a filo
 * d'acqua sembrava simmetrico e non lo era: tirava indietro anche gli ormeggi,
 * e su una costa in diagonale bastava quella colonna a lasciare la banchina di
 * sopravento all'asciutto. Chi clicca gia' sull'acqua ha gia' cio' che voleva.
 *
 * **Il tetto e' l'ancora della ricetta**, e non un numero scelto a mano: oltre
 * quello la colonna cliccata uscirebbe dall'ingombro dalla parte di terra, e
 * `catalystIn` — che a ogni avanzamento ritrova il catalizzatore *dentro* il
 * riquadro — non troverebbe piu' niente. Il monumento resterebbe allo stadio
 * zero per sempre, e nessun test lo direbbe perche' la struttura c'e'.
 */
export function seawardDrift(recipe: LandmarkRecipe, coast: WaterSight | null): number {
  if (recipe.waterline === undefined || coast === null) return 0;
  // **Sul lago il bacino si ritaglia nella terra asciutta.** La marina che scava
  // (`basinDepth`) davanti a un lago non deve appoggiarsi allo specchio: la sua
  // bocca — il bordo al largo — si porta sul pelo del lago, e gli slip restano
  // sulla riva emersa, dove lo scavo li ritaglia come canali. Lo scorrimento e'
  // percio' all'indietro (negativo), e non ha il tetto dell'ancora: la colonna
  // cliccata resta comunque dentro l'ingombro, perche' la bocca dista dall'ancora
  // meno del lato lungo.
  if (recipe.basinDepth !== undefined && coast.waterZ > TERRAIN.seaLevel) {
    const mouth = recipe.span[0] - 1 - recipe.anchor[0];
    return coast.distance - mouth;
  }
  const drift = coast.distance - (recipe.waterline - recipe.anchor[0]);
  return Math.max(0, Math.min(drift, recipe.anchor[0]));
}
