import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { coverageAt, coverageReportOf, EMPTY_COVERAGE, servicesOf } from './coverage';
import { addCatalyst, createSimState, type SimState } from './SimState';

/** Un ruolo a influenza civica piena, posato dove il campo non ha altro. */
function withSchool(): SimState {
  return addCatalyst(createSimState(), {
    x: 100,
    y: 100,
    class: BUILDING_CLASS.civic,
    kind: 'school',
    strength: BALANCE.gameplay.catalyst.roles.school.strength,
    radius: BALANCE.gameplay.catalyst.roles.school.radius,
  });
}

describe('coverageReportOf — la quota cittadina', () => {
  it('una citta’ senza abitanti e’ servita: non manca niente a nessuno', () => {
    const report = coverageReportOf({ population: 0, civic: 0, funded: 1, services: 0 });
    expect(report.ratio).toBe(1);
    expect(report.base).toBe(BALANCE.coverage.cityShare);
  });

  it('la domanda cresce con la popolazione: la stessa rete non basta al doppio', () => {
    const civic = 10;
    const small = coverageReportOf({ population: 500, civic, funded: 1, services: 0 });
    const big = coverageReportOf({ population: 1000, civic, funded: 1, services: 0 });
    expect(big.ratio).toBeCloseTo(small.ratio / 2, 10);
  });

  it('un municipio che il bilancio non copre non serve nessuno', () => {
    const paid = coverageReportOf({ population: 100, civic: 4, funded: 1, services: 0 });
    const half = coverageReportOf({ population: 100, civic: 4, funded: 0.5, services: 0 });
    expect(half.supply).toBe(paid.supply / 2);
  });

  it('non supera mai la propria quota, per quanti civici ci siano', () => {
    const flooded = coverageReportOf({ population: 10, civic: 500, funded: 1, services: 0 });
    expect(flooded.ratio).toBeGreaterThan(1);
    expect(flooded.base).toBe(BALANCE.coverage.cityShare);
  });

  it('un servizio posato pesa molto piu’ di un edificio civico cresciuto', () => {
    const placed = coverageReportOf({ population: 100, civic: 0, funded: 1, services: 1 });
    const grown = coverageReportOf({ population: 100, civic: 1, funded: 1, services: 0 });
    expect(placed.supply).toBeGreaterThan(grown.supply);
  });
});

describe('servicesOf — quanto servizio porta cio’ che e’ posato', () => {
  it('pesa i ruoli con la stessa influenza civica con cui il campo dipinge', () => {
    // Un parco vale uno, un mercato una frazione, una centrale zero: e' la
    // colonna `civic` della tabella, non una seconda lista da tenere allineata.
    expect(servicesOf([{ kind: 'park', class: BUILDING_CLASS.civic }])).toBe(1);
    expect(servicesOf([{ kind: 'power', class: BUILDING_CLASS.industrial }])).toBe(0);
    const market = servicesOf([{ kind: 'market', class: BUILDING_CLASS.residential }]);
    expect(market).toBeGreaterThan(0);
    expect(market).toBeLessThan(1);
  });

  it('un catalizzatore senza ruolo dichiarato ricade sul ruolo di quella classe', () => {
    expect(servicesOf([{ class: BUILDING_CLASS.civic }])).toBe(1);
  });

  it('si somma, perche’ due parchi servono piu’ di uno', () => {
    const one = servicesOf([{ kind: 'park', class: BUILDING_CLASS.civic }]);
    const two = servicesOf([
      { kind: 'park', class: BUILDING_CLASS.civic },
      { kind: 'school', class: BUILDING_CLASS.civic },
    ]);
    expect(two).toBe(one * 2);
  });
});

describe('coverageAt — le due meta’', () => {
  it('lontano da ogni catalizzatore resta la sola quota cittadina', () => {
    const state = withSchool();
    const report = coverageReportOf({ population: 100, civic: 1, funded: 1, services: 0 });
    expect(coverageAt(state.field, report, 400, 400)).toBe(report.base);
  });

  it('un catalizzatore chiude il divario che il pavimento lascia aperto', () => {
    const state = withSchool();
    const near = coverageAt(state.field, EMPTY_COVERAGE, 100, 100);
    const far = coverageAt(state.field, EMPTY_COVERAGE, 400, 400);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeCloseTo(1, 6);
  });

  it('non supera mai uno, nemmeno con pavimento pieno sotto il cuore del raggio', () => {
    const state = withSchool();
    const full = coverageReportOf({ population: 1, civic: 500, funded: 1, services: 0 });
    expect(coverageAt(state.field, full, 100, 100)).toBeLessThanOrEqual(1);
  });

  it('un servizio rende di piu’ dove la citta’ e’ scoperta', () => {
    const state = withSchool();
    const poor = coverageReportOf({ population: 1000, civic: 0, funded: 1, services: 0 });
    const rich = coverageReportOf({ population: 10, civic: 100, funded: 1, services: 0 });
    const gainPoor = coverageAt(state.field, poor, 100, 100) - poor.base;
    const gainRich = coverageAt(state.field, rich, 100, 100) - rich.base;
    expect(gainPoor).toBeGreaterThan(gainRich);
  });

  it('cala con la distanza, perche’ legge il piano civico del campo', () => {
    // **Le distanze sono frazioni del raggio, non colonne.** `localFull` tiene la
    // copertura piena entro `radius * (1 - localFull/strength)` — per una scuola
    // circa il 38% del raggio — e dentro quel pianoro il calo non si vede
    // affatto: due campioni a colonna fissa cadono dalla stessa parte del bordo
    // appena il listino dei ruoli si muove, e il test smette di misurare il
    // decadimento per misurare dove era il bordo il giorno che l'hanno scritto.
    const state = withSchool();
    const radius = BALANCE.gameplay.catalyst.roles.school.radius;
    const at = (share: number) =>
      coverageAt(state.field, EMPTY_COVERAGE, 100 + Math.round(radius * share), 100);
    expect(at(0.5)).toBeGreaterThan(at(0.7));
    expect(at(0.7)).toBeGreaterThan(at(0.9));
  });
});
