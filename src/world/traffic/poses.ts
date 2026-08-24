import { TRAFFIC, type VehicleKind } from './config';
import type { TrafficRoute } from './routes';

/**
 * Dove sta un mezzo a un certo istante — o se non sta da nessuna parte.
 *
 * **Funzione del tempo, non integrazione.** Non c'e' nessuno stato che avanza di
 * `dt` in `dt`: una rotta e' una spezzata e un periodo, e la posizione e' una
 * lettura. Ne discendono tre cose che l'integrazione non avrebbe dato gratis —
 * la stessa partita mostra le stesse barche negli stessi punti, un frame perso
 * non sposta niente, e la velocita' di gioco (1x, 2x, 4x) si applica cambiando
 * un moltiplicatore invece di ricalibrare delle accelerazioni.
 *
 * **Un mezzo puo' non esserci, e allora non ha una posa.** Il capo lontano di una
 * rotta `offworld` e' il bordo del mondo: la nave che ci arriva se ne va davvero
 * — `null` invece di una posizione — e torna dallo stesso punto dopo la sosta.
 * E' la differenza fra «viene da fuori» e un pendolo che inverte la marcia in
 * mezzo al mare in piena vista.
 */

export interface VehiclePose {
  readonly kind: VehicleKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Verso di marcia nel mondo, in radianti: `0` guarda a est. */
  readonly heading: number;
}

/**
 * La posa di ogni rotta all'istante dato, nell'ordine delle rotte.
 *
 * Chi e' fuori dal mondo non compare: l'elenco e' piu' corto, non bucato. E'
 * cio' che permette a chi disegna di restare com'era — un pool per tipo, e le
 * mesh in eccesso nascoste — senza imparare che cosa significhi «assente».
 */
export function posesAt(
  routes: readonly TrafficRoute[],
  seconds: number,
): readonly VehiclePose[] {
  const out: VehiclePose[] = [];
  for (const route of routes) {
    const pose = poseAt(route, seconds);
    if (pose !== null) out.push(pose);
  }
  return out;
}

/** Dove sta il mezzo di questa rotta, o `null` se in questo istante non c'e'. */
export function poseAt(route: TrafficRoute, seconds: number): VehiclePose | null {
  const bob = route.bob === 0
    ? 0
    : route.bob * Math.sin((seconds / TRAFFIC.airshipBobPeriod) * Math.PI * 2);

  const first = route.path[0];
  if (route.path.length < 2 || route.length <= 0) {
    return { kind: route.kind, x: first.x, y: first.y, z: first.z + bob, heading: route.heading };
  }

  const u = wrap(seconds / route.period + route.phase);
  const travel = route.closed
    ? { at: u * route.length, forward: true, away: false }
    : shuttleAt(u, route.dwell, route.length);

  // Il capo lontano di una rotta `offworld` non e' un capolinea, e' il bordo del
  // mondo: li' la nave non aspetta, se ne va. La sosta del pendolo diventa cosi'
  // il tempo che passa **fuori**, senza un secondo meccanismo da tenere in vita.
  if (route.offworld && travel.away) return null;

  const spot = sample(route, travel.at);
  const heading = travel.forward
    ? Math.atan2(spot.dy, spot.dx)
    : Math.atan2(-spot.dy, -spot.dx);

  return { kind: route.kind, x: spot.x, y: spot.y, z: spot.z + bob, heading };
}

/**
 * Dove sta un pendolo con la sosta ai due capi, e in che verso guarda.
 *
 * Il ciclo e' quattro tratti: fermo al capo di partenza, andata, fermo all'altro
 * capo, ritorno. Le due soste hanno la stessa durata, ed e' quello che rende il
 * periodo una traversata **piu' due attracchi** invece che un rimbalzo.
 *
 * Il verso resta quello dell'ultimo movimento anche da fermo: una barca
 * attraccata che ruotasse di mezzo giro al momento di ripartire e' l'unico modo
 * di rendere l'attracco meno credibile della traversata.
 *
 * `away` marca il **terzo** tratto, la sosta al capo lontano. Sta qui e non in
 * un predicato a parte perche' i quattro tratti sono scritti una volta sola: una
 * seconda copia di «dove finisce l'andata» divergerebbe da questa alla prima
 * modifica, e a divergere sarebbe l'istante in cui una nave sparisce.
 */
function shuttleAt(
  u: number,
  dwell: number,
  length: number,
): { at: number; forward: boolean; away: boolean } {
  const ramp = Math.max(1e-6, 0.5 - dwell);
  if (u < dwell) return { at: 0, forward: true, away: false };
  if (u < 0.5) return { at: ((u - dwell) / ramp) * length, forward: true, away: false };
  if (u < 0.5 + dwell) return { at: length, forward: false, away: true };
  return { at: (1 - (u - 0.5 - dwell) / ramp) * length, forward: false, away: false };
}

/** Punto e tangente a distanza `at` dall'inizio della spezzata. */
function sample(route: TrafficRoute, at: number): {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
} {
  const { path, cumulative } = route;
  const distance = Math.max(0, Math.min(at, route.length));

  let segment = 0;
  while (segment + 1 < cumulative.length - 1 && cumulative[segment + 1] <= distance) segment++;

  const from = path[segment];
  const to = path[route.closed ? (segment + 1) % path.length : segment + 1];
  const span = cumulative[segment + 1] - cumulative[segment];
  const t = span <= 0 ? 0 : (distance - cumulative[segment]) / span;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    x: from.x + dx * t,
    y: from.y + dy * t,
    z: from.z + (to.z - from.z) * t,
    // Una tangente nulla lascerebbe `atan2` a zero e girerebbe la sagoma a est
    // su ogni sosta: due punti coincidenti succedono, e la risposta giusta e'
    // «come prima», non «a est».
    dx: dx === 0 && dy === 0 ? 1 : dx,
    dy,
  };
}

function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
}
