import { describe, expect, it } from 'vitest';
import { AERIAL } from '../aerial/config';
import { AERIAL_FACE, AERIAL_FACES, type AerialSupport } from '../aerial/terracePlan';
import { TestGround } from '../aerial/testProbe';
import { planFacadeLandmark } from './facadePlan';

const HOST: AerialSupport = { id: 7, x: 20, y: 20, sizeX: 8, sizeY: 8, baseZ: 4, height: 32 };

/** Torre piena: la quota e' quella adattiva della facciata, non un tetto. */
function city(host: AerialSupport = HOST): TestGround {
  return new TestGround(4).box(
    host.x,
    host.y,
    host.sizeX,
    host.sizeY,
    host.baseZ,
    host.baseZ + host.height,
    host.id,
  );
}

describe('planFacadeLandmark — uno scalo appeso alla torre', () => {
  it('sporge dalla facciata alla quota scelta come una terrazza', () => {
    const result = planFacadeLandmark({
      host: HOST,
      faces: [AERIAL_FACE.east],
      sizeX: 8,
      sizeY: 8,
      ...city(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.face).toBe(AERIAL_FACE.east);
    expect(result.plan.deck.rect).toEqual({ x: 28, y: 20, sizeX: 8, sizeY: 8 });
    expect(result.plan.deck.deckZ).toBe(
      HOST.baseZ + Math.round(HOST.height * AERIAL.terrace.facadeRise),
    );
    expect(result.plan.deck.deckZ).toBeLessThan(HOST.baseZ + HOST.height);
    expect(result.plan.deck.piers.length).toBeGreaterThan(0);
  });

  it('si orienta su tutte le facce e resta sempre fuori dall ospite', () => {
    for (const face of AERIAL_FACES) {
      const result = planFacadeLandmark({ host: HOST, faces: [face], sizeX: 8, sizeY: 8, ...city() });
      expect(result.ok, `faccia ${face}`).toBe(true);
      if (!result.ok) continue;

      const rect = result.plan.deck.rect;
      if (face === AERIAL_FACE.east) expect(rect.x).toBe(HOST.x + HOST.sizeX);
      if (face === AERIAL_FACE.west) expect(rect.x + rect.sizeX).toBe(HOST.x);
      if (face === AERIAL_FACE.north) expect(rect.y).toBe(HOST.y + HOST.sizeY);
      if (face === AERIAL_FACE.south) expect(rect.y + rect.sizeY).toBe(HOST.y);
    }
  });

  it('rifiuta una facciata piu stretta della piattaforma', () => {
    const host = { ...HOST, sizeY: 6 };
    expect(planFacadeLandmark({
      host,
      faces: [AERIAL_FACE.east],
      sizeX: 8,
      sizeY: 8,
      ...city(host),
    })).toEqual({ ok: false, refusal: 'noRun' });
  });
});
