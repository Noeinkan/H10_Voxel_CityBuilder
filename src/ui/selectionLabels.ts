import { CLASS_LABELS, type BuildingClass, type CatalystEffects } from '../sim';
import { PALETTE_SLOT_NAMES } from '../engine/paletteSlots';
import { SURFACE_KIND_NAMES, WATER_CLASS, type SurfaceKind } from '../world/visualBlock';
import { GROUND, type GroundKind } from '../world/grading/grade';
import { STREET_ROLE, type StreetRole } from '../world/streets/streetGrid';
import { TIER, type SkylineTier } from '../world/skyline/tiers';
import { AERIAL_PART, type AerialPart } from '../world/aerial/config';
import { SPAN_KIND, type SpanKind } from '../world/spans/config';
import type { BuildingRecord } from '../world/buildings/BuildingRegistry';
import type { ColumnInfo, VoxelInfo } from '../game/selection';

/**
 * Come si chiamano, nella scheda, le cose che il mondo enumera con dei bit.
 *
 * Sta in un file suo per la ragione di `AGENTS.md` e per la stessa linea di
 * taglio di `prospects.ts`: la scheda era oltre il budget prima di guadagnare
 * verdetti e barre, e **dare un nome** non e' lo stesso lavoro di **decidere
 * cosa mostrare**. Queste tabelle cambiano quando cambia un'enumerazione del
 * mondo; le sezioni cambiano quando cambia la domanda del giocatore.
 *
 * Tutto in inglese, come ogni stringa a schermo, e provato di la' insieme alle
 * righe che le usano.
 */

export const GROUND_LABELS: Readonly<Record<GroundKind, string>> = {
  [GROUND.flat]: 'flat ground',
  [GROUND.sloped]: 'terraced slope',
  [GROUND.shore]: 'quay',
  [GROUND.rock]: 'rock',
  [GROUND.refused]: 'unworkable',
};

export const ROLE_LABELS: Readonly<Record<StreetRole, string>> = {
  [STREET_ROLE.arterial]: 'arterial road',
  [STREET_ROLE.minor]: 'minor road',
  [STREET_ROLE.frontage]: 'street frontage',
  [STREET_ROLE.interior]: 'block interior',
};

export const TIER_LABELS: Readonly<Record<SkylineTier, string>> = {
  [TIER.fringe]: 'fringe',
  [TIER.middle]: 'middle',
  [TIER.core]: 'core',
};

export const SPAN_LABELS: Readonly<Record<SpanKind, string>> = {
  [SPAN_KIND.bridge]: 'Skybridge',
  [SPAN_KIND.mezzanine]: 'Mezzanine',
  [SPAN_KIND.plaza]: 'Elevated plaza',
};

export const AERIAL_LABELS: Readonly<Record<AerialPart, string>> = {
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
export function effectSummary(effects: CatalystEffects): string {
  const parts: string[] = [];
  for (const { key, label } of EFFECT_LABELS) {
    const value = effects[key];
    if (value === 0) continue;
    parts.push(`${label} ${value > 0 ? '+' : '-'}${Math.abs(value)}`);
  }
  return parts.join(' · ');
}

export function siteValue(column: ColumnInfo): string {
  const ground = GROUND_LABELS[column.ground];
  if (column.ground === GROUND.refused) return `${ground}, nothing can be built`;
  if (column.ground === GROUND.flat) return ground;
  return `${ground}, costs ×${column.buildWeight}`;
}

export function demandValue(column: ColumnInfo): string {
  return CLASS_LABELS
    .map((label, cls) => `${label} ${column.desirability[cls]}`)
    .join(' · ');
}

export function profileLabel(column: ColumnInfo): string {
  const { district, specialization } = column.profile;
  return specialization === null ? district : `${district} · ${specialization}`;
}

export function districtLabel(record: BuildingRecord): string {
  const district = record.district ?? 'outskirts';
  const specialization = record.specialization ?? null;
  return specialization === null ? district : `${district} · ${specialization}`;
}

export function surfaceLabel(voxel: VoxelInfo): string {
  if (voxel.water) return WATER_LABELS[voxel.surface] ?? 'water';
  return SURFACE_KIND_NAMES[voxel.surface as SurfaceKind] ?? 'plain';
}

export function paletteLabel(palette: number): string {
  const name = PALETTE_SLOT_NAMES[palette];
  if (name === undefined) return 'empty';
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function classLabel(cls: BuildingClass): string {
  return CLASS_LABELS[cls] ?? 'urban';
}

export function capitalise(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

export function plural(count: number): string {
  return count === 1 ? '' : 's';
}
