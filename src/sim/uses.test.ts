import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { CATALYSTS, CATALYST_GROUPS, catalystById, catalystInfluence } from './catalysts';
import { ALL_CLASSES, BUILDING_CLASS, CLASS_COUNT, CLASS_NAMES } from './classes';
import { nextBuildSites } from './nextBuildSites';
import {
  addBuilding,
  addCatalyst,
  createSimState,
  reviveSimState,
  toSimStateData,
  type SimState,
  type SimStateData,
} from './SimState';
import { testTerrain } from './testTerrain';
import { tickMany } from './tick';

const TERRAIN = testTerrain({ chunksX: 8, chunksY: 8 });

function withCatalyst(state: SimState, kind: Parameters<typeof catalystById>[0], x: number, y: number): SimState {
  const definition = catalystById(kind);
  return addCatalyst(state, {
    x,
    y,
    kind,
    class: definition.class,
    strength: definition.strength,
    radius: definition.radius,
  });
}

describe('usi urbani', () => {
  it('sono quattro e in ordine di contratto', () => {
    expect(CLASS_COUNT).toBe(4);
    expect(CLASS_NAMES).toEqual(['residential', 'commercial', 'industrial', 'civic']);
    expect(BALANCE.desirability.siteThreshold).toHaveLength(CLASS_COUNT);
    expect(BALANCE.mixedUse.partners).toHaveLength(CLASS_COUNT);
  });
});

describe('vettore di influenza dei catalizzatori', () => {
  it('ogni ruolo porta almeno un uso a pieno, e il pieno vale esattamente strength', () => {
    // E' l'invariante del campo: senza policy attive, al centro di un
    // catalizzatore il valore dell'uso portato a pieno e' `strength` esatto.
    for (const definition of CATALYSTS) {
      const influence = catalystInfluence(definition.id);
      expect(Math.max(...influence)).toBe(1);

      const state = withCatalyst(createSimState(), definition.id, 100, 100);
      for (const cls of ALL_CLASSES) {
        if (influence[cls] !== 1) continue;
        expect(state.field.valueAt(100, 100, cls)).toBe(definition.strength);
      }
    }
  });

  it('un catalizzatore alimenta piu usi insieme', () => {
    const state = withCatalyst(createSimState(), 'market', 100, 100);
    // Il mercato non e' piu' "un catalizzatore residenziale": tira su case e
    // negozi allo stesso modo, ed e' cio' che ne fa il seme dell'uso misto.
    expect(state.field.valueAt(100, 100, BUILDING_CLASS.residential)).toBeGreaterThan(0);
    expect(state.field.valueAt(100, 100, BUILDING_CLASS.commercial)).toBeGreaterThan(0);
    expect(state.field.valueAt(100, 100, BUILDING_CLASS.industrial)).toBe(0);
  });

  it('un influenza negativa cancella l uso invece di ignorarlo', () => {
    // Un parco da solo azzera l'industriale; una fabbrica da sola azzera il
    // residenziale. Il clamp a zero era gia' li': il segno negativo non ha
    // avuto bisogno di un meccanismo suo.
    const park = withCatalyst(createSimState(), 'park', 60, 60);
    expect(park.field.valueAt(60, 60, BUILDING_CLASS.industrial)).toBe(0);

    const factory = withCatalyst(createSimState(), 'factory', 60, 60);
    expect(factory.field.valueAt(60, 60, BUILDING_CLASS.residential)).toBe(0);

    // E convive: una fabbrica accanto a un mercato abbassa le case senza
    // spegnerle del tutto.
    const both = withCatalyst(withCatalyst(createSimState(), 'market', 60, 60), 'factory', 66, 60);
    const alone = withCatalyst(createSimState(), 'market', 60, 60);
    const housing = both.field.valueAt(63, 60, BUILDING_CLASS.residential);
    expect(housing).toBeGreaterThan(0);
    expect(housing).toBeLessThan(alone.field.valueAt(63, 60, BUILDING_CLASS.residential));
  });

  it('espone usi favoriti e penalizzati coerenti col vettore', () => {
    for (const definition of CATALYSTS) {
      for (const cls of definition.favours) expect(definition.influence[cls]).toBeGreaterThan(0);
      for (const cls of definition.penalises) expect(definition.influence[cls]).toBeLessThan(0);
      expect(definition.favours).not.toHaveLength(0);
      // Ordinati dal contributo maggiore al minore: il tooltip li mostra cosi'.
      for (let i = 1; i < definition.favours.length; i++) {
        expect(definition.influence[definition.favours[i]])
          .toBeLessThanOrEqual(definition.influence[definition.favours[i - 1]]);
      }
    }
  });

  it('divide gli otto ruoli in tre funzioni di toolbar', () => {
    const grouped = CATALYST_GROUPS.flatMap((group) =>
      CATALYSTS.filter((entry) => entry.group === group.id),
    );
    expect(grouped).toHaveLength(CATALYSTS.length);
    expect(CATALYST_GROUPS.map((group) => group.id)).toEqual(['growth', 'connections', 'identity']);
  });

  it('i due collegamenti chiedono luoghi che si escludono', () => {
    // E' l'unica cosa che impedisce a porto e aeroporto di essere due prezzi
    // per lo stesso sblocco: prima ancora dell'effetto, non stanno nello stesso
    // posto. Gli altri ruoli restano senza vincolo, come sono sempre stati.
    expect(catalystById('port').site).toBe('coastal');
    expect(catalystById('airport').site).toBe('open');
    for (const definition of CATALYSTS) {
      if (definition.id === 'port' || definition.id === 'airport') continue;
      expect({ id: definition.id, site: definition.site }).toEqual({ id: definition.id, site: 'any' });
    }
  });

  it('ricalcolo incrementale e ricostruzione completa restano indistinguibili', () => {
    // La proprieta' regge anche ora che un catalizzatore tocca piu' usi: e'
    // quella che rende togliere un catalizzatore uguale a non averlo mai messo.
    let state = createSimState();
    state = withCatalyst(state, 'market', 100, 100);
    state = withCatalyst(state, 'factory', 130, 96);
    state = withCatalyst(state, 'monument', 108, 128);
    state = addBuilding(state, { x: 101, y: 101, class: BUILDING_CLASS.residential });

    const incremental = ALL_CLASSES.map((cls) => snapshot(state, cls));
    state.field.rebuild(state.catalysts, state.buildings, { ...BALANCE.weights });
    const rebuilt = ALL_CLASSES.map((cls) => snapshot(state, cls));

    expect(rebuilt).toEqual(incremental);
  });
});

describe('edifici a uso misto', () => {
  it('nascono dalla sovrapposizione di due campi compatibili', () => {
    // Un mercato porta a pieno residenziale e commerciale insieme: e'
    // esattamente la sovrapposizione da cui deve uscire una casa-bottega.
    const state = withCatalyst(createSimState(), 'market', 100, 100);
    const sites = nextBuildSites(state, TERRAIN, 200);

    const mixed = sites.filter((site) => site.mixed !== -1);
    expect(mixed.length).toBeGreaterThan(0);
    for (const site of mixed) {
      expect(BALANCE.mixedUse.partners[site.class]).toContain(site.mixed);
      expect(site.mixed).not.toBe(site.class);
    }
  });

  it('non nascono dove il secondo uso non supera la sua soglia ridotta', () => {
    // Una fabbrica isolata: l'industriale sfonda, il commerciale resta sotto.
    const state = withCatalyst(createSimState(), 'factory', 100, 100);
    const sites = nextBuildSites(state, TERRAIN, 400);
    const share = BALANCE.mixedUse.thresholdShare;

    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      if (site.mixed === -1) continue;
      expect(state.field.valueAt(site.x, site.y, site.mixed))
        .toBeGreaterThan(BALANCE.desirability.siteThreshold[site.mixed] * share);
    }
  });

  it('singleUse spegne del tutto il secondo uso', () => {
    const state = withCatalyst(createSimState(), 'market', 100, 100);
    const sites = nextBuildSites(state, TERRAIN, 200, { singleUse: true });
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((site) => site.mixed === -1)).toBe(true);
  });

  it('portano capacita economica del secondo uso senza occupare una seconda cella', () => {
    const share = BALANCE.mixedUse.secondaryShare;
    let plain = createSimState();
    let mixed = createSimState();
    for (let i = 0; i < 8; i++) {
      plain = addBuilding(plain, { x: 4 + i, y: 4, class: BUILDING_CLASS.residential });
      mixed = addBuilding(mixed, {
        x: 4 + i,
        y: 4,
        class: BUILDING_CLASS.residential,
        mixed: BUILDING_CLASS.commercial,
      });
    }

    expect(mixed.buildings).toHaveLength(plain.buildings.length);
    expect(mixed.field.occupiedCells).toBe(plain.field.occupiedCells);
    expect(mixed.mixedCounts[BUILDING_CLASS.commercial]).toBe(8);

    // Otto case-bottega servono quanto quattro negozi pieni.
    const served = tickMany(mixed, TERRAIN, 400);
    expect(served.commerce.capacity).toBeCloseTo(8 * share * BALANCE.weights.commercialCapacity, 9);
    expect(tickMany(plain, TERRAIN, 400).commerce.capacity).toBe(0);
  });

  it('reviveSimState ricostruisce i conteggi secondari dalla lista', () => {
    let state = createSimState();
    state = addBuilding(state, {
      x: 4,
      y: 4,
      class: BUILDING_CLASS.residential,
      mixed: BUILDING_CLASS.commercial,
    });

    expect(revivedWithoutMixedCounts(state).mixedCounts).toEqual([0, 1, 0, 0]);
  });
});

/** Tutte le celle non nulle di un uso, per confronto profondo fra due campi. */
function snapshot(state: SimState, cls: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const chunk of state.field.chunks.values()) {
    const values = chunk.values[cls];
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== 0) out.set(`${chunk.ccx},${chunk.ccy},${i}`, values[i]);
    }
  }
  return out;
}

/**
 * Giro da salvataggio senza i conteggi secondari.
 *
 * Passa da JSON come farebbe un salvataggio vero: `undefined` sparisce, ed e'
 * esattamente il caso che `reviveSimState` deve saper ricostruire.
 */
function revivedWithoutMixedCounts(state: SimState): SimState {
  const { mixedCounts: _dropped, ...rest } = toSimStateData(state);
  return reviveSimState(JSON.parse(JSON.stringify(rest)) as SimStateData);
}
