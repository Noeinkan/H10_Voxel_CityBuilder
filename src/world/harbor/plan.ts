import type { BuildingClass, CatalystId } from '../../sim';
import type { LandmarkFormId } from '../landmarks/config';
import { landmarkOf } from '../landmarks/config';
import { orientPart, orientedSpan } from '../landmarks/parts';
import type { Facing } from '../streets/streetGrid';
import { isDryLand } from '../grading/grade';
import { GRADING } from '../grading/config';
import { hashCoords } from '../rng';
import { HARBOR, HARBOR_ROLES, type HarborRoleConfig } from './config';

/**
 * Dove il distretto costiero di un landmark scava, riempie, cammina e costruisce.
 *
 * **Puro, e sta a parte per questo.** Entrano una ricetta, uno stadio, un
 * verso, un seme e un terreno ridotto a tre domande — dove esiste, quanto e'
 * alto, che bioma porta — escono pezzi di scavo, sponde, colmate, colonne di
 * passeggiata e slot di settore. Nessun mondo, nessuna coda: e' la meta'
 * verificabile del distretto, come `landmarkSiting.ts` lo e' del piazzamento.
 *
 * **Il piano e' il delta di uno stadio.** Le opere compaiono quando lo stadio
 * le sblocca e con la loro geometria finale — un canale arriva intero, un
 * frangiflutti intero — mentre cio' che cresce con l'anello (l'insenatura, la
 * passeggiata) copre soltanto la fascia che lo stadio aggiunge. Chi applica i
 * piani in ordine ottiene il distretto cumulativo senza scrivere due volte
 * la stessa colonna.
 *
 * **Le coordinate canoniche sono quelle della ricetta**: fronte a est, acqua
 * oltre `x = long`, terra dietro `x = 0`. La rotazione sul verso vero e'
 * `orientPart`, la stessa che le ricette usano per i propri pezzi — riscriverla
 * qui con un altro segno e' il modo classico di far divergere le due.
 */

/** Il terreno ridotto a cio' che il piano deve sapere. `TerrainMap` lo soddisfa. */
export interface HarborProbe {
  readonly has: (x: number, y: number) => boolean;
  readonly heightAt: (x: number, y: number) => number;
  readonly biomeAt: (x: number, y: number) => number;
}

export interface HarborQuery {
  readonly kind: CatalystId;
  readonly form?: LandmarkFormId;
  readonly facing: Facing;
  /** Angolo minimo dell'ingombro del landmark nel mondo. */
  readonly x: number;
  readonly y: number;
  /** Stadio appena raggiunto dal landmark: il piano e' il delta di questo stadio. */
  readonly stage: number;
  /** Pelo dello specchio che il landmark fronteggia, conservato nel record. */
  readonly waterZ: number;
  readonly seed: number;
}

/** Un ritaglio di scavo: acqua e cancellazione di terra, fino al fondo. */
export interface HarborDig {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Quota del fondo scavato: il pelo meno la profondita' dichiarata. */
  readonly floor: number;
}

/** Una sponda in muratura: la riva costruita di un canale, dal fondo al pelo. */
export interface HarborWall {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly floor: number;
}

/** Una colmata: molo di terra guadagnata o frangiflutti di pietra. */
export interface HarborFill {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Quota della cima della colmata: piano del molo o cresta del frangiflutti. */
  readonly padZ: number;
  readonly kind: 'mole' | 'breakwater';
}

/** Uno slot di settore: la colonna dove il distretto vuole un edificio suo. */
export interface SectorSite {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
}

export interface HarborPlan {
  readonly digs: readonly HarborDig[];
  readonly walls: readonly HarborWall[];
  readonly fills: readonly HarborFill[];
  /** Colonne di passeggiata da dipingere: la fascia d'anello che lo stadio aggiunge. */
  readonly promenade: readonly { x: number; y: number }[];
  /** Slot di settore sbloccati da questo stadio. */
  readonly sites: readonly SectorSite[];
}

interface MutablePlan {
  digs: HarborDig[];
  walls: HarborWall[];
  fills: HarborFill[];
  promenade: { x: number; y: number }[];
  sites: SectorSite[];
}

const EMPTY: HarborPlan = { digs: [], walls: [], fills: [], promenade: [], sites: [] };

export function planHarborDistrict(query: HarborQuery, probe: HarborProbe): HarborPlan {
  const role = HARBOR_ROLES[query.kind];
  const recipe = landmarkOf(query.kind, query.form);
  if (role === undefined || recipe === null || query.stage <= 0) return EMPTY;
  if (recipe.waterline === undefined) return EMPTY;

  const [long, short] = recipe.span;
  const stage = query.stage;
  const ring = ringAt(role, stage);
  const prev = ringAt(role, stage - 1);
  const ringMax = ringAt(role, role.ringByStage.length - 1);

  const plan: MutablePlan = { digs: [], walls: [], fills: [], promenade: [], sites: [] };
  const worldRect = (x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } => {
    const spot = orientPart(
      { kind: 0, x, y, w, h, z: 0, height: 1, palette: 0, surface: 0 },
      query.facing,
      long,
      short,
    );
    return { x: query.x + spot.x, y: query.y + spot.y, w: spot.w, h: spot.h };
  };
  const columns = (rect: { x: number; y: number; w: number; h: number }): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) out.push({ x: rect.x + dx, y: rect.y + dy });
    }
    return out;
  };

  // L'insenatura cresce con l'anello: la fascia che lo stadio aggiunge oltre
  // il fronte della struttura scende al fondo e l'acqua la riempie.
  const inlet = role.inlet;
  if (inlet !== undefined && stage >= inlet.fromStage && ring > prev) {
    addPieces(plan.digs, worldRect, columns, probe,
      long + prev, 0, ring - prev, short, query.waterZ - inlet.depth,
      (rect, floor) => ({ ...rect, floor }),
      'dig');
  }

  // I canali perpendicolari alla costa: la darsena che entra nella riva
  // emersa, con le sponde in muratura e la testata chiusa a terra.
  const canals = role.canals;
  if (canals !== undefined && stage === canals.fromStage) {
    const wallX0 = recipe.waterline - canals.length;
    for (let side = -1; side <= 1; side += 2) {
      const y0 = side === 1 ? short + canals.gap : -canals.gap - canals.width;
      addPieces(plan.digs, worldRect, columns, probe,
        wallX0, y0, long + ringMax - wallX0, canals.width, query.waterZ - HARBOR.canalDepth,
        (rect, floor) => ({ ...rect, floor }),
        'dig');
      // Le due sponde, sulla sola parte di terra: al largo il canale si apre
      // sull'acqua senza muri.
      const bankX1 = long;
      addPieces(plan.walls, worldRect, columns, probe,
        wallX0, y0 - 1, bankX1 - wallX0, 1, query.waterZ - HARBOR.canalDepth,
        (rect, floor) => ({ ...rect, floor }),
        'wall');
      addPieces(plan.walls, worldRect, columns, probe,
        wallX0, y0 + canals.width, bankX1 - wallX0, 1, query.waterZ - HARBOR.canalDepth,
        (rect, floor) => ({ ...rect, floor }),
        'wall');
      // La testata: un canale che finisce contro l'erba e' una trincea.
      addPieces(plan.walls, worldRect, columns, probe,
        wallX0 - 1, y0, 1, canals.width, query.waterZ - HARBOR.canalDepth,
        (rect, floor) => ({ ...rect, floor }),
        'wall');
    }
  }

  // Il molo di terra guadagnata: il porto si costruisce la propria baia.
  const reclamation = role.reclamation;
  if (reclamation !== undefined && stage === reclamation.fromStage) {
    const padZ = query.waterZ + GRADING.quayFreeboard;
    if (reclamationHolds(query, probe, worldRect, columns, long, short, reclamation)) {
      addPieces(plan.fills, worldRect, columns, probe,
        long, reclamation.sideMargin, reclamation.depth, short - 2 * reclamation.sideMargin, padZ,
        (rect, z) => ({ ...rect, padZ: z, kind: 'mole' as const }),
        'fill');
    }
  }

  // Il canale di accesso approfondito davanti al molo: il bacino portuale.
  const access = role.access;
  if (access !== undefined && stage === access.fromStage) {
    const reclamationDepth = reclamation?.depth ?? 0;
    const margin = reclamation?.sideMargin ?? 0;
    addPieces(plan.digs, worldRect, columns, probe,
      long + reclamationDepth, margin, access.span, short - 2 * margin, query.waterZ - access.depth,
      (rect, floor) => ({ ...rect, floor }),
      'dig');
  }

  // Il frangiflutti staccato: chiude lo specchio d'acqua senza toccare la riva.
  const breakwater = role.breakwater;
  if (breakwater !== undefined && stage === breakwater.fromStage) {
    const front = frontReach(role, ringMax);
    const y0 = (short - breakwater.length) >> 1;
    addPieces(plan.fills, worldRect, columns, probe,
      long + front + breakwater.gap, y0, breakwater.width, breakwater.length,
      query.waterZ + HARBOR.breakwaterFreeboard,
      (rect, z) => ({ ...rect, padZ: z, kind: 'breakwater' as const }),
      'fill');
  }

  // La passeggiata: la fascia d'anello che lo stadio aggiunge, sul solo suolo
  // asciutto. Chi applica il piano ne scarta le colonne gia' scavate.
  if (ring > prev) {
    const box = { ...orientedSpan(query.facing, long, short) };
    for (let py = query.y - ring; py <= query.y + box.sizeY - 1 + ring; py++) {
      for (let px = query.x - ring; px <= query.x + box.sizeX - 1 + ring; px++) {
        const dist = ringDist(px, py, query.x, query.y, box.sizeX, box.sizeY);
        if (dist <= prev || dist > ring) continue;
        if (!probe.has(px, py)) continue;
        if (!isDryLand(probe.biomeAt(px, py))) continue;
        plan.promenade.push({ x: px, y: py });
      }
    }
  }

  // Gli slot di settore sbloccati da questo stadio, sul lato di terra.
  const total = role.sitesByStage[role.sitesByStage.length - 1];
  for (let i = 0; i < total; i++) {
    if (firstStageFor(role, i) !== stage) continue;
    const site = siteSlotOf(query, long, short, ringMax, total, i);
    plan.sites.push({ ...site, class: role.siteClasses[i] });
  }

  return plan;
}

/** L'anello del distretto a uno stadio, tagliato dentro i limiti della tabella. */
function ringAt(role: HarborRoleConfig, stage: number): number {
  const s = Math.max(0, Math.min(stage, role.ringByStage.length - 1));
  return role.ringByStage[s];
}

/** Quanto il fronte del distretto avanza al largo con le opere gia' previste. */
function frontReach(role: HarborRoleConfig, ringMax: number): number {
  const inlet = role.inlet !== undefined ? ringMax : 0;
  const reclamation = role.reclamation?.depth ?? 0;
  const access = role.access?.span ?? 0;
  return inlet + reclamation + access;
}

/** Distanza di Chebyshev di una colonna dal riquadro: zero dentro, positiva fuori. */
function ringDist(px: number, py: number, x0: number, y0: number, sx: number, sy: number): number {
  const dx = px < x0 ? x0 - px : px >= x0 + sx ? px - (x0 + sx - 1) : 0;
  const dy = py < y0 ? y0 - py : py >= y0 + sy ? py - (y0 + sy - 1) : 0;
  return Math.max(dx, dy);
}

/**
 * La colmata regge soltanto dove il fondale non sprofonda oltre il muro di
 * banchina: la stessa guardia che il piazzamento del porto passa sul proprio
 * bacino, chiesta sul terreno che il molo andrebbe a coprire.
 */
function reclamationHolds(
  query: HarborQuery,
  probe: HarborProbe,
  worldRect: (x: number, y: number, w: number, h: number) => { x: number; y: number; w: number; h: number },
  columns: (rect: { x: number; y: number; w: number; h: number }) => { x: number; y: number }[],
  long: number,
  short: number,
  reclamation: { depth: number; sideMargin: number },
): boolean {
  const rect = worldRect(long, reclamation.sideMargin, reclamation.depth, short - 2 * reclamation.sideMargin);
  for (const column of columns(rect)) {
    if (!probe.has(column.x, column.y)) return false;
    if (probe.heightAt(column.x, column.y) < query.waterZ - GRADING.maxQuayDepth) return false;
  }
  return true;
}

/**
 * Lo slot di settore `i`: una colonna sul lato di terra, all'anello che gli
 * tocca. Gli anelli crescono con l'indice, cosi' gli slot si sbloccano in
 * ordine di vicinanza alla struttura, e il jitter dal seme evita che due
 * distretti nascano identici.
 */
function siteSlotOf(
  query: HarborQuery,
  long: number,
  short: number,
  ringMax: number,
  total: number,
  i: number,
): { x: number; y: number } {
  const ring = slotRing(ringMax, total, i);
  const spread = total > 1 ? Math.round(((short - 2) * i) / (total - 1)) : short >> 1;
  const jitter = hashCoords(query.seed, i, 11) % 3 - 1;
  const y = Math.max(1, Math.min(short - 2, spread + jitter));
  const spot = orientPart(
    { kind: 0, x: -ring, y, w: 1, h: 1, z: 0, height: 1, palette: 0, surface: 0 },
    query.facing,
    long,
    short,
  );
  return { x: query.x + spot.x, y: query.y + spot.y };
}

/** L'anello a cui lo slot `i` si sblocca, spalmato sul tetto dell'anello. */
function slotRing(ringMax: number, total: number, i: number): number {
  return Math.max(1, Math.ceil((ringMax * (i + 1)) / total));
}

/** Il primo stadio che sblocca lo slot `i`: l'anello e il conteggio cumulativo insieme. */
function firstStageFor(role: HarborRoleConfig, i: number): number {
  const ringMax = role.ringByStage[role.ringByStage.length - 1];
  const ring = slotRing(ringMax, role.sitesByStage[role.sitesByStage.length - 1], i);
  for (let s = 1; s < role.ringByStage.length; s++) {
    if (ringAt(role, s) >= ring && role.sitesByStage[s] > i) return s;
  }
  return role.ringByStage.length - 1;
}

type PieceOut<T> = (rect: { x: number; y: number; w: number; h: number }, z: number) => T;

/**
 * Spezza un rettangolo canonico in ritagli al massimo `HARBOR.pieceSpan` larghi
 * e li porta sul verso vero. Il ritaglio avviene **prima** della rotazione,
 * sull'asse lungo del rettangolo: dopo, i due assi si scambiano e un pezzo
 * da ventidue colonne resterebbe intero.
 *
 * Un ritaglio entra nel piano solo se almeno una delle sue colonne ha lavoro:
 * nessuna cancellazione a vuoto, nessuna colmata gia' in quota.
 */
function addPieces<T>(
  out: T[],
  worldRect: (x: number, y: number, w: number, h: number) => { x: number; y: number; w: number; h: number },
  columns: (rect: { x: number; y: number; w: number; h: number }) => { x: number; y: number }[],
  probe: HarborProbe,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  make: PieceOut<T>,
  mode: 'dig' | 'wall' | 'fill',
): void {
  for (let px = x; px < x + w; px += HARBOR.pieceSpan) {
    const pw = Math.min(HARBOR.pieceSpan, x + w - px);
    const rect = worldRect(px, y, pw, h);
    const needed = columns(rect).some((column) => {
      if (!probe.has(column.x, column.y)) return false;
      const height = probe.heightAt(column.x, column.y);
      return mode === 'fill' ? height < z : height > z;
    });
    if (needed) out.push(make(rect, z));
  }
}
