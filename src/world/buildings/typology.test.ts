import { describe, expect, it } from 'vitest';
import {
  ALL_CLASSES,
  ALL_SPECIALIZATIONS,
  BUILDING_CLASS,
  CATALYSTS,
  CHARTERS,
  catalystById,
  ReachCache,
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
  LOT_ROLE,
  TYPOLOGIES,
  type CrownKind,
  type LotRole,
  type TypologyDefinition,
} from './config';
import { generateBuilding } from './generate';
import {
  bestProspectOf,
  selectTypology,
  typologiesForUses,
  typologyAccepts,
  typologyGapsOf,
  typologyProfile,
  type TypologyQuery,
} from './typology';
import { solidCount, STAMP_EMPTY, type VoxelStamp } from './stamp';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { SURFACE_KIND } from '../visualBlock';

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
  return urbanProfileAt({
    catalysts: kinds.map((kind) => source(kind)),
    policies,
    charters,
    // Senza costo di passo la portata e' la Chebyshev di sempre: qui si misura
    // la scelta della tipologia, non come il terreno piega l'influenza.
    reach: new ReachCache(),
  }, 0, 0);
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

  it('nessuna riga e dominata da una che la precede', () => {
    // **Una riga irraggiungibile non fallisce: sparisce.** `selectTypology`
    // tiene la prima a parita' di priorita', quindi una riga preceduta da una
    // che chiede *meno* di lei non puo' vincere da nessuna parte — e nessun
    // test se ne accorgeva, perche' il catalogo continuava a contenerla.
    // `roundTower` e' rimasta cosi' per un'intera fase, dietro `skyTerraces`
    // che pretende la stessa ricchezza con un livello in meno.
    const limits = [
      'minLevel', 'minDensity', 'minWealth',
      'minAccessibility', 'minSatisfaction', 'minIndustry',
    ] as const;

    /** true se `earlier` non chiede niente che `later` non chieda gia'. */
    const dominates = (earlier: TypologyDefinition, later: TypologyDefinition): boolean => {
      if (earlier.use !== later.use) return false;
      if (earlier.priority < later.priority) return false;
      if (earlier.maxDensity !== undefined) return false;
      if (earlier.coastal === true && later.coastal !== true) return false;
      if (earlier.lotRole !== undefined && earlier.lotRole !== later.lotRole) return false;
      if (earlier.mixed !== undefined && earlier.mixed !== later.mixed) return false;
      if (earlier.roles !== undefined || earlier.charter !== undefined) return false;
      if (earlier.districts !== undefined) return false;
      if (earlier.specialization !== undefined &&
        earlier.specialization !== later.specialization) return false;
      return limits.every((key) => (earlier[key] ?? 0) <= (later[key] ?? 0));
    };

    for (let i = 0; i < TYPOLOGIES.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(dominates(TYPOLOGIES[j], TYPOLOGIES[i]), `${TYPOLOGIES[j].id} > ${TYPOLOGIES[i].id}`)
          .toBe(false);
      }
    }
  });

  it('offre almeno sei tipologie riconoscibili oltre ai ripieghi', () => {
    const named = TYPOLOGIES.filter((entry) => entry.priority > 0);
    expect(named.length).toBeGreaterThanOrEqual(6);
    expect(new Set(TYPOLOGIES.map((entry) => entry.id)).size).toBe(TYPOLOGIES.length);
    expect(new Set(TYPOLOGIES.map((entry) => entry.label)).size).toBe(TYPOLOGIES.length);
  });

  it('la torre idroponica accende le luci di crescita senza un emettitore nuovo', () => {
    // E' il rendimento della fase 4: l'accento verde a livello alto esce
    // `luminous` dalla grammatica che c'e' gia', quindi le fasce di coltura si
    // vedono di notte senza un materiale, uno slot o un emettitore in piu'.
    const tower = build(BUILDING_CLASS.industrial, 8, 11, 'hydroponicTower');

    let lit = 0;
    let greenLit = 0;
    for (let i = 0; i < tower.voxels.length; i++) {
      if (tower.surfaces[i] !== SURFACE_KIND.luminous) continue;
      lit++;
      if (tower.voxels[i] === PALETTE_SLOTS.grassLight) greenLit++;
    }

    expect(lit).toBeGreaterThan(0);
    // Le facce luminose sono la coltura, non il vetro: se un giorno l'accento
    // tornasse a essere un tono freddo, questo test lo dice.
    expect(greenLit).toBe(lit);
  });

  it('sotto il livello che accende, la torre resta una fabbrica spenta', () => {
    // `minLevel` la tiene fuori dai livelli bassi, ma la grammatica e' condivisa:
    // vale la pena fissare che il verde non compaia acceso prima del tempo.
    const low = build(BUILDING_CLASS.industrial, 1, 11, 'hydroponicTower');
    let lit = 0;
    for (let i = 0; i < low.voxels.length; i++) {
      if (low.surfaces[i] === SURFACE_KIND.luminous) lit++;
    }
    expect(lit).toBe(0);
  });

  it('copre tutte le specializzazioni, quante che siano', () => {
    // L'elenco atteso e' **derivato** dal vocabolario della simulazione e non
    // riscritto qui: una specializzazione nuova senza una tipologia che la
    // esprima e' un buco vero — nessun luogo la mostrerebbe mai a schermo — e
    // deve far cadere questo test. Un elenco a mano lo faceva cadere anche
    // quando il buco non c'era.
    const covered = new Set(
      TYPOLOGIES.map((entry) => entry.specialization).filter((value) => value !== undefined),
    );
    expect([...covered].sort()).toEqual([...ALL_SPECIALIZATIONS].sort());
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

  it('la torre idroponica e’ raggiungibile: un polo industriale denso la esprime', () => {
    // Una tipologia che nessun luogo puo' esprimere e' contenuto morto, e le
    // soglie di `farming` sono le piu' alte del gruppo: vale la pena fissare che
    // esista almeno un luogo che le supera davvero, invece di scoprirlo a
    // schermo non trovandola mai.
    const profile = profileOf(['factory', 'university', 'transport']);
    expect(profile.specialization).toBe('farming');

    const built = selectTypology({
      use: BUILDING_CLASS.industrial,
      level: BUILDER.maxLevel,
      profile,
      coastal: false,
    });
    expect(built.id).toBe('hydroponicTower');
  });

  it('sotto il proprio livello la torre cede a una fabbrica normale', () => {
    // La specializzazione non basta: finche' la citta' non e' salita, li' ci sta
    // una fabbrica. E' cio' che impedisce alla torre di comparire in periferia.
    const profile = profileOf(['factory', 'university', 'transport']);
    const low = selectTypology({
      use: BUILDING_CLASS.industrial,
      level: 1,
      profile,
      coastal: false,
    });
    expect(low.id).not.toBe('hydroponicTower');
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

  /**
   * La sovrapromessa tolta, misurata.
   *
   * Era il difetto che questo elenco portava scritto nel proprio commento:
   * prometteva le forme di un uso senza le condizioni che le governano. Una riga
   * dietro una specializzazione non arriva piazzando il catalizzatore, e
   * nominarla li' insegnava a non fidarsi del tooltip.
   */
  it('non promette piu cio che dipende da una specializzazione', () => {
    const gated = TYPOLOGIES.filter((entry) => entry.specialization !== undefined);
    expect(gated.length).toBeGreaterThan(0);

    for (const use of ALL_CLASSES) {
      const suggested = typologiesForUses([use]);
      for (const entry of gated) {
        expect(suggested).not.toContain(entry.label);
      }
    }
  });
});

/**
 * Una griglia deterministica di luoghi, per le prove che devono valere ovunque.
 *
 * I profili nascono da `urbanProfileAt` su sottoinsiemi casuali di
 * catalizzatori, non da campi riempiti a mano: cosi' ruoli, distretto,
 * specializzazione e metriche restano fra loro coerenti come lo sono in partita,
 * e la griglia non passa il tempo su profili che non possono esistere.
 */
function grid(samples = 240): readonly TypologyQuery[] {
  const roles = CATALYSTS.map((entry) => entry.id);
  const charters = CHARTERS.map((entry) => entry.id);
  const lotRoles: readonly (LotRole | undefined)[] = [
    undefined,
    LOT_ROLE.frontage,
    LOT_ROLE.corner,
    LOT_ROLE.interior,
  ];

  // Congruenziale lineare: stesso seme, stessa griglia a ogni esecuzione. Un
  // test che cambia campione a ogni giro non e' riproducibile, e questo deve
  // poter fallire due volte di fila sullo stesso caso.
  //
  // **Si pesca dai bit alti.** In un LCG a modulo 2^32 i bit bassi hanno periodo
  // cortissimo — l'ultimo alterna 0,1,0,1 — quindi `state % 2` non e' un
  // sorteggio ma un contatore, e la griglia collassava su pochi campioni: tre
  // generi di rifiuto su undici non venivano mai raggiunti.
  let state = 0x5eed_1337 >>> 0;
  const next = (bound: number): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 0x1_0000_0000) * bound);
  };

  const queries: TypologyQuery[] = [];
  for (let i = 0; i < samples; i++) {
    const near = roles.filter(() => next(3) === 0);
    const felt = charters.filter(() => next(6) === 0);
    // Un campione su otto senza profilo: e' il piazzamento fuori simulazione, e
    // ha un ramo tutto suo in entrambe le funzioni.
    const profile = next(8) === 0 ? null : profileOf(near, [], felt);

    // Estratto una volta sola: pescarlo due volte avanzerebbe il generatore fra
    // la condizione e il valore, e il campione non sarebbe piu' quello scelto.
    const lot = lotRoles[next(lotRoles.length)];

    queries.push({
      use: (next(ALL_CLASSES.length)) as BuildingClass,
      ...(next(2) === 0 ? {} : { mixed: next(ALL_CLASSES.length) as BuildingClass }),
      level: 1 + next(BUILDER.maxLevel),
      profile,
      coastal: next(2) === 0,
      ...(lot === undefined ? {} : { lotRole: lot }),
    });
  }
  return queries;
}

describe('cosa manca a un luogo per una tipologia', () => {
  /**
   * L'invariante che tiene insieme le due letture della stessa regola.
   *
   * `accepts` resta il booleano senza allocazioni del percorso caldo e
   * `typologyGapsOf` e' la sua spiegazione: sono due traversate, e a impedire che
   * si allontanino c'e' solo questo test. Cade il giorno in cui qualcuno aggiunge
   * un ramo all'una senza aggiungerlo all'altra — che e' il giorno in cui il
   * pannello comincerebbe a promettere una forma che il Builder rifiuta.
   */
  it('non riporta gap se e solo se la riga qualifica', () => {
    let accepted = 0;
    let refused = 0;

    for (const query of grid()) {
      for (const candidate of TYPOLOGIES) {
        const qualifies = typologyAccepts(candidate, query);
        expect(typologyGapsOf(candidate, query).length === 0).toBe(qualifies);
        if (qualifies) accepted++; else refused++;
      }
    }

    // Che la griglia veda **entrambi** gli esiti, o l'uguaglianza qui sopra
    // sarebbe vera per il motivo sbagliato: una griglia degenerata che rifiuta
    // tutto passerebbe questo test senza provare niente.
    expect(accepted).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(100);
  });

  // La stessa uguaglianza sul solo campo che conta davvero: ogni ramo di
  // `accepts` deve poter cadere almeno una volta nella griglia, altrimenti
  // quel ramo non e' coperto da niente.
  it('la griglia esercita ogni genere di rifiuto', () => {
    const seen = new Set<string>();
    for (const query of grid()) {
      for (const candidate of TYPOLOGIES) {
        for (const gap of typologyGapsOf(candidate, query)) seen.add(gap.kind);
      }
    }

    const kinds = [
      'charter', 'coastal', 'district', 'level', 'lotRole',
      'metric', 'mixed', 'place', 'roles', 'specialization', 'use',
    ];
    // `district` oggi non si raggiunge, e **non e' un buco della griglia**:
    // nessuna riga del catalogo pone un vincolo di quartiere. Il ramo resta in
    // `accepts` come punto di estensione, e l'eccezione qui e' legata alla sua
    // causa invece che scritta a mano — il giorno in cui una riga lo usera', la
    // griglia dovra' raggiungerlo o questo test lo dira'.
    const zoned = TYPOLOGIES.some((entry) => entry.districts !== undefined);

    expect([...seen].sort()).toEqual(kinds.filter((kind) => kind !== 'district' || zoned));
  });

  it('nomina il livello quando e il livello a mancare', () => {
    const tower = TYPOLOGIES.find((entry) => entry.id === 'hydroponicTower');
    expect(tower?.minLevel).toBeGreaterThan(1);

    const gaps = typologyGapsOf(tower!, {
      use: tower!.use,
      level: 1,
      profile: profileOf(['factory', 'university']),
      coastal: false,
    });
    const level = gaps.find((gap) => gap.kind === 'level');

    expect(level?.have).toBe(1);
    expect(level?.need).toBe(tower!.minLevel);
  });

  it('nomina la specializzazione che la riga pretende', () => {
    const tower = TYPOLOGIES.find((entry) => entry.id === 'hydroponicTower');
    // Un prato: nessun ruolo, nessuna specializzazione, il livello piu' alto.
    const gaps = typologyGapsOf(tower!, {
      use: tower!.use,
      level: BUILDER.maxLevel,
      profile: profileOf([]),
      coastal: false,
    });

    expect(gaps.find((gap) => gap.kind === 'specialization')?.wants).toEqual(['farming']);
  });

  it('la prospettiva e la riga piu specifica che il luogo non raggiunge', () => {
    const query: TypologyQuery = {
      use: BUILDING_CLASS.industrial,
      level: BUILDER.maxLevel,
      profile: profileOf(['factory']),
      coastal: false,
    };
    const prospect = bestProspectOf(query);

    expect(prospect).not.toBeNull();
    expect(prospect!.gaps.length).toBeGreaterThan(0);
    // Non raggiunta davvero, e piu' specifica di quella che il luogo ottiene.
    expect(typologyAccepts(prospect!.definition, query)).toBe(false);
    expect(prospect!.definition.priority).toBeGreaterThan(selectTypology(query).priority);
  });

  it('non propone cio che dipende dal ruolo del lotto', () => {
    // L'angolo non e' un gesto: nominarlo manderebbe a cercare qualcosa che il
    // giocatore non decide.
    for (const use of ALL_CLASSES) {
      const prospect = bestProspectOf({
        use,
        level: BUILDER.maxLevel,
        profile: profileOf(['market', 'transport']),
        coastal: true,
      });
      expect(prospect?.definition.lotRole).toBeUndefined();
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
