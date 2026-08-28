import { BAND_OP, GRAMMAR, MIN_FOOTPRINT, type BandOp, type ClassProfile } from './config';
import { pickInt, shrink, supported, type BandRect } from './bandRect';
import { bandStepOf } from '../scale';

/**
 * Il passo degli scarti, in voxel.
 *
 * **E' l'unita' della grammatica, non un tiro.** Con il modulo raddoppiato vale
 * due invece di uno: le rientranze e gli scarti sotto diventano multipli di
 * questo passo, cosi' lo stesso repertorio compone una casa da otto voxel o un
 * modulo da sedici senza cambiare ne' il numero ne' l'ordine dei tiri consumati
 * — solo la *grandezza* degli scarti. `keep` e `jut` restano fuori: non
 * spostano, e lo sbalzo e' microgeometria.
 */
const STEP = bandStepOf();

/**
 * L'interprete della grammatica delle fasce.
 *
 * **La tabella sta in `config.ts`, qui c'e' solo chi la legge.** `BAND_OP`
 * elenca le trasformazioni e `ClassProfile` dice quali provare e in che ordine:
 * questo file non decide niente, applica. E' la ragione per cui aggiungere una
 * forma resta una riga di tabella piu' un `case`, e non un ramo dentro il
 * montaggio dell'edificio.
 *
 * **Chi consuma tiri li consuma sempre.** E' l'invariante piu' fragile del
 * dominio e vale la pena ripeterlo qui, dove si rompe: le candidate si
 * costruiscono tutte anche quando la prima regge, perche' la sequenza del PRNG
 * non deve dipendere dall'esito di un vincolo. Se dipendesse, un'impronta
 * stretta cambierebbe la sagoma di tutte le fasce sopra di se', e `recordStamp`
 * non ritroverebbe piu' i voxel da cancellare.
 */

/**
 * Trasformazione imposta dalla posizione della fascia, o `null` se la sceglie il
 * repertorio.
 *
 * E' tutto cio' che resta dei tre rami che il ciclo delle fasce aveva prima. Il
 * basamento e' `keep` ripetuto e l'arretramento sopra di esso e' `shrink`: due
 * voci della stessa tabella da cui il repertorio pesca, non due eccezioni.
 */
export function forcedOp(index: number, podium: number): BandOp | null {
  if (index < podium) return BAND_OP.keep;
  if (index === podium && podium > 0) return BAND_OP.shrink;
  return null;
}

/**
 * Trasforma la fascia precedente in quella sopra.
 *
 * Il seed pesca una voce del repertorio — con una preferenza per la prima, vedi
 * `preferredStart` — e da li' in poi si prende la prima che regge, riavvolgendo
 * in cima: il seed sceglie *quale* forma, non *se* la forma sta in piedi. La
 * fascia di base resta il riquadro pieno, quindi nessuna fascia puo' uscire
 * dall'impronta e la collisione fra edifici resta bidimensionale.
 *
 * **Le candidate si costruiscono tutte, sempre.** Chi consuma tiri li consuma
 * anche quando la sua candidata verra' scartata: la sequenza del PRNG dipende
 * dal repertorio, mai dall'esito di un vincolo. Senza, un'impronta stretta
 * cambierebbe la sagoma di tutte le fasce sopra di se'.
 */
/**
 * Il riquadro entro cui una fascia puo' muoversi.
 *
 * **Non e' l'impronta, ed e' qui che lo sbalzo entra nella grammatica.** Era un
 * numero solo — il lato dell'impronta — e le fasce ci stavano dentro per
 * costruzione. Ora e' l'**inviluppo**: l'impronta piu' la striscia che
 * l'edificio si e' prenotato sopra il marciapiede. Da che parte stia quella
 * striscia non lo decide nessuna voce del repertorio: lo dice **dove l'impronta
 * siede dentro il riquadro**, che e' cio' che rende impossibile a un `jog` di
 * sporgere dalla parte del vicino senza una riga di codice che glielo vieti.
 */
export interface BandBox {
  readonly sizeX: number;
  readonly sizeY: number;
  /** Faccia verso cui l'inviluppo ha slack, negli indici di `FACING`. */
  readonly face: number;
}

export function nextRect(
  random: () => number,
  prev: BandRect,
  box: BandBox,
  profile: ClassProfile,
  forced: BandOp | null,
  /** true se a questa quota lo sbalzo e' ancora vietato: vedi `overhangFromZ`. */
  grounded: boolean,
  /** Lato dell'impronta, cioe' il riquadro entro cui una fascia grounded resta. */
  core: BandRect,
): BandRect {
  const shrinking = forced === null && random() < profile.shrinkBias;
  const ops = forced !== null
    ? [forced]
    : shrinking ? profile.shrinkOps : profile.growOps;
  // Il repertorio dell'altro ramo, provato solo quando il proprio non regge e
  // solo su una fascia su tre: vedi `GRAMMAR.spareBranchChance` e il ripiego in
  // fondo alla funzione. Il tiro si pesca su ogni fascia libera, e cio' che ne
  // dipende e' *quale* repertorio si costruisce — come gia' per la scelta del
  // ramo, che sceglie fra due elenchi di lunghezza diversa. Cio' che non deve
  // mai dipendere dall'esito di un vincolo geometrico continua a non dipenderne.
  const sparing = forced === null && random() < GRAMMAR.spareBranchChance;
  const spare = !sparing
    ? []
    : shrinking ? profile.growOps : profile.shrinkOps;
  // La preferenza si pesca, non si decreta: vedi `preferredStart`. Il tiro sta
  // **prima** delle candidate e non dentro il ciclo, cosi' la sequenza del PRNG
  // resta indipendente da quale voce reggera'.
  const start = forced !== null ? 0 : preferredStart(random, ops.length);
  const candidates = ops.map((op) => applyOp(random, op, prev, box.face));
  // Anche queste si costruiscono sempre, come le altre: chi consuma tiri li
  // consuma comunque, o la sequenza dipenderebbe da quale candidata ha retto.
  const spares = spare.map((op) => applyOp(random, op, prev, box.face));

  // Sotto la quota franca la fascia resta nell'impronta: uno sbalzo che comincia
  // a un voxel da terra e' un ingombro sul marciapiede, non uno sbalzo.
  const minX = grounded ? core.x0 : 0;
  const minY = grounded ? core.y0 : 0;
  const maxX = grounded ? core.x0 + core.w : box.sizeX;
  const maxY = grounded ? core.y0 + core.h : box.sizeY;

  const fits = (candidate: BandRect): boolean => {
    if (candidate.w < GRAMMAR.minBandSide || candidate.h < GRAMMAR.minBandSide) return false;
    if (candidate.x0 < minX || candidate.y0 < minY) return false;
    if (candidate.x0 + candidate.w > maxX || candidate.y0 + candidate.h > maxY) return false;
    return supported(candidate, prev);
  };

  for (let i = 0; i < candidates.length; i++) {
    // Si riparte in cima dopo l'ultima: la voce pescata e' una preferenza, e chi
    // sta sopra di lei nel repertorio resta il ripiego naturale.
    const candidate = candidates[(start + i) % candidates.length];
    if (fits(candidate)) return candidate;
  }

  // **Il proprio ramo e' esaurito: si prova l'altro.** Non e' una comodita': su
  // una torre matura il corpo tocca `minBandSide` entro le prime fasce, e da li'
  // in su *nessuna* rientranza regge — il ramo che rimpicciolisce e' finito
  // mentre quello che sposta e allarga e' intatto. Senza questo passaggio la
  // fascia ripeteva quella sotto per tutta la salita, ed era il vero motivo per
  // cui ogni torre della citta' saliva come una canna identica alle altre.
  for (const candidate of spares) {
    if (fits(candidate)) return candidate;
  }

  // Nemmeno l'altro repertorio regge: la fascia ripete quella sotto. Succede
  // sulle impronte strette, dove non c'e' spazio per muoversi affatto.
  return prev;
}

/**
 * Da quale voce del repertorio si comincia a provare.
 *
 * **La preferenza resta, il decreto no.** Prendere sempre la prima che regge
 * faceva del repertorio un elenco di una voce sola: le altre comparivano solo
 * dove la testa non stava in piedi, cioe' in cima alle torri e da nessun'altra
 * parte. Misurato su quattrocento semi, un `officeTower` di livello sei dava la
 * **stessa identica sagoma nel 96% dei casi**, e il ripiego residenziale — che
 * di voci ne ha quattro — ne usava due.
 *
 * Il minimo di due tiri e' una triangolare, ed e' la forma giusta della
 * distribuzione: la testa resta la piu' probabile — su quattro voci la pesca il
 * 44% delle volte, contro il 6% dell'ultima — quindi «questo uso arretra
 * profondo quando puo'» continua a essere vero, ma smette di essere l'unica
 * cosa che quell'uso sa fare.
 *
 * Due tiri e non uno perche' devono essere **sempre due**: consumarne un numero
 * variabile legherebbe la sequenza del PRNG all'esito, che e' l'invariante che
 * questo file esiste per proteggere.
 */
function preferredStart(random: () => number, count: number): number {
  const first = pickInt(random, 0, count - 1);
  const second = pickInt(random, 0, count - 1);
  return Math.min(first, second);
}

/** Applica una voce del repertorio. Chi non consuma tiri, non ne consuma. */
export function applyOp(random: () => number, op: BandOp, prev: BandRect, face: number): BandRect {
  switch (op) {
    case BAND_OP.keep:
      return prev;
    case BAND_OP.shrink:
      return shrink(prev, STEP);
    case BAND_OP.shrinkOneSide:
      return shrinkOneSide(random, prev);
    case BAND_OP.jog:
      return jog(random, prev);
    case BAND_OP.grow:
      return grow(random, prev);
    case BAND_OP.setback:
      return setback(random, prev);
    case BAND_OP.shear:
      return shear(random, prev);
    case BAND_OP.corner:
      return corner(random, prev);
    case BAND_OP.jut:
      return jut(prev, face);
    default:
      return stack(prev);
  }
}

/**
 * Allarga la fascia di due verso la strada: lo sbalzo.
 *
 * Non consuma tiri, come `shrink` e `stack`, e per la stessa ragione: deve dare
 * sempre la stessa cosa. Un tiro qui vorrebbe dire che due edifici sullo stesso
 * seme sporgono di misura diversa a seconda di quale strada guardano.
 *
 * L'appoggio regge per costruzione — la fascia copre tutta quella sotto piu' due
 * colonne — quindi `supported` passa senza che serva un caso a parte, e cio' che
 * ferma lo sbalzo e' solo il bordo dell'inviluppo.
 */
function jut(prev: BandRect, face: number): BandRect {
  switch (face) {
    case 0:
      return { ...prev, w: prev.w + 2 };
    case 1:
      return { ...prev, x0: prev.x0 - 2, w: prev.w + 2 };
    case 2:
      return { ...prev, h: prev.h + 2 };
    default:
      return { ...prev, y0: prev.y0 - 2, h: prev.h + 2 };
  }
}

/**
 * Scarto laterale di due passi: `jog` a scala leggibile.
 *
 * Consuma un tiro come `jog`, e con lo stesso intervallo: le due sono la stessa
 * scelta a due scale, e dargli intervalli diversi renderebbe la sequenza del
 * PRNG dipendente da quale delle due il repertorio elenca per prima. Due passi
 * sono il cubo di terreno intero sul modulo di partenza, e lo scarto che produce
 * le pile sfalsate — una fascia che sporge da una parte e rientra dall'altra.
 */
function shear(random: () => number, rect: BandRect): BandRect {
  const off = 2 * STEP;
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + off };
    case 1:
      return { ...rect, x0: rect.x0 - off };
    case 2:
      return { ...rect, y0: rect.y0 + off };
    default:
      return { ...rect, y0: rect.y0 - off };
  }
}

/**
 * Stringe un asse e allarga l'altro, tenendo il centro.
 *
 * Il ricentro e' cio' che la distingue da una coppia `shrinkOneSide` + `grow`:
 * senza, il rettangolo scivolerebbe in diagonale a ogni applicazione e due
 * `corner` di fila porterebbero il corpo fuori dall'impronta invece di girarlo.
 */
function corner(random: () => number, rect: BandRect): BandRect {
  const off = STEP;
  const side = 2 * STEP;
  if (pickInt(random, 0, 1) === 0) {
    return { x0: rect.x0 + off, y0: rect.y0 - off, w: rect.w - side, h: rect.h + side };
  }
  return { x0: rect.x0 - off, y0: rect.y0 + off, w: rect.w + side, h: rect.h - side };
}

/** Rientranza di un passo su un lato solo: produce le terrazze asimmetriche. */
function shrinkOneSide(random: () => number, rect: BandRect): BandRect {
  const off = STEP;
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + off, w: rect.w - off };
    case 1:
      return { ...rect, w: rect.w - off };
    case 2:
      return { ...rect, y0: rect.y0 + off, h: rect.h - off };
    default:
      return { ...rect, h: rect.h - off };
  }
}

/** Scarto laterale di un passo a parita' di dimensione: la fascia sporge da un lato. */
function jog(random: () => number, rect: BandRect): BandRect {
  const off = STEP;
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + off };
    case 1:
      return { ...rect, x0: rect.x0 - off };
    case 2:
      return { ...rect, y0: rect.y0 + off };
    default:
      return { ...rect, y0: rect.y0 - off };
  }
}

/** Allargamento di un passo su un lato, dentro il riquadro. */
function grow(random: () => number, rect: BandRect): BandRect {
  const off = STEP;
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 - off, w: rect.w + off };
    case 1:
      return { ...rect, w: rect.w + off };
    case 2:
      return { ...rect, y0: rect.y0 - off, h: rect.h + off };
    default:
      return { ...rect, h: rect.h + off };
  }
}

/**
 * Arretramento di due passi su un lato: la rientranza in cui ci si sta.
 *
 * Un passo di scarto lascia un anello largo uno, che a distanza di gioco e' un
 * gradino e non una terrazza — e infatti `terraceMinRing` lo scarta. Due passi
 * sono un cubo di terreno intero: e' la piu' piccola rientranza che la
 * pavimentazione, il parapetto e un giardino riescano a raccontare.
 */
function setback(random: () => number, rect: BandRect): BandRect {
  const off = 2 * STEP;
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + off, w: rect.w - off };
    case 1:
      return { ...rect, w: rect.w - off };
    case 2:
      return { ...rect, y0: rect.y0 + off, h: rect.h - off };
    default:
      return { ...rect, h: rect.h - off };
  }
}

/**
 * Corpo sovrapposto: rientra di due passi per lato e si ricentra.
 *
 * Non consuma tiri, come `shrink`, ed e' voluto: `stack` deve dare *sempre* la
 * stessa cosa — una torre che riparte, non una torre che si sposta. Il ricentro
 * garantisce l'appoggio su tutta l'area, quindi `supported` passa per
 * costruzione e la mensola non c'entra: qui non sporge niente.
 */
function stack(rect: BandRect): BandRect {
  const w = rect.w - 4 * STEP;
  const h = rect.h - 4 * STEP;
  // Il corpo che riparte deve restare un corpo: sotto `MIN_FOOTPRINT` non e' un
  // volume nuovo ma il resto del precedente, e su una torre alta `stack` a ogni
  // fascia porterebbe la cima a un voxel in quattro passi. Chiedere che il
  // risultato sia ancora un edificio limita l'operazione a una o due volte per
  // silhouette senza contare nulla: e' la geometria a esaurirla.
  if (w < MIN_FOOTPRINT || h < MIN_FOOTPRINT) return { ...rect, w: 0, h: 0 };
  return { x0: rect.x0 + 2 * STEP, y0: rect.y0 + 2 * STEP, w, h };
}
