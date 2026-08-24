import { ferryLinesOf, type BuildingClass, type CatalystId } from '../../sim';
import { BERTH } from '../landmarks/config';
import { landmarkMoorings, type WorldMooring } from '../landmarks/generate';
import { FACING, type Facing } from '../streets/streetGrid';
import { TRAFFIC, VEHICLE } from './config';
import { moored, phaseOf, shuttle, type TrafficRoute } from './routePath';
import { planSeaLane } from './seaLane';
import { airshipOrbit, balloonFlight, flightCircuit, padCircuit } from './skyRoutes';

/**
 * Da cosa la citta' ha costruito a cosa si muove.
 *
 * **Puro.** Entrano le strutture ridotte all'osso e due predicati — dov'e'
 * l'acqua, quanto e' alto cio' che c'e' sotto — escono delle rotte: niente
 * registry, niente `TerrainMap`, niente Three.js. Le rotte sono dati — una
 * spezzata, un periodo, una fase — e chi le consuma (`posesAt`) e' altrettanto
 * puro, cosi' che «dove sta la barca al secondo 41» sia una domanda che un test
 * in ambiente node sa fare.
 *
 * **Una rotta si ricalcola quando cambia la citta', non quando passa un frame.**
 * La ricerca di una rotta di mare costa una visita su qualche migliaio di celle;
 * farla sessanta volte al secondo per far avanzare una barca di un decimo di
 * voxel sarebbe l'unica cosa in questo dominio a costare qualcosa.
 *
 * Qui restano l'orchestrazione e cio' che galleggia. Le rotte in quota — che
 * hanno una regola tutta loro, il profilo della citta' da scavalcare — stanno in
 * `skyRoutes.ts`; le primitive che le due meta' condividono in `routePath.ts`.
 */

export type { TrafficRoute, TrafficWaypoint } from './routePath';
export { shuttle } from './routePath';

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

/** Cosa serve sapere del mare per tracciare una rotta. */
export type WaterProbe = (x: number, y: number) => boolean;

/**
 * Quanto e' alto cio' che occupa una colonna: terreno, edifici, strutture.
 *
 * **E' l'unica cosa che il traffico sa della citta' costruita**, e arriva come
 * predicato per la stessa ragione dell'acqua: una rotta in quota deve sapere
 * cosa scavalca, e il dominio deve restare puro. Zero vale «niente e nemmeno
 * terreno», che e' anche il ripiego di chi non ha una citta' da sondare.
 */
export type CeilingProbe = (x: number, y: number) => number;

/** Nessuna citta' sotto: le rotte in quota restano alla loro quota dichiarata. */
const NO_CEILING: CeilingProbe = () => 0;

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
  ceiling: CeilingProbe = NO_CEILING,
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
      // costruzione, e il piazzamento porta la banchina sulla battigia vera —
      // ma su una costa storta puo' capitare la sabbia. Una barca ormeggiata
      // sull'asciutto sarebbe lo stesso difetto che questa fase esiste per
      // togliere, quindi li' semplicemente non c'e' nessuna barca.
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
          // La piazzola e il pilone del pallone non tengono niente di fermo: il
          // loro mezzo e' in giro, e a costruirlo e' la rotta qui sotto. Un
          // eVTOL parcheggiato **e** uno in circuito sarebbero due eVTOL su uno
          // scalo che ne dichiara uno.
          break;
      }
    }

    const circuit = flightCircuit(structure, moorings[i], ceiling);
    if (circuit !== null) routes.push(circuit);
    const orbit = airshipOrbit(structure, moorings[i], ceiling);
    if (orbit !== null) routes.push(orbit);
    const hop = padCircuit(structure, moorings[i], ceiling);
    if (hop !== null) routes.push(hop);
    const balloon = balloonFlight(structure, moorings[i], ceiling);
    if (balloon !== null) routes.push(balloon);
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
