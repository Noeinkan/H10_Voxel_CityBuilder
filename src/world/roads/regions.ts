import { ROADS } from './config';
import { TRACE_STEPS, type RoadProbe, type TraceBounds } from './trace';

/**
 * Quali colonne del riquadro si raggiungono a vicenda: la terraferma, le isole,
 * i ripiani chiusi da una parete.
 *
 * **Serve a non cercare un cammino che non c'e'.** `traceRoad` non ha modo di
 * arrendersi in anticipo: finche' la coda non e' vuota un cammino potrebbe
 * esistere, quindi un polo irraggiungibile paga la scansione di **tutta** la
 * propria regione prima di restituire null. Su una citta' matura erano 244 mila
 * colonne per polo, e i poli irraggiungibili erano trentatre: da soli facevano
 * la quasi totalita' dei dodici-diciassette secondi di una ricostruzione.
 * Etichettare il riquadro una volta costa una passata; confrontare due etichette
 * costa due letture.
 *
 * **Perche' la risposta e' esatta e non una stima.** Il passo da una colonna a
 * una vicina e' permesso se nella seconda si puo' entrare — `costAt` finito — e
 * se il dislivello sta sotto `maxRise`. Fra colonne in cui si entra la relazione
 * e' **simmetrica**: il dislivello e' lo stesso nei due versi, quindi «si
 * raggiungono a vicenda» e' una partizione vera e non un ordine. Da li' segue il
 * resto: la radice e ogni colonna di carreggiata stanno nella stessa regione —
 * un ramo e' fatto di colonne in cui la ricerca e' **entrata** — quindi un polo
 * di un'altra regione non ha nessuna carreggiata da raggiungere, ne' adesso ne'
 * dopo che l'albero e' cresciuto.
 *
 * Il costo in piu' non e' zero: la passata interroga la sonda su ogni colonna del
 * riquadro, anche su quelle che le ricerche non avrebbero guardato. Si paga
 * volentieri perche' la sonda di `RoadNetwork` tiene da parte le proprie
 * risposte: quelle letture non sono sprecate, sono le stesse che le ricerche
 * avrebbero fatto dopo, e arrivano prima.
 */

export interface RoadRegions {
  /**
   * L'etichetta della regione di questa colonna, o -1 se non ci si entra.
   *
   * `-1` non vuol dire «fuori»: vuol dire che un cammino in quella colonna non
   * ci mette piede — acqua oltre la campata, o mondo non generato. Una colonna
   * cosi' puo' comunque essere il **punto di partenza** di una ricerca, perche'
   * `traceRoad` non chiede il costo del proprio capo: chi legge questa etichetta
   * per arrendersi deve tenerne conto.
   */
  readonly labelAt: (x: number, y: number) => number;
  /** Quante regioni distinte ha il riquadro. */
  readonly count: number;
}

/** Le regioni del riquadro, con la stessa regola di passo di `traceRoad`. */
export function roadRegions(bounds: TraceBounds, probe: RoadProbe): RoadRegions {
  const width = bounds.x1 - bounds.x0 + 1;
  const height = bounds.y1 - bounds.y0 + 1;
  if (width <= 0 || height <= 0) return { labelAt: () => -1, count: 0 };

  const cells = width * height;
  const label = new Int32Array(cells).fill(-1);
  const level = new Float64Array(cells);
  // Della colonna serve sapere solo **se ci si entra**, e il costo vero non
  // cambia nessuna etichetta: un muro e un prato stanno nella stessa regione se
  // il gradino fra loro e' basso. Chi decide quanto costa girarci attorno e' la
  // ricerca, dopo.
  const open = new Uint8Array(cells);

  for (let ly = 0, at = 0; ly < height; ly++) {
    const y = bounds.y0 + ly;
    for (let lx = 0; lx < width; lx++, at++) {
      const x = bounds.x0 + lx;
      level[at] = probe.levelAt(x, y);
      open[at] = probe.costAt(x, y) < Number.POSITIVE_INFINITY ? 1 : 0;
    }
  }

  // Una pila esplicita e non la ricorsione: la regione piu' grande e' l'isola
  // intera, e una catena di duecentomila chiamate non sta nello stack. La
  // capacita' e' il numero di colonne perche' ognuna si etichetta **prima** di
  // entrare in pila, quindi nessuna ci entra due volte.
  const stack = new Int32Array(cells);
  let count = 0;

  for (let seed = 0; seed < cells; seed++) {
    if (open[seed] === 0 || label[seed] !== -1) continue;
    const id = count++;
    label[seed] = id;
    let top = 0;
    stack[top++] = seed;

    while (top > 0) {
      const at = stack[--top];
      const ax = at % width;
      const ay = (at / width) | 0;
      const here = level[at];

      for (const [dx, dy] of TRACE_STEPS) {
        const nx = ax + dx;
        const ny = ay + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (open[next] === 0 || label[next] !== -1) continue;
        if (Math.abs(level[next] - here) > ROADS.maxRise) continue;
        label[next] = id;
        stack[top++] = next;
      }
    }
  }

  return {
    count,
    labelAt: (x, y) => {
      const lx = x - bounds.x0;
      const ly = y - bounds.y0;
      if (lx < 0 || ly < 0 || lx >= width || ly >= height) return -1;
      return label[ly * width + lx];
    },
  };
}
