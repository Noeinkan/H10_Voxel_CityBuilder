import {
  ALL_CLASSES,
  BALANCE,
  BUILDING_CLASS,
  CLASS_LABELS,
  catalystById,
  type BuildingClass,
  type CatalystDefinition,
  type CatalystEffects,
} from '../sim';
import { PALETTE_SLOT_NAMES } from '../engine/paletteSlots';
import { SURFACE_KIND_NAMES, WATER_CLASS, type SurfaceKind } from '../world/visualBlock';
import { BIOME_NAMES } from '../world/terrain/config';
import { GROUND, type GroundKind } from '../world/grading/grade';
import { STREET_ROLE, type StreetRole } from '../world/streets/streetGrid';
import { TIER, type SkylineTier } from '../world/skyline/tiers';
import { AERIAL_PART, takesGround, type AerialPart } from '../world/aerial/config';
import { SPAN_KIND, type SpanKind } from '../world/spans/config';
import { landmarkOf, maxStageOf } from '../world/landmarks/config';
import { typologyOf } from '../world/buildings/recordStamp';
import { footprintDepth, type BuildingRecord } from '../world/buildings/BuildingRegistry';
import { prospectRows } from './prospects';
import type {
  BlockInfo,
  ColumnInfo,
  Selection,
  StructureInfo,
  UseInfo,
  VoxelInfo,
} from '../game/selection';

/**
 * La scheda di selezione dal lato del giocatore: quattro sezioni di righe, e il
 * gesto che ognuna offre.
 *
 * Puro e testabile in `node` come `GameHudModel`, e per la stessa ragione: qui
 * vive **cosa** si legge e cosa si puo' fare, e sbagliarlo si vede solo
 * leggendolo. Il DOM che lo disegna sta accanto e non ha bisogno di prove.
 *
 * La regola che questo file esiste per tenere in piedi e' una sola, ed e' la
 * fonte di tutti i suoi rami: **un record non e' sempre un edificio**. Il
 * registry usa la stessa struttura per un condominio, un molo, una passerella e
 * una mensola, e il campo `class` c'e' su tutti e quattro anche dove non
 * significa niente. Scrivere «Housing» su un viadotto sarebbe gia' brutto; peggio
 * e' che landmark, campate e parti in quota **non entrano** nei conteggi del
 * registry, quindi chiamarli edifici direbbe un numero che l'HUD non conferma.
 */

export type SelectionSectionId = 'structure' | 'block' | 'column' | 'voxel';

/**
 * Etichetta corta da intestazione di sezione: l'intestazione intera («grassland
 * at 21, 25») non sta su un'etichetta, e le quattro unita' hanno nomi che sono
 * gia' il loro significato. Vive nel modello perche' e' copia visibile, e va
 * provata in inglese come il resto.
 */
export const SECTION_LABELS: Readonly<Record<SelectionSectionId, string>> = {
  structure: 'Structure',
  block: 'Block',
  column: 'Column',
  voxel: 'Voxel',
};

export interface SelectionRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Un gesto che una sezione offre, oltre a farsi leggere.
 *
 * Sta nel modello e non nel DOM per la stessa ragione delle righe: **quali**
 * gesti una selezione permetta e' una decisione, e cambia con cosa si e' scelto;
 * disegnare un bottone non lo e'. Il pannello riceve un'azione o `null` e non sa
 * cosa faccia — il cablaggio verso la vista sta in `main.ts`, che e' l'unico
 * strato che conosce sia l'HUD sia l'engine.
 *
 * Uno solo per sezione, e non e' una limitazione provvisoria: una scheda che si
 * riempie di bottoni smette di essere una scheda. Se un secondo gesto servisse
 * davvero, la domanda giusta sarebbe se non sia una sezione a parte.
 */
export type SelectionActionId = 'isolate-block' | 'release-block';

export interface SelectionAction {
  readonly id: SelectionActionId;
  readonly label: string;
  /** Cosa succede premendolo. Il verbo dell'etichetta da solo non lo dice. */
  readonly hint: string;
}

export interface SelectionSection {
  readonly id: SelectionSectionId;
  readonly title: string;
  /** Una riga sola che dice cos'e' questa cosa, prima delle misure. */
  readonly summary: string;
  readonly rows: readonly SelectionRow[];
  /** Il gesto che questa sezione offre, `null` dove non ce n'e' uno. */
  readonly action: SelectionAction | null;
}

export interface SelectionPanelModel {
  /** Il soggetto piu' specifico che esiste qui: e' l'intestazione del pannello. */
  readonly title: string;
  readonly summary: string;
  /**
   * Cio' che serve perche' qui cresca qualcosa, sempre in cima al pannello.
   *
   * `null` dove non c'e' niente di vero da dire: una campata non cresce, e una
   * carta vuota insegnerebbe a saltarla. E' la stessa scelta di `cityUse: null`
   * in `selection.ts`, dove il vuoto e' un fatto invece di un numero plausibile.
   */
  readonly growth: GrowthCard | null;
  readonly sections: readonly SelectionSection[];
}

/**
 * La carta di cio' che manca per crescere.
 *
 * Non ha un'azione ne' un'estensione da evidenziare: e' una lettura, e sta
 * sopra le sezioni perche' risponde alla domanda che chi clicca si sta facendo
 * — «perche' non cresce di piu'?» — prima ancora di sapere cos'ha cliccato.
 */
export interface GrowthCard {
  readonly title: string;
  readonly summary: string;
  readonly rows: readonly SelectionRow[];
}

/** Il volume che l'evidenziazione in-world deve disegnare, in colonne e quote. */
export interface SelectionExtent {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /**
   * Quota da cui parte.
   *
   * Non e' sempre il terreno: una mensola comincia a trenta voxel dal suolo, e
   * un contorno che partisse da terra direbbe che quella colonna e' occupata
   * per tutta la sua altezza, cioe' il contrario dell'invariante che la citta'
   * in quota esiste per affermare.
   */
  readonly z0: number;
  /** Quota a cui finisce. Uguale a `z0` dove la cosa e' piatta. */
  readonly z: number;
}

const GROUND_LABELS: Readonly<Record<GroundKind, string>> = {
  [GROUND.flat]: 'flat ground',
  [GROUND.sloped]: 'terraced slope',
  [GROUND.shore]: 'quay',
  [GROUND.rock]: 'rock',
  [GROUND.refused]: 'unworkable',
};

const ROLE_LABELS: Readonly<Record<StreetRole, string>> = {
  [STREET_ROLE.arterial]: 'arterial road',
  [STREET_ROLE.minor]: 'minor road',
  [STREET_ROLE.frontage]: 'street frontage',
  [STREET_ROLE.interior]: 'block interior',
};

const TIER_LABELS: Readonly<Record<SkylineTier, string>> = {
  [TIER.fringe]: 'fringe',
  [TIER.middle]: 'middle',
  [TIER.core]: 'core',
};

const SPAN_LABELS: Readonly<Record<SpanKind, string>> = {
  [SPAN_KIND.bridge]: 'Skybridge',
  [SPAN_KIND.mezzanine]: 'Mezzanine',
  [SPAN_KIND.plaza]: 'Elevated plaza',
};

const AERIAL_LABELS: Readonly<Record<AerialPart, string>> = {
  [AERIAL_PART.terrace]: 'Terrace',
  [AERIAL_PART.walk]: 'Walkway',
  [AERIAL_PART.node]: 'Junction deck',
  [AERIAL_PART.pier]: 'Pier',
  [AERIAL_PART.lift]: 'Lift shaft',
};

/**
 * Le tre classi dello specchio d'acqua.
 *
 * Vivono qui e non accanto a `WATER_CLASS` perche' li' sono un sovraccarico dei
 * bit di superficie e non un'enumerazione con nomi propri: sull'acqua quei tre
 * bit smettono di dire come e' fatta una facciata e dicono che specchio e'.
 */
const WATER_LABELS: Readonly<Record<number, string>> = {
  [WATER_CLASS.open]: 'open water',
  [WATER_CLASS.shallow]: 'shallows',
  [WATER_CLASS.canal]: 'canal',
};

/**
 * Le due meta' del viaggio dentro un isolato, come bottone.
 *
 * Sono un interruttore e non due gesti diversi, ed e' il motivo per cui la
 * seconda esiste: la vista che isola **taglia** la citta' attorno, quindi da
 * dentro non c'e' piu' niente da cliccare per uscire. Senza il ritorno il
 * bottone sarebbe una porta a senso unico, cioe' il difetto che le viste avevano
 * prima che `Esc` le spegnesse.
 *
 * «Show the whole city again» e non «release»: si torna alla citta' intera, non
 * alla vista che velava tutto tranne l'isolato sotto il cursore. Mollare e
 * basta lascerebbe acceso un retino che il giocatore non ha mai chiesto — ci era
 * entrato da qui, non dal picker.
 */
const ISOLATE_BLOCK: SelectionAction = {
  id: 'isolate-block',
  label: 'Study this block on its own',
  hint: 'Cuts away the rest of the city and turns the camera around it.',
};

const RELEASE_BLOCK: SelectionAction = {
  id: 'release-block',
  label: 'Show the whole city again',
  hint: 'Puts the block back among the others and returns the camera where it was.',
};

/**
 * @param isolatedBlock chiave dell'isolato che la vista sta gia' studiando, se
 *   ce n'e' uno. Serve solo a sapere da che parte guarda l'interruttore: e' un
 *   fatto dell'engine, e il modello non ne conosce nessun altro.
 */
export function buildSelectionPanelModel(
  selection: Selection,
  isolatedBlock: string | null = null,
): SelectionPanelModel {
  const structure = selection.structure === null ? null : structureSection(selection);
  const sections: SelectionSection[] = [];
  if (structure !== null) sections.push(structure);
  sections.push(blockSection(selection.block, isolatedBlock), columnSection(selection.column));
  sections.push(voxelSection(selection.voxel));

  const leadId = defaultSection(selection);
  const lead = sections.find((section) => section.id === leadId)!;
  return { title: lead.title, summary: lead.summary, growth: growthCard(selection), sections };
}

/**
 * La struttura e' il soggetto piu' specifico che esiste nel punto scelto: la sua
 * scheda e il suo campo devono aprirsi al click, che sia un palazzo, un ponte o
 * una mensola. Solo dove non c'e' una struttura — terreno nudo, acqua — resta
 * l'isolato, l'unita' su cui il gioco sa offrire un gesto e un bilancio locale
 * completo.
 */
export function defaultSection(selection: Selection): SelectionSectionId {
  return selection.structure === null ? 'block' : 'structure';
}

/**
 * Cosa evidenziare, per sezione.
 *
 * E' cio' che rende davvero selezionabili tutte e quattro le unita' con un click
 * solo: la pila si risolve una volta, e aprire una sezione sposta il contorno
 * sull'unita' di cui si sta leggendo, invece di chiedere un gesto diverso per
 * ciascuna.
 */
export function extentOf(selection: Selection, section: SelectionSectionId): SelectionExtent {
  const { column, block, structure, voxel } = selection;

  if (section === 'block') {
    // Un isolato non ha una quota propria: resta il contorno a terra, e il
    // coperchio non si disegna perche' `z0` e `z` coincidono.
    const { x0, y0, x1, y1 } = block.rect;
    return { x0, y0, x1, y1, z0: column.height, z: column.height };
  }
  if (section === 'structure' && structure !== null) {
    const record = structure.record;
    return {
      x0: record.x,
      y0: record.y,
      x1: record.x + record.footprint - 1,
      y1: record.y + footprintDepth(record) - 1,
      z0: record.baseZ,
      z: record.baseZ + record.height,
    };
  }
  if (section === 'voxel') {
    // Alto **un** voxel, e non da terra fino a li': la sezione dice «questo
    // cubo», e un contorno che salisse dal suolo direbbe un'altra cosa.
    return { x0: voxel.x, y0: voxel.y, x1: voxel.x, y1: voxel.y, z0: voxel.z, z: voxel.z + 1 };
  }
  return { x0: column.x, y0: column.y, x1: column.x, y1: column.y, z0: column.height, z: column.height };
}

// --- Le quattro sezioni ------------------------------------------------------

function structureSection(selection: Selection): SelectionSection {
  const info = selection.structure!;
  const record = info.record;
  const head = structureHead(info);
  const rows: SelectionRow[] = [
    { label: 'Footprint', value: `${record.footprint} × ${footprintDepth(record)}` },
    { label: 'Height', value: `${record.height} voxels, from z ${record.baseZ}` },
    ...head.rows,
  ];

  if (isBuilding(record)) {
    // Il livello accanto al tetto **del luogo**: da solo direbbe «4», che non e'
    // una risposta; insieme dice se questo edificio ha ancora dove crescere, ed
    // e' la domanda che chi lo clicca si sta facendo.
    const cap = selection.column.allowedLevel;
    rows.push({
      label: 'Level',
      value: record.level >= cap
        ? `${record.level} · the highest this place allows`
        : `${record.level} of ${cap} allowed here`,
    });
  }

  // Subito **sotto** il livello, e non in fondo alla scheda. Le due righe si
  // leggono insieme o si contraddicono: «Level 6 of 6» accanto a «room for 24
  // residents» chiede da sola perche' quel palazzo sia cresciuto, e la riga che
  // risponde deve stare dove la domanda nasce.
  for (const use of info.uses) {
    rows.push(useRow(use));
    rows.push(needRow(use));
  }
  if (info.uses.length > 0) rows.push(GROWING_ROW);

  if (record.district !== undefined) {
    // «Al momento in cui e' nato», e non «adesso»: il record congela il
    // quartiere per poter rigenerare la propria sagoma, mentre il profilo della
    // colonna dice quello di oggi. Sono due numeri diversi apposta, e il valore
    // della scheda sta nel poterli confrontare — a patto di non spacciarli per
    // lo stesso.
    rows.push({ label: 'District when built', value: districtLabel(record) });
  }
  if (record.cluster !== undefined) rows.push({ label: 'Row', value: `part of row ${record.cluster}` });
  const held = holdings(info);
  if (held !== null) rows.push({ label: 'Carries', value: held });
  if (info.supports.length > 0) {
    rows.push({ label: 'Rests on', value: `${info.supports.length} structure${plural(info.supports.length)}` });
  }

  // Nessun gesto, e nemmeno un «isola questo edificio»: la vista che isola
  // ritaglia un **rettangolo di isolato**, che e' l'unita' che la rete stradale
  // sa delimitare. Un bottone che promettesse la sola torre mostrerebbe l'isolato
  // e basta, cioe' una promessa che la geometria non puo' mantenere.
  return { id: 'structure', title: head.title, summary: head.summary, rows, action: null };
}

function blockSection(block: BlockInfo, isolatedBlock: string | null): SelectionSection {
  const rows: SelectionRow[] = [
    { label: 'Extent', value: `${block.rect.x1 - block.rect.x0 + 1} × ${block.rect.y1 - block.rect.y0 + 1} columns` },
    { label: 'This column', value: ROLE_LABELS[block.role] },
    { label: 'Buildings', value: `${block.buildings}` },
  ];

  const mix = CLASS_LABELS
    .map((label, cls) => ({ label, count: block.byClass[cls] }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.label.toLowerCase()}`);
  if (mix.length > 0) rows.push({ label: 'Mix', value: mix.join(', ') });
  if (block.buildings > 0) rows.push({ label: 'Tallest', value: `level ${block.maxLevel}` });
  if (block.landmarks > 0) rows.push({ label: 'Landmarks', value: `${block.landmarks}` });
  if (block.structures > 0) {
    rows.push({ label: 'Elevated parts', value: `${block.structures}` });
  }
  rows.push(...productivityRows(block));

  return {
    id: 'block',
    title: `Block ${block.key}`,
    summary: block.buildings === 0 ? 'Nothing has grown here yet.' : 'The city block this column belongs to.',
    rows,
    // Anche su un isolato vuoto: li' la domanda «cosa ci sta» e' proprio quella
    // che si fa chi lo trova vuoto, e il terreno da solo e' gia' una risposta.
    action: isolatedBlock === block.key ? RELEASE_BLOCK : ISOLATE_BLOCK,
  };
}

/**
 * Il bilancio attribuibile a questo isolato, senza spacciare per locale cio' che
 * resta cittadino: l'organico e' percio' dichiarato esplicitamente citywide.
 */
function productivityRows(block: BlockInfo): readonly SelectionRow[] {
  const { productivity } = block;
  const rows: SelectionRow[] = [];
  if (productivity.housingCapacity > 0) {
    rows.push({ label: 'Housing capacity', value: `${amount(productivity.housingCapacity)} residents` });
  }
  if (productivity.commerceCapacity > 0) {
    rows.push({
      label: 'Commerce capacity',
      value: `${amount(productivity.commerceCapacity)} customers a tick`,
    });
  }
  if (productivity.materialsCapacityPerTick > 0) {
    rows.push({
      label: 'Materials',
      value: productiveFlow(
        productivity.materialsPerTick,
        productivity.materialsCapacityPerTick,
      ),
    });
  }
  if (productivity.foodCapacityPerTick > 0) {
    rows.push({
      label: 'Food',
      value: productiveFlow(productivity.foodPerTick, productivity.foodCapacityPerTick),
    });
  }
  if (productivity.civicUpkeepPerTick > 0) {
    rows.push({
      label: 'Civic upkeep',
      value: `${amount(productivity.civicUpkeepPerTick)} funds a tick`,
    });
  }

  if (rows.length === 0) return [{ label: 'Productivity', value: 'no active buildings' }];
  if (
    productivity.commerceCapacity > 0
    || productivity.materialsCapacityPerTick > 0
    || productivity.foodCapacityPerTick > 0
  ) {
    rows.push({
      label: 'Workforce',
      value: `${Math.round(productivity.staffing * 100)}% staffed citywide`,
    });
  }
  return rows;
}

function productiveFlow(current: number, capacity: number): string {
  if (current === capacity) return `${amount(current)} a tick`;
  return `${amount(current)} of ${amount(capacity)} a tick`;
}

function columnSection(column: ColumnInfo): SelectionSection {
  const rows: SelectionRow[] = [
    { label: 'Position', value: `${column.x}, ${column.y}` },
    { label: 'Elevation', value: `z ${column.height}` },
    { label: 'Slope', value: column.slope.toFixed(2) },
    { label: 'Site', value: siteValue(column) },
    { label: 'Skyline', value: `${TIER_LABELS[column.tier]} · up to level ${column.allowedLevel}` },
    { label: 'Demand', value: demandValue(column) },
    { label: 'District now', value: profileLabel(column) },
    // Subito **sotto** il quartiere di adesso, dove la domanda nasce: leggere
    // «industrial» apre da sola il «e allora cos'altro potrebbe essere», ed e'
    // l'unica domanda del gioco che finora non aveva nessuna superficie a
    // reggerla — le diciotto soglie che la decidono non comparivano da nessuna
    // parte, nemmeno in debug.
    ...prospectRows(column),
  ];

  if (column.waterTop > column.height) {
    rows.splice(2, 0, { label: 'Under water', value: `${column.waterTop - column.height} voxels deep` });
  }
  if (column.crowd > 0) {
    rows.push({ label: 'Neighbours', value: `${column.crowd} nearby, ${column.stack} stacked here` });
  }

  return {
    id: 'column',
    title: `${capitalise(BIOME_NAMES[column.biome] ?? 'ground')} at ${column.x}, ${column.y}`,
    summary: `${GROUND_LABELS[column.ground]}, ${column.buildable ? 'buildable' : 'not buildable'}.`,
    rows,
    action: null,
  };
}

function voxelSection(voxel: VoxelInfo): SelectionSection {
  return {
    id: 'voxel',
    title: voxel.palette === 0 ? 'Empty voxel' : capitalise(paletteLabel(voxel.palette)),
    summary: 'The single cube the cursor landed on.',
    rows: [
      { label: 'Position', value: `${voxel.x}, ${voxel.y}, ${voxel.z}` },
      { label: 'Material', value: `${paletteLabel(voxel.palette)} (slot ${voxel.palette})` },
      { label: voxel.water ? 'Water' : 'Surface', value: surfaceLabel(voxel) },
      { label: 'Chunk', value: voxel.chunkKey },
    ],
    action: null,
  };
}

// --- Il ramo che distingue le quattro cose che un record puo' essere ---------

interface StructureHead {
  readonly title: string;
  readonly summary: string;
  readonly rows: readonly SelectionRow[];
}

function structureHead(info: StructureInfo): StructureHead {
  const record = info.record;
  if (record.landmark !== undefined) {
    const recipe = landmarkOf(record.landmark, record.landmarkForm);
    // Per un landmark `level` **e'** lo stadio: la stessa macchina lo fa
    // avanzare, ma chiamarlo livello direbbe che compete con l'altezza degli
    // edifici, e non e' cosi'.
    const stage = recipe === null
      ? `stage ${record.level}`
      : `stage ${record.level} of ${maxStageOf(recipe)}`;
    const catalyst = catalystById(record.landmark);
    const strength = info.catalyst?.strength
      ?? catalyst.strength + record.level * BALANCE.gameplay.catalyst.stageBonus;
    const favours = catalyst.favours.map((cls) => CLASS_LABELS[cls]).join(', ');
    const penalises = catalyst.penalises.map((cls) => CLASS_LABELS[cls]).join(', ');
    const district = effectSummary(catalyst.effects);
    return {
      title: catalyst.label,
      summary: `Landmark · ${stage}.`,
      rows: [
        // La prima riga dice cosa **fa** il landmark, non com'e' fatto: e' la
        // domanda di chi lo clicca, e prima non aveva risposta — la scheda
        // mostrava la portata e non il mestiere.
        { label: 'Produces', value: catalyst.description },
        {
          label: 'Influence',
          // Quanto il landmark versa nel campo per uso, al centro: la domanda
          // «come influenza la crescita attorno» con i numeri che la simulazione
          // applica davvero. La forza scalare da sola non diceva verso chi.
          value: influenceSummary(info, catalyst, strength),
        },
        { label: 'Reach', value: `radius ${catalyst.radius} · follows streets and terrain` },
        { label: 'Favours', value: favours.length === 0 ? 'none' : favours },
        { label: 'Penalises', value: penalises.length === 0 ? 'none' : penalises },
        { label: 'District', value: district },
      ],
    };
  }

  if (record.span !== undefined) {
    return {
      title: SPAN_LABELS[record.span],
      // Nessun uso urbano, benche' il record ne porti uno: una campata non e'
      // un edificio, non prende suolo e la simulazione non l'ha mai contata.
      summary: 'Elevated link · takes no ground.',
      rows: [],
    };
  }

  if (record.aerial !== undefined) {
    return {
      title: AERIAL_LABELS[record.aerial],
      summary: takesGround(record.aerial)
        ? 'Elevated city · stands on the ground.'
        : 'Elevated city · hangs above the ground.',
      rows: [],
    };
  }

  const uses = record.mixed === undefined
    ? classLabel(record.class)
    : `${classLabel(record.class)} over ${classLabel(record.mixed)}`;
  // Nessuna riga `Use`: l'intestazione la dice gia', e una scheda che ripete se
  // stessa insegna a saltarne le righe. Il livello torna piu' sotto accanto al
  // tetto del luogo, dove smette di essere un numero e diventa una domanda.
  return { title: typologyOf(record).label, summary: `${uses} · level ${record.level}.`, rows: [] };
}

/** true dove il record e' un edificio e non una delle altre tre cose. */
function isBuilding(record: BuildingRecord): boolean {
  return record.landmark === undefined
    && record.span === undefined
    && record.aerial === undefined;
}

/**
 * Le cinque metriche che un catalizzatore versa nel profilo del quartiere.
 *
 * L'ordine e' fisso perche' e' un elenco da leggere, non una mappa da cercare:
 * chi confronta due landmark vuole trovare `wealth` nello stesso posto tutte le
 * volte. Un valore a zero non compare — il ruolo non tocca quella metrica, e
 * stamparlo farebbe credere che «0» sia una scelta invece di un'assenza.
 */
const EFFECT_LABELS: readonly { readonly key: keyof CatalystEffects; readonly label: string }[] = [
  { key: 'density', label: 'density' },
  { key: 'wealth', label: 'wealth' },
  { key: 'accessibility', label: 'accessibility' },
  { key: 'satisfaction', label: 'satisfaction' },
  { key: 'industry', label: 'industry' },
];

/** «wealth +105 · accessibility +135»: cio' che il landmark versa nel quartiere. */
function effectSummary(effects: CatalystEffects): string {
  const parts: string[] = [];
  for (const { key, label } of EFFECT_LABELS) {
    const value = effects[key];
    if (value === 0) continue;
    parts.push(`${label} ${value > 0 ? '+' : '-'}${Math.abs(value)}`);
  }
  return parts.join(' · ');
}

/**
 * L'influenza di un landmark per uso, al centro e con le policy attive.
 *
 * `info.influence` porta i valori gia' pesati dalla simulazione; dove manca — il
 * catalizzatore non e' nello stato, come nei salvataggi vecchi — si ripiega sul
 * vettore del ruolo per la forza corrente, senza peso di policy. La riga non deve
 * sparire per un caso che il gioco produce ancora: dire «Market» senza quanto
 * muova le case accanto e' il difetto che questa riga esiste per chiudere.
 */
function influenceSummary(info: StructureInfo, catalyst: CatalystDefinition, strength: number): string {
  const parts: string[] = [];
  for (const cls of ALL_CLASSES) {
    const value = info.influence?.[cls] ?? Math.round(strength * catalyst.influence[cls]);
    if (value === 0) continue;
    parts.push(`${classLabel(cls)} ${signed(value)}`);
  }
  return parts.join(' · ');
}

// --- La carta di cio' che serve per crescere --------------------------------

/**
 * Cio' che serve perche' qualcosa cresca qui, detto in cima alla scheda.
 *
 * Tre soggetti hanno una risposta vera: un edificio promuove su desiderabilita'
 * e cassa, un landmark avanza di stadio sugli edifici vicini, e un terreno nudo
 * attecchisce quando un uso supera la propria soglia di sito. Chi non cresce —
 * campate, parti in quota, arcologie — non ha una carta: il vuoto e' un fatto.
 */
function growthCard(selection: Selection): GrowthCard | null {
  const info = selection.structure;
  if (info !== null) return structureGrowthCard(info);
  return groundGrowthCard(selection.column);
}

function structureGrowthCard(info: StructureInfo): GrowthCard | null {
  const record = info.record;

  if (record.landmark !== undefined) return landmarkGrowthCard(info);

  if (record.span !== undefined || record.aerial !== undefined || record.arcology !== undefined) {
    return null;
  }

  const growth = info.growth;
  if (growth === undefined) return null;

  // Chi regge qualcosa di abitato non promuove, anche dove il luogo ammetterebbe
  // altri piani: e' la risposta che il driver da' per primo, e la carta la
  // ripete dove la domanda nasce.
  if (info.carries) {
    return {
      title: 'To grow',
      summary: 'It holds up elevated parts — while it does, it cannot grow.',
      rows: [],
    };
  }

  if (growth === null) {
    return {
      title: 'To grow',
      summary: 'At the highest level this place allows.',
      rows: [],
    };
  }

  const met = growth.desirability >= growth.threshold;
  const rows: SelectionRow[] = [{
    label: 'Desirability',
    value: met
      ? `${growth.desirability} · the ${growth.threshold} it needs is met`
      : `${growth.desirability} of the ${growth.threshold} it needs for ${classLabel(record.class)}${thresholdDetail(growth)}`,
  }];

  if (!met) {
    // Chi versa desiderabilita' in questa cella: «78 of 96» senza la provenienza
    // non dice niente da fare, ed e' l'unica domanda che la carta esiste per
    // rispondere. Con la soglia raggiunta la carta torna a una riga sola: la
    // domanda e' gia' chiusa, e i pezzi ridiventerebbero rumore.
    for (const source of growth.sources) {
      rows.push({
        label: `From ${source.label} (${source.x}, ${source.y})`,
        value: signed(source.contribution),
      });
    }
    if (growth.congestion > 0) {
      const neighbours = growth.congestion / BALANCE.desirability.congestionPerBuilding;
      rows.push({
        label: 'Neighbours',
        value: `${signed(-growth.congestion)} · ${amount(neighbours)} building${plural(neighbours)} nearby`,
      });
    }
  }
  if (growth.cost > 0) {
    rows.push({
      label: 'Materials',
      value: `${growth.stock} in stock · ${growth.cost} needed for the upgrade`,
    });
  }
  return {
    title: 'To grow',
    summary: `What this building needs to reach level ${growth.nextLevel}.`,
    rows,
  };
}

/**
 * La carta di un landmark, solo finche' ha uno stadio davanti.
 *
 * Gli stessi numeri del driver (`withinRadius` + la soglia della ricetta): a che
 * stadio e' il monumento, quanti edifici ha gia' attorno e quanti ne servono per
 * lo stadio successivo. E' la stessa riga che prima viveva in fondo alla scheda
 * del landmark; qui sta sopra, dove la domanda «perche' non cresce?» si fa.
 */
function landmarkGrowthCard(info: StructureInfo): GrowthCard | null {
  const growth = info.landmark;
  if (growth === undefined || growth.nextAt === null) return null;
  return {
    title: 'To grow',
    summary: `The next stage needs ${growth.nextAt} buildings within reach.`,
    rows: [
      {
        label: 'Stage',
        value: `${growth.stage}/${growth.maxStage} · ${growth.nearby}/${growth.nextAt} buildings nearby`,
      },
      {
        label: 'Next stage',
        // Cio' che lo stadio compra, accanto a cio' che lo paga: contare gli
        // edifici vicini senza sapere per cosa e' l'unico numero opaco rimasto.
        value: `strength +${BALANCE.gameplay.catalyst.stageBonus}`,
      },
    ],
  };
}

/**
 * Cosa attecchirebbe su una colonna nuda.
 *
 * Un uso prende radice solo sopra la propria soglia di sito, e la soglia vive
 * in `BALANCE.desirability.siteThreshold` — la stessa tabella di
 * `nextBuildSites`. Dove nessun uso arriva, la carta dice l'unico gesto che
 * esiste: un landmark in portata, che e' da dove la desiderabilita' viene.
 */
function groundGrowthCard(column: ColumnInfo): GrowthCard {
  const thresholds = BALANCE.desirability.siteThreshold;
  const wanted = ALL_CLASSES
    .map((cls) => ({
      cls,
      score: column.desirability[cls] ?? 0,
      threshold: thresholds[cls] ?? 0,
    }))
    .filter((entry) => entry.score > entry.threshold);

  if (!column.buildable) {
    return {
      title: 'To grow',
      summary: 'Nothing can grow on this column.',
      rows: [{ label: 'Ground', value: 'not buildable' }],
    };
  }

  if (wanted.length === 0) {
    return {
      title: 'To grow',
      summary: 'No use wants this place yet.',
      rows: [{
        label: 'First building',
        value: column.profile.roles.length === 0
          ? 'needs a landmark within reach — desirability comes from catalysts'
          : 'desirability below every site threshold — a landmark nearby would raise it',
      }],
    };
  }

  return {
    title: 'To grow',
    summary: 'What could take root on this column.',
    rows: wanted.map((entry) => ({
      label: classLabel(entry.cls),
      value: `${entry.score} · passes the ${entry.threshold} site threshold`,
    })),
  };
}

// --- Cio' che la simulazione dice di un edificio come questo ------------------

/**
 * L'unita' di misura di ogni uso, che e' diversa per tutti e quattro.
 *
 * Sta qui e non in `selection.ts` per la stessa ragione per cui ci stanno i nomi
 * dei biomi: quello strato risponde **quanto**, questo **di cosa**. Il verbo non
 * e' decorazione — «room for» dice una capienza, «serves» e «yields» un flusso
 * per tick, «costs» un flusso che esce invece di entrare — e leggere 2 al posto
 * sbagliato farebbe sembrare un edificio civico una fonte di reddito.
 */
const YIELD_PHRASE: Readonly<Record<BuildingClass, (amount: string) => string>> = {
  [BUILDING_CLASS.residential]: (n) => `room for ${n} residents`,
  [BUILDING_CLASS.commercial]: (n) => `serves ${n} customers a tick`,
  [BUILDING_CLASS.industrial]: (n) => `yields ${n} materials a tick`,
  [BUILDING_CLASS.civic]: (n) => `costs ${n} funds a tick`,
};

/**
 * La riga che chiude la domanda che le due sopra aprono.
 *
 * «Level 6 of 6» e un rendimento fisso, uno sotto l'altro, si leggono come una
 * contraddizione — se e' cresciuto fino in cima, perche' ospita quanto la casa
 * accanto? Non e' un difetto della scheda ma la forma del bilancio: il tick conta
 * **edifici**, non piani, e il livello governa la sagoma e la tipologia. Dirlo e'
 * l'unica alternativa a lasciare che il giocatore concluda che uno dei due numeri
 * sia rotto.
 */
const GROWING_ROW: SelectionRow = {
  label: 'Growing',
  value: 'changes its shape, not its yield: the city counts buildings, not floors',
};

/**
 * Un uso in una riga: cosa rende, quanti ne ha la citta', e quanto ne usa.
 *
 * Le tre parti sono tre cose diverse e l'ordine e' quello in cui si restringono:
 * la prima e' del **tipo**, la seconda del **parco costruito**, la terza della
 * **citta'**. Nessuna delle tre e' di questo edificio, e la scheda non lo
 * suggerisce mai — «citywide» e' li' per quello, ed e' l'unica parola della riga
 * che non si puo' togliere.
 */
function useRow(use: UseInfo): SelectionRow {
  const phrase = YIELD_PHRASE[use.cls];
  const parts = [phrase === undefined ? amount(use.perBuilding) : phrase(amount(use.perBuilding))];
  parts.push(use.count === 1 ? 'the only one in the city' : `one of ${use.count}`);
  if (use.cityUse !== null) parts.push(`${Math.round(use.cityUse * 100)}% used citywide`);

  return {
    // «hosted» e non «secondary»: dice gia' che quel rendimento e' una quota, che
    // e' l'unica cosa che distingue questa riga da quella di un edificio intero.
    label: use.secondary ? `${classLabel(use.cls)} (hosted)` : classLabel(use.cls),
    value: parts.join(' · '),
  };
}

/**
 * Cio' che manca a un edificio di questo uso per rendere al pieno.
 *
 * Non e' un secondo rendimento: e' l'**ingresso** che il tipo consuma, ed e' la
 * risposta alla domanda che chi clicca un edificio si sta facendo — «perche' non
 * rende di piu'?». Le case vogliono residenti, negozi e fabbriche vogliono
 * braccia (l'organico cittadino, condiviso con la campagna), i servizi vogliono
 * fondi. Come il resto della scheda, la cifra e' della **citta'**, non di questo
 * esemplare: la simulazione non conserva niente di piu' specifico.
 */
const NEED_PHRASE: Readonly<Record<BuildingClass, (use: UseInfo) => string>> = {
  [BUILDING_CLASS.residential]: (use) => {
    if (use.cityUse === null) return 'residents to move in';
    const occupied = Math.round(use.cityUse * 100);
    return occupied >= 100
      ? 'residents — every home in the city is occupied'
      : `residents — ${100 - occupied}% of homes in the city are empty`;
  },
  [BUILDING_CLASS.commercial]: commercialPhrase,
  [BUILDING_CLASS.industrial]: (use) => staffingPhrase('workers', use.staffing),
  [BUILDING_CLASS.civic]: () => 'funds — its upkeep is paid from the treasury each tick',
};

function staffingPhrase(who: string, staffing: number): string {
  const staffed = Math.round(staffing * 100);
  return staffed >= 100
    ? `${who} — the city workforce is fully staffed`
    : `${who} — the city workforce is ${staffed}% staffed`;
}

/**
 * Il commercio ha due ingressi: le braccia dell'organico, condiviso con
 * industria e campagna, e i clienti che la popolazione porta. Dire solo il
 * primo farebbe leggere «non manca niente» a un negozio pieno di commessi e
 * vuoto di gente, quindi l'occupazione dice anche il secondo.
 */
function commercialPhrase(use: UseInfo): string {
  const parts = [staffingPhrase('workers', use.staffing)];
  if (use.cityUse !== null) {
    const busy = Math.round(use.cityUse * 100);
    parts.push(busy >= 100
      ? 'every shop in the city is busy'
      : `${100 - busy}% of shops in the city stand idle`);
  }
  return parts.join(' · ');
}

function needRow(use: UseInfo): SelectionRow {
  return { label: 'Needs', value: NEED_PHRASE[use.cls](use) };
}

/** Interi senza virgola, il resto a un decimale: `productionYield` vale 2,5. */
function amount(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

/** «+52» o «-24»: il segno esplicito, perche' e' il senso della riga. */
function signed(value: number): string {
  return `${value > 0 ? '+' : '-'}${amount(Math.abs(value))}`;
}

/** « (base 120, local qualities -24)»: perche' la soglia cambia da luogo a luogo. */
function thresholdDetail(growth: { readonly baseThreshold: number; readonly discount: number }): string {
  if (growth.discount === 0) return '';
  return ` (base ${growth.baseThreshold}, local qualities -${growth.discount})`;
}

// --- Formattazione -----------------------------------------------------------

function siteValue(column: ColumnInfo): string {
  const ground = GROUND_LABELS[column.ground];
  if (column.ground === GROUND.refused) return `${ground}, nothing can be built`;
  if (column.ground === GROUND.flat) return ground;
  return `${ground}, costs ×${column.buildWeight}`;
}

function demandValue(column: ColumnInfo): string {
  return CLASS_LABELS
    .map((label, cls) => `${label} ${column.desirability[cls]}`)
    .join(' · ');
}

function profileLabel(column: ColumnInfo): string {
  const { district, specialization } = column.profile;
  return specialization === null ? district : `${district} · ${specialization}`;
}

function districtLabel(record: BuildingRecord): string {
  const district = record.district ?? 'outskirts';
  const specialization = record.specialization ?? null;
  return specialization === null ? district : `${district} · ${specialization}`;
}

/** Cosa questa struttura tiene su. `null` dove non tiene niente. */
function holdings(info: StructureInfo): string | null {
  const parts: string[] = [];
  if (info.spans.length > 0) parts.push(`${info.spans.length} link${plural(info.spans.length)}`);
  if (info.decks.length > 0) parts.push(`${info.decks.length} deck${plural(info.decks.length)}`);
  if (parts.length === 0) return null;
  // Chi regge non cresce: e' la ragione per cui questa riga vale la pena, non
  // un dettaglio di rete. Un edificio che ospita un impalcato non promuove piu',
  // e senza dirlo la sua altezza ferma legge come un difetto.
  return `${parts.join(' and ')} · cannot grow while it does`;
}

function surfaceLabel(voxel: VoxelInfo): string {
  if (voxel.water) return WATER_LABELS[voxel.surface] ?? 'water';
  return SURFACE_KIND_NAMES[voxel.surface as SurfaceKind] ?? 'plain';
}

function paletteLabel(palette: number): string {
  const name = PALETTE_SLOT_NAMES[palette];
  if (name === undefined) return 'empty';
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function classLabel(cls: BuildingClass): string {
  return CLASS_LABELS[cls] ?? 'urban';
}

function capitalise(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function plural(count: number): string {
  return count === 1 ? '' : 's';
}
