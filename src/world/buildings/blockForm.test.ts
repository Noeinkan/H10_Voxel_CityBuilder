import { describe, expect, it } from 'vitest';
import { blockRoom, lotRoleOf } from './blockForm';
import { BLOCK, LOT_ROLE } from './config';
import type { BlockRect } from '../streets/streetGrid';

/**
 * Il ruolo di un lotto dentro il proprio isolato.
 *
 * Puro come `cluster.ts`: entrano un riquadro e un quadrato, esce un ruolo. E'
 * il motivo per cui questi test scrivono quattro numeri a mano invece di far
 * crescere una citta' per vedere dove cade un angolo.
 */

/** Un isolato di venti colonne di lato, estremi inclusi. */
const RECT: BlockRect = { x0: 100, y0: 200, x1: 119, y1: 219 };

describe('lotRoleOf', () => {
  it('i quattro angoli sono angoli', () => {
    const fp = 6;
    const corners: readonly (readonly [number, number])[] = [
      [RECT.x0, RECT.y0],
      [RECT.x1 - fp + 1, RECT.y0],
      [RECT.x0, RECT.y1 - fp + 1],
      [RECT.x1 - fp + 1, RECT.y1 - fp + 1],
    ];
    for (const [x, y] of corners) {
      expect(lotRoleOf(RECT, x, y, fp), `${x},${y}`).toBe(LOT_ROLE.corner);
    }
  });

  it('sono esattamente quattro, e non un lato intero', () => {
    // Un `edgeReach` troppo largo trasformerebbe ogni lotto di un fronte in un
    // angolo, e l'eccezione smetterebbe di essere un'eccezione.
    const fp = 6;
    let corners = 0;
    for (let x = RECT.x0; x + fp - 1 <= RECT.x1; x++) {
      for (let y = RECT.y0; y + fp - 1 <= RECT.y1; y++) {
        if (lotRoleOf(RECT, x, y, fp) === LOT_ROLE.corner) corners++;
      }
    }
    // Con la tolleranza di `edgeReach` ogni angolo e' un quadratino di lato
    // `edgeReach + 1`, non un punto solo: quattro angoli per quel quadrato.
    expect(corners).toBe(4 * (BLOCK.edgeReach + 1) ** 2);
  });

  it('a meta di un lato e fronte strada, non angolo', () => {
    const fp = 6;
    const midX = Math.floor((RECT.x0 + RECT.x1) / 2) - 2;
    expect(lotRoleOf(RECT, midX, RECT.y0, fp)).toBe(LOT_ROLE.frontage);
    expect(lotRoleOf(RECT, RECT.x0, Math.floor((RECT.y0 + RECT.y1) / 2) - 2, fp))
      .toBe(LOT_ROLE.frontage);
  });

  it('staccato da tutti i bordi e cuore', () => {
    expect(lotRoleOf(RECT, RECT.x0 + 6, RECT.y0 + 6, 4)).toBe(LOT_ROLE.interior);
  });

  it('e invariante allo scambio degli assi', () => {
    // Un isolato ruotato di un quarto di giro deve dare gli stessi ruoli, o la
    // stessa citta' avrebbe torri d'angolo diverse a seconda del verso della
    // maglia.
    const flipped: BlockRect = { x0: RECT.y0, y0: RECT.x0, x1: RECT.y1, y1: RECT.x1 };
    const fp = 5;
    for (let dx = 0; dx <= 14; dx++) {
      for (let dy = 0; dy <= 14; dy++) {
        expect(
          lotRoleOf(RECT, RECT.x0 + dx, RECT.y0 + dy, fp),
          `${dx},${dy}`,
        ).toBe(lotRoleOf(flipped, flipped.x0 + dy, flipped.y0 + dx, fp));
      }
    }
  });

  it('un lotto largo quanto l isolato e un angolo', () => {
    // Tocca tutti e quattro i lati: e' il caso degenere, e la risposta giusta e'
    // «angolo» — non «cuore», che direbbe il contrario di quel che si vede.
    expect(lotRoleOf(RECT, RECT.x0, RECT.y0, 20)).toBe(LOT_ROLE.corner);
  });
});

describe('blockRoom', () => {
  it('misura lo spazio fino al bordo dell isolato', () => {
    expect(blockRoom(RECT, RECT.x0, RECT.y0, 1)).toBe(20);
    expect(blockRoom(RECT, RECT.x0 + 14, RECT.y0, 1)).toBe(6);
    expect(blockRoom(RECT, RECT.x0, RECT.y0 + 16, 1)).toBe(4);
  });

  it('non scende mai sotto il pavimento', () => {
    // Un edificio materializzato da una partita salvata puo' avere l'ancora su
    // una colonna che la rete di oggi considera carreggiata: rimpicciolirlo per
    // questo sarebbe una demolizione mascherata da upgrade.
    expect(blockRoom(RECT, RECT.x1 + 4, RECT.y1 + 4, 6)).toBe(6);
    expect(blockRoom(RECT, RECT.x0 + 18, RECT.y0, 8)).toBe(8);
  });
});
