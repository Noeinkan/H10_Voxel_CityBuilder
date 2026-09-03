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
    influence: null,
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

/** Le barre di una sezione, appiattite come le righe: «etichetta: valore». */
function metersOf(model: ReturnType<typeof buildSelectionPanelModel>, id: string): readonly string[] {
  const section = model.sections.find((entry) => entry.id === id);
  return section === undefined ? [] : section.meters.map((entry) => `${entry.label}: ${entry.value}`);
}

/** I `hint` delle barre: la prosa che prima era il valore della riga. */
function hintsOf(model: ReturnType<typeof buildSelectionPanelModel>, id: string): string {
  const section = model.sections.find((entry) => entry.id === id);
  return section === undefined ? '' : section.meters.map((entry) => entry.hint).join(' | ');
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
    const rows = rowsOf(model, 'structure');
    // Lo stadio massimo lo decide la ricetta e non questo file: scriverlo qui
    // renderebbe rosso il test alla prima parte aggiunta a un molo, senza che
    // niente si sia rotto.
    expect(rows.some((row) => /^Stage: stage 2 of \d+$/.test(row))).toBe(true);
    expect(rows.join(' ')).not.toContain('Level:');
    expect(rows).toContain('Reach: radius 60 · follows streets and terrain');
    expect(rows).toContain('Influence: Commerce +144 · Industry +206');
    expect(rows.some((row) => row.startsWith('Favours:'))).toBe(true);
    expect(rows.some((row) => row.startsWith('Penalises:'))).toBe(true);
    expect(rows.join(' ')).not.toContain('Use:');
  });

  it('un landmark dice cosa produce prima di quanto copre', () => {
    // La portata e la forza dicono *dove* agisce un catalizzatore; il mestiere —
    // aprire il commercio, attirare negozi — e' la domanda di chi lo clicca, e
    // sta nel sommario perche' e' la prima cosa che si legge sotto il nome.
    const model = buildSelectionPanelModel(selection(structure({ landmark: 'port', level: 2 })));

    expect(sectionOf(model, 'structure').summary).toContain('external trade');
    expect(rowsOf(model, 'structure')).toContain(
      'District: density +30 · wealth +60 · accessibility +135 · satisfaction -20 · industry +85',
    );
  });

  it('l\'influenza di un landmark legge i valori pesati quando la simulazione li porta', () => {
    // Quando `influence` c'e', la riga la legge e non la ricalcola: il peso di
    // policy sta dentro quei numeri, e ricalcolare dal ruolo direbbe un vettore
    // che il campo non applica davvero.
    const model = buildSelectionPanelModel(selection(structure(
      { landmark: 'port', level: 2 },
      { influence: [0, 150, 200, 0] },
    )));

    expect(rowsOf(model, 'structure')).toContain('Influence: Commerce +150 · Industry +200');
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

    expect(sectionOf(model, 'block').title).toBe('Block 2,3');
    expect(metersOf(model, 'block')).toContain('Housing: 72 residents');
    expect(metersOf(model, 'block')).toContain('Commerce: 24 customers a tick');
  });

  it('la composizione di un isolato e\' una barra sola divisa per uso', () => {
    // Le quote stanno sul totale e non sul massimo: e' una composizione, e i
    // segmenti si affiancano dentro la stessa barra.
    const model = buildSelectionPanelModel(selection(structure()));
    const mix = sectionOf(model, 'block').mix;

    expect(mix.map((part) => `${part.label} ${part.value}`)).toEqual(['Housing 3', 'Commerce 1']);
    expect(mix.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1, 9);
    expect(mix.map((part) => part.key)).toEqual(['residential', 'commercial']);
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
    const meters = metersOf(model, 'block');

    expect(meters).toContain('Materials: 1.3 of 2.5 a tick');
    expect(meters).toContain('Food: 6 of 12 a tick');
    expect(meters).toContain('Upkeep: 2 funds a tick');
    expect(meters).toContain('Workers: 50% staffed');
    expect(hintsOf(model, 'block')).toContain('workforce is spread thin');
  });

  it('un uso e\' una barra, e la prosa che la commentava vive nel suo suggerimento', () => {
    // Tre fatti che si restringono, e nessuno dei tre e' di questo edificio: la
    // scheda descrive un edificio *come* questo, non questo. La barra risponde
    // prima della parola; la parola resta per chi la vuole.
    const model = buildSelectionPanelModel(selection(structure({}, { uses: [use()] })));

    expect(metersOf(model, 'structure')).toContain('Homes: 82% occupied');
    expect(hintsOf(model, 'structure')).toContain('Room for 24 residents · one of 37 in the city');
    expect(hintsOf(model, 'structure')).toContain('18% of homes in the city stand empty');
  });

  it('ogni uso dichiara cio\' che gli manca per rendere al pieno', () => {
    // L'ingresso, non il rendimento: una casa vuole residenti, una fabbrica
    // braccia, un servizio fondi. La cifra e' della citta', come il resto.
    const factory = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.industrial },
      { uses: [use({ cls: BUILDING_CLASS.industrial, cityUse: null, staffing: 0.5 })] },
    )));
    expect(metersOf(factory, 'structure')).toContain('Workers: 50% staffed');
    expect(hintsOf(factory, 'structure')).toContain('sharing too few workers citywide');

    const shop = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.commercial },
      { uses: [use({ cls: BUILDING_CLASS.commercial, cityUse: 0.74, staffing: 1 })] },
    )));
    expect(metersOf(shop, 'structure')).toEqual(['Shops: 74% busy', 'Workers: 100% staffed']);
    expect(hintsOf(shop, 'structure')).toContain('26% of shops in the city stand idle');

    const civic = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.civic },
      { uses: [use({ cls: BUILDING_CLASS.civic, cityUse: null })] },
    )));
    // Un servizio non pesca dall'organico: nessuna barra dell'organico accanto.
    expect(metersOf(civic, 'structure')).toEqual(['Upkeep: 24 funds a tick']);
    expect(hintsOf(civic, 'structure')).toContain('Paid from the treasury each tick');
  });

  it('una casa piena non chiede piu\' residenti, e una strapiena lo dice', () => {
    const full = buildSelectionPanelModel(selection(structure({}, { uses: [use({ cityUse: 1 })] })));
    expect(hintsOf(full, 'structure')).toContain('Every home in the city is occupied');

    // Oltre il pieno non e' un successo: sono residenti senza una casa, ed e' la
    // penalita' di sovraffollamento che la soddisfazione applica davvero.
    const crowded = buildSelectionPanelModel(selection(structure({}, { uses: [use({ cityUse: 1.12 })] })));
    expect(sectionOf(crowded, 'structure').meters[0]?.tone).toBe('bad');
    expect(hintsOf(crowded, 'structure')).toContain('12% more residents than the city has homes for');
  });

  it('senza un dato non si inventa una percentuale', () => {
    // L'industria non ha una quota d'uso che il tick conservi: la barra segue
    // l'organico, che e' il numero vero, invece di riempirsi di uno plausibile.
    const model = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.industrial },
      { uses: [use({ cls: BUILDING_CLASS.industrial, perBuilding: 2.5, count: 9, cityUse: null })] },
    )));

    expect(metersOf(model, 'structure')).toContain('Workshops: 2.5 materials a tick');
    expect(hintsOf(model, 'structure')).toContain('one of 9 in the city');
    expect(hintsOf(model, 'structure')).not.toContain('%');
  });

  it('dice che crescere non cambia il rendimento, accanto al livello che lo chiede', () => {
    // «Level 6 of 6» sopra un rendimento fisso si legge come una contraddizione.
    // Non lo e': il tick conta edifici, non piani.
    const model = buildSelectionPanelModel(selection(structure({ level: 6 }, { uses: [use()] })));
    const rows = rowsOf(model, 'structure');

    expect(rows).toContain('Level: 6 · the highest this place allows');
    expect(rows.join(' ')).toContain('counts buildings, not floors');
    // Fra i dettagli e non fra le barre: e' una regola del bilancio, non una
    // quantita' da sorvegliare.
    expect(metersOf(model, 'structure').join(' ')).not.toContain('counts buildings');
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
    expect(metersOf(model, 'structure'))
      .toEqual(['Shops: 74% busy', 'Homes: 82% occupied', 'Workers: 50% staffed']);
    expect(hintsOf(model, 'structure')).toContain('Serves 24 customers a tick · one of 14 in the city');
    expect(hintsOf(model, 'structure')).toContain('Room for 12 residents · one of 37 in the city');
  });

  it('un landmark non porta nessun rendimento, perche\' il tick non l\'ha mai contato', () => {
    const model = buildSelectionPanelModel(selection(structure({ landmark: 'port', level: 2 })));

    expect(sectionOf(model, 'structure').meters).toEqual([]);
    expect(rowsOf(model, 'structure').join(' ')).not.toContain('room for');
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

    const model = buildSelectionPanelModel(empty);
    expect(actionOf(model, 'block')).toBe('isolate-block');
    // Niente barre e niente composizione: il vuoto e' un fatto, e una barra a
    // zero insegnerebbe a guardare dove non c'e' niente da guardare.
    expect(sectionOf(model, 'block').meters).toEqual([]);
    expect(sectionOf(model, 'block').mix).toEqual([]);
    expect(sectionOf(model, 'block').summary).toBe('Nothing has grown here yet.');
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

describe('il verdetto, la barra e il consiglio', () => {
  function partsOf(model: ReturnType<typeof buildSelectionPanelModel>): readonly string[] {
    const breakdown = model.breakdown;
    if (breakdown === null) throw new Error('barra composta attesa');
    return breakdown.parts.map((part) => `${part.label}: ${part.value}`);
  }

  it('un edificio legge soglia e cassa dalla stessa macchina del driver', () => {
    const model = buildSelectionPanelModel(selection(structure(
      { class: BUILDING_CLASS.industrial },
      {
        growth: {
          nextLevel: 4,
          desirability: 78,
          threshold: 96,
          baseThreshold: 96,
          discount: 0,
          sources: [],
          congestion: 0,
          cost: 72,
          stock: 12,
        },
      },
    )));

    expect(model.verdict.tone).toBe('watch');
    expect(model.verdict.headline).toBe('Needs desirability');
    expect(model.verdict.detail).toBe('78 of the 96 that level 4 asks for Industry.');
    expect(model.breakdown).toMatchObject({ label: 'Desirability', value: 78, target: 96, met: false });
    // La desiderabilita' viene prima della cassa perche' viene prima nel driver:
    // dire «mancano materiali» a un edificio che non promuoverebbe comunque
    // manderebbe il giocatore a risolvere il problema sbagliato.
    expect(model.verdict.detail).not.toContain('materials');
  });

  it('con la soglia raggiunta e la cassa vuota, il verdetto passa ai materiali', () => {
    const model = buildSelectionPanelModel(selection(structure(
      {},
      {
        growth: {
          nextLevel: 4,
          desirability: 130,
          threshold: 96,
          baseThreshold: 96,
          discount: 0,
          sources: [],
          congestion: 0,
          cost: 72,
          stock: 12,
        },
      },
    )));

    expect(model.verdict.headline).toBe('Waiting on materials');
    expect(model.verdict.detail).toBe('Level 4 costs 72 materials, and the city holds 12.');
    expect(model.advice).toBeNull();
  });

  it('una soglia gia\' raggiunta si legge come raggiunta, e senza costo niente cassa', () => {
    const model = buildSelectionPanelModel(selection(structure(
      {},
      {
        growth: {
          nextLevel: 4,
          desirability: 130,
          threshold: 96,
          baseThreshold: 96,
          discount: 0,
          sources: [],
          congestion: 0,
          cost: 0,
          stock: 50,
        },
      },
    )));

    expect(model.verdict.tone).toBe('good');
    expect(model.verdict.headline).toBe('Ready to grow');
    expect(model.breakdown).toMatchObject({ value: 130, target: 96, met: true, parts: [] });
  });

  it('sotto soglia la barra scompone la desiderabilita\' nelle sue fonti', () => {
    // «78 of 96» senza la provenienza non dice niente da fare: le righe
    // aggiuntive sono la risposta, con i segni che il campo applica davvero.
    const model = buildSelectionPanelModel(selection(structure(
      {},
      {
        growth: {
          nextLevel: 4,
          desirability: 78,
          threshold: 96,
          baseThreshold: 120,
          discount: 24,
          sources: [
            { label: 'Market', x: 96, y: 84, contribution: 52 },
            { label: 'Factory', x: 100, y: 92, contribution: 21 },
            { label: 'Airport', x: 50, y: 50, contribution: -9 },
          ],
          congestion: 24,
          cost: 72,
          stock: 12,
        },
      },
    )));

    expect(model.verdict.detail)
      .toBe('78 of the 96 that level 4 asks for Housing (base 120, local qualities -24).');
    expect(partsOf(model)).toEqual([
      'Market (96, 84): 52',
      'Factory (100, 92): 21',
      'Airport (50, 50): -9',
      '3 buildings nearby: -24',
    ]);
    // Le quote stanno sul massimo assoluto e non sul totale: con una voce
    // negativa il totale sarebbe piu' piccolo della sua parte piu' grande, e la
    // barra piu' lunga uscirebbe dal blocco.
    expect(model.breakdown!.parts[0]?.share).toBe(1);
    expect(model.breakdown!.parts[3]?.negative).toBe(true);
  });

  it('il consiglio nomina i ruoli che alzerebbero l\'uso in difetto', () => {
    // La domanda che la scheda non sapeva rispondere: diceva quanto mancava e da
    // chi veniva cio' che c'era, e li' si fermava.
    const model = buildSelectionPanelModel(selection(structure(
      {},
      {
        growth: {
          nextLevel: 4,
          desirability: 78,
          threshold: 96,
          baseThreshold: 96,
          discount: 0,
          sources: [{ label: 'Market', x: 96, y: 84, contribution: 78 }],
          congestion: 0,
          cost: 0,
          stock: 0,
        },
      },
    )));

    const advice = model.advice;
    expect(advice).not.toBeNull();
    expect(advice!.label).toBe('Housing');
    expect(advice!.missing).toBe(18);
    expect(advice!.options.length).toBeLessThanOrEqual(3);
    expect(advice!.options.every((option) => option.gain > 0)).toBe(true);
    // Il ruolo che sta gia' in portata resta nell'elenco ma si dichiara: e' il
    // nome che il giocatore ha appena letto fra le fonti, due righe piu' su.
    const market = advice!.options.find((option) => option.id === 'market');
    if (market !== undefined) expect(market.present).toBe(true);
  });

  it('una soglia senza sconto non racconta la sua storia, e i pezzi restano per chi la manca', () => {
    // Sotto soglia ma senza `discount` la parentesi sparisce: «base 96, local
    // qualities -0» e' rumore. Sopra soglia le fonti non compaiono: la domanda
    // «cosa manca» e' gia' chiusa.
    const below = buildSelectionPanelModel(selection(structure(
      {},
      {
        growth: {
          nextLevel: 3,
          desirability: 40,
          threshold: 96,
          baseThreshold: 96,
          discount: 0,
          sources: [{ label: 'Market', x: 96, y: 84, contribution: 40 }],
          congestion: 0,
          cost: 0,
          stock: 0,
        },
      },
    )));
    expect(below.verdict.detail).toBe('40 of the 96 that level 3 asks for Housing.');
    expect(partsOf(below)).toEqual(['Market (96, 84): 40']);

    const met = buildSelectionPanelModel(selection(structure(
      {},
      {
        growth: {
          nextLevel: 3,
          desirability: 130,
          threshold: 96,
          baseThreshold: 96,
          discount: 0,
          sources: [{ label: 'Market', x: 96, y: 84, contribution: 40 }],
          congestion: 0,
          cost: 0,
          stock: 0,
        },
      },
    )));
    expect(met.verdict.headline).toBe('Ready to grow');
    expect(met.breakdown!.parts).toEqual([]);
  });

  it('un edificio al tetto del luogo lo dice, e cosi\' chi regge qualcosa', () => {
    const capped = buildSelectionPanelModel(selection(structure({}, { growth: null })));
    expect(capped.verdict).toMatchObject({
      tone: 'good',
      headline: 'Fully grown',
      detail: 'At the highest level this place allows.',
    });

    // Chi regge non promuove **anche se** avrebbe soglia e materiali: la
    // portanza si chiede prima, o la scheda prometterebbe una crescita che non
    // arrivera'.
    const carrying = buildSelectionPanelModel(selection(structure({}, { growth: null, carries: true })));
    expect(carrying.verdict).toMatchObject({ tone: 'bad', headline: 'Cannot grow' });
    expect(carrying.verdict.detail).toContain('holds up elevated parts');
  });

  it('un landmark dice quanti edifici mancano allo stadio successivo', () => {
    // Gli stessi numeri del driver: stadio, massimo, vicini e soglia — e nessun
    // consiglio, perche' cio' che gli manca sono edifici, e gli edifici non si
    // piazzano.
    const model = buildSelectionPanelModel(selection(structure(
      { landmark: 'port', level: 2 },
      { landmark: { stage: 2, maxStage: 4, nearby: 14, nextAt: 16 } },
    )));

    expect(model.verdict.headline).toBe('Stage 2 of 4');
    expect(model.verdict.detail).toBe('The next stage needs 16 buildings within reach, and buys 8 more strength.');
    expect(model.breakdown).toMatchObject({
      label: 'Buildings within reach',
      value: 14,
      target: 16,
      met: false,
    });
    expect(model.advice).toBeNull();
  });

  it('un landmark arrivato in cima non ha piu\' una barra', () => {
    const model = buildSelectionPanelModel(selection(structure(
      { landmark: 'port', level: 4 },
      { landmark: { stage: 4, maxStage: 4, nearby: 40, nextAt: null } },
    )));

    expect(model.verdict).toMatchObject({ tone: 'plain', headline: 'Port · full stage' });
    expect(model.breakdown).toBeNull();
  });

  it('un terreno nudo nomina gli usi che superano la propria soglia di sito', () => {
    // Desiderabilita' [180, 90, 20, 40] contro le soglie [40, 34, 30, 25]:
    // l'industria non le passa e non compare, come in `nextBuildSites`.
    const model = buildSelectionPanelModel(selection(null));

    expect(model.verdict).toMatchObject({ tone: 'good', headline: 'Ready to build' });
    expect(model.verdict.detail).toBe('Housing, Commerce, Civic would take root here as the city reaches it.');
    expect(model.advice).toBeNull();
  });

  it('le quattro barre della colonna dicono chi supera la propria soglia', () => {
    // Sostituiscono la riga `Demand`, l'unica della scheda che pretendeva di
    // conoscere a memoria quattro soglie diverse per essere letta.
    const model = buildSelectionPanelModel(selection(null));

    expect(metersOf(model, 'column'))
      .toEqual(['Housing: 180 / 40', 'Commerce: 90 / 34', 'Industry: 20 / 30', 'Civic: 40 / 25']);
    expect(sectionOf(model, 'column').meters.map((entry) => entry.tone))
      .toEqual(['good', 'good', 'watch', 'good']);
    // I numeri esatti restano fra i dettagli, per chi confronta due colonne.
    expect(rowsOf(model, 'column')).toContain('Demand: Housing 180 · Commerce 90 · Industry 20 · Civic 40');
  });

  it('dove nessun uso arriva, il consiglio nomina i ruoli da piazzare', () => {
    const picked = selection(null);
    const quiet = buildSelectionPanelModel({
      ...picked,
      column: { ...picked.column, desirability: [10, 10, 10, 10] },
    });
    // Il consiglio si calcola sull'uso che manca **di meno**: e' l'unico che un
    // catalizzatore solo puo' davvero portare sopra soglia.
    expect(quiet.verdict.headline).toBe('No use wants this yet');
    expect(quiet.verdict.detail).toBe('Civic is the closest, and still 15 short.');
    expect(quiet.advice!.label).toBe('Civic');
    expect(quiet.advice!.options.every((option) => option.gain > 0)).toBe(true);

    const lonely = buildSelectionPanelModel({
      ...picked,
      column: { ...picked.column, desirability: [10, 10, 10, 10], profile: { ...PROFILE, roles: [] } },
    });
    expect(lonely.verdict.detail).toBe('Nothing is within reach: desirability only comes from catalysts.');
  });

  it('un ruolo che il sito rifiuta non viene mai consigliato', () => {
    // Consigliare un porto all'interno e' peggio di non consigliare niente:
    // manderebbe il giocatore a spendere per un rifiuto.
    const picked = selection(null);
    const inland = buildSelectionPanelModel({
      ...picked,
      column: { ...picked.column, desirability: [10, 10, 10, 10], coastal: false },
    });

    const ids = inland.advice!.options.map((option) => option.id);
    expect(ids).not.toContain('port');
    expect(ids).not.toContain('marina');
    expect(ids).not.toContain('lighthouse');
  });

  it('un terreno non edificabile non promette niente', () => {
    const picked = selection(null);
    const refused = buildSelectionPanelModel({
      ...picked,
      column: { ...picked.column, buildable: false },
    });

    expect(refused.verdict).toMatchObject({ tone: 'bad', headline: 'Nothing can grow' });
    expect(refused.breakdown).toBeNull();
    expect(refused.advice).toBeNull();
  });

  it('campate e parti in quota non hanno una barra: non crescono', () => {
    const span = buildSelectionPanelModel(selection(structure({ span: SPAN_KIND.bridge })));
    expect(span.verdict).toMatchObject({ tone: 'plain', headline: 'Elevated link' });
    expect(span.breakdown).toBeNull();

    const aerial = buildSelectionPanelModel(selection(structure({ aerial: AERIAL_PART.terrace })));
    expect(aerial.verdict).toMatchObject({ tone: 'plain', headline: 'Elevated part' });
    expect(aerial.breakdown).toBeNull();
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
