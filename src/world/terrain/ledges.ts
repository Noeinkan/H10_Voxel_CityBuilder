import { unitAt } from '../rng';
import type { VoxelWorld } from '../VoxelWorld';
import { CELL_STEPS } from './cellGrid';
import { LEDGE, TERRAIN } from './config';
import { rockBandAt, rockSubsoil, rockSurface } from './rockTone';

/**
 * Sporgenze di roccia: una lastra che esce dal ciglio e resta sospesa.
 *
 * **E' la prima cosa del terreno che non e' una colonna.** Tutta l'isola e' una
 * quota per `(x, y)` — e' cio' che rende la `TerrainMap` una mappa 2D, e cio'
 * che permette al picking di scendere per fette invece di attraversare voxel —
 * mentre una sporgenza ha aria sotto di se'. Vive percio' fuori dalla mappa,
 * esattamente come ci vive un albero: nel mondo voxel, e nel blocco come record.
 * Nessuno la interroga per sapere quanto e' alto il terreno, ed e' giusto cosi':
 * non ci si costruisce sopra, ci si passa sotto.
 *
 * **La forma dice perche' sta su.** Il filare attaccato alla parete e' spesso
 * quanto la lastra, quello esterno un voxel di meno: la sezione e' un cuneo, non
 * una mensola a sbalzo costante, ed e' la stessa lettura che ha una cengia vera —
 * si assottiglia allontanandosi da cio' che la regge.
 */

/** Campi per record: colonna d'angolo dell'ancora, verso, quota. */
export const LEDGE_RECORD_SIZE = 4;

/**
 * Salto minimo che un ciglio deve avere per portarne una.
 *
 * Dedotto e non dichiarato: e' esattamente la somma delle tre cose che devono
 * starci sotto e sopra — l'aria, la lastra e la cella di parete che le resta in
 * testa. Un numero a parte in `config.ts` potrebbe raccontare una storia diversa
 * dalla regola che poi decide davvero, e sarebbe l'unica differenza che nessun
 * test noterebbe.
 */
export const LEDGE_MIN_DROP = LEDGE.clearance + LEDGE.thickness + TERRAIN.cellSize;

export interface LedgeSpec {
  /** Colonna d'angolo della cella che fa da ancora: la lastra le sta accanto. */
  readonly x: number;
  readonly y: number;
  /** Indice in `CELL_STEPS` del verso in cui il terreno scende. */
  readonly dir: number;
  /** Quota del primo voxel della lastra. */
  readonly baseZ: number;
}

/**
 * La sporgenza di una cella, o `null` se il ciglio non la regge.
 *
 * `floorZ` e' cio' che sta sotto dal lato del vuoto — il terreno, oppure il pelo
 * dell'acqua se e' piu' alto. Misurare l'aria da li' e non dal fondo e' quello
 * che tiene le lastre fuori dall'acqua: una cengia che spunta a meta' di uno
 * specchio si legge come un errore, e sostituirebbe voxel d'acqua gia' scritti.
 */
export function ledgeAt(
  seed: number,
  cellX: number,
  cellY: number,
  rimZ: number,
  floorZ: number,
  dir: number,
): LedgeSpec | null {
  if (dir < 0) return null;

  const baseZ = floorZ + LEDGE.clearance;
  // Sopra la lastra deve restare parete: senza, la sporgenza sarebbe il ciglio
  // stesso spostato di una cella, cioe' un errore di quantizzazione.
  if (baseZ + LEDGE.thickness > rimZ - TERRAIN.cellSize) return null;
  if (unitAt(seed ^ LEDGE.salt, cellX, cellY) >= LEDGE.density) return null;

  return { x: cellX * TERRAIN.cellSize, y: cellY * TERRAIN.cellSize, dir, baseZ };
}

/** Quota esclusiva massima toccata da una lastra: serve ad allocare i chunk. */
export function ledgeTop(baseZ: number): number {
  return baseZ + LEDGE.thickness;
}

/**
 * true se la lastra tocca il rettangolo, foss'anche per una colonna.
 *
 * Serve a chi raccoglie i record, non a chi li scrive: una lastra ancorata al
 * margine puo' cadere **tutta** fuori dal blocco, e tenerne il record vorrebbe
 * dire allocare chunk per voxel che quel blocco non scrivera' mai — il difetto
 * che `IslandGenerator.test.ts` chiama "chunk verticali che resterebbero vuoti".
 */
export function ledgeTouches(
  spec: LedgeSpec,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const [dx, dy] = CELL_STEPS[spec.dir];
  const nearX = dx > 0 ? spec.x + TERRAIN.cellSize : dx < 0 ? spec.x - 1 : spec.x;
  const nearY = dy > 0 ? spec.y + TERRAIN.cellSize : dy < 0 ? spec.y - 1 : spec.y;
  const farX = nearX + dx * (TERRAIN.cellSize - 1) + (dx === 0 ? TERRAIN.cellSize - 1 : 0);
  const farY = nearY + dy * (TERRAIN.cellSize - 1) + (dy === 0 ? TERRAIN.cellSize - 1 : 0);

  return Math.min(nearX, farX) < maxX && Math.max(nearX, farX) >= minX
    && Math.min(nearY, farY) < maxY && Math.max(nearY, farY) >= minY;
}

/** Ricompone lo spec dai campi serializzati nel record. */
export function ledgeSpec(x: number, y: number, dir: number, baseZ: number): LedgeSpec {
  return { x, y, dir, baseZ };
}

/** Scrive la porzione della lastra che cade nel rettangolo del blocco. */
export function writeLedge(
  world: VoxelWorld,
  spec: LedgeSpec,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  const [dx, dy] = CELL_STEPS[spec.dir];
  // Una sporgenza e' roccia comunque sia il bioma che le sta sopra: e' la
  // **sezione** del gradone, non la sua superficie, e sotto il primo cubo di
  // prato l'isola e' roccia dappertutto. Lo strato e' quello della quota a cui
  // la lastra e' appesa: una cengia affiora dalla parete che la regge, e prende
  // il grigio di quella.
  const band = rockBandAt(spec.baseZ);
  const surface = rockSurface(band);
  const subsoil = rockSubsoil(band);
  let written = 0;

  // Colonna della lastra piu' vicina alla parete, sull'asse del salto: e' la
  // prima fuori dall'ancora se il terreno scende in avanti, l'ultima prima di
  // essa se scende all'indietro.
  const nearX = dx > 0 ? spec.x + TERRAIN.cellSize : dx < 0 ? spec.x - 1 : spec.x;
  const nearY = dy > 0 ? spec.y + TERRAIN.cellSize : dy < 0 ? spec.y - 1 : spec.y;

  for (let out = 0; out < TERRAIN.cellSize; out++) {
    // Il filare esterno e' un voxel piu' sottile: e' il cuneo che racconta lo
    // sbalzo, e costa un confronto.
    const thickness = LEDGE.thickness - (out > 0 ? 1 : 0);
    if (thickness <= 0) continue;

    for (let along = 0; along < TERRAIN.cellSize; along++) {
      const x = nearX + dx * out + (dx === 0 ? along : 0);
      const y = nearY + dy * out + (dy === 0 ? along : 0);
      if (x < minX || x >= maxX || y < minY || y >= maxY) continue;

      for (let k = 0; k < thickness; k++) {
        world.setBlock(x, y, spec.baseZ + k, k === thickness - 1 ? surface : subsoil);
        written++;
      }
    }
  }

  return written;
}
