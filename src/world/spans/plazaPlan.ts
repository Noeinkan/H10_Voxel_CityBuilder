import { SPANS, SPAN_KIND } from './config';
import {
  refuse,
  tileSegments,
  type SpanProbe,
  type SpanResult,
  type SpanSupport,
} from './spanPlan';

/**
 * La piazza in quota: un impalcato abitato sopra il cuore di un isolato.
 *
 * **Perche' e' una forma a se' e non un ponte largo.** Un ponte e' una
 * traversata fra due appoggi: lo si attraversa e basta. Una piazza e' retta da
 * tre o piu' edifici su lati diversi, quindi ci si arriva da direzioni diverse —
 * ed e' quello a farne il **nodo** della rete in quota invece che un altro
 * corridoio. Senza nodi, un secondo piano stradale e' una collezione di
 * passerelle che si incontrano solo dentro gli edifici.
 *
 * **Il cuore dell'isolato lo ha chiuso la 4.1 apposta.** L'ultimo punto di
 * quella fase — «uno spazio interno riconoscibile e' cio' che le sotto-fasi
 * successive terrazzano e collegano» — e' questo spazio: gli edifici nascono sul
 * fronte strada e lasciano libero il centro, che e' esattamente il vuoto su cui
 * una piazza puo' stare senza togliere un lotto a nessuno.
 *
 * Pura come `spanPlan.ts`, e con gli stessi due predicati.
 */

/** Riquadro edificabile di un isolato, estremi inclusi. */
export interface CourtyardRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Dove la piazza atterra, o perche' non atterra. */
type PlazaLanding =
  | {
    readonly ok: true;
    readonly deckZ: number;
    readonly cohort: readonly SpanSupport[];
    readonly rect: CourtyardRect;
  }
  | {
    readonly ok: false;
    /** true se a qualche quota gli appoggi bastavano ma stavano tutti da un lato. */
    readonly oneSided: boolean;
  };

export interface PlazaQuery extends SpanProbe {
  /** Il riquadro dell'isolato, come lo da' `streets.blockRect`. */
  readonly rect: CourtyardRect;
  /** Gli edifici del perimetro. La regola sceglie da sola quali la reggono. */
  readonly supports: readonly SpanSupport[];
}

export function planPlaza(query: PlazaQuery): SpanResult {
  const rule = SPANS.rules[SPAN_KIND.plaza];
  const plaza = SPANS.plaza;

  const courtyard = freeCourtyard(query);
  if (courtyard === null) return refuse('noCourtyard');

  const deck = deckRect(courtyard);
  if (deck === null) return refuse('noCourtyard');

  // I candidati sono tutti gli edifici abbastanza alti dell'isolato. **Chi
  // tocchi davvero il bordo non si puo' sapere qui**: il bordo si sposta,
  // perche' a quota di impalcato la piazza si allarga fino ai muri veri. La
  // geometria la decide `highestPlazaDeck`, sul riquadro allargato.
  const touching = query.supports.filter((support) => support.level >= rule.minLevel);
  if (touching.length < plaza.minSupports) return refuse('fewSupports');

  const survey = surveyCourtyard(query, deck);
  if (survey === null) return refuse('groundTaken');
  if (survey.pavement) return refuse('wrongGround');

  const floorZ = Math.max(
    Math.min(...touching.map((support) => support.baseZ)) + rule.minRise,
    survey.highest + rule.clearance + SPANS.girderDepth,
  );
  // Si parte dal tetto **piu' alto**: chi arriva fin li' regge, e chi non ci
  // arriva lo dira' la sonda scendendo.
  const startZ = Math.max(...touching.map((support) => support.baseZ + support.height))
    - SPANS.deckDrop;
  if (startZ < floorZ) return refuse('tooLow');

  // **La coorte esce dalla quota, non il contrario.** Cercare prima un gruppo di
  // tetti "alla stessa altezza" era il criterio sbagliato: una piazza si appoggia
  // al *fianco* di chi la circonda, e un edificio piu' alto a quella quota e'
  // pieno esattamente come uno che finisce li'. Contava solo che ce ne fossero
  // abbastanza, su lati diversi, con del pieno a quel piano.
  const landing = highestPlazaDeck(query, deck, query.rect, touching, startZ, floorZ);
  if (!landing.ok) {
    // Se a una quota gli appoggi c'erano ma stavano tutti da una parte, il
    // motivo vero e' quello: dirlo `noAbutment` manderebbe a cercare il difetto
    // nella quota invece che nella forma dell'isolato.
    return refuse(landing.oneSided ? 'oneSided' : 'noAbutment');
  }

  const { deckZ, cohort, rect: floor } = landing;

  return {
    ok: true,
    plan: {
      kind: SPAN_KIND.plaza,
      axis: 0,
      deckZ,
      x: floor.x0,
      y: floor.y0,
      sizeX: floor.x1 - floor.x0 + 1,
      sizeY: floor.y1 - floor.y0 + 1,
      // Una piazza non ha due testate ma un perimetro: la mensola non si applica,
      // e la travatura corre lungo tutto il bordo.
      corbel: 0,
      supports: cohort.map((support) => support.id).sort((a, b) => a - b),
      segments: tileSegments(
        floor.x0,
        floor.y0,
        floor.x1 - floor.x0 + 1,
        floor.y1 - floor.y0 + 1,
      ),
    },
  };
}

/**
 * Il cuore libero dell'isolato, cresciuto dal centro verso i bordi.
 *
 * **Crescere e non stringere.** Stringere il riquadro dell'isolato finche' i
 * bordi non sono sgombri sembra la mossa naturale e non converge: un edificio a
 * ovest occupa anche gli **angoli** dei lati sud e nord, quindi li fa stringere
 * a loro volta, e il cortile si consuma da tutte le parti fino a sparire. Il
 * centro invece e' libero per costruzione — gli edifici nascono sul fronte
 * strada — e da li' si allarga un lato per volta finche' la prossima riga o
 * colonna e' ancora sgombra.
 *
 * Cercare il rettangolo libero massimo darebbe la stessa risposta costando
 * quanto la mappa: cio' che resta al centro di un isolato *e' gia'* un
 * rettangolo, perche' e' il perimetro a essere costruito.
 */
function freeCourtyard(query: PlazaQuery): CourtyardRect | null {
  const rect = query.rect;
  const cx = (rect.x0 + rect.x1) >> 1;
  const cy = (rect.y0 + rect.y1) >> 1;
  if (!query.ground(cx, cy).free) return null;

  let x0 = cx;
  let x1 = cx;
  let y0 = cy;
  let y1 = cy;

  // Termina: ogni passata che non finisce allarga almeno un lato, e i lati non
  // possono uscire dal riquadro dell'isolato.
  for (;;) {
    let grew = false;
    if (x0 > rect.x0 && edgeFree(query, x0 - 1, y0, x0 - 1, y1)) { x0--; grew = true; }
    if (x1 < rect.x1 && edgeFree(query, x1 + 1, y0, x1 + 1, y1)) { x1++; grew = true; }
    if (y0 > rect.y0 && edgeFree(query, x0, y0 - 1, x1, y0 - 1)) { y0--; grew = true; }
    if (y1 < rect.y1 && edgeFree(query, x0, y1 + 1, x1, y1 + 1)) { y1++; grew = true; }
    if (!grew) return { x0, y0, x1, y1 };
  }
}

function edgeFree(query: PlazaQuery, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!query.ground(x, y).free) return false;
    }
  }
  return true;
}

/**
 * L'impalcato: **il cuore, tale e quale**, se sta dentro i due limiti.
 *
 * Non un quadrato centrato dentro di esso, e la differenza non e' di gusto. Il
 * cuore e' cresciuto finche' la riga successiva non era piu' libera, quindi il
 * suo bordo **tocca gia'** gli edifici che dovrebbero reggerlo; un quadrato
 * centrato piu' piccolo galleggia in mezzo al cortile senza toccare niente, e
 * `sideOf` non gli trova nemmeno un appoggio. E' un cortile: non ha ragione di
 * essere quadrato, ce l'ha di arrivare fino ai muri.
 */
function deckRect(courtyard: CourtyardRect): CourtyardRect | null {
  const plaza = SPANS.plaza;
  const width = courtyard.x1 - courtyard.x0 + 1;
  const depth = courtyard.y1 - courtyard.y0 + 1;

  if (width < plaza.minSide || depth < plaza.minSide) return null;
  // Oltre il lato massimo servirebbe un appoggio in mezzo, che una campata per
  // definizione non ha: quello e' suolo artificiale, cioe' la 4.9.
  if (width > plaza.maxSide || depth > plaza.maxSide) return null;
  return courtyard;
}

/**
 * Da che lato della piazza sta un edificio, o `null` se non la tocca abbastanza.
 *
 * «Abbastanza» e' `minAbutRun` colonne contigue di fronte comune: un edificio
 * che sfiora un angolo per un voxel non regge niente, e contarlo riempirebbe la
 * soglia di `minSupports` con appoggi che a schermo non si vedono.
 */
function sideOf(deck: CourtyardRect, support: SpanSupport): number | null {
  const run = SPANS.plaza.minAbutRun;
  const sx1 = support.x + support.sizeX - 1;
  const sy1 = support.y + support.sizeY - 1;
  const covers = (v: number, from: number, to: number): boolean => v >= from && v <= to;

  const overlapY = Math.min(sy1, deck.y1) - Math.max(support.y, deck.y0) + 1;
  const overlapX = Math.min(sx1, deck.x1) - Math.max(support.x, deck.x0) + 1;

  // **Contenimento e non adiacenza al filo.** A quota di impalcato la piazza si
  // e' allargata fino alle pareti vere, che stanno *dentro* il riquadro
  // dell'edificio: chiedere che il bordo della piazza tocchi esattamente
  // l'ultima colonna dell'impronta e' chiedere che l'edificio non si sia mai
  // arretrato, cioe' non trovare mai un appoggio.
  if (overlapY >= run) {
    if (covers(deck.x0 - 1, support.x, sx1)) return 0;
    if (covers(deck.x1 + 1, support.x, sx1)) return 1;
  }
  if (overlapX >= run) {
    if (covers(deck.y0 - 1, support.y, sy1)) return 2;
    if (covers(deck.y1 + 1, support.y, sy1)) return 3;
  }
  return null;
}

/** Terreno piu' alto sotto la piazza, e se ci passa una carreggiata. */
function surveyCourtyard(
  query: PlazaQuery,
  deck: CourtyardRect,
): { highest: number; pavement: boolean } | null {
  let highest = 0;
  let pavement = false;
  for (let y = deck.y0; y <= deck.y1; y++) {
    for (let x = deck.x0; x <= deck.x1; x++) {
      const column = query.ground(x, y);
      if (!column.free) return null;
      if (column.pavement) pavement = true;
      if (column.height > highest) highest = column.height;
    }
  }
  return { highest, pavement };
}

/**
 * La quota piu' alta a cui abbastanza appoggi reggono la piazza, e quali sono.
 *
 * Si scende dal tetto piu' alto e si prende il primo piano in cui il numero di
 * appoggi basta: piu' in alto la piazza sta, meglio racconta il vuoto sotto di
 * se', ma chi si e' gia' arretrato a quella quota non la regge. La coorte e'
 * quindi cio' che **resta** a quel piano, e non un gruppo scelto prima.
 */
function highestPlazaDeck(
  query: PlazaQuery,
  heart: CourtyardRect,
  block: CourtyardRect,
  touching: readonly SpanSupport[],
  startZ: number,
  floorZ: number,
): PlazaLanding {
  const plaza = SPANS.plaza;
  let oneSided = false;

  for (let z = startZ; z >= floorZ; z--) {
    const rect = spreadTo(query, heart, block, z);
    const cohort = touching.filter((support) => abutsAt(query, rect, support, z));
    if (cohort.length < plaza.minSupports) continue;
    if (new Set(cohort.map((support) => sideOf(rect, support))).size < 2) {
      oneSided = true;
      continue;
    }
    return { ok: true, deckZ: z, cohort, rect };
  }
  return { ok: false, oneSided };
}

/**
 * Il cuore allargato fino ai muri veri, a quella quota.
 *
 * **E' la stessa mossa della campata, e per lo stesso motivo.** Il cuore e' il
 * vuoto al *suolo*; piu' in su gli edifici che lo delimitano si sono arretrati,
 * quindi a quota di impalcato attorno al cuore c'e' ancora aria. Fermare la
 * piazza al bordo del cuore la lascerebbe a mezzo metro dai muri — e `abutsAt`
 * non le troverebbe un appoggio da nessuna parte, che e' esattamente il motivo
 * per cui prima non ne nasceva nessuna. Allargandosi, la piazza arriva ai corpi
 * e insieme sporge sopra le fasce basse di chi la regge: com'e' fatto un
 * cortile pensile vero.
 */
function spreadTo(
  query: PlazaQuery,
  heart: CourtyardRect,
  block: CourtyardRect,
  deckZ: number,
): CourtyardRect {
  const max = SPANS.plaza.maxSide;
  let { x0, y0, x1, y1 } = heart;

  for (;;) {
    let grew = false;
    if (x1 - x0 + 1 < max) {
      if (x0 > block.x0 && clearBand(query, x0 - 1, y0, x0 - 1, y1, deckZ)) { x0--; grew = true; }
      if (x1 < block.x1 && clearBand(query, x1 + 1, y0, x1 + 1, y1, deckZ)) { x1++; grew = true; }
    }
    if (y1 - y0 + 1 < max) {
      if (y0 > block.y0 && clearBand(query, x0, y0 - 1, x1, y0 - 1, deckZ)) { y0--; grew = true; }
      if (y1 < block.y1 && clearBand(query, x0, y1 + 1, x1, y1 + 1, deckZ)) { y1++; grew = true; }
    }
    if (!grew) return { x0, y0, x1, y1 };
  }
}

/** true se tutta la sezione della campata e' aria su questo riquadro. */
function clearBand(
  query: PlazaQuery,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  deckZ: number,
): boolean {
  for (let z = deckZ - SPANS.girderDepth; z <= deckZ; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (query.solid(x, y, z)) return false;
      }
    }
  }
  return true;
}

/**
 * true se l'edificio regge la piazza a quella quota.
 *
 * **Un tratto contiguo, non il fronte intero.** Una piazza non e' una campata
 * fra due testate: e' un piano poggiato su piu' punti, come un tavolo sulle
 * gambe. Pretendere che ogni appoggio sia pieno su tutta la propria luce
 * significa pretendere che nessuno dei tre o quattro si sia mai arretrato — e le
 * fasce si arretrano tutte, salendo. Quello che conta e' che ciascuno la tocchi
 * per un tratto in cui il punto d'attacco si vede: `minAbutRun`, lo stesso
 * numero con cui si e' guadagnato il diritto di essere chiamato appoggio.
 */
function abutsAt(
  query: PlazaQuery,
  deck: CourtyardRect,
  support: SpanSupport,
  z: number,
): boolean {
  const side = sideOf(deck, support);
  if (side === null) return false;
  const run = SPANS.plaza.minAbutRun;

  const along = side <= 1
    ? { fixed: side === 0 ? deck.x0 - 1 : deck.x1 + 1, from: Math.max(support.y, deck.y0), to: Math.min(support.y + support.sizeY - 1, deck.y1) }
    : { fixed: side === 2 ? deck.y0 - 1 : deck.y1 + 1, from: Math.max(support.x, deck.x0), to: Math.min(support.x + support.sizeX - 1, deck.x1) };

  let streak = 0;
  for (let v = along.from; v <= along.to; v++) {
    const solid = side <= 1
      ? query.solid(along.fixed, v, z)
      : query.solid(v, along.fixed, z);
    streak = solid ? streak + 1 : 0;
    if (streak >= run) return true;
  }
  return false;
}
