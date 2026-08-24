import type { SimState } from '../../sim';
import { waterDistance } from '../sites/siteRules';
import { SKYLINE } from '../skyline/config';
import { allowedLevelAt, levelsAboveDeck, type SkylineQuery } from '../skyline/tiers';
import type { BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { BUILDER } from './config';

/**
 * Fin dove una colonna puo' salire, e quanto ha gia' speso salendo.
 *
 * **La desiderabilita' dice *se*, la gerarchia dice *fin dove*.** Sono due
 * domande e quindi due dati: `src/sim/` decide se una colonna merita di
 * crescere, `skyline/` fin dove puo' — da distanza dai poli, dal mare e dal
 * bordo dell'edificato.
 *
 * Vive qui e non dentro una passata sola perche' la usano **entrambe**: la
 * nascita di un edificio e la sua promozione. Averla in due copie e' esattamente
 * il modo in cui una corona bassa in periferia smette di essere bassa da un lato
 * solo.
 */

/**
 * Fin dove questa colonna puo' salire.
 *
 * La regola sta in `skyline/` ed e' pura: qui c'e' solo la raccolta di cio' che
 * quella regola non puo' misurarsi da sola — l'acqua, che la sa la
 * `TerrainMap`; gli edifici attorno, che li sa il registry; l'isolato, che lo
 * sa la rete stradale. E' la stessa divisione di `joinCluster`, dove `cluster.ts`
 * decide e il Builder raccoglie.
 *
 * **Senza stato non c'e' gerarchia.** `materialize` ricostruisce una partita
 * gia' giocata: applicarle il tetto di oggi rimpicciolirebbe edifici che la
 * simulazione conta come sono, ed e' la stessa ragione per cui neanche lo
 * scorrimento sul fronte strada vale per lei.
 */
export function allowedLevel(
  ctx: BuildContext,
  x: number,
  y: number,
  state: SimState | null,
  rise = 0,
): number {
  if (state === null) return BUILDER.maxLevel;
  return levelsAboveDeck(
    Math.min(BUILDER.maxLevel, allowedLevelAt(skylineQueryAt(ctx, x, y, state))),
    rise,
  );
}

/**
 * Cio' che `skyline/` deve sapere di una colonna, raccolto dal mondo.
 *
 * **La raccolta e' una sola, e non e' un dettaglio.** Chi chiede «fin dove puo'
 * salire» e chi chiede «in che fascia sta» stanno facendo due domande alla
 * stessa regola, e ricostruirsi il query in due posti significa che il giorno in
 * cui la regola guadagna un ingrediente uno dei due lo dimentica — con il
 * difetto che si vede come una fascia dichiarata `core` da chi la legge e
 * `middle` da chi ci costruisce.
 */
export function skylineQueryAt(
  ctx: BuildContext,
  x: number,
  y: number,
  state: SimState,
): SkylineQuery {
  const block = ctx.streets.blockAt(x, y);
  return {
    x,
    y,
    // Non i catalizzatori nudi: i poli con la portata geodetica agganciata,
    // cosi' la quota ammessa misura la stessa distanza della desiderabilita'.
    poles: state.reach.polesOf(state.catalysts),
    waterDistance: waterDistance(ctx.terrain, x, y, SKYLINE.coastNear),
    builtNeighbours: ctx.registry.countWithinRadius(x, y, SKYLINE.edgeRadius),
    seed: ctx.seed,
    blockKx: block.kx,
    blockKy: block.ky,
  };
}

/**
 * Di quanto un record sta sopra il terreno della propria colonna.
 *
 * E' la quota gia' spesa, e scala il tetto di livelli: una mensola e' il modo in
 * cui la gerarchia sale, non il modo di aggirarla.
 */
export function riseOf(ctx: BuildContext, record: BuildingRecord): number {
  return Math.max(0, record.baseZ - ctx.terrain.heightAt(record.x, record.y));
}
