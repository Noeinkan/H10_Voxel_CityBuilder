import { hashCoords } from '../rng';
import { AERIAL, DECK_HEIGHT } from './config';
import {
  planDeck,
  type AerialProbe,
  type DeckPlan,
  type DeckRect,
  type DeckRefusal,
} from './deckPlan';
import { terraceShape } from './terraceForm';

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
  /**
   * Quanto e' concesso sporgere. Assente vale il balcone (`maxOverhang`).
   *
   * **E' la fase della citta', e passa di qui perche' questo file non la
   * conosce.** Chi chiama sa se le megastrutture sono cominciate; qui resta una
   * misura come tutte le altre, e la regola non cambia forma per saperla.
   */
  readonly maxOverhang?: number;
}

export interface TerracePlan {
  readonly host: number;
  readonly face: AerialFace;
  readonly deck: DeckPlan;
}

/**
 * Perche' una mensola non si puo' fare.
 *
 * I primi vengono dal luogo e valgono per la passata automatica come per il
 * giocatore; gli ultimi due sono del **gesto** e li puo' produrre solo un click:
 * in quota una mensola ha sempre un ospite per costruzione, ed e' chi indica una
 * colonna che puo' indicarne una sbagliata.
 */
export type TerraceRefusal = DeckRefusal | 'noRun' | 'noHost' | 'hostFull';

export type TerraceResult =
  | { readonly ok: true; readonly plan: TerracePlan }
  | { readonly ok: false; readonly refusal: TerraceRefusal };

export function planTerrace(query: TerraceQuery): TerraceResult {
  const { host } = query;
  let refusal: TerraceRefusal = 'noRun';

  for (const face of query.faces) {
    const attach = faceRuns(query, host, face);
    for (const run of attach) {
      // Ospite, faccia e quota: le tre cose che non cambiano piu' una volta che
      // la mensola e' li'. La forma e' allora una funzione del posto, come la
      // rete stradale lo e' del seme.
      const rect = terraceRect(face, run, hashCoords(host.id, face, run.z), query.maxOverhang);
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
 * Le corse di parete di una faccia, **dalla piu' bassa in su**.
 *
 * Per ogni quota si cerca la parete rientrando dal filo dell'impronta, e si
 * tengono le colonne che la trovano **alla stessa profondita'**: e' quello che
 * rende la corsa un pezzo di facciata piano invece di un profilo a gradini, e una
 * mensola attaccata a un profilo a gradini sarebbe appesa nel vuoto da un lato.
 *
 * **Il verso della scansione e' cio' che fa esistere la rete.** Cercando dall'alto
 * ogni ospite si prendeva la fascia piu' alta che reggesse, quindi due vicini di
 * livello diverso finivano a quote lontanissime: su una citta' cresciuta, delle
 * ottantasette coppie che la passata prova davvero, trentatre morivano sul
 * dislivello. Dal basso la prima corsa utile e' la **sommita' del basamento**, e
 * la 4.4 rende il corso di base condiviso da tutta la fila (`baseBand`): due
 * vicini diventano complanari **per costruzione**.
 *
 * Non e' una griglia imposta da fuori — quella questo dominio dichiara di non
 * volerla, ed e' il motivo per cui qui non esiste `align`. La quota continua a
 * venire da una fascia dell'ospite: solo dalla prima invece che dall'ultima.
 *
 * **Il ripiego su facciata piena parte piu' in alto, e non e' la stessa regola.**
 * La riga sopra vale dove c'e' una fascia da continuare: li' la quota e' un fatto
 * dell'edificio, e prendere la prima e' cio' che rende complanari due vicini.
 * Dove la facciata e' piena non c'e' nessuna fascia da rispettare — il balcone
 * sta in aria libera davanti al muro — e prendere comunque la quota piu' bassa
 * voleva dire attaccarlo a tre cubi dal marciapiede: su una torre di trenta cubi
 * quella non e' una mensola in facciata, e' una pensilina. Vedi `facadeRise`.
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

  const top = host.baseZ + host.height - 1 - AERIAL.deckDrop;
  const floor = host.baseZ + AERIAL.minRise;
  // **Su facciata piena la quota non la detta nessuno, quindi si sceglie.** Dove
  // una fascia rientra la quota e' un fatto dell'edificio e si parte da `floor`;
  // dove la facciata e' piena ogni quota vale l'altra, e partire comunque da
  // `floor` significava `minRise` — tre cubi sopra il marciapiede — su meta'
  // della citta'. Vedi `AERIAL.terrace.facadeRise`.
  const facade = Math.min(top, host.baseZ + Math.max(
    AERIAL.minRise,
    Math.round(host.height * AERIAL.terrace.facadeRise),
  ));

  const scan = (flat: boolean): FaceRun[] => {
    const from = flat ? facade : floor;
    // **Il passo distingue le due scansioni tanto quanto il punto di partenza.**
    // Su una sagoma le corse sono le fasce, e saltare piu' dell'ingombro appena
    // preso vorrebbe dire saltarne una; su facciata piena le quote sono tutte
    // equivalenti, e prendere le quattro consecutive impilava le tre mensole di
    // un ospite in nove voxel — una pila, non una facciata abitata.
    const stride = flat
      ? Math.max(DECK_HEIGHT, Math.floor((top - from) / AERIAL.terrace.attempts))
      : DECK_HEIGHT;

    const out: FaceRun[] = [];
    for (let z = from; z <= top && out.length < AERIAL.terrace.attempts; z++) {
      // La parete di ogni colonna della faccia, a questa quota.
      const walls: number[] = [];
      for (let cross = crossFrom; cross <= crossTo; cross++) {
        walls.push(wallDepth(query, axis, outward, edge, cross, z, depth, maxRecess, flat));
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
      // Una quota per corsa: due quote consecutive dello stesso corpo darebbero
      // due mensole sovrapposte, e la seconda verrebbe rifiutata comunque da
      // `blocked`.
      z += stride - 1;
    }
    return out;
  };

  // **Prima la fascia da continuare, poi il balcone.** Dove il corpo arretra, la
  // sommita' della fascia sotto e' gia' una terrazza e l'aggetto la prosegue
  // verso fuori: e' la forma per cui questo dominio esiste, e resta la prima da
  // provare. Ma meta' della citta' non arretra affatto — impronte piccole e
  // corpi che salgono a prisma dentro il corso di base condiviso della 4.4 —
  // e su una citta' vera **centoquarantasette ospiti su quattrocento** non
  // avevano una sola corsa utile, che e' il motivo per cui le mensole erano rade
  // e non si guardavano mai. Su una facciata piena la mensola si attacca lo
  // stesso: e' un balcone invece che una terrazza, sta in aria libera davanti al
  // muro, e `planDeck` verifica il vuoto come per tutte le altre.
  const runs = scan(false);
  return runs.length > 0 ? runs : scan(true);
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
  flat: boolean,
): number {
  const limit = Math.min(maxRecess, depth - 1);
  for (let step = 0; step <= limit; step++) {
    const along = edge - outward * step;
    const solid = axis === 0 ? probe.solid(along, cross, z) : probe.solid(cross, along, z);
    if (!solid) continue;
    // Con `flat` basta che il muro ci sia: la mensola gli si appende davanti, e
    // il vuoto in cui sta lo verifica `planDeck`. Senza, si pretende anche che
    // sopra non ci sia niente — la sommita' di una fascia, cioe' il piano a cui
    // l'aggetto si allinea per continuarlo.
    if (flat) return along;
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
 *
 * **Non occupa piu' tutta la corsa.** Quanto ne prende, quanto sporge e a quale
 * capo si appoggia li decide `terraceShape` dal seme: la corsa resta la misura
 * disponibile — e resta l'ancoraggio intero, che e' cio' da cui `planDeck`
 * misura lo sbalzo — ma il riquadro ci si dispone dentro invece di riempirla.
 */
function terraceRect(
  face: AerialFace,
  run: FaceRun,
  seed: number,
  maxOverhang?: number,
): DeckRect {
  const axis = faceAxis(face);
  const outward = faceOutward(face);
  const shape = terraceShape(run.to - run.from + 1, seed, maxOverhang);
  const start = outward > 0 ? run.wall + 1 : run.wall - shape.overhang;
  const from = run.from + shape.shift;

  return axis === 0
    ? { x: start, y: from, sizeX: shape.overhang, sizeY: shape.length }
    : { x: from, y: start, sizeX: shape.length, sizeY: shape.overhang };
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
