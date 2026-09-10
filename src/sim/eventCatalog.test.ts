import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { isCatalystId } from './catalysts';
import { charterById, isCharterId } from './charters';
import type { DecisionStateView } from './decisions';
import { EVENTS } from './eventCatalog';
import { EMPTY_HARVEST } from './farms';
import { isPolicyId } from './policies';
import { createSimState, setPolicyActive } from './SimState';

/**
 * Le proprieta' che il **catalogo** deve avere, non la citta'.
 *
 * Sono controlli su una tabella di dati, e ce ne vogliono proprio perche' e' una
 * tabella: prima gli eventi erano tre funzioni scritte a mano e un id sbagliato
 * si vedeva rileggendole. Con tredici voci e quattro campi che rimandano ad
 * altri cataloghi — mandati, opere, policy, seguiti — un refuso non lo trova
 * piu' nessuno finche' non capita in partita, e capita al giocatore.
 */

/** Una citta' ricca di tutto: serve solo a far girare ogni `draft`. */
function sampleState(): DecisionStateView {
  const base = setPolicyActive(createSimState(), 'civicPride', true);
  return {
    ...base,
    population: { stock: 480 },
    buildingCounts: [12, 6, 6, 3],
    capacityCounts: [12, 6, 6, 3],
    harvest: { ...EMPTY_HARVEST, eaten: 480 * BALANCE.food.perResident },
  };
}

describe('catalogo degli eventi', () => {
  it('non ripete un id', () => {
    const ids = EVENTS.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ogni voce pesa qualcosa e offre almeno due strade', () => {
    const state = sampleState();
    for (const event of EVENTS) {
      expect(event.weight).toBeGreaterThan(0);
      expect(event.draft(state).options.length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * La regola che tiene in piedi la scadenza: una crisi scade, e allo scadere
   * dev'esserci **esattamente una** alternativa da applicare. Zero vorrebbe dire
   * che il tempo torna gratis; due, che quale delle due scatti dipende
   * dall'ordine in cui sono scritte.
   */
  it('ogni crisi dichiara una sola alternativa di scadenza, e nessun altro la porta', () => {
    // Due stati e non uno: alcune voci compongono le proprie alternative sullo
    // stato — la crisi di bilancio offre il taglio solo se c'e' qualcosa da
    // tagliare — e con una fixture sola una delle due forme non verrebbe mai
    // guardata. E' la forma senza policy che aveva zero alternative di scadenza,
    // cioe' una crisi che scadeva senza applicare niente.
    for (const state of [sampleState(), { ...sampleState(), policies: [] }]) {
      for (const event of EVENTS) {
        const lapses = event.draft(state).options.filter((option) => option.onLapse === true);
        if (event.urgency === 'crisis') expect(lapses).toHaveLength(1);
        else expect(lapses).toHaveLength(0);
      }
    }
  });

  it('ogni alternativa rimanda a mandati, opere e policy che esistono', () => {
    const state = sampleState();
    for (const event of EVENTS) {
      for (const option of event.draft(state).options) {
        if (option.charter !== undefined && option.charter !== null) {
          expect(isCharterId(option.charter)).toBe(true);
          // Il mandato dev'essere della **famiglia dell'evento**: lo slot che la
          // decisione occupa e' quello, e un mandato di un'altra famiglia
          // finirebbe in uno slot che questa scelta non stava contendendo.
          expect(charterById(option.charter).family).toBe(event.family);
        }
        if (option.grant !== undefined) expect(isCatalystId(option.grant.kind)).toBe(true);
        if (option.policy !== undefined) expect(isPolicyId(option.policy.id)).toBe(true);
      }
    }
  });

  it('ogni seguito prenotato esiste, ed e una voce di sola catena', () => {
    const state = sampleState();
    const byId = new Map(EVENTS.map((event) => [event.id, event]));
    for (const event of EVENTS) {
      for (const option of event.draft(state).options) {
        if (option.followUp === undefined) continue;
        const target = byId.get(option.followUp.eventId);
        expect(target).toBeDefined();
        expect(target?.chainedOnly).toBe(true);
      }
    }
  });

  /**
   * L'altra meta': una voce di sola catena che nessuno prenota e' codice morto
   * che si legge come contenuto. Il test la trova prima che lo faccia nessuno.
   */
  it('ogni voce di sola catena e raggiungibile da almeno una scelta', () => {
    const state = sampleState();
    const booked = new Set<string>();
    for (const event of EVENTS) {
      for (const option of event.draft(state).options) {
        if (option.followUp !== undefined) booked.add(option.followUp.eventId);
      }
    }
    for (const event of EVENTS) {
      if (event.chainedOnly !== true) continue;
      expect(booked).toContain(event.id);
    }
  });

  /**
   * Il catalogo copre tutte e quattro le famiglie, e la quarta non e' un
   * ornamento: e' quella in cui vivono gli eventi che toccano le policy.
   */
  it('copre le quattro famiglie, governo compreso', () => {
    const families = new Set(EVENTS.map((event) => event.family));
    expect([...families].sort()).toEqual(['governance', 'investment', 'publicSpace', 'supply']);
  });

  it('almeno una voce per famiglia si qualifica senza dipendere da una catena', () => {
    for (const family of ['supply', 'publicSpace', 'investment', 'governance'] as const) {
      const open = EVENTS.filter((event) => event.family === family && event.chainedOnly !== true);
      expect(open.length).toBeGreaterThan(0);
    }
  });

  /**
   * Cio' che rende «policy» ed «eventi» un sistema solo invece di due pannelli:
   * senza almeno una manciata di voci che varano o revocano, la cerniera esiste
   * nei tipi e non nel gioco.
   */
  it('piu di una voce agisce sul pannello delle policy', () => {
    const state = sampleState();
    const touching = EVENTS.filter((event) =>
      event.draft(state).options.some((option) => option.policy !== undefined));
    expect(touching.length).toBeGreaterThanOrEqual(3);
  });
});
