import { describe, expect, it } from 'vitest';
import { CLEARANCE_KIND, planClearance, type ClearanceRecord } from './clearance';

/**
 * La regola dello sventramento, verificata dove non c'e' un mondo attorno.
 *
 * Quello che qui si controlla e' l'unica cosa che questo modulo garantisce: che
 * il rifiuto sia **del riquadro** e non del singolo record. Un ingombro
 * sgomberato a meta' non e' sgomberato, e un elenco di condannati restituito
 * insieme a un rifiuto sarebbe la porta da cui entra un buco al posto del
 * landmark.
 */

const RULE = { maxLevel: 4 };

function building(id: number, level: number): ClearanceRecord {
  return { id, level, kind: CLEARANCE_KIND.building };
}

describe('planClearance', () => {
  it('un riquadro vuoto non condanna nessuno e non rifiuta', () => {
    const plan = planClearance([], RULE);

    expect(plan.doomed).toEqual([]);
    expect(plan.refusal).toBeNull();
  });

  it('il tessuto basso cade tutto, in ordine di lettura', () => {
    const plan = planClearance([building(7, 0), building(3, 4), building(9, 2)], RULE);

    expect(plan.doomed).toEqual([7, 3, 9]);
    expect(plan.refusal).toBeNull();
  });

  it('una torre sopra soglia ferma il riquadro intero', () => {
    const plan = planClearance([building(1, 1), building(2, RULE.maxLevel + 1)], RULE);

    expect(plan.refusal).toBe('block-too-tall');
    // Il vicino basso non deve cadere: sgomberare attorno a una torre che resta
    // in piedi lascerebbe il landmark senza posto e il quartiere senza case.
    expect(plan.doomed).toEqual([]);
  });

  it('esattamente alla soglia si abbatte ancora', () => {
    const plan = planClearance([building(1, RULE.maxLevel)], RULE);

    expect(plan.doomed).toEqual([1]);
    expect(plan.refusal).toBeNull();
  });

  it('una struttura non si tocca, e il suo rifiuto vince su quello dell altezza', () => {
    const plan = planClearance(
      [building(1, RULE.maxLevel + 1), { id: 2, level: 0, kind: CLEARANCE_KIND.structure }],
      RULE,
    );

    // Definitivo prima di temporaneo: nessuna attesa risolve una mensola, mentre
    // una torre e' alta oggi. Chi legge il rifiuto deve sapere se ha senso
    // riprovare.
    expect(plan.refusal).toBe('structure-in-the-way');
  });

  it('una campata non e un ostacolo e non e un condannato', () => {
    const plan = planClearance(
      [{ id: 5, level: 0, kind: CLEARANCE_KIND.span }, building(6, 1)],
      RULE,
    );

    // Cade da sola quando il volume nuovo la attraversa: e' gia' la regola
    // «al suolo vince l'edificio», e ripeterla qui la direbbe due volte.
    expect(plan.doomed).toEqual([6]);
    expect(plan.refusal).toBeNull();
  });

  it('un landmark cade solo per chi lo dichiara: il giocatore si, l arcologia no', () => {
    const landmark = { id: 9, level: 2, kind: CLEARANCE_KIND.landmark };

    // Il piazzamento di un monumento demolisce il costruito, monumenti
    // compresi: la gomma e' il gesto.
    const player = planClearance([landmark], { maxLevel: 4, clearsLandmarks: true });
    expect(player.doomed).toEqual([9]);
    expect(player.refusal).toBeNull();

    // La megastruttura no: nessuno gliel'ha chiesto, e il rifiuto e' quello
    // definitivo delle strutture.
    const arcology = planClearance([landmark], { maxLevel: 20 });
    expect(arcology.doomed).toEqual([]);
    expect(arcology.refusal).toBe('structure-in-the-way');
  });

  it('senza soglia di altezza cade ogni edificio, qualunque livello abbia', () => {
    const plan = planClearance([building(1, 3), building(2, 12), building(3, 20)], {
      maxLevel: Number.POSITIVE_INFINITY,
    });

    expect(plan.doomed).toEqual([1, 2, 3]);
    expect(plan.refusal).toBeNull();
  });
});
