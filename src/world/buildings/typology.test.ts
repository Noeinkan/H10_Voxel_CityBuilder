import { describe, expect, it } from 'vitest';
import {
  ALL_CLASSES,
  BUILDING_CLASS,
  catalystById,
  urbanProfileAt,
  type BuildingClass,
  type CatalystId,
  type Catalyst,
  type CharterId,
  type LocalUrbanProfile,
  type PolicyId,
} from '../../sim';
import {
  BAND_OP,
  BUILDER,
  CLASS_PROFILE,
  CROWN_KIND,
  DEFAULT_TYPOLOGY_SHAPE,
  GRAMMAR,
  TYPOLOGIES,
  type CrownKind,
} from './config';
import { generateBuilding } from './generate';
import { selectTypology, typologiesForUses, typologyProfile } from './typology';
import { solidCount, STAMP_EMPTY, type VoxelStamp } from './stamp';

function source(kind: CatalystId, x = 0, y = 0): Catalyst {
  const definition = catalystById(kind);
  return {
    x,
    y,
    kind,
    class: definition.class,
    strength: definition.strength,
    radius: definition.radius,
  };
}

function profileOf(
  kinds: readonly CatalystId[],
  policies: readonly PolicyId[] = [],
  charters: readonly CharterId[] = [],
): LocalUrbanProfile {
  return urbanProfileAt({ catalysts: kinds.map((kind) => source(kind)), policies, charters }, 0, 0);
}

function build(use: BuildingClass, level: number, seed: number, typologyId: string, mixed?: BuildingClass): VoxelStamp {
  const definition = TYPOLOGIES.find((entry) => entry.id === typologyId);
  if (definition === undefined) throw new Error(`tipologia assente: ${typologyId}`);
  return generateBuilding({
    class: use,
    level,
    seed,
    profile: typologyProfile(definition),
    shape: definition.shape,
    mixed,
  });
}

describe('catalogo delle tipologie', () => {
  it('copre ogni uso con almeno un ripiego senza condizioni', () => {
    for (const use of ALL_CLASSES) {
      const fallbacks = TYPOLOGIES.filter((entry) => entry.use === use && entry.priority === 0);
      expect(fallbacks.length).toBeGreaterThan(0);
      // Il ripiego non deve chiedere niente al luogo, altrimenti la selezione
      // potrebbe non trovare risposta proprio dove serve.
      for (const entry of fallbacks) {
        expect(entry.specialization).toBeUndefined();
        expect(entry.roles).toBeUndefined();
        expect(entry.minDensity).toBeUndefined();
      }
    }
  });

  it('offre almeno sei tipologie riconoscibili oltre ai ripieghi', () => {
    const named = TYPOLOGIES.filter((entry) => entry.priority > 0);
    expect(named.length).toBeGreaterThanOrEqual(6);
    expect(new Set(TYPOLOGIES.map((entry) => entry.id)).size).toBe(TYPOLOGIES.length);
    expect(new Set(TYPOLOGIES.map((entry) => entry.label)).size).toBe(TYPOLOGIES.length);
  });

  it('copre tutte e cinque le specializzazioni', () => {
    const covered = new Set(
      TYPOLOGIES.map((entry) => entry.specialization).filter((value) => value !== undefined),
    );
    expect([...covered].sort()).toEqual([
      'entertainment',
      'logistics',
      'office',
      'research',
      'tourism',
    ]);
  });
});

describe('selectTypology', () => {
  it('trova sempre una risposta, anche senza profilo locale', () => {
    for (const use of ALL_CLASSES) {
      for (let level = 0; level <= BUILDER.maxLevel; level++) {
        const chosen = selectTypology({ use, level, profile: null, coastal: false });
        expect(chosen.use).toBe(use);
      }
    }
  });

  it('senza profilo non sceglie mai una forma che il luogo dovrebbe giustificare', () => {
    // Il livello e' una proprieta' dell'edificio e resta lecito; tutto cio' che
    // guarda catalizzatori, distretto o campi locali no: inventare un profilo
    // darebbe forme che nessun catalizzatore giustifica.
    for (const use of ALL_CLASSES) {
      const chosen = selectTypology({ use, level: BUILDER.maxLevel, profile: null, coastal: true });
      expect(chosen.specialization).toBeUndefined();
      expect(chosen.roles).toBeUndefined();
      expect(chosen.districts).toBeUndefined();
      expect(chosen.minDensity).toBeUndefined();
      expect(chosen.coastal).toBeUndefined();
    }
  });

  it('e deterministica: stesso luogo, stessa tipologia', () => {
    const profile = profileOf(['market', 'transport']);
    const query = { use: BUILDING_CLASS.commercial, level: 4, profile, coastal: false };
    expect(selectTypology(query).id).toBe(selectTypology(query).id);
  });

  it('sceglie il mercato sul porto solo sulla costa', () => {
    const profile = profileOf(['port', 'market']);
    const inland = selectTypology({ use: BUILDING_CLASS.commercial, level: 1, profile, coastal: false });
    const coastal = selectTypology({ use: BUILDING_CLASS.commercial, level: 1, profile, coastal: true });

    expect(coastal.id).toBe('harborMarket');
    expect(inland.id).not.toBe('harborMarket');
  });

  it('trasforma lo stesso uso commerciale in cose diverse a seconda del luogo', () => {
    // E' il cuore della fase: l'uso non cambia, cambia la specializzazione che
    // il luogo esprime, e con essa la forma.
    const chosen = (kinds: readonly CatalystId[], coastal = false): string =>
      selectTypology({
        use: BUILDING_CLASS.commercial,
        level: BUILDER.maxLevel,
        profile: profileOf(kinds),
        coastal,
      }).id;

    const ids = new Set([
      chosen(['market', 'transport']),
      chosen(['monument', 'park']),
      chosen(['port', 'market'], true),
    ]);
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });

  it('l uso misto apre tipologie che l uso singolo non ha', () => {
    const profile = profileOf(['market']);
    const single = selectTypology({ use: BUILDING_CLASS.residential, level: 1, profile, coastal: false });
    const mixed = selectTypology({
      use: BUILDING_CLASS.residential,
      mixed: BUILDING_CLASS.commercial,
      level: 1,
      profile,
      coastal: false,
    });

    expect(mixed.id).toBe('shophouse');
    expect(single.id).not.toBe('shophouse');
    expect(single.mixed).toBeUndefined();
  });

  it('sale di tipologia quando la densita e il livello salgono', () => {
    const profile = profileOf(['market', 'transport', 'monument']);
    const low = selectTypology({
      use: BUILDING_CLASS.residential,
      mixed: BUILDING_CLASS.commercial,
      level: 0,
      profile,
      coastal: false,
    });
    const high = selectTypology({
      use: BUILDING_CLASS.residential,
      mixed: BUILDING_CLASS.commercial,
      level: BUILDER.maxLevel,
      profile,
      coastal: false,
    });

    // Una casa-bottega che diventa podio commerciale con abitazioni sopra: e' il
    // racconto che la crescita deve rendere visibile senza spiegarlo.
    expect(low.id).toBe('shophouse');
    expect(high.id).toBe('commercialPodium');
  });

  it('elenca tipologie plausibili per il tooltip di piazzamento', () => {
    const market = catalystById('market');
    const suggested = typologiesForUses(market.favours);
    expect(suggested.length).toBeGreaterThan(0);
    // Solo nomi del catalogo, mai un ripiego: un tooltip che promette "Terraced
    // housing" non dice nulla che il giocatore non veda gia'.
    for (const label of suggested) {
      const found = TYPOLOGIES.find((entry) => entry.label === label);
      expect(found?.priority).toBeGreaterThan(0);
    }
  });
});

describe('forme delle tipologie', () => {
  it('la corte svuota il cuore della stessa forma, senza cambiare la sagoma', () => {
    // Il confronto e' con se stessa a corte spenta: due tipologie diverse
    // avrebbero anche rientranze diverse, e la differenza di volume non
    // direbbe piu' niente sul cortile.
    const definition = TYPOLOGIES.find((entry) => entry.id === 'courtyardBlock');
    if (definition === undefined) throw new Error('tipologia assente');

    let compared = 0;
    for (let seed = 0; seed < 24; seed++) {
      const shared = {
        class: BUILDING_CLASS.residential,
        level: 4,
        seed,
        profile: typologyProfile(definition),
      } as const;
      const hollow = generateBuilding({ ...shared, shape: definition.shape });
      const filled = generateBuilding({
        ...shared,
        shape: { ...definition.shape, courtyard: false },
      });
      if (hollow.sizeX < 3) continue;
      compared++;

      expect(hollow.sizeX).toBe(filled.sizeX);
      expect(hollow.sizeZ).toBe(filled.sizeZ);
      expect(solidCount(hollow)).toBeLessThan(solidCount(filled));

      // Il cortile e' interno: il bordo dell'impronta resta pieno, altrimenti
      // sarebbe un edificio spezzato e non un isolato.
      const plane = hollow.sizeX * hollow.sizeY;
      expect(hollow.voxels[plane]).not.toBe(STAMP_EMPTY);
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('il coronamento piatto toglie il dettaglio verticale sul tetto', () => {
    let widest = 0;
    for (let seed = 0; seed < 16; seed++) {
      const flat = build(BUILDING_CLASS.industrial, 3, seed, 'productionLoft');
      const spired = build(BUILDING_CLASS.civic, 3, seed, 'civicSpire');

      // L'ultima quota di un tetto piatto e' la copertura dell'ultima fascia,
      // non un palo: e' il segno di un capannone. Con la guglia, invece, in
      // cima resta esattamente un voxel.
      const roof = countSolidsOnLayer(flat, flat.sizeZ - 1);
      expect(roof).toBeGreaterThan(1);
      widest = Math.max(widest, roof);
      // Il dettaglio e' un prisma di lato `roofPropSide`, non un ago da un voxel.
      expect(countSolidsOnLayer(spired, spired.sizeZ - 1))
        .toBeLessThanOrEqual(GRAMMAR.roofPropSide ** 2);
    }
    // E almeno una volta e' una copertura vera, non una lama residua.
    expect(widest).toBeGreaterThanOrEqual(4);
  });

  it('le cinque cime sono cinque forme diverse, non due', () => {
    // Il corpo si tiene fermo con un repertorio di solo `keep`: se le fasce
    // rientrassero, a distinguere le cime sarebbe anche la larghezza su cui
    // poggiano, e il test non direbbe piu' niente sul coronamento.
    const roofs = new Map<CrownKind, string>();
    for (const kind of Object.values(CROWN_KIND)) {
      const stamp = generateBuilding({
        class: BUILDING_CLASS.civic,
        level: 5,
        seed: 4242,
        shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: kind, minFootprint: 8 },
        profile: {
          ...CLASS_PROFILE[BUILDING_CLASS.civic],
          shrinkOps: [BAND_OP.keep],
          growOps: [BAND_OP.keep],
        },
      });
      const top = countSolidsOnLayer(stamp, stamp.sizeZ - 1);
      roofs.set(kind, `${stamp.sizeZ}:${top}`);
    }
    expect(new Set(roofs.values()).size).toBe(Object.keys(CROWN_KIND).length);

    // Le due che portano il dettaglio verticale restano le due che devono:
    // sopra una guglia e sopra una lanterna c'e' un prisma, non un tetto.
    for (const kind of [CROWN_KIND.taper, CROWN_KIND.lantern]) {
      expect(Number(roofs.get(kind)?.split(':')[1])).toBeLessThanOrEqual(GRAMMAR.roofPropSide ** 2);
    }
    for (const kind of [CROWN_KIND.flat, CROWN_KIND.stepped, CROWN_KIND.ridge]) {
      expect(Number(roofs.get(kind)?.split(':')[1])).toBeGreaterThan(GRAMMAR.roofPropSide ** 2);
    }
  });

  it('la copertura lunga resta larga quanto il corpo su un asse solo', () => {
    // E' cio' che distingue un `ridge` da un `taper`: rientrare su entrambi gli
    // assi darebbe un cappello, e un mercato visto di fianco perderebbe la falda.
    const stamp = generateBuilding({
      class: BUILDING_CLASS.commercial,
      level: 4,
      seed: 77,
      shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.ridge, minFootprint: 8 },
      profile: {
        ...CLASS_PROFILE[BUILDING_CLASS.commercial],
        shrinkOps: [BAND_OP.keep],
        growOps: [BAND_OP.keep],
      },
    });
    const plane = stamp.sizeX * stamp.sizeY;
    let spanX = 0;
    let spanY = 0;
    for (let sy = 0; sy < stamp.sizeY; sy++) {
      for (let sx = 0; sx < stamp.sizeX; sx++) {
        if (stamp.voxels[sx + stamp.sizeX * sy + plane * (stamp.sizeZ - 1)] === STAMP_EMPTY) continue;
        spanX = Math.max(spanX, sx + 1);
        spanY = Math.max(spanY, sy + 1);
      }
    }
    // Un asse tocca il bordo dell'impronta, l'altro no.
    expect(Math.max(spanX, spanY)).toBe(stamp.sizeX);
    expect(Math.min(spanX, spanY)).toBeLessThan(stamp.sizeX);
  });

  it('il podio di un edificio misto porta i colori del secondo uso', () => {
    let seenPodium = 0;
    for (let seed = 0; seed < 24; seed++) {
      const mixed = build(BUILDING_CLASS.residential, 3, seed, 'commercialPodium', BUILDING_CLASS.commercial);
      const plain = build(BUILDING_CLASS.residential, 3, seed, 'commercialPodium');
      if (mixed.sizeZ < 4) continue;
      seenPodium++;

      // Stessa sagoma, colori diversi in basso: la divisione delle funzioni si
      // legge dal basamento, senza etichette e senza una zona.
      expect(mixed.sizeX).toBe(plain.sizeX);
      expect(mixed.sizeZ).toBe(plain.sizeZ);
      expect(Array.from(mixed.voxels)).not.toEqual(Array.from(plain.voxels));
    }
    expect(seenPodium).toBeGreaterThan(0);
  });

  it('produce silhouette distinguibili fra tipologie diverse dello stesso uso', () => {
    const shapes = new Set<string>();
    for (const entry of TYPOLOGIES) {
      const stamp = build(entry.use, BUILDER.maxLevel, 4242, entry.id);
      shapes.add(`${stamp.sizeX}x${stamp.sizeZ}:${solidCount(stamp)}`);
    }
    // Non tutte devono differire — due ripieghi possono coincidere — ma la gran
    // parte si', altrimenti il catalogo sarebbe decorativo.
    expect(shapes.size).toBeGreaterThanOrEqual(TYPOLOGIES.length - 3);
  });

  it('resta deterministica: stessa tipologia e stesso seme, stessi byte', () => {
    for (const entry of TYPOLOGIES) {
      const a = build(entry.use, 4, 99, entry.id);
      const b = build(entry.use, 4, 99, entry.id);
      expect(Array.from(b.voxels)).toEqual(Array.from(a.voxels));
      expect(Array.from(b.surfaces)).toEqual(Array.from(a.surfaces));
    }
  });
});

describe('tipologie concesse da un mandato', () => {
  // Un mercato e un trasporto: c'e' abbastanza commerciale e residenziale
  // perche' i portanti dei mandati si sentano su questa colonna.
  const kinds: readonly CatalystId[] = ['market', 'transport'];

  function chosen(use: BuildingClass, charters: readonly CharterId[]): string {
    return selectTypology({
      use,
      level: 4,
      profile: profileOf(kinds, [], charters),
      coastal: false,
    }).id;
  }

  it('non compaiono senza il mandato che le concede', () => {
    const gated = TYPOLOGIES.filter((entry) => entry.charter !== undefined);
    expect(gated.length).toBeGreaterThan(0);

    const withoutCharters = new Set(
      ALL_CLASSES.map((use) => chosen(use, [])),
    );
    for (const entry of gated) expect(withoutCharters.has(entry.id)).toBe(false);
  });

  it('il mandato cambia la tipologia scelta a parita di tutto il resto', () => {
    const plain = chosen(BUILDING_CLASS.residential, []);

    expect(chosen(BUILDING_CLASS.residential, ['communityGardens'])).toBe('gardenHousing');
    expect(chosen(BUILDING_CLASS.residential, ['rationing'])).toBe('rationedBlock');
    expect(chosen(BUILDING_CLASS.residential, ['communityGardens'])).not.toBe(plain);
  });

  it('due scelte opposte danno volumi diversi, non solo colori diversi', () => {
    const gardens = build(BUILDING_CLASS.residential, 4, 7, 'gardenHousing');
    const rationed = build(BUILDING_CLASS.residential, 4, 7, 'rationedBlock');

    expect(gardens.sizeX).toBeGreaterThan(rationed.sizeX);
    expect(rationed.sizeZ).toBeGreaterThan(gardens.sizeZ);
  });

  it('un mandato commerciale non tocca la forma degli altri usi', () => {
    const industrial = chosen(BUILDING_CLASS.industrial, []);
    expect(chosen(BUILDING_CLASS.industrial, ['localShops'])).toBe(industrial);
    expect(chosen(BUILDING_CLASS.commercial, ['localShops'])).toBe('marketArcade');
  });

  // Il mandato viaggia sul profilo, quindi fuori dalla simulazione — dove il
  // profilo non c'e' — le righe concesse restano fuori dalla selezione.
  it('senza profilo locale nessuna tipologia concessa e selezionabile', () => {
    const fallback = selectTypology({
      use: BUILDING_CLASS.residential,
      level: 4,
      profile: null,
      coastal: false,
    });
    expect(fallback.charter).toBeUndefined();
  });
});

function countSolidsOnLayer(stamp: VoxelStamp, z: number): number {
  const plane = stamp.sizeX * stamp.sizeY;
  let count = 0;
  for (let i = 0; i < plane; i++) {
    if (stamp.voxels[i + plane * z] !== STAMP_EMPTY) count++;
  }
  return count;
}
