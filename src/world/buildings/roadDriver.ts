import { ROADS } from '../roads/config';
import { RoadNetwork } from '../roads/RoadNetwork';
import type { RoadPole } from '../roads/network';
import { GROUND } from '../grading/grade';
import { FACING, type Facing } from '../streets/streetGrid';
import { groundKindAt } from './siteWorks';
import type { BuildContext } from './buildContext';

/**
 * La passata del tracciato: tiene la rete organica e la manda in coda.
 *
 * **Non decide niente sulla forma della strada** — quella la decide
 * `src/world/roads/`, che e' puro e non conosce il mondo — e non scrive nessun
 * voxel da se': tutto passa dalla coda di superficie, come ogni altro pezzo di
 * suolo pubblico. Quello che fa e' tenere insieme le tre cose che il dominio
 * puro non puo' avere: le sonde sul terreno, il momento in cui la rete va
 * rifatta, e il budget con cui compare.
 *
 * **Rifa' tutto quando i poli cambiano, e quasi mai altrimenti.** `update`
 * confronta una firma e risponde false dieci volte al secondo senza fare
 * niente; quando risponde true, l'intera rete rientra in coda. Ripassare su
 * colonne gia' dipinte non costa un voxel — `surfaceQueue` scarta per priorita'
 * cio' che e' gia' a posto — e in cambio un tratto promosso a tronco si allarga
 * da solo senza che nessuno tenga il conto di cos'era prima.
 */
export class RoadDriver {
  private readonly roads: RoadNetwork;

  constructor(private readonly ctx: BuildContext) {
    this.roads = new RoadNetwork(ctx.terrain, (x, y) => ctx.registry.isOccupied(x, y), ctx.seed);
  }

  /** La rete, per chi deve sapere dov'e' la strada: il Builder che ordina i siti. */
  get network(): RoadNetwork {
    return this.roads;
  }

  /** Colonne di carreggiata che il tracciato tiene, viadotti compresi. */
  get paved(): number {
    return this.roads.surface.length + this.roads.viaducts.length;
  }

  // --- La sonda per chi costruisce (`RoadsideProbe`) --------------------------
  //
  // Sono tre inoltri di una riga, e stanno qui invece che dentro chi le chiama
  // per una ragione sola: chi costruisce non deve poter arrivare alla rete. Con
  // il `RoadNetwork` in mano, la ricerca del lotto e la promozione potrebbero
  // leggere il piano, i poli e la gerarchia — e la prima volta che a qualcuno
  // servisse, lo farebbe. Cosi' invece la superficie condivisa e' esattamente
  // quella dichiarata dall'interfaccia.

  /** true se un'impronta ancorata qui ha un affaccio su strada. */
  frontage(x: number, y: number, footprint: number): boolean {
    return this.roads.touchesRoad(x, y, footprint);
  }

  /** true se la carreggiata — o un impalcato — tiene questa colonna. */
  carries(x: number, y: number): boolean {
    return this.roads.hasRoad(x, y);
  }

  /** Quante volte il tracciato e' cambiato, per chi ne memorizza le risposte. */
  get revision(): number {
    return this.roads.revision;
  }

  onTick(poles: readonly RoadPole[]): void {
    if (!this.roads.update(poles)) return;
    this.enqueueSurface();
    this.enqueueViaducts();
  }

  /**
   * Tira il capillare verso un edificio appena nato, se ne serve uno.
   *
   * Sta qui e non in `onTick` perche' la domanda e' per edificio e non per
   * tick: un lotto lontano dalla rete se la tira dietro nell'istante in cui
   * nasce, cosi' che il lotto **dopo** possa gia' affacciarsi su di lei. Con una
   * passata a cadenza, ogni infornata costruirebbe al buio e il fronte strada
   * arriverebbe sempre un giro in ritardo.
   */
  connect(x: number, y: number, footprint: number, facing: Facing | undefined): void {
    const door = this.doorstep(x, y, footprint, facing);
    for (const cell of this.roads.connect(door.x, door.y)) {
      this.ctx.surface.enqueue({
        x: cell.x,
        y: cell.y,
        palette: ROADS.rankPalette[cell.rank],
        priority: ROADS.rankPriority[cell.rank],
        deck: cell.level,
      });
    }
  }

  /**
   * La colonna appena fuori dal fronte, a meta' del lato: il portone.
   *
   * **Il capillare parte da li' e non dall'ancora del lotto**, che sta *dentro*
   * l'edificio. Partendo da dentro, le prime colonne del vicolo cadevano sotto
   * la casa che le aveva chieste — e una colonna occupata non si asfalta mai,
   * perche' `SurfaceQueue.canPaint` la rifiuta: la strada esisteva nei dati e
   * non a schermo. Misurato su un'isola cresciuta, erano trecentoundici vicoli
   * su seicentotrentanove.
   *
   * **Fuori dal fronte deve esserci terra asciutta, non la battigia.** Una casa
   * sulla riva guarda l'acqua, e un capillare che parta di li' cammina sul
   * bassofondo: la sonda del tracciato prende come piano il **pelo dell'acqua**,
   * quindi il vicolo si posa alla quota del mare e la colonna accanto resta il
   * fondale. Ne usciva un salto da sedici voxel fra due colonne contigue di
   * carreggiata — un gradino, non una rampa, e lo diceva gia' un test. Sulla
   * riva si torna all'ancora, che e' il comportamento di prima e sbaglia al piu'
   * quel lotto.
   */
  private doorstep(
    x: number,
    y: number,
    footprint: number,
    facing: Facing | undefined,
  ): { readonly x: number; readonly y: number } {
    if (facing === undefined) return { x, y };
    const half = (footprint - 1) >> 1;
    const door = facing === FACING.east
      ? { x: x + footprint, y: y + half }
      : facing === FACING.west
        ? { x: x - 1, y: y + half }
        : facing === FACING.north
          ? { x: x + half, y: y + footprint }
          : { x: x + half, y: y - 1 };
    const kind = groundKindAt(this.ctx.terrain, door.x, door.y);
    if (kind === GROUND.refused || kind === GROUND.shore) return { x, y };
    return door;
  }

  /**
   * La carreggiata a terra.
   *
   * La quota di progetto e' quella del nodo d'asse, non del terreno sotto la
   * colonna larga: e' cio' che tiene piano il nastro di un tronco da sei voxel
   * quando lo si posa di traverso su un fianco, invece di farlo ondeggiare di
   * un voxel per colonna. Il muro sotto lo costruisce la coda, dove serve.
   */
  private enqueueSurface(): void {
    for (const cell of this.roads.surface) {
      const ground = this.ctx.terrain.heightAt(cell.x, cell.y);
      this.ctx.surface.enqueue({
        x: cell.x,
        y: cell.y,
        palette: ROADS.rankPalette[cell.rank],
        priority: ROADS.rankPriority[cell.rank],
        deck: cell.level,
        wall: cell.level > ground ? ROADS.viaductPier : undefined,
      });
    }
  }

  /**
   * Le campate.
   *
   * Ogni colonna della campata porta l'impalcato alla stessa quota, e solo le
   * pile scendono: e' la differenza fra un ponte e un terrapieno, e sta tutta
   * nel `wall` che c'e' su una colonna su otto e non sulle altre.
   */
  private enqueueViaducts(): void {
    for (const column of this.roads.viaducts) {
      this.ctx.surface.enqueue({
        x: column.x,
        y: column.y,
        palette: ROADS.viaductDeck,
        priority: ROADS.rankPriority[column.rank],
        deck: column.level,
        airborne: true,
        wall: column.pier ? ROADS.viaductPier : undefined,
        coping: ROADS.viaductPier,
      });
    }
  }
}
