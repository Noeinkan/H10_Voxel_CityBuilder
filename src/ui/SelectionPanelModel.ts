import {
  ALL_CLASSES,
  BALANCE,
  CLASS_LABELS,
  catalystById,
  type CatalystDefinition,
  type CatalystId,
} from '../sim';
import { BIOME_NAMES } from '../world/terrain/config';
import { takesGround } from '../world/aerial/config';
import { landmarkOf, maxStageOf } from '../world/landmarks/config';
import { typologyOf } from '../world/buildings/recordStamp';
import { footprintDepth, type BuildingRecord } from '../world/buildings/BuildingRegistry';
import { STRUCTURE_KIND, structureKindOf, traitsOf } from '../world/buildings/structureKind';
import { prospectRows } from './prospects';
import { signed, type Breakdown, type Contribution, type Meter, type Verdict } from './meters';
import {
  AERIAL_LABELS,
  capitalise,
  classLabel,
  demandValue,
  districtLabel,
  effectSummary,
  GROUND_LABELS,
  paletteLabel,
  plural,
  profileLabel,
  ROLE_LABELS,
  siteValue,
  SPAN_LABELS,
  surfaceLabel,
  TIER_LABELS,
} from './selectionLabels';
import { blockMeters, blockMix, demandMeters, useMeters } from './selectionMeters';
import { growthPlan } from './selectionVerdict';
import type { SiteAdvice } from './siteAdvice';
import type {
  BlockInfo,
  ColumnInfo,
  Selection,
  StructureInfo,
  VoxelInfo,
} from '../game/selection';

/**
 * La scheda di selezione dal lato del giocatore: un verdetto, delle barre, e i
 * dettagli sotto.
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
 *
 * **Cio' che una sezione dice ora sta in tre posti e non piu' in uno.** Le
 * misure vanno in `meters` e si disegnano come barre; le frasi che le
 * commentavano sono diventate il loro `hint`; nelle `rows` resta la
 * carta d'identita' — misure fisse, appartenenze, appoggi — che nessuna barra
 * descriverebbe meglio di due parole, e che il pannello tiene ripiegata. Le
 * tabelle dei nomi sono uscite in `selectionLabels.ts`, il verdetto in
 * `selectionVerdict.ts` e le barre in `selectionMeters.ts`: il file era gia'
 * oltre il budget di `AGENTS.md` prima di guadagnare tutto questo.
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
  /** Le quantita' come barre. Vuoto dove non ce ne sono di confrontabili. */
  readonly meters: readonly Meter[];
  /** Di cosa e' fatta questa unita', come una barra sola divisa in usi. */
  readonly mix: readonly Contribution[];
  /** La carta d'identita': cio' che il pannello tiene ripiegato. */
  readonly rows: readonly SelectionRow[];
  /** Il gesto che questa sezione offre, `null` dove non ce n'e' uno. */
  readonly action: SelectionAction | null;
}

export interface SelectionPanelModel {
  /** Il soggetto piu' specifico che esiste qui: e' l'intestazione del pannello. */
  readonly title: string;
  readonly summary: string;
  /** La risposta corta, sempre in cima: cosa sta succedendo in questo punto. */
  readonly verdict: Verdict;
  readonly breakdown: Breakdown | null;
  readonly advice: SiteAdvice | null;
  readonly sections: readonly SelectionSection[];
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
  const plan = growthPlan(selection);
  return {
    title: lead.title,
    summary: lead.summary,
    verdict: plan.verdict,
    breakdown: plan.breakdown,
    advice: plan.advice,
    sections,
  };
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

  // Fra i dettagli, e non piu' fra le misure: «Level 6 of 6» sopra un rendimento
  // fisso si legge come una contraddizione — se e' cresciuto fino in cima,
  // perche' ospita quanto la casa accanto? Non e' un difetto ma la forma del
  // bilancio, il tick conta **edifici** e non piani, e dirlo resta l'unica
  // alternativa a lasciare che il giocatore concluda che un numero sia rotto.
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
  return {
    id: 'structure',
    title: head.title,
    summary: head.summary,
    meters: useMeters(info.uses),
    mix: [],
    rows,
    action: null,
  };
}

function blockSection(block: BlockInfo, isolatedBlock: string | null): SelectionSection {
  const rows: SelectionRow[] = [
    { label: 'Extent', value: `${block.rect.x1 - block.rect.x0 + 1} × ${block.rect.y1 - block.rect.y0 + 1} columns` },
    { label: 'This column', value: ROLE_LABELS[block.role] },
    { label: 'Buildings', value: `${block.buildings}` },
  ];
  if (block.buildings > 0) rows.push({ label: 'Tallest', value: `level ${block.maxLevel}` });
  if (block.landmarks > 0) rows.push({ label: 'Landmarks', value: `${block.landmarks}` });
  if (block.structures > 0) rows.push({ label: 'Elevated parts', value: `${block.structures}` });

  return {
    id: 'block',
    title: `Block ${block.key}`,
    summary: block.buildings === 0 ? 'Nothing has grown here yet.' : 'The city block this column belongs to.',
    meters: blockMeters(block),
    mix: blockMix(block),
    rows,
    // Anche su un isolato vuoto: li' la domanda «cosa ci sta» e' proprio quella
    // che si fa chi lo trova vuoto, e il terreno da solo e' gia' una risposta.
    action: isolatedBlock === block.key ? RELEASE_BLOCK : ISOLATE_BLOCK,
  };
}

function columnSection(column: ColumnInfo): SelectionSection {
  const rows: SelectionRow[] = [
    { label: 'Position', value: `${column.x}, ${column.y}` },
    { label: 'Elevation', value: `z ${column.height}` },
    { label: 'Slope', value: column.slope.toFixed(2) },
    { label: 'Site', value: siteValue(column) },
    { label: 'Skyline', value: `${TIER_LABELS[column.tier]} · up to level ${column.allowedLevel}` },
    // Le stesse quattro cifre delle barre qui sopra, su una riga sola: le barre
    // dicono chi supera la propria soglia, questa riga i numeri esatti da
    // confrontare fra due colonne. Sta fra i dettagli proprio per questo.
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
    meters: demandMeters(column),
    mix: [],
    rows,
    action: null,
  };
}

function voxelSection(voxel: VoxelInfo): SelectionSection {
  return {
    id: 'voxel',
    title: voxel.palette === 0 ? 'Empty voxel' : capitalise(paletteLabel(voxel.palette)),
    summary: 'The single cube the cursor landed on.',
    meters: [],
    mix: [],
    rows: [
      { label: 'Position', value: `${voxel.x}, ${voxel.y}, ${voxel.z}` },
      { label: 'Material', value: `${paletteLabel(voxel.palette)} (slot ${voxel.palette})` },
      { label: voxel.water ? 'Water' : 'Surface', value: surfaceLabel(voxel) },
      { label: 'Chunk', value: voxel.chunkKey },
    ],
    action: null,
  };
}

// --- Il ramo che distingue le quattro intestazioni possibili ----------------

interface StructureHead {
  readonly title: string;
  readonly summary: string;
  readonly rows: readonly SelectionRow[];
}

function structureHead(info: StructureInfo): StructureHead {
  const record = info.record;
  switch (structureKindOf(record)) {
    // I marker si rileggono qui e non si narrano: il tipo li ha gia' decisi, e
    // il `!` dice che il campo che *definisce* quel tipo non puo' mancare.
    case STRUCTURE_KIND.landmark:
    case STRUCTURE_KIND.rooftopLandmark:
      return landmarkHead(info, record.landmark!);

    case STRUCTURE_KIND.span:
      return {
        title: SPAN_LABELS[record.span!],
        // Nessun uso urbano, benche' il record ne porti uno: una campata non e'
        // un edificio, non prende suolo e la simulazione non l'ha mai contata.
        summary: 'Elevated link · takes no ground.',
        rows: [],
      };

    case STRUCTURE_KIND.aerial:
      return {
        title: AERIAL_LABELS[record.aerial!],
        summary: takesGround(record.aerial!)
          ? 'Elevated city · stands on the ground.'
          : 'Elevated city · hangs above the ground.',
        rows: [],
      };

    // Arcologia e torre di funivia hanno sempre preso l'intestazione
    // dell'edificio ordinario: il ramo di ripiego di prima le comprendeva
    // entrambe, e `typologyOf` sa gia' rispondere per tutte e tre.
    case STRUCTURE_KIND.plain:
    case STRUCTURE_KIND.arcology:
    case STRUCTURE_KIND.ropeway: {
      const uses = record.mixed === undefined
        ? classLabel(record.class)
        : `${classLabel(record.class)} over ${classLabel(record.mixed)}`;
      // Nessuna riga `Use`: l'intestazione la dice gia', e una scheda che ripete
      // se stessa insegna a saltarne le righe. Il livello torna piu' sotto
      // accanto al tetto del luogo, dove smette di essere un numero e diventa
      // una domanda.
      return { title: typologyOf(record).label, summary: `${uses} · level ${record.level}.`, rows: [] };
    }
  }
}

/** L'intestazione di un monumento, a terra o su un tetto: e' la stessa. */
function landmarkHead(info: StructureInfo, kind: CatalystId): StructureHead {
  const record = info.record;
  const recipe = landmarkOf(kind, record.landmarkForm);
  // Per un landmark `level` **e'** lo stadio: la stessa macchina lo fa
  // avanzare, ma chiamarlo livello direbbe che compete con l'altezza degli
  // edifici, e non e' cosi'.
  const stage = recipe === null
    ? `stage ${record.level}`
    : `stage ${record.level} of ${maxStageOf(recipe)}`;
  const catalyst = catalystById(kind);
  const strength = info.catalyst?.strength
    ?? catalyst.strength + record.level * BALANCE.gameplay.catalyst.stageBonus;
  const favours = catalyst.favours.map((cls) => CLASS_LABELS[cls]).join(', ');
  const penalises = catalyst.penalises.map((cls) => CLASS_LABELS[cls]).join(', ');
  return {
    title: catalyst.label,
    summary: catalyst.description,
    rows: [
      {
        label: 'Influence',
        // Quanto il landmark versa nel campo per uso, al centro: la domanda
        // «come influenza la crescita attorno» con i numeri che la simulazione
        // applica davvero. La forza scalare da sola non diceva verso chi.
        value: influenceSummary(info, catalyst, strength),
      },
      { label: 'Reach', value: `radius ${catalyst.radius} · follows streets and terrain` },
      { label: 'Stage', value: stage },
      { label: 'Favours', value: favours.length === 0 ? 'none' : favours },
      { label: 'Penalises', value: penalises.length === 0 ? 'none' : penalises },
      { label: 'District', value: effectSummary(catalyst.effects) },
    ],
  };
}

const GROWING_ROW: SelectionRow = {
  label: 'Growing',
  value: 'changes its shape, not its yield: the city counts buildings, not floors',
};

/**
 * true dove la riga `Level` ha un senso: un record con un uso urbano.
 *
 * E' la stessa casella che `selection.usesOf` legge per decidere se il record
 * porta un rendimento — se un uso c'e', anche il tetto del luogo e' una domanda
 * sensata — e comprende quindi anche l'arcologia e la torre di funivia, che il
 * controllo scritto a mano non aveva mai escluso.
 */
function isBuilding(record: BuildingRecord): boolean {
  return traitsOf(record).hasUrbanUse;
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
