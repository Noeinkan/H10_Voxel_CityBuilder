import { ferryLinesOf, type BuildingClass, type CatalystId } from '../../sim';
import { BERTH, type LandmarkFormId } from '../landmarks/config';
import { landmarkMoorings, type WorldMooring } from '../landmarks/generate';
import { FACING, type Facing } from '../streets/streetGrid';
import { TRAFFIC, VEHICLE } from './config';
import { moored, phaseOf, shuttle, type TrafficRoute } from './routePath';
import { seaExit } from './seaExit';
import { navigableAt, planSeaLane, type LanePoint } from './seaLane';
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
  /**
   * La forma contestuale con cui la struttura e' stata scritta, se il luogo ne
   * ha scelta una. Decide la ricetta degli ormeggi; assente vale la forma a terra.
   */
  readonly form?: LandmarkFormId;

  /**
   * Quota dello specchio davanti alla struttura, in voxel.
   *
   * Assente vale il livello del mare, che e' il comportamento di sempre: un
   * porto sul mare non deve dichiararlo. Serve alla marina sul lago — li' il
   * pelo e' quello della conca, e un'ormeggiata alla quota del mare
   * galleggerebbe dentro la collina. Lo legge chi posa i mezzi a galla.
   */
  readonly waterZ?: number;

  /**
   * Quanti mezzi questa struttura mette sulla propria rotta di punta.
   *
   * **E' la simulazione che parla, ed e' l'unica cosa che le chiede.** Il numero
   * arriva gia' quantizzato — un intero fra uno e `TRAFFIC.maxFleet`, contato da
   * `fleetOf` — e non come un carico da normalizzare qui: il dominio del
   * traffico non sa cosa sia un commercio esterno, e non deve impararlo per
   * mettere in mare una seconda nave. Assente vale uno, il comportamento di
   * sempre.
   *
   * Vale per la nave da carico di un porto e per la traversata di una linea di
   * traghetto. Gli altri mezzi non lo leggono: uno yacht in piu' al posto barca
   * non racconta una marina piu' viva, racconta una marina piu' grande, e quella
   * la dice il sedime.
   */
  readonly fleet?: number;

  /**
   * Stadio raggiunto dalla struttura.
   *
   * Serve alle sole ricette che crescono in pianta: li' un ormeggio puo' **non
   * esistere ancora**, perche' la testata di molo che lo tiene arriva a uno
   * stadio dopo. Assente vale l'ingombro finale, che e' la risposta giusta per
   * le sette ricette a sedime fisso.
   */
  readonly stage?: number;
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
const AFLOAT: ReadonlySet<string> = new Set([BERTH.vessel, BERTH.yacht, BERTH.ferry, BERTH.cargo]);

/** Il pelo su cui galleggia un mezzo di questa struttura: il suo, o il mare. */
function waterZOf(structure: TrafficStructure): number {
  return structure.waterZ ?? TRAFFIC.waterZ;
}

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
          if (paired.get(i) === undefined) routes.push(moored(VEHICLE.ferry, mooring, waterZOf(structure)));
          break;
        case BERTH.vessel:
          routes.push(moored(VEHICLE.boat, mooring, waterZOf(structure)));
          break;
        case BERTH.yacht:
          routes.push(yachtDrift(structure, mooring, water));
          break;
        case BERTH.cargo:
          routes.push(...fleet(cargoRun(structure, mooring, water), structure.fleet));
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
    // Il servizio di una linea e' quello del capo piu' servito: i due capi
    // portano lo stesso numero quando lo decide la popolazione, ma la regola
    // non deve dipendere da quel fatto per dare la stessa risposta a ogni giro.
    if (line !== null) {
      routes.push(...fleet(line, Math.max(structures[a].fleet ?? 1, structures[b].fleet ?? 1)));
    }
  }

  return routes;
}

/**
 * Le copie della stessa rotta che una struttura mette in moto, sfasate.
 *
 * **Una rotta, tanti mezzi.** Non c'e' una seconda ricerca e non c'e' una
 * seconda spezzata: le copie condividono `path` e `cumulative` — sono di sola
 * lettura — e differiscono per la sola fase. E' quello che rende il porto pieno
 * gratis quanto quello vuoto, ed e' la ragione per cui il numero puo' seguire
 * la simulazione senza che nessuno paghi la crescita della citta'.
 *
 * Le fasi sono spaziate uniformemente: due traghetti su una linea si incrociano
 * a meta' traversata invece di viaggiare appaiati, che e' l'unica disposizione
 * in cui la seconda barca racconta un servizio piu' fitto e non un ingorgo.
 *
 * **Un mezzo fermo non si moltiplica.** Tre navi ormeggiate sullo stesso punto
 * sarebbero una nave sola con la sagoma piu' spessa: dove non c'e' una rotta da
 * percorrere, la flotta resta uno.
 */
function fleet(route: TrafficRoute, size: number | undefined): readonly TrafficRoute[] {
  const count = Math.max(1, Math.min(TRAFFIC.maxFleet, Math.round(size ?? 1)));
  if (count <= 1 || route.length <= 0) return [route];

  const out: TrafficRoute[] = [route];
  for (let k = 1; k < count; k++) {
    out.push({ ...route, phase: (route.phase + k / count) % 1 });
  }
  return out;
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
    structure.form,
    structure.stage,
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
    lane.map((point) => ({ x: point.x, y: point.y, z: waterZOf(from) })),
    TRAFFIC.ferrySpeed,
    TRAFFIC.ferryDwell,
    a.heading,
    phaseOf(from.id + to.id),
  );
}

/**
 * Lo yacht che esce dal posto barca e ci torna, senza allontanarsi.
 *
 * **Il giro lo detta l'acqua, non il verso della struttura.** Prima lo yacht
 * usciva in linea retta nella direzione in cui guarda la marina intera, e per
 * un porticciolo fatto di moli a dita quella direzione e' sbagliata quasi
 * sempre: il posto barca dello slip di mezzo aveva davanti il pontile di testa
 * a tre voxel, e ne usciva un avanti-indietro sul posto — la barca che «si
 * muove a caso» dell'occhio del giocatore. Ora il capo lontano e' il punto
 * d'acqua **piu' lontano che si raggiunga davvero** entro il guinzaglio, e la
 * spezzata per arrivarci gira attorno alla dita di molo invece di sbatterci
 * contro.
 *
 * Dove il giro non c'e' — il bacino chiuso, l'ormeggio all'asciutto, o un
 * tratto cosi' corto da leggersi come una vibrazione — resta ormeggiato. E' il
 * difetto onesto della nave senza largo, ed e' anche la verita' di un
 * porticciolo: non escono tutti insieme.
 */
function yachtDrift(
  structure: TrafficStructure,
  mooring: WorldMooring,
  water: WaterProbe,
): TrafficRoute {
  const still = (): TrafficRoute => moored(VEHICLE.yacht, mooring, waterZOf(structure));
  const target = seaExit({
    from: mooring,
    water,
    reach: TRAFFIC.yachtReach,
    step: TRAFFIC.basinStep,
    clearance: TRAFFIC.basinClearance,
  });
  if (target === null) return still();

  const lane = planSeaLane({
    from: mooring,
    to: target,
    water,
    step: TRAFFIC.basinStep,
    margin: TRAFFIC.yachtReach,
    clearance: TRAFFIC.basinClearance,
  });
  if (lane === null || lane.length < 2) return still();

  const route = shuttle(
    VEHICLE.yacht,
    lane.map((point) => ({ x: point.x, y: point.y, z: waterZOf(structure) })),
    TRAFFIC.yachtSpeed,
    TRAFFIC.yachtDwell,
    mooring.heading,
    phaseOf(structure.id + mooring.x + mooring.y),
  );
  return route.length >= TRAFFIC.yachtMinRun ? route : still();
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
 * **La rotta e' in due tratti, e il primo e' quello che mancava.** Il sondaggio
 * dritto di prima partiva dall'ormeggio e pretendeva subito il franco del mare
 * aperto: dentro un porto quel franco non c'e' per costruzione — il bacino del
 * ruolo e' largo otto colonne e i due bracci lo chiudono — quindi la ricerca
 * falliva al primo passo e **la nave restava sempre ormeggiata**, in un ruolo
 * che esiste per mostrare che dal mondo arriva qualcosa. Ora la prima meta'
 * cerca la bocca del porto camminando sull'acqua (`seaExit`), che e' l'unico
 * modo di doppiare il frangiflutti che il distretto costiero posa allo stadio
 * tre; la seconda va dritta al largo da li', dove il franco c'e' davvero.
 */
function cargoRun(
  structure: TrafficStructure,
  mooring: WorldMooring,
  water: WaterProbe,
): TrafficRoute {
  const still = (): TrafficRoute => moored(VEHICLE.cargo, mooring, waterZOf(structure));
  const seaward = SEAWARD[structure.facing] ?? SEAWARD[FACING.east];

  // La bocca: il punto piu' **avanti** — non il piu' lontano — che si raggiunga
  // restando in acqua. Fuori di li' comincia il mare, e con lui il franco.
  const mouth = seaExit({
    from: mooring,
    water,
    reach: TRAFFIC.harborReach,
    step: TRAFFIC.basinStep,
    clearance: TRAFFIC.basinClearance,
    toward: seaward,
  });
  if (mouth === null) return still();

  const far = offshore(mouth, seaward, water);
  if (far === null) return still();

  const lane = planSeaLane({
    from: mooring,
    to: mouth,
    water,
    step: TRAFFIC.basinStep,
    margin: TRAFFIC.harborReach,
    clearance: TRAFFIC.basinClearance,
  }) ?? [mooring, mouth];

  const route = shuttle(
    VEHICLE.cargo,
    [...lane, far].map((point) => ({ x: point.x, y: point.y, z: waterZOf(structure) })),
    TRAFFIC.cargoSpeed,
    TRAFFIC.cargoDwell,
    mooring.heading,
    phaseOf(structure.id),
    true,
  );
  // Senza un tratto di mare davanti non c'e' nessun fuori da cui arrivare: la
  // nave resta ormeggiata, che e' un difetto visibile e onesto invece di una
  // nave che sparisce a due voxel dal molo. La misura e' sulla rotta intera e
  // non sul solo tratto al largo: e' il viaggio che deve leggersi come partenza.
  return route.length >= TRAFFIC.cargoMinRun ? route : still();
}

/**
 * Il bordo del mondo, dritto al largo dalla bocca del porto.
 *
 * Il segmento e' dritto e non chiede `planSeaLane`: e' gia' acqua per
 * costruzione, colonna per colonna, perche' e' proprio quello il criterio con
 * cui si e' fermato. Qui il franco del mare aperto si puo' pretendere davvero —
 * siamo fuori dal porto — ed e' quello che tiene la nave lontana dalla costa
 * invece di farla strisciare sulla battigia.
 */
function offshore(
  from: LanePoint,
  seaward: readonly [number, number],
  water: WaterProbe,
): LanePoint | null {
  const [dx, dy] = seaward;
  const step = TRAFFIC.laneStep;
  const passes = navigableAt(water, step, TRAFFIC.laneClearance);

  let reach = 0;
  for (let d = step; d <= TRAFFIC.cargoReach; d += step) {
    if (!passes(from.x + dx * d, from.y + dy * d)) break;
    reach = d;
  }
  if (reach === 0) return null;
  return { x: from.x + dx * reach, y: from.y + dy * reach };
}

/** Verso il mare, per verso della struttura: e' il fronte che la ricetta guarda. */
const SEAWARD: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
