import { describe, expect, it } from 'vitest';
import { catalystById } from './catalysts';
import { BUILDING_CLASS } from './classes';
import { gapRatio, specializationGapsOf, urbanProfileAt } from './districts';
import { addBuilding, addCatalyst, createSimState } from './SimState';
import { nearestTowerProspect } from './towerProspect';

/**
 * La torre e' l'unica leva del cibo tardivo che il giocatore non piazza, e finche'
 * questa lettura non e' esistita l'interfaccia poteva solo ripetere il gesto
 * generico. Qui si verifica cio' che rende la riga utile: che il candidato sia un
 * posto vero, e che il silenzio significhi sempre «nessun consiglio da dare».
 */
describe('towerProspect — dove sta per nascere la prossima torre', () => {
  const greenhouse = (x: number, y: number, radius = 40) => ({
    x, y, kind: 'greenhouse' as const, class: catalystById('greenhouse').class,
    strength: 200, radius,
  });
  const factory = (x: number, y: number, radius = 40) => ({
    x, y, kind: 'factory' as const, class: catalystById('factory').class,
    strength: 200, radius,
  });

  it('tace finche nessun ruolo apre la strada alla torre', () => {
    let state = createSimState();
    state = addBuilding(state, { x: 20, y: 20, class: BUILDING_CLASS.industrial, level: 0 });
    expect(nearestTowerProspect(state)).toBeNull();

    // Un parco non apre `farming`: il filtro guarda i ruoli, non il fatto che un
    // catalizzatore ci sia.
    state = addCatalyst(state, {
      x: 20, y: 20, kind: 'park', class: catalystById('park').class,
      strength: 200, radius: 40,
    });
    expect(nearestTowerProspect(state)).toBeNull();
  });

  it('tace quando l anello non tocca nessuna industria', () => {
    let state = addCatalyst(createSimState(), greenhouse(20, 20, 8));
    // Fuori dal cerchio: e' il caso in cui il consiglio giusto resta «sovrapponi
    // l'anello alla fabbrica», e una soglia da misurare non c'e'.
    state = addBuilding(state, { x: 200, y: 200, class: BUILDING_CLASS.industrial, level: 0 });
    expect(nearestTowerProspect(state)).toBeNull();
  });

  it('riporta l edificio industriale in raggio e la soglia che gli manca', () => {
    let state = addCatalyst(createSimState(), greenhouse(20, 20));
    state = addBuilding(state, { x: 22, y: 20, class: BUILDING_CLASS.industrial, level: 0 });

    const prospect = nearestTowerProspect(state);
    expect(prospect).not.toBeNull();
    expect({ x: prospect?.x, y: prospect?.y }).toEqual({ x: 22, y: 20 });
    expect(prospect?.gap.id).toBe('farming');
    expect(prospect?.ratio).toBeGreaterThanOrEqual(0);
    expect(prospect?.ratio).toBeLessThan(1);
  });

  it('non propone una torre come candidata a diventare torre', () => {
    let state = addCatalyst(createSimState(), greenhouse(20, 20));
    state = addBuilding(state, {
      x: 22, y: 20, class: BUILDING_CLASS.industrial, level: 0, specialization: 'farming',
    });
    expect(nearestTowerProspect(state)).toBeNull();

    // Gli altri usi non sono candidati: la torre e' industria convertita.
    state = addBuilding(state, { x: 24, y: 20, class: BUILDING_CLASS.residential, level: 0 });
    state = addBuilding(state, { x: 26, y: 20, class: BUILDING_CLASS.commercial, level: 0 });
    expect(nearestTowerProspect(state)).toBeNull();
  });

  it('sceglie il piu vicino ad arrivarci, non il primo costruito', () => {
    // Quattro candidati sotto influenze diverse. Il vincitore si verifica contro
    // la stessa formula che lo ordina — `gapRatio` sul profilo di ogni punto —
    // e non contro una coordinata scritta a mano: quale sia il piu' avanti
    // dipende dai pesi dei catalizzatori, e un numero atteso qui si romperebbe
    // alla prima ritaratura senza che niente fosse davvero rotto.
    let state = addCatalyst(createSimState(), greenhouse(20, 20, 60));
    state = addCatalyst(state, factory(60, 20, 30));
    const spots = [{ x: 24, y: 20 }, { x: 40, y: 20 }, { x: 60, y: 20 }, { x: 20, y: 44 }];
    for (const spot of spots) {
      state = addBuilding(state, { ...spot, class: BUILDING_CLASS.industrial, level: 0 });
    }

    const ratios = spots.map((spot) => {
      const gap = specializationGapsOf(urbanProfileAt(state, spot.x, spot.y))
        .find((entry) => entry.id === 'farming');
      return { spot, ratio: gap === undefined ? -1 : gapRatio(gap) };
    });
    const leader = ratios.reduce((best, entry) => entry.ratio > best.ratio ? entry : best);

    const prospect = nearestTowerProspect(state);
    expect({ x: prospect?.x, y: prospect?.y }).toEqual(leader.spot);
    expect(prospect?.ratio).toBeCloseTo(leader.ratio);
    // E il candidato scelto batte davvero gli altri, cioe' l'ordine non e'
    // degenere: se tutti valessero uguale il test sopra passerebbe per caso.
    expect(ratios.filter((entry) => entry.ratio < leader.ratio).length).toBeGreaterThan(0);
  });

  it('e deterministico: lo stesso stato da lo stesso candidato', () => {
    let state = addCatalyst(createSimState(), greenhouse(20, 20, 60));
    for (const x of [22, 26, 30, 34]) {
      state = addBuilding(state, { x, y: 20, class: BUILDING_CLASS.industrial, level: 0 });
    }
    expect(nearestTowerProspect(state)).toEqual(nearestTowerProspect(state));
  });
});
