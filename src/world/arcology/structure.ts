import { PART, partBounds, type PartBounds } from '../landmarks/parts';
import type { ArcologyRecipe } from './config';

/**
 * Le due proprieta' strutturali di una ricetta che i voxel da soli non dicono.
 *
 * La finestra e il riempimento (`window.ts`) misurano lo stamp gia' disegnato;
 * qui si misurano le **parti** prima di disegnarle, che e' l'unico momento in cui
 * si puo' dire «questo box e' sospeso» o «questa colonna e' troppo snella» con un
 * nome — la ricetta, lo stadio, l'indice — invece che con un conteggio di voxel.
 */

function overlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 <= b1 && b0 <= a1;
}

/** Contatto di faccia: il massimo dell'uno vale il minimo dell'altro meno uno. */
function touch(a0: number, a1: number, b0: number, b1: number): boolean {
  return a1 + 1 === b0 || b1 + 1 === a0;
}

/**
 * Due box sono connessi se si sovrappongono su due assi e si sovrappongono o
 * sono adiacenti sul terzo. E' la definizione di «contatto di faccia»: adiacenza
 * su un asse solo — un filo, uno spigolo — non regge una parte.
 */
export function partsConnected(a: PartBounds, b: PartBounds): boolean {
  const overlaps =
    (overlap(a.x0, a.x1, b.x0, b.x1) ? 1 : 0) +
    (overlap(a.y0, a.y1, b.y0, b.y1) ? 1 : 0) +
    (overlap(a.z0, a.z1, b.z0, b.z1) ? 1 : 0);
  const contiguous = (a0: number, a1: number, b0: number, b1: number): boolean =>
    overlap(a0, a1, b0, b1) || touch(a0, a1, b0, b1);
  return overlaps >= 2 &&
    contiguous(a.x0, a.x1, b.x0, b.x1) &&
    contiguous(a.y0, a.y1, b.y0, b.y1) &&
    contiguous(a.z0, a.z1, b.z0, b.z1);
}

/** Un box che non tocca il resto della struttura. */
export interface FloatingBox {
  readonly stage: number;
  readonly index: number;
}

interface PlacedPart {
  readonly stage: number;
  readonly index: number;
  readonly bounds: PartBounds;
}

function placed(recipe: ArcologyRecipe, stage: number): readonly PlacedPart[] {
  const out: PlacedPart[] = [];
  for (let s = 0; s <= stage; s++) {
    recipe.parts[s].forEach((part, index) => {
      out.push({ stage: s, index, bounds: partBounds(part) });
    });
  }
  return out;
}

function floatingAt(parts: readonly PlacedPart[]): readonly PlacedPart[] {
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i];
    return i;
  };
  const union = (i: number, j: number): void => {
    parent[find(i)] = find(j);
  };
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (partsConnected(parts[i].bounds, parts[j].bounds)) union(i, j);
    }
  }
  // Il suolo e' la parte che nasce a quota zero: e' li' che la struttura poggia.
  const ground = parts.findIndex((part) => part.bounds.z0 === 0);
  if (ground < 0) return [];
  const root = find(ground);
  return parts.filter((part) => find(parts.indexOf(part)) !== root);
}

/**
 * I box sospesi per ogni stadio k sull'unione degli stadi 0..k.
 *
 * **Uno stadio puo' restare l'ultimo per sempre**: una citta' che si ferma a
 * settanta vicini non costruira' mai la corona, quindi il controllo va fatto a
 * ogni stadio, non solo sul finale.
 */
export function floatingBoxes(recipe: ArcologyRecipe): readonly FloatingBox[] {
  const out: FloatingBox[] = [];
  for (let stage = 0; stage < recipe.parts.length; stage++) {
    for (const part of floatingAt(placed(recipe, stage))) {
      out.push({ stage: part.stage, index: part.index });
    }
  }
  return out;
}

/** Una colonna verticale continua: l'unione delle `shell` sovrapposte in pianta. */
export interface SlenderColumn {
  readonly height: number;
  readonly minSide: number;
  readonly slenderness: number;
}

/**
 * Le colonne verticali della ricetta, con la loro snellezza.
 *
 * Una colonna e' l'unione delle parti **verticali** — `shell` e `slab` piu' alte
 * che larghe, cioe' i corpi, non il podio ne' le travi — che si sovrappongono in
 * pianta attraverso gli stadi; la snellezza e' l'altezza totale diviso il lato
 * minore della sezione piu' sottile del gruppo.
 */
export function slenderColumns(recipe: ArcologyRecipe): readonly SlenderColumn[] {
  const shells: PlacedPart[] = [];
  recipe.parts.forEach((stage, s) => {
    stage.forEach((part, index) => {
      const vertical = part.kind === PART.shell || part.kind === PART.slab;
      if (vertical && part.height > Math.min(part.w, part.h)) {
        shells.push({ stage: s, index, bounds: partBounds(part) });
      }
    });
  });

  const parent = shells.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i];
    return i;
  };
  const union = (i: number, j: number): void => {
    parent[find(i)] = find(j);
  };
  for (let i = 0; i < shells.length; i++) {
    for (let j = i + 1; j < shells.length; j++) {
      const a = shells[i].bounds;
      const b = shells[j].bounds;
      if (overlap(a.x0, a.x1, b.x0, b.x1) && overlap(a.y0, a.y1, b.y0, b.y1)) union(i, j);
    }
  }

  const groups = new Map<number, PlacedPart[]>();
  shells.forEach((shell, i) => {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(shell);
    groups.set(root, group);
  });

  return [...groups.values()].map((group) => {
    const z0 = Math.min(...group.map((shell) => shell.bounds.z0));
    const z1 = Math.max(...group.map((shell) => shell.bounds.z1));
    const widths = group.map((shell) => shell.bounds.x1 - shell.bounds.x0 + 1);
    const heights = group.map((shell) => shell.bounds.y1 - shell.bounds.y0 + 1);
    const minSide = Math.min(...widths, ...heights);
    const height = z1 - z0 + 1;
    return { height, minSide, slenderness: height / minSide };
  });
}

/** La snellezza peggiore della ricetta. */
export function maxSlendernessOf(recipe: ArcologyRecipe): number {
  return slenderColumns(recipe).reduce((max, column) => Math.max(max, column.slenderness), 0);
}
