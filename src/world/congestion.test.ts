import { describe, expect, it } from 'vitest';
import { BALANCE, BUILDING_CLASS } from '../sim';
import type { BuildingRecord } from './buildings/BuildingRegistry';
import { CongestionMap, transitSourcesOf, type TransitSource } from './congestion';
import { SPAN_KIND } from './spans/config';

const JAM = BALANCE.reach.congestion;
const TILE = JAM.tile;

let nextId = 1;

/** Un edificio quadrato con l'angolo minimo dove si chiede. */
function block(x: number, y: number, footprint = 4, height = 20): BuildingRecord {
  return {
    id: nextId++,
    x,
    y,
    baseZ: 0,
    footprint,
    height,
    class: BUILDING_CLASS.residential,
    level: 1,
    seed: 1,
  };
}

/** Riempie una tessera fino alla saturazione: `saturation` voxel per cella. */
function saturatedTile(tx: number, ty: number): BuildingRecord {
  return block(tx * TILE, ty * TILE, TILE, JAM.saturation);
}

/** Una tessera satura e le otto attorno, cosi' che la sfocatura non diluisca. */
function saturatedPatch(tx: number, ty: number): BuildingRecord[] {
  const out: BuildingRecord[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    out.push(saturatedTile(tx + dx, ty + dy));
  }
  return out;
}

describe('CongestionMap', () => {
  it('una citta che non c e non ingorga niente', () => {
    const map = new CongestionMap();
    map.rebuild([]);
    expect(map.size).toBe(0);
    expect(map.at(40, 40)).toBe(0);
  });

  it('il costruito alza il carico della propria tessera', () => {
    const map = new CongestionMap();
    map.rebuild([block(40, 40)]);
    expect(map.at(40, 40)).toBeGreaterThan(0);
    // Lontano dal costruito la citta' resta scorrevole: il nucleo e' 3x3, quindi
    // oltre una tessera di distanza non arriva niente.
    expect(map.at(40 + TILE * 3, 40)).toBe(0);
  });

  it('un quartiere saturo paga tutto il supplemento e non di piu', () => {
    const map = new CongestionMap();
    map.rebuild(saturatedPatch(5, 5));
    expect(map.at(5 * TILE + 1, 5 * TILE + 1)).toBeCloseTo(1, 6);
  });

  it('il carico non supera mai 1, per quanto si costruisca in alto', () => {
    const map = new CongestionMap();
    map.rebuild(saturatedPatch(5, 5).map((record) => ({ ...record, height: record.height * 50 })));
    expect(map.at(5 * TILE + 1, 5 * TILE + 1)).toBe(1);
  });

  it('la sfocatura esce dal costruito quanto ci entra', () => {
    const map = new CongestionMap();
    map.rebuild([saturatedTile(5, 5)]);
    // La tessera piena e le due vicine sui due assi: il carico digrada invece di
    // fermarsi a un gradino sul confine di conteggio.
    const centre = map.at(5 * TILE + 1, 5 * TILE + 1);
    const side = map.at(6 * TILE + 1, 5 * TILE + 1);
    expect(centre).toBeGreaterThan(side);
    expect(side).toBeGreaterThan(0);
  });

  it('una campata non ingorga il suolo che scavalca', () => {
    const map = new CongestionMap();
    const bridge = saturatedPatch(5, 5).map((record) => ({ ...record, span: SPAN_KIND.bridge }));
    map.rebuild(bridge);
    expect(map.size).toBe(0);
  });

  it('un impronta lunga si spartisce fra le tessere che tocca davvero', () => {
    const map = new CongestionMap();
    // Una pista lunga tre tessere: senza spartizione finirebbe tutta in quella
    // del centro, e i due capi non ingorgherebbero niente.
    const strip: BuildingRecord = {
      ...block(5 * TILE, 5 * TILE, TILE * 3, JAM.saturation),
      footprintY: TILE,
    };
    map.rebuild([strip]);
    expect(map.at(5 * TILE + 1, 5 * TILE + 1)).toBeGreaterThan(0);
    expect(map.at(7 * TILE + 1, 5 * TILE + 1)).toBeGreaterThan(0);
  });

  it('il trasporto scioglie l ingorgo dove arriva, e non altrove', () => {
    const jammed = new CongestionMap();
    jammed.rebuild(saturatedPatch(5, 5));

    const relieved = new CongestionMap();
    const station: TransitSource = { x: 5 * TILE + TILE / 2, y: 5 * TILE + TILE / 2, radius: 20, relief: 1 };
    relieved.rebuild(saturatedPatch(5, 5), [station]);

    expect(relieved.at(5 * TILE + 1, 5 * TILE + 1))
      .toBeLessThan(jammed.at(5 * TILE + 1, 5 * TILE + 1));
    // Fuori dal raggio il quartiere resta ingorgato come prima: una stazione
    // sblocca il proprio isolato, non la citta'.
    expect(relieved.at(6 * TILE + 1, 5 * TILE + 1)).toBeGreaterThan(0);
  });

  it('due stazioni affiancate non sciolgono il doppio', () => {
    const one = new CongestionMap();
    const two = new CongestionMap();
    const centre = { x: 5 * TILE + TILE / 2, y: 5 * TILE + TILE / 2, radius: 40, relief: 0.5 };
    one.rebuild(saturatedPatch(5, 5), [centre]);
    two.rebuild(saturatedPatch(5, 5), [centre, { ...centre }]);
    expect(two.at(5 * TILE + 1, 5 * TILE + 1)).toBeCloseTo(one.at(5 * TILE + 1, 5 * TILE + 1), 6);
  });

  it('dice quando il carico si e mosso davvero, ed e cio che paga il campo', () => {
    const map = new CongestionMap();
    const city = saturatedPatch(5, 5);
    expect(map.rebuild(city)).toBe(true);
    // La stessa citta' due volte: chi chiama non deve rifare il campo per
    // scoprire che nessuno ha costruito niente.
    expect(map.rebuild(city)).toBe(false);
    // Una villetta sola in periferia non sposta nessuna tessera sopra la soglia:
    // e' comparso un edificio, ma non e' cambiata nessuna distanza.
    expect(map.rebuild([...city, block(200, 200, 2, 4)])).toBe(false);
    // Un isolato intero invece si sente, e il campo va rifatto.
    expect(map.rebuild([...city, ...saturatedPatch(25, 25)])).toBe(true);
    // E si sente anche una stazione, che toglie invece di aggiungere.
    expect(map.rebuild(
      [...city, ...saturatedPatch(25, 25)],
      [{ x: 5 * TILE, y: 5 * TILE, radius: 40, relief: 1 }],
    )).toBe(true);
  });

  it('clear rimette la citta a nuova', () => {
    const map = new CongestionMap();
    map.rebuild(saturatedPatch(5, 5));
    map.clear();
    expect(map.size).toBe(0);
    expect(map.at(5 * TILE + 1, 5 * TILE + 1)).toBe(0);
  });
});

describe('transitSourcesOf', () => {
  it('solo i ruoli che muovono gente', () => {
    const sources = transitSourcesOf([
      { x: 10, y: 10, class: BUILDING_CLASS.residential, kind: 'transport', strength: 200, radius: 16 },
      { x: 60, y: 60, class: BUILDING_CLASS.commercial, kind: 'market', strength: 200, radius: 16 },
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.x).toBe(10);
    expect(sources[0]?.relief).toBe(JAM.transitRelief.transport);
    // Il sollievo arriva piu' lontano dell'influenza: a una stazione ci si va a
    // piedi da fuori quartiere.
    expect(sources[0]?.radius).toBeGreaterThan(16);
  });

  it('i due capi di una funivia, e non la fune', () => {
    const sources = transitSourcesOf([], [
      { id: 1, path: [{ x: 4, y: 4, z: 30 }, { x: 20, y: 4, z: 28 }, { x: 36, y: 4, z: 30 }] },
    ]);
    expect(sources.map((source) => source.x)).toEqual([4, 36]);
    expect(sources[0]?.relief).toBe(JAM.ropewayRelief);
  });
});
