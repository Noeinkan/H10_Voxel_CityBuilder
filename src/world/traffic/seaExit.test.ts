import { describe, expect, it } from 'vitest';
import { seaExit } from './seaExit';

/**
 * Dove si esce da un ormeggio.
 *
 * I fixture sono predicati di due righe — «acqua ovunque tranne qui» — ed e'
 * esattamente cio' che permette di provare «la barca gira attorno al molo»
 * senza generare un'isola: la forma della costa la prova `seaLane.test.ts`,
 * qui si prova la scelta del capo lontano.
 */

const OPEN = (): boolean => true;
const ORIGIN = { x: 0, y: 0 };

describe('seaExit', () => {
  it('in mare aperto il capo lontano sta sul guinzaglio, non sul suo angolo', () => {
    // **La griglia e' un quadrato, il guinzaglio un cerchio.** Senza il taglio
    // sulla distanza vera un raggio da dieci darebbe un capo a quattordici, e
    // uno yacht «che non si allontana» uscirebbe dal proprio specchio.
    const spot = seaExit({ from: ORIGIN, water: OPEN, reach: 10, step: 2, clearance: 0 })!;
    expect(spot).not.toBeNull();
    expect(Math.hypot(spot.x, spot.y)).toBeCloseTo(10, 6);
  });

  it('con un verso vince il punto piu avanti, non il piu lontano', () => {
    // La nave da carico non vuole il largo qualunque: vuole *il mare*, e il
    // punto piu' lontano dentro il raggio puo' stare dietro di lei o lungo la
    // costa. La proiezione sul verso e' cio' che sceglie la bocca del porto.
    const spot = seaExit({
      from: ORIGIN,
      water: OPEN,
      reach: 10,
      step: 2,
      clearance: 0,
      toward: [1, 0],
    })!;
    expect([spot.x, spot.y]).toEqual([10, 0]);
  });

  it('cammina attorno a cio che ostruisce invece di fermarsi', () => {
    // **E' la differenza con il sondaggio dritto che sostituisce.** Il muro sta
    // sulla colonna x 4 e si doppia solo passando a nord: una ricerca che guarda
    // dritto dichiara che il largo finisce a due voxel, e la nave non parte piu'.
    const wall = (x: number, y: number): boolean => !(x === 4 && y <= 0);
    const spot = seaExit({
      from: ORIGIN,
      water: wall,
      reach: 10,
      step: 2,
      clearance: 0,
      toward: [1, 0],
    })!;
    expect([spot.x, spot.y]).toEqual([10, 0]);
  });

  it('un ormeggio isolato non ha un capo lontano', () => {
    // Il bacino scavato dentro l'impronta prima che il distretto gli apra una
    // bocca: c'e' acqua sotto la barca e nient'altro. `null` e' la risposta, e
    // chi chiama ne fa un mezzo ormeggiato — difetto visibile e onesto.
    const puddle = (x: number, y: number): boolean => x === 0 && y === 0;
    expect(seaExit({ from: ORIGIN, water: puddle, reach: 10, step: 2, clearance: 0 })).toBeNull();
  });

  it('lo stesso specchio da sempre la stessa risposta', () => {
    // Le rotte finiscono in un pool di mesh: due partite identiche devono dare
    // le stesse barche negli stessi punti. Su uno specchio simmetrico il
    // punteggio pareggia spesso, e a decidere resta l'ordine di visita.
    const query = { from: ORIGIN, water: OPEN, reach: 12, step: 2, clearance: 0 } as const;
    expect(seaExit(query)).toEqual(seaExit(query));
  });
});
