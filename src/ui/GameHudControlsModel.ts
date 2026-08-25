import { CLASS_LABELS, type BuildingClass, type CatalystId } from '../sim';
import { DAYLIGHT, DAYLIGHT_MODE, nextDaylightMode, type DaylightMode } from '../engine/daylight';
import type { HudAction } from './GameHudModel';

export type GameTool =
  | { readonly kind: 'catalyst'; readonly class: BuildingClass; readonly id?: CatalystId }
  | { readonly kind: 'expansion' }
  | { readonly kind: 'terrace' }
  | { readonly kind: 'ropeway' }
  | { readonly kind: 'none' };

export interface HudDaylight {
  readonly mode: DaylightMode;
  readonly label: string;
  readonly tooltip: string;
  readonly next: DaylightMode;
  readonly frozen: boolean;
}

const DAYLIGHT_LABEL: Readonly<Record<DaylightMode, string>> = {
  [DAYLIGHT_MODE.cycle]: 'Auto',
  [DAYLIGHT_MODE.day]: 'Day',
  [DAYLIGHT_MODE.night]: 'Night',
};

const DAYLIGHT_NOTE: Readonly<Record<DaylightMode, string>> = {
  [DAYLIGHT_MODE.cycle]: `the clock runs, a full day takes ${Math.round(DAYLIGHT.daySeconds / 60)} minutes`,
  [DAYLIGHT_MODE.day]: 'the sun stays up',
  [DAYLIGHT_MODE.night]: 'the city stays lit',
};

export function daylightControl(mode: DaylightMode): HudDaylight {
  const next = nextDaylightMode(mode);
  return {
    mode,
    label: DAYLIGHT_LABEL[mode],
    tooltip: `Daylight: ${DAYLIGHT_LABEL[mode]} — ${DAYLIGHT_NOTE[mode]}. Click for ${DAYLIGHT_LABEL[next]}, or press L.`,
    next,
    frozen: mode !== DAYLIGHT_MODE.cycle,
  };
}

export function selectionMessage(tool: GameTool, catalysts: readonly HudAction[]): string | null {
  if (tool.kind === 'catalyst') {
    if (tool.id === undefined) {
      const legacyLabel = CLASS_LABELS[tool.class] ?? 'Catalyst';
      return `${legacyLabel} selected · click the island to place it · Esc to cancel`;
    }
    const action = catalysts.find((candidate) => candidate.catalystId === tool.id);
    return `${action?.label ?? 'Catalyst'} selected · click the island to place it · Esc to cancel`;
  }
  if (tool.kind === 'expansion') return 'Expansion selected · choose a coastline edge · Esc to cancel';
  if (tool.kind === 'terrace') return 'Terrace selected · click a tall building · Esc to cancel';
  if (tool.kind === 'ropeway') {
    return 'Ropeway selected · click a shore facing the water · Esc to cancel';
  }
  return null;
}
