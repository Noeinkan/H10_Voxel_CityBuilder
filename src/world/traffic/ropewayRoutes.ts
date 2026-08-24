import { TRAFFIC, VEHICLE } from './config';
import { shuttle, type TrafficRoute, type TrafficWaypoint } from './routes';

/**
 * Da una linea di funivia alle cabine che ci viaggiano.
 *
 * **Un file suo e non una riga in `routes.ts`**, per la ragione che divide
 * quel file in due meta': li' si va da *cio' che la citta' ha costruito* a cio'
 * che si muove — un porto, un imbarco, una pista — e la parte difficile e'
 * indovinare la rotta. Qui la rotta e' gia' data: la spezzata della fune l'ha
 * decisa `ropeway/ropewayPlan.ts` quando la linea e' stata tirata, e non c'e'
 * niente da cercare. Sono due mestieri diversi sotto lo stesso tetto.
 *
 * **Due cabine e non una**, ed e' l'unica scelta di questo file. Una funivia con
 * una cabina sola e' una navetta: quello che dice «servizio» e' vederne una
 * partire mentre l'altra arriva, e si ottiene sfasando la seconda di mezzo
 * periodo — gratis, perche' la fase e' gia' un campo della rotta.
 */

/** Una linea ridotta all'osso: dove passa la cabina, e chi e' quella linea. */
export interface RopewayLink {
  readonly id: number;
  /** La corsa della cabina: la fune, gia' scontato l'attacco. */
  readonly path: readonly TrafficWaypoint[];
}

/** Le cabine che le funivie della citta' mettono in moto, in ordine di linea. */
export function planRopewayRoutes(links: readonly RopewayLink[]): readonly TrafficRoute[] {
  const routes: TrafficRoute[] = [];

  for (const link of links) {
    if (link.path.length < 2) continue;
    const heading = headingOf(link.path);
    for (const phase of CABINS) {
      routes.push(shuttle(
        VEHICLE.gondola,
        link.path,
        TRAFFIC.gondolaSpeed,
        TRAFFIC.gondolaDwell,
        heading,
        phase,
      ));
    }
  }

  return routes;
}

/**
 * Le fasi delle cabine di una linea, in frazione di periodo.
 *
 * Mezzo periodo esatto: le due si incrociano in mezzo alla campata, che e' il
 * punto in cui una funivia si guarda.
 */
const CABINS: readonly number[] = [0, 0.5];

/** Verso della corsa: quello del primo tratto, ed e' anche quello della linea. */
function headingOf(path: readonly TrafficWaypoint[]): number {
  return Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x);
}
