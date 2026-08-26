/**
 * Il rettangolo di una fascia, e l'algebra che lo muove.
 *
 * **E' il fondo dello strato**: non conosce il repertorio, non conosce il
 * coronamento e non conosce il PRNG. Sa solo cosa sia un rettangolo dentro il
 * riquadro dell'impronta e quali trasformazioni lo lasciano un rettangolo.
 *
 * Vive separato da `bandOps.ts` perche' i suoi due lettori non sono lo stesso
 * lavoro: la grammatica muove le fasce del corpo, il coronamento le chiude, e
 * `shrink` serve a tutti e due. Tenerlo dentro uno dei due avrebbe costretto
 * l'altro a importarlo da li', cioe' a dipendere da una regola che non usa.
 */

/** Rettangolo di una fascia dentro il riquadro dell'impronta, estremi esclusi in alto. */
export interface BandRect {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
}

/**
 * true se la fascia poggia su almeno meta' della propria area.
 *
 * E' il vincolo che tiene insieme una mensola e un blocco sospeso. Senza, due
 * spostamenti di un voxel nella stessa direzione staccherebbero la fascia dal
 * suo appoggio, e l'edificio avrebbe un pezzo per aria.
 */
export function supported(rect: BandRect, below: BandRect): boolean {
  const overlapX = Math.min(rect.x0 + rect.w, below.x0 + below.w) - Math.max(rect.x0, below.x0);
  const overlapY = Math.min(rect.y0 + rect.h, below.y0 + below.h) - Math.max(rect.y0, below.y0);
  if (overlapX <= 0 || overlapY <= 0) return false;
  return overlapX * overlapY * 2 >= rect.w * rect.h;
}

/** true se la colonna cade dentro il rettangolo della fascia. */
export function inside(rect: BandRect, sx: number, sy: number): boolean {
  return sx >= rect.x0 && sx < rect.x0 + rect.w && sy >= rect.y0 && sy < rect.y0 + rect.h;
}

/** true se la colonna non tocca il perimetro della fascia: il cuore piantabile. */
export function inset(rect: BandRect, sx: number, sy: number): boolean {
  return sx > rect.x0 && sx < rect.x0 + rect.w - 1 &&
    sy > rect.y0 && sy < rect.y0 + rect.h - 1;
}

/**
 * Rientranza centrata di `step` voxel per lato, che non svuota mai il rettangolo.
 *
 * Il passo e' l'unita' degli scarti di fascia (vedi `scale.bandStepOf`): a un
 * voxel per lato sul modulo di partenza, a due sul modulo raddoppiato. Il minimo
 * a 1 non e' una comodita': un lato di due voxel rientrato di uno per parte
 * resterebbe largo zero, e il coronamento sparirebbe proprio sugli edifici piu'
 * piccoli — dove si nota di piu', perche' la loro silhouette e' quasi tutta cima.
 */
export function shrink(rect: BandRect, step = 1): BandRect {
  const w = Math.max(1, rect.w - 2 * step);
  const h = Math.max(1, rect.h - 2 * step);
  return {
    x0: rect.x0 + ((rect.w - w) >> 1),
    y0: rect.y0 + ((rect.h - h) >> 1),
    w,
    h,
  };
}

/**
 * Rientranza di `step` voxel per lato sul solo asse corto.
 *
 * Serve al coronamento `ridge` e a nient'altro: rientrare su entrambi gli assi
 * darebbe un cappello, rientrare sull'asse lungo darebbe una lama. A parita' di
 * lato sceglie x, cosi' resta una funzione della sola forma e non del seme.
 */
export function shrinkAxis(rect: BandRect, step = 1): BandRect {
  if (rect.w <= rect.h) {
    const w = Math.max(1, rect.w - 2 * step);
    return { ...rect, x0: rect.x0 + ((rect.w - w) >> 1), w };
  }
  const h = Math.max(1, rect.h - 2 * step);
  return { ...rect, y0: rect.y0 + ((rect.h - h) >> 1), h };
}

/**
 * I due aiuti numerici che l'algebra dei rettangoli condivide con chi la chiama.
 *
 * Stanno qui e non in un modulo di utilita' perche' hanno esattamente questi
 * lettori: le trasformazioni di fascia e il montaggio che le ordina. Un file di
 * `utils` li renderebbe disponibili a mezzo progetto senza che nessuno li
 * chieda.
 */

/** Intero uniforme in `[min, max]`, estremi inclusi. */
export function pickInt(random: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
