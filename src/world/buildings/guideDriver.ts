import { BUILDING_CLASS } from '../../sim';
import { hashCoords } from '../rng';
import { AERIAL, AERIAL_PART } from '../aerial/config';
import type { AerialProbe } from '../aerial/deckPlan';
import { generateLift } from '../aerial/generate';
import { planLift } from '../aerial/guideway';
import type { BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount } from './chunkBudget';
import { anchorOf } from './growthQueue';

/**
 * La passata della guida: da un impalcato abitato scende una via a terra.
 *
 * **E' la passata che chiude il gate della 4.9.** Le altre due danno alla citta'
 * i suoi piani in quota e i collegamenti fra loro; questa da' il modo di
 * arrivarci. Finche' non c'era, «si abita sopra la citta'» era vero e «ci si
 * muove fra i livelli» no.
 *
 * **Serve gli impalcati abitati, e solo quelli.** Un montante sotto una mensola
 * vuota sarebbe una scala verso un balcone, e per giunta su una struttura che la
 * crescita dell'ospite puo' far cadere da un momento all'altro: `releaseDecks`
 * lascia cadere le mensole vuote, e si porterebbe dietro il montante. Un
 * impalcato abitato invece non cade piu' — e' la promessa che `markInhabited` fa
 * — quindi e' l'unico posto in cui vale la pena piantare una via permanente.
 *
 * Un file proprio e non un metodo in piu' su `AerialDriver`, come dice
 * `src/world/AGENTS.md`: una passata nuova e' un file nuovo piu' due righe nel
 * costruttore.
 */
export class GuideDriver {
  private cursor = 0;
  private built = 0;

  /** Gli impalcati che hanno gia' la loro via da terra. */
  private readonly served = new Set<number>();

  constructor(
    private readonly ctx: BuildContext,
    private readonly probe: AerialProbe,
    /** Quali impalcati qualcuno abita. La tiene `AerialDriver`, che li segna. */
    private readonly inhabited: (deckId: number) => boolean,
  ) {}

  get lifts(): number {
    return this.built;
  }

  /** true se questo impalcato ha gia' un montante. Serve alle statistiche e ai test. */
  hasLift(deckId: number): boolean {
    return this.served.has(deckId);
  }

  /**
   * Prova a dare una via da terra a un impalcato abitato che non ce l'ha.
   *
   * Un cursore come le altre passate, quindi il costo non cresce con la citta'.
   */
  pass(): void {
    const decks = this.ctx.registry.decks;
    if (decks.length === 0) return;

    const budget = Math.min(AERIAL.guide.examinedPerPass, decks.length);
    let made = 0;

    for (let i = 0; i < budget && made < AERIAL.guide.perPass; i++) {
      const deck = decks[this.cursor % decks.length];
      this.cursor++;
      if (this.served.has(deck.id)) continue;
      if (!this.inhabited(deck.id)) continue;

      if (this.build(deck)) made++;
    }
  }

  /** Toglie un impalcato dai serviti: il suo montante non c'e' piu'. */
  forget(deckId: number): void {
    this.served.delete(deckId);
  }

  /**
   * Il luogo come lo vede un montante: senza cio' che sta al livello che serve.
   *
   * **Un impalcato occupa le proprie colonne**, quindi chiedendo al mondo su
   * cosa si poggia sotto di lui la risposta era *lui stesso*, e il montante
   * risultava alto zero: misurato, cinquantuno impalcati su cinquantaquattro
   * finivano cosi'. Quello che serve e' cio' che c'e' **sotto** il piano da
   * servire, e a saperlo e' solo chi ha il registry in mano — la regola resta
   * pura e riceve un luogo gia' filtrato, come `planDeck` riceve una sonda.
   */
  private probeBelow(ceiling: number): AerialProbe {
    return {
      solid: this.probe.solid,
      ground: (x, y) => {
        const column = this.probe.ground(x, y);
        let z = 0;
        let id = 0;
        for (const record of this.ctx.registry.at(x, y)) {
          if (record.span !== undefined || record.baseZ >= ceiling) continue;
          const above = record.baseZ + record.height;
          if (above > z) {
            z = above;
            id = record.id;
          }
        }
        return {
          ...column,
          top: Math.max(column.height, z),
          carrier: z > column.height ? id : 0,
        };
      },
    };
  }

  private build(deck: BuildingRecord): boolean {
    const result = planLift(this.probeBelow(deck.baseZ), {
      id: deck.id,
      rect: {
        x: deck.x,
        y: deck.y,
        sizeX: deck.footprint,
        sizeY: deck.footprintY ?? deck.footprint,
      },
      baseZ: deck.baseZ,
    });
    if (!result.ok) return false;

    const plan = result.plan;
    const side = AERIAL.guide.side;
    // Lo stesso tetto delle altre strutture in quota, e sul pezzo che si scrive:
    // un montante e' un pezzo solo, quindi qui la misura e' anche la struttura.
    if (dirtyChunkCount(plan.x, plan.y, side, plan.baseZ, plan.baseZ + plan.height, side) >
        AERIAL.maxDirtyChunks) {
      return false;
    }
    // L'impalcato servito e' eccettuato: il montante gli sale addosso fino a
    // toccarlo, ed e' attaccato a lui, non in conflitto con lui.
    if (this.ctx.registry.overlaps(
      plan.x, plan.y, side, plan.baseZ, plan.height, side, [deck.id],
    )) {
      return false;
    }

    const record = this.ctx.registry.add({
      x: plan.x,
      y: plan.y,
      baseZ: plan.baseZ,
      footprint: side,
      footprintY: side,
      height: plan.height,
      // Come per una campata e per un impalcato: `tally` lo salta, e questo campo
      // non entra in nessun istogramma.
      class: BUILDING_CLASS.civic,
      level: 0,
      seed: hashCoords(this.ctx.seed, plan.x, plan.y),
      aerial: AERIAL_PART.lift,
      // Il guinzaglio tira da tutte e due le parti: l'impalcato serve da testata
      // in cima, e cio' su cui il piede poggia non puo' piu' cambiare sagoma.
      supports: plan.carrier === 0 ? [deck.id] : [deck.id, plan.carrier],
    });

    this.ctx.growth.enqueue(record.id, anchorOf(record), generateLift(plan));
    this.served.add(deck.id);
    this.built++;
    return true;
  }
}
