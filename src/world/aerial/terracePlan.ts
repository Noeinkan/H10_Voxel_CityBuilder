import { AERIAL } from './config';
import {
  planDeck,
  type AerialProbe,
  type DeckPlan,
  type DeckRect,
  type DeckRefusal,
} from './deckPlan';

/**
 * L'aggetto: la mensola che sporge da un fronte, alla quota di una fascia.
 *
 * **E' la prima cosa in questo progetto che esce dall'impronta.** La grammatica
 * degli edifici lo dice esplicitamente — «la fascia di base resta il riquadro
 * pieno, quindi nessuna fascia puo' uscire dall'impronta e la collisione fra
 * edifici resta bidimensionale». L'aggetto rompe proprio quella riga, ed e'
 * legale perche' il registry confronta gia' gli intervalli di quota colonna per
 * colonna: due volumi sulla stessa colonna a quote disgiunte non si sovrappongono.
 *
 * **La terrazza esiste gia': l'aggetto la continua.** Dove una fascia rientra,
 * la sommita' di quella sotto resta scoperta, e la 4.8 la pavimenta e le mette il
 * parapetto. Qui si parte da li' e si va **fuori**: stessa quota, stesso piano,
 * qualche voxel oltre la facciata. Da questo discende anche il modo di trovarla —
 * si cerca la parete rientrando dal filo dell'impronta, come `highestLanding` in
 * `spans/`, perche' al filo la parete c'e' solo nei primi voxel.
 *
 * **Quanto sporge lo dice quanto e' larga.** Un fronte corto porta una mensola
 * corta; uno lungo ne porta una profonda, e oltre `AERIAL.reach` quella mensola
 * si pianta le proprie gambe — non per una regola sua, ma perche' `planDeck`
 * chiede un appoggio dove lo sbalzo e' troppo.
 */

/** Cio' che serve sapere dell'edificio che ospita. E' un `BuildingRecord` all'osso. */
export interface AerialSupport {
  readonly id: number;
  /** Angolo minimo dell'impronta. */
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /** Prima quota occupata. */
  readonly baseZ: number;
  /** Voxel occupati in altezza a partire da `baseZ`. */
  readonly height: number;
}

/**
 * Le quattro facce, con gli indici di `FACING`.
 *
 * Non si importa `FACING` da `streets/`: questo dominio non sa cosa sia una
 * strada, e la faccia qui e' una direzione geometrica. Gli indici coincidono
 * perche' e' comodo a chi chiama, non perche' i due significati siano lo stesso.
 */
export const AERIAL_FACE = { east: 0, west: 1, north: 2, south: 3 } as const;
export type AerialFace = (typeof AERIAL_FACE)[keyof typeof AERIAL_FACE];

export const AERIAL_FACES: readonly AerialFace[] = [0, 1, 2, 3];

export interface TerraceQuery extends AerialProbe {
  readonly host: AerialSupport;
  /** Le facce da provare, nell'ordine. Chi chiama toglie quelle gia' occupate. */
  readonly faces: readonly AerialFace[];
}

export interface TerracePlan {
  readonly host: number;
  readonly face: AerialFace;
  readonly deck: DeckPlan;
}

export type TerraceRefusal = DeckRefusal | 'noRun';

export type TerraceResult =
  | { readonly ok: true; readonly plan: TerracePlan }
  | { readonly ok: false; readonly refusal: TerraceRefusal };

export function planTerrace(query: TerraceQuery): TerraceResult {
  const { host } = query;
  let refusal: TerraceRefusal = 'noRun';

  for (const face of query.faces) {
    const attach = faceRuns(query, host, face);
    for (const run of attach) {
      const rect = terraceRect(face, run);
      const result = planDeck({
        rect,
        deckZ: run.z,
        anchors: [wallRect(face, run)],
        ground: query.ground,
        solid: query.solid,
      });
      if (result.ok) {
        return { ok: true, plan: { host: host.id, face, deck: result.plan } };
      }
      refusal = result.refusal;
    }
  }
  return { ok: false, refusal };
}

/**
 * Una corsa di parete a cui qualcosa si puo' attaccare.
 *
 * Serve tale e quale all'aggetto e alla rete: la mensola ci appende un piano, il
 * percorso ci atterra. E' la ragione per cui vive qui ed e' esportata — le due
 * strutture devono chiamare **atterraggio** la stessa cosa, o finirebbero per
 * accettare due insiemi di pareti diversi.
 */
export interface FaceRun {
  /** Quota del piano: e' la sommita' della parete, quindi il piano ci e' a filo. */
  readonly z: number;
  /** Coordinata della parete sull'asse dello sporto. */
  readonly wall: number;
  /** Primo e ultimo valore della corsa sull'asse perpendicolare. */
  readonly from: number;
  readonly to: number;
}

/**
 * Le corse di parete di una faccia, dalla piu' alta in giu'.
 *
 * Per ogni quota si cerca la parete rientrando dal filo dell'impronta, e si
 * tengono le colonne che la trovano **alla stessa profondita'**: e' quello che
 * rende la corsa un pezzo di facciata piano invece di un profilo a gradini, e una
 * mensola attaccata a un profilo a gradini sarebbe appesa nel vuoto da un lato.
 */
export function faceRuns(
  query: AerialProbe,
  host: AerialSupport,
  face: AerialFace,
  maxRecess = AERIAL.terrace.maxRecess,
): readonly FaceRun[] {
  const axis = faceAxis(face);
  const outward = faceOutward(face);
  const depth = axis === 0 ? host.sizeX : host.sizeY;
  const edge = outward > 0
    ? (axis === 0 ? host.x + host.sizeX - 1 : host.y + host.sizeY - 1)
    : (axis === 0 ? host.x : host.y);
  const crossFrom = axis === 0 ? host.y : host.x;
  const crossTo = crossFrom + (axis === 0 ? host.sizeY : host.sizeX) - 1;

  const out: FaceRun[] = [];
  const top = host.baseZ + host.height - 1 - AERIAL.deckDrop;
  const floor = host.baseZ + AERIAL.minRise;

  for (let z = top; z >= floor && out.length < AERIAL.terrace.attempts; z--) {
    // La parete di ogni colonna della faccia, a questa quota.
    const walls: number[] = [];
    for (let cross = crossFrom; cross <= crossTo; cross++) {
      walls.push(wallDepth(query, axis, outward, edge, cross, z, depth, maxRecess));
    }

    const run = longestRun(walls);
    if (run === null) continue;
    const length = run.to - run.from + 1;
    if (length < AERIAL.terrace.minRun) continue;

    out.push({
      z,
      wall: run.wall,
      from: crossFrom + run.from,
      to: crossFrom + run.to,
    });
    // Una quota per corsa: due quote consecutive dello stesso corpo darebbero due
    // mensole sovrapposte, e la seconda verrebbe rifiutata comunque da `blocked`.
    z -= AERIAL.girderDepth;
  }
  return out;
}

/**
 * Quanto e' rientrata la parete di una colonna, o `-1` se non c'e'.
 *
 * Si entra dal filo verso il centro, al massimo `maxRecess` colonne. **Quel
 * limite non e' lo stesso per tutti**, ed e' misurato: una mensola attaccata a
 * una fascia molto rientrata e' un cappello, quindi si ferma a tre; un percorso
 * deve solo atterrare su una parete, e le pareti alte di un edificio piramidale
 * stanno tutte piu' dentro di tre — chiedendogli lo stesso limite si atterrava
 * solo sulla sommita' del basamento, cioe' cosi' in basso che ogni corsa lunga
 * finiva dentro l'edificio accanto.
 */
function wallDepth(
  probe: AerialProbe,
  axis: 0 | 1,
  outward: 1 | -1,
  edge: number,
  cross: number,
  z: number,
  depth: number,
  maxRecess: number,
): number {
  const limit = Math.min(maxRecess, depth - 1);
  for (let step = 0; step <= limit; step++) {
    const along = edge - outward * step;
    const solid = axis === 0 ? probe.solid(along, cross, z) : probe.solid(cross, along, z);
    // La parete c'e' se il voxel e' pieno e sopra di lui non c'e' niente: e' la
    // sommita' di una fascia, cioe' il piano su cui la mensola si allinea.
    if (!solid) continue;
    const above = axis === 0 ? probe.solid(along, cross, z + 1) : probe.solid(cross, along, z + 1);
    return above ? -1 : along;
  }
  return -1;
}

/** La corsa contigua piu' lunga di colonne che trovano la parete alla stessa profondita'. */
function longestRun(walls: readonly number[]): { wall: number; from: number; to: number } | null {
  let best: { wall: number; from: number; to: number } | null = null;

  let i = 0;
  while (i < walls.length) {
    if (walls[i] === -1) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < walls.length && walls[j + 1] === walls[i]) j++;
    // A parita' vince la prima, che sull'asse cresce: senza un ordine dichiarato
    // la stessa citta' con lo stesso seme attaccherebbe la mensola in due posti.
    if (best === null || j - i > best.to - best.from) {
      best = { wall: walls[i], from: i, to: j };
    }
    i = j + 1;
  }
  return best;
}

/**
 * Il riquadro della mensola.
 *
 * Parte dalla colonna **subito fuori** dalla parete e sporge di `overhang`.
 * Quando la fascia e' rientrata, le prime colonne cadono ancora dentro
 * l'impronta dell'ospite: e' voluto, ed e' la terrazza che c'era gia' — chi
 * scrive il record eccettua l'ospite dalla collisione, perche' l'aggetto e'
 * **attaccato** a lui e non in conflitto con lui.
 */
function terraceRect(face: AerialFace, run: FaceRun): DeckRect {
  const axis = faceAxis(face);
  const outward = faceOutward(face);
  const overhang = overhangOf(run.to - run.from + 1);
  const start = outward > 0 ? run.wall + 1 : run.wall - overhang;
  const length = run.to - run.from + 1;

  return axis === 0
    ? { x: start, y: run.from, sizeX: overhang, sizeY: length }
    : { x: run.from, y: start, sizeX: length, sizeY: overhang };
}

/**
 * Quanto sporge una mensola larga `run`.
 *
 * **Quanto e' larga, tanto e' profonda**, dentro i due estremi. Una facciata da
 * quattro porta un balcone, una da otto porta una terrazza vera — e quella, oltre
 * `AERIAL.reach`, si ritrova le proprie gambe. E' l'unica riga che lega le due
 * cose, e da lei viene tutta la varieta' delle mensole di una citta'.
 */
export function overhangOf(run: number): number {
  return Math.min(AERIAL.terrace.maxOverhang, Math.max(AERIAL.terrace.minOverhang, run));
}

/** La striscia di parete a cui una struttura si appende: e' l'ancoraggio di `planDeck`. */
export function wallRect(face: AerialFace, run: FaceRun): DeckRect {
  const axis = faceAxis(face);
  const length = run.to - run.from + 1;
  return axis === 0
    ? { x: run.wall, y: run.from, sizeX: 1, sizeY: length }
    : { x: run.from, y: run.wall, sizeX: length, sizeY: 1 };
}

/** 0 se la faccia guarda lungo x, 1 se lungo y. */
export function faceAxis(face: AerialFace): 0 | 1 {
  return face === AERIAL_FACE.east || face === AERIAL_FACE.west ? 0 : 1;
}

/** +1 se la faccia guarda verso le coordinate crescenti. */
export function faceOutward(face: AerialFace): 1 | -1 {
  return face === AERIAL_FACE.east || face === AERIAL_FACE.north ? 1 : -1;
}
