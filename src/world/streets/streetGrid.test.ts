import { describe, expect, it } from 'vitest';
import { STREETS } from './config';
import {
  STREET_ROLE,
  blockAt,
  blockRect,
  isArterial,
  isPavement,
  lineEnd,
  lineStart,
  lineWidth,
  nearestLine,
  streetRoleAt,
} from './streetGrid';

/**
 * La rete e' una funzione pura di `(seed, x, y)`, quindi si verifica come una
 * funzione: nessun mondo, nessun terreno, nessuna sequenza di chiamate da
 * ricostruire. Sono proprieta' su un campione fitto di colonne, non asserzioni
 * su posizioni scelte a mano — una griglia deformata non ha posizioni notevoli
 * da citare, e un test che ne fissasse una si romperebbe alla prima ritaratura
 * del passo.
 */

const SEED = 1337;

/** Campione che copre coordinate negative: il mondo non ha un angolo di origine. */
function* columns(): Generator<readonly [number, number]> {
  for (let y = -40; y <= 80; y++) {
    for (let x = -40; x <= 80; x++) yield [x, y];
  }
}

describe('streetGrid — partizione', () => {
  it('ogni colonna e carreggiata oppure isolato, mai entrambe', () => {
    for (const [x, y] of columns()) {
      const role = streetRoleAt(SEED, x, y);
      const pavement = role === STREET_ROLE.arterial || role === STREET_ROLE.minor;
      expect(pavement).toBe(isPavement(SEED, x, y));
    }
  });

  it('il riquadro dell isolato contiene la colonna che lo ha dichiarato', () => {
    for (const [x, y] of columns()) {
      if (isPavement(SEED, x, y)) continue;
      const rect = blockRect(SEED, blockAt(SEED, x, y));
      expect(x).toBeGreaterThanOrEqual(rect.x0);
      expect(x).toBeLessThanOrEqual(rect.x1);
      expect(y).toBeGreaterThanOrEqual(rect.y0);
      expect(y).toBeLessThanOrEqual(rect.y1);
    }
  });

  it('nessun isolato resta vuoto e nessuno diventa un campo', () => {
    // I limiti si ricavano dalla configurazione invece di essere scritti a
    // mano: sono una conseguenza di passo, scostamento e larghezze, e ricopiarli
    // qui significherebbe non accorgersi di una ritaratura che li sfonda.
    const minSide = STREETS.pitch - 2 * STREETS.jitter - STREETS.arterialWidth;
    const maxSide = STREETS.pitch + 2 * STREETS.jitter - STREETS.minorWidth;
    expect(minSide).toBeGreaterThanOrEqual(4);

    for (let k = -8; k <= 8; k++) {
      for (const axis of [0, 1]) {
        const side = lineStart(SEED, axis, k + 1) - lineStart(SEED, axis, k) - lineWidth(k);
        expect(side).toBeGreaterThanOrEqual(minSide);
        expect(side).toBeLessThanOrEqual(maxSide);
      }
    }
  });
});

describe('streetGrid — gerarchia', () => {
  it('gli assi principali cadono a passo fisso e sono piu larghi', () => {
    for (let k = -8; k <= 8; k++) {
      expect(isArterial(k)).toBe(((k % STREETS.arterialEvery) + STREETS.arterialEvery) %
        STREETS.arterialEvery === 0);
      expect(lineWidth(k)).toBe(isArterial(k) ? STREETS.arterialWidth : STREETS.minorWidth);
    }
  });

  it('la carreggiata di un asse e larga esattamente quanto dichiarato', () => {
    for (let k = -8; k <= 8; k++) {
      for (const axis of [0, 1]) {
        const start = lineStart(SEED, axis, k);
        const end = lineEnd(SEED, axis, k);
        expect(end - start + 1).toBe(lineWidth(k));
        for (let v = start; v <= end; v++) {
          const role = axis === 0 ? streetRoleAt(SEED, v, start) : streetRoleAt(SEED, start, v);
          const pavement = role === STREET_ROLE.arterial || role === STREET_ROLE.minor;
          expect(pavement).toBe(true);
        }
      }
    }
  });

  it('un incrocio con un asse principale resta principale', () => {
    // L'asse 0 e' principale per costruzione: dove incontra un asse secondario
    // la carreggiata non deve declassarsi, o la gerarchia si spezzerebbe
    // proprio agli incroci, che sono il punto in cui si legge.
    const x = lineStart(SEED, 0, 0);
    for (let y = -40; y <= 80; y++) {
      if (!isPavement(SEED, x, y)) continue;
      expect(streetRoleAt(SEED, x, y)).toBe(STREET_ROLE.arterial);
    }
  });
});

describe('streetGrid — fronte strada', () => {
  it('il fronte tocca una carreggiata e il cuore non la tocca', () => {
    let frontage = 0;
    let interior = 0;

    for (const [x, y] of columns()) {
      const role = streetRoleAt(SEED, x, y);
      if (role === STREET_ROLE.arterial || role === STREET_ROLE.minor) continue;

      const touches = isPavement(SEED, x + 1, y) || isPavement(SEED, x - 1, y) ||
        isPavement(SEED, x, y + 1) || isPavement(SEED, x, y - 1);

      if (role === STREET_ROLE.frontage) {
        expect(touches).toBe(true);
        frontage++;
      } else {
        expect(touches).toBe(false);
        interior++;
      }
    }

    // Entrambi devono esistere davvero: una maglia che producesse solo fronte
    // non avrebbe cuori da terrazzare, e una che producesse solo cuore non
    // avrebbe dove costruire.
    expect(frontage).toBeGreaterThan(0);
    expect(interior).toBeGreaterThan(0);
  });
});

describe('streetGrid — carreggiata piu’ vicina', () => {
  it('la riga restituita e’ carreggiata, ed e’ la piu’ vicina', () => {
    // `isPavement` non serve qui: prende due coordinate e risponde per **la
    // colonna**, quindi con l'altra fissa risponderebbe di si' ovunque appena
    // quella cade su un asse. La proprieta' si verifica sull'asse solo.
    for (let axis = 0; axis <= 1; axis++) {
      for (let v = -40; v <= 80; v++) {
        const centre = nearestLine(SEED, axis, v);

        // Il centro cade dentro la carreggiata di un asse vero, non fra due.
        const base = Math.floor(centre / STREETS.pitch);
        let covered = false;
        for (let k = base - 2; k <= base + 2; k++) {
          const start = lineStart(SEED, axis, k);
          if (centre >= start && centre < start + lineWidth(k)) covered = true;
        }
        expect(covered, `asse ${axis}, v ${v}: ${centre} non cade su una carreggiata`).toBe(true);

        // E nessun altro asse ha il centro piu' vicino: la finestra a tre
        // candidati e' larga abbastanza, con lo scostamento sotto meta' passo.
        const near = Math.floor(v / STREETS.pitch);
        for (let k = near - 3; k <= near + 3; k++) {
          const other = lineStart(SEED, axis, k) + lineWidth(k) * 0.5;
          expect(Math.abs(centre - v)).toBeLessThanOrEqual(Math.abs(other - v));
        }
      }
    }
  });
});

describe('streetGrid — determinismo', () => {
  it('lo stesso seed da sempre la stessa rete', () => {
    for (const [x, y] of columns()) {
      expect(streetRoleAt(SEED, x, y)).toBe(streetRoleAt(SEED, x, y));
      const a = blockAt(SEED, x, y);
      const b = blockAt(SEED, x, y);
      expect(a).toEqual(b);
    }
  });

  it('seed diversi spostano gli assi', () => {
    let moved = 0;
    for (let k = -8; k <= 8; k++) {
      if (lineStart(SEED, 0, k) !== lineStart(SEED + 1, 0, k)) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('i due assi non sono la stessa sequenza', () => {
    // Con una sola sala la maglia sarebbe simmetrica sulla diagonale, e una
    // citta' specchiata si nota a colpo d'occhio.
    let different = 0;
    for (let k = -8; k <= 8; k++) {
      if (lineStart(SEED, 0, k) !== lineStart(SEED, 1, k)) different++;
    }
    expect(different).toBeGreaterThan(0);
  });
});
