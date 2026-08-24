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
