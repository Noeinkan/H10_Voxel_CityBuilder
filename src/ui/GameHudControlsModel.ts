import { CLASS_LABELS, type BuildingClass, type CatalystId } from '../sim';
import type { HudAction } from './GameHudModel';

// Il cielo vive in un file suo perche' lo legge anche il titolo, che non deve
// caricare `src/sim` per scrivere «Auto». Qui si riespone per chi lo cercava.
export { daylightControl } from './daylightControl';
export type { HudDaylight } from './daylightControl';

/**
 * Il verso in cui un catalizzatore si posa, quando il ruolo sa fare entrambi.
 *
 * Solo i ruoli con una forma di facciata (`hasFacadeForm`) lo usano: `ground`
 * poggia sul suolo come sempre, `aloft` appende la struttura a un tetto. Per
 * tutti gli altri il modo non esiste e `ground` e' l'unico verso possibile.
 */
export type PlacementMode = 'ground' | 'aloft';

export type GameTool =
  | { readonly kind: 'catalyst'; readonly class: BuildingClass; readonly id?: CatalystId; readonly mode?: PlacementMode }
  | { readonly kind: 'expansion' }
  | { readonly kind: 'terrace' }
  | { readonly kind: 'ropeway' }
  | { readonly kind: 'demolish' }
  | { readonly kind: 'none' };

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
  if (tool.kind === 'demolish') {
    return 'Demolish selected · drag across buildings to tear them down · Esc to cancel';
  }
  return null;
}
