import type { CatalystSite } from '../../sim';
import { FACING, type Facing } from '../streets/streetGrid';
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
export type SiteRefusal = 'needs-coast' | 'needs-open-ground' | 'needs-waterfront';

/**
 * I quattro assi cardinali, per la ricerca dell'acqua.
 *
 * L'ordine **non** e' libero: coincide con quello di `FACING`, cosi' che
 * l'indice di un asse sia gia' il verso che gli corrisponde. `AXIS_FACING` lo
 * dichiara invece di lasciarlo dedurre, perche' e' il genere di corrispondenza
 * che sopravvive finche' nessuno riordina un array.
 */
const AXES: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const AXIS_FACING: readonly Facing[] = [FACING.east, FACING.west, FACING.north, FACING.south];

/** L'acqua piu' vicina sui quattro assi: da che parte, a quante colonne, a che quota. */
export interface WaterSight {
  readonly facing: Facing;
  readonly distance: number;
  /**
   * Quota dello specchio trovato: il livello del mare, o quello di un lago in
   * quota. E' cio' che distingue il mare dal lago senza un secondo sondaggio.
   */
  readonly waterZ: number;
}

/**
 * L'acqua piu' vicina sui quattro assi, o null se non ce n'e' entro `radius`.
 *
 * Guarda solo i quattro assi e non l'intero quadrato: chi cerca l'acqua ha
 * bisogno di sapere se ce n'e' *davanti*, e il quadrato costerebbe il quadrato
 * del raggio per ogni colonna valutata. Cerca a distanza crescente, quindi cio'
 * che esce e' l'acqua piu' vicina e non quella del primo asse dell'elenco.
 *
 * Una colonna non ancora generata non e' acqua: al bordo dello streaming si
 * salta, invece di promettere una costa che potrebbe non esserci.
 *
 * **Una marcia sola per quattro domande** — se c'e' il mare, da che parte,
 * quanto lontano, e le prime due insieme. Le tre scorciatoie qui sotto sono la
 * stessa risposta letta in tre modi: tenerle come tre cicli separati significava
 * che il porto, che le vuole tutte e due, scorreva il terreno due volte per
 * ottenere due meta' della stessa cosa.
 *
 * Due letture senza allocazione invece di `columnAt`, che costruirebbe un
 * oggetto per colonna. Non e' microtaratura: la gerarchia verticale la chiama
 * una volta per record esaminato in una passata di upgrade, e `catalystFailure`
 * una volta per `pointermove`.
 *
 * **«Costa» e «acqua» non sono la stessa colonna**, e `afloat` e' la differenza.
 * `IslandGenerator` scrive i voxel d'acqua solo dove la cima della colonna sta
 * *sotto* il pelo del mare; la colonna a quota esatta di `seaLevel` e' quindi
 * asciutta, ed e' comunque battigia — bagnata, in vista del mare, un sito
 * costiero a tutti gli effetti. Su quest'isola le quote sono quantizzate al cubo
 * di terreno, quindi quell'orlo non e' una riga: e' una fascia larga celle
 * intere. Chi chiede «questo posto e' sul mare?» la vuole dentro; chi ci deve
 * posare uno scafo la vuole fuori, e chiederla dentro e' esattamente il difetto
 * che teneva il porto senza barche — la darsena si fermava sulla sabbia.
 */
export function sightWater(
  map: TerrainMap,
  x: number,
  y: number,
  radius: number,
  /** Vero per fermarsi solo dove un mezzo galleggia davvero. */
  afloat = false,
): WaterSight | null {
  const level = afloat ? TERRAIN.seaLevel - 1 : TERRAIN.seaLevel;
  return scanWater(map, x, y, radius, 'sea', level);
}

/**
 * L'acqua piu' vicina sui quattro assi **a qualsiasi quota**, o null.
 *
 * E' `sightWater` per chi non si accontenta del mare: il criterio non e' una
 * quota assoluta ma la colonna stessa — e' acqua dove lo specchio della colonna
 * (`waterTop`) sta sopra il suo terreno, sia esso il mare o il lago che la
 * contiene. E' l'unico modo in cui un lago in quota, invisibile a `sightWater`,
 * diventa un fronte su cui una marina puo' affacciarsi.
 *
 * **Non ha la variante `afloat`, e non e' un'omissione.** La distinzione fra
 * battigia e acqua a galla nasce dalla piattaforma di bassofondo **marina**,
 * asciutta a quota esatta del pelo del mare; sul lago una piattaforma simile non
 * esiste — la riva e' la scarpata della conca, che legge come terra — quindi qui
 * «sommersa» e' l'unica domanda che abbia senso porre.
 */
export function sightAnyWater(
  map: TerrainMap,
  x: number,
  y: number,
  radius: number,
): WaterSight | null {
  return scanWater(map, x, y, radius, 'any', 0);
}

/**
 * Una marcia sola per le due domande che il fronte acqua pone.
 *
 * Il ciclo e' condiviso fra `sightWater` e `sightAnyWater` senza chiudere un
 * predicato per chiamata: questo sta nel percorso caldo — la gerarchia
 * verticale lo chiama una volta per record in una passata di upgrade, e
 * `catalystFailure` una volta per `pointermove` — quindi il criterio viaggia
 * come un modo, non come una funzione da allocare.
 */
function scanWater(
  map: TerrainMap,
  x: number,
  y: number,
  radius: number,
  mode: 'sea' | 'any',
  level: number,
): WaterSight | null {
  for (let d = 1; d <= radius; d++) {
    for (let axis = 0; axis < AXES.length; axis++) {
      const [dx, dy] = AXES[axis];
      const cx = x + dx * d;
      const cy = y + dy * d;
      if (!map.has(cx, cy)) continue;
      const water = mode === 'any'
        ? map.waterTopAt(cx, cy) > map.heightAt(cx, cy)
        : map.heightAt(cx, cy) <= level;
      if (water) {
        return { facing: AXIS_FACING[axis], distance: d, waterZ: map.waterTopAt(cx, cy) };
      }
    }
  }
  return null;
}

/** Colonne fino all'acqua piu' vicina, o null entro `radius`. */
export function waterDistance(
  map: TerrainMap,
  x: number,
  y: number,
  radius: number,
): number | null {
  return sightWater(map, x, y, radius)?.distance ?? null;
}

/** true se la colonna vede il mare entro `radius`. */
export function seesWater(map: TerrainMap, x: number, y: number, radius: number): boolean {
  return sightWater(map, x, y, radius) !== null;
}

/**
 * Il verso in cui l'acqua e' piu' vicina, o null se non ce n'e' entro `radius`.
 *
 * Serve a orientare cio' che il mare lo deve guardare: un molo che esce dalla
 * parte sbagliata e' un molo dentro la collina.
 */
export function waterFacing(map: TerrainMap, x: number, y: number, radius: number): Facing | null {
  return sightWater(map, x, y, radius)?.facing ?? null;
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
  if (rule === 'waterfront') {
    return sightAnyWater(map, x, y, SITE.coastalRadius) !== null ? null : 'needs-waterfront';
  }
  if (rule === 'open') {
    return openGround(map, x, y, SITE.openSpan, SITE.openMaxStep) ? null : 'needs-open-ground';
  }
  return null;
}
