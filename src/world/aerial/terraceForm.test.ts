import { describe, expect, it } from 'vitest';
import { SCALE } from '../scale';
import { AERIAL } from './config';
import type { DeckRect } from './deckPlan';
import {
  chamfered,
  cornerCutOf,
  overhangOf,
  terraceEdge,
  terraceShape,
  terraceSide,
  type TerraceSide,
} from './terraceForm';

/**
 * La forma di una mensola, verificata sui due difetti che questo file esiste per
 * togliere: **erano tutte quadrate** e senza un davanti leggibile.
 *
 * Sono due proprieta' che si controllano senza mondo e senza GPU — entrano un
 * numero e un riquadro — ed e' il motivo per cui la forma sta in un modulo puro
 * invece che dentro il generatore.
 */

/** Un fronte di mezzo modulo: la corsa su cui le quattro forme si distinguono. */
const RUN = 8;

/** Il fronte piu' lungo che un edificio possa offrire: l'impronta del modulo. */
const MODULE = SCALE.moduleFootprint;

/** Una mensola che sporge verso est: la parete e' la colonna a `x - 1`. */
const EAST: TerraceSide = { axis: 0, outward: 1 };

describe('terraceShape — la pianta', () => {
  it('non e piu sempre quadrata: le quattro forme sono quattro riquadri diversi', () => {
    const shapes = AERIAL.terrace.forms.map((_, seed) => terraceShape(RUN, seed));
    const drawn = new Set(shapes.map((s) => `${s.length}x${s.overhang}@${s.shift}`));

    // **E' il difetto scritto come test.** `overhangOf` dentro i due estremi e'
    // l'identita', quindi ogni fronte fra tre e otto usciva `run x run`: quattro
    // mensole su una citta' erano lo stesso quadrato in quattro dimensioni.
    expect(drawn.size).toBe(AERIAL.terrace.forms.length);
    expect(shapes.filter((s) => s.length === s.overhang).length).toBeLessThanOrEqual(1);
  });

  it('sta dentro la corsa che le tocca, e non scende sotto i minimi', () => {
    for (let run = AERIAL.terrace.minRun; run <= RUN; run++) {
      for (let seed = 0; seed < AERIAL.terrace.forms.length; seed++) {
        const shape = terraceShape(run, seed);
        expect(shape.length, `corsa ${run}, forma ${seed}`).toBeLessThanOrEqual(run);
        expect(shape.length).toBeGreaterThanOrEqual(Math.min(run, AERIAL.terrace.minRun));
        // Lo scorrimento non puo' portare il riquadro oltre il capo alto: li'
        // sotto non c'e' piu' parete a cui appendersi.
        expect(shape.shift + shape.length).toBeLessThanOrEqual(run);
        expect(shape.overhang).toBeGreaterThanOrEqual(AERIAL.terrace.minOverhang);
        expect(shape.overhang).toBeLessThanOrEqual(AERIAL.terrace.maxOverhang);
      }
    }
  });

  it('lo sporto di riferimento resta quello dichiarato', () => {
    // La regola vecchia non e' sparita: e' diventata la misura su cui le forme si
    // tarano, ed e' ancora lei a dire che un fronte lungo porta una terrazza.
    expect(overhangOf(3)).toBe(AERIAL.terrace.minOverhang);
    expect(overhangOf(5)).toBe(5);
    expect(overhangOf(40)).toBe(AERIAL.terrace.maxOverhang);
    // Il tetto e' un parametro, e chi ha visto sorgere un'arcologia passa il suo.
    expect(overhangOf(40, AERIAL.terrace.megaOverhang)).toBe(AERIAL.terrace.megaOverhang);
  });

  it('il tetto della fase e cio che separa il balcone dal mensolone', () => {
    // **E' il difetto scritto come test.** Con `maxOverhang` legato al modulo, un
    // fronte al modulo dava una loggia profonda quanto il modulo — un altopiano
    // grande quanto l'isolato — e la dava dal primo minuto di gioco. La corsa
    // continua a seguire la facciata; e' la profondita' che fa la piattaforma.
    const run = MODULE;
    const deepest = (max?: number): number => Math.max(
      ...AERIAL.terrace.forms.map((_, seed) => terraceShape(run, seed, max).overhang),
    );

    // La forma piu' profonda del repertorio satura il tetto che le tocca, e non
    // puo' superare la corsa: vale per qualunque coppia di manopole.
    expect(deepest()).toBe(Math.min(run, AERIAL.terrace.maxOverhang));
    expect(deepest(AERIAL.terrace.megaOverhang)).toBe(
      Math.min(run, AERIAL.terrace.megaOverhang),
    );
  });

  it('e una funzione del seme, non un tiro: lo stesso seme da la stessa forma', () => {
    expect(terraceShape(RUN, 12345)).toEqual(terraceShape(RUN, 12345));
  });
});

describe('chamfered — lo smusso degli angoli esterni', () => {
  it('taglia i due angoli lontani dalla parete e lascia stare gli altri due', () => {
    const rect: DeckRect = { x: 10, y: 0, sizeX: RUN, sizeY: 6 };
    const cut = cornerCutOf(rect);
    const tip = rect.x + rect.sizeX - 1;

    expect(chamfered(rect, EAST, cut, tip, rect.y)).toBe(true);
    expect(chamfered(rect, EAST, cut, tip, rect.y + rect.sizeY - 1)).toBe(true);
    // Contro la parete lo smusso lascerebbe un buco fra il piano e il muro.
    expect(chamfered(rect, EAST, cut, rect.x, rect.y)).toBe(false);
    expect(chamfered(rect, EAST, cut, rect.x, rect.y + rect.sizeY - 1)).toBe(false);
  });

  it('su una mensola piccola si riduce da solo a un angolo', () => {
    // Un balcone da tre di sporto: lo smusso dichiarato ne mangerebbe meta'.
    const small: DeckRect = { x: 10, y: 0, sizeX: AERIAL.terrace.minOverhang, sizeY: 4 };
    const cut = cornerCutOf(small);
    expect(cut).toBe(1);

    let carved = 0;
    for (let gy = small.y; gy < small.y + small.sizeY; gy++) {
      for (let gx = small.x; gx < small.x + small.sizeX; gx++) {
        if (chamfered(small, EAST, cut, gx, gy)) carved++;
      }
    }
    expect(carved).toBe(2);
  });

  it('il parapetto segue la sagoma smussata, non il riquadro', () => {
    const rect: DeckRect = { x: 10, y: 0, sizeX: RUN, sizeY: 6 };
    const cut = cornerCutOf(rect);
    const tip = rect.x + rect.sizeX - 1;

    // La cella tagliata non e' filo: non c'e'. Quella dietro lo diventa, ed e'
    // li' che il parapetto gira sulla diagonale invece di interrompersi.
    expect(terraceEdge(rect, EAST, cut, tip, rect.y)).toBe(false);
    expect(terraceEdge(rect, EAST, cut, tip - 1, rect.y + 1)).toBe(true);
  });
});

describe('terraceSide — da che parte sta la parete', () => {
  it('lo ricava dall ancoraggio, senza sapere cosa sia una faccia', () => {
    const wall: DeckRect = { x: 9, y: 0, sizeX: 1, sizeY: 6 };
    expect(terraceSide({ x: 10, y: 0, sizeX: 6, sizeY: 6 }, wall)).toEqual(EAST);
    expect(terraceSide({ x: 3, y: 0, sizeX: 6, sizeY: 6 }, wall)).toEqual({ axis: 0, outward: -1 });

    const ledge: DeckRect = { x: 0, y: 9, sizeX: 6, sizeY: 1 };
    expect(terraceSide({ x: 0, y: 10, sizeX: 6, sizeY: 6 }, ledge)).toEqual({ axis: 1, outward: 1 });
    expect(terraceSide({ x: 0, y: 3, sizeX: 6, sizeY: 6 }, ledge)).toEqual({ axis: 1, outward: -1 });
  });
});
