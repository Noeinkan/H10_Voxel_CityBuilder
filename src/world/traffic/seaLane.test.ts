import { describe, expect, it } from 'vitest';
import { planSeaLane, type LanePoint } from './seaLane';

/**
 * Un mare disegnato a mano: `~` acqua, `#` terra.
 *
 * La riga zero e' `y = 0`, cioe' il verso del mondo e non quello di una stampa:
 * scriverlo al contrario renderebbe illeggibili proprio i casi che questo file
 * esiste per raccontare, che sono tutti di forma.
 */
function seaOf(rows: readonly string[]): (x: number, y: number) => boolean {
  return (x, y) => {
    const row = rows[Math.floor(y)];
    if (row === undefined) return false;
    return row[Math.floor(x)] === '~';
  };
}

/** Ogni punto della spezzata, campionato fitto. */
function walk(lane: readonly LanePoint[], step = 0.25): LanePoint[] {
  const out: LanePoint[] = [];
  for (let i = 1; i < lane.length; i++) {
    const from = lane[i - 1];
    const to = lane[i];
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    const samples = Math.max(1, Math.ceil(span / step));
    for (let s = 0; s <= samples; s++) {
      out.push({ x: from.x + ((to.x - from.x) * s) / samples, y: from.y + ((to.y - from.y) * s) / samples });
    }
  }
  return out;
}

const OPTIONS = { step: 1, margin: 4, clearance: 0 } as const;

describe('planSeaLane', () => {
  it('in mare aperto tiene i due capi e non inventa punti in mezzo', () => {
    const water = seaOf(['~~~~~~~~', '~~~~~~~~', '~~~~~~~~', '~~~~~~~~']);
    const lane = planSeaLane({ from: { x: 0.5, y: 1.5 }, to: { x: 6.5, y: 1.5 }, water, ...OPTIONS });

    expect(lane).not.toBeNull();
    expect(lane![0]).toEqual({ x: 0.5, y: 1.5 });
    expect(lane![lane!.length - 1]).toEqual({ x: 6.5, y: 1.5 });
    // Il tiro di corda toglie tutti gli scalini della griglia: fra due punti che
    // si vedono non resta niente.
    expect(lane!.length).toBe(2);
  });

  it('gira attorno alla terra invece di attraversarla', () => {
    // La retta fra i due capi passa dritta dentro l'isolotto centrale: e' il caso
    // che rende inutile la scorciatoia, ed e' anche la forma per cui un traghetto
    // esiste — due punti di costa vicini con un pezzo d'isola in mezzo.
    const rows = [
      '~~~~~~~~~~',
      '~~~~~~~~~~',
      '~~~####~~~',
      '~~~####~~~',
      '~~~####~~~',
      '~~~~~~~~~~',
      '~~~~~~~~~~',
    ];
    const water = seaOf(rows);
    const lane = planSeaLane({ from: { x: 1.5, y: 3.5 }, to: { x: 8.5, y: 3.5 }, water, ...OPTIONS });

    expect(lane).not.toBeNull();
    expect(lane!.length).toBeGreaterThan(2);
    for (const point of walk(lane!)) {
      expect({ ...point, land: !water(point.x, point.y) })
        .toEqual({ ...point, land: false });
    }
  });

  it('senza acqua fra i due capi non inventa una rotta', () => {
    // Uno stagno chiuso dentro l'isola: dal mare non ci si arriva, e la risposta
    // giusta e' «niente barca», non una barca che passa dentro la collina.
    const rows = [
      '~~~~~~~',
      '~#####~',
      '~#~~~#~',
      '~#####~',
      '~~~~~~~',
    ];
    const water = seaOf(rows);
    expect(planSeaLane({ from: { x: 0.5, y: 0.5 }, to: { x: 3.5, y: 2.5 }, water, ...OPTIONS }))
      .toBeNull();
  });

  it('la stessa domanda da sempre la stessa rotta', () => {
    const rows = ['~~~~~~~~', '~~~##~~~', '~~~##~~~', '~~~~~~~~'];
    const water = seaOf(rows);
    const query = { from: { x: 0.5, y: 1.5 }, to: { x: 7.5, y: 1.5 }, water, ...OPTIONS };
    expect(planSeaLane(query)).toEqual(planSeaLane(query));
  });

  it('un capo sulla banchina trova comunque lo specchio davanti', () => {
    // Un imbarco sta **sulla** terra: la sua cella non e' acqua, e senza la
    // ricerca a anelli la rotta fallirebbe sempre invece che quasi mai.
    const rows = ['####~~~~', '####~~~~', '####~~~~', '~~~~~~~~'];
    const water = seaOf(rows);
    const lane = planSeaLane({ from: { x: 1.5, y: 1.5 }, to: { x: 7.5, y: 0.5 }, water, ...OPTIONS });

    expect(lane).not.toBeNull();
    expect(lane![0]).toEqual({ x: 1.5, y: 1.5 });
  });
});
