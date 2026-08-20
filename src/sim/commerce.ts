import { BALANCE } from './balance';

/**
 * Il commercio interno: la seconda catena economica della citta'.
 *
 * L'industria consuma lavoratori e produce materiali e cibo. Il commercio
 * consuma lavoratori **e materiali** e produce fondi e soddisfazione. Le due
 * catene pescano dallo stesso bacino di manodopera e si passano i materiali,
 * quindi non sono due bilanci paralleli ma due estremi dello stesso: una citta'
 * tutta fabbriche accumula materiali che nessuno vende, una citta' tutta negozi
 * ha scaffali vuoti e commessi disoccupati.
 *
 * Il modulo e' puro e senza stato, come `trade.ts`: entra un riassunto
 * numerico del tick, esce cosa il commercio ha fatto. Non conosce ne' il campo
 * ne' gli edifici — solo capacita', domanda e scorte.
 */

export interface CommerceReport {
  /** Clienti che la popolazione porta ai negozi in questo tick. */
  readonly demand: number;
  /** Clienti che gli edifici commerciali potrebbero servire a organico e scorte pieni. */
  readonly capacity: number;
  /** Clienti effettivamente serviti. */
  readonly served: number;
  /** `served / capacity`, ovvero quanto sono pieni i negozi. In [0, 1]. */
  readonly occupancy: number;
  /** `served / demand`, ovvero quanta citta' trova cio' che cerca. In [0, 1]. */
  readonly service: number;
  /** Fondi incassati in questo tick. */
  readonly revenue: number;
  /** Materiali bruciati come merce venduta. */
  readonly goods: number;
}

export const EMPTY_COMMERCE: CommerceReport = {
  demand: 0,
  capacity: 0,
  served: 0,
  occupancy: 0,
  service: 0,
  revenue: 0,
  goods: 0,
};

export interface CommerceInputs {
  /** Edifici commerciali efficaci, quote di uso misto comprese. */
  readonly commercial: number;
  readonly population: number;
  /** Quota di organico raggiunta, condivisa con l'industria. In [0, 1]. */
  readonly staffing: number;
  /** Materiali disponibili in questo tick, produzione industriale inclusa. */
  readonly materials: number;
  /** Capacita' di vendita di un edificio commerciale pieno, dai pesi risolti. */
  readonly capacityPerBuilding: number;
}

/**
 * Un giro di commercio interno.
 *
 * Tre strozzature in fila, ognuna un `min` e mai una sottrazione secca: la
 * domanda dei residenti, i banchi disponibili con l'organico che c'e', e la
 * merce che il magazzino riesce a fornire. Cio' che manca diventa un rapporto
 * in [0, 1] che degrada il risultato, esattamente come `fed` e `funded` nel
 * resto del bilancio.
 */
export function resolveCommerce(inputs: CommerceInputs): CommerceReport {
  const demand = inputs.population * BALANCE.commerce.demandPerResident;
  const capacity = inputs.commercial * inputs.capacityPerBuilding;
  if (demand <= 0 || capacity <= 0) {
    return { ...EMPTY_COMMERCE, demand, capacity };
  }

  const staffed = Math.min(demand, capacity * inputs.staffing);

  // La merce e' il legame con l'industria: senza materiali i banchi restano
  // aperti ma vuoti, e il commercio smette di incassare invece di indebitarsi.
  const goodsWanted = staffed * BALANCE.commerce.goodsPerCustomer;
  const goods = Math.min(goodsWanted, Math.max(0, inputs.materials));
  const served = goodsWanted > 0 ? staffed * (goods / goodsWanted) : staffed;

  return {
    demand,
    capacity,
    served,
    occupancy: Math.min(1, served / capacity),
    service: Math.min(1, served / demand),
    revenue: served * BALANCE.commerce.revenuePerCustomer,
    goods,
  };
}
