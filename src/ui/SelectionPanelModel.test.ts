import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, type LocalUrbanProfile } from '../sim';
import { GROUND } from '../world/grading/grade';
import { STREET_ROLE } from '../world/streets/streetGrid';
import { TIER } from '../world/skyline/tiers';
import { SPAN_KIND } from '../world/spans/config';
import { AERIAL_PART } from '../world/aerial/config';
import { SURFACE_KIND, WATER_CLASS } from '../world/visualBlock';
import type { BuildingRecord } from '../world/buildings/BuildingRegistry';
import type { Selection, StructureInfo, UseInfo } from '../game/selection';
import {
  buildSelectionPanelModel,
  defaultSection,
  extentOf,
  SECTION_LABELS,
} from './SelectionPanelModel';

const PROFILE: LocalUrbanProfile = {
  district: 'harbor',
  density: 0.4,
  wealth: 0.3,
  accessibility: 0.5,
  satisfaction: 0.6,
  industry: 0.2,
  roles: ['port'],
  charters: [],
  uses: [0.4, 0.3, 0.2, 0.1],
  specialization: 'logistics',
};

function record(extra: Partial<BuildingRecord> = {}): BuildingRecord {
  return {
    id: 1,
    x: 20,
    y: 24,
    baseZ: 12,
    footprint: 4,
    height: 18,
    class: BUILDING_CLASS.residential,
    level: 3,
    seed: 7,
    ...extra,
  };
}

function structure(extra: Partial<BuildingRecord> = {}, info: Partial<StructureInfo> = {}): StructureInfo {
  return {
    record: record(extra),
    catalyst: null,
    carries: false,
    spans: [],
    decks: [],
    supports: [],
    uses: [],
    ...info,
  };
}

function use(extra: Partial<UseInfo> = {}): UseInfo {
  return {
    cls: BUILDING_CLASS.residential,
    secondary: false,
    perBuilding: 24,
    count: 37,
    cityUse: 0.82,
    staffing: 0.5,
    ...extra,
  };
}

function selection(structureInfo: StructureInfo | null, extra: Partial<Selection> = {}): Selection {
  return {
    voxel: {
      x: 21,
      y: 25,
      z: 29,
      palette: 4,
      surface: SURFACE_KIND.habitat,
      water: false,
      chunkKey: '0,0,0',
    },
    column: {
      x: 21,
      y: 25,
      height: 12,
      biome: 2,
      slope: 0.12,
      buildable: true,
      waterTop: 8,
      ground: GROUND.flat,
      buildWeight: 1,
      tier: TIER.middle,
      allowedLevel: 6,
      desirability: [180, 90, 20, 40],
      crowd: 3,
      stack: 1,
      profile: PROFILE,
      coastal: false,
    },
    structure: structureInfo,
    block: {
      key: '2,3',
      rect: { x0: 16, y0: 16, x1: 40, y1: 40 },
      role: STREET_ROLE.frontage,
      buildings: 4,
      byClass: [3, 1, 0, 0],
      landmarks: 1,
      structures: 2,
      maxLevel: 5,
      productivity: {
        housingCapacity: 72,
        commerceCapacity: 24,
        materialsCapacityPerTick: 0,
        materialsPerTick: 0,
        foodCapacityPerTick: 0,
        foodPerTick: 0,
        civicUpkeepPerTick: 0,
        staffing: 1,
      },
    },
    ...extra,
  };
}

function rowsOf(model: ReturnType<typeof buildSelectionPanelModel>, id: string): readonly string[] {
  const section = model.sections.find((entry) => entry.id === id);
  return section === undefined ? [] : section.rows.map((row) => `${row.label}: ${row.value}`);
}

function sectionOf(model: ReturnType<typeof buildSelectionPanelModel>, id: string) {
  const section = model.sections.find((entry) => entry.id === id);
  if (section === undefined) throw new Error(`sezione ${id} attesa`);
  return section;
}

function actionOf(model: ReturnType<typeof buildSelectionPanelModel>, id: string): string | null {
  return model.sections.find((entry) => entry.id === id)?.action?.id ?? null;
}

describe('buildSelectionPanelModel', () => {
  it('un landmark mostra lo stadio e mai un livello', () => {
    // `level` su un record di landmark **e'** lo stadio, e la stessa macchina lo
    // fa avanzare: chiamarlo livello direbbe che un molo compete in altezza con
    // le torri, che e' il contrario di cio' che i due numeri significano.
    const model = buildSelectionPanelModel(selection(structure({ landmark: 'port', level: 2 })));
    const section = sectionOf(model, 'structure');

    expect(model.title).toBe('Port');
    expect(section.title).toBe('Port');
    expect(section.summary).toContain('stage 2');
    expect(section.summary).not.toContain('level');
    const rows = rowsOf(model, 'structure');
    expect(rows).toContain('Reach: radius 60 · follows streets and terrain');
    expect(rows.some((row) => row.startsWith('Centre strength:'))).toBe(true);
    expect(rows.some((row) => row.startsWith('Favours:'))).toBe(true);
    expect(rows.some((row) => row.startsWith('Penalises:'))).toBe(true);
    expect(rows.join(' ')).not.toContain('Use:');
  });

  it('un landmark dice cosa produce, non solo quanto copre', () => {
    // La portata e la forza dicono *dove* agisce un catalizzatore; il mestiere —
    // aprire il commercio, attirare negozi — e' la domanda di chi lo clicca, e
    // prima non aveva risposta.
    const model = buildSelectionPanelModel(selection(structure({ landmark: 'port', level: 2 })));
    const rows = rowsOf(model, 'structure');

    expect(rows.some((row) => row.startsWith('Produces:'))).toBe(true);
    expect(rows.join(' ')).toContain('external trade');
    expect(rows).toContain(
      'District: density +30 · wealth +60 · accessibility +135 · satisfaction -20 · industry +85',
    );
  });

  it('una campata non mostra un uso urbano, benche\' il record ne porti uno', () => {
    // Il record porta `class` su tutti e quattro i tipi di cosa che il registry
    // sa tenere. Su un ponte quel campo non significa niente, e la simulazione
    // non l'ha mai contato fra gli edifici.
    const model = buildSelectionPanelModel(
      selection(structure({ span: SPAN_KIND.bridge, class: BUILDING_CLASS.residential })),
    );

    const section = sectionOf(model, 'structure');
    expect(section.title).toBe('Skybridge');
    expect(rowsOf(model, 'structure').join(' ')).not.toContain('Housing');
    expect(section.summary).toContain('takes no ground');
  });

  it('una mensola dice se il suolo lo prende o no', () => {
    const hanging = buildSelectionPanelModel(selection(structure({ aerial: AERIAL_PART.terrace })));
    const standing = buildSelectionPanelModel(selection(structure({ aerial: AERIAL_PART.pier })));

    expect(sectionOf(hanging, 'structure').summary).toContain('hangs above');
    expect(sectionOf(standing, 'structure').summary).toContain('stands on');
  });

  it('un edificio misto mostra i due usi nell\'ordine di contratto', () => {
    const model = buildSelectionPanelModel(selection(structure({
      class: BUILDING_CLASS.commercial,
      mixed: BUILDING_CLASS.residential,
    })));

    expect(sectionOf(model, 'structure').summary).toBe('Commerce over Housing · level 3.');
    // E una volta sola: l'intestazione lo dice, le righe no.
    expect(rowsOf(model, 'structure').join(' ')).not.toContain('Commerce over Housing');
  });

  it('il livello di un edificio sta accanto al tetto del luogo', () => {
    // Da solo «4» non e' una risposta. Accanto al tetto dice se questo edificio
    // ha ancora dove crescere, che e' la domanda di chi lo clicca.
    const growing = buildSelectionPanelModel(selection(structure({ level: 3 })));
    expect(rowsOf(growing, 'structure')).toContain('Level: 3 of 6 allowed here');

    const capped = buildSelectionPanelModel(selection(structure({ level: 6 })));
    expect(rowsOf(capped, 'structure')).toContain('Level: 6 · the highest this place allows');

    // Una campata non ha un livello da confrontare con niente.
    const span = buildSelectionPanelModel(selection(structure({ span: SPAN_KIND.bridge })));
    expect(rowsOf(span, 'structure').join(' ')).not.toContain('Level:');
  });

  it('il quartiere del record e quello di adesso restano due righe distinte', () => {
    // Il record congela il distretto per poter rigenerare la propria sagoma; il
    // profilo della colonna dice quello di oggi. Confonderli e' un bug, e il
    // valore della scheda sta proprio nel poterli confrontare.
    const model = buildSelectionPanelModel(selection(structure({
      district: 'industrial',
      specialization: null,
    })));

    expect(rowsOf(model, 'structure')).toContain('District when built: industrial');
    expect(rowsOf(model, 'column')).toContain('District now: harbor · logistics');
  });

  it('dice che chi regge non cresce, invece di lasciare l\'altezza ferma senza spiegazione', () => {
    const model = buildSelectionPanelModel(selection(structure({}, {
      carries: true,
      decks: [record({ id: 9, aerial: AERIAL_PART.terrace })],
    })));

    expect(rowsOf(model, 'structure').join(' ')).toContain('cannot grow');
  });

  it('una colonna d\'acqua legge la classe dello specchio, non un tipo di superficie', () => {
    // Sull'acqua i tre bit alti smettono di dire come e' fatta una facciata: e'
    // il sovraccarico dichiarato nel contratto 5, e leggerli come superficie
    // direbbe che il mare aperto e' «plain».
    const model = buildSelectionPanelModel(selection(null, {
      voxel: {
        x: 21,
        y: 25,
        z: 8,
        palette: 7,
        surface: WATER_CLASS.canal,
        water: true,
        chunkKey: '0,0,0',
      },
    }));

    expect(rowsOf(model, 'voxel')).toContain('Water: canal');
    expect(rowsOf(model, 'voxel').join(' ')).not.toContain('Surface:');
  });

  it('senza struttura il pannello ha tre sezioni e parla della colonna', () => {
    const model = buildSelectionPanelModel(selection(null));

    expect(model.sections.map((section) => section.id)).toEqual(['block', 'column', 'voxel']);
    expect(model.title).toContain('Block');
  });

  it('la struttura apre la propria scheda, il terreno nudo resta sull\'isolato', () => {
    expect(defaultSection(selection(structure()))).toBe('structure');
    expect(defaultSection(selection(structure({ landmark: 'port' })))).toBe('structure');
    expect(defaultSection(selection(structure({ span: SPAN_KIND.bridge })))).toBe('structure');
    expect(defaultSection(selection(null))).toBe('block');
  });

  it('l\'isolato mostra le capacita\' e i flussi che gli appartengono', () => {
    const model = buildSelectionPanelModel(selection(structure()));
    const rows = rowsOf(model, 'block');

    expect(sectionOf(model, 'block').title).toBe('Block 2,3');
    expect(rows).toContain('Housing capacity: 72 residents');
    expect(rows).toContain('Commerce capacity: 24 customers a tick');
  });

  it('i flussi produttivi dichiarano l\'organico cittadino che li limita', () => {
    const picked = selection(structure());
    const model = buildSelectionPanelModel({
      ...picked,
      block: {
        ...picked.block,
        productivity: {
          housingCapacity: 0,
          commerceCapacity: 0,
          materialsCapacityPerTick: 2.5,
          materialsPerTick: 1.25,
          foodCapacityPerTick: 12,
          foodPerTick: 6,
          civicUpkeepPerTick: 2,
          staffing: 0.5,
        },
      },
    });
    const rows = rowsOf(model, 'block');

    expect(rows).toContain('Materials: 1.3 of 2.5 a tick');
    expect(rows).toContain('Food: 6 of 12 a tick');
    expect(rows).toContain('Civic upkeep: 2 funds a tick');
    expect(rows).toContain('Workforce: 50% staffed citywide');
  });

  it('un uso dice cosa rende il tipo, quanti ne ha la citta\' e quanto ne usa', () => {
    // Tre fatti che si restringono, e nessuno dei tre e' di questo edificio: la
    // scheda descrive un edificio *come* questo, non questo.
    const model = buildSelectionPanelModel(selection(structure({}, { uses: [use()] })));

    expect(rowsOf(model, 'structure'))
      .toContain('Housing: room for 24 residents · one of 37 · 82% used citywide');
  });

  it('ogni uso dichiara cio\' che gli manca per rendere al pieno', () => {
    // L'ingresso, non il rendimento: una casa vuole residenti, una fabbrica
    // braccia, un servizio fondi. La cifra e' della citta', come il resto.
    const homes = buildSelectionPanelModel(selection(structure({}, { uses: [use()] })));
    expect(rowsOf(homes, 'structure')).toContain('Needs: residents — 18% of homes in the city are empty');

    const factory = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.industrial },
      { uses: [use({ cls: BUILDING_CLASS.industrial, cityUse: null, staffing: 0.5 })] },
    )));
    expect(rowsOf(factory, 'structure')).toContain('Needs: workers — the city workforce is 50% staffed');

    const shop = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.commercial },
      { uses: [use({ cls: BUILDING_CLASS.commercial, cityUse: 0.74, staffing: 1 })] },
    )));
    expect(rowsOf(shop, 'structure'))
      .toContain('Needs: workers — the city workforce is fully staffed · 26% of shops in the city stand idle');

    const civic = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.civic },
      { uses: [use({ cls: BUILDING_CLASS.civic, cityUse: null })] },
    )));
    expect(rowsOf(civic, 'structure'))
      .toContain('Needs: funds — its upkeep is paid from the treasury each tick');
  });

  it('una casa piena non chiede piu\' residenti', () => {
    const model = buildSelectionPanelModel(selection(structure(
      {},
      { uses: [use({ cityUse: 1 })] },
    )));

    expect(rowsOf(model, 'structure'))
      .toContain('Needs: residents — every home in the city is occupied');
  });

  it('la percentuale e\' della citta\', e senza un dato non si inventa', () => {
    // L'industria non ha una quota d'uso che il tick conservi: la riga si ferma
    // dove finiscono i fatti invece di riempirsi di un numero plausibile.
    const model = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.industrial },
      { uses: [use({ cls: BUILDING_CLASS.industrial, perBuilding: 2.5, count: 9, cityUse: null })] },
    )));

    expect(rowsOf(model, 'structure')).toContain('Industry: yields 2.5 materials a tick · one of 9');
    expect(rowsOf(model, 'structure').join(' ')).not.toContain('citywide');
  });

  it('dice che crescere non cambia il rendimento, accanto al livello che lo chiede', () => {
    // «Level 6 of 6» sopra un rendimento fisso si legge come una contraddizione.
    // Non lo e': il tick conta edifici, non piani.
    const model = buildSelectionPanelModel(selection(structure({ level: 6 }, { uses: [use()] })));
    const rows = rowsOf(model, 'structure');

    expect(rows).toContain('Level: 6 · the highest this place allows');
    expect(rows.join(' ')).toContain('counts buildings, not floors');
    // E dove non c'e' un rendimento non c'e' niente da spiegare.
    const span = buildSelectionPanelModel(selection(structure({ span: SPAN_KIND.bridge })));
    expect(rowsOf(span, 'structure').join(' ')).not.toContain('counts buildings');
  });

  it('l\'uso ospitato di un misto si legge come una quota, non come un edificio', () => {
    const model = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.commercial, mixed: BUILDING_CLASS.residential },
      {
        uses: [
          use({ cls: BUILDING_CLASS.commercial, count: 14, cityUse: 0.74 }),
          use({ secondary: true, perBuilding: 12 }),
        ],
      },
    )));
    const rows = rowsOf(model, 'structure');

    expect(rows).toContain('Commerce: serves 24 customers a tick · one of 14 · 74% used citywide');
    expect(rows).toContain('Housing (hosted): room for 12 residents · one of 37 · 82% used citywide');
  });

  it('un landmark non porta nessun rendimento, perche\' il tick non l\'ha mai contato', () => {
    const model = buildSelectionPanelModel(selection(structure({ landmark: 'port', level: 2 })));

    expect(rowsOf(model, 'structure').join(' ')).not.toContain('room for');
    expect(rowsOf(model, 'structure').join(' ')).not.toContain('one of');
  });

  it('solo l\'isolato offre un gesto, e le altre sezioni nessuno', () => {
    // Un «isola questo edificio» sulla struttura sarebbe una promessa che la
    // geometria non mantiene: la vista ritaglia un rettangolo di isolato, che e'
    // l'unita' che la rete stradale sa delimitare.
    const model = buildSelectionPanelModel(selection(structure()));

    expect(actionOf(model, 'block')).toBe('isolate-block');
    expect(actionOf(model, 'structure')).toBeNull();
    expect(actionOf(model, 'column')).toBeNull();
    expect(actionOf(model, 'voxel')).toBeNull();
  });

  it('il gesto dell\'isolato e\' un interruttore, e guarda dalla parte giusta', () => {
    // Senza il ritorno il bottone sarebbe una porta a senso unico: la vista che
    // isola **taglia** la citta' attorno, quindi da dentro non resta niente da
    // cliccare per uscire.
    const picked = selection(structure());

    expect(actionOf(buildSelectionPanelModel(picked, '2,3'), 'block')).toBe('release-block');
    // Un altro isolato sotto studio non e' questo: il bottone resta l'andata.
    expect(actionOf(buildSelectionPanelModel(picked, '9,9'), 'block')).toBe('isolate-block');
    expect(actionOf(buildSelectionPanelModel(picked, null), 'block')).toBe('isolate-block');
  });

  it('anche un isolato vuoto si puo\' studiare', () => {
    // Li' la domanda «cosa ci sta» e' proprio quella che si fa chi lo trova
    // vuoto, e il terreno da solo e' gia' una risposta.
    const empty = selection(null, {
      block: {
        key: '5,5',
        rect: { x0: 0, y0: 0, x1: 8, y1: 8 },
        role: STREET_ROLE.interior,
        buildings: 0,
        byClass: [0, 0, 0, 0],
        landmarks: 0,
        structures: 0,
        maxLevel: 0,
        productivity: {
          housingCapacity: 0,
          commerceCapacity: 0,
          materialsCapacityPerTick: 0,
          materialsPerTick: 0,
          foodCapacityPerTick: 0,
          foodPerTick: 0,
          civicUpkeepPerTick: 0,
          staffing: 1,
        },
      },
    });

    expect(actionOf(buildSelectionPanelModel(empty), 'block')).toBe('isolate-block');
    expect(rowsOf(buildSelectionPanelModel(empty), 'block'))
      .toContain('Productivity: no active buildings');
  });
});

describe('SECTION_LABELS', () => {
  it('dichiara tutte e quattro le unita\' in inglese', () => {
    expect(SECTION_LABELS).toEqual({
      structure: 'Structure',
      block: 'Block',
      column: 'Column',
      voxel: 'Voxel',
    });
  });

  it('ogni etichetta e\' una sola parola, adatta a un\'intestazione', () => {
    for (const label of Object.values(SECTION_LABELS)) {
      expect(label).toMatch(/^[A-Z][a-z]+$/);
    }
  });
});

describe('la carta di cio\' che serve per crescere', () => {
  function cardRows(model: ReturnType<typeof buildSelectionPanelModel>): readonly string[] {
    const card = model.growth;
    if (card === null) throw new Error('carta di crescita attesa');
    return card.rows.map((row) => `${row.label}: ${row.value}`);
  }

  it('un edificio legge soglia e cassa dalla stessa macchina del driver', () => {
    const model = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.industrial },
      { growth: { nextLevel: 4, desirability: 78, threshold: 96, cost: 72, stock: 12 } },
    )));

    expect(model.growth).not.toBeNull();
    expect(model.growth!.title).toBe('To grow');
    expect(model.growth!.summary).toBe('What this building needs to reach level 4.');
    expect(cardRows(model)).toEqual([
      'Desirability: 78 of the 96 it needs for Industry',
      'Materials: 12 in stock · 72 needed for the upgrade',
    ]);
  });

  it('una soglia gia\' raggiunta si legge come raggiunta, e senza costo niente cassa', () => {
    const model = buildSelectionPanelModel(selection(structure(
      {},
      { growth: { nextLevel: 4, desirability: 130, threshold: 96, cost: 0, stock: 50 } },
    )));

    expect(cardRows(model)).toEqual(['Desirability: 130 · the 96 it needs is met']);
  });

  it('un edificio al tetto del luogo lo dice, e cosi\' chi regge qualcosa', () => {
    const capped = buildSelectionPanelModel(selection(structure({}, { growth: null })));
    expect(capped.growth!.summary).toBe('At the highest level this place allows.');

    const carrying = buildSelectionPanelModel(selection(structure({}, { growth: null, carries: true })));
    expect(carrying.growth!.summary).toContain('cannot grow');
  });

  it('un landmark dice quanti edifici mancano allo stadio successivo', () => {
    // Gli stessi numeri del driver: stadio, massimo, vicini e soglia. La riga
    // vive nella carta in cima, non piu' in fondo alla scheda della struttura.
    const model = buildSelectionPanelModel(selection(structure(
      { landmark: 'port', level: 2 },
      { landmark: { stage: 2, maxStage: 4, nearby: 14, nextAt: 16 } },
    )));

    expect(model.growth!.summary).toBe('The next stage needs 16 buildings within reach.');
    expect(cardRows(model)).toContain('Stage: 2/4 · 14/16 buildings nearby');
    expect(rowsOf(model, 'structure').join(' ')).not.toContain('Stage:');
  });

  it('un landmark arrivato in cima non ha piu\' una carta', () => {
    const model = buildSelectionPanelModel(selection(structure(
      { landmark: 'port', level: 4 },
      { landmark: { stage: 4, maxStage: 4, nearby: 40, nextAt: null } },
    )));

    expect(model.growth).toBeNull();
  });

  it('un terreno nudo elenca gli usi che superano la propria soglia di sito', () => {
    // Desiderabilita' [180, 90, 20, 40] contro le soglie [40, 34, 30, 25]:
    // l'industria non le passa e non compare, come in `nextBuildSites`.
    const model = buildSelectionPanelModel(selection(null));

    expect(cardRows(model)).toEqual([
      'Housing: 180 · passes the 40 site threshold',
      'Commerce: 90 · passes the 34 site threshold',
      'Civic: 40 · passes the 25 site threshold',
    ]);
  });

  it('dove nessun uso arriva, la carta nomina il gesto che manca', () => {
    const picked = selection(null);
    const quiet = buildSelectionPanelModel({
      ...picked,
      column: { ...picked.column, desirability: [10, 10, 10, 10] },
    });
    expect(cardRows(quiet)).toEqual([
      'First building: desirability below every site threshold — a landmark nearby would raise it',
    ]);

    const lonely = buildSelectionPanelModel({
      ...picked,
      column: { ...picked.column, desirability: [10, 10, 10, 10], profile: { ...PROFILE, roles: [] } },
    });
    expect(cardRows(lonely)).toEqual([
      'First building: needs a landmark within reach — desirability comes from catalysts',
    ]);
  });

  it('un terreno non edificabile non promette niente', () => {
    const picked = selection(null);
    const refused = buildSelectionPanelModel({
      ...picked,
      column: { ...picked.column, buildable: false },
    });

    expect(refused.growth!.summary).toBe('Nothing can grow on this column.');
    expect(cardRows(refused)).toEqual(['Ground: not buildable']);
  });

  it('campate e parti in quota non hanno una carta: non crescono', () => {
    const span = buildSelectionPanelModel(selection(structure({ span: SPAN_KIND.bridge })));
    expect(span.growth).toBeNull();

    const aerial = buildSelectionPanelModel(selection(structure({ aerial: AERIAL_PART.terrace })));
    expect(aerial.growth).toBeNull();
  });
});

describe('extentOf', () => {
  it('ogni sezione evidenzia la propria unita\'', () => {
    const picked = selection(structure());

    expect(extentOf(picked, 'structure')).toEqual({ x0: 20, y0: 24, x1: 23, y1: 27, z0: 12, z: 30 });
    // Isolato e colonna sono piatti: `z0 === z`, quindi niente coperchio.
    expect(extentOf(picked, 'block')).toEqual({ x0: 16, y0: 16, x1: 40, y1: 40, z0: 12, z: 12 });
    expect(extentOf(picked, 'column')).toEqual({ x0: 21, y0: 25, x1: 21, y1: 25, z0: 12, z: 12 });
    // Il voxel e' alto **un** voxel, e non da terra fino a li'.
    expect(extentOf(picked, 'voxel')).toEqual({ x0: 21, y0: 25, x1: 21, y1: 25, z0: 29, z: 30 });
  });

  it('una mensola parte da dove comincia lei, non da terra', () => {
    // Un contorno che salisse dal suolo direbbe che la colonna e' occupata per
    // tutta la sua altezza — il contrario dell'invariante della citta' in quota.
    const deck = selection(structure({ aerial: AERIAL_PART.terrace, baseZ: 34, height: 2 }));
    expect(extentOf(deck, 'structure')).toMatchObject({ z0: 34, z: 36 });
  });

  it('un\'impronta rettangolare non viene schiacciata in un quadrato', () => {
    // I landmark sono lineari per natura — un molo, una pista, un viadotto — e
    // `footprintY` esiste per loro: un contorno quadrato ne mostrerebbe un
    // moncone.
    const picked = selection(structure({ landmark: 'port', footprint: 3, footprintY: 9 }));
    expect(extentOf(picked, 'structure'))
      .toEqual({ x0: 20, y0: 24, x1: 22, y1: 32, z0: 12, z: 30 });
  });
});
