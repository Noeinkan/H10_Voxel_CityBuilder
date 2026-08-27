import type { CatalystId } from '../../sim';
import type { Facing } from '../streets/streetGrid';
import type { VoxelStamp } from '../buildings/stamp';
import { hashCoords } from '../rng';
import {
  LANDMARK,
  footprintOf,
  formVariantOf,
  growsFootprint,
  landmarkOf,
  maxStageOf,
  variantsOf,
  type BerthKind,
  type LandmarkFormId,
  type PartsRecipe,
} from './config';
import { createCanvas, drawPart, orientPart, orientedSpan } from './parts';

/**
 * Generatore dei landmark dei catalizzatori.
 *
 * **Non conosce il mondo.** Entrano un ruolo, uno stadio e un verso, esce uno
 * stamp: nessun `VoxelWorld`, nessuna `TerrainMap`, nessun Three.js. E' la
 * stessa regola di `buildings/generate.ts`, e serve alla stessa cosa — girare in
 * un test in ambiente `node` e permettere al Builder di rigenerare una sagoma
 * che ha scritto mille tick fa senza averla conservata.
 *
 * **Non e' la grammatica degli edifici, e non deve esserlo.**
 * `buildings/generate.ts` ricava ogni fascia da quella sotto: e' cio' che gli
 * permette di non avere un catalogo di modelli, ed e' anche cio' che gli
 * impedisce di esprimere un braccio di gru, una pista o un portico. Le due
 * convivono senza sapere l'una dell'altra e condividono solo il formato dello
 * stamp, che e' esattamente il punto di quel formato.
 *
 * **Nessun PRNG, e la varieta' arriva lo stesso.** Qui non gira nessun
 * `mulberry32`: la forma e' una funzione di `(kind, variante, stadio, verso)`, e
 * la variante e' un indice preso dal seme del record, non un flusso di numeri
 * consumato mentre si disegna. La differenza non e' di stile. Un PRNG che
 * decide fascia per fascia — la grammatica degli edifici — puo' produrre
 * sagome che nessuno ha mai visto, e per una casa e' esattamente cio' che
 * serve; per un landmark sarebbe un porto che il giocatore non riconosce come
 * porto. Un indice sceglie invece fra esemplari **scritti a mano e finiti**, e
 * chi li ha scritti ha gia' garantito che tutti dicano «porto».
 *
 * **Il tronco non varia mai.** `recipe.parts` si disegna per ogni esemplare e
 * `variant.parts` ci si aggiunge sopra: e' cosi' che la leggibilita' del ruolo
 * e' garantita per costruzione invece che per disciplina di chi compila la
 * tabella. Il seme sposta il secondo sguardo, non il primo.
 */

export interface LandmarkRequest {
  readonly kind: CatalystId;
  readonly stage: number;
  readonly facing: Facing;

  /**
   * Seme del record, da cui si sceglie l'esemplare.
   *
   * Facoltativo, e assente vale zero — cioe' il primo esemplare. Serve a chi
   * misura una ricetta senza avere un lotto sotto mano, come i test del
   * catalogo: chiedere una sagoma non deve obbligare a inventarsi una
   * posizione nel mondo.
   */
  readonly seed?: number;

  /**
   * La forma contestuale, se il luogo ne ha scelta una.
   *
   * Seleziona un'altra ricetta per lo stesso ruolo — o una variante fissata
   * della ricetta a terra — ed e' l'unica scelta di forma di questo dominio che
   * dipende dal luogo invece che dal seme.
   */
  readonly form?: LandmarkFormId;
}

/**
 * Rotazione che ogni verso applica al canonico, in radianti.
 *
 * Deriva da `orientPart` e non e' una seconda convenzione: est lascia `+x`
 * dov'e', ovest lo specchia, nord lo porta su `+y`, sud su `-y`. Sono gli stessi
 * quattro casi di quel `switch`, letti come angoli invece che come indici.
 */
const FACING_ROTATION: readonly number[] = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

/** Un punto d'ormeggio gia' portato in coordinate di mondo. */
export interface WorldMooring {
  /** Centro della colonna, non il suo spigolo: qui ci sta un mezzo, non un voxel. */
  readonly x: number;
  readonly y: number;
  /** Quota dal piano finito della struttura. */
  readonly z: number;
  readonly berth: BerthKind;
  /** Verso in cui il mezzo guarda nel mondo, in radianti. */
  readonly heading: number;
}

const NO_MOORINGS: readonly WorldMooring[] = [];

/**
 * Gli ormeggi di una struttura, portati sul verso vero e sulla sua posizione.
 *
 * L'ancora del punto passa da `orientPart` come quella del click, e per la
 * stessa ragione: e' la stessa rotazione, e riscriverla qui con un altro segno e'
 * il modo classico di far divergere le due. Ne esce un punto sul **centro** della
 * colonna, perche' quello che ci sta sopra e' un mezzo largo tre voxel e non un
 * cubo.
 */
export function landmarkMoorings(
  kind: CatalystId,
  facing: Facing,
  originX: number,
  originY: number,
  form?: LandmarkFormId,
): readonly WorldMooring[] {
  const recipe = landmarkOf(kind, form);
  if (recipe?.moorings === undefined) return NO_MOORINGS;

  const [long, short] = recipe.span;
  const turn = FACING_ROTATION[facing] ?? 0;
  return recipe.moorings.map((mooring) => {
    const spot = orientPart(
      { kind: 0, x: mooring.x, y: mooring.y, w: 1, h: 1, z: 0, height: 1, palette: 0, surface: 0 },
      facing,
      long,
      short,
    );
    return {
      x: originX + spot.x + 0.5,
      y: originY + spot.y + 0.5,
      z: mooring.z,
      berth: mooring.berth,
      heading: mooring.heading + turn,
    };
  });
}

/**
 * La colonna di mondo su cui la ricetta si aspetta che **cominci il mare**, o
 * null se non guarda l'acqua.
 *
 * E' la stessa rotazione degli ormeggi, chiesta per la colonna `waterline`
 * invece che per un punto d'ormeggio: la profondita' e l'esposizione di quella
 * colonna decidono il mestiere del porto, e `landmarkDriver` la classifica
 * appena la struttura si e' posata.
 */
export function landmarkWaterColumn(
  kind: CatalystId,
  facing: Facing,
  originX: number,
  originY: number,
  form?: LandmarkFormId,
): { x: number; y: number } | null {
  const recipe = landmarkOf(kind, form);
  if (recipe?.waterline === undefined) return null;
  const [long, short] = recipe.span;
  const spot = orientPart(
    { kind: 0, x: recipe.waterline, y: recipe.anchor[1], w: 1, h: 1, z: 0, height: 1, palette: 0, surface: 0 },
    facing,
    long,
    short,
  );
  return { x: originX + spot.x, y: originY + spot.y };
}

/**
 * Quale esemplare tocca a questo seme.
 *
 * Il sale e' obbligatorio, non ornamentale: `record.seed` e' lo stesso intero
 * che `landmarkFacing` usa per il verso di ripiego, e senza sale un modulo
 * leggerebbe i bit bassi di una sequenza gia' impegnata.
 */
export function variantIndexOf(recipe: PartsRecipe, seed: number): number {
  const count = variantsOf(recipe).length;
  return hashCoords(LANDMARK.variantSalt, seed, 0) % count;
}

/** Ingombro in pianta e in quota di una ricetta su un verso. */
export function recipeSpan(recipe: PartsRecipe, facing: Facing, stage = maxStageOf(recipe)): {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
} {
  const footprint = footprintOf(recipe, stage);
  const [long, short] = footprint.span;
  return { ...orientedSpan(facing, long, short), sizeZ: footprint.height };
}

/** Ingombro in pianta di un ruolo su un verso, o null se non ha una ricetta. */
export function landmarkSpan(kind: CatalystId, facing: Facing, form?: LandmarkFormId, stage?: number): {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
} | null {
  const recipe = landmarkOf(kind, form);
  if (recipe === null) return null;
  return recipeSpan(recipe, facing, stage);
}

/**
 * Angolo minimo dell'ingombro, data la colonna cliccata.
 *
 * La ricetta dichiara **dove cade il click** dentro il riquadro canonico, non un
 * centro: il porto vuole la banchina sotto il dito e il molo davanti, e
 * centrarlo metterebbe meta' magazzino in acqua. Qui quel punto si porta sul
 * verso vero e si sottrae, cosi' il record del registry conserva la stessa
 * convenzione degli edifici — `x, y` e' l'angolo minimo dell'impronta.
 */
export function landmarkOrigin(
  kind: CatalystId,
  facing: Facing,
  x: number,
  y: number,
  form?: LandmarkFormId,
  stage?: number,
): { x: number; y: number } | null {
  const recipe = landmarkOf(kind, form);
  if (recipe === null) return null;
  return recipeOrigin(recipe, facing, x, y, stage);
}

/** Lo stesso conto di `landmarkOrigin`, per chi la ricetta ce l'ha gia' in mano. */
export function recipeOrigin(
  recipe: PartsRecipe,
  facing: Facing,
  x: number,
  y: number,
  stage = maxStageOf(recipe),
): { x: number; y: number } {
  const footprint = footprintOf(recipe, stage);
  const [long, short] = footprint.span;
  const [ax, ay] = footprint.anchor;
  // L'ancora e' un punto, cioe' una parte di lato uno: orientarla come una
  // parte evita di riscrivere la stessa rotazione una seconda volta e con un
  // altro segno, che e' il modo classico di far divergere le due.
  const spot = orientPart(
    { kind: 0, x: ax, y: ay, w: 1, h: 1, z: 0, height: 1, palette: 0, surface: 0 },
    facing,
    long,
    short,
  );
  return { x: x - spot.x, y: y - spot.y };
}

/** Stadio che un certo numero di edifici vicini sblocca. */
export function stageForBuildings(recipe: PartsRecipe, buildings: number): number {
  let stage = 0;
  for (let i = 1; i < recipe.stages.length; i++) {
    if (buildings >= recipe.stages[i]) stage = i;
  }
  return Math.min(stage, maxStageOf(recipe));
}

/**
 * Lo stamp di un landmark a un certo stadio, o null se il ruolo non ha ricetta.
 *
 * Gli stadi sono **cumulativi**: si disegnano le parti da 0 fino a `stage`
 * incluso, dentro un riquadro che e' sempre quello finale. Ne segue che lo stadio
 * successivo copre sempre il precedente, e la cancellazione della sagoma vecchia
 * durante un avanzamento non ha niente da togliere — l'invariante che
 * `Builder.upgrade` sfrutta senza saperlo.
 */
export function generateLandmark(request: LandmarkRequest): VoxelStamp | null {
  const recipe = landmarkOf(request.kind, request.form);
  if (recipe === null) return null;
  // La forma d'acqua fissa l'esemplare: il seme sceglie fra varianti, il luogo
  // sceglie fra forme, e quando e' il luogo a decidere il seme non deve poter
  // ribaltare il mestiere del porto.
  return generateFromRecipe(recipe, { ...request, variant: formVariantOf(request.form) });
}

/** Cosa serve a disegnare una ricetta: lo stadio, il verso, l'esemplare. */
export interface RecipeRequest {
  readonly stage: number;
  readonly facing: Facing;
  readonly seed?: number;

  /**
   * Primo stadio da disegnare. Assente vale zero, cioe' la sagoma cumulativa.
   *
   * **Serve a chi accoda un avanzamento, non a chi lo misura.** Gli stadi sono
   * cumulativi, quindi la sagoma dello stadio n **contiene** quella dello stadio
   * n-1 — voxel gia' scritti, che riscrivere non cambia niente e costa. Su un
   * landmark alto venti voxel il costo non si vede; su un'arcologia alta
   * centonovantadue vuol dire riportare in coda l'intera struttura a ogni
   * stadio, e il tetto di chunk sporchi la scarterebbe in silenzio.
   *
   * Chiedere `from = stage` da' quindi il **delta**, che e' esattamente cio' che
   * manca sul mondo. Chi invece deve misurare l'ingombro finale — la maschera
   * dell'opera di terra, la finestra di cielo — lo lascia a zero, perche' li' la
   * domanda e' sulla forma intera.
   */
  readonly from?: number;

  /**
   * Esemplare scelto da chi chiama, invece che dal seme.
   *
   * Le forme d'acqua lo usano per fissare il mestiere del porto: la classe
   * dell'acqua davanti al molo decide la variante, non un tiro di seme.
   */
  readonly variant?: number;
}

/**
 * Lo stamp di una ricetta di parti a un certo stadio.
 *
 * E' il ciclo che sta sotto a `generateLandmark` e a `generateArcology`, e sta
 * qui per una ragione sola: la regola degli **stadi cumulativi** — «disegna da
 * zero fino a `stage`, dentro un riquadro che e' sempre quello finale» — e'
 * l'invariante su cui poggiano sia la cancellazione (che non ha mai niente da
 * togliere) sia l'ingombro riservato (che non puo' restare bloccato a meta').
 * Scritta due volte divergerebbe, e la divergenza si vedrebbe come una sagoma a
 * pezzi mille tick dopo il piazzamento.
 */
export function generateFromRecipe(recipe: PartsRecipe, request: RecipeRequest): VoxelStamp {
  if (growsFootprint(recipe)) return generateGrowingRecipe(recipe, request);

  const [long, short] = recipe.span;
  const { sizeX, sizeY } = orientedSpan(request.facing, long, short);
  const canvas = createCanvas(sizeX, sizeY, recipe.height);

  const stage = Math.min(Math.max(request.stage, 0), maxStageOf(recipe));
  const from = Math.min(Math.max(request.from ?? 0, 0), stage);
  const variant = variantsOf(recipe)[request.variant ?? variantIndexOf(recipe, request.seed ?? 0)];
  for (let s = from; s <= stage; s++) {
    for (const part of recipe.parts[s]) {
      drawPart(canvas, orientPart(part, request.facing, long, short));
    }
    // L'esemplare puo' dichiarare meno stadi del tronco: si distingue quasi
    // sempre in uno o due, e obbligarlo a elencare le voci vuote renderebbe una
    // variante di tre parti lunga quanto la ricetta che varia.
    for (const part of variant.parts[s] ?? []) {
      drawPart(canvas, orientPart(part, request.facing, long, short));
    }
  }

  return {
    sizeX,
    sizeY,
    sizeZ: recipe.height,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels: canvas.voxels,
    surfaces: canvas.surfaces,
    // Una ricetta di parti non ha fasce: non e' costruita da una regola che
    // sale, e la comparsa a budget scorre l'array lineare senza consultare
    // questo indice.
    bandStarts: [0, recipe.height],
  };
}

/**
 * Lo stamp di una ricetta che cresce di sedime, nel sedime dello stadio chiesto.
 *
 * **Autocontenuta per stadio, non cumulativa.** Una ricetta a sedime fisso
 * aggiunge parti dentro un riquadro che non cambia mai; qui il riquadro cambia a
 * ogni stadio, quindi `parts[stage]` descrive l'**intera** sagoma a quello stadio
 * e lo stadio nuovo sostituisce il vecchio. E' per questo che l'avanzamento
 * sventra e cancella invece di affidarsi a «il nuovo copre il vecchio»: non lo
 * copre per costruzione, lo rimpiazza.
 *
 * Il delta (`from`) non serve: chi accoda un avanzamento chiede lo stadio nuovo,
 * e le parti degli stadi precedenti non hanno un sedime su cui stare.
 */
function generateGrowingRecipe(recipe: PartsRecipe, request: RecipeRequest): VoxelStamp {
  const stage = Math.min(Math.max(request.stage, 0), maxStageOf(recipe));
  const target = footprintOf(recipe, stage);
  const [long, short] = target.span;
  const { sizeX, sizeY } = orientedSpan(request.facing, long, short);
  const canvas = createCanvas(sizeX, sizeY, target.height);
  const variant = variantsOf(recipe)[request.variant ?? variantIndexOf(recipe, request.seed ?? 0)];

  for (const part of recipe.parts[stage]) {
    drawPart(canvas, orientPart(part, request.facing, long, short));
  }
  for (const part of variant.parts[stage] ?? []) {
    drawPart(canvas, orientPart(part, request.facing, long, short));
  }

  return {
    sizeX,
    sizeY,
    sizeZ: target.height,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels: canvas.voxels,
    surfaces: canvas.surfaces,
    bandStarts: [0, target.height],
  };
}
