import { describe, expect, it } from 'vitest';
import { pickedIndex } from './segmented';

/**
 * Solo la funzione pura della pista.
 *
 * Il resto di `segmented` e' DOM e i test girano in `node`. Qui resta l'unica
 * cosa che puo' sbagliare in silenzio: una pastiglia parcheggiata sulla cella
 * sbagliata si vede solo se qualcuno la guarda, e dice al giocatore che la
 * citta' sta facendo qualcosa che non sta facendo.
 */
describe('pickedIndex', () => {
  it('trova la cella accesa', () => {
    expect(pickedIndex([false, true, false, false])).toBe(1);
    expect(pickedIndex([true, false])).toBe(0);
  });

  it('nessuna accesa non e la prima', () => {
    // E' la pista appena costruita, prima che lo stato le arrivi da fuori.
    // Zero qui dentro accenderebbe «Spring» su una citta' d'estate.
    expect(pickedIndex([false, false, false])).toBe(-1);
    expect(pickedIndex([])).toBe(-1);
  });

  it('la prima accesa vince, se per un istante ce ne fossero due', () => {
    // Le due sorgenti di stato — `aria-pressed` e `data-active` — si scrivono
    // in due giri diversi: fra i due la fila puo' vedersi doppia, e la pastiglia
    // deve stare ferma su una scelta invece di oscillare.
    expect(pickedIndex([false, true, true])).toBe(1);
  });
});
