import type { CorridorLeg } from './corridor';
import {
  FACING,
  blockAt,
  blockKey,
  blockRect,
  isPavement,
  lineEnd,
  lineStart,
  nearestLine,
  streetRoleAt,
  type BlockId,
  type BlockRect,
  type Facing,
  type StreetRole,
} from './streetGrid';

/**
 * La rete stradale vista da chi costruisce.
 *
 * E' una facciata sottile sopra `streetGrid.ts`: tiene il seed perche' nessun
 * chiamante debba ripeterlo a ogni domanda, e niente altro. **Non ha stato
 * mutabile**, non alloca strutture per colonna e non va serializzata — la rete
 * si ricalcola dal seed ogni volta che serve, esattamente come il terreno.
 *
 * Non conosce la `TerrainMap` di proposito. Il ritaglio sull'isola avviene a
 * valle, dove il terreno gia' si legge: il Builder rifiuta i lotti non
 * edificabili e la coda di superficie non dipinge le colonne sott'acqua. Il
 * risultato e' lo stesso — la maglia si ferma sulla costa — ma la rete resta
 * una funzione di due coordinate invece di diventare un indice da mantenere.
 */

/** Una colonna di carreggiata con il proprio ruolo gia' risolto. */
export interface PavementCell {
  readonly x: number;
  readonly y: number;
  readonly role: StreetRole;
}

export class StreetNetwork {
  constructor(private readonly seed: number) {}

  roleAt(x: number, y: number): StreetRole {
    return streetRoleAt(this.seed, x, y);
  }

  isPavement(x: number, y: number): boolean {
    return isPavement(this.seed, x, y);
  }

  blockAt(x: number, y: number): BlockId {
    return blockAt(this.seed, x, y);
  }

  /** Centro della carreggiata piu' vicina su un asse: 0 per x, 1 per y. */
  nearestLine(axis: number, v: number): number {
    return nearestLine(this.seed, axis, v);
  }

  blockRect(block: BlockId): BlockRect {
    return blockRect(this.seed, block);
  }

  keyOf(block: BlockId): string {
    return blockKey(block);
  }

  /**
   * Verso cui affaccia un'impronta gia' posata, o null se non tocca strada.
   *
   * Serve a chi non e' passato da `placeLot` — gli edifici materializzati da
   * una partita salvata o dalla fixture di scenario — e che ha comunque bisogno
   * di sapere dove aprire il portale. Est e nord si provano per primi, cosi'
   * che un'impronta in un vicolo fra due carreggiate risponda sempre lo stesso
   * verso.
   */
  facingOf(x: number, y: number, footprint: number): Facing | null {
    for (let d = 0; d < footprint; d++) {
      if (this.isPavement(x + footprint, y + d)) return FACING.east;
    }
    for (let d = 0; d < footprint; d++) {
      if (this.isPavement(x - 1, y + d)) return FACING.west;
    }
    for (let d = 0; d < footprint; d++) {
      if (this.isPavement(x + d, y + footprint)) return FACING.north;
    }
    for (let d = 0; d < footprint; d++) {
      if (this.isPavement(x + d, y - 1)) return FACING.south;
    }
    return null;
  }

  /**
   * Le carreggiate che circondano un isolato, corsie di svolta comprese.
   *
   * Si genera per **isolato** e non per edificio: e' cio' che fa comparire una
   * strada intera e chiusa appena il primo edificio la giustifica, invece di
   * moncherini che si allungano di due celle per volta e che a meta' crescita
   * non si leggono ancora come una strada. Gli isolati adiacenti condividono la
   * carreggiata che li separa, e la coda di superficie la scarta come duplicato.
   */
  pavementRing(block: BlockId): readonly PavementCell[] {
    const rect = this.blockRect(block);
    const west = lineStart(this.seed, 0, block.kx);
    const east = lineEnd(this.seed, 0, block.kx + 1);
    const south = lineStart(this.seed, 1, block.ky);
    const north = lineEnd(this.seed, 1, block.ky + 1);

    const out: PavementCell[] = [];
    for (let y = south; y <= north; y++) {
      for (let x = west; x <= east; x++) {
        if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1) continue;
        out.push({ x, y, role: streetRoleAt(this.seed, x, y) });
      }
    }
    return out;
  }

  /**
   * Il riquadro di colonne che un tratto di raccordo copre, estremi inclusi.
   *
   * E' la sola cosa che traduce il vocabolario di `corridor.ts` — indici di linea
   * — in coordinate del mondo, ed e' separata da `corridorCells` perche' i due
   * lettori chiedono cose diverse: chi **valuta** un percorso scorre migliaia di
   * passi e non deve allocare un array per ciascuno, chi lo **dipinge** ne
   * percorre una manciata e vuole le celle gia' pronte.
   */
  corridorRect(leg: CorridorLeg): BlockRect {
    if (leg.along === 0) {
      return {
        x0: lineStart(this.seed, 0, leg.from),
        x1: lineEnd(this.seed, 0, leg.to),
        y0: lineStart(this.seed, 1, leg.line),
        y1: lineEnd(this.seed, 1, leg.line),
      };
    }
    return {
      x0: lineStart(this.seed, 0, leg.line),
      x1: lineEnd(this.seed, 0, leg.line),
      y0: lineStart(this.seed, 1, leg.from),
      y1: lineEnd(this.seed, 1, leg.to),
    };
  }

  /**
   * Le colonne di carreggiata di un tratto di raccordo, ruolo gia' risolto.
   *
   * Il ruolo lo rilegge `streetRoleAt` colonna per colonna invece di essere
   * dedotto da `leg`: un raccordo che corre su un asse secondario ne attraversa
   * di principali, e agli incroci deve declassarsi come fa l'anello di un
   * isolato. Dedurlo dal tratto darebbe una strada di un colore solo che
   * scavalca la gerarchia proprio dove si vede di piu'.
   */
  corridorCells(leg: CorridorLeg): readonly PavementCell[] {
    const rect = this.corridorRect(leg);
    const out: PavementCell[] = [];
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        out.push({ x, y, role: streetRoleAt(this.seed, x, y) });
      }
    }
    return out;
  }
}
