import { BALANCE } from '../../sim';
import { ROPEWAY, ROPEWAY_PART } from '../ropeway/config';
import { generateStation } from '../ropeway/generate';
import {
  chooseRopeway,
  type CablePoint,
  type RopewayPlan,
  type RopewayProbe,
  type RopewayResult,
} from '../ropeway/ropewayPlan';
import type { ReadonlyBuildingRegistry } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { planClearance } from './clearance';
import { clearanceOf, recordsIn, type ClearanceBox, type ClearanceSites } from './clearanceSite';
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
 *
 * **E la traversata ha la precedenza sul tessuto urbano.** Le due rive che si
 * guardano sono anche le due che la citta' costruisce per prime: finche' una
 * piazzola pretendeva suolo vergine, la linea si rifiutava proprio dove serviva.
 * Adesso apre un cantiere — quello di `clearanceSite.ts`, lo stesso dei
 * monumenti e delle arcologie — e le torri compaiono quando il riquadro e'
 * sgombero. La citta' ricresce loro attorno, ed e' il comportamento voluto: la
 * linea la decide il giocatore, il tessuto la circonda.
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

/**
 * Cosa il click ha ottenuto.
 *
 * Tre casi e non un booleano, perche' il giocatore deve poterli distinguere: una
 * linea che c'e', una che comparira' quando il lungomare sara' sgomberato, e un
 * posto che non ne regge nessuna. Dire «Ropeway open» mentre due isolati stanno
 * ancora cadendo sarebbe la stessa bugia che il cursore esiste per non dire.
 */
export type RopewayPlacement = 'raised' | 'clearing' | null;

/** La regola di sgombero della funivia: vedi `BALANCE.gameplay.ropeway.clearing`. */
const CLEARING = BALANCE.gameplay.ropeway.clearing;

/** Una linea che aspetta il proprio riquadro: cosa scrivere, e quanti cantieri mancano. */
interface Raising {
  readonly plan: RopewayPlan;
  readonly specs: readonly StructureSpec[];
  readonly boxes: readonly ClearanceBox[];
  pending: number;
}

export class RopewayDriver {
  private readonly probe: RopewayProbe;

  private cableList: readonly RopewayCable[] = [];
  private rideList: readonly RopewayRide[] = [];

  /**
   * Le linee decise e non ancora scritte. Quasi sempre vuota: una funivia su una
   * riva libera nasce nello stesso istante del click.
   */
  private readonly raising: Raising[] = [];

  constructor(
    private readonly ctx: BuildContext,
    /** Il cantiere, condiviso con i monumenti e le arcologie: ce n'e' uno per Builder. */
    private readonly clearance: ClearanceSites,
  ) {
    // Le letture della fune, prese dalla sonda canonica invece che riscritte:
    // `top` e' la stessa di `AerialProbe.ground`, e la fune la usa per la stessa
    // cosa — sapere cosa deve scavalcare.
    const world = worldProbe(ctx);
    this.probe = {
      top: world.topAt,
      ground: world.heightAt,
      land: world.isDryLand,
      firm: world.isFirm,
      free: world.isFree,
      clearable: (x, y) => this.clearableAt(x, y),
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
   * Tira una linea dalla colonna cliccata. null se il budget non la regge.
   *
   * E' la porta del giocatore: la convalida economica sta in `game/actions.ts`,
   * quella del luogo qui sotto. Il budget di chunk e' l'ultima parola e si
   * scopre solo qui — e' la stessa sequenza della mensola.
   */
  place(x: number, y: number): RopewayPlacement {
    const result = this.siteAt(x, y);
    if (!result.ok) return null;
    return this.raise(result.plan);
  }

  /**
   * true se cio' che prende il suolo di questa colonna puo' cadere per una torre.
   *
   * **E' la stessa regola del cantiere, chiesta una colonna per volta.** Il piano
   * e' puro e non ha un registry: senza questo predicato il cursore direbbe si' a
   * una piazzola che il click poi rifiuta, che e' esattamente il divario che
   * `siteAt` esiste per non aprire.
   *
   * Due cose non cadono oltre a cio' che la regola gia' protegge. Un riquadro
   * **prenotato** da un altro cantiere non ha record da condannare e leggerebbe
   * sgomberabile pur non essendo libero. E una **funivia**: la fune non e' un
   * record, quindi abbattere una torre lascerebbe un cavo appeso al nulla, e il
   * `clearanceKindOf` che la classifica come edificio non ha modo di saperlo.
   */
  private clearableAt(x: number, y: number): boolean {
    const { registry } = this.ctx;
    const records = registry.at(x, y);
    if (records.length === 0) return !registry.isOccupied(x, y);
    if (records.some((record) => record.ropeway !== undefined)) return false;
    return planClearance(
      records.map((record) => clearanceOf(registry, record)),
      CLEARING,
    ).refusal === null;
  }

  private raise(plan: RopewayPlan): RopewayPlacement {
    const specs = plan.stations.map((station) => specOf(station, plan.axis));
    const boxes = plan.stations.map(boxOf);

    // Il cantiere ha l'ultima parola su cosa cade, e deve dire quello che la
    // regola pura ha gia' detto colonna per colonna: se le due risposte
    // divergessero, il preventivo del cursore prometterebbe una linea che il
    // click non tira.
    const doomed: number[] = [];
    let clears = 0;
    for (const box of boxes) {
      if (holdsRopeway(this.ctx.registry, box)) return null;
      const verdict = this.clearance.survey(box, CLEARING);
      if (verdict.refusal !== null) return null;
      clears += verdict.clears;
      for (const record of this.clearance.preview(box, CLEARING).doomed) doomed.push(record.id);
    }

    // **Tutte le torri verificate prima che ne sia scritta una.** La seconda che
    // non entra deve fermare anche la prima, quindi qui i due tempi restano due:
    // `structureFits` su tutte, poi `writeStructure` su tutte. I condannati non
    // sono un ostacolo e restano fuori dalla collisione; cio' che il cantiere
    // *non* porta via — una campata che scavalca la piazzola — la ferma ancora.
    for (const spec of specs) {
      if (!structureFits(this.ctx, { ...spec, exempt: doomed })) return null;
    }

    if (clears === 0) {
      this.write(plan, specs);
      return 'raised';
    }
    return this.open(plan, specs, boxes) ? 'clearing' : null;
  }

  /**
   * Apre i cantieri delle due piazzole e mette la linea in attesa.
   *
   * **Si prenotano entrambi i riquadri, anche quello gia' sgombero.** La citta'
   * continua a crescere mentre il cantiere demolisce: senza la prenotazione, la
   * piazzola libera potrebbe avere un inquilino nuovo quando l'altra e' pronta,
   * e una linea con una torre sola non e' una linea.
   */
  private open(
    plan: RopewayPlan,
    specs: readonly StructureSpec[],
    boxes: readonly ClearanceBox[],
  ): boolean {
    for (const box of boxes) this.ctx.registry.reserveRect(box);

    const job: Raising = { plan, specs, boxes, pending: 0 };
    for (const box of boxes) {
      if (this.clearance.survey(box, CLEARING).clears === 0) continue;
      if (!this.clearance.start(box, CLEARING, () => this.settle(job))) continue;
      job.pending++;
    }

    if (job.pending === 0) {
      for (const box of boxes) this.ctx.registry.releaseRect(box);
      return false;
    }
    this.raising.push(job);
    return true;
  }

  /**
   * L'ultimo cantiere della linea ha finito: si scrive.
   *
   * Le prenotazioni cadono **prima** della verifica, come in `ClearanceSites`, e
   * per la stessa ragione: `overlaps` le legge, e una torre non entrerebbe mai
   * nel riquadro che si e' riservata da sola.
   */
  private settle(job: Raising): void {
    job.pending--;
    if (job.pending > 0) return;

    const index = this.raising.indexOf(job);
    if (index >= 0) this.raising.splice(index, 1);
    for (const box of job.boxes) this.ctx.registry.releaseRect(box);

    for (const spec of job.specs) {
      if (!structureFits(this.ctx, spec)) return;
    }
    this.write(job.plan, job.specs);
  }

  /**
   * Scrive le due torri e fa nascere la fune.
   *
   * L'id della linea e' quello della prima torre: un identificatore proprio
   * sarebbe un secondo contatore da tenere allineato a un registro che gia' ne
   * ha uno.
   */
  private write(plan: RopewayPlan, specs: readonly StructureSpec[]): void {
    let lineId = 0;
    for (const spec of specs) {
      const record = writeStructure(this.ctx, spec);
      if (lineId === 0) lineId = record.id;
    }

    // Array nuovi e non `push`: e' il cambio di identita' a dire alla vista che
    // c'e' qualcosa da ricostruire, e a un `push` non cambierebbe niente.
    this.cableList = [...this.cableList, { id: lineId, path: plan.cable }];
    this.rideList = [...this.rideList, { id: lineId, path: rideOf(plan.cable) }];
  }
}

/** L'ingombro in pianta di una stazione, come lo vede il cantiere. */
function boxOf(station: RopewayPlan['stations'][number]): ClearanceBox {
  return {
    x: station.x,
    y: station.y,
    sizeX: ROPEWAY.stationSide,
    sizeY: ROPEWAY.stationSide,
  };
}

/** true se nel riquadro c'e' un pezzo di un'altra linea: vedi `clearableAt`. */
function holdsRopeway(registry: ReadonlyBuildingRegistry, box: ClearanceBox): boolean {
  return recordsIn(registry, box).some((record) => record.ropeway !== undefined);
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
