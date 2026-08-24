import { LANDFORM } from './config';

/**
 * La **forma in pianta** di un elemento della sagoma: un'ellisse orientata a cui
 * poche armoniche deformano il raggio.
 *
 * Nasce da un difetto che si vedeva solo sull'acqua. Rilievi e conche erano
 * ellissi allineate agli assi, e sul terreno la cosa passa — la quantizzazione a
 * celle, i cigli, gli alberi e la copertura rompono il contorno prima che
 * l'occhio lo riconosca. Uno specchio d'acqua no: e' l'unica superficie
 * dell'isola senza grana ne' terrazzamento, quindi il suo bordo e' l'unica curva
 * che si legga per intero, e una circonferenza esatta si riconosce da qualunque
 * distanza.
 *
 * **La deformazione e' angolare e non un rumore, e la ragione e' il budget di
 * pendenza.** Di un rumore il gradiente si sa solo misurandolo; di una somma di
 * armoniche si sa in forma chiusa, ed e' `SHAPE_WARP_LIPSCHITZ`: quanto la
 * deformazione moltiplica al massimo la pendenza di cio' che deforma. Chi usa
 * una sagoma deformata divide per quel numero la pendenza che dichiara, e il
 * vincolo di Lipschitz del campo resta quello di prima invece di essere speso di
 * nascosto.
 *
 * **Si spegne verso il bordo, ed e' l'unica cosa che la rende gratis.** La
 * deformazione vale piena al centro e nulla sul bordo, dove la sagoma torna il
 * cerchio esatto del raggio che dichiara. Non e' una rifinitura: chi cerca un
 * sito a una conca sonda il terreno lungo il **bordo**, e una sagoma che
 * sporgesse anche solo di un sesto chiederebbe una spianata piu' larga di
 * quella che il raggio annuncia — pagando la deformazione in terra piana, che
 * su un'isola quasi tutta in pendenza e' la risorsa rara. Misurato: il sito
 * migliore del seed di riferimento chiude il conto del raccordo con due punti
 * percentuali di margine, e con una sagoma che sporge ne perde sedici. Cosi'
 * invece la ricerca del sito resta quella di sempre, e la deformazione si paga
 * in pendenza — dove il margine c'e'. Che poi e' anche il verso giusto: dentro
 * la conca la sagoma la decide il lago, sul raccordo la decide il terreno
 * intorno.
 *
 * Puro come il resto di `landform.ts`, e senza stato: una sagoma e' un record di
 * numeri, e ogni funzione qui e' una lettura.
 */

const TAU = Math.PI * 2;

/**
 * Una armonica gia' risolta sulla fase estratta: il peso del suo seno e quello
 * del suo coseno.
 *
 * `a * sin(k*t + fase)` si riscrive come `(a cos fase) sin(kt) + (a sin fase)
 * cos(kt)`, e a valle restano solo moltiplicazioni. Non e' un'ottimizzazione
 * qualunque: `outlineRatio` gira una volta per elemento **per campione del
 * campo**, cioe' milioni di volte per isola, e una trigonometrica per armonica
 * la' dentro costerebbe piu' di un'ottava di rumore.
 */
export interface WarpTerm {
  readonly harmonic: number;
  /** L'ampiezza, conservata: e' cio' su cui `warpLipschitz` allarga la fascia. */
  readonly amplitude: number;
  readonly sinWeight: number;
  readonly cosWeight: number;
}

/** La deformazione di un elemento: una voce per armonica di `LANDFORM.shapeWarp`. */
export type Warp = readonly WarpTerm[];

/** Una sagoma in pianta: ellisse orientata piu' la deformazione del raggio. */
export interface Outline {
  readonly centreX: number;
  readonly centreY: number;
  /** Semiassi, misurati prima della rotazione. */
  readonly radiusX: number;
  readonly radiusY: number;
  /** Orientamento dei semiassi, gia' risolto in coseno e seno. */
  readonly cosAngle: number;
  readonly sinAngle: number;
  readonly warp: Warp;
}

/**
 * Il tetto del fattore, valido per **qualunque** fase e a qualunque raggio.
 *
 * Con `f = rho * (1 + w(t) * (1 - rho))` la derivata radiale vale
 * `(1 + w * (1 - 2 rho)) / R` e quella tangenziale `w'(t) * (1 - rho) / R`: il
 * raggio si semplifica, quindi la deformazione non introduce nessuna
 * singolarita' al centro, ed entrambe sono massime al centro — dove valgono
 * `1 + somma delle ampiezze` e `somma di ampiezza per armonica`.
 *
 * E' **dedotto** dalla tabella e non dichiarato, per la stessa ragione di
 * `LEDGE_MIN_DROP`: un numero scritto a mano racconterebbe una storia diversa
 * dalle armoniche alla prima taratura. Chi ha un profilo che sale solo su una
 * fascia usa `warpLipschitz` su quella fascia, e paga molto meno.
 */
export const SHAPE_WARP_LIPSCHITZ = (() => {
  let amplitude = 0;
  let derivative = 0;
  for (const term of LANDFORM.shapeWarp) {
    amplitude += Math.abs(term.amplitude);
    derivative += term.harmonic * Math.abs(term.amplitude);
  }
  return Math.hypot(1 + amplitude, derivative);
})();

/** Campioni su cui si misura il fattore di una deformazione: angoli e raggi. */
const LIPSCHITZ_ANGLES = 128;
const LIPSCHITZ_STEPS = 24;

/**
 * Quanto **questa** deformazione moltiplica il gradiente sulla fascia di raggi
 * `[fromRatio, toRatio]`.
 *
 * Due cose la rendono molto piu' bassa del tetto in forma chiusa, e tutte e due
 * contano dove il margine e' stretto:
 *
 * 1. il tetto somma ampiezze e derivate come se cadessero tutte insieme, e non
 *    ci cadono mai — dove un seno e' al massimo il suo coseno e' nullo;
 * 2. la deformazione si spegne verso il bordo, quindi sulla fascia in cui una
 *    conca *scende* vale gia' meno che al centro.
 *
 * La fascia arriva in raggi della sagoma, non in raggi normalizzati, e viene
 * allargata dell'ampiezza: e' l'intervallo di raggi che puo' finire dentro
 * quella fascia una volta deformato.
 *
 * Si misura invece di risolverla perche' il massimo di quella forma su due
 * armoniche non ha soluzione chiusa. Il campionamento e' fitto rispetto alle
 * armoniche in gioco — al piu' tre oscillazioni per giro — e si paga una volta
 * per elemento, non per campione del campo.
 */
export function warpLipschitz(warp: Warp, fromRatio: number, toRatio: number): number {
  let amplitude = 0;
  for (const term of warp) amplitude += Math.abs(term.amplitude);
  const from = Math.max(0, fromRatio / (1 + amplitude));
  const to = Math.min(1, toRatio / Math.max(1e-6, 1 - amplitude));

  let worst = 0;
  for (let i = 0; i < LIPSCHITZ_ANGLES; i++) {
    const angle = (i * TAU) / LIPSCHITZ_ANGLES;
    let w = 0;
    let derivative = 0;
    for (const term of warp) {
      const phase = term.harmonic * angle;
      const sk = Math.sin(phase);
      const ck = Math.cos(phase);
      w += term.sinWeight * sk + term.cosWeight * ck;
      derivative += term.harmonic * (term.sinWeight * ck - term.cosWeight * sk);
    }
    for (let k = 0; k <= LIPSCHITZ_STEPS; k++) {
      const r = from + ((to - from) * k) / LIPSCHITZ_STEPS;
      const radial = 1 + w * (1 - 2 * r);
      const tangential = derivative * (1 - r);
      worst = Math.max(worst, Math.hypot(radial, tangential));
    }
  }
  return worst;
}

/** Estrae la deformazione di un elemento: una fase per armonica, risolta subito. */
export function planWarp(rnd: () => number): Warp {
  return LANDFORM.shapeWarp.map((term) => {
    const phase = rnd() * TAU;
    return {
      harmonic: term.harmonic,
      amplitude: term.amplitude,
      sinWeight: term.amplitude * Math.cos(phase),
      cosWeight: term.amplitude * Math.sin(phase),
    };
  });
}

/** Compone una sagoma, risolvendo subito l'orientamento in coseno e seno. */
export function outlineOf(
  centreX: number,
  centreY: number,
  radiusX: number,
  radiusY: number,
  angle: number,
  warp: Warp,
): Outline {
  return {
    centreX,
    centreY,
    radiusX,
    radiusY,
    cosAngle: Math.cos(angle),
    sinAngle: Math.sin(angle),
    warp,
  };
}

/**
 * Raggio normalizzato di un punto rispetto a una sagoma: 0 al centro, 1 sul
 * bordo, oltre 1 fuori.
 *
 * E' l'unica cosa che i consumatori chiedono a una sagoma — la caduta a coseno,
 * il profilo di una conca e il pelo di un lago sono tutti funzioni di questo
 * numero — ed e' il motivo per cui l'orientamento e la deformazione non
 * compaiono da nessun'altra parte.
 */
export function outlineRatio(outline: Outline, x: number, y: number): number {
  const ox = x - outline.centreX;
  const oy = y - outline.centreY;
  // Nel riquadro dell'ellisse: prima si annulla la rotazione, poi si dividono i
  // semiassi. Da li' in poi la forma e' un cerchio unitario, e l'angolo e' gia'
  // quello su cui la deformazione e' definita.
  const px = (ox * outline.cosAngle + oy * outline.sinAngle) / outline.radiusX;
  const py = (oy * outline.cosAngle - ox * outline.sinAngle) / outline.radiusY;
  const r = Math.sqrt(px * px + py * py);
  if (r <= 0) return 0;
  if (r >= 1) return r;
  return r * (1 + warpFactor(outline.warp, px / r, py / r) * (1 - r));
}

/**
 * Il punto che cade su `ratio` nella direzione `angle`, misurata nel riquadro
 * normalizzato della sagoma.
 *
 * E' l'inverso esatto di `outlineRatio`, e serve a chi deve sondare il terreno
 * **lungo** la sagoma invece che lungo una circonferenza: la fascia di raccordo
 * di una conca sta dove la deformazione la porta, e misurarla su un cerchio
 * vorrebbe dire misurarla dove non c'e'.
 */
export function outlinePoint(outline: Outline, ratio: number, angle: number): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const r = unwarpRatio(warpFactor(outline.warp, cos, sin), ratio);
  const px = r * cos * outline.radiusX;
  const py = r * sin * outline.radiusY;
  return [
    outline.centreX + px * outline.cosAngle - py * outline.sinAngle,
    outline.centreY + px * outline.sinAngle + py * outline.cosAngle,
  ];
}

/**
 * Quanto la deformazione sposta il raggio in una direzione, dato il coseno e il
 * seno dell'angolo. Zero e' nessuna deformazione.
 *
 * I multipli dell'angolo escono per rotazioni successive e non da `atan2` piu'
 * `Math.sin`: e' un prodotto di complessi per armonica, e sulle armoniche basse
 * che la tabella dichiara sono tre moltiplicazioni in tutto.
 */
function warpFactor(warp: Warp, cos: number, sin: number): number {
  let factor = 0;
  for (const term of warp) {
    let ck = cos;
    let sk = sin;
    for (let k = 1; k < term.harmonic; k++) {
      const next = ck * cos - sk * sin;
      sk = sk * cos + ck * sin;
      ck = next;
    }
    factor += term.sinWeight * sk + term.cosWeight * ck;
  }
  return factor;
}

/**
 * Il raggio normalizzato che, deformato di `w`, cade su `ratio`.
 *
 * E' l'inversa di `r * (1 + w * (1 - r))`, che in `r` e' una parabola: la
 * radice buona e' sempre quella con il meno, l'unica che cade nell'intervallo
 * utile — la forma vale `ratio` in zero e `ratio - 1` in uno, quindi la
 * attraversa una volta sola. Fuori dal bordo la deformazione e' gia' spenta e
 * non c'e' niente da invertire.
 */
function unwarpRatio(w: number, ratio: number): number {
  if (ratio >= 1 || w === 0) return ratio;
  const b = 1 + w;
  return (b - Math.sqrt(b * b - 4 * w * ratio)) / (2 * w);
}
