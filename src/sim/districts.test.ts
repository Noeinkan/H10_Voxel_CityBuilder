import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { CATALYSTS } from './catalysts';
import type { CharterId } from './charters';
import {
  ALL_SPECIALIZATIONS,
  specializationGapsOf,
  specializationOf,
  urbanProfileAt,
  type LocalUrbanProfile,
  type Specialization,
  type UrbanMetric,
  type UrbanSources,
} from './districts';
import type { Catalyst } from './DesirabilityField';
import type { PolicyId } from './policies';
import { ReachCache } from './reach';

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
  // Cache nuda: senza un costo di passo si comporta come la Chebyshev di prima,
  // che e' cio' che queste prove misurano. Una per chiamata, cosi' nessun test
  // eredita le portate calcolate da un altro.
  return { catalysts, policies, charters, reach: new ReachCache() };
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

/**
 * Riscrive un profilo e **ricalcola** la specializzazione.
 *
 * Non e' un dettaglio da fixture: il referto salta la specializzazione in
 * vigore, quindi un profilo con quel campo scritto a mano cambierebbe cosa il
 * test sta misurando senza dirlo.
 */
function reseat(profile: LocalUrbanProfile, patch: Partial<LocalUrbanProfile>): LocalUrbanProfile {
  const next = { ...profile, ...patch };
  return { ...next, specialization: specializationOf(next) };
}

/** Un luogo nudo: nessun ruolo in raggio, ogni metrica a zero. */
function blank(patch: Partial<LocalUrbanProfile> = {}): LocalUrbanProfile {
  return reseat({
    district: 'outskirts',
    density: 0,
    wealth: 0,
    accessibility: 0,
    satisfaction: 0,
    industry: 0,
    roles: [],
    charters: [],
    uses: [0, 0, 0, 0],
    specialization: null,
  }, patch);
}

/** Chiude, uno per volta, ogni requisito che il referto riporta per `id`. */
function satisfy(id: Specialization): LocalUrbanProfile {
  let current = blank();
  // Il tetto e' generoso — un ruolo piu' al massimo tre soglie — e un ciclo che
  // non converge e' un difetto da far fallire, non da nascondere con un `while`.
  for (let guard = 0; guard < 8; guard++) {
    const gap = specializationGapsOf(current).find((entry) => entry.id === id);
    if (gap === undefined) return current;
    current = gap.metric === null
      ? reseat(current, { roles: [gap.roles[0]] })
      : reseat(current, { [gap.metric]: gap.need });
  }
  throw new Error(`i requisiti di ${id} non convergono`);
}

describe('cosa manca a un luogo per specializzarsi', () => {
  /**
   * La prova che il referto e la regola non si sono allontanati.
   *
   * `specializationGapsOf` deriva dalla tabella in `balance.ts`,
   * `specializationOf` e' una catena di `if` scritta a mano: chiudere tutto cio'
   * che il primo riporta **deve** bastare al secondo. Se un giorno la catena
   * guadagnasse una condizione che la tabella non ha, qui il profilo resterebbe
   * senza specializzazione e il test cadrebbe — che e' l'unico modo perche' il
   * pannello non prometta un requisito che il codice non applica.
   */
  it('chiudere i requisiti riportati basta a ottenere la specializzazione', () => {
    for (const id of ALL_SPECIALIZATIONS) {
      expect(satisfy(id).specialization).not.toBeNull();
    }
  });

  it('ogni requisito riportato e davvero vincolante', () => {
    for (const id of ALL_SPECIALIZATIONS) {
      const built = satisfy(id);

      // Senza un ruolo che la apra, nessuna soglia basta.
      expect(reseat(built, { roles: [] }).specialization).not.toBe(id);

      // E ogni soglia della tabella, riabbassata sotto il minimo, la toglie.
      for (const [metric, need] of Object.entries(BALANCE.districts.specialization[id])) {
        expect(reseat(built, { [metric as UrbanMetric]: need - 0.01 }).specialization).not.toBe(id);
      }
    }
  });

  it('riporta la soglia piu lontana, non la prima', () => {
    // Il ruolo c'e' e mancano entrambe le soglie, ma non alla stessa distanza:
    // l'industria e' al'88% del minimo, la densita' al 19%. A essere riportata
    // dev'essere la densita', perche' e' quella su cui agire per prima.
    const industrial = blank({ roles: ['factory'], density: 0.1, industry: 0.3 });
    const farming = specializationGapsOf(industrial).find((gap) => gap.id === 'farming');

    expect(farming?.metric).toBe('density');
    expect(farming?.need).toBe(BALANCE.districts.specialization.farming.density);
    expect(farming?.have).toBe(0.1);
  });

  it('il ruolo mancante batte ogni soglia', () => {
    // Metriche larghissime, ma nessuno dei due ruoli che aprono l'agricoltura:
    // aspettare non servirebbe a niente, e il referto deve mandare a piazzare.
    const green = blank({ roles: ['park'], density: 0.9, industry: 0.9 });
    const farming = specializationGapsOf(green).find((gap) => gap.id === 'farming');

    expect(farming?.metric).toBeNull();
    expect(farming?.roles).toEqual(['factory', 'university']);
  });

  it('ordina dalla piu vicina alla piu lontana', () => {
    // Chi ha ancora il ruolo da trovare sta in fondo per costruzione: il suo
    // rapporto e' zero, e nessuna soglia mancante puo' fare peggio.
    const gaps = specializationGapsOf(blank({ roles: ['factory'], density: 0.5, industry: 0.5 }));
    expect(gaps.length).toBeGreaterThan(1);

    const withRole = gaps.filter((gap) => gap.metric !== null);
    const withoutRole = gaps.filter((gap) => gap.metric === null);
    expect(gaps.slice(0, withRole.length)).toEqual(withRole);
    expect(gaps.slice(withRole.length)).toEqual(withoutRole);
  });

  it('non riporta la specializzazione gia in vigore', () => {
    const built = satisfy('farming');

    expect(built.specialization).toBe('farming');
    expect(specializationGapsOf(built).some((gap) => gap.id === 'farming')).toBe(false);
  });
});
