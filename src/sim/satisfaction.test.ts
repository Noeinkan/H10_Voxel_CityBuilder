import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { EMPTY_SATISFACTION, satisfactionReportOf } from './satisfaction';

describe('satisfactionReportOf', () => {
  /** Ingressi di una citta' vuota: nessuna leva attiva, nessuno da ospitare. */
  const bare = {
    population: 0,
    capacity: 0,
    civic: 0,
    funded: 1,
    service: 1,
    ferryLines: 0,
    islandConnections: 0,
  };

  it('la somma con segno dei termini e il bersaglio', () => {
    const report = satisfactionReportOf({
      ...bare,
      population: 48,
      capacity: 60,
      civic: 4,
      funded: 0.75,
      service: 0.5,
      ferryLines: 2,
      islandConnections: 3,
    });

    expect(report.base).toBe(BALANCE.satisfaction.base);
    expect(report.civic).toBeCloseTo(0.75 * 4 * BALANCE.satisfaction.perCivic);
    expect(report.retail).toBeCloseTo(0.5 * BALANCE.commerce.satisfactionPerService);
    expect(report.ferry).toBeCloseTo(2 * BALANCE.satisfaction.perFerryLine);
    expect(report.bridges).toBeCloseTo(3 * BALANCE.satisfaction.perIslandBridge);
    expect(report.target).toBeCloseTo(
      BALANCE.satisfaction.base + report.civic + report.retail + report.ferry
        + report.bridges - report.crowding,
    );
  });

  it('l occupazione e clampata al tetto, e zero senza capacita ne popolazione', () => {
    const crowded = satisfactionReportOf({ ...bare, population: 300, capacity: 60 });
    expect(crowded.occupancy).toBe(BALANCE.satisfaction.maxOccupancy);
    expect(crowded.crowding).toBeGreaterThan(0);

    expect(satisfactionReportOf(bare).occupancy).toBe(0);
    expect(satisfactionReportOf({ ...bare, population: 0, capacity: 30 }).occupancy).toBe(0);
  });

  it('l affollamento pesa solo oltre l occupazione piena', () => {
    const full = satisfactionReportOf({ ...bare, population: 60, capacity: 60 });
    expect(full.occupancy).toBe(1);
    expect(full.crowding).toBe(0);
  });

  it('i servizi civici valgono solo se finanziati', () => {
    const funded = satisfactionReportOf({ ...bare, civic: 4, funded: 1 });
    const broke = satisfactionReportOf({ ...bare, civic: 4, funded: 0 });

    expect(funded.civic).toBeCloseTo(4 * BALANCE.satisfaction.perCivic);
    expect(broke.civic).toBe(0);
  });

  it('i ponti oltre il tetto non ringraziano piu', () => {
    const report = satisfactionReportOf({
      ...bare,
      islandConnections: BALANCE.satisfaction.maxIslandBridges + 5,
    });

    expect(report.bridges).toBeCloseTo(
      BALANCE.satisfaction.maxIslandBridges * BALANCE.satisfaction.perIslandBridge,
    );
  });

  it('il referto vuoto porta il solo umore di base', () => {
    expect(EMPTY_SATISFACTION.base).toBe(BALANCE.satisfaction.base);
    expect(EMPTY_SATISFACTION.target).toBe(BALANCE.satisfaction.base);
    expect(
      EMPTY_SATISFACTION.civic + EMPTY_SATISFACTION.retail + EMPTY_SATISFACTION.ferry
        + EMPTY_SATISFACTION.bridges + EMPTY_SATISFACTION.crowding,
    ).toBe(0);
  });
});
