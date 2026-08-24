import { unitAt } from '../rng';
import { TERRACE, TERRAIN } from './config';

/**
 * Le scale di quota su cui il terreno si posa, e il ciglio che ne esce.
 *
 * Il campo di altezza e' continuo e dolce — il vincolo di Lipschitz in
 * `heightField.ts` lo tiene sotto un voxel di dislivello per colonna — quindi
 * **la montagna non la fa il rilievo, la fa la quantizzazione**. Finche' ogni
 * cella si posava sul multiplo di `cellSize` sotto di se', due celle contigue
 * non potevano differire di piu' di un cubo e l'isola usciva a curve di livello
 * tutte identiche. La pedata si allarga percio' con la quota: dove il passo vale
 * otto voxel, lo stesso fianco di prima produce un muro di otto.
 *
 * **Ma una scala sola da' un muro solo, ed e' un teorema e non una taratura.**
 * Se l'alzata e' funzione della sola quota, tutte le celle di una fascia ne
 * condividono una; e siccome due celle contigue cadono su pedate contigue, il
 * salto fra loro vale *esattamente un'alzata*. Ogni parete della fascia esce
 * percio' alta uguale — per tutto il suo sviluppo e su tutta l'isola — e nessun
 * disturbo in pianta puo' cambiarlo, perche' spostare il ciglio non ne cambia
 * il salto. Le scale sono percio' `TERRACE.beddings`, con alzate diverse alle
 * stesse quote, e un campo in pianta dice quale tocca a ogni cella: due celle
 * contigue su scale diverse cadono su pedate che non si corrispondono, e il
 * salto varia dove varia la stratificazione.
 *
 * **La proprieta' che regge tutto, ed e' piu' forte di quella di prima.** Ogni
 * scala posa su un multiplo di `cellSize` che sta a meno di `maxStep` sotto la
 * quota vera: `x - maxStep < L(x) <= x`. Per due celle contigue con quote
 * continue `h1` e `h2`, e chiamando `d < cellSize` il loro dislivello massimo
 * (meno di 1,6 voxel, misurato su otto seed in `heightField.test.ts`):
 *
 *     L_a(h1) - L_b(h2) < h1 - (h2 - maxStep) <= d + maxStep
 *
 * Entrambi i valori sono multipli di `cellSize` e lo e' anche `maxStep`, quindi
 * il salto e' al piu' `maxStep` — **comunque siano scelte le due scale**. Non
 * serve un clamp, non serve un controllo a valle, e il generatore non puo'
 * produrre un dirupo piu' alto di quello dichiarato nemmeno per un seed
 * sfortunato. L'unica premessa e' `d < cellSize`, che e' la stessa di prima.
 *
 * L'altra faccia della stessa medaglia e' il **ciglio**: dove il salto supera un
 * cubo la superficie non e' piu' un prato in pendenza ma il bordo di un
 * gradone, e chi lo legge — il colore della cella, l'edificabilita', le
 * sporgenze — lo chiede qui.
 */

/** Quote intere indicizzate da una scala: da zero al tetto, estremi compresi. */
const RUNGS = TERRAIN.maxHeight + 1;

/**
 * La tacca di schedule di una pedata che parte da `base`: l'alzata **attesa** a
 * quella quota, prima che la stratificazione la scosti.
 *
 * Cresce di una cella ogni `growth` voxel sopra `fromHeight` e si ferma a
 * `maxStep`. E' valutata sulla **base** della pedata e non sulla quota
 * campionata: e' quello che rende la scala una funzione della sola posizione
 * nella scala, e quindi ricostruibile allo stesso modo da chiunque.
 *
 * E' esportata perche' e' cio' rispetto a cui `spread` e' dichiarato — «l'alzata
 * non si allontana di piu' di una cella dalla propria tacca» e' un'affermazione
 * su questa funzione, e va verificata contro di essa e non contro una copia.
 */
export function terraceScheduleAt(base: number): number {
  const above = base - TERRACE.fromHeight;
  const grown = TERRAIN.cellSize * (1 + Math.floor(Math.max(0, above) / TERRACE.growth));
  return Math.min(TERRACE.maxStep, grown);
}

/**
 * Alzata che parte dalla quota `base` sulla stratificazione `bedding`, in voxel.
 *
 * E' la tacca di schedule scostata di `spread` celle verso il basso o verso
 * l'alto a seconda della stratificazione: dove la tacca dice quattro, la roccia
 * fine sale a due, quella media a quattro, quella massiccia a sei.
 *
 * **Lo scarto e' sistematico e non estratto, ed e' la seconda volta che questo
 * modulo sceglie una regola invece di un dado.** Un'alzata tirata a sorte per
 * ogni pedata sembrava dare piu' varieta' e ne dava meno: due scale che pescano
 * dallo stesso ventaglio si ritrovano di continuo sulla stessa pedata, e da li'
 * in poi sono la stessa scala — misurate, tre scale su quattro condividevano
 * ogni base fino a quota 66, e la parete tornava alta uguale. Una stratificazione
 * che sale sempre a passo suo invece diverge e resta divergente, che e' quello
 * che serve, ed e' anche cio' che una stratificazione **e'**: uno spessore di
 * strato caratteristico, non una sequenza di spessori casuali.
 *
 * Il ventaglio si appoggia al tetto quando la tacca ci arriva vicino — `high`
 * prima, `low` dedotta da quella — o sopra la fascia rocciosa due
 * stratificazioni su tre finirebbero schiacciate su `maxStep`.
 *
 * Sotto `fromHeight` la tacca vale gia' una cella e non c'e' niente sotto cui
 * scendere: tutte le stratificazioni **coincidono**, e la pianura resta quella
 * di sempre indipendentemente da quale scala la tocchi.
 */
function riserFor(bedding: number, base: number): number {
  const notch = terraceScheduleAt(base);
  if (notch <= TERRAIN.cellSize) return TERRAIN.cellSize;

  const reach = TERRACE.spread * TERRAIN.cellSize;
  const high = Math.min(TERRACE.maxStep, notch + reach);
  const low = Math.max(TERRAIN.cellSize, high - (TERRACE.beddings - 1) * TERRAIN.cellSize);
  return Math.min(high, low + bedding * TERRAIN.cellSize);
}

/**
 * Le scale, tabulate una volta sola: `(stratificazione, quota intera)` -> base
 * della sua pedata, e alzata di quella pedata.
 *
 * Tabellare invece di invertire la formula non e' un'ottimizzazione ma la sola
 * definizione onesta: l'alzata dipende da dove comincia la pedata, quindi la
 * scala si costruisce salendo, e cercare la pedata di una quota con
 * un'espressione chiusa vorrebbe dire riscrivere la stessa regola due volte.
 * Sono quattro volte ottantuno interi, due volte.
 *
 * `RISERS` esiste perche' `terraceStepAt` resti una lettura: chi ha in mano una
 * quota gia' posata non deve poter ricamminare la scala per sapere quanto e'
 * alta la propria pedata, o sarebbero due letture della stessa regola.
 */
const LADDERS = new Int16Array(TERRACE.beddings * RUNGS);
const RISERS = new Int16Array(TERRACE.beddings * RUNGS);

buildLadders();

function buildLadders(): void {
  for (let bedding = 0; bedding < TERRACE.beddings; bedding++) {
    const row = bedding * RUNGS;
    for (let base = 0; base <= TERRAIN.maxHeight;) {
      const riser = riserFor(bedding, base);
      const end = Math.min(TERRAIN.maxHeight, base + riser - 1);
      for (let z = base; z <= end; z++) {
        LADDERS[row + z] = base;
        RISERS[row + z] = riser;
      }
      base += riser;
    }
  }
}

/** La quota intera con cui si interroga una scala, dentro i suoi estremi. */
function rung(height: number): number {
  if (height <= 0) return 0;
  const z = Math.floor(height);
  return z >= TERRAIN.maxHeight ? TERRAIN.maxHeight : z;
}

/** Quota su cui la cella si posa, seguendo la scala. Sempre multipla della cella. */
export function terraceOf(height: number, bedding: number): number {
  return LADDERS[bedding * RUNGS + rung(height)];
}

/** Alzata della pedata che porta questa quota, sulla stessa scala. */
export function terraceStepAt(base: number, bedding: number): number {
  return RISERS[bedding * RUNGS + rung(base)];
}

/**
 * La quota della cella, posata sulla scala che le tocca.
 *
 * **E' cio' che toglie ai gradoni la faccia di curva di livello, ed e' anche
 * cio' che toglie alla parete l'altezza costante.** Il campo e' dolce e una
 * scala e' esatta, quindi con una scala sola il ciglio cadrebbe dove il campo
 * attraversa una quota tonda: su una cupola sono cerchi concentrici, e a schermo
 * si leggono come scalini disegnati col compasso invece che come una scarpata.
 * Le pedate di due stratificazioni cadono a quote diverse, quindi il ciglio di
 * una data quota cade a raggi diversi dove la stratificazione cambia — la curva
 * si spezza — e due celle affiancate possono distare due, quattro, sei o otto
 * voxel invece dell'unica alzata della loro fascia.
 *
 * **Il campo e' correlato, non un dado per cella.** Due ottave — una lunga che
 * da' carattere a un versante intero, una corta che spezza la singola scarpata
 * lungo la sua corsa — perche' un rumore bianco per cella non darebbe una parete
 * frastagliata ma un terreno sgranato, che a questa scala si legge come
 * sporcizia.
 */
export function terraceAt(seed: number, cellX: number, cellY: number, height: number): number {
  return terraceOf(height, beddingAt(seed, cellX, cellY));
}

/**
 * Stratificazione della cella: un indice in `[0, beddings)`.
 *
 * **Il campo va allargato prima di quantizzarlo, o meta' delle scale non verrebbe
 * mai usata.** Il rumore di valore e' una miscela bilineare di quattro angoli, e
 * mescolarne due ottave stringe ancora: il campo grezzo vive quasi tutto attorno
 * alla meta', quindi le stratificazioni centrali si prendevano il 91% dell'isola
 * e le estreme il 9%. Le scale erano quattro dichiarate e due sul terreno — e il
 * salto tornava ad avere pochi valori, cioe' il difetto che si era andati a
 * togliere. `beddingContrast` riporta l'intervallo utile su tutto `[0, 1)`.
 */
function beddingAt(seed: number, cellX: number, cellY: number): number {
  const salt = seed ^ TERRACE.beddingSalt;
  const wide = valueNoise(salt, cellX / TERRACE.beddingSpan, cellY / TERRACE.beddingSpan);
  const near = valueNoise(
    salt ^ 0x9e37,
    cellX / TERRACE.beddingBreak,
    cellY / TERRACE.beddingBreak,
  );
  const mixed = TERRACE.beddingMix * wide + (1 - TERRACE.beddingMix) * near;
  const spread = (mixed - 0.5) * TERRACE.beddingContrast + 0.5;
  const clamped = spread <= 0 ? 0 : spread >= 1 ? 1 - Number.EPSILON : spread;
  return Math.min(TERRACE.beddings - 1, Math.floor(clamped * TERRACE.beddings));
}

/** Rumore di valore in `[0, 1)`: quattro angoli e un'interpolazione C1. */
function valueNoise(salt: number, gx: number, gy: number): number {
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smoothstep(gx - x0);
  const fy = smoothstep(gy - y0);
  const top = mix(unitAt(salt, x0, y0), unitAt(salt, x0 + 1, y0), fx);
  const bottom = mix(unitAt(salt, x0, y0 + 1), unitAt(salt, x0 + 1, y0 + 1), fx);
  return mix(top, bottom, fy);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Quota su cui la cella si posa a passo fisso di una cella.
 *
 * E' la scala di prima, e resta viva dove il terrazzamento non deve arrivare:
 * dentro la conca di un lago, dove il fondo e la sponda sono tarati sui sei
 * voxel di `basinDrop` e un'alzata da otto se li mangerebbe interi — lo specchio
 * uscirebbe dal bassofondo, o peggio la sponda scenderebbe sotto il proprio pelo
 * e il lago colerebbe a valle.
 */
export function cellFloor(height: number): number {
  return Math.floor(height / TERRAIN.cellSize) * TERRAIN.cellSize;
}

/**
 * Dislivello oltre il quale la cella e' un ciglio.
 *
 * Un cubo di scarto e' il gradino che il terreno sa fare da sempre e non e' una
 * parete; da due cubi in su c'e' una faccia verticale che si vede, e quella
 * faccia e' roccia.
 */
export function isCliff(drop: number): boolean {
  return drop > TERRAIN.cellSize;
}
