import type { CatalystSite } from '../../sim';
import { GROUND, groundKindOf, planGrade, type GroundColumn } from '../grading/grade';
import { TERRAIN } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';
import { SITE } from './config';

/**
 * Dove un ruolo ha senso, letto sul terreno vero.
 *
 * **Perche' non sta in `src/sim/`.** La definizione del catalizzatore porta
 * un'etichetta — `'coastal'`, `'open'` — e non sa cosa significhi: la
 * simulazione ragiona per cella e non ha una coordinata verticale, tanto meno
 * una linea di costa (invariante 7). Tradurre l'etichetta in una risposta e'
 * lavoro di `src/world/`, come gia' lo e' risolvere un isolato in un lotto.
 *
 * **Perche' non sta in `grading/`.** Quel dominio risponde a "cosa serve
 * costruire perche' regga", e la sua risposta e' un prezzo. Qui la domanda e'
 * un'altra — "questo ruolo ci sta?" — e la risposta e' un si' o un no che
 * nessuna opera compra.
 */

/** Perche' un ruolo non sta in questa colonna. */
export type SiteRefusal = 'needs-coast' | 'needs-open-ground';

/** I quattro assi cardinali, per la ricerca dell'acqua. */
const AXES: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * true se la colonna vede il mare entro `radius`.
 *
 * Guarda solo i quattro assi e non l'intero quadrato: chi cerca l'acqua ha
 * bisogno di sapere se ce n'e' *davanti*, e il quadrato costerebbe il quadrato
 * del raggio per ogni colonna valutata.
 *
 * Una colonna non ancora generata non e' acqua: al bordo dello streaming si
 * salta, invece di promettere una costa che potrebbe non esserci.
 */
export function seesWater(map: TerrainMap, x: number, y: number, radius: number): boolean {
  for (let d = 1; d <= radius; d++) {
    for (const [dx, dy] of AXES) {
      const column = map.columnAt(x + dx * d, y + dy * d);
      if (column === null) continue;
      if (column.height <= TERRAIN.seaLevel) return true;
    }
  }
  return false;
}

/**
 * true se un quadrato di lato `span` centrato qui regge un piano unico.
 *
 * E' il vincolo opposto a quello costiero, e la ragione per cui si valuta un
 * intorno e non la colonna cliccata: una pista sta su una superficie, e una
 * superficie e' esattamente cio' che una singola colonna non sa descrivere —
 * il fianco di una collina passerebbe colonna per colonna e resterebbe un fianco.
 *
 * Riusa `planGrade`, che e' gia' la domanda "questa impronta regge?", e vi
 * aggiunge un tetto proprio: `GRADING.maxWorksStep` e' tarato sulla banchina che
 * scende sul fondale, quindi direbbe di si' a un terreno che nessuno chiamerebbe
 * piano.
 */
export function openGround(
  map: TerrainMap,
  x: number,
  y: number,
  span: number,
  maxStep: number,
): boolean {
  const half = Math.floor(span / 2);
  const columns: GroundColumn[] = [];

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (!map.has(cx, cy)) return false;
      const kind = groundKindOf(map.biomeAt(cx, cy), map.slopeAt(cx, cy), map.heightAt(cx, cy));
      if (kind === GROUND.refused) return false;
      columns.push({ kind, height: map.heightAt(cx, cy) });
    }
  }

  const plan = planGrade(columns);
  return plan !== null && plan.padZ - plan.footZ <= maxStep;
}

/**
 * Il motivo per cui questo ruolo non sta qui, o null se ci sta.
 *
 * L'unico punto in cui l'etichetta della definizione diventa una domanda sul
 * terreno. Chi la chiama non deve sapere quale regola valga per quale ruolo:
 * quella corrispondenza e' il catalogo, e vive in `src/sim/catalysts.ts`.
 */
export function siteRefusal(
  map: TerrainMap,
  x: number,
  y: number,
  rule: CatalystSite,
): SiteRefusal | null {
  if (rule === 'coastal') {
    return seesWater(map, x, y, SITE.coastalRadius) ? null : 'needs-coast';
  }
  if (rule === 'open') {
    return openGround(map, x, y, SITE.openSpan, SITE.openMaxStep) ? null : 'needs-open-ground';
  }
  return null;
}
