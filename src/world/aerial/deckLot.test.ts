import { describe, expect, it } from 'vitest';
import { deckLot } from './deckLot';
import type { DeckRect } from './deckPlan';

/**
 * Il lotto dentro un impalcato.
 *
 * **E' la regola che ha sbloccato la meta' abitata del gate della 4.9**, e il
 * difetto che chiude si vede solo qui: il riquadro di una mensola comincia dalla
 * parete a cui e' appesa, quindi le sue prime colonne stanno dentro l'ospite —
 * che il registry occupa per intero, per tutta la sua altezza. Un'impronta
 * centrata sul riquadro ci finiva sopra e veniva rifiutata, e il rifiuto in quota
 * non e' definitivo: la stessa colonna tornava a ogni infornata.
 */
describe('deckLot — il lotto dentro un impalcato', () => {
  /** Un impalcato di prova: otto per sei, con la parete lungo il bordo basso. */
  const RECT: DeckRect = { x: 10, y: 20, sizeX: 8, sizeY: 6 };

  /** Le colonne occupate, per chi vuole scrivere l'ostacolo invece di calcolarlo. */
  function freeExcept(taken: readonly (readonly [number, number])[]) {
    const keys = new Set(taken.map(([x, y]) => `${x},${y}`));
    return (x: number, y: number): boolean => !keys.has(`${x},${y}`);
  }

  it('su un impalcato sgombro prende il quadrato piu grande che ci sta', () => {
    const lot = deckLot({ rect: RECT, free: () => true, minSide: 4, maxSide: 8 });

    // Sei e' il lato corto: piu' grande di cosi' non ci sta, e il tetto
    // d'impronta della citta' ordinaria non c'entra finche' non morde.
    expect(lot).not.toBeNull();
    expect(lot?.sizeX).toBe(6);
    expect(lot?.sizeY).toBe(6);
    // Centrato sul riquadro: cio' che avanza resta terrazza da tutte e due le
    // parti invece di ammucchiarsi da un lato solo.
    expect(lot?.x).toBe(11);
    expect(lot?.y).toBe(20);
  });

  it('il tetto d impronta morde prima del lato corto', () => {
    const lot = deckLot({ rect: RECT, free: () => true, minSide: 4, maxSide: 5 });
    expect(lot?.sizeX).toBe(5);
    expect(lot?.sizeY).toBe(5);
  });

  it('la parete dell ospite resta fuori senza una regola per lei', () => {
    // Le due colonne basse sono l'ospite: il registry le occupa per tutta la sua
    // altezza, quindi a questa quota sono prese. Il lotto si sposta in avanti da
    // solo — non c'e' nessun codice che sappia cosa sia un ospite.
    const host = (_x: number, y: number): boolean => y >= 22;
    const lot = deckLot({ rect: RECT, free: host, minSide: 4, maxSide: 8 });

    expect(lot).not.toBeNull();
    expect(lot?.sizeY).toBe(4);
    expect(lot?.y).toBe(22);
    expect(lot?.y).toBeGreaterThanOrEqual(22);
  });

  it('un balcone stretto non e un lotto, ed e giusto che non lo sia', () => {
    // Sporto tre, meno una colonna di parete: restano due, e sotto l'impronta
    // minima non c'e' un edificio ma un palo.
    const thin: DeckRect = { x: 0, y: 0, sizeX: 8, sizeY: 3 };
    const lot = deckLot({
      rect: thin,
      free: (_x, y) => y >= 1,
      minSide: 4,
      maxSide: 8,
    });
    expect(lot).toBeNull();
  });

  it('un ostacolo in mezzo spezza il piano, e vince il pezzo piu grande', () => {
    // Una gamba di percorso piantata sul piano: il quadrato da sei non ci sta
    // piu', e quello da quattro si sceglie fra i due lati.
    const wide: DeckRect = { x: 0, y: 0, sizeX: 12, sizeY: 6 };
    const lot = deckLot({
      rect: wide,
      free: freeExcept([[6, 2], [6, 3], [7, 2], [7, 3]]),
      minSide: 4,
      maxSide: 8,
    });

    expect(lot).not.toBeNull();
    expect(lot?.sizeX).toBe(6);
    // Sta tutto da una parte dell'ostacolo: o a sinistra (x 0) o a destra (x 8),
    // mai a cavallo.
    expect(lot!.x + lot!.sizeX <= 6 || lot!.x >= 8).toBe(true);
  });

  it('a parita di lato vince il piu vicino al centro, e la scelta e stabile', () => {
    // Una corsa lunga e libera: il quadrato da quattro ci sta in nove posizioni,
    // e quella scelta deve essere una funzione del solo luogo — un ordine di
    // visita non dichiarato darebbe due citta' diverse a parita' di seme.
    const run: DeckRect = { x: 0, y: 0, sizeX: 12, sizeY: 4 };
    const first = deckLot({ rect: run, free: () => true, minSide: 4, maxSide: 4 });
    const again = deckLot({ rect: run, free: () => true, minSide: 4, maxSide: 4 });

    expect(first).toEqual(again);
    expect(first?.x).toBe(4);
  });

  it('un impalcato piu piccolo dell impronta minima non ha lotti', () => {
    const tiny: DeckRect = { x: 0, y: 0, sizeX: 3, sizeY: 3 };
    expect(deckLot({ rect: tiny, free: () => true, minSide: 4, maxSide: 8 })).toBeNull();
  });

  it('un piano tutto occupato non ne ha nemmeno uno', () => {
    expect(deckLot({ rect: RECT, free: () => false, minSide: 4, maxSide: 8 })).toBeNull();
  });
});
