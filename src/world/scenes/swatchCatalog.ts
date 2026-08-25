import { PALETTE_SLOT_NAMES } from '../../engine/paletteSlots';
import { CATALYSTS, type CatalystDefinition } from '../../sim/catalysts';
import { CLASS_NAMES } from '../../sim/classes';
import {
  TYPOLOGIES,
  typologyById,
  type TypologyDefinition,
  type TypologyShape,
} from '../buildings/config';
import { generateBuilding } from '../buildings/generate';
import type { VoxelStamp } from '../buildings/stamp';
import { typologyProfile } from '../buildings/typology';
import {
  LANDMARKS,
  SKYPORT,
  maxStageOf,
  variantsOf,
  type LandmarkRecipe,
  type PartsRecipe,
} from '../landmarks/config';
import { generateFromRecipe, variantIndexOf } from '../landmarks/generate';
import { FACING } from '../streets/streetGrid';
import { BIOME_NAMES, TERRAIN } from '../terrain/config';
import { treeSpec, treeTop } from '../terrain/decor';
import { TREE_SHAPES } from '../terrain/flora';
import { SURFACE_KIND_NAMES } from '../visualBlock';
import {
  CELL_FOOTPRINT,
  CELL_HEIGHT,
  SCALE_ITEMS,
  SCALE_ORIGIN_Y,
  SWATCH,
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

/** Vuoto minimo fra due soggetti del campionario. */
export const SWATCH_ITEM_GAP = 8;

/** Livello comune che rende confrontabili tutte le tipologie. */
export const SWATCH_BUILDING_LEVEL = 6;

export const SWATCH_FOCUS = {
  matrix: 'matrix',
  scale: 'scale',
  buildings: 'buildings',
  landmarks: 'landmarks',
  all: 'all',
} as const;

export type SwatchFocus = (typeof SWATCH_FOCUS)[keyof typeof SWATCH_FOCUS];

export const SWATCH_FOCUSES: readonly SwatchFocus[] = [
  SWATCH_FOCUS.matrix,
  SWATCH_FOCUS.scale,
  SWATCH_FOCUS.buildings,
  SWATCH_FOCUS.landmarks,
  SWATCH_FOCUS.all,
];

export type SwatchSubjectKind = 'matrix' | 'strata' | 'scale' | 'building' | 'landmark';

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
  readonly kind: 'building' | 'landmark';
  readonly stamp: VoxelStamp;
}

interface PendingCatalogSubject {
  readonly id: string;
  readonly kind: 'building' | 'landmark';
  readonly band: 'buildings' | 'landmarks';
  readonly label: string;
  readonly note: string | null;
  readonly info: readonly SwatchInfoRow[];
  readonly stamp: VoxelStamp;
}

const BASE_EXTENT = baseExtentOf();
const BUILDING_START_Y = BASE_EXTENT.minY + BASE_EXTENT.sizeY + SWATCH.bandGap;
const BUILDING_ROWS = buildingRows();
const BUILDING_LAYOUT = placeRows(BUILDING_ROWS, BUILDING_START_Y);
const LANDMARK_START_Y = BUILDING_LAYOUT.y1 + SWATCH.bandGap;
const LANDMARK_ROWS = landmarkRows();
const LANDMARK_LAYOUT = placeRows(LANDMARK_ROWS, LANDMARK_START_Y);

export const SWATCH_BUILDINGS: readonly SwatchCatalogSubject[] = BUILDING_LAYOUT.subjects;
export const SWATCH_LANDMARKS: readonly SwatchCatalogSubject[] = LANDMARK_LAYOUT.subjects;
export const SWATCH_CATALOG_SUBJECTS: readonly SwatchCatalogSubject[] = [
  ...SWATCH_BUILDINGS,
  ...SWATCH_LANDMARKS,
];

const BASE_SUBJECTS = baseSubjects();
export const SWATCH_SUBJECTS: readonly SwatchSubject[] = [
  ...BASE_SUBJECTS,
  ...SWATCH_CATALOG_SUBJECTS,
];

const BUILDING_EXTENT = subjectsExtent(SWATCH_BUILDINGS);
const LANDMARK_EXTENT = subjectsExtent(SWATCH_LANDMARKS);
const FULL_EXTENT = completeExtent();

export function swatchExtent(): SwatchExtent {
  return FULL_EXTENT;
}

/** Inquadratura di una fascia, con un margine che non appartiene agli oggetti. */
export function swatchFocusExtent(focus: SwatchFocus): SwatchExtent {
  if (focus === SWATCH_FOCUS.all) return FULL_EXTENT;
  if (focus === SWATCH_FOCUS.buildings) return padded(BUILDING_EXTENT, SWATCH_ITEM_GAP);
  if (focus === SWATCH_FOCUS.landmarks) return padded(LANDMARK_EXTENT, SWATCH_ITEM_GAP);

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

/** Basamento delle nuove fasce; un tratto vuoto produce una riga senza scritture. */
export function swatchPlinthSpanAt(y: number): { readonly x0: number; readonly x1: number } {
  const baseY1 = BASE_EXTENT.minY + BASE_EXTENT.sizeY;
  if (y < baseY1) return basePlinthSpanAt(y);
  if (y >= BUILDING_EXTENT.minY && y < BUILDING_EXTENT.minY + BUILDING_EXTENT.sizeY) {
    return bandPlinth(BUILDING_EXTENT);
  }
  if (y >= LANDMARK_EXTENT.minY && y < LANDMARK_EXTENT.minY + LANDMARK_EXTENT.sizeY) {
    return bandPlinth(LANDMARK_EXTENT);
  }
  return { x0: 0, x1: 0 };
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
    note: definition.id,
    stamp,
    info: [
      { label: 'ID', value: definition.id },
      { label: 'Uso', value: CLASS_NAMES[definition.use] },
      { label: 'Livello', value: String(SWATCH_BUILDING_LEVEL) },
      { label: 'Seed', value: '0' },
      { label: 'Fronte', value: 'est' },
      { label: 'Forma', value: shapeLabel(definition.shape) },
      { label: 'Condizioni', value: requirementLabel(definition) },
    ],
  };
}

function landmarkRows(): readonly (readonly PendingCatalogSubject[])[] {
  return CATALYSTS.map((catalyst) => {
    const recipe = LANDMARKS[catalyst.id];
    if (recipe === undefined) return [];
    const row = variantsOf(recipe).map((variant, index) => landmarkSubject(catalyst, recipe, index, variant.name));
    if (catalyst.id === 'airport') row.push(skyportSubject(catalyst));
    return row;
  });
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
    info: landmarkInfo(catalyst, variantName, stage, seed, recipe, false),
  };
}

function skyportSubject(catalyst: CatalystDefinition): PendingCatalogSubject {
  const stage = maxStageOf(SKYPORT);
  const seed = 0;
  return {
    id: 'landmark:airport:skyport',
    kind: 'landmark',
    band: 'landmarks',
    label: 'Airport · Skyport',
    note: 'Scalo in quota per dirigibili, eVTOL e mongolfiere.',
    stamp: generateFromRecipe(SKYPORT, { stage, facing: FACING.east, seed }),
    info: landmarkInfo(catalyst, 'skyport', stage, seed, SKYPORT, true),
  };
}

function landmarkInfo(
  catalyst: CatalystDefinition,
  variant: string,
  stage: number,
  seed: number,
  recipe: PartsRecipe,
  aloft: boolean,
): readonly SwatchInfoRow[] {
  return [
    { label: 'Ruolo', value: catalyst.id },
    { label: 'Variante', value: variant },
    { label: 'Stadio', value: `${stage} di ${maxStageOf(recipe)}` },
    { label: 'Seed', value: String(seed) },
    { label: 'Fronte', value: 'est' },
    { label: 'Luogo', value: aloft ? 'in quota' : catalyst.site },
    { label: 'Grembiule', value: `${'apron' in recipe ? recipe.apron : 0} voxel` },
  ];
}

function seedForVariant(recipe: PartsRecipe, wanted: number): number {
  for (let seed = 0; seed < 10_000; seed++) {
    if (variantIndexOf(recipe, seed) === wanted) return seed;
  }
  throw new Error(`nessun seed per la variante landmark ${wanted}`);
}

function shapeLabel(shape: TypologyShape): string {
  const tags = [`corona ${shape.crownKind}`];
  if (shape.podiumBands > 0) tags.push(`podio ${shape.podiumBands}`);
  if (shape.courtyard) tags.push('corte');
  if (shape.roofGarden) tags.push('giardino pensile');
  if (shape.arcade) tags.push('portico');
  if (shape.chamfer > 0) tags.push(`smusso ${shape.chamfer}`);
  if (shape.overhang > 0) tags.push(`sbalzo ${shape.overhang}`);
  return tags.join(' · ');
}

function requirementLabel(definition: TypologyDefinition): string {
  const terms: string[] = [];
  if (definition.mixed !== undefined) terms.push(`misto ${CLASS_NAMES[definition.mixed]}`);
  if (definition.specialization !== undefined) terms.push(definition.specialization);
  if (definition.lotRole !== undefined) terms.push(`lotto ${definition.lotRole}`);
  if (definition.coastal === true) terms.push('costa');
  if (definition.minLevel !== undefined) terms.push(`livello ≥ ${definition.minLevel}`);
  if (definition.districts !== undefined) terms.push(`distretti ${definition.districts.join(', ')}`);
  return terms.length === 0 ? 'ripiego del catalogo' : terms.join(' · ');
}

function placeRows(
  rows: readonly (readonly PendingCatalogSubject[])[],
  y0: number,
): { readonly subjects: readonly SwatchCatalogSubject[]; readonly y1: number } {
  const subjects: SwatchCatalogSubject[] = [];
  let y = y0;
  for (const row of rows) {
    let x = 0;
    let depth = 0;
    for (const pending of row) {
      const rect = { x0: x, y0: y, x1: x + pending.stamp.sizeX, y1: y + pending.stamp.sizeY };
      subjects.push({
        ...pending,
        row: -1,
        col: -1,
        rect,
        z0: SWATCH.groundZ,
        z1: SWATCH.groundZ + pending.stamp.sizeZ,
      });
      x = rect.x1 + SWATCH_ITEM_GAP;
      depth = Math.max(depth, pending.stamp.sizeY);
    }
    y += depth + SWATCH_ITEM_GAP;
  }
  return { subjects, y1: Math.max(y0, y - SWATCH_ITEM_GAP) };
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
          { label: 'Superficie', value: `${SURFACE_KIND_NAMES[row]} (${row})` },
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
      info: [{ label: 'Indice', value: String(index) }],
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
        { label: 'Tipo', value: item.kind },
        ...(item.kind === 'tree' ? [{ label: 'Specie', value: String(item.species) }] : []),
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
  let maxZ = SWATCH.groundZ;
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

function bandPlinth(extent: SwatchExtent): { readonly x0: number; readonly x1: number } {
  return {
    x0: extent.minX - SWATCH.plinthMargin,
    x1: extent.minX + extent.sizeX + SWATCH.plinthMargin,
  };
}

// Tiene il riferimento di scala agganciato allo stesso catalogo: se l'id
// sparisse, il problema deve emergere al caricamento del campionario.
void typologyById(SWATCH.referenceTypology);
void BIOME_NAMES;
