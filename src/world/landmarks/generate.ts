import type { CatalystId } from '../../sim';
import type { Facing } from '../streets/streetGrid';
import type { VoxelStamp } from '../buildings/stamp';
import { hashCoords } from '../rng';
import { LANDMARK, landmarkOf, maxStageOf, variantsOf, type LandmarkRecipe } from './config';
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
}

/**
 * Quale esemplare tocca a questo seme.
 *
 * Il sale e' obbligatorio, non ornamentale: `record.seed` e' lo stesso intero
 * che `landmarkFacing` usa per il verso di ripiego, e senza sale un modulo
 * leggerebbe i bit bassi di una sequenza gia' impegnata.
 */
export function variantIndexOf(recipe: LandmarkRecipe, seed: number): number {
  const count = variantsOf(recipe).length;
  return hashCoords(LANDMARK.variantSalt, seed, 0) % count;
}

/** Ingombro in pianta di un ruolo su un verso, o null se non ha una ricetta. */
export function landmarkSpan(kind: CatalystId, facing: Facing): {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
} | null {
  const recipe = landmarkOf(kind);
  if (recipe === null) return null;
  const [long, short] = recipe.span;
  return { ...orientedSpan(facing, long, short), sizeZ: recipe.height };
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
export function landmarkOrigin(kind: CatalystId, facing: Facing, x: number, y: number): {
  x: number;
  y: number;
} | null {
  const recipe = landmarkOf(kind);
  if (recipe === null) return null;

  const [long, short] = recipe.span;
  const [ax, ay] = recipe.anchor;
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
export function stageForBuildings(recipe: LandmarkRecipe, buildings: number): number {
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
  const recipe = landmarkOf(request.kind);
  if (recipe === null) return null;

  const [long, short] = recipe.span;
  const { sizeX, sizeY } = orientedSpan(request.facing, long, short);
  const canvas = createCanvas(sizeX, sizeY, recipe.height);

  const stage = Math.min(Math.max(request.stage, 0), maxStageOf(recipe));
  const variant = variantsOf(recipe)[variantIndexOf(recipe, request.seed ?? 0)];
  for (let s = 0; s <= stage; s++) {
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
    // Un landmark non ha fasce: non e' costruito da una regola che sale, e la
    // comparsa a budget scorre l'array lineare senza consultare questo indice.
    bandStarts: [0, recipe.height],
  };
}
