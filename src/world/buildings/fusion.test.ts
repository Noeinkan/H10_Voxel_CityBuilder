import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { CLEARANCE_KIND } from './clearance';
import { FUSION } from './config/fusion';
import { FUSION_REFUSALS, planFusion, type FusionMember } from './fusion';

function member(over: Partial<FusionMember> & { id: number }): FusionMember {
  return {
    x: 0,
    y: 0,
    baseZ: 12,
    level: FUSION.minLevel,
    class: BUILDING_CLASS.residential,
    kind: CLEARANCE_KIND.building,
    carries: false,
    growing: false,
    ...over,
  };
}

const HOST = { ...member({ id: 1 }), footprint: 8 };

describe('planFusion', () => {
  it('assorbe il vicino e ne eredita l’uso', () => {
    const neighbour = member({ id: 2, x: 8, class: BUILDING_CLASS.commercial });
    const result = planFusion({ host: HOST, side: 12, inside: [neighbour] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.absorb).toEqual([2]);
    // Il primo uso e' quello del candidato: `uses` e' posizionale, come per
    // un'arcologia, e la simulazione lo riceve una voce per volta.
    expect(result.plan.uses).toEqual([BUILDING_CLASS.residential, BUILDING_CLASS.commercial]);
    expect(result.plan.cells).toEqual([{ x: 8, y: 0, class: BUILDING_CLASS.commercial }]);
  });

  it('rifiuta chi non e’ arrivato al primo gradino d’impronta', () => {
    const host = { ...HOST, level: FUSION.minLevel - 1 };
    expect(planFusion({ host, side: 12, inside: [member({ id: 2, x: 8 })] }))
      .toEqual({ ok: false, refusal: FUSION_REFUSALS.tooLow });
  });

  it('rifiuta quando l’isolato non concede niente in piu’', () => {
    expect(planFusion({ host: HOST, side: 8, inside: [member({ id: 2, x: 8 })] }))
      .toEqual({ ok: false, refusal: FUSION_REFUSALS.noRoom });
  });

  it('lascia il prato alla promozione', () => {
    // Allargarsi nel vuoto e' gia' mestiere di `upgradeDriver`: qui non c'e'
    // niente da fondere, e rispondere di si' vorrebbe dire aprire un cantiere
    // per zero condannati.
    expect(planFusion({ host: HOST, side: 12, inside: [] }))
      .toEqual({ ok: false, refusal: FUSION_REFUSALS.nothingToAbsorb });
  });

  it('non tocca cio’ che lo sventramento non tocca', () => {
    for (const kind of [CLEARANCE_KIND.structure, CLEARANCE_KIND.landmark] as const) {
      expect(planFusion({ host: HOST, side: 12, inside: [member({ id: 2, x: 8, kind })] }))
        .toEqual({ ok: false, refusal: FUSION_REFUSALS.blocked });
    }
  });

  it('non si prende chi e’ cresciuto piu’ di lui', () => {
    const taller = member({ id: 2, x: 8, level: HOST.level + 1 });
    expect(planFusion({ host: HOST, side: 12, inside: [taller] }))
      .toEqual({ ok: false, refusal: FUSION_REFUSALS.blocked });
  });

  it('non si prende chi regge qualcosa in quota', () => {
    const carrier = member({ id: 2, x: 8, carries: true });
    expect(planFusion({ host: HOST, side: 12, inside: [carrier] }))
      .toEqual({ ok: false, refusal: FUSION_REFUSALS.blocked });
  });

  it('aspetta chi sta ancora comparendo', () => {
    const busy = member({ id: 2, x: 8, growing: true });
    expect(planFusion({ host: HOST, side: 12, inside: [busy] }))
      .toEqual({ ok: false, refusal: FUSION_REFUSALS.busy });
  });

  it('non scavalca un gradino della fila', () => {
    // Un assemblaggio poggia su un podio solo: due lotti a due quote diverse
    // darebbero un podio che ne copre uno e ne sotterra l'altro.
    const stepped = member({ id: 2, x: 8, baseZ: HOST.baseZ + 2 });
    expect(planFusion({ host: HOST, side: 12, inside: [stepped] }))
      .toEqual({ ok: false, refusal: FUSION_REFUSALS.stepped });
  });

  it('non porta via mezzo isolato in una volta', () => {
    const many = Array.from({ length: FUSION.maxAbsorbed + 1 }, (_, i) =>
      member({ id: i + 2, x: 8 + i * 4 }));
    expect(planFusion({ host: HOST, side: 16, inside: many }))
      .toEqual({ ok: false, refusal: FUSION_REFUSALS.tooMany });
  });
});
