import { describe, expect, it } from 'vitest';
import { funnelOf, TRAFFIC, VEHICLE, type VehicleKind } from './config';
import { poseAt } from './poses';
import { puffsAt } from './plume';
import type { TrafficRoute } from './routes';

/**
 * Il fumo si verifica come le pose, ed e' il punto di tutto il modulo: una rotta
 * scritta a mano e un istante bastano a dire dove sta ogni sbuffo, senza far
 * crescere una citta' e senza guardare uno schermo.
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

/** Una traversata dritta di cento voxel: la barca e' sempre in movimento. */
function crossing(): TrafficRoute {
  const path = [
    { x: 0, y: 0, z: TRAFFIC.waterZ },
    { x: 100, y: 0, z: TRAFFIC.waterZ },
  ];
  return {
    kind: VEHICLE.ferry,
    path,
    cumulative: [0, 100],
    length: 100,
    closed: false,
    dwell: 0,
    period: 200 / TRAFFIC.ferrySpeed,
    phase: 0,
    heading: 0,
    bob: 0,
    offworld: false,
  };
}

/**
 * Una nave che esce dal mondo: cento voxel di mare, poi il bordo.
 *
 * Con `dwell` a un quarto, il ciclo e' un quarto in banchina, un quarto di
 * navigazione, un quarto **fuori** e un quarto di ritorno: su un periodo di 200
 * secondi la nave non c'e' fra il 100 e il 150.
 */
function departure(): TrafficRoute {
  const path = [
    { x: 0, y: 0, z: TRAFFIC.waterZ },
    { x: 100, y: 0, z: TRAFFIC.waterZ },
  ];
  return {
    kind: VEHICLE.cargo,
    path,
    cumulative: [0, 100],
    length: 100,
    closed: false,
    dwell: 0.25,
    period: 200,
    phase: 0,
    heading: 0,
    bob: 0,
    offworld: true,
  };
}

describe('puffsAt', () => {
  it('fuma solo chi ha una ciminiera', () => {
    const routes = [moored(VEHICLE.ferry, 0, 0), moored(VEHICLE.boat, 20, 0)];
    const puffs = puffsAt(routes, 12);

    // La barca da lavoro ha il suo tubo di scarico disegnato, ma non e' un
    // fumaiolo: tenerla accesa vorrebbe dire una colonna di fumo perenne su
    // ogni darsena della citta'.
    expect(puffs.length).toBeGreaterThan(0);
    for (const puff of puffs) expect(puff.x).toBeLessThan(10);
  });

  it('lo sbuffo appena uscito sta sulla bocca del fumaiolo', () => {
    const route = moored(VEHICLE.ferry, 30, -8);
    const funnel = funnelOf(VEHICLE.ferry)!;
    // Un multiplo esatto di `every` e' l'istante in cui l'ultimo sbuffo ha eta'
    // zero: li' salita, deriva e scarto valgono zero e resta la sola bocca.
    const puff = puffsAt([route], TRAFFIC.plume.every * 9)[0];

    expect(puff.x).toBeCloseTo(30 + funnel.along, 6);
    expect(puff.y).toBeCloseTo(-8, 6);
    expect(puff.z).toBeCloseTo(TRAFFIC.waterZ + funnel.mouth, 6);
    expect(puff.size).toBeCloseTo(TRAFFIC.plume.size, 6);
    expect(puff.density).toBeCloseTo(TRAFFIC.plume.peak, 6);
  });

  it('gli sbuffi invecchiano in ordine: salgono, crescono e si diradano', () => {
    const puffs = puffsAt([moored(VEHICLE.ferry, 0, 0)], 40);

    // In una vita ci stanno `life / every` sbuffi, ed e' un intervallo e non un
    // numero: quanti se ne vedono dipende da quanto manca al prossimo, cioe'
    // dall'istante in cui si guarda.
    const alive = TRAFFIC.plume.life / TRAFFIC.plume.every;
    expect(puffs.length).toBeGreaterThanOrEqual(Math.floor(alive));
    expect(puffs.length).toBeLessThanOrEqual(Math.ceil(alive));
    for (let i = 1; i < puffs.length; i++) {
      expect(puffs[i].z).toBeGreaterThan(puffs[i - 1].z);
      expect(puffs[i].size).toBeGreaterThan(puffs[i - 1].size);
      expect(puffs[i].density).toBeLessThan(puffs[i - 1].density);
    }
    // L'ultimo e' quasi svanito: se cosi' non fosse, sparirebbe a mezz'aria
    // ancora ben visibile.
    expect(puffs[puffs.length - 1].density).toBeLessThan(TRAFFIC.plume.peak * 0.1);
  });

  it('la scia resta dove la nave e passata, non la segue', () => {
    const route = crossing();
    const seconds = route.period * 0.25;
    const puffs = puffsAt([route], seconds);
    const now = poseAt(route, seconds)!;

    // La nave viaggia a `ferrySpeed`: in una vita di sbuffo ha percorso decine
    // di voxel, e il piu' vecchio deve essere rimasto indietro di altrettanto.
    const oldest = puffs[puffs.length - 1];
    const behind = now.x - oldest.x;
    expect(behind).toBeGreaterThan(TRAFFIC.ferrySpeed * TRAFFIC.plume.life * 0.5);
  });

  it('una nave fuori dal mondo non fuma, ma lascia la scia sul bordo', () => {
    const route = departure();

    // Appena uscita: gli sbuffi lasciati prima di sparire sono ancora li', tutti
    // stretti attorno al bordo del mondo. E' la scia di una nave partita.
    const justGone = puffsAt([route], 101);
    expect(justGone.length).toBeGreaterThan(0);
    for (const puff of justGone) expect(puff.x).toBeGreaterThan(80);

    // Piu' tardi non resta niente: una nave che non c'e' non puo' aver fumato,
    // e la scia di prima si e' diradata.
    expect(puffsAt([route], 148)).toHaveLength(0);
  });

  it('e una funzione del tempo: stesso istante, stesso fumo', () => {
    const routes = [crossing(), moored(VEHICLE.cargo, -12, 40)];
    expect(puffsAt(routes, 37.25)).toEqual(puffsAt(routes, 37.25));
  });
});
