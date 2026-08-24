import { unitAt } from '../rng';
import { TERRACE, TERRAIN } from './config';

/**
 * La scala di quote su cui il terreno si posa, e il ciglio che ne esce.
 *
 * Il campo di altezza e' continuo e dolce — il vincolo di Lipschitz in
 * `heightField.ts` lo tiene sotto un voxel di dislivello per colonna — quindi
 * **la montagna non la fa il rilievo, la fa la quantizzazione**. Finche' ogni
 * cella si posava sul multiplo di `cellSize` sotto di se', due celle contigue
 * non potevano differire di piu' di un cubo e l'isola usciva a curve di livello
 * tutte identiche. Qui la pedata si allarga con la quota: dove il passo vale
 * otto voxel, lo stesso fianco di prima produce un muro di otto.
 *
 * **La proprieta' che regge tutto.** La scala e' monotona e ogni pedata e' larga
 * almeno `cellSize`, cioe' piu' del dislivello massimo fra due celle contigue
 * (meno di due voxel, misurato su otto seed in `heightField.test.ts`). Due celle
 * contigue cadono percio' o sulla stessa pedata o su due contigue: il salto
 * peggiore possibile e' **un'alzata**, e quindi al massimo `TERRACE.maxStep`.
 * Non serve un clamp, non serve un controllo a valle, e il generatore non puo'
 * produrre un dirupo piu' alto di quello dichiarato nemmeno per un seed
 * sfortunato.
 *
 * L'altra faccia della stessa medaglia e' il **ciglio**: dove il salto supera un
 * cubo la superficie non e' piu' un prato in pendenza ma il bordo di un
 * gradone, e chi lo legge — il colore della cella, l'edificabilita', le
 * sporgenze — lo chiede qui.
 */

/**
 * Alzata che parte dalla quota `base`, in voxel.
 *
 * Cresce di una cella ogni `growth` voxel sopra `fromHeight` e si ferma a
 * `maxStep`. E' valutata sulla **base** della pedata e non sulla quota
 * campionata: e' quello che rende la scala una funzione della sola posizione
 * nella scala, e quindi ricostruibile allo stesso modo da chiunque.
 */
export function terraceStepAt(base: number): number {
  const above = base - TERRACE.fromHeight;
  const grown = TERRAIN.cellSize * (1 + Math.floor(Math.max(0, above) / TERRACE.growth));
  return Math.min(TERRACE.maxStep, grown);
}

/**
 * La scala, tabulata una volta sola: quota intera -> base della sua pedata.
 *
 * Tabellare invece di invertire la formula non e' un'ottimizzazione ma la sola
 * definizione onesta: l'alzata dipende da dove comincia la pedata, quindi la
 * scala si costruisce salendo, e cercare la pedata di una quota con
 * un'espressione chiusa vorrebbe dire riscrivere la stessa regola due volte.
 * Sono ottantuno interi.
 */
const LADDER = buildLadder();

function buildLadder(): Int16Array {
  const ladder = new Int16Array(TERRAIN.maxHeight + 1);
  for (let base = 0; base <= TERRAIN.maxHeight; base += terraceStepAt(base)) {
    const end = Math.min(TERRAIN.maxHeight, base + terraceStepAt(base) - 1);
    for (let z = base; z <= end; z++) ladder[z] = base;
  }
  return ladder;
}

/** Quota su cui la cella si posa, seguendo la scala. Sempre multipla della cella. */
export function terraceOf(height: number): number {
  if (height <= 0) return 0;
  const z = Math.floor(height);
  return LADDER[z >= TERRAIN.maxHeight ? TERRAIN.maxHeight : z];
}

/**
 * La stessa scala, ma la cella ci arriva con la propria quota **scossa**.
 *
 * **E' cio' che toglie ai gradoni la faccia di curva di livello.** Il campo e'
 * dolce e la scala e' esatta, quindi il ciglio cade dove il campo attraversa una
 * quota tonda: su una cupola sono cerchi concentrici, e a schermo si leggono come
 * scalini disegnati col compasso invece che come una scarpata. Scuotendo la quota
 * prima di posarla, la stessa scala restituisce un ciglio che vaga.
 *
 * **Il disturbo e' correlato, non un dado per cella.** Due ottave — una lunga che
 * fa serpeggiare il ciglio per decine di colonne, una corta che ne sbrecciar il
 * filo — perche' un rumore bianco per cella non darebbe una scarpata frastagliata
 * ma un bordo sgranato, che a questa scala si legge come sporcizia.
 *
 * **L'ampiezza e' una frazione dell'alzata oltre la cella, e li' sta
 * l'invariante.** In pianura l'alzata *e'* la cella, l'ampiezza e' zero e il
 * terreno resta quello di prima — che e' anche l'unico posto dove la citta'
 * cresce, e un dirupo in mezzo a un isolato sarebbe un dispetto. Piu' su, due
 * celle contigue distano meno di due voxel piu' due ampiezze, e con
 * `TERRACE.jitter` sotto la meta' quel totale resta **sotto la pedata**: due
 * celle continuano a non poter scavallare piu' di un'alzata, che e' la proprieta'
 * su cui si regge tutto il resto.
 */
export function terraceAt(seed: number, cellX: number, cellY: number, height: number): number {
  const base = terraceOf(height);
  const amplitude = TERRACE.jitter * (terraceStepAt(base) - TERRAIN.cellSize);
  if (amplitude <= 0) return base;
  return terraceOf(height + amplitude * jitterAt(seed, cellX, cellY));
}

/** Il disturbo in `[-1, 1]`: due ottave di rumore di valore sul reticolo di celle. */
function jitterAt(seed: number, cellX: number, cellY: number): number {
  const salt = seed ^ TERRACE.jitterSalt;
  const wide = valueNoise(salt, cellX / TERRACE.jitterSpan, cellY / TERRACE.jitterSpan);
  const fine = valueNoise(
    salt ^ 0x9e37,
    cellX / TERRACE.jitterDetail,
    cellY / TERRACE.jitterDetail,
  );
  return (2 * (TERRACE.jitterMix * wide + (1 - TERRACE.jitterMix) * fine)) - 1;
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
