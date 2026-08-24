/**
 * Lo smusso: come si esce dall'angolo retto senza imparare a disegnare un
 * cerchio.
 *
 * **Non e' una primitiva ma un modificatore della pianta.** Una scatola smussata
 * e' un tamburo, una scatola cava smussata un anello ottagonale, una piramide a
 * gradoni smussata una cupola, una torre smussata una torre a otto facce: quattro
 * forme per un parametro invece che per quattro voci di vocabolario.
 *
 * **Vive alla radice di `src/world/` perche' lo usano due domini.** I landmark ce
 * l'hanno da sempre come `Part.chamfer`; gli edifici lo prendono da
 * `TypologyShape.chamfer`. Tenerlo dentro uno dei due avrebbe costretto l'altro a
 * importarlo da li' — cioe' a dipendere da un dominio che non usa — ed e' la
 * stessa regola che ha prodotto `hierarchy.ts` e `urbanForm.ts`. In due copie
 * divergerebbe al primo ritocco, e le due copie disegnerebbero due ottagoni
 * diversi.
 *
 * **Il taglio e' la diagonale di Manhattan**: cade la cella la cui somma delle
 * distanze dai due bordi piu' vicini sta sotto la soglia. Resta simmetrica allo
 * scambio degli assi, che e' la condizione perche' `orientPart` possa ruotare una
 * parte senza cambiarne il conto di voxel — e la stessa che tiene un edificio
 * smussato uguale a se stesso sui quattro versi d'accento.
 */

/**
 * true se la cella sta dentro la pianta, cioe' se lo smusso non l'ha tagliata.
 *
 * Accetta coordinate fuori dal riquadro e risponde `false`: e' cio' che permette
 * a `onPlanEdge` di chiedere dei vicini senza controllare prima i bordi.
 */
export function inPlan(lx: number, ly: number, w: number, h: number, chamfer: number): boolean {
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
  if (chamfer <= 0) return true;
  return Math.min(lx, w - 1 - lx) + Math.min(ly, h - 1 - ly) >= chamfer;
}

/**
 * true se la cella e' sul bordo della pianta: le manca un vicino in piano.
 *
 * E' la generalizzazione del perimetro, e senza smusso ci ricade esattamente —
 * `lx === 0 || ly === 0 || ...` e' lo stesso insieme. Serve perche' una scatola
 * cava smussata ha il bordo *sulla diagonale*, dove il test per coordinate non
 * guarda: chiedere ai vicini invece che agli indici e' l'unico modo di far
 * valere lo smusso su tutte le primitive che hanno un perimetro.
 */
export function onPlanEdge(lx: number, ly: number, w: number, h: number, chamfer: number): boolean {
  if (!inPlan(lx, ly, w, h, chamfer)) return false;
  return !inPlan(lx - 1, ly, w, h, chamfer) || !inPlan(lx + 1, ly, w, h, chamfer) ||
    !inPlan(lx, ly - 1, w, h, chamfer) || !inPlan(lx, ly + 1, w, h, chamfer);
}
