import type { AerialColumn, AerialProbe } from './deckPlan';

/**
 * Un luogo finto per le regole della citta' in quota.
 *
 * Esiste perche' le tre regole di questo dominio sono **pure**: il mondo entra
 * come predicato, quindi un test puo' costruirsi il caso esatto che vuole —
 * questa parete, questo vuoto, questa strada — senza generare un'isola e senza
 * accendere una GPU. E' lo stesso patto che `spans/spanPlan.ts` ha con i suoi
 * test, e serve alla stessa cosa: verificare «nessuna struttura sospesa senza
 * appoggi reali» invece di guardarla.
 */
export class TestGround implements AerialProbe {
  private readonly solids = new Set<string>();
  private readonly pavements = new Set<string>();
  private readonly refused = new Set<string>();
  private readonly tops = new Map<string, { z: number; id: number }>();

  constructor(readonly terrain = 0) {}

  /** Riempie un parallelepipedo pieno, e ne registra la cima come appoggio. */
  box(
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
    z0: number,
    z1: number,
    id = 0,
  ): this {
    for (let dy = 0; dy < sizeY; dy++) {
      for (let dx = 0; dx < sizeX; dx++) {
        for (let z = z0; z < z1; z++) this.solids.add(key3(x + dx, y + dy, z));
        const at = key2(x + dx, y + dy);
        const known = this.tops.get(at);
        if (known === undefined || z1 > known.z) this.tops.set(at, { z: z1, id });
      }
    }
    return this;
  }

  /**
   * Una torre a due fasce, la seconda rientrata di `recess` per lato.
   *
   * E' la sagoma che la grammatica produce davvero — «la fascia di base riempie
   * il riquadro, e da li' in su ogni fascia rientra» — ed e' quella su cui una
   * mensola deve sapersi attaccare.
   */
  tower(x: number, y: number, side: number, z0: number, mid: number, top: number, recess = 1, id = 0): this {
    this.box(x, y, side, side, z0, mid, id);
    this.box(x + recess, y + recess, side - 2 * recess, side - 2 * recess, mid, top, id);
    return this;
  }

  pavement(x: number, y: number, sizeX: number, sizeY: number): this {
    for (let dy = 0; dy < sizeY; dy++) {
      for (let dx = 0; dx < sizeX; dx++) this.pavements.add(key2(x + dx, y + dy));
    }
    return this;
  }

  refuse(x: number, y: number): this {
    this.refused.add(key2(x, y));
    return this;
  }

  readonly ground = (x: number, y: number): AerialColumn => {
    const support = this.tops.get(key2(x, y));
    return {
      height: this.terrain,
      top: Math.max(this.terrain, support?.z ?? 0),
      pavement: this.pavements.has(key2(x, y)),
      free: support === undefined,
      firm: !this.refused.has(key2(x, y)),
      carrier: support === undefined ? 0 : support.id,
    };
  };

  readonly solid = (x: number, y: number, z: number): boolean =>
    z < this.terrain || this.solids.has(key3(x, y, z));
}

function key2(x: number, y: number): string {
  return `${x},${y}`;
}

function key3(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}
