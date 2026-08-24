import { BUILDING_CLASS } from '../../sim';
import { GROUND, isDryLand } from '../grading/grade';
import { hashCoords } from '../rng';
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
import { dirtyChunkCount } from './chunkBudget';
import { anchorOf } from './growthQueue';
import { groundKindAt } from './siteWorks';

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
    this.probe = {
      // La prima quota libera sopra **tutto**: il terreno o il tetto di chi ci
      // sta sopra. E' la stessa lettura di `AerialProbe.ground`, e la fune la
      // usa per la stessa cosa — sapere cosa deve scavalcare.
      top: (x, y) => Math.max(ctx.terrain.heightAt(x, y), ctx.registry.supportAt(x, y).z),
      // **Il bioma e non la quota**: una colonna piu' alta del mare puo' essere
      // un fondale appena generato, e una piu' bassa una conca asciutta. E' la
      // stessa ragione per cui `clearDecorColumn` guarda `isDryLand`.
      land: (x, y) => ctx.terrain.has(x, y) && isDryLand(ctx.terrain.biomeAt(x, y)),
      firm: (x, y) => groundKindAt(ctx.terrain, x, y) !== GROUND.refused,
      free: (x, y) => !ctx.registry.isOccupied(x, y),
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
    for (const station of plan.stations) {
      const top = station.baseZ + station.height;
      const count = dirtyChunkCount(
        station.x, station.y, ROPEWAY.stationSide, station.baseZ, top, ROPEWAY.stationSide,
      );
      if (count > ROPEWAY.maxDirtyChunks) return false;
      if (this.ctx.registry.overlaps(
        station.x, station.y, ROPEWAY.stationSide, station.baseZ, station.height, ROPEWAY.stationSide,
      )) {
        return false;
      }
    }

    // **Le due torri prima della fune.** L'id della linea e' quello della prima:
    // un identificatore proprio sarebbe un secondo contatore da tenere allineato
    // a un registro che gia' ne ha uno.
    let lineId = 0;
    for (const station of plan.stations) {
      const record = this.ctx.registry.add({
        x: station.x,
        y: station.y,
        baseZ: station.baseZ,
        footprint: ROPEWAY.stationSide,
        footprintY: ROPEWAY.stationSide,
        height: station.height,
        // Come per una campata o un impalcato: `tally` lo salta, e questo campo
        // non entra in nessun istogramma. Civico e' il meno arbitrario dei
        // quattro — una stazione e' spazio pubblico — ma resta inerte.
        class: BUILDING_CLASS.civic,
        level: 0,
        seed: hashCoords(this.ctx.seed, station.x, station.y),
        ropeway: ROPEWAY_PART.station,
      });
      if (lineId === 0) lineId = record.id;
      this.ctx.growth.enqueue(record.id, anchorOf(record), generateStation(station, plan.axis));
    }

    // Array nuovi e non `push`: e' il cambio di identita' a dire alla vista che
    // c'e' qualcosa da ricostruire, e a un `push` non cambierebbe niente.
    this.cableList = [...this.cableList, { id: lineId, path: plan.cable }];
    this.rideList = [...this.rideList, { id: lineId, path: rideOf(plan.cable) }];
    return true;
  }
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
