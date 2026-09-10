import type { CueId } from './cues';

/**
 * Che suono fa la citta' che cambia da sola.
 *
 * Il click nasce da un bottone e sa gia' di essere successo. La posa, la
 * demolizione e la soglia superata no: succedono nella simulazione, che non
 * conosce ne' l'audio ne' il DOM e non deve conoscerli. Invece di aprire una
 * strada di callback attraverso `src/game/`, questo osservatore guarda i due
 * numeri che la radice ha gia' in mano a ogni frame e deduce cosa e' cambiato.
 *
 * E' una funzione del **salto** fra due letture, non dello stato: per questo e'
 * pura, sta in `node` e si prova senza far suonare niente.
 */

/** I due numeri che bastano a sapere se la citta' ha fatto qualcosa. */
export interface CityPulse {
  readonly buildings: number;
  readonly milestone: number;
}

export class CityCueWatcher {
  private last: CityPulse | null = null;

  /**
   * Legge il polso e dice cosa suonare, o `null` se non e' cambiato niente.
   *
   * **La prima lettura non suona mai.** Serve a fissare la linea di partenza:
   * senza, caricare un salvataggio con duecento edifici sarebbe un salto da zero
   * a duecento, cioe' un tonfo per una citta' che nessuno ha appena costruito.
   *
   * Esce **un** cue per lettura, e la soglia vince sulla posa che l'ha causata:
   * l'edificio che fa scattare il traguardo e' lo stesso evento raccontato due
   * volte, e l'accordo e' il modo piu' informativo di raccontarlo.
   */
  observe(pulse: CityPulse): CueId | null {
    const previous = this.last;
    this.last = pulse;
    if (previous === null) return null;
    if (pulse.milestone > previous.milestone) return 'milestone';
    if (pulse.buildings > previous.buildings) return 'place';
    if (pulse.buildings < previous.buildings) return 'demolish';
    return null;
  }

  /**
   * Dimentica la linea di partenza.
   *
   * Va chiamato quando la citta' viene **sostituita** — partita nuova, salvataggio
   * caricato — perche' li' il salto non racconta niente: e' un mondo che prende
   * il posto di un altro, non un mondo che cresce.
   */
  reset(): void {
    this.last = null;
  }
}
