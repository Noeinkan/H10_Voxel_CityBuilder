import { describe, expect, it } from 'vitest';
import { CATALYSTS } from '../sim/catalysts';
import { landmarkOf, maxStageOf } from '../world/landmarks/config';
import {
  catalystMiniature,
  MINIATURE_LIMIT,
  miniatureAspect,
  miniaturePathChars,
} from './catalystMiniature';

describe('catalystMiniature', () => {
  it('ogni catalizzatore ha una miniatura, e dentro i limiti di lettura', () => {
    // E' il gate della tessera: un ruolo nuovo con una ricetta trova la sua
    // miniatura da solo, e questo test dice se si legge ancora a 22px.
    for (const { id } of CATALYSTS) {
      const entry = catalystMiniature(id);
      expect(entry, id).not.toBeNull();
      if (entry === null) continue;
      expect(entry.miniature.groups.length, id).toBeGreaterThan(0);
      expect(miniaturePathChars(entry.miniature), id).toBeLessThanOrEqual(MINIATURE_LIMIT.pathChars);
      expect(miniatureAspect(entry.miniature), id).toBeLessThanOrEqual(MINIATURE_LIMIT.aspect);
    }
  });

  it('i tracciati usano solo slot di palette veri', () => {
    for (const { id } of CATALYSTS) {
      for (const group of catalystMiniature(id)?.miniature.groups ?? []) {
        expect(group.slot, id).toBeGreaterThan(0);
        expect(group.slot, id).toBeLessThan(32);
      }
    }
  });

  it('una struttura a sedime crescente non si mostra al suo stadio pieno', () => {
    // Monumento, cattedrale e stadio finiti sono decine di KB di dettaglio che a
    // 22px non si vede: la tessera deve fermarsi prima, e l'ago del monumento
    // finito non deve arrivarci.
    for (const id of ['monument', 'cathedral', 'stadium', 'transport'] as const) {
      const recipe = landmarkOf(id);
      const entry = catalystMiniature(id);
      expect(recipe, id).not.toBeNull();
      if (recipe === null || entry === null) continue;
      expect(entry.stage, id).toBeLessThan(maxStageOf(recipe));
    }
  });

  it('e memorizzata: la stessa istanza a ogni richiesta', () => {
    expect(catalystMiniature('market')).toBe(catalystMiniature('market'));
  });
});
