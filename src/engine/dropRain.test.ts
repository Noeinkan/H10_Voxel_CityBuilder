import { describe, expect, it } from 'vitest';
import { CHUNK } from '../world/chunkCoords';
import {
  RAIN,
  advanceRain,
  createRain,
  spawnOverChunk,
  type RainProbe,
  type RainState,
} from './dropRain';

/** Sonda piatta: la superficie di ogni colonna sta alla stessa quota. */
function flatProbe(z: number, palette = 7): RainProbe {
  return () => ({ z, palette });
}

/** Quota di partenza di prova: i cubetti cadono da fuori schermo, non da poco sopra. */
const RISE = 700;

/** Semina un chunk e restituisce lo stato, per non ripetere le tre righe. */
function seeded(probe: RainProbe, now = 0, cz = 0): RainState {
  const state = createRain();
  spawnOverChunk(state, 2, 3, cz, now, RISE, probe);
  return state;
}

describe('dropRain', () => {
  it("semina dentro l'impronta del chunk e non oltre il proprio conto", () => {
    const state = seeded(flatProbe(10));

    expect(state.cubes.length).toBeGreaterThan(0);
    expect(state.cubes.length).toBeLessThanOrEqual(RAIN.perChunk);
    for (const cube of state.cubes) {
      expect(cube.x).toBeGreaterThanOrEqual(2 * CHUNK);
      expect(cube.x).toBeLessThan(3 * CHUNK);
      expect(cube.y).toBeGreaterThanOrEqual(3 * CHUNK);
      expect(cube.y).toBeLessThan(4 * CHUNK);
      expect(cube.landing).toBe(11 + RAIN.size / 2);
      expect(cube.z).toBe(cube.landing + RISE);
      expect(cube.palette).toBe(7);
    }
  });

  it('su una colonna che la sonda non conosce non piove niente', () => {
    expect(seeded(() => null).cubes).toHaveLength(0);
  });

  it('la superficie appartiene a un piano di chunk solo', () => {
    // Una colonna alta due piani di chunk riceverebbe la pioggia due volte:
    // a seminarla e' quello che contiene davvero la superficie.
    const surface = CHUNK + 4;
    expect(seeded(flatProbe(surface), 0, 1).cubes.length).toBeGreaterThan(0);
    expect(seeded(flatProbe(surface), 0, 0).cubes).toHaveLength(0);
  });

  it("una superficie sull'ultimo piano di un chunk resta di quel chunk", () => {
    // Il cubetto atterra sopra di lei, cioe' nel chunk successivo, che pero' e'
    // aria e non ha nessuna mesh da accompagnare: a decidere e' il voxel pieno.
    const surface = CHUNK - 1;
    expect(seeded(flatProbe(surface), 0, 0).cubes.length).toBeGreaterThan(0);
    expect(seeded(flatProbe(surface), 0, 1).cubes).toHaveLength(0);
  });

  it("la semina e' deterministica per chunk", () => {
    const first = seeded(flatProbe(10)).cubes.map((cube) => `${cube.x},${cube.y},${cube.born}`);
    const second = seeded(flatProbe(10)).cubes.map((cube) => `${cube.x},${cube.y},${cube.born}`);

    expect(second).toEqual(first);
  });

  it("sotto pressione si assottiglia invece di superare il tetto", () => {
    const state = createRain();
    const probe = flatProbe(10);
    for (let cy = 0; cy < 200; cy++) spawnOverChunk(state, 0, cy, 0, 0, RISE, probe);

    expect(state.cubes.length).toBe(RAIN.maxLive);
    expect(spawnOverChunk(state, 0, 500, 0, 0, RISE, probe)).toBe(0);
  });

  it("un cubetto non si vede finche' non e' partito", () => {
    const state = seeded(flatProbe(10), 5);
    const first = state.cubes[0];

    advanceRain(state, first.born - 0.01);
    expect(first.falling).toBe(false);
    expect(first.z).toBe(first.landing + RISE);
  });

  it('scende accelerando e sparisce quando ha toccato', () => {
    const state = seeded(flatProbe(10));
    const cube = state.cubes[0];
    const quarter = RAIN.duration / 4;

    advanceRain(state, cube.born + quarter);
    const early = cube.z;
    advanceRain(state, cube.born + 2 * quarter);
    const late = cube.z;

    expect(early).toBeLessThan(cube.landing + RISE);
    expect(late).toBeLessThan(early);
    // Come i blocchi: il secondo quarto di tempo copre piu' strada del primo.
    expect(cube.landing + RISE - early).toBeLessThan(early - late);

    advanceRain(state, cube.born + RAIN.duration);
    expect(state.cubes).not.toContain(cube);
  });

  it('la pioggia si svuota tutta, anche con partenze sfalsate', () => {
    const state = seeded(flatProbe(10));
    expect(state.cubes.length).toBeGreaterThan(1);

    advanceRain(state, RAIN.spread + RAIN.duration);
    expect(state.cubes).toHaveLength(0);
  });
});
