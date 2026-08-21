import { describe, expect, it } from 'vitest';
import { GRADING } from '../grading/config';
import { WORKS, type GradePlan } from '../grading/grade';
import { CLUSTER } from './config';
import { joinsCluster, planCluster, type ClusterTerms } from './cluster';

/**
 * La regola di aggregazione, verificata senza mondo.
 *
 * E' il motivo per cui `cluster.ts` non conosce il registry: qui bastano tre
 * numeri scritti a mano per dire se una fila accoglie un lotto, mentre farlo
 * crescere su un'isola vera direbbe di piu' su come e' fatta l'isola che su come
 * e' fatta la regola.
 */

/** Un piano di opera con le sole quote che contano alla fila. */
function plan(padZ: number, footZ = padZ, works: GradePlan['works'] = WORKS.none): GradePlan {
  return { works, padZ, footZ, fill: 0 };
}

function terms(deck: number, base = CLUSTER.baseHeight, id = 7): ClusterTerms {
  return { id, deck, base };
}

describe('cluster — chi entra in fila', () => {
  it('un vicino alla stessa quota accoglie', () => {
    expect(joinsCluster(terms(30), plan(30))).toBe(true);
  });

  it('si riempie e non si scava: un lotto piu alto del deck non entra', () => {
    // Il deck della fila sta sotto il piano che questo lotto pretende: entrare
    // vorrebbe dire abbassarlo, cioe' togliere isola.
    expect(joinsCluster(terms(30), plan(32))).toBe(false);
  });

  it('un lotto piu basso si fa alzare, finche il riempimento resta nel tetto', () => {
    expect(joinsCluster(terms(30), plan(30 - CLUSTER.maxJoinFill))).toBe(true);
    expect(joinsCluster(terms(30), plan(30 - CLUSTER.maxJoinFill - 1))).toBe(false);
  });

  it('il tetto strutturale delle opere resta quello che e', () => {
    // Il piano naturale e' compatibile, ma il muro sotto il membro partirebbe
    // da una quota che nessuna opera regge: `maxWorksStep` si misura dal
    // `footZ`, esattamente come lo misura `planGrade`.
    const deep = plan(30, 30 - GRADING.maxWorksStep - 1);
    expect(joinsCluster(terms(30), deep)).toBe(false);
    expect(joinsCluster(terms(30), plan(30, 30 - GRADING.maxWorksStep))).toBe(true);
  });
});

describe('cluster — i termini della fila', () => {
  it('entrare adotta i termini invariati, id compreso', () => {
    const existing = terms(30, CLUSTER.baseHeight, 42);
    const joined = planCluster({
      own: plan(28),
      density: 0,
      neighbours: [existing],
      nextId: 99,
    });

    // Anche con densita' zero: la continuita' della fila vale piu' della
    // variazione locale, ed e' il punto dell'aggregazione.
    expect(joined).toEqual(existing);
  });

  it('senza vicini si apre una fila nuova alla propria quota', () => {
    const fresh = planCluster({
      own: plan(24),
      density: 1,
      neighbours: [],
      nextId: 99,
    });

    expect(fresh).toEqual({ id: 99, deck: 24, base: CLUSTER.baseHeight });
  });

  it('un vicino che non accoglie apre il gradino invece di fermare la crescita', () => {
    const tooLow = terms(30, CLUSTER.baseHeight, 42);
    const stepped = planCluster({
      own: plan(30 - CLUSTER.maxJoinFill - 1),
      density: 1,
      neighbours: [tooLow],
      nextId: 99,
    });

    expect(stepped.id).toBe(99);
    expect(stepped.deck).toBe(30 - CLUSTER.maxJoinFill - 1);
  });

  it('sotto la soglia di densita la fila condivide la quota ma non il basamento', () => {
    const sparse = planCluster({
      own: plan(24),
      density: CLUSTER.minDensity - 0.01,
      neighbours: [],
      nextId: 1,
    });
    const dense = planCluster({
      own: plan(24),
      density: CLUSTER.minDensity,
      neighbours: [],
      nextId: 1,
    });

    expect(sparse.base).toBe(0);
    expect(dense.base).toBe(CLUSTER.baseHeight);
    expect(sparse.deck).toBe(dense.deck);
  });

  it('con due vicini ammissibili vince il primo, non il migliore', () => {
    // L'ordine lo garantisce chi chiama, e la regola non lo rimescola: e' cio'
    // che tiene la fila indipendente dall'ordine di enumerazione del registry.
    const first = terms(30, CLUSTER.baseHeight, 1);
    const second = terms(29, CLUSTER.baseHeight, 2);
    const joined = planCluster({
      own: plan(28),
      density: 1,
      neighbours: [first, second],
      nextId: 99,
    });

    expect(joined.id).toBe(1);
  });

  it('a parita di ingresso la risposta e identica', () => {
    const request = {
      own: plan(26, 22),
      density: 0.5,
      neighbours: [terms(30)],
      nextId: 3,
    };
    expect(planCluster(request)).toEqual(planCluster(request));
  });
});
