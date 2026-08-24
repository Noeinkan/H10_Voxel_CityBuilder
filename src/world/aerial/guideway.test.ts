import { describe, expect, it } from 'vitest';
import { AERIAL } from './config';
import { planLift, type LiftTarget } from './guideway';
import { TestGround } from './testProbe';

/**
 * Il montante, verificato sul fatto che chiude il gate: **porta a terra**.
 *
 * La citta' in quota sapeva farsi i piani e collegarli, e non aveva una via per
 * arrivarci. I test guardano proprio quello — che il montante tocchi davvero
 * qualcosa sotto e l'impalcato sopra — piu' i due rifiuti che il vincolo della
 * fase impone: nessuna struttura sospesa, e niente che sia piu' alto di quanto
 * una struttura verticale possa essere.
 */

/** Un impalcato in aria, largo `side`, con il piano a quota `deckZ`. */
function deck(deckZ: number, side = 6, at = 20): LiftTarget {
  return {
    id: 7,
    rect: { x: at, y: at, sizeX: side, sizeY: side },
    baseZ: deckZ - AERIAL.girderDepth,
  };
}

describe('planLift — la via fra i livelli', () => {
  it('scende dall impalcato fino al terreno, e li si ferma', () => {
    const ground = new TestGround(4);
    const target = deck(30);

    const result = planLift(ground, target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // **Poggia davvero.** Il piede sta sul terreno e la cima tocca l'impalcato:
    // fra i due non resta un voxel di aria, che sarebbe la struttura sospesa che
    // il vincolo della fase esclude.
    expect(result.plan.baseZ).toBe(4);
    expect(result.plan.baseZ + result.plan.height).toBe(target.baseZ);
    expect(result.plan.carrier).toBe(0);
    expect(result.plan.deckId).toBe(target.id);

    // E sta dentro il riquadro che serve: un montante fuori non sarebbe retto
    // da niente in cima.
    expect(result.plan.x).toBeGreaterThanOrEqual(target.rect.x);
    expect(result.plan.y).toBeGreaterThanOrEqual(target.rect.y);
    expect(result.plan.x + AERIAL.guide.side)
      .toBeLessThanOrEqual(target.rect.x + target.rect.sizeX);
  });

  it('preferisce un tetto al prato: e cosi che la citta si legge a livelli', () => {
    const target = deck(40);
    // Un edificio basso sotto un angolo dell'impalcato, e prato sotto gli altri.
    const ground = new TestGround(4)
      .box(target.rect.x, target.rect.y, AERIAL.guide.side, AERIAL.guide.side, 4, 18, 99);

    const result = planLift(ground, target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Il piede sta sul tetto, non accanto: un montante che scendesse fino al
    // prato avendo un tetto sotto sarebbe piu' alto del necessario e passerebbe
    // attraverso l'edificio.
    expect(result.plan.baseZ).toBe(18);
    expect(result.plan.carrier).toBe(99);
  });

  it('sta sul marciapiede, dove una gamba non starebbe', () => {
    // **E' la differenza fra un montante e una gamba, ed e' misurata.** Una
    // mensola nasce sul fronte strada, quindi sotto di se' ha o il proprio
    // ospite o l'asfalto: rifiutare la carreggiata come fa una gamba lasciava
    // senza via **tutti** gli impalcati di una citta' cresciuta.
    const target = deck(30);
    const ground = new TestGround(4)
      .pavement(target.rect.x, target.rect.y, target.rect.sizeX, target.rect.sizeY);

    expect(planLift(ground, target).ok).toBe(true);
  });

  it('rifiuta un impalcato piu stretto della propria sezione', () => {
    const ground = new TestGround(4);
    expect(planLift(ground, deck(30, AERIAL.guide.side - 1)))
      .toEqual({ ok: false, refusal: 'tooNarrow' });
  });

  it('rifiuta una salita piu alta di quanto una struttura verticale regga', () => {
    const ground = new TestGround(4);
    const target = deck(4 + AERIAL.maxPierHeight + AERIAL.girderDepth + 8);
    expect(planLift(ground, target)).toEqual({ ok: false, refusal: 'tooTall' });
  });

  it('rifiuta un impalcato che poggia gia su cio che ha sotto', () => {
    // Niente da salire: fra il piede e il piano non c'e' un voxel.
    const target = deck(4 + AERIAL.girderDepth);
    expect(planLift(new TestGround(4), target)).toEqual({ ok: false, refusal: 'tooLow' });
  });
});
