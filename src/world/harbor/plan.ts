import type { BuildingClass, CatalystId } from '../../sim';
import type { LandmarkFormId } from '../landmarks/config';
import { landmarkOf } from '../landmarks/config';
import { orientPart, orientedSpan } from '../landmarks/parts';
import type { Facing } from '../streets/streetGrid';
import { isDryLand } from '../grading/grade';
import { GRADING } from '../grading/config';
import { hashCoords } from '../rng';
import { HARBOR, HARBOR_ROLES, type HarborRoleConfig } from './config';
import { planFigure, type FigureRect } from './figures';
import { surveyCoast } from './site';

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
  /**
   * Vero se la colonna non e' gia' di qualcun altro. Assente vale «libera».
   *
   * **Serve da quando una figura arriva a due isolati.** Finche' il distretto
   * scavava dodici colonne, il terreno dietro la struttura era ancora il
   * grembiule del landmark e la domanda non si poneva. Una darsena da quaranta
   * colonne invece arriva in mezzo al quartiere, e senza questa domanda il
   * pettine si scaverebbe dentro le case — cancellando dal terreno cio' che il
   * registry continua a dichiarare in piedi.
   *
   * Resta opzionale perche' il piano deve restare provabile con cinque righe di
   * stringa: un test che misura la forma di una darsena non ha una citta'.
   */
  readonly free?: (x: number, y: number) => boolean;
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

/**
 * Una colmata: molo di terra guadagnata, frangiflutti di pietra o **banchina**.
 *
 * I tre si scrivono uguale — pietra fino alla quota, calpestio in cima — e si
 * distinguono in una cosa sola: la banchina **non si prenota**. Molo e
 * frangiflutti sono opere, e il suolo che occupano e' loro; una banchina e'
 * suolo che il distretto livella *per* costruirci sopra, e prenotarla
 * vieterebbe l'edificio che e' la ragione per cui la si e' fatta.
 */
export interface HarborFill {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Quota della cima della colmata: piano del molo o cresta del frangiflutti. */
  readonly padZ: number;
  readonly kind: 'mole' | 'breakwater' | 'quay';
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
  /**
   * La prima colonna canonica, andando verso il largo da `from`, in cui c'e'
   * acqua vera. `null` se la riva non si trova entro `HARBOR.shoreReach`.
   *
   * **E' la sola cosa che questo piano chiede al terreno oltre a "regge?".** Le
   * opere si tagliavano sui numeri della ricetta — `waterline` meno la
   * lunghezza, `long` piu' la somma dei fronti — e quei numeri descrivono una
   * riva parallela al fronte, che e' il caso che quasi nessun seme produce.
   */
  const shoreline = (cy: number, from: number, to: number): number | null => {
    for (let cx = from; cx <= to; cx++) {
      const spot = worldRect(cx, cy, 1, 1);
      if (!probe.has(spot.x, spot.y)) return null;
      if (probe.heightAt(spot.x, spot.y) <= query.waterZ) return cx;
    }
    return null;
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
  // **La figura d'acqua: il gesto di scala del distretto.** Non una forma per
  // ruolo ma un vocabolario che il luogo declina — darsene a pettine, canale che
  // stacca un'isola, porticciolo fra due moli, argine — scelto misurando la
  // costa che il landmark si e' trovato davanti. Due porti sulla stessa isola
  // vengono cosi' diversi perche' stanno in due posti diversi.
  //
  // **La forma si ricalcola a ogni stadio, i voxel si scrivono a uno solo.** Le
  // banchine che la figura ha creato non spariscono allo stadio dopo: e' su
  // quelle che i lotti continuano a nascere. Calcolarla solo allo stadio che la
  // sblocca lasciava i lotti degli stadi successivi a ripiegare sull'anello,
  // cioe' a nascere lontano dal suolo che il distretto aveva appena guadagnato.
  const figure = role.figure;
  let quays: readonly FigureRect[] = [];
  if (figure !== undefined && stage >= figure.fromStage) {
    const site = surveyCoast(
      {
        fromRow: -HARBOR.figureReach,
        toRow: short + HARBOR.figureReach,
        reach: HARBOR.figureReach,
        waterZ: query.waterZ,
      },
      probe,
      (cx, cy) => worldRect(cx, cy, 1, 1),
    );
    const shape = planFigure({ site, long, short });
    quays = shape.quays;

    const floor = query.waterZ - HARBOR.canalDepth;
    const crest = query.waterZ + GRADING.quayFreeboard;
    // Lo scavo, le sponde e le colmate sono il delta di **questo** stadio: agli
    // stadi successivi la figura c'e' gia', e riscriverla vorrebbe dire ridurre
    // in acqua le colonne su cui il distretto ha appena fatto nascere una casa.
    if (stage === figure.fromStage) {
      for (const rect of shape.water) {
        addPieces(plan.digs, worldRect, columns, probe,
          rect.x, rect.y, rect.w, rect.h, floor,
          (piece, z) => ({ ...piece, floor: z }), 'dig');
      }
      for (const rect of shape.banks) {
        addPieces(plan.walls, worldRect, columns, probe,
          rect.x, rect.y, rect.w, rect.h, floor,
          (piece, z) => ({ ...piece, floor: z }), 'wall');
      }
      // Moli e banchine si scrivono uguale e si distinguono nel nome: la
      // banchina non si prenota, perche' e' suolo livellato *per* costruirci
      // sopra. `addPieces` scarta da se' cio' che e' gia' in quota, quindi una
      // dita di banchina alta resta com'era invece di prendersi un riporto che
      // non le serve.
      for (const rect of shape.moles) {
        addPieces(plan.fills, worldRect, columns, probe,
          rect.x, rect.y, rect.w, rect.h, crest,
          (piece, z) => ({ ...piece, padZ: z, kind: 'mole' as const }), 'fill');
      }
      for (const rect of shape.quays) {
        addPieces(plan.fills, worldRect, columns, probe,
          rect.x, rect.y, rect.w, rect.h, crest,
          (piece, z) => ({ ...piece, padZ: z, kind: 'quay' as const }), 'fill');
      }
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

  // Il frangiflutti staccato: chiude lo specchio d'acqua senza toccare la riva,
  // e lascia il varco da cui ci si entra.
  const breakwater = role.breakwater;
  if (breakwater !== undefined && stage === breakwater.fromStage) {
    const front = frontReach(role, ringMax);
    const y0 = (short - breakwater.length) >> 1;
    // **«Staccato» va verificato, non dichiarato.** La somma dei fronti dice
    // dove finiscono le opere, non dove comincia il mare: su una costa che
    // rientra, quel punto e' ancora spiaggia, e un braccio di pietra posato
    // sulla sabbia non protegge niente. La sonda porta il braccio sulla prima
    // colonna d'acqua vera; se entro `shoreReach` non ce n'e', il frangiflutti
    // semplicemente non si costruisce.
    const start = long + front + breakwater.gap;
    const anchor = shoreline((short - 1) >> 1, start, start + HARBOR.shoreReach);
    if (anchor !== null) {
      // Due bracci e un varco in mezzo, centrato dove guardano gli ormeggi. Un
      // varco piu' largo della campata non lascia bracci: li' il frangiflutti
      // resta pieno, che e' la sola lettura sensata di una campata corta.
      const arm = (breakwater.length - breakwater.mouth) >> 1;
      const spans: readonly (readonly [number, number])[] = arm > 0
        ? [[y0, arm], [y0 + breakwater.length - arm, arm]]
        : [[y0, breakwater.length]];
      for (const [sy, sh] of spans) {
        addPieces(plan.fills, worldRect, columns, probe,
          anchor, sy, breakwater.width, sh,
          query.waterZ + HARBOR.breakwaterFreeboard,
          (rect, z) => ({ ...rect, padZ: z, kind: 'breakwater' as const }),
          'fill');
      }
    }
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

  // **Gli slot di settore nascono sulle banchine della figura**, e in mancanza
  // di figura sul lato di terra come hanno sempre fatto.
  //
  // E' la differenza fra Canary Wharf e un paio di vasche: la darsena senza le
  // torri sulle dita di banchina e' un'opera idraulica, non un pezzo di citta'.
  // Il ripiego resta per gli stadi che una figura non la sbloccano ancora, e per
  // l'argine — che di banchina ne guadagna poca e la spende tutta in pontili.
  const total = role.sitesByStage[role.sitesByStage.length - 1];
  for (let i = 0; i < total; i++) {
    if (firstStageFor(role, i) !== stage) continue;
    const onQuay = quays.length === 0 ? null : quayLotOf(query, quays, worldRect, i);
    const site = onQuay ?? siteSlotOf(query, long, short, ringMax, total, i);
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

/**
 * Il lotto `i` sulle banchine della figura, o null se non ce ne sono.
 *
 * **Le banchine si prendono a giro**, una per lotto, cosi' che i primi edifici
 * non si accalchino tutti sulla stessa dita mentre le altre restano nude: e' un
 * porto che cresce su piu' bacini insieme, come e' successo davvero. Dentro la
 * banchina il lotto sta al centro del lato corto e avanza lungo quello lungo, a
 * passi che dipendono da quante volte quella banchina e' gia' toccata.
 */
function quayLotOf(
  query: HarborQuery,
  quays: readonly FigureRect[],
  worldRect: (x: number, y: number, w: number, h: number) => { x: number; y: number; w: number; h: number },
  i: number,
): { x: number; y: number } | null {
  const quay = quays[i % quays.length];
  if (quay.w <= 0 || quay.h <= 0) return null;
  const round = Math.floor(i / quays.length);

  // Il lato lungo della banchina e' quello su cui i lotti si distribuiscono; il
  // corto porta il lotto al centro, che e' l'unico punto in cui un edificio ha
  // acqua da tutte e due le parti senza toccarla.
  const along = quay.w >= quay.h ? quay.w : quay.h;
  const steps = Math.max(1, Math.floor(along / HARBOR.lotPitch));
  const jitter = hashCoords(query.seed, i, 23) % 3 - 1;
  const at = Math.max(0, Math.min(along - 1, HARBOR.lotPitch * ((round % steps) + 0.5) + jitter));

  const spot = quay.w >= quay.h
    ? worldRect(quay.x + Math.round(at), quay.y + (quay.h >> 1), 1, 1)
    : worldRect(quay.x + (quay.w >> 1), quay.y + Math.round(at), 1, 1);
  return { x: spot.x, y: spot.y };
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
 *
 * **E solo se tutte le sue colonne sono libere.** E' la guardia che la scala
 * della figura ha reso necessaria: finche' il distretto scavava dodici colonne
 * stava nel proprio grembiule, mentre una darsena da quaranta arriva in mezzo
 * al quartiere. Senza, lo scavo cancellerebbe dal terreno le colonne su cui il
 * registry continua a dichiarare una casa in piedi. Il ritaglio e' l'unita' di
 * questa rinuncia — sedici colonne — quindi la figura si accorcia a scatti
 * invece di sfrangiarsi colonna per colonna, ed e' il comportamento giusto: una
 * darsena mezza scavata non e' una darsena.
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
    const spots = columns(rect);
    if (probe.free !== undefined && spots.some((column) => !probe.free!(column.x, column.y))) {
      continue;
    }
    const needed = spots.some((column) => {
      if (!probe.has(column.x, column.y)) return false;
      const height = probe.heightAt(column.x, column.y);
      return mode === 'fill' ? height < z : height > z;
    });
    if (needed) out.push(make(rect, z));
  }
}
