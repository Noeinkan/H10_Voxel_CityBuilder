import { describe, expect, it } from 'vitest';
import { TRAFFIC, VEHICLE, type VehicleKind } from './config';
import { poseAt } from './poses';
import type { TrafficRoute } from './routes';
import { wakeAt } from './wake';

/**
 * La scia si verifica come il fumo, ed e' il punto di tutto il modulo: una rotta
 * scritta a mano e un istante bastano a dire dove sta ogni segno, senza far
 * crescere una citta' e senza guardare uno schermo.
 *
 * Il test che conta e' quello della barca all'ormeggio. Una nave ferma ripete la
 * stessa posa, quindi i segni le si impilerebbero addosso tutti nello stesso
 * punto: e' l'unico modo in cui questo modulo puo' rompersi in modo vistoso, e
 * l'unico che senza un test si scoprirebbe da uno screenshot di un porto pieno di
 * chiazze bianche.
 */

function moored(kind: VehicleKind, x: number, y: number): TrafficRoute {
  return {
    kind,
    path: [{ x, y, z: TRAFFIC.waterZ }],
    cumulative: [0],
    length: 0,
    closed: false,
    dwell: 0,
    period: 1,
    phase: 0,
    heading: 0,
    bob: 0,
    offworld: false,
  };
}

/** Una traversata dritta verso est di duecento voxel: la nave e' sempre in moto. */
function crossing(kind: VehicleKind = VEHICLE.ferry): TrafficRoute {
  return {
    kind,
    path: [
      { x: 0, y: 0, z: TRAFFIC.waterZ },
      { x: 200, y: 0, z: TRAFFIC.waterZ },
    ],
    cumulative: [0, 200],
    length: 200,
    closed: false,
    dwell: 0,
    period: 400 / TRAFFIC.ferrySpeed,
    phase: 0,
    heading: 0,
    bob: 0,
    offworld: false,
  };
}

/** Un circuito in quota, per un mezzo che l'acqua non la tocca mai. */
function circuit(kind: VehicleKind): TrafficRoute {
  return {
    kind,
    path: [
      { x: 0, y: 0, z: 60 },
      { x: 80, y: 0, z: 60 },
      { x: 80, y: 80, z: 60 },
    ],
    cumulative: [0, 80, 160],
    length: 160,
    closed: true,
    dwell: 0,
    period: 40,
    phase: 0,
    heading: 0,
    bob: 0,
    offworld: false,
  };
}

describe('wakeAt', () => {
  it('lascia scia solo chi galleggia', () => {
    const flying = [circuit(VEHICLE.plane), circuit(VEHICLE.airship), circuit(VEHICLE.gondola)];
    expect(wakeAt(flying, 11)).toHaveLength(0);
    expect(wakeAt([crossing()], 11).length).toBeGreaterThan(0);
  });

  it('una barca all ormeggio non lascia niente', () => {
    // Il difetto che questo esclude e' vistoso: senza la soglia di velocita' i
    // segni si impilano tutti nello stesso punto, e una barca ferma diventa la
    // cosa piu' bianca del porto.
    expect(wakeAt([moored(VEHICLE.boat, 12, -30)], 26)).toHaveLength(0);
  });

  it('i segni stanno dietro la nave e mai davanti', () => {
    const route = crossing();
    const seconds = route.period * 0.25;
    const now = poseAt(route, seconds)!;

    for (const mark of wakeAt([route], seconds)) {
      // Mezza lunghezza di tolleranza: il segno e' un rettangolo, e il suo capo
      // di prua puo' arrivare fino all'istante di campionamento piu' recente.
      expect(mark.x).toBeLessThanOrEqual(now.x + mark.half + 1e-9);
    }
  });

  it('la V si apre con l eta e la schiuma si spegne', () => {
    const route = crossing();
    // Un multiplo esatto di `every` e' l'istante in cui il segno piu' giovane ha
    // eta' zero: li' l'apertura non e' ancora cominciata e resta il solo fianco.
    const marks = wakeAt([route], TRAFFIC.wake.every * 60);
    const beam = TRAFFIC.hull[VEHICLE.ferry].width;

    // Tre segni per intervallo: i due rami della V e la rimestata sull'asse.
    expect(marks.length % 3).toBe(0);
    const alive = TRAFFIC.wake.life / TRAFFIC.wake.every;
    expect(marks.length / 3).toBeLessThanOrEqual(Math.ceil(alive));

    const [portFirst, starboardFirst] = marks;
    // Appena aperti, i due rami stanno sul **fianco** e non sull'asse: una V che
    // nasce dalla chiglia esce da un punto da cui l'onda di prua non esce mai.
    expect(Math.abs(portFirst.y)).toBeCloseTo(beam / 2, 6);
    expect(portFirst.y).toBeCloseTo(-starboardFirst.y, 6);

    const [portLast] = marks.slice(-3);
    expect(Math.abs(portLast.y)).toBeGreaterThan(beam);
    expect(portLast.halfWidth).toBeGreaterThan(portFirst.halfWidth);
    expect(portLast.foam).toBeLessThan(portFirst.foam);
    // L'ultimo e' quasi svanito, o sparirebbe ancora ben visibile.
    expect(portLast.foam).toBeLessThan(TRAFFIC.wake.peak * 0.1);
  });

  it('la rimestata dell elica sta sull asse ed e piu larga dei rami', () => {
    const marks = wakeAt([crossing()], 30);
    const [port, starboard, wash] = marks;

    expect(wash.y).toBeCloseTo((port.y + starboard.y) / 2, 6);
    expect(wash.halfWidth).toBeGreaterThan(port.halfWidth);
    // E piu' debole: e' acqua rimestata, non l'onda che si rompe.
    expect(wash.foam).toBeLessThan(port.foam);
  });

  it('i segni si toccano invece di lasciare una fila di macchie', () => {
    // Un segno copre il tratto percorso in un intervallo, quindi la sua
    // lunghezza e' la distanza fra due pose: due segni consecutivi combaciano
    // capo a capo, e la traccia e' continua senza dover fondere niente.
    const route = crossing();
    const marks = wakeAt([route], 30).filter((mark) => mark.y === 0);
    const step = TRAFFIC.ferrySpeed * TRAFFIC.wake.every;

    for (const mark of marks) expect(mark.half * 2).toBeCloseTo(step, 6);
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i - 1].x - marks[i].x).toBeCloseTo(step, 6);
    }
  });

  it('e una funzione del tempo: stesso istante, stessa scia', () => {
    const routes = [crossing(), crossing(VEHICLE.cargo), moored(VEHICLE.boat, -12, 40)];
    expect(wakeAt(routes, 37.25)).toEqual(wakeAt(routes, 37.25));
  });
});
