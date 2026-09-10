import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  BUILDING_CLASS,
  CATALYSTS,
  catalystById,
  createSimState,
  type CatalystId,
  type SimState,
} from '../sim';
import {
  advanceMilestone,
  milestoneGrant,
  MILESTONES,
  milestoneOfRole,
  milestoneReached,
  roleThresholds,
  roleUnlocked,
} from './milestones';

describe('milestones', () => {
  it('copre tutti i ruoli tranne i tre del tutorial, una volta sola', () => {
    // **E' il contratto che tiene in piedi tutto il resto.** Un ruolo nuovo che
    // nessun gradino apre sarebbe aperto da subito e in silenzio, cioe'
    // esattamente il difetto che questa scala chiude: nessuno se ne
    // accorgerebbe finche' un giocatore non se lo ritrova nella mensola al
    // minuto tre.
    const starters: readonly CatalystId[] = ['market', 'factory', 'park'];
    const opened = MILESTONES.flatMap((milestone) => milestone.opens);

    expect(new Set(opened).size).toBe(opened.length);
    for (const catalyst of CATALYSTS) {
      const expected = starters.includes(catalyst.id) ? null : catalyst.id;
      expect(milestoneOfRole(catalyst.id) === null ? null : catalyst.id).toBe(expected);
    }
  });

  it('sale un gradino alla volta e non ne salta nessuno', () => {
    // La popolazione da sola non basta: il gradino «district» chiede anche gli
    // edifici, e una citta' affollata su un'isola vuota deve fermarsi li'.
    expect(milestoneReached(city({ catalysts: [] }))).toBe(-1);
    expect(milestoneReached(city({}))).toBe(0);
    // Mille abitanti su un'isola con dodici edifici si fermano al terzo
    // gradino: il costruito e' la meta' della soglia, ed e' quella che pesa.
    expect(milestoneReached(city({ population: 1_000, buildings: 12 }))).toBe(2);
    expect(milestoneReached(city({ population: 1_000, buildings: 40 }))).toBe(3);
    expect(milestoneReached(grown())).toBe(MILESTONES.length - 1);
  });

  it('un ruolo si apre al proprio gradino, non prima', () => {
    const early = city({ population: 1_000, buildings: 12 });
    const reached = milestoneReached(early);

    expect(roleUnlocked(early, 'port', reached)).toBe(true);
    expect(roleUnlocked(early, 'monument', reached)).toBe(false);
    expect(roleUnlocked(early, 'stadium', reached)).toBe(false);
  });

  it('il gradino raggiunto non si richiude quando la citta cala', () => {
    // Sarebbe l'unico posto del gioco in cui un progresso si annulla, e il
    // giocatore lo leggerebbe come un difetto invece che come una regola.
    const peak = advanceMilestone(-1, grown());
    const famine = city({ population: 10 });

    expect(milestoneReached(famine)).toBeLessThan(peak);
    expect(advanceMilestone(peak, famine)).toBe(peak);
    expect(roleUnlocked(famine, 'monument', peak)).toBe(true);
  });

  it('il premio si paga una volta sola, e solo per i gradini nuovi', () => {
    // Con un cancello non monotono una popolazione che oscilla intorno a una
    // soglia sarebbe stata una stampante di soldi.
    const all = milestoneGrant(-1, MILESTONES.length - 1);
    expect(all).toBeGreaterThan(0);
    expect(milestoneGrant(MILESTONES.length - 1, MILESTONES.length - 1)).toBe(0);
    expect(milestoneGrant(0, 1) + milestoneGrant(1, MILESTONES.length - 1)).toBe(all);
    // Il primo gradino non porta premio: arriva con il tutorial, e pagarlo
    // sarebbe pagare il giocatore per aver seguito le istruzioni.
    expect(MILESTONES[0].grant).toBe(0);
  });

  it('la condizione propria di un landmark resta anche a gradino raggiunto', () => {
    // E' la meta' che lega il monumento alla partita giocata: lo stadio vuole i
    // negozi che riempiranno le gradinate, e la scala da sola non glieli da'.
    const top = MILESTONES.length - 1;
    const noShops = { ...grown(), buildingCounts: [8, 0, 8, 8] };

    expect(roleUnlocked(grown(), 'stadium', top)).toBe(true);
    expect(roleUnlocked(noShops, 'stadium', top)).toBe(false);
    expect(roleThresholds(noShops, 'stadium', top)[0]?.label).toBe('shops');
  });

  it('il museo chiede l universita, non un numero', () => {
    // L'unica condizione che nomina un altro ruolo, ed e' cio' che la rende una
    // scelta di percorso invece di una soglia da aspettare.
    const top = MILESTONES.length - 1;
    const withoutCampus = { ...grown(), catalysts: grown().catalysts.filter((c) => c.kind !== 'university') };

    expect(roleUnlocked(grown(), 'museum', top)).toBe(true);
    expect(roleUnlocked(withoutCampus, 'museum', top)).toBe(false);
  });

  it('un ruolo aperto non ha niente da mostrare', () => {
    // Vuoto e' il contratto con l'HUD: `roleThresholds` vuoto vuol dire bottone
    // acceso, e una soglia gia' coperta che restasse nell'elenco lo terrebbe
    // spento per sempre.
    expect(roleThresholds(grown(), 'stadium', MILESTONES.length - 1)).toEqual([]);
    expect(roleThresholds(city({}), 'market', -1)).toEqual([]);
  });
});

/** Una citta' su misura: solo cio' che le soglie guardano davvero. */
function city(options: {
  readonly population?: number;
  readonly buildings?: number;
  readonly perClass?: number;
  readonly satisfaction?: number;
  readonly catalysts?: readonly CatalystId[];
}): SimState {
  const kinds = options.catalysts ?? ['market', 'factory', 'park'];
  const base = createSimState({
    catalysts: kinds.map((kind, index) => ({
      x: index * 32,
      y: 0,
      kind,
      class: catalystById(kind).class,
      strength: 1,
      radius: 1,
    })),
  });
  const perClass = options.perClass ?? 0;
  return {
    ...base,
    population: { stock: options.population ?? 0, delta: 0 },
    satisfaction: options.satisfaction ?? BALANCE.start.satisfaction,
    buildings: Array.from({ length: options.buildings ?? 0 }, (_, index) => ({
      x: index,
      y: 0,
      class: (index % 4) as (typeof BUILDING_CLASS)['residential'],
      level: 8,
    })),
    buildingCounts: [perClass, perClass, perClass, perClass],
  };
}

/** La citta' che ha coperto tutta la scala e tutte le condizioni proprie. */
function grown(): SimState {
  return city({
    population: BALANCE.gameplay.success.population,
    buildings: 40,
    perClass: 8,
    satisfaction: 0.8,
    catalysts: ['market', 'factory', 'park', 'university', 'lighthouse'],
  });
}
