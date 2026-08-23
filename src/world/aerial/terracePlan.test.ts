import { describe, expect, it } from 'vitest';
import { AERIAL } from './config';
import {
  AERIAL_FACE,
  AERIAL_FACES,
  faceRuns,
  overhangOf,
  planTerrace,
  type AerialSupport,
} from './terracePlan';
import { TestGround } from './testProbe';

/**
 * L'aggetto, verificato sul fatto che lo rende nuovo: **sporge oltre
 * l'impronta**.
 *
 * Fino a qui nessuna fascia poteva uscire dal riquadro dichiarato, ed e' scritto
 * nella grammatica degli edifici. La mensola e' la prima cosa che lo fa, e i test
 * qui sotto guardano proprio quel voxel: quanti ce ne sono oltre il filo, e a che
 * quota si attaccano.
 */

const HOST: AerialSupport = { id: 7, x: 20, y: 20, sizeX: 8, sizeY: 8, baseZ: 4, height: 32 };

/** Una torre a due fasce: la seconda rientra di uno, e la sua base e' una terrazza. */
function city(recess = 1): TestGround {
  return new TestGround(4).tower(20, 20, 8, 4, 20, 36, recess, HOST.id);
}

describe('faceRuns — dove una facciata offre un piano', () => {
  it('trova la sommita della fascia bassa, dove quella sopra si e ritirata', () => {
    const runs = faceRuns(city(), HOST, AERIAL_FACE.east);

    expect(runs.length).toBeGreaterThan(0);
    // La fascia bassa finisce a 19 (arriva fino a `mid` escluso), e li' sopra c'e'
    // aria sul filo dell'impronta: e' la terrazza che la grammatica produce gia'.
    expect(runs[0].z).toBe(19);
    expect(runs[0].wall).toBe(27);
    expect(runs[0].to - runs[0].from + 1).toBe(8);
  });

  it('non si attacca a una fascia troppo rientrata: sarebbe un cappello', () => {
    // Rientro di quattro per lato, oltre `maxRecess`: la parete sta nel mezzo
    // dell'edificio, e una mensola attaccata li' uscirebbe da tutti e due i lati.
    const runs = faceRuns(
      new TestGround(4).box(20, 20, 8, 8, 4, 20, HOST.id).box(24, 24, 1, 1, 20, 36, HOST.id),
      HOST,
      AERIAL_FACE.east,
    );
    expect(runs.every((run) => 27 - run.wall <= AERIAL.terrace.maxRecess)).toBe(true);
  });
});

describe('planTerrace — la mensola', () => {
  it('sporge oltre l impronta dell ospite, alla quota di una fascia', () => {
    const result = planTerrace({ host: HOST, faces: [AERIAL_FACE.east], ...city() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { rect, deckZ } = result.plan.deck;
    expect(deckZ).toBe(19);
    // **Il voxel del fatto nuovo**: il riquadro comincia oltre il filo est
    // dell'impronta, che sta a 27.
    expect(rect.x).toBe(28);
    expect(rect.x + rect.sizeX).toBeGreaterThan(HOST.x + HOST.sizeX);
    expect(result.plan.face).toBe(AERIAL_FACE.east);
    expect(result.plan.host).toBe(HOST.id);
  });

  it('quanto e larga tanto e profonda, e oltre lo sbalzo si fa le gambe', () => {
    expect(overhangOf(3)).toBe(AERIAL.terrace.minOverhang);
    expect(overhangOf(5)).toBe(5);
    expect(overhangOf(40)).toBe(AERIAL.terrace.maxOverhang);

    const result = planTerrace({ host: HOST, faces: [AERIAL_FACE.east], ...city() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Un fronte di otto porta una mensola di otto, che e' oltre `reach`: le gambe
    // non sono una regola a parte, sono la conseguenza.
    expect(result.plan.deck.rect.sizeX).toBe(8);
    expect(result.plan.deck.piers.length).toBeGreaterThan(0);
  });

  it('funziona su tutte e quattro le facce, e ognuna esce dalla propria', () => {
    for (const face of AERIAL_FACES) {
      const result = planTerrace({ host: HOST, faces: [face], ...city() });
      expect(result.ok, `faccia ${face}`).toBe(true);
      if (!result.ok) continue;

      const { rect } = result.plan.deck;
      if (face === AERIAL_FACE.east) expect(rect.x).toBeGreaterThan(HOST.x + HOST.sizeX - 1);
      if (face === AERIAL_FACE.west) expect(rect.x + rect.sizeX).toBeLessThanOrEqual(HOST.x);
      if (face === AERIAL_FACE.north) expect(rect.y).toBeGreaterThan(HOST.y + HOST.sizeY - 1);
      if (face === AERIAL_FACE.south) expect(rect.y + rect.sizeY).toBeLessThanOrEqual(HOST.y);
    }
  });

  it('rifiuta un fronte senza una corsa di parete abbastanza lunga', () => {
    // Una torre sottile: il fronte esiste ma non arriva a `minRun`.
    const thin: AerialSupport = { ...HOST, sizeX: 3, sizeY: 3 };
    const result = planTerrace({
      host: thin,
      faces: [AERIAL_FACE.east],
      ...new TestGround(4).box(20, 20, 3, 3, 4, 36, thin.id),
    });
    expect(result).toEqual({ ok: false, refusal: 'noRun' });
  });

  it('e deterministico: lo stesso ospite da la stessa mensola', () => {
    const a = planTerrace({ host: HOST, faces: AERIAL_FACES, ...city() });
    const b = planTerrace({ host: HOST, faces: AERIAL_FACES, ...city() });
    expect(a).toEqual(b);
  });
});
