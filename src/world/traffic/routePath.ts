import { TRAFFIC, type VehicleKind } from './config';
import type { WorldMooring } from '../landmarks/generate';

/**
 * Di cosa e' fatta una rotta, e i quattro modi di costruirne una.
 *
 * **Sta a parte perche' e' l'unica cosa che i due mestieri condividono.** Le
 * rotte di mare (`routes.ts`) e quelle in quota (`skyRoutes.ts`) non hanno
 * niente in comune — una cerca l'acqua, l'altra scavalca la citta' — ma il
 * pendolo con la sosta e il giro che si richiude sono lo stesso conto, e la
 * formula del periodo e' l'unica cosa non ovvia che ci sia dentro. Scritta due
 * volte divergerebbe, e a divergere sarebbe l'istante in cui una nave sparisce.
 *
 * Puro come tutto il dominio: entrano una spezzata e una velocita', esce un
 * dato. Nessun mondo, nessuna `TerrainMap`, nessun Three.js.
 */

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

/** Un mezzo fermo al proprio posto: una rotta di un punto solo. */
export function moored(
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
 * Un pendolo fra due capi, con la sosta a ciascuno.
 *
 * Non e' solo dei traghetti: qualunque linea che va e torna — una funivia in
 * `ropewayRoutes.ts`, una mongolfiera che sale e rientra in `skyRoutes.ts` — e'
 * questa stessa rotta con un'altra spezzata.
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
  bob = 0,
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
    bob,
    offworld,
  };
}

/** Un giro che si richiude: il circuito di volo, l'orbita di un dirigibile. */
export function loop(
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
export function measure(path: readonly TrafficWaypoint[], closed: boolean): number[] {
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

/**
 * Sfasamento stabile da un intero.
 *
 * Serve a non far partire tutti i mezzi dallo stesso punto del proprio ciclo: due
 * porti costruiti nello stesso tick avrebbero le navi in fase, e la citta'
 * sembrerebbe muoversi a scatti coordinati.
 */
export function phaseOf(seed: number): number {
  return ((seed * 0.618_033_988_75) % 1 + 1) % 1;
}
