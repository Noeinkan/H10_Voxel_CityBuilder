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

/**
 * Le parti con la stessa pianta e contigue in quota tornano un corpo solo.
 *
 * Serve perche' un corpo non e' sempre una parte: `facadeCourses.ts` spezza una
 * shell alta in corsi — stessa pianta, quote consecutive, colori diversi — per
 * articolarne la facciata, e per la struttura quei corsi sono lo stesso corpo.
 * Sulle ricette scritte a mano non unisce niente, perche' due corpi diversi non
 * condividono mai la pianta esatta: e' un annullamento della decorazione, non
 * una regola nuova sulle forme.
 */
function mergeStacked(parts: readonly PlacedPart[]): readonly PlacedPart[] {
  const columns = new Map<string, PlacedPart[]>();
  for (const part of parts) {
    const { x0, x1, y0, y1 } = part.bounds;
    const key = `${x0},${x1},${y0},${y1}`;
    const column = columns.get(key) ?? [];
    column.push(part);
    columns.set(key, column);
  }

  const out: PlacedPart[] = [];
  for (const column of columns.values()) {
    const sorted = [...column].sort((a, b) => a.bounds.z0 - b.bounds.z0);
    let run = sorted[0];
    for (const part of sorted.slice(1)) {
      if (part.bounds.z0 <= run.bounds.z1 + 1) {
        run = { ...run, bounds: { ...run.bounds, z1: Math.max(run.bounds.z1, part.bounds.z1) } };
        continue;
      }
      out.push(run);
      run = part;
    }
    out.push(run);
  }
  return out;
}

/** Una colonna verticale continua: l'unione dei corpi sovrapposti in pianta. */
export interface SlenderColumn {
  readonly height: number;
  readonly baseMinSide: number;
  readonly slenderness: number;
}

/**
 * Le colonne verticali della ricetta, con la loro snellezza.
 *
 * Una colonna e' l'unione delle parti **verticali** — `shell` e `slab` piu' alte
 * che larghe, cioe' i corpi, non il podio ne' le travi — che si sovrappongono in
 * pianta attraverso gli stadi; la snellezza e' l'altezza totale diviso il lato
 * minore della **sezione di base**, cioe' la sezione piu' larga del gruppo. Le
 * sezioni superiori possono essere piu' strette: e' il punto della
 * rastremazione, e misurare la sezione piu' sottile (come faceva questo conto
 * prima) avrebbe condannato ogni corpo rastremato a leggersi come un palo.
 */
export function slenderColumns(recipe: ArcologyRecipe): readonly SlenderColumn[] {
  const bodies: PlacedPart[] = [];
  recipe.parts.forEach((stage, s) => {
    stage.forEach((part, index) => {
      if (part.kind !== PART.shell && part.kind !== PART.slab) return;
      bodies.push({ stage: s, index, bounds: partBounds(part) });
    });
  });

  // Il filtro «piu' alto che largo» distingue i corpi dal podio e dalle travi, e
  // va chiesto al corpo intero: i corsi di facciata hanno la stessa pianta e si
  // impilano, quindi presi uno per uno nessuno di loro e' piu' alto che largo e
  // la sezione di base sparirebbe dal gruppo — la snellezza finirebbe misurata
  // sulla sola torre che sta sopra.
  const shells = mergeStacked(bodies).filter((body) => {
    const { x0, x1, y0, y1, z0, z1 } = body.bounds;
    return z1 - z0 + 1 > Math.min(x1 - x0 + 1, y1 - y0 + 1);
  });

  return columnGroupsOf(shells);
}

/**
 * Raggruppa le parti per sovrapposizione in pianta e misura ogni colonna.
 *
 * E' il conto comune ai corpi e ai pennoni: due gruppi di parti diversi, la
 * stessa definizione di colonna e di snellezza.
 */
function columnGroupsOf(parts: readonly PlacedPart[]): readonly SlenderColumn[] {
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
      const a = parts[i].bounds;
      const b = parts[j].bounds;
      if (overlap(a.x0, a.x1, b.x0, b.x1) && overlap(a.y0, a.y1, b.y0, b.y1)) union(i, j);
    }
  }

  const groups = new Map<number, PlacedPart[]>();
  parts.forEach((part, i) => {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(part);
    groups.set(root, group);
  });

  return [...groups.values()].map((group) => {
    const z0 = Math.min(...group.map((part) => part.bounds.z0));
    const z1 = Math.max(...group.map((part) => part.bounds.z1));
    const minSides = group.map((part) => Math.min(
      part.bounds.x1 - part.bounds.x0 + 1,
      part.bounds.y1 - part.bounds.y0 + 1,
    ));
    const baseMinSide = Math.max(...minSides);
    const height = z1 - z0 + 1;
    return { height, baseMinSide, slenderness: height / baseMinSide };
  });
}

/** La snellezza peggiore della ricetta. */
export function maxSlendernessOf(recipe: ArcologyRecipe): number {
  return slenderColumns(recipe).reduce((max, column) => Math.max(max, column.slenderness), 0);
}

/**
 * Le colonne dei soli pennoni, misurate con la stessa snellezza dei corpi.
 *
 * `slenderColumns` misura `shell` e `slab`: un montante 2x2 alto ottanta quote
 * passava ogni controllo perche' la rete dei corpi non lo vede. La guglia a
 * gradoni — tre tronchi che rientrano — e' il rimedio della ricetta, e questo
 * conto e' cio' che impedisce di ripristinare il palo.
 */
export function mastColumns(recipe: ArcologyRecipe): readonly SlenderColumn[] {
  const masts: PlacedPart[] = [];
  recipe.parts.forEach((stage, s) => {
    stage.forEach((part, index) => {
      if (part.kind !== PART.mast) return;
      masts.push({ stage: s, index, bounds: partBounds(part) });
    });
  });

  const shafts = mergeStacked(masts).filter((body) => {
    const { x0, x1, y0, y1, z0, z1 } = body.bounds;
    return z1 - z0 + 1 > Math.min(x1 - x0 + 1, y1 - y0 + 1);
  });

  return columnGroupsOf(shafts);
}

/** La snellezza peggiore fra i pennoni della ricetta. */
export function maxMastSlendernessOf(recipe: ArcologyRecipe): number {
  return mastColumns(recipe).reduce((max, column) => Math.max(max, column.slenderness), 0);
}
