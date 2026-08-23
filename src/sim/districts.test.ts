import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from './classes';
import { CATALYSTS } from './catalysts';
import type { CharterId } from './charters';
import { urbanProfileAt, type UrbanSources } from './districts';
import type { Catalyst } from './DesirabilityField';
import type { PolicyId } from './policies';

function source(kind: Catalyst['kind'], x = 0, y = 0): Catalyst {
  const definition = CATALYSTS.find((entry) => entry.id === kind);
  if (definition === undefined) throw new Error('fixture catalizzatore non valida');
  return {
    x,
    y,
    kind,
    class: definition.class,
    strength: definition.strength,
    radius: definition.radius,
  };
}

function sources(
  catalysts: readonly Catalyst[],
  policies: readonly PolicyId[] = [],
  charters: readonly CharterId[] = [],
): UrbanSources {
  return { catalysts, policies, charters };
}

describe('distretti emergenti', () => {
  it('espone nove ruoli con effetti distinti', () => {
    expect(CATALYSTS).toHaveLength(9);
    expect(new Set(CATALYSTS.map((entry) => JSON.stringify(entry.effects))).size).toBe(9);
  });

  it('i due collegamenti non producono lo stesso quartiere', () => {
    // Se porto e aeroporto dessero lo stesso profilo, il vincolo di sito
    // sarebbe solo un ostacolo: due strade per arrivare allo stesso posto.
    const port = urbanProfileAt(sources([source('port'), source('factory')]), 0, 0);
    const airport = urbanProfileAt(sources([source('airport'), source('factory')]), 0, 0);
    expect(port.district).toBe('harbor');
    expect(airport.district).not.toBe('harbor');

    // Accanto a un mercato, perche' e' li' che la penalita' si misura: con la
    // fabbrica il residenziale e' gia' a zero per entrambi, e due zeri non
    // dicono quale dei due pesi di piu'.
    const withPort = urbanProfileAt(sources([source('port'), source('market')]), 0, 0);
    const withAirport = urbanProfileAt(sources([source('airport'), source('market')]), 0, 0);
    expect(withAirport.uses[BUILDING_CLASS.residential])
      .toBeLessThan(withPort.uses[BUILDING_CLASS.residential]);
    expect(withAirport.uses[BUILDING_CLASS.civic])
      .toBeGreaterThan(withPort.uses[BUILDING_CLASS.civic]);
  });

  it('fa emergere un distretto solo dalla sovrapposizione dei campi', () => {
    expect(urbanProfileAt(sources([source('market')]), 0, 0).district).toBe('outskirts');
    expect(urbanProfileAt(sources([source('market'), source('park')]), 0, 0).district).toBe('garden');
    expect(urbanProfileAt(sources([source('port'), source('factory')]), 0, 0).district).toBe('harbor');
  });

  it('rende osservabile nello spazio l effetto delle policy', () => {
    const catalysts = [source('market'), source('transport')];
    const base = urbanProfileAt(sources(catalysts), 0, 0);
    const dense = urbanProfileAt(sources(catalysts, ['denseHousing']), 0, 0);
    expect(dense.density).toBeGreaterThan(base.density);

    const civic: Catalyst = {
      ...source('university'),
      class: BUILDING_CLASS.civic,
    };
    const normal = urbanProfileAt(sources([civic]), 0, 0);
    const austere = urbanProfileAt(sources([civic], ['austerity']), 0, 0);
    expect(austere.satisfaction).toBeLessThan(normal.satisfaction);
  });
});

describe('mandati lasciati dalle decisioni', () => {
  const housing = [source('market'), source('transport')];

  it('piega il profilo locale come fa una policy', () => {
    const base = urbanProfileAt(sources(housing), 0, 0);
    const gardens = urbanProfileAt(sources(housing, [], ['communityGardens']), 0, 0);

    expect(gardens.density).toBeLessThan(base.density);
    expect(gardens.satisfaction).toBeGreaterThan(base.satisfaction);
  });

  it('due mandati opposti della stessa famiglia portano il quartiere in direzioni opposte', () => {
    const gardens = urbanProfileAt(sources(housing, [], ['communityGardens']), 0, 0);
    const rationed = urbanProfileAt(sources(housing, [], ['rationing']), 0, 0);

    expect(rationed.density).toBeGreaterThan(gardens.density);
    expect(rationed.satisfaction).toBeLessThan(gardens.satisfaction);
  });

  // E' la proprieta' che distingue un mandato da un moltiplicatore globale: un
  // mandato industriale non deve toccare un quartiere che di industria non ne ha.
  it('non si sente dove manca il suo portante', () => {
    const park = [source('park')];
    const base = urbanProfileAt(sources(park), 0, 0);
    const sold = urbanProfileAt(sources(park, [], ['soldReserves']), 0, 0);

    expect(sold.industry).toBe(base.industry);
    expect(sold.satisfaction).toBe(base.satisfaction);
    expect(sold.charters).toEqual([]);
  });

  it('elenca fra i mandati percepiti solo quelli sopra soglia', () => {
    // Sotto un parco il residenziale e' forte e il commerciale resta sotto
    // soglia: dei due mandati attivi se ne sente uno solo, ed e' esattamente
    // la distinzione che la tipologia legge.
    const green = [source('park')];
    const near = urbanProfileAt(sources(green, [], ['communityGardens', 'leasedSquare']), 0, 0);
    expect(near.charters).toEqual(['communityGardens']);

    // Fuori dal raggio di ogni catalizzatore non c'e' nessun portante, quindi
    // nessun mandato si sente, per quanti ne siano attivi.
    const far = urbanProfileAt(sources(green, [], ['communityGardens']), 500, 500);
    expect(far.charters).toEqual([]);
  });
});
