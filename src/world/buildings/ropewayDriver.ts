import { ROPEWAY, ROPEWAY_PART } from '../ropeway/config';
import { generateStation } from '../ropeway/generate';
import {
  chooseRopeway,
  type CablePoint,
  type RopewayPlan,
  type RopewayProbe,
  type RopewayResult,
} from '../ropeway/ropewayPlan';
import type { BuildContext } from './buildContext';
import {
  structureFits,
  wholeFootprint,
  writeStructure,
  type StructureSpec,
} from './placeStructure';
import { worldProbe } from './worldProbe';

/**
 * Le funivie: due torri, e fra loro niente.
 *
 * **Il driver piu' corto della cartella**, e la ragione e' l'invariante del
 * dominio: una linea prende suolo in due punti e basta. Non c'e' una passata a
 * tick — nessuna funivia nasce da sola, la chiede il giocatore — non c'e' una
 * rete da tenere connessa e non c'e' niente da far cadere quando un edificio
 * promuove, perche' fra i due capi non c'e' nessun appoggio a cui restare
 * appesi.
 *
 * **Le due torri sono record come tutti gli altri.** E' la stessa mossa di
 * `landmark`, `span` e `aerial`: un campo dice quale generatore disegna lo
 * stamp, e occupazione, collisione, budget di chunk e comparsa a budget restano
 * la macchina che c'e' gia'.
 *
 * **La fune invece non e' un record**, e non e' una dimenticanza: non e' materia
 * (`ropeway/config.ts` spiega perche'), quindi non occupa colonne, non entra in
 * collisione e non compare a budget. Vive qui, in due array che cambiano
 * identita' solo quando una linea nasce: e' cosi' che la vista sa di non dover
 * ricostruire niente, confrontando un riferimento invece di duecento punti.
 */

/** Una linea come la vede chi la disegna: la fune, dove sta. */
export interface RopewayCable {
  readonly id: number;
  readonly path: readonly CablePoint[];
}

/** Una linea come la vede chi ci fa viaggiare qualcosa: la corsa della cabina. */
export interface RopewayRide {
  readonly id: number;
  readonly path: readonly CablePoint[];
}

export class RopewayDriver {
  private readonly probe: RopewayProbe;

  private cableList: readonly RopewayCable[] = [];
  private rideList: readonly RopewayRide[] = [];

  constructor(private readonly ctx: BuildContext) {
    // Le quattro letture della fune, prese dalla sonda canonica invece che
    // riscritte: `top` e' la stessa di `AerialProbe.ground`, e la fune la usa
    // per la stessa cosa — sapere cosa deve scavalcare.
    const world = worldProbe(ctx);
    this.probe = {
      top: world.topAt,
      land: world.isDryLand,
      firm: world.isFirm,
      free: world.isFree,
    };
  }

  /** Le funi esistenti. L'identita' dell'array cambia solo quando ne nasce una. */
  get cables(): readonly RopewayCable[] {
    return this.cableList;
  }

  /** Le corse delle cabine, nello stesso ordine. */
  get rides(): readonly RopewayRide[] {
    return this.rideList;
  }

  get count(): number {
    return this.cableList.length;
  }

  /**
   * La funivia che nascerebbe da questa colonna, o perche' no. **Non scrive.**
   *
   * E' la domanda del cursore, e passa dalla stessa `chooseRopeway` del click:
   * due strade diverse per lo stesso piazzamento finirebbero per accettare due
   * insiemi di luoghi diversi.
   */
  siteAt(x: number, y: number): RopewayResult {
    return chooseRopeway({ ...this.probe, x, y });
  }

  /**
   * Tira una linea dalla colonna cliccata. false se il budget non la regge.
   *
   * E' la porta del giocatore: la convalida economica sta in `game/actions.ts`,
   * quella del luogo qui sotto. Il budget di chunk e' l'ultima parola e si
   * scopre solo qui — e' la stessa sequenza della mensola.
   */
  place(x: number, y: number): boolean {
    const result = this.siteAt(x, y);
    if (!result.ok) return false;
    return this.build(result.plan);
  }

  private build(plan: RopewayPlan): boolean {
    // **Tutte le torri verificate prima che ne sia scritta una.** La seconda che
    // non entra deve fermare anche la prima, quindi qui i due tempi restano due:
    // `structureFits` su tutte, poi `writeStructure` su tutte.
    const specs = plan.stations.map((station) => specOf(station, plan.axis));
    for (const spec of specs) {
      if (!structureFits(this.ctx, spec)) return false;
    }

    // **Le due torri prima della fune.** L'id della linea e' quello della prima:
    // un identificatore proprio sarebbe un secondo contatore da tenere allineato
    // a un registro che gia' ne ha uno.
    let lineId = 0;
    for (const spec of specs) {
      const record = writeStructure(this.ctx, spec);
      if (lineId === 0) lineId = record.id;
    }

    // Array nuovi e non `push`: e' il cambio di identita' a dire alla vista che
    // c'e' qualcosa da ricostruire, e a un `push` non cambierebbe niente.
    this.cableList = [...this.cableList, { id: lineId, path: plan.cable }];
    this.rideList = [...this.rideList, { id: lineId, path: rideOf(plan.cable) }];
    return true;
  }
}

/** Una torre come la vede il protocollo di piazzamento. */
function specOf(station: RopewayPlan['stations'][number], axis: RopewayPlan['axis']): StructureSpec {
  const record = {
    x: station.x,
    y: station.y,
    baseZ: station.baseZ,
    footprint: ROPEWAY.stationSide,
    footprintY: ROPEWAY.stationSide,
    height: station.height,
    // `class` e `level` non ci sono, e il default di `placeStructure` li mette a
    // civico e zero: come per una campata o un impalcato, `tally` la salta e
    // questo campo non entra in nessun istogramma. Civico e' il meno arbitrario
    // dei quattro — una stazione e' spazio pubblico — ma resta inerte.
    ropeway: ROPEWAY_PART.station,
  };
  return {
    record,
    maxDirtyChunks: ROPEWAY.maxDirtyChunks,
    segments: wholeFootprint(record, () => generateStation(station, axis)),
  };
}

/**
 * La corsa della cabina: la fune, scesa di quanto la cabina pende.
 *
 * Si calcola una volta sola alla nascita della linea e non a ogni frame: e' la
 * stessa ragione per cui le rotte di `traffic/` si ricalcolano quando cambia la
 * citta' e non quando passa un frame.
 */
function rideOf(cable: readonly CablePoint[]): readonly CablePoint[] {
  return cable.map((spot) => ({ x: spot.x, y: spot.y, z: spot.z - ROPEWAY.cabinDrop }));
}
