import { ferryLinesOf, type BuildingClass, type CatalystId } from '../../sim';
import { BERTH } from '../landmarks/config';
import { landmarkMoorings, type WorldMooring } from '../landmarks/generate';
import { FACING, type Facing } from '../streets/streetGrid';
import { TRAFFIC, VEHICLE, type VehicleKind } from './config';
import { planSeaLane } from './seaLane';

/**
 * Da cosa la citta' ha costruito a cosa si muove.
 *
 * **Puro.** Entrano le strutture ridotte all'osso e un predicato che dice dov'e'
 * l'acqua, escono delle rotte: niente registry, niente `TerrainMap`, niente
 * Three.js. Le rotte sono dati — una spezzata, un periodo, una fase — e chi le
 * consuma (`posesAt`) e' altrettanto puro, cosi' che «dove sta la barca al
 * secondo 41» sia una domanda che un test in ambiente node sa fare.
 *
 * **Una rotta si ricalcola quando cambia la citta', non quando passa un frame.**
 * La ricerca di una rotta di mare costa una visita su qualche migliaio di celle;
 * farla sessanta volte al secondo per far avanzare una barca di un decimo di
 * voxel sarebbe l'unica cosa in questo dominio a costare qualcosa.
 */

/** Una struttura che il traffico serve: il record di un landmark, ridotto all'osso. */
export interface TrafficStructure {
  readonly id: number;
  readonly kind: CatalystId;
  readonly class: BuildingClass;
  /**
   * Colonna del catalizzatore.
   *
   * E' su questa che si misurano le linee, e non sull'angolo dell'ingombro: la
   * regola sta in `sim/ferry.ts` e ragiona sui catalizzatori, quindi darle un
   * altro punto significherebbe che due imbarchi collegati per la simulazione
   * possono non esserlo per le barche.
   */
  readonly cx: number;
  readonly cy: number;
  /** Angolo minimo dell'ingombro. */
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  /** Quota del piano finito. */
  readonly z: number;
  /** Vero se la struttura poggia su un tetto invece che sul terreno. */
  readonly aloft: boolean;
}

export interface TrafficWaypoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrafficRoute {
  readonly kind: VehicleKind;
  readonly path: readonly TrafficWaypoint[];
  /** Lunghezza cumulata fino a ciascun punto. Un elemento in piu' se chiusa. */
  readonly cumulative: readonly number[];
  readonly length: number;
  /** true: giro che si richiude. false: va e torna, con sosta ai due capi. */
  readonly closed: boolean;
  /** Frazione del periodo passata ferma a ciascun capo. Ignorata sui giri. */
  readonly dwell: number;
  /** Durata di un ciclo intero, in secondi. */
  readonly period: number;
  /** Sfasamento iniziale, in frazione di periodo. */
  readonly phase: number;
  /** Verso di un mezzo fermo, in radianti: una rotta di un punto solo ha solo questo. */
  readonly heading: number;
  /** Ampiezza dell'oscillazione verticale. Zero per tutto cio' che galleggia sull'acqua. */
  readonly bob: number;
  /**
   * Vero se il capo lontano e' il **bordo del mondo** invece di un capolinea.
   *
   * Chi ci arriva se ne va: non ha una posa finche' non torna, e la sosta del
   * pendolo diventa il tempo che passa fuori. Serve alle navi da carico, che il
   * porto promette vengano «da fuori»: senza, una nave che inverte la marcia in
   * mezzo al mare in piena vista racconta esattamente il contrario, cioe' che un
   * fuori non c'e'.
   */
  readonly offworld: boolean;
}

/** Cosa serve sapere del mare per tracciare una rotta. */
export type WaterProbe = (x: number, y: number) => boolean;

/** Gli ormeggi che pretendono acqua sotto di se'. */
const AFLOAT: ReadonlySet<string> = new Set([BERTH.vessel, BERTH.ferry, BERTH.cargo]);

/**
 * Le rotte che una citta' esprime, in ordine deterministico.
 *
 * L'ordine e' quello delle strutture, e conta: le rotte finiscono in un pool di
 * mesh, e due partite identiche devono dare gli stessi mezzi negli stessi posti.
 */
export function planTraffic(
  structures: readonly TrafficStructure[],
  water: WaterProbe,
): readonly TrafficRoute[] {
  const routes: TrafficRoute[] = [];
  const moorings = structures.map((structure) => mooringsOf(structure));
  const paired = ferryPairs(structures);

  for (let i = 0; i < structures.length; i++) {
    const structure = structures[i];
    for (const mooring of moorings[i]) {
      // **Cio' che galleggia vuole acqua sotto.** L'opera di terra non tocca le
      // colonne che la ricetta lascia libere, quindi la darsena resta cio' che
      // il terreno aveva li': quasi sempre mare — il ruolo guarda l'acqua per
      // costruzione — ma su una costa storta puo' capitare la battigia. Una
      // barca ormeggiata sulla sabbia sarebbe lo stesso difetto che questa fase
      // esiste per togliere, quindi li' semplicemente non c'e' nessuna barca.
      if (AFLOAT.has(mooring.berth) && !water(mooring.x, mooring.y)) continue;

      switch (mooring.berth) {
        case BERTH.ferry:
          // Un imbarco senza compagno resta un molo con una barca ormeggiata,
          // che e' esattamente cio' che il ruolo promette finche' la linea non
          // c'e': la traversata la costruisce il capo con l'indice minore, una
          // volta sola per coppia.
          if (paired.get(i) === undefined) routes.push(moored(VEHICLE.ferry, mooring));
          break;
        case BERTH.vessel:
          routes.push(moored(VEHICLE.boat, mooring));
          break;
        case BERTH.cargo:
          routes.push(cargoRun(structure, mooring, water));
          break;
        case BERTH.aircraft:
          routes.push(moored(VEHICLE.plane, mooring, structure.z));
          break;
        case BERTH.airship:
          routes.push(moored(VEHICLE.airship, mooring, structure.z, TRAFFIC.airshipBob));
          break;
        default:
          break;
      }
    }

    const circuit = flightCircuit(structure, moorings[i]);
    if (circuit !== null) routes.push(circuit);
    const orbit = airshipOrbit(structure, moorings[i]);
    if (orbit !== null) routes.push(orbit);
  }

  for (const [a, b] of paired) {
    if (a > b) continue;
    const line = ferryCrossing(structures[a], moorings[a], structures[b], moorings[b], water);
    if (line !== null) routes.push(line);
  }

  return routes;
}

/**
 * Chi sta con chi, per indice di struttura.
 *
 * Riusa `ferryLinesOf` invece di riscriverne la regola: l'accoppiamento avido
 * sulla lunghezza e i suoi due limiti di distanza sono bilanciamento della
 * simulazione, e una seconda copia qui darebbe barche fra due moli che l'HUD non
 * conta come linea.
 */
function ferryPairs(structures: readonly TrafficStructure[]): Map<number, number> {
  const terminals = structures.map((structure) => ({
    x: structure.cx,
    y: structure.cy,
    kind: structure.kind,
    class: structure.class,
  }));

  const pairs = new Map<number, number>();
  for (const line of ferryLinesOf(terminals)) {
    pairs.set(line.a, line.b);
    pairs.set(line.b, line.a);
  }
  return pairs;
}

function mooringsOf(structure: TrafficStructure): readonly WorldMooring[] {
  return landmarkMoorings(
    structure.kind,
    structure.facing,
    structure.x,
    structure.y,
    structure.aloft,
  );
}

/** Un mezzo fermo al proprio posto: una rotta di un punto solo. */
function moored(
  kind: VehicleKind,
  mooring: WorldMooring,
  baseZ: number = TRAFFIC.waterZ,
  bob: number = 0,
): TrafficRoute {
  return {
    kind,
    path: [{ x: mooring.x, y: mooring.y, z: baseZ + mooring.z }],
    cumulative: [0],
    length: 0,
    closed: false,
    dwell: 0,
    period: TRAFFIC.airshipBobPeriod,
    phase: 0,
    heading: mooring.heading,
    bob,
    offworld: false,
  };
}

/**
 * La traversata fra due imbarchi: la sola rotta che il giocatore ha chiesto.
 *
 * Se la ricerca non trova acqua fra i due — un braccio chiuso, due bacini
 * separati da un istmo — la linea resta senza barca invece di farne passare una
 * attraverso la collina. E' un difetto visibile e onesto: la simulazione
 * continua a contare la linea, e a schermo si vede che qualcosa non torna.
 */
function ferryCrossing(
  from: TrafficStructure,
  fromMoorings: readonly WorldMooring[],
  to: TrafficStructure,
  toMoorings: readonly WorldMooring[],
  water: WaterProbe,
): TrafficRoute | null {
  const a = fromMoorings.find((mooring) => mooring.berth === BERTH.ferry);
  const b = toMoorings.find((mooring) => mooring.berth === BERTH.ferry);
  if (a === undefined || b === undefined) return null;

  const lane = planSeaLane({ from: a, to: b, water });
  if (lane === null || lane.length < 2) return null;

  return shuttle(
    VEHICLE.ferry,
    lane.map((point) => ({ x: point.x, y: point.y, z: TRAFFIC.waterZ })),
    TRAFFIC.ferrySpeed,
    TRAFFIC.ferryDwell,
    a.heading,
    phaseOf(from.id + to.id),
  );
}

/**
 * La nave da carico che arriva dal mondo, scarica e ci ritorna.
 *
 * **Il capo lontano e' il bordo del mondo, non il largo.** Il porto apre il
 * commercio *con il mondo*, e il mondo qui non c'e': la sola cosa che possa
 * raccontarlo e' una nave che se ne va davvero — fin dove il mare esiste, e li'
 * sparisce (`offworld`) per il tempo della sosta. Fermarla al largo in piena
 * vista, com'era, diceva l'esatto contrario: che un fuori non c'e', e che quella
 * nave e' un pendolo fra il molo e un punto d'acqua qualsiasi.
 *
 * Il segmento e' dritto e non chiede `planSeaLane`: e' gia' acqua per
 * costruzione, colonna per colonna, perche' e' proprio quello il criterio con
 * cui si e' fermato.
 */
function cargoRun(
  structure: TrafficStructure,
  mooring: WorldMooring,
  water: WaterProbe,
): TrafficRoute {
  const [dx, dy] = SEAWARD[structure.facing] ?? SEAWARD[FACING.east];
  const step = TRAFFIC.laneStep;
  const side = TRAFFIC.laneClearance * step;

  let reach = 0;
  for (let d = step; d <= TRAFFIC.cargoReach; d += step) {
    const x = mooring.x + dx * d;
    const y = mooring.y + dy * d;
    if (!water(x, y)) break;
    if (!(water(x + side, y) && water(x - side, y) &&
      water(x, y + side) && water(x, y - side))) break;
    reach = d;
  }
  // Senza un tratto di mare davanti non c'e' nessun fuori da cui arrivare: la
  // nave resta ormeggiata, che e' un difetto visibile e onesto invece di una
  // nave che sparisce a due voxel dal molo.
  if (reach < TRAFFIC.cargoMinRun) return moored(VEHICLE.cargo, mooring);

  return shuttle(
    VEHICLE.cargo,
    [
      { x: mooring.x, y: mooring.y, z: TRAFFIC.waterZ },
      { x: mooring.x + dx * reach, y: mooring.y + dy * reach, z: TRAFFIC.waterZ },
    ],
    TRAFFIC.cargoSpeed,
    TRAFFIC.cargoDwell,
    mooring.heading,
    phaseOf(structure.id),
    true,
  );
}

/** Verso il mare, per verso della struttura: e' il fronte che la ricetta guarda. */
const SEAWARD: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Il circuito di volo attorno a una pista: decollo, salita, giro, finale.
 *
 * E' una spezzata chiusa con la quota dentro, quindi la salita e la discesa sono
 * la stessa interpolazione della posizione e non un secondo meccanismo. Le due
 * soglie le dichiara la ricetta (`BERTH.runway`): sono l'unica cosa che di una
 * pista serve sapere, e prenderle da li' invece che dai numeri della tabella
 * tiene il circuito allineato alla pista anche quando la pista si sposta.
 */
function flightCircuit(
  structure: TrafficStructure,
  moorings: readonly WorldMooring[],
): TrafficRoute | null {
  const ends = moorings.filter((mooring) => mooring.berth === BERTH.runway);
  if (ends.length < 2) return null;

  const [head, tail] = ends;
  const dx = tail.x - head.x;
  const dy = tail.y - head.y;
  const run = Math.hypot(dx, dy);
  if (run < 1) return null;

  const ax = dx / run;
  const ay = dy / run;
  // La perpendicolare decide da che parte si gira. Sempre la stessa, cosi' due
  // aeroporti affiancati non fanno volare gli aerei l'uno contro l'altro.
  const px = -ay;
  const py = ax;

  const pad = structure.z;
  const cruise = pad + TRAFFIC.planeCruise;
  const half = TRAFFIC.planeCircuit / 2;
  const wide = TRAFFIC.planeCircuit;

  const at = (
    origin: WorldMooring,
    along: number,
    across: number,
    z: number,
  ): TrafficWaypoint => ({
    x: origin.x + ax * along + px * across,
    y: origin.y + ay * along + py * across,
    z,
  });

  return loop(
    VEHICLE.plane,
    [
      at(head, 0, 0, pad + 1),
      at(head, TRAFFIC.planeRoll, 0, pad + 1),
      at(tail, 0, 0, pad + TRAFFIC.planeCruise * 0.45),
      at(tail, half, 0, cruise),
      at(tail, half, wide, cruise),
      at(head, -half, wide, cruise),
      at(head, -half, 0, pad + TRAFFIC.planeCruise * 0.5),
    ],
    TRAFFIC.planeSpeed,
    phaseOf(structure.id),
  );
}

/**
 * Il giro lento di un dirigibile attorno al proprio scalo in quota.
 *
 * Uno solo per struttura, e non uno per pilone: due dirigibili in orbita sulla
 * stessa circonferenza si inseguono, e a schermo si legge come un errore. Gli
 * altri piloni tengono i loro ormeggiati, che e' cio' che un pilone fa.
 */
function airshipOrbit(
  structure: TrafficStructure,
  moorings: readonly WorldMooring[],
): TrafficRoute | null {
  const mast = moorings.find((mooring) => mooring.berth === BERTH.airship);
  if (mast === undefined) return null;

  const centreX = mast.x;
  const centreY = mast.y;
  const z = structure.z + mast.z + TRAFFIC.airshipCruise;
  const points: TrafficWaypoint[] = [];
  const sides = 8;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    points.push({
      x: centreX + Math.cos(angle) * TRAFFIC.airshipOrbit,
      y: centreY + Math.sin(angle) * TRAFFIC.airshipOrbit,
      z,
    });
  }
  return loop(VEHICLE.airship, points, TRAFFIC.airshipSpeed, phaseOf(structure.id + 7));
}

/**
 * Sfasamento stabile da un intero.
 *
 * Serve a non far partire tutti i mezzi dallo stesso punto del proprio ciclo: due
 * porti costruiti nello stesso tick avrebbero le navi in fase, e la citta'
 * sembrerebbe muoversi a scatti coordinati.
 */
function phaseOf(seed: number): number {
  return ((seed * 0.618_033_988_75) % 1 + 1) % 1;
}

/**
 * Un pendolo fra due capi, con la sosta a ciascuno.
 *
 * Esportata perche' non e' solo dei traghetti: qualunque linea che va e torna —
 * una funivia, in `ropewayRoutes.ts` — e' questa stessa rotta con un'altra
 * spezzata. Riscriverne una seconda copia vorrebbe dire due formule del periodo
 * da tenere allineate, e la sosta e' gia' l'unica cosa non ovvia che c'e'
 * dentro.
 */
export function shuttle(
  kind: VehicleKind,
  path: readonly TrafficWaypoint[],
  speed: number,
  dwell: number,
  heading: number,
  phase: number,
  /** Vero se il capo lontano e' il bordo del mondo: vedi `TrafficRoute.offworld`. */
  offworld = false,
): TrafficRoute {
  const cumulative = measure(path, false);
  const length = cumulative[cumulative.length - 1];
  // Il periodo comprende le due soste: la traversata dura `2 * length / speed`,
  // e quella e' la frazione `1 - 2 * dwell` del ciclo.
  const period = length <= 0 ? 1 : (2 * length) / speed / Math.max(0.1, 1 - 2 * dwell);
  return {
    kind,
    path,
    cumulative,
    length,
    closed: false,
    dwell,
    period,
    phase,
    heading,
    bob: 0,
    offworld,
  };
}

function loop(
  kind: VehicleKind,
  path: readonly TrafficWaypoint[],
  speed: number,
  phase: number,
): TrafficRoute {
  const cumulative = measure(path, true);
  const length = cumulative[cumulative.length - 1];
  return {
    kind,
    path,
    cumulative,
    length,
    closed: true,
    dwell: 0,
    period: length <= 0 ? 1 : length / speed,
    phase,
    heading: 0,
    bob: 0,
    // Un giro non ha un capo lontano: il circuito di volo e l'orbita di un
    // dirigibile stanno **dentro** il mondo per costruzione.
    offworld: false,
  };
}

/** Lunghezze cumulate. Su un giro l'ultimo elemento chiude il segmento di ritorno. */
function measure(path: readonly TrafficWaypoint[], closed: boolean): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    out.push(out[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  }
  if (closed && path.length > 1) {
    const last = path[path.length - 1];
    out.push(out[out.length - 1] + Math.hypot(path[0].x - last.x, path[0].y - last.y));
  }
  return out;
}
