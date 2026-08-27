import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { FACING } from '../streets/streetGrid';
import { BERTH } from '../landmarks/config';
import type { WorldMooring } from '../landmarks/generate';
import { TRAFFIC } from './config';
import { airshipOrbit } from './skyRoutes';
import type { TrafficStructure } from './routes';

/**
 * Le rotte in quota si verificano qui senza disegnare una citta': un pilone solo
 * e un predicato di cielo bastano a chiedere a che quota gira un dirigibile.
 */

const structure: TrafficStructure = {
  id: 1,
  kind: 'airport',
  class: BUILDING_CLASS.commercial,
  cx: 0,
  cy: 0,
  x: 0,
  y: 0,
  facing: FACING.east,
  z: 96,
  form: 'skyport',
};

const mast: readonly WorldMooring[] = [
  { x: 0, y: 0, z: 10, berth: BERTH.airship, heading: Math.PI },
];

describe('skyRoutes', () => {
  it('l orbita si alza sopra una torre accanto alla rotta, non solo sotto', () => {
    // Il primo vertice del giro sta a (34, 0) dal pilone. Un muro di torri che
    // comincia cinque colonne piu' a nord cade **accanto** alla linea di centro,
    // dentro l'ingombro del dirigibile: il sondaggio a croce deve trovarlo.
    const wall = (_x: number, y: number): number => (y >= 5 ? 150 : 0);
    const orbit = airshipOrbit(structure, mast, wall)!;

    // Senza torri la crociera resta la dichiarata: 96 (piano) + 10 (pilone)
    // + 14 (crociera).
    const flat = airshipOrbit(structure, mast, () => 0)!;
    expect(Math.max(...flat.path.map((point) => point.z))).toBe(120);

    expect(Math.max(...orbit.path.map((point) => point.z)))
      .toBe(150 + TRAFFIC.aloftClearance);
  });
});
