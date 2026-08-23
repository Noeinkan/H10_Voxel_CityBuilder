import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../terrain/config';
import { CROSSINGS, CROSSING_KIND } from './config';
import {
  chooseCrossing,
  crossingBaseZ,
  type CrossingPlan,
  type CrossingProbe,
  type CrossingTower,
} from './crossingPlan';

/**
 * Il luogo entra come predicato, quindi il luogo di un test e' una funzione di
 * tre righe: un canale d'acqua fra due rive, definito sulla sola `x`. E' cio'
 * che permette di misurare la regola senza mondo, senza terreno e senza GPU —
 * il motivo per cui `crossingPlan.ts` non conosce il `VoxelWorld`.
 */

const SHORE_TOP = 20;
const SEA_FLOOR = 8;

/** Riva ovunque tranne fra `from` e `to`, estremi inclusi, dove c'e' acqua. */
function channel(from: number, to: number, floor = SEA_FLOOR): CrossingProbe {
  const wet = (x: number): boolean => x >= from && x <= to;
  return {
    ground: (x) => (wet(x) ? floor : SHORE_TOP),
    land: (x) => !wet(x),
    occupied: () => false,
    solid: () => false,
  };
}

/** Terra ferma dappertutto: non c'e' niente da attraversare. */
const DRY: CrossingProbe = {
  ground: () => SHORE_TOP,
  land: () => true,
  occupied: () => false,
  solid: () => false,
};

function tower(id: number, x: number, y: number, height: number): CrossingTower {
  return { id, x, y, sizeX: 8, sizeY: 8, baseZ: SHORE_TOP, height };
}

/** Volume pieno dentro le torri, aria fuori: e' cio' che verifica l'appoggio. */
function towerProbe(towers: readonly CrossingTower[]): CrossingProbe {
  return {
    ground: () => SHORE_TOP,
    land: () => true,
    occupied: () => false,
    solid: (x, y, z) =>
      towers.some(
        (t) =>
          x >= t.x && x < t.x + t.sizeX &&
          y >= t.y && y < t.y + t.sizeY &&
          z >= t.baseZ && z < t.baseZ + t.height,
      ),
  };
}

function plan(result: ReturnType<typeof chooseCrossing>): CrossingPlan {
  if (!result.ok) throw new Error(`atteso un piano, rifiutato per ${result.refusal}`);
  return result.plan;
}

describe('ponte a terra', () => {
  it('un click sulla riva trova la sponda opposta da solo', () => {
    const built = plan(chooseCrossing({ ...channel(20, 49), x: 15, y: 100 }));

    expect(built.kind).toBe(CROSSING_KIND.ground);
    expect(built.axis).toBe(0);
    // Le due testate poggiano oltre la battigia, di tutta la spalla.
    expect(built.x).toBe(20 - CROSSINGS.abutment);
    expect(built.x + built.sizeX - 1).toBe(49 + CROSSINGS.abutment);
    expect(built.sizeY).toBe(CROSSINGS.width);
    // La colonna cliccata cade dentro la larghezza dell'impalcato.
    expect(100).toBeGreaterThanOrEqual(built.y);
    expect(100).toBeLessThan(built.y + built.sizeY);
  });

  it('la carreggiata lascia il franco di navigazione sopra il mare', () => {
    const built = plan(chooseCrossing({ ...channel(20, 49), x: 15, y: 100 }));
    const underside = crossingBaseZ(built.deckZ);

    expect(underside - TERRAIN.seaLevel).toBeGreaterThanOrEqual(CROSSINGS.waterClearance);
    expect(underside - SHORE_TOP).toBeGreaterThanOrEqual(CROSSINGS.landClearance);
  });

  it('le pile partono dal fondale e arrivano sotto la trave', () => {
    const built = plan(chooseCrossing({ ...channel(20, 49), x: 15, y: 100 }));
    const underside = crossingBaseZ(built.deckZ);

    expect(built.piers.length).toBeGreaterThan(2);
    for (const pier of built.piers) {
      expect(pier.height).toBeGreaterThan(0);
      expect(pier.baseZ + pier.height).toBe(underside);
    }

    // Le due spalle sono larghe quanto l'impalcato, le pile in mezzo no: e'
    // quella differenza di pianta a farle leggere come due cose diverse.
    const wide = built.piers.filter((pier) => pier.sizeY === CROSSINGS.width);
    expect(wide).toHaveLength(2);
    for (const pier of wide) expect(pier.baseZ).toBe(SHORE_TOP);
    for (const pier of built.piers) {
      if (pier.sizeY !== CROSSINGS.width) expect(pier.baseZ).toBe(SEA_FLOOR);
    }
  });

  it('i segmenti coprono la corsa una volta sola', () => {
    const built = plan(chooseCrossing({ ...channel(20, 49), x: 15, y: 100 }));

    let covered = 0;
    let cursor = built.x;
    for (const segment of built.segments) {
      expect(segment.x).toBe(cursor);
      expect(segment.sizeY).toBe(built.sizeY);
      expect(segment.sizeX).toBeLessThanOrEqual(CROSSINGS.segmentLength);
      cursor += segment.sizeX;
      covered += segment.sizeX;
    }
    expect(covered).toBe(built.sizeX);
  });

  it('sceglie la direzione con lo stretto piu corto', () => {
    // Acqua a est a venti colonne, acqua a ovest a due: vince ovest, e nessuno
    // ha dovuto dirlo al giocatore.
    const probe: CrossingProbe = {
      ground: (x) => (x >= -14 && x <= -4) || (x >= 20 && x <= 49) ? SEA_FLOOR : SHORE_TOP,
      land: (x) => !((x >= -14 && x <= -4) || (x >= 20 && x <= 49)),
      occupied: () => false,
      solid: () => false,
    };
    const built = plan(chooseCrossing({ ...probe, x: 0, y: 100 }));
    expect(built.sizeX).toBe(11 + 2 * CROSSINGS.abutment);
  });

  it('rifiuta un click sull acqua, che non ha un capo da cui partire', () => {
    const result = chooseCrossing({ ...channel(20, 49), x: 30, y: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('notAshore');
  });

  it('senza acqua intorno non c e niente da attraversare', () => {
    const result = chooseCrossing({ ...DRY, x: 0, y: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('dryGap');
  });

  it('uno stretto da campata resta alle campate', () => {
    const result = chooseCrossing({ ...channel(20, 24), x: 15, y: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('tooShort');
  });

  it('oltre il tetto di luce il ponte non si fa', () => {
    const result = chooseCrossing({ ...channel(20, 400), x: 15, y: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('tooLong');
  });

  it('un fondale oltre il pescaggio di una pila e un rifiuto, non un ponte sospeso', () => {
    const deep = TERRAIN.seaLevel - CROSSINGS.maxPierDepth - 4;
    const result = chooseCrossing({ ...channel(20, 49, deep), x: 15, y: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('noFooting');
  });

  it('una riva occupata da un edificio non regge la spalla', () => {
    const probe = channel(20, 49);
    const result = chooseCrossing({
      ...probe,
      occupied: (x) => x >= 50 && x <= 56,
      x: 15,
      y: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('noAbutment');
  });
});

describe('ponte in quota', () => {
  const a = tower(1, 0, 0, 60);
  const b = tower(2, 30, 0, 70);

  it('collega due grattacieli affacciati e non prende suolo', () => {
    const built = plan(chooseCrossing({ ...towerProbe([a, b]), x: 4, y: 4, from: a, towers: [a, b] }));

    expect(built.kind).toBe(CROSSING_KIND.sky);
    expect(built.piers).toHaveLength(0);
    expect(built.supports).toEqual([1, 2]);
    // La carreggiata prende la quota del tetto piu' basso, meno l'affondo che
    // fa leggere l'attacco come un attacco.
    expect(built.deckZ).toBe(a.baseZ + a.height - 1 - CROSSINGS.skyDeckDrop);
    // Entra nel corpo di entrambi per tutta la mensola.
    expect(built.x).toBe(a.x + a.sizeX - CROSSINGS.corbel);
    expect(built.x + built.sizeX - 1).toBe(b.x + CROSSINGS.corbel - 1);
  });

  it('due edifici bassi non fanno un ponte nel cielo', () => {
    const low = [tower(1, 0, 0, 24), tower(2, 30, 0, 24)];
    const result = chooseCrossing({
      ...towerProbe(low),
      x: 4,
      y: 4,
      from: low[0],
      towers: low,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('lowTowers');
  });

  it('due torri in diagonale non si guardano', () => {
    const diagonal = tower(2, 30, 30, 70);
    const result = chooseCrossing({
      ...towerProbe([a, diagonal]),
      x: 4,
      y: 4,
      from: a,
      towers: [a, diagonal],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('notFacing');
  });

  it('un terzo edificio in mezzo al vuoto blocca la corsa', () => {
    // `blocked` sta piu' in fondo di `notFacing` nella scala dei motivi, quindi
    // e' quello che esce: dice che il ponte era giusto e il posto no.
    const between = tower(3, 14, 0, 90);
    const result = chooseCrossing({
      ...towerProbe([a, b, between]),
      x: 4,
      y: 4,
      from: a,
      towers: [a, b],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('blocked');
  });

  it('senza compagni non c e ponte', () => {
    const result = chooseCrossing({ ...towerProbe([a]), x: 4, y: 4, from: a, towers: [a] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('noPartner');
  });

  it('a parita di luce vince la torre con il tetto piu vicino', () => {
    const near = tower(2, 30, 0, 62);
    const far = tower(3, 0, 30, 120);
    const built = plan(chooseCrossing({
      ...towerProbe([a, near, far]),
      x: 4,
      y: 4,
      from: a,
      towers: [near, far],
    }));
    expect(built.supports).toEqual([1, 2]);
  });
});
