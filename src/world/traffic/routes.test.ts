import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, type CatalystId } from '../../sim';
import { FACING } from '../streets/streetGrid';
import { TRAFFIC, VEHICLE, type VehicleKind } from './config';
import { poseAt, posesAt } from './poses';
import { planTraffic, type TrafficStructure } from './routes';

/**
 * Il traffico si legge dalle strutture, non dalla simulazione.
 *
 * Questi test scrivono le strutture a mano — sono cinque numeri e un ruolo — ed
 * e' esattamente quello che permette di verificare «un imbarco solo non fa una
 * linea» senza far crescere una citta' per scoprirlo.
 */

function structure(
  kind: CatalystId,
  x: number,
  y: number,
  extra: Partial<TrafficStructure> = {},
): TrafficStructure {
  return {
    id: x + y * 1000,
    kind,
    class: BUILDING_CLASS.commercial,
    cx: x + 4,
    cy: y + 6,
    x,
    y,
    facing: FACING.east,
    z: TRAFFIC.waterZ,
    aloft: false,
    ...extra,
  };
}

/** Mare ovunque: la forma della costa la provano i test di `seaLane`. */
const OPEN_SEA = (): boolean => true;

function kinds(routes: readonly { readonly kind: VehicleKind }[]): VehicleKind[] {
  return routes.map((route) => route.kind).sort();
}

describe('planTraffic', () => {
  it('un imbarco solo tiene le barche all ormeggio: non e una linea', () => {
    const routes = planTraffic([structure('ferry', 0, 0)], OPEN_SEA);

    // Due ormeggi, due barche ferme. La traversata non c'e' perche' il compagno
    // non c'e', ed e' esattamente cio' che il ruolo promette finche' resta solo.
    expect(kinds(routes)).toEqual([VEHICLE.boat, VEHICLE.ferry]);
    for (const route of routes) expect(route.length).toBe(0);
  });

  it('due imbarchi a distanza di linea aprono la traversata', () => {
    const routes = planTraffic(
      [structure('ferry', 0, 0), structure('ferry', 0, 100)],
      OPEN_SEA,
    );

    // Le due barche da lavoro restano; l'accosto di linea non ne tiene piu' una
    // ferma per parte, ne mette in mare **una sola** che fa la spola.
    expect(kinds(routes)).toEqual([VEHICLE.boat, VEHICLE.boat, VEHICLE.ferry]);
    const crossing = routes.find((route) => route.kind === VEHICLE.ferry)!;
    expect(crossing.length).toBeGreaterThan(80);
    expect(crossing.closed).toBe(false);
    expect(crossing.period).toBeGreaterThan(crossing.length / TRAFFIC.ferrySpeed);
  });

  it('la traversata parte e arriva ai due accosti, e li aspetta', () => {
    const routes = planTraffic(
      [structure('ferry', 0, 0), structure('ferry', 0, 100)],
      OPEN_SEA,
    );
    const crossing = routes.find((route) => route.kind === VEHICLE.ferry)!;
    const head = crossing.path[0];
    const tail = crossing.path[crossing.path.length - 1];
    // Lo sfasamento e' voluto — due linee costruite insieme non devono partire
    // in fase — quindi si legge il ciclo a partire da dove comincia davvero.
    // Un traghetto sta fra due punti dell'isola e non esce mai dal mondo: la
    // sua posa c'e' a ogni istante, e il `!` e' un fatto e non una speranza.
    const at = (u: number): NonNullable<ReturnType<typeof poseAt>> =>
      poseAt(crossing, crossing.period * (u - crossing.phase))!;

    // A inizio ciclo e' ferma al primo capo, a meta' all'altro: sono le due
    // soste, e senza di loro il periodo sarebbe un rimbalzo.
    const start = at(0);
    expect(start.x).toBeCloseTo(head.x, 5);
    expect(start.y).toBeCloseTo(head.y, 5);

    const arrived = at(0.5);
    expect(arrived.x).toBeCloseTo(tail.x, 5);
    expect(arrived.y).toBeCloseTo(tail.y, 5);

    // A meta' andata sta in mezzo, e non ferma da nessuna parte.
    const midway = at(0.25 + TRAFFIC.ferryDwell / 2);
    expect(Math.hypot(midway.x - head.x, midway.y - head.y)).toBeGreaterThan(1);
    expect(Math.hypot(midway.x - tail.x, midway.y - tail.y)).toBeGreaterThan(1);
  });

  it('il ritorno guarda dalla parte opposta dell andata', () => {
    const routes = planTraffic(
      [structure('ferry', 0, 0), structure('ferry', 0, 100)],
      OPEN_SEA,
    );
    const crossing = routes.find((route) => route.kind === VEHICLE.ferry)!;
    const at = (u: number): number =>
      poseAt(crossing, crossing.period * (u - crossing.phase))!.heading;
    const going = at(0.3);
    const back = at(0.8);

    // Prodotto scalare dei due versori: `-1` esatto vuol dire prue opposte, e
    // dirlo cosi' evita di dover normalizzare un angolo a mano nel test.
    expect(Math.cos(going) * Math.cos(back) + Math.sin(going) * Math.sin(back))
      .toBeCloseTo(-1, 6);
  });

  it('il porto manda la nave al largo e la riporta in banchina', () => {
    // Il mare comincia oltre la banchina: la nave trova un largo vero e la rotta
    // diventa una spola invece di un ormeggio.
    const routes = planTraffic(
      [structure('port', 0, 0)],
      (x) => x >= 12,
    );

    expect(kinds(routes)).toEqual([VEHICLE.boat, VEHICLE.cargo]);
    const run = routes.find((route) => route.kind === VEHICLE.cargo)!;
    expect(run.length).toBeGreaterThan(TRAFFIC.cargoMinRun);
    expect(run.closed).toBe(false);
  });

  it('la nave esce dal mondo al capo lontano, e da li torna', () => {
    // Mare aperto davanti alla banchina: la rotta corre finche' il mare esiste,
    // e il suo capo lontano e' il bordo del mondo.
    const routes = planTraffic([structure('port', 0, 0)], (x) => x >= 12);
    const run = routes.find((route) => route.kind === VEHICLE.cargo)!;
    expect(run.offworld).toBe(true);

    const at = (u: number): ReturnType<typeof poseAt> =>
      poseAt(run, run.period * (u - run.phase));

    // In banchina c'e', in navigazione c'e', fuori dal mondo **non c'e'** — e al
    // ritorno c'e' di nuovo. E' la differenza fra «viene da fuori» e un pendolo
    // che inverte la marcia in mezzo al mare.
    expect(at(0)).not.toBeNull();
    expect(at(0.25)).not.toBeNull();
    expect(at(0.5 + TRAFFIC.cargoDwell / 2)).toBeNull();
    expect(at(0.75)).not.toBeNull();

    // E chi non c'e' non entra nell'elenco delle pose: chi disegna non deve
    // imparare che cosa significhi «assente», gli arriva un mezzo in meno.
    const away = run.period * (0.5 + TRAFFIC.cargoDwell / 2 - run.phase);
    expect(posesAt(routes, away).some((pose) => pose.kind === VEHICLE.cargo)).toBe(false);
    expect(posesAt(routes, away).some((pose) => pose.kind === VEHICLE.boat)).toBe(true);
  });

  it('senza largo davanti la nave resta ormeggiata invece di sparire', () => {
    // C'e' acqua sotto la banchina ma non abbastanza mare davanti: la nave c'e',
    // e non va da nessuna parte.
    const routes = planTraffic([structure('port', 0, 0)], (x) => x < 18);
    const run = routes.find((route) => route.kind === VEHICLE.cargo)!;
    expect(run.length).toBe(0);
    expect(run.offworld).toBe(false);
    expect(poseAt(run, 12)!.x).toBeCloseTo(run.path[0].x, 5);
  });

  it('un ormeggio all asciutto non tiene nessuna barca', () => {
    // L'opera di terra non tocca le colonne che la ricetta lascia libere, quindi
    // la darsena resta cio' che il terreno aveva li'. Su una costa storta puo'
    // essere battigia, e una barca sulla sabbia sarebbe lo stesso difetto che
    // questa fase esiste per togliere.
    const routes = planTraffic([structure('port', 0, 0)], () => false);
    expect(routes.filter((route) => route.kind === VEHICLE.cargo)).toHaveLength(0);
    expect(routes.filter((route) => route.kind === VEHICLE.boat)).toHaveLength(0);
  });

  it('l aeroporto a terra vola in circuito e parcheggia a bordo pista', () => {
    const routes = planTraffic([structure('airport', 0, 0, { z: 30 })], () => false);

    expect(kinds(routes)).toEqual([VEHICLE.plane, VEHICLE.plane, VEHICLE.plane]);
    const circuit = routes.find((route) => route.closed)!;
    expect(circuit.kind).toBe(VEHICLE.plane);

    // Il giro tocca terra sulla pista e sale in quota dall'altra parte: e' la
    // quota dentro la spezzata a fare decollo e finale, non un secondo
    // meccanismo.
    const heights = circuit.path.map((point) => point.z);
    expect(Math.min(...heights)).toBeLessThan(30 + TRAFFIC.planeCruise * 0.5);
    expect(Math.max(...heights)).toBe(30 + TRAFFIC.planeCruise);
  });

  it('lo scalo in quota ormeggia dirigibili e ne tiene uno in giro', () => {
    const routes = planTraffic(
      [structure('airport', 0, 0, { z: 96, aloft: true })],
      () => false,
    );

    expect(kinds(routes)).toEqual([VEHICLE.airship, VEHICLE.airship, VEHICLE.airship]);
    // Nessuna pista, quindi nessun circuito d'aereo: in quota si ormeggia.
    expect(routes.filter((route) => route.kind === VEHICLE.plane)).toHaveLength(0);

    const moored = routes.filter((route) => !route.closed);
    expect(moored).toHaveLength(2);
    for (const route of moored) {
      expect(route.path[0].z).toBeGreaterThan(96);
      // Il beccheggio e' la sola cosa che dica che galleggia invece di stare
      // appoggiato: fermo perfetto legge come un pezzo di edificio.
      expect(route.bob).toBeGreaterThan(0);
      expect(poseAt(route, TRAFFIC.airshipBobPeriod * 0.25)!.z)
        .toBeGreaterThan(poseAt(route, 0)!.z);
    }
  });

  it('lo stesso istante da sempre le stesse pose', () => {
    const structures = [
      structure('ferry', 0, 0),
      structure('ferry', 0, 100),
      structure('port', 200, 0),
    ];
    const first = planTraffic(structures, OPEN_SEA);
    const second = planTraffic(structures, OPEN_SEA);
    expect(posesAt(second, 37.5)).toEqual(posesAt(first, 37.5));
  });

  it('un ruolo senza ormeggi non produce traffico', () => {
    expect(planTraffic([structure('market', 0, 0)], OPEN_SEA)).toHaveLength(0);
  });
});
