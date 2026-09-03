import { describe, expect, it } from 'vitest';
import { AERIAL_FACE, faceAxis, faceOutward, type AerialFace } from './terracePlan';
import { holdFits, type DeckHold, type SolidAt } from './deckHold';

/**
 * La regola verificata sul solo fatto che deve garantire: **un impalcato resta
 * appeso a un muro, o la promozione non si fa**.
 *
 * Le due sagome entrano come predicati, quindi qui non c'e' ne' uno stamp ne' un
 * mondo: una torre e' un parallelepipedo di colonne piene, e crescere significa
 * darle piu' quote o piu' pianta.
 */

/** Una torre come occupazione del mondo: riquadro pieno da `baseZ` per `height`. */
function tower(x: number, y: number, side: number, baseZ: number, height: number): SolidAt {
  return (cx, cy, cz) =>
    cx >= x && cx < x + side &&
    cy >= y && cy < y + side &&
    cz >= baseZ && cz < baseZ + height;
}

/** Nessuna colonna piena da nessuna parte. */
const VOID: SolidAt = () => false;

/**
 * Una mensola appesa alla faccia di una torre 8x8 con l'angolo in (10, 20).
 *
 * Sporge di tre colonne a partire da quella subito fuori dal muro, che e' come
 * `terraceRect` la dispone.
 */
function terraceOn(face: AerialFace, z = 24): DeckHold {
  const axis = faceAxis(face);
  const outward = faceOutward(face);
  const wall = axis === 0
    ? (outward > 0 ? 17 : 10)
    : (outward > 0 ? 27 : 20);
  const start = outward > 0 ? wall + 1 : wall - 3;

  return {
    rect: axis === 0
      ? { x: start, y: 21, sizeX: 3, sizeY: 4 }
      : { x: 11, y: start, sizeX: 4, sizeY: 3 },
    z,
    baseZ: z,
    height: 1,
    axis,
    sign: outward,
  };
}

describe('holdFits — la parete dopo la promozione', () => {
  it('una torre che sale in altezza conserva il muro sotto la mensola', () => {
    const hold = terraceOn(AERIAL_FACE.east);
    const was = tower(10, 20, 8, 12, 20);
    // Stessa pianta, otto quote in piu': e' esattamente cio' che un livello
    // aggiunge a parita' di impronta.
    const now = tower(10, 20, 8, 12, 28);

    expect(holdFits(hold, was, now)).toBeNull();
  });

  it('una torre che si allarga si mangia il piano', () => {
    const hold = terraceOn(AERIAL_FACE.east);
    const was = tower(10, 20, 8, 12, 20);
    // L'anello in piu' arriva fin dentro il riquadro della mensola.
    const now = tower(10, 20, 10, 12, 20);

    expect(holdFits(hold, was, now)).toBe('swallowed');
  });

  it('una sagoma che arretra alla quota della mensola la lascia senza muro', () => {
    const hold = terraceOn(AERIAL_FACE.east);
    const was = tower(10, 20, 8, 12, 20);
    // Il corpo nuovo rientra di due colonne: il muro a cui era appesa non c'e'
    // piu', e la mensola resterebbe a mezz'aria.
    const now = tower(10, 20, 6, 12, 28);

    expect(holdFits(hold, was, now)).toBe('unwalled');
  });

  it('una sagoma che si ferma sotto la mensola non la regge piu', () => {
    const hold = terraceOn(AERIAL_FACE.east);
    const was = tower(10, 20, 8, 12, 20);
    // La quota della mensola e' 24: una torre alta fino a 22 non ci arriva.
    const now = tower(10, 20, 8, 12, 10);

    expect(holdFits(hold, was, now)).toBe('unwalled');
  });

  it('vale su tutte e quattro le facce', () => {
    for (const face of [AERIAL_FACE.east, AERIAL_FACE.west,
      AERIAL_FACE.north, AERIAL_FACE.south]) {
      const hold = terraceOn(face);
      const was = tower(10, 20, 8, 12, 20);

      expect(holdFits(hold, was, tower(10, 20, 8, 12, 28))).toBeNull();
      // La colonna di muro sparisce e il piano resta libero: e' `unwalled` e non
      // `swallowed`, cioe' il rifiuto viene dalla parete e non dal volume.
      expect(holdFits(hold, was, VOID)).toBe('unwalled');
    }
  });

  it('un appiglio che non aveva muro nemmeno prima non si promuove', () => {
    const hold = terraceOn(AERIAL_FACE.east);
    // Il verso dice "est", ma da quella parte non c'era niente: e' la gamba
    // concentrica al proprio ospite, che non si sa misurare.
    expect(holdFits(hold, VOID, VOID)).toBe('unwalled');
  });

  it('una piattaforma di facciata guarda tutta la propria altezza', () => {
    // Uno Skyport porta la ricetta sopra il piano: il volume da tenere libero
    // parte dal piano e sale, mentre il muro lo regge alla quota di base.
    const hold: DeckHold = {
      rect: { x: 18, y: 20, sizeX: 6, sizeY: 8 },
      z: 24,
      baseZ: 24,
      height: 9,
      axis: 0,
      sign: 1,
    };
    const was = tower(10, 20, 8, 12, 20);

    expect(holdFits(hold, was, tower(10, 20, 8, 12, 30))).toBeNull();
    // Un allargamento che entra nel volume della ricetta, non solo nel piano.
    expect(holdFits(hold, was, tower(10, 20, 12, 12, 30))).toBe('swallowed');
  });
});
