import { describe, expect, it } from 'vitest';
import {
  CLOUD_GRAZING_EPSILON,
  cloudCrossing,
  cloudDeckVeil,
  cloudDepth,
  cloudMass,
  cloudNoise,
  type CloudDeckModel,
} from './cloudDeck';

const DECK: CloudDeckModel = {
  height: 70,
  thickness: 12,
  amount: 0.85,
  coverage: 0.45,
  scale: 90,
  speed: 0.01,
};

/** La camera isometrica del progetto: 35 gradi verso il basso, in pianta a 45. */
const LOOKING_DOWN: readonly [number, number, number] = [0.5792, 0.5792, -0.5736];

describe('spessore dello strato', () => {
  it('non vela chi gli sta sopra e vela per intero chi gli sta sotto', () => {
    expect(cloudDepth(DECK.height + DECK.thickness, DECK)).toBe(0);
    expect(cloudDepth(DECK.height - DECK.thickness, DECK)).toBe(1);
    // A meta' spessore ne resta meta' sopra: e' il punto di simmetria.
    expect(cloudDepth(DECK.height, DECK)).toBeCloseTo(0.5, 12);
  });

  it('cresce scendendo, senza scatti', () => {
    let previous = 0;
    for (let z = DECK.height + 10; z >= DECK.height - 10; z -= 0.5) {
      const depth = cloudDepth(z, DECK);
      expect(depth).toBeGreaterThanOrEqual(previous);
      previous = depth;
    }
    expect(previous).toBe(1);
  });
});

describe('copertura', () => {
  it('apre i varchi: piu\' copertura, piu\' rumore che fa nuvola', () => {
    const noise = 0.5;
    expect(cloudMass(noise, { ...DECK, coverage: 0.2 })).toBeLessThan(
      cloudMass(noise, { ...DECK, coverage: 0.7 }),
    );
  });

  it('resta un coperchio solo se glielo si chiede', () => {
    // Copertura piena: nessun varco, ed e' il caso che il modello esiste per
    // non prendere di default — i livelli inferiori non si intravedono piu'.
    expect(cloudMass(0.01, { ...DECK, coverage: 1 })).toBe(1);
    expect(cloudMass(0.99, { ...DECK, coverage: 0 })).toBe(0);
  });
});

describe('rumore dello strato', () => {
  it('sta in 0..1, che e\' cio\' su cui poggia il tetto del velo', () => {
    for (let i = 0; i < 400; i++) {
      const value = cloudNoise(i * 0.37 - 60, i * 0.11 + 12);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('e\' deterministico e continuo', () => {
    expect(cloudNoise(3.25, -1.5)).toBe(cloudNoise(3.25, -1.5));
    const step = Math.abs(cloudNoise(3.25, -1.5) - cloudNoise(3.26, -1.5));
    expect(step).toBeLessThan(0.1);
  });
});

describe('attraversamento del piano', () => {
  it('un frammento alla quota dello strato lo attraversa in se\' stesso', () => {
    const [x, y] = cloudCrossing(120, 80, DECK.height, LOOKING_DOWN, DECK);
    expect(x).toBeCloseTo(120, 12);
    expect(y).toBeCloseTo(80, 12);
  });

  it('risale il raggio verso la camera, non verso il basso', () => {
    // Sotto lo strato si risale: il punto di attraversamento arretra lungo la
    // direzione di sguardo, cioe' verso da dove si guarda.
    const [x, y] = cloudCrossing(120, 80, DECK.height - 40, LOOKING_DOWN, DECK);
    expect(x).toBeLessThan(120);
    expect(y).toBeLessThan(80);
  });

  it('regge un raggio radente invece di mandare il campione all\'infinito', () => {
    const grazing: readonly [number, number, number] = [1, 0, 0];
    const [x] = cloudCrossing(0, 0, DECK.height - 100, grazing, DECK);
    expect(Number.isFinite(x)).toBe(true);
    expect(Math.abs(x)).toBeLessThanOrEqual(100 / CLOUD_GRAZING_EPSILON);
  });
});

describe('velo dello strato', () => {
  it('lo strato spento non tocca un solo frammento', () => {
    const off: CloudDeckModel = { ...DECK, amount: 0 };
    for (let z = 0; z < 200; z += 7) {
      expect(cloudDeckVeil(40, 40, z, LOOKING_DOWN, 3, off)).toBe(0);
    }
  });

  it('non vela niente sopra lo strato, a qualunque rumore', () => {
    for (let x = 0; x < 500; x += 13) {
      expect(cloudDeckVeil(x, x * 2, DECK.height + DECK.thickness, LOOKING_DOWN, 0, DECK)).toBe(0);
    }
  });

  it('sotto lo strato non supera mai il velo di picco', () => {
    let seen = 0;
    for (let x = 0; x < 2000; x += 11) {
      const veil = cloudDeckVeil(x, x * 0.7, 20, LOOKING_DOWN, 0, DECK);
      expect(veil).toBeLessThanOrEqual(DECK.amount);
      expect(veil).toBeGreaterThanOrEqual(0);
      seen = Math.max(seen, veil);
    }
    // E ci arriva davvero: un velo che non raggiunge mai il suo picco sarebbe
    // uno strato tarato per non vedersi.
    expect(seen).toBeCloseTo(DECK.amount, 6);
  });

  it('lascia varchi: sotto lo strato non e\' velato tutto', () => {
    let open = 0;
    let thick = 0;
    for (let x = 0; x < 4000; x += 7) {
      const veil = cloudDeckVeil(x, 300, 20, LOOKING_DOWN, 0, DECK);
      if (veil <= 0) open++;
      if (veil >= DECK.amount * 0.99) thick++;
    }
    // I livelli inferiori si intravedono nei varchi **e** spariscono nelle
    // macchie: e' il pavimento di nuvole, non una velatura uniforme.
    expect(open).toBeGreaterThan(0);
    expect(thick).toBeGreaterThan(0);
  });

  it('e\' un piano nel mondo: due quote sullo stesso raggio prendono la stessa nuvola', () => {
    // Due frammenti che il raggio attraversa uno dietro l'altro incontrano lo
    // strato **nello stesso punto**, quindi la stessa macchia. E' cio' che fa
    // stare le nuvole ferme nel mondo invece che dipinte sui tetti.
    const deep = 20;
    const shallow = 45;
    const s = (shallow - deep) / -LOOKING_DOWN[2];
    const x = 200;
    const y = 140;

    const below = cloudDeckVeil(x, y, deep, LOOKING_DOWN, 0, DECK);
    const above = cloudDeckVeil(
      x + LOOKING_DOWN[0] * s,
      y + LOOKING_DOWN[1] * s,
      shallow,
      LOOKING_DOWN,
      0,
      DECK,
    );

    // Stessa macchia, quindi stessa copertura: a separarli resta solo la quota,
    // e sotto la base dello strato non separa piu' niente.
    expect(above).toBeCloseTo(below, 10);
  });
});
