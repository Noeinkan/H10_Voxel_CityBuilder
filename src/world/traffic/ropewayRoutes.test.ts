import { describe, expect, it } from 'vitest';
import { ROPEWAY } from '../ropeway/config';
import { TRAFFIC, VEHICLE } from './config';
import { poseAt, posesAt } from './poses';
import { planRopewayRoutes, type RopewayLink } from './ropewayRoutes';

/** Una linea dritta lungo x, con la pancia in mezzo come la disegna il piano. */
const LINE: RopewayLink = {
  id: 7,
  path: [
    { x: 20, y: 100, z: 40 },
    { x: 40, y: 100, z: 37 },
    { x: 60, y: 100, z: 37 },
    { x: 80, y: 100, z: 40 },
  ],
};

describe('planRopewayRoutes', () => {
  it('mette due cabine su ogni linea', () => {
    const routes = planRopewayRoutes([LINE]);
    expect(routes).toHaveLength(2);
    expect(routes.every((route) => route.kind === VEHICLE.gondola)).toBe(true);
  });

  it('le due cabine si incrociano: a ogni istante stanno ai due capi opposti', () => {
    const [first, second] = planRopewayRoutes([LINE]);

    // A zero una parte e l'altra e' gia' dall'altra parte. E' il mezzo periodo di
    // sfasamento, ed e' l'unica cosa che distingua un servizio da una navetta.
    // Il `!`: una cabina non esce mai dal mondo — la sua linea sta fra due
    // stazioni dell'isola — quindi la posa c'e' a ogni istante.
    const a = poseAt(first, 0)!;
    const b = poseAt(second, 0)!;
    expect(a.x).toBeCloseTo(LINE.path[0].x);
    expect(b.x).toBeCloseTo(LINE.path[LINE.path.length - 1].x);
  });

  it('la cabina segue la pancia della fune invece di tagliarla', () => {
    const [route] = planRopewayRoutes([LINE]);
    // A meta' periodo utile la cabina sta in mezzo alla campata, dove la fune e'
    // piu' bassa: se la rotta fosse una retta fra i due capi, qui starebbe a 40.
    const middle = poseAt(route, route.period * 0.25)!;
    expect(middle.z).toBeLessThan(40);
  });

  it('una linea senza due punti non mette in moto niente', () => {
    expect(planRopewayRoutes([{ id: 1, path: [{ x: 0, y: 0, z: 0 }] }])).toHaveLength(0);
  });

  it('e deterministico', () => {
    const first = planRopewayRoutes([LINE]);
    const second = planRopewayRoutes([LINE]);
    expect(posesAt(second, 13.5)).toEqual(posesAt(first, 13.5));
  });
});

describe('la cabina e la fune si accordano', () => {
  it('l attacco piu la scatola fanno esattamente il drop che la linea sconta', () => {
    // **E' l'unico numero condiviso fra i due domini.** `ropewayPlan.ts` alza la
    // fune di `cabinDrop` sopra il franco perche' li' sotto ci passa la cabina;
    // `vehicleHulls.ts` disegna la cabina da terra fino alla morsa. Se le due
    // misure divergessero la cabina striscerebbe, e non lo direbbe nessun tipo.
    expect(TRAFFIC.hull.gondola.height + TRAFFIC.gondolaHanger).toBe(ROPEWAY.cabinDrop);
  });
});
