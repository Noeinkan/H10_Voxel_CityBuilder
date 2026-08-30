import { PALETTE_SLOT_NAMES } from '../../engine/paletteSlots';
import { CATALYSTS, type CatalystDefinition } from '../../sim/catalysts';
import {
  TYPOLOGIES,
  VISUAL_LEVELS,
  typologyById,
  type TypologyDefinition,
} from '../buildings/config';
import { generateBuilding } from '../buildings/generate';
import type { VoxelStamp } from '../buildings/stamp';
import { typologyProfile } from '../buildings/typology';
import {
  FORMS,
  LANDMARKS,
  contextualFormsOf,
  isFacadeForm,
  maxStageOf,
  variantsOf,
  type LandmarkFormId,
  type LandmarkRecipe,
  type PartsRecipe,
} from '../landmarks/config';
import { generateFromRecipe, variantIndexOf } from '../landmarks/generate';
import { ARCOLOGY_RECIPES, type ArcologyRecipe } from '../arcology/config';
import { generateArcology } from '../arcology/generate';
import { FACING } from '../streets/streetGrid';
import { BIOME_NAMES, TERRAIN } from '../terrain/config';
import { treeSpec, treeTop } from '../terrain/decor';
import { TREE_SHAPES } from '../terrain/flora';
import { SURFACE_KIND_NAMES } from '../visualBlock';
import {
  ARCOLOGY_LABELS,
  FORM_LABELS,
  FORM_NOTES,
  WATER_LABELS,
  evolutionLabel,
  footprintLabel,
  levelLabel,
  requirementLabel,
  shapeLabel,
  useLabel,
} from './swatchLabels';
import {
  CELL_HEIGHT,
  SCALE_ITEMS,
  SCALE_ORIGIN_Y,
  SWATCH,
  SWATCH_BASE_REAR,
  SWATCH_COLUMNS,
  SWATCH_PILLARS,
  SWATCH_ROWS,
  matrixCellRect,
  plinthSpanAt as basePlinthSpanAt,
  strataPillarRect,
  swatchCellAt as baseCellAt,
  swatchExtent as baseExtentOf,
  type SwatchExtent,
  type SwatchRect,
} from './swatchLayout';
import { clearanceBehind, clearanceBeside } from './swatchOcclusion';

/** Vuoto minimo fra due soggetti del campionario. */
export const SWATCH_ITEM_GAP = 8;

/**
 * Livello comune che rende confrontabili tutte le tipologie.
 *
 * E' la soglia `mature` delle cinque visuali: il livello a cui la campata e il
 * fronte attivo esistono, ma le terrazze non sono ancora attrezzate — la forma
 * matura e' quella che il catalogo promette, non la torre che diventa piu'
 * avanti.
 */
export const SWATCH_BUILDING_LEVEL = VISUAL_LEVELS.mature;

/**
 * Le quattro linee evolutive del campionario, un ripiego per uso.
 *
 * La stessa tipologia si mostra alle cinque soglie visuali — base, consolidata,
 * matura, torre, skyline — perche' e' li' che si vede la crescita cambiare il
 * volto di un edificio a parita' di seme e di regola.
 */
export const SWATCH_LINE_TYPOLOGIES = [
  'terracedHousing',
  'retailRow',
  'industrialYard',
  'civicSpire',
] as const;

/** I livelli della linea evolutiva: le cinque soglie visuali condivise. */
export const SWATCH_LINE_LEVELS = [
  VISUAL_LEVELS.base,
  VISUAL_LEVELS.consolidated,
  VISUAL_LEVELS.mature,
  VISUAL_LEVELS.tower,
  VISUAL_LEVELS.skyline,
] as const;

export const SWATCH_FOCUS = {
  matrix: 'matrix',
  scale: 'scale',
  buildings: 'buildings',
  landmarks: 'landmarks',
  arcologies: 'arcologies',
  all: 'all',
} as const;

export type SwatchFocus = (typeof SWATCH_FOCUS)[keyof typeof SWATCH_FOCUS];

export const SWATCH_FOCUSES: readonly SwatchFocus[] = [
  SWATCH_FOCUS.matrix,
  SWATCH_FOCUS.scale,
  SWATCH_FOCUS.buildings,
  SWATCH_FOCUS.landmarks,
  SWATCH_FOCUS.arcologies,
  SWATCH_FOCUS.all,
];

export type SwatchSubjectKind =
  | 'matrix'
  | 'strata'
  | 'scale'
  | 'building'
  | 'landmark'
  | 'arcology';

export interface SwatchInfoRow {
  readonly label: string;
  readonly value: string;
}

/** Un soggetto logico: layout, referto e selezione leggono lo stesso record. */
export interface SwatchSubject {
  readonly id: string;
  readonly kind: SwatchSubjectKind;
  readonly band: string;
  readonly label: string;
  readonly note: string | null;
  readonly row: number;
  readonly col: number;
  readonly rect: SwatchRect;
  readonly z0: number;
  readonly z1: number;
  readonly info: readonly SwatchInfoRow[];
  /** Presente soltanto per i modelli che la scena deve stampare. */
  readonly stamp: VoxelStamp | null;
}

export interface SwatchCatalogSubject extends SwatchSubject {
  readonly kind: 'building' | 'landmark' | 'arcology';
  readonly stamp: VoxelStamp;
}

interface PendingCatalogSubject {
  readonly id: string;
  readonly kind: 'building' | 'landmark' | 'arcology';
  readonly band: 'buildings' | 'landmarks' | 'arcologies';
  readonly label: string;
  readonly note: string | null;
  readonly info: readonly SwatchInfoRow[];
  readonly stamp: VoxelStamp;
}

const BASE_EXTENT = baseExtentOf();

/**
 * Le quattro gallerie stanno **dietro** la base, lungo le y negative.
 *
 * La camera guarda da `(+x, +y)`: lungo +y ci si avvicina, e chi sta davanti
 * copre chi sta dietro. Le megastrutture arrivano a settecento voxel, e
 * qualunque cosa messa oltre loro sparirebbe — e' esattamente cio' che
 * succedeva alla matrice e alla fascia di scala, sepolte dalla fila delle
 * arcologie. Percio' l'ordine e' quello delle quote decrescenti: le arcologie
 * in fondo, dove salgono nel cielo vuoto, poi le linee evolutive, gli edifici,
 * i landmark, e davanti a tutti la base.
 *
 * Sono anche l'ordine di lettura di sempre — arcologie, linee, edifici,
 * landmark — perche' leggere il campionario vuol dire percorrerlo lungo +y,
 * cioe' venire verso di se': la sequenza si costruisce all'indietro e si legge
 * in avanti.
 */
const GALLERY_BANDS = stackBehind(
  [landmarkRows(), buildingRows(), evolutionLineRows(), arcologyRows()],
  SWATCH_BASE_REAR.y,
  SWATCH_BASE_REAR.top,
);

export const SWATCH_LANDMARKS: readonly SwatchCatalogSubject[] = GALLERY_BANDS[0].subjects;
export const SWATCH_BUILDINGS: readonly SwatchCatalogSubject[] = GALLERY_BANDS[1].subjects;
export const SWATCH_LINES: readonly SwatchCatalogSubject[] = GALLERY_BANDS[2].subjects;
export const SWATCH_ARCOLOGIES: readonly SwatchCatalogSubject[] = GALLERY_BANDS[3].subjects;

/** I ripiani di tutte le gallerie, in un elenco solo: li percorre il generatore. */
const GALLERY_PLINTHS: readonly PlinthStrip[] = GALLERY_BANDS.flatMap((band) => band.strips);
export const SWATCH_CATALOG_SUBJECTS: readonly SwatchCatalogSubject[] = [
  ...SWATCH_ARCOLOGIES,
  ...SWATCH_LINES,
  ...SWATCH_BUILDINGS,
  ...SWATCH_LANDMARKS,
];

const BASE_SUBJECTS = baseSubjects();
export const SWATCH_SUBJECTS: readonly SwatchSubject[] = [
  ...BASE_SUBJECTS,
  ...SWATCH_CATALOG_SUBJECTS,
];

const BUILDING_EXTENT = subjectsExtent([...SWATCH_LINES, ...SWATCH_BUILDINGS]);
const LANDMARK_EXTENT = subjectsExtent(SWATCH_LANDMARKS);
const ARCOLOGY_EXTENT = subjectsExtent(SWATCH_ARCOLOGIES);
const FULL_EXTENT = completeExtent();

export function swatchExtent(): SwatchExtent {
  return FULL_EXTENT;
}

/** Inquadratura di una fascia, con un margine che non appartiene agli oggetti. */
export function swatchFocusExtent(focus: SwatchFocus): SwatchExtent {
  if (focus === SWATCH_FOCUS.all) return FULL_EXTENT;
  if (focus === SWATCH_FOCUS.buildings) return padded(BUILDING_EXTENT, SWATCH_ITEM_GAP);
  if (focus === SWATCH_FOCUS.landmarks) return padded(LANDMARK_EXTENT, SWATCH_ITEM_GAP);
  if (focus === SWATCH_FOCUS.arcologies) return padded(ARCOLOGY_EXTENT, SWATCH_ITEM_GAP);

  const subjects = focus === SWATCH_FOCUS.matrix
    ? BASE_SUBJECTS.filter((subject) => subject.kind === 'matrix')
    : BASE_SUBJECTS.filter((subject) => subject.kind === 'strata' || subject.kind === 'scale');
  return padded(subjectsExtent(subjects), SWATCH_ITEM_GAP);
}

/** Il vuoto fra due riquadri non appartiene a nessuno dei due. */
export function swatchSubjectAt(x: number, y: number): SwatchSubject | null {
  for (const subject of SWATCH_SUBJECTS) {
    if (x < subject.rect.x0 || x >= subject.rect.x1) continue;
    if (y < subject.rect.y0 || y >= subject.rect.y1) continue;
    return subject;
  }
  return null;
}

/**
 * Basamento delle gallerie: **un ripiano per riga**, non uno per fascia.
 *
 * Da quando il distacco fra due righe e' quanto ne chiede l'occlusione, dentro
 * una galleria ci sono vuoti larghi come un edificio intero: un basamento
 * continuo li avrebbe riempiti di grigio, e la fascia si sarebbe letta come un
 * piazzale invece che come una sequenza di ripiani. Resta il principio di
 * sempre — il piano di lettura e' largo quanto cio' che ci sta sopra — applicato
 * una riga alla volta.
 */
export function swatchPlinthSpanAt(y: number): { readonly x0: number; readonly x1: number } {
  if (y >= BASE_EXTENT.minY) return basePlinthSpanAt(y);
  for (const strip of GALLERY_PLINTHS) {
    if (y >= strip.y0 && y < strip.y1) return { x0: strip.x0, x1: strip.x1 };
  }
  return { x0: 0, x1: 0 };
}

function evolutionLineRows(): readonly (readonly PendingCatalogSubject[])[] {
  return SWATCH_LINE_TYPOLOGIES.map((id) => {
    const definition = typologyById(id);
    if (definition === null) throw new Error(`tipologia di linea assente: ${id}`);
    return SWATCH_LINE_LEVELS.map((level) => lineSubject(definition, level));
  });
}

function lineSubject(definition: TypologyDefinition, level: number): PendingCatalogSubject {
  const stamp = generateBuilding({
    class: definition.use,
    level,
    seed: 0,
    profile: typologyProfile(definition),
    shape: definition.shape,
    mixed: definition.mixed,
    facing: FACING.east,
  });
  return {
    id: `building:line:${definition.id}:${level}`,
    kind: 'building',
    band: 'buildings',
    label: `${definition.label} · L${level}`,
    note: 'The growth line at the five visual thresholds.',
    stamp,
    info: [
      { label: 'ID', value: definition.id },
      { label: 'Use', value: useLabel(definition) },
      { label: 'Level', value: levelLabel(level) },
      { label: 'Seed', value: '0' },
      { label: 'Facing', value: 'east' },
      { label: 'Shape', value: shapeLabel(definition.shape) },
    ],
  };
}

function buildingRows(): readonly (readonly PendingCatalogSubject[])[] {
  const rows: PendingCatalogSubject[][] = [[], [], [], []];
  for (const definition of TYPOLOGIES) rows[definition.use].push(buildingSubject(definition));
  return rows;
}

function buildingSubject(definition: TypologyDefinition): PendingCatalogSubject {
  const stamp = generateBuilding({
    class: definition.use,
    level: SWATCH_BUILDING_LEVEL,
    seed: 0,
    profile: typologyProfile(definition),
    shape: definition.shape,
    mixed: definition.mixed,
    facing: FACING.east,
  });
  return {
    id: `building:${definition.id}`,
    kind: 'building',
    band: 'buildings',
    label: definition.label,
    // La nota portava l'id, che adesso e' una riga della scheda: qui sta invece
    // cio' che la sagoma non dice — perche' questa riga esiste nel catalogo.
    note: null,
    stamp,
    info: [
      { label: 'ID', value: definition.id },
      { label: 'Use', value: useLabel(definition) },
      { label: 'Level', value: levelLabel(SWATCH_BUILDING_LEVEL) },
      { label: 'Seed', value: '0' },
      { label: 'Facing', value: 'east' },
      { label: 'Shape', value: shapeLabel(definition.shape) },
      { label: 'Lot side', value: footprintLabel(definition.shape) },
      { label: 'Requires', value: requirementLabel(definition) },
      { label: 'Grows from', value: evolutionLabel(definition) },
      { label: 'Priority', value: String(definition.priority) },
    ],
  };
}

function landmarkRows(): readonly (readonly PendingCatalogSubject[])[] {
  return CATALYSTS.map((catalyst) => {
    const recipe = LANDMARKS[catalyst.id];
    if (recipe === undefined) return [];
    const row: PendingCatalogSubject[] = [];
    // La crescita per stadi viene prima degli esemplari: e' la stessa lettura
    // che la citta' mostra a schermo — quattro tempi, dall'accesso alla corona.
    for (let stage = 0; stage <= maxStageOf(recipe); stage++) {
      row.push(landmarkStageSubject(catalyst, recipe, stage));
    }
    for (const [index, variant] of variantsOf(recipe).entries()) {
      row.push(landmarkSubject(catalyst, recipe, index, variant.name));
    }
    for (const form of contextualFormsOf(catalyst.id)) row.push(formSubject(catalyst, form));
    return row;
  });
}

function landmarkStageSubject(
  catalyst: CatalystDefinition,
  recipe: LandmarkRecipe,
  stage: number,
): PendingCatalogSubject {
  // L'esemplare e' fissato al primo: la crescita per stadi si legge sullo
  // stesso monumento, non su quattro monumenti diversi.
  const seed = seedForVariant(recipe, 0);
  const stamp = generateFromRecipe(recipe, { stage, facing: FACING.east, seed, variant: 0 });
  return {
    id: `landmark:${catalyst.id}:stage:${stage}`,
    kind: 'landmark',
    band: 'landmarks',
    label: `${catalyst.label} · stage ${stage}`,
    note: catalyst.description,
    stamp,
    info: [
      { label: 'Role', value: catalyst.id },
      { label: 'Stage', value: `${stage} of ${maxStageOf(recipe)}` },
      { label: 'Seed', value: String(seed) },
      { label: 'Facing', value: 'east' },
      { label: 'Site', value: catalyst.site },
      { label: 'Apron', value: `${recipe.apron} voxel` },
    ],
  };
}

function landmarkSubject(
  catalyst: CatalystDefinition,
  recipe: LandmarkRecipe,
  variant: number,
  variantName: string,
): PendingCatalogSubject {
  const seed = seedForVariant(recipe, variant);
  const stage = maxStageOf(recipe);
  const stamp = generateFromRecipe(recipe, { stage, facing: FACING.east, seed });
  return {
    id: `landmark:${catalyst.id}:${variantName}`,
    kind: 'landmark',
    band: 'landmarks',
    label: `${catalyst.label} · ${variantName}`,
    note: catalyst.description,
    stamp,
    info: landmarkInfo(catalyst, variantName, stage, seed, recipe),
  };
}

function formSubject(catalyst: CatalystDefinition, form: LandmarkFormId): PendingCatalogSubject {
  const entry = FORMS[form];
  const stage = maxStageOf(entry.recipe);
  const seed = 0;
  return {
    id: `landmark:${catalyst.id}:${form}`,
    kind: 'landmark',
    band: 'landmarks',
    label: `${catalyst.label} · ${FORM_LABELS[form]}`,
    note: FORM_NOTES[form],
    stamp: generateFromRecipe(entry.recipe, { stage, facing: FACING.east, seed, variant: entry.variant }),
    info: landmarkInfo(catalyst, FORM_LABELS[form], stage, seed, entry.recipe, form),
  };
}

function landmarkInfo(
  catalyst: CatalystDefinition,
  variant: string,
  stage: number,
  seed: number,
  recipe: PartsRecipe,
  form?: LandmarkFormId,
): readonly SwatchInfoRow[] {
  const place = form === undefined
    ? catalyst.site
    : isFacadeForm(form) ? 'above ground' : WATER_LABELS[FORMS[form].waterClass!];
  return [
    { label: 'Role', value: catalyst.id },
    { label: 'Variant', value: variant },
    { label: 'Stage', value: `${stage} of ${maxStageOf(recipe)}` },
    { label: 'Seed', value: String(seed) },
    { label: 'Facing', value: 'east' },
    { label: 'Site', value: place },
    { label: 'Apron', value: `${'apron' in recipe ? recipe.apron : 0} voxel` },
  ];
}

function seedForVariant(recipe: PartsRecipe, wanted: number): number {
  for (let seed = 0; seed < 10_000; seed++) {
    if (variantIndexOf(recipe, seed) === wanted) return seed;
  }
  throw new Error(`nessun seed per la variante landmark ${wanted}`);
}

function arcologyRows(): readonly (readonly PendingCatalogSubject[])[] {
  // Le megastrutture in fila, in una riga sola. Le interrate ci stanno accanto
  // alle alte come volumi pieni, senza il terreno in cui vivono: e' il solo modo
  // di guardarne la sagoma — un imbuto a terrazze — che in partita si vede
  // soltanto per la bocca.
  return [ARCOLOGY_RECIPES.map((recipe) => arcologySubject(recipe))];
}

function arcologySubject(recipe: ArcologyRecipe): PendingCatalogSubject {
  const stage = maxStageOf(recipe);
  const stamp = generateArcology(recipe, { stage, facing: FACING.east, seed: 0 });
  return {
    id: `arcology:${recipe.kind}`,
    kind: 'arcology',
    band: 'arcologies',
    label: ARCOLOGY_LABELS[recipe.kind],
    note: 'The megastructure: four uses at different heights inside one volume.',
    stamp,
    info: [
      { label: 'Form', value: recipe.kind },
      { label: 'Stage', value: `${stage} of ${maxStageOf(recipe)}` },
      { label: 'Seed', value: '0' },
      { label: 'Facing', value: 'east' },
      { label: 'Bands', value: recipe.bands.map((band) => band.label).join(' · ') },
    ],
  };
}

/** Un ripiano: il tratto di y di una riga, e quanto e' larga in x. */
interface PlinthStrip {
  readonly y0: number;
  readonly y1: number;
  readonly x0: number;
  readonly x1: number;
}

/** Una galleria piazzata: i suoi soggetti, i suoi ripiani, e quanto occlude. */
interface BandLayout {
  readonly subjects: readonly SwatchCatalogSubject[];
  readonly strips: readonly PlinthStrip[];
  /** Profondita' complessiva, dal bordo posteriore della prima riga a quello anteriore dell'ultima. */
  readonly depth: number;
  /** Quota della riga piu' arretrata: e' lei a coprire cio' che le sta dietro. */
  readonly rearTop: number;
}

/** Vuoto fra due fasce: quello dichiarato, o quanto ne chiede chi sta davanti. */
function bandGapFor(frontTop: number): number {
  return Math.max(SWATCH.bandGap, clearanceBehind(frontTop));
}

/**
 * Accoda le gallerie all'indietro, ciascuna dietro la precedente.
 *
 * Il vuoto non e' una costante: e' la quota della **riga piu' arretrata** di
 * cio' che sta davanti, cioe' la sola cosa che possa coprire la fascia che si
 * sta piazzando. Una galleria che cresce in altezza allarga da se' il proprio
 * scostamento, invece di finire dietro un muro.
 */
function stackBehind(
  bands: readonly (readonly (readonly PendingCatalogSubject[])[])[],
  frontY: number,
  frontTop: number,
): readonly BandLayout[] {
  const placed: BandLayout[] = [];
  let y = frontY;
  let top = frontTop;
  for (const rows of bands) {
    const band = placeRows(rows);
    const y0 = y - bandGapFor(top) - band.depth;
    placed.push(translateBand(band, y0));
    y = y0;
    top = band.rearTop;
  }
  return placed;
}

/**
 * Le righe di una galleria a partire da `y = 0`, poi tradotte da chi le accoda.
 *
 * **Due distacchi, due regole diverse, e nessuna delle due e' un gusto.** In y
 * fra due righe serve la quota di quella davanti, o la fila davanti taglia le
 * gambe a quella dietro. In x fra due vicini serve invece la **profondita'** del
 * soggetto a x maggiore: li' l'altezza non conta affatto, ed e' il motivo per
 * cui quindici megastrutture da settecento voxel si separano spendendo poche
 * decine di voxel di fila invece di centinaia. Il conto sta in
 * `swatchOcclusion.ts`.
 */
function placeRows(rows: readonly (readonly PendingCatalogSubject[])[]): BandLayout {
  const filled = rows.filter((row) => row.length > 0);
  const subjects: SwatchCatalogSubject[] = [];
  const strips: PlinthStrip[] = [];
  const margin = SWATCH.plinthMargin;
  let y = 0;
  let rearTop = 0;

  for (let index = 0; index < filled.length; index++) {
    const row = filled[index];
    let x = 0;
    let depth = 0;
    for (const pending of row) {
      if (x > 0) x += Math.max(SWATCH_ITEM_GAP, clearanceBeside(pending.stamp.sizeY));
      const rect = { x0: x, y0: y, x1: x + pending.stamp.sizeX, y1: y + pending.stamp.sizeY };
      subjects.push({
        ...pending,
        row: -1,
        col: -1,
        rect,
        z0: SWATCH.groundZ,
        z1: SWATCH.groundZ + pending.stamp.sizeZ,
      });
      x = rect.x1;
      depth = Math.max(depth, pending.stamp.sizeY);
    }

    strips.push({ y0: y - margin, y1: y + depth + margin, x0: -margin, x1: x + margin });
    if (index === 0) rearTop = rowTop(row);
    y += depth;
    const next = filled[index + 1];
    if (next !== undefined) y += bandGapFor(rowTop(next));
  }

  return { subjects, strips, depth: y, rearTop };
}

/** Quota a cui arriva la riga, basamento compreso. */
function rowTop(row: readonly PendingCatalogSubject[]): number {
  return row.reduce((top, pending) => Math.max(top, SWATCH.groundZ + pending.stamp.sizeZ), 0);
}

function translateBand(band: BandLayout, y0: number): BandLayout {
  return {
    ...band,
    subjects: band.subjects.map((subject) => ({
      ...subject,
      rect: { ...subject.rect, y0: subject.rect.y0 + y0, y1: subject.rect.y1 + y0 },
    })),
    strips: band.strips.map((strip) => ({ ...strip, y0: strip.y0 + y0, y1: strip.y1 + y0 })),
  };
}

function baseSubjects(): readonly SwatchSubject[] {
  const subjects: SwatchSubject[] = [];
  for (let row = 0; row < SWATCH_ROWS; row++) {
    for (let col = 0; col < SWATCH_COLUMNS; col++) {
      const rect = matrixCellRect(row, col);
      const cell = baseCellAt(rect.x0, rect.y0)!;
      subjects.push({
        id: `matrix:${row}:${col}`,
        kind: 'matrix',
        band: cell.band,
        label: cell.label,
        note: cell.note,
        row,
        col,
        rect,
        z0: SWATCH.groundZ,
        z1: SWATCH.groundZ + CELL_HEIGHT,
        stamp: null,
        info: [
          { label: 'Slot', value: `${PALETTE_SLOT_NAMES[col]} (${col})` },
          { label: 'Surface', value: `${SURFACE_KIND_NAMES[row]} (${row})` },
        ],
      });
    }
  }

  for (let index = 0; index < SWATCH_PILLARS; index++) {
    const rect = strataPillarRect(index);
    const cell = baseCellAt(rect.x0, rect.y0)!;
    subjects.push({
      id: `strata:${index}`,
      kind: 'strata',
      band: cell.band,
      label: cell.label,
      note: cell.note,
      row: -1,
      col: -1,
      rect,
      z0: SWATCH.groundZ,
      z1: SWATCH.groundZ + SWATCH.pillarHeight,
      stamp: null,
      info: [{ label: 'Index', value: String(index) }],
    });
  }

  for (let index = 0; index < SCALE_ITEMS.length; index++) {
    const item = SCALE_ITEMS[index];
    const rect = { x0: item.x0, y0: SCALE_ORIGIN_Y, x1: item.x0 + item.width, y1: SCALE_ORIGIN_Y + item.depth };
    const cell = baseCellAt(rect.x0, rect.y0)!;
    subjects.push({
      id: `scale:${item.kind}:${index}`,
      kind: 'scale',
      band: cell.band,
      label: cell.label,
      note: cell.note,
      row: -1,
      col: -1,
      rect,
      z0: SWATCH.groundZ,
      z1: SWATCH.groundZ + scaleHeight(item),
      stamp: null,
      info: [
        { label: 'Kind', value: item.kind },
        ...(item.kind === 'tree' ? [{ label: 'Species', value: String(item.species) }] : []),
      ],
    });
  }
  return subjects;
}

function scaleHeight(item: (typeof SCALE_ITEMS)[number]): number {
  if (item.kind === 'cells') return SWATCH.stairSteps * TERRAIN.cellSize;
  if (item.kind === 'building') return SWATCH.referenceHeight;
  const shape = TREE_SHAPES[item.species];
  const centreX = item.x0 + Math.floor(SWATCH.treePitch / 2);
  const centreY = SCALE_ORIGIN_Y + Math.floor(SWATCH.treePitch / 2);
  const tree = treeSpec(centreX, centreY, item.species, shape.trunk[0]);
  return treeTop(tree, SWATCH.groundZ) - SWATCH.groundZ;
}

function completeExtent(): SwatchExtent {
  const gallery = subjectsExtent(SWATCH_CATALOG_SUBJECTS);
  const minX = Math.min(BASE_EXTENT.minX, gallery.minX - SWATCH.plinthMargin);
  const minY = Math.min(BASE_EXTENT.minY, gallery.minY - SWATCH.plinthMargin);
  const maxX = Math.max(
    BASE_EXTENT.minX + BASE_EXTENT.sizeX,
    gallery.minX + gallery.sizeX + SWATCH.plinthMargin,
  );
  const maxY = Math.max(
    BASE_EXTENT.minY + BASE_EXTENT.sizeY,
    gallery.minY + gallery.sizeY + SWATCH.plinthMargin,
  );
  return {
    minX,
    minY,
    sizeX: maxX - minX,
    sizeY: maxY - minY,
    sizeZ: Math.max(BASE_EXTENT.sizeZ, gallery.sizeZ),
  };
}

function subjectsExtent(subjects: readonly SwatchSubject[]): SwatchExtent {
  if (subjects.length === 0) return { minX: 0, minY: 0, sizeX: 0, sizeY: 0, sizeZ: SWATCH.groundZ };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ: number = SWATCH.groundZ;
  for (const subject of subjects) {
    minX = Math.min(minX, subject.rect.x0);
    minY = Math.min(minY, subject.rect.y0);
    maxX = Math.max(maxX, subject.rect.x1);
    maxY = Math.max(maxY, subject.rect.y1);
    maxZ = Math.max(maxZ, subject.z1);
  }
  return { minX, minY, sizeX: maxX - minX, sizeY: maxY - minY, sizeZ: maxZ };
}

function padded(extent: SwatchExtent, margin: number): SwatchExtent {
  return {
    minX: extent.minX - margin,
    minY: extent.minY - margin,
    sizeX: extent.sizeX + margin * 2,
    sizeY: extent.sizeY + margin * 2,
    sizeZ: extent.sizeZ,
  };
}


// Tiene il riferimento di scala agganciato allo stesso catalogo: se l'id
// sparisse, il problema deve emergere al caricamento del campionario.
void typologyById(SWATCH.referenceTypology);
void BIOME_NAMES;
