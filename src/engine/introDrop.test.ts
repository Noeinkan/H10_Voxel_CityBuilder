import { describe, expect, it } from 'vitest';
import { DROP_SPAN, INTRO, dropDelay, dropLift, fallHeightFor, hasLanded } from './introDrop';

/** Una quota di partenza plausibile: un'isola inquadrata intera sta su queste scale. */
const FALL = 700;

describe('introDrop', () => {
  it("resta appeso alla quota di partenza finche' il ritardo non e' passato", () => {
    expect(dropLift(-0.2, FALL)).toBe(FALL);
    expect(dropLift(0, FALL)).toBe(FALL);
  });

  it('accelera invece di galleggiare', () => {
    // Un ease-out farebbe il contrario: tanta strada subito e poi il
    // galleggiamento. Qui il primo quarto di tempo vale meno dell'ultimo.
    const quarter = INTRO.duration / 4;
    const first = dropLift(0, FALL) - dropLift(quarter, FALL);
    const last = dropLift(INTRO.duration - quarter, FALL) - dropLift(INTRO.duration, FALL);

    expect(first).toBeGreaterThan(0);
    expect(last).toBeGreaterThan(first);
  });

  it('la parte fuori schermo se ne va in fretta', () => {
    // Da centinaia di voxel di quota il pezzo e' invisibile finche' non entra
    // dal bordo alto: che a meta' tempo abbia gia' fatto un quarto di strada e'
    // cio' che tiene guardabile il tratto che si vede davvero.
    expect(dropLift(INTRO.duration / 2, FALL)).toBeCloseTo(FALL * 0.75, 6);
  });

  it('scende senza mai risalire, fino a toccare terra alla fine della discesa', () => {
    let previous = dropLift(0, FALL);
    for (let age = 0; age <= INTRO.duration; age += INTRO.duration / 40) {
      const lift = dropLift(age, FALL);
      expect(lift).toBeLessThanOrEqual(previous + 1e-9);
      previous = lift;
    }
    expect(dropLift(INTRO.duration, FALL)).toBeCloseTo(0, 10);
  });

  it("il rimbalzo e' in voxel e non in frazione della caduta", () => {
    const peak = dropLift(INTRO.duration + INTRO.bounceDuration / 2, FALL);

    expect(peak).toBeCloseTo(INTRO.bounceLift, 10);
    // Da mille voxel di quota un rimbalzo proporzionale sarebbe una seconda
    // caduta: qui non dipende affatto da quanto e' stata alta la prima.
    expect(dropLift(INTRO.duration + INTRO.bounceDuration / 2, FALL * 3)).toBeCloseTo(peak, 10);
    expect(dropLift(DROP_SPAN, FALL)).toBe(0);
  });

  it('a terra ci resta', () => {
    expect(hasLanded(DROP_SPAN - 1e-6)).toBe(false);
    expect(hasLanded(DROP_SPAN)).toBe(true);
    expect(dropLift(DROP_SPAN + 10, FALL)).toBe(0);
  });

  it('la quota di partenza sta fuori dallo schermo, non poco sopra il terreno', () => {
    const visible = 600;
    const pitch = 35;
    const fall = fallHeightFor(visible, pitch);
    // Il dislivello proiettato sullo schermo: `h * cos(inclinazione)`. Ne serve
    // piu' di un'altezza visibile intera, o il pezzo che riposa in fondo allo
    // schermo partirebbe ancora dentro l'inquadratura.
    const onScreen = fall * Math.cos((pitch * Math.PI) / 180);

    expect(onScreen).toBeGreaterThan(visible);
  });

  it('segue lo zoom, e non diverge guardando a picco', () => {
    expect(fallHeightFor(1200, 35)).toBeGreaterThan(fallHeightFor(600, 35));
    // Inquadratura minuscola: sotto una certa quota la caduta non si legge.
    expect(fallHeightFor(1, 35)).toBe(INTRO.minFall);
    // A picco un dislivello non muove quasi niente sullo schermo: la formula
    // divergerebbe, e il tetto e' cio' che le impedisce di farlo.
    expect(fallHeightFor(2000, 82)).toBe(INTRO.maxFall);
  });

  it("il ritardo e' deterministico e sta dentro il jitter dichiarato", () => {
    for (let cx = 0; cx < 8; cx++) {
      for (let cy = 0; cy < 8; cy++) {
        const delay = dropDelay(cx, cy, 0);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(INTRO.jitter);
        expect(dropDelay(cx, cy, 0)).toBe(delay);
      }
    }
  });

  it('il piano di chunk sopra parte dopo quello sotto, sulla stessa colonna', () => {
    // Il mondo si impila: la cima di una collina non puo' atterrare prima della
    // base che la regge.
    expect(dropDelay(3, 5, 1) - dropDelay(3, 5, 0)).toBeCloseTo(INTRO.tierDelay, 10);
    // Un piano sotto lo zero non anticipa nessuno: il termine e' un ritardo.
    expect(dropDelay(3, 5, -2)).toBe(dropDelay(3, 5, 0));
  });

  it('chunk vicini non atterrano in lockstep', () => {
    const delays = new Set<number>();
    for (let cx = 0; cx < 4; cx++) {
      for (let cy = 0; cy < 4; cy++) delays.add(dropDelay(cx, cy, 0));
    }
    expect(delays.size).toBe(16);
  });
});
