import { BALANCE } from './balance';

/**
 * La decomposizione del bersaglio di soddisfazione dell'ultimo tick.
 *
 * Gemella di `harvest`, `flows` e `commerce`: derivata dal tick, non accumulata.
 * La somma con segno dei sei termini — `base + civic + retail + ferry + bridges
 * - crowding` — e' il bersaglio verso cui la soddisfazione converge con
 * `satisfaction.inertia`. L'HUD legge da qui il «perche'» del livello di
 * felicita': rifare il conto in interfaccia produrrebbe un secondo listino che
 * divergerebbe alla prima ritaratura.
 */
export interface SatisfactionReport {
  /** La quota fissa: l'umore di una citta' vuota. */
  readonly base: number;
  /** Servizi civici finanziati: `funded * civic * perCivic`. */
  readonly civic: number;
  /** Negozi che servono la domanda: `service * satisfactionPerService`. */
  readonly retail: number;
  /** Linee di traghetto servite: `ferryLines * perFerryLine`. */
  readonly ferry: number;
  /** Ponti fra isole, fino al tetto: `min(maxIslandBridges, islandConnections) * perIslandBridge`. */
  readonly bridges: number;
  /** Penalita' del sovraffollamento, positiva e da sottrarre. */
  readonly crowding: number;
  /** Occupazione delle case, gia' al tetto `maxOccupancy`. */
  readonly occupancy: number;
  /** Il bersaglio: `clamp01(base + civic + retail + ferry + bridges - crowding)`. */
  readonly target: number;
}

/** Un referto a zero: la citta' che non e' ancora partita ha il solo umore di base. */
export const EMPTY_SATISFACTION: SatisfactionReport = {
  base: BALANCE.satisfaction.base,
  civic: 0,
  retail: 0,
  ferry: 0,
  bridges: 0,
  crowding: 0,
  occupancy: 0,
  target: BALANCE.satisfaction.base,
};

/** Gli ingressi del bersaglio, tutti gia' calcolati dal bilancio del tick. */
export interface SatisfactionInputs {
  readonly population: number;
  readonly capacity: number;
  readonly civic: number;
  readonly funded: number;
  readonly service: number;
  readonly ferryLines: number;
  readonly islandConnections: number;
}

/**
 * La decomposizione del bersaglio, con la stessa aritmetica di `tick`.
 *
 * Non fa altro che dare un nome ai sei termini che `nextSatisfaction` calcolava
 * in privato: il tick la consuma, lo stato la conserva, e nessun altro punto del
 * codice rifa il conto.
 */
export function satisfactionReportOf(inputs: SatisfactionInputs): SatisfactionReport {
  const occupancy = inputs.capacity > 0
    ? Math.min(BALANCE.satisfaction.maxOccupancy, inputs.population / inputs.capacity)
    : inputs.population > 0
      ? BALANCE.satisfaction.maxOccupancy
      : 0;
  const crowding = Math.max(0, occupancy - 1) * BALANCE.satisfaction.crowdingPenalty;
  const civic = inputs.funded * inputs.civic * BALANCE.satisfaction.perCivic;
  // I negozi sono la seconda leva sulla soddisfazione, accanto ai servizi
  // civici: una citta' servita e' contenta anche senza un municipio ogni due
  // isolati, ed e' cio' che tiene in piedi una strategia mercantile.
  const retail = inputs.service * BALANCE.commerce.satisfactionPerService;
  // Una linea di traghetto e' la terza leva, e l'unica che nasce da *dove* si e'
  // costruito invece che da quanto: due imbarchi lontani valgono, due vicini no.
  const ferry = inputs.ferryLines * BALANCE.satisfaction.perFerryLine;
  // Un ponte fra isole arriva piu' tardi di un traghetto: pretende due skyline
  // capaci di reggerlo, e per questo il suo contributo e' un poco piu' alto.
  const bridges = Math.min(BALANCE.satisfaction.maxIslandBridges, inputs.islandConnections)
    * BALANCE.satisfaction.perIslandBridge;
  return {
    base: BALANCE.satisfaction.base,
    civic,
    retail,
    ferry,
    bridges,
    crowding,
    occupancy,
    target: clamp01(BALANCE.satisfaction.base + civic + retail + ferry + bridges - crowding),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
