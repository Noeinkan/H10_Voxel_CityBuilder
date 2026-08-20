import { BALANCE } from './balance';
import { BUILDING_CLASS, type BuildingClass } from './classes';

/**
 * Mandati: il segno che una decisione lascia sulla forma della citta'.
 *
 * Una decisione oggi sposta risorse e finisce li'. Il mandato e' cio' che resta
 * dopo, e agisce dove agiscono le policy — sul profilo locale, quindi su forma
 * e tipologia di cio' che cresce dopo. Il catalogo sta qui, i vettori stanno in
 * `BALANCE.districts.spatialCharter`, perche' `balance.ts` resta l'unico posto
 * con dei numeri.
 *
 * **Permanenti, ma uno solo per famiglia.** Le tre famiglie di decisione tengono
 * uno slot ciascuna: scegliere di nuovo nella stessa famiglia *sostituisce* il
 * mandato precedente invece di sommarcisi. E' quello che rende la citta'
 * portatrice della propria storia senza che i vettori saturino, ed e' anche il
 * motivo per cui qui non c'e' nessuna scadenza a tick: `urbanProfileAt` e' una
 * funzione **spaziale**, e farle leggere `tickCount` significherebbe che lo
 * stesso stato produce edifici diversi a seconda di quando lo si guarda.
 */

/** Le tre famiglie di decisione. Ognuna tiene un solo mandato per volta. */
export type CharterFamily = 'supply' | 'publicSpace' | 'investment';

export type CharterId = keyof typeof BALANCE.districts.spatialCharter;

export interface Charter {
  readonly id: CharterId;
  readonly family: CharterFamily;
  readonly label: string;
  /**
   * Uso urbano su cui il mandato viaggia.
   *
   * Un mandato si sente dove c'e' il suo portante, non ovunque: e' cio' che ne
   * fa un fatto spaziale e non un moltiplicatore globale, esattamente come per
   * le policy in `districts.ts`.
   */
  readonly carrier: BuildingClass;
  /** Frase mostrata al giocatore, come `Policy.spatialEffect`. */
  readonly spatialEffect: string;
}

/**
 * Il catalogo, in ordine fisso e raggruppato per famiglia.
 *
 * L'ordine e' parte del contratto: `withCharter` ricostruisce sempre la lista in
 * questa sequenza, ed e' quello che rende due stati con gli stessi mandati
 * profondamente uguali invece che due permutazioni.
 */
export const CHARTERS: readonly Charter[] = [
  {
    id: 'importedSupply',
    family: 'supply',
    label: 'imported supply',
    carrier: BUILDING_CLASS.commercial,
    spatialEffect: 'Trade-fed blocks grow richer and better connected, and industry thins out.',
  },
  {
    id: 'rationing',
    family: 'supply',
    label: 'rationing',
    carrier: BUILDING_CLASS.residential,
    spatialEffect: 'Housing packs in tighter and plainer, and the neighborhood grows unhappy.',
  },
  {
    id: 'communityGardens',
    family: 'supply',
    label: 'community gardens',
    carrier: BUILDING_CLASS.residential,
    spatialEffect: 'Housing spreads low around green courtyards.',
  },
  {
    id: 'festivalGrounds',
    family: 'publicSpace',
    label: 'festival grounds',
    carrier: BUILDING_CLASS.civic,
    spatialEffect: 'Civic blocks grow livelier and denser.',
  },
  {
    id: 'leasedSquare',
    family: 'publicSpace',
    label: 'leased square',
    carrier: BUILDING_CLASS.commercial,
    spatialEffect: 'Commercial blocks turn wealthier and busier, at a cost to livability.',
  },
  {
    id: 'localShops',
    family: 'investment',
    label: 'local shops',
    carrier: BUILDING_CLASS.commercial,
    spatialEffect: 'Shopfront arcades thicken along the commercial fronts.',
  },
  {
    id: 'soldReserves',
    family: 'investment',
    label: 'sold reserves',
    carrier: BUILDING_CLASS.industrial,
    spatialEffect: 'Industrial yards spread out low and bare.',
  },
  {
    id: 'foodFair',
    family: 'investment',
    label: 'food fair',
    carrier: BUILDING_CLASS.residential,
    spatialEffect: 'Housing grows happier and more walkable.',
  },
];

const BY_ID = new Map<CharterId, Charter>(CHARTERS.map((entry) => [entry.id, entry]));

export function isCharterId(value: string): value is CharterId {
  return BY_ID.has(value as CharterId);
}

export function charterById(id: CharterId): Charter {
  const found = BY_ID.get(id);
  // Il tipo lo garantisce; il throw copre solo un catalogo modificato a meta'.
  if (found === undefined) throw new Error(`unknown charter: ${id}`);
  return found;
}

/** Mandato attivo della famiglia indicata, o null se lo slot e' vuoto. */
export function charterOfFamily(
  active: readonly CharterId[],
  family: CharterFamily,
): CharterId | null {
  for (const id of active) {
    if (charterById(id).family === family) return id;
  }
  return null;
}

/**
 * Accende `id` liberando prima lo slot della sua famiglia.
 *
 * Il risultato e' sempre in ordine di catalogo: la lista si ricostruisce, non
 * si modifica in posto, per la stessa ragione per cui `resolveWeights` riparte
 * dai pesi base invece di dividere.
 */
export function withCharter(
  active: readonly CharterId[],
  id: CharterId,
): readonly CharterId[] {
  const family = charterById(id).family;
  const wanted = new Set(active.filter((current) => charterById(current).family !== family));
  wanted.add(id);
  return canonical(wanted);
}

/** Svuota lo slot di una famiglia. E' l'alternativa «nessuna conseguenza». */
export function withoutFamily(
  active: readonly CharterId[],
  family: CharterFamily,
): readonly CharterId[] {
  return canonical(new Set(active.filter((id) => charterById(id).family !== family)));
}

/**
 * Porta una lista qualunque nella forma canonica: id validi, uno per famiglia,
 * in ordine di catalogo. Serve a rianimare un salvataggio senza fidarsene.
 */
export function canonicalCharters(ids: readonly string[]): readonly CharterId[] {
  let out: readonly CharterId[] = [];
  for (const id of ids) {
    if (!isCharterId(id)) continue;
    out = withCharter(out, id);
  }
  return out;
}

function canonical(wanted: ReadonlySet<CharterId>): readonly CharterId[] {
  const out: CharterId[] = [];
  for (const charter of CHARTERS) {
    if (wanted.has(charter.id)) out.push(charter.id);
  }
  return out;
}
