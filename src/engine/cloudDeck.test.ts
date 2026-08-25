import { describe, expect, it } from 'vitest';
import {
  CLOUD_GRAZING_EPSILON,
  CLOUD_MIN_DENSITY,
  CLOUD_SIDE_SHADE,
  CLOUD_SLICES,
  cloudBase,
  cloudCell,
  cloudCovers,
  cloudCrossing,
  cloudDensity,
  cloudHatch,
  cloudNoise,
  cloudShade,
  cloudSkyDensity,
  cloudSkyTrace,
  cloudSliceHeight,
  cloudTop,
  cloudTrace,
  type CloudDeckModel,
} from './cloudDeck';
import { INSPECT } from './inspect';

const DECK: CloudDeckModel = {
  height: 120,
  thickness: 40,
  amount: 0.8,
  coverage: 0.4,
  cellSize: 6,
  scale: 80,
  speed: 0.01,
};

/** La camera isometrica del progetto: 35 gradi verso il basso, in pianta a 45. */
const LOOKING_DOWN: readonly [number, number, number] = [0.5792, 0.5792, -0.5736];

/**
 * Una quota sotto la base della lastra, dove ce l'ha davanti tutta.
 *
 * Dentro la lastra le fette sotto il frammento non contano, quindi li' la
 * densita' non arriva mai al tetto del tema: misurarla la' direbbe che la
 * manopola e' scollegata quando invece e' solo mezza strada.
 */
const BELOW = cloudBase(DECK) - 20;

/** Lo stesso raggio, a un'altra quota: e' cosi' che si sale dentro la lastra. */
function alongRay(x: number, y: number, z: number, targetZ: number): [number, number] {
  return cloudCrossing(x, y, z, LOOKING_DOWN, targetZ);
}

/**
 * Un punto del piano dove la nuvola e' fitta.
 *
 * Serve perche' i banchi hanno varchi: un punto scelto a mano cade dove capita,
 * e un test ancorato a una coordinata fissa direbbe «non copre niente» ogni
 * volta che la taratura sposta le celle di mezzo periodo.
 */
function densestAlongRow(y: number): { x: number; density: number } {
  let best = { x: 0, density: 0 };
  for (let x = 0; x < 6000; x += DECK.cellSize) {
    const density = cloudDensity(x, y, BELOW, LOOKING_DOWN, 0, DECK);
    if (density > best.density) best = { x, density };
  }
  return best;
}

describe('la lastra', () => {
  it('ha una sommita\' e una base attorno alla propria quota', () => {
    expect(cloudTop(DECK)).toBeCloseTo(DECK.height + DECK.thickness / 2, 12);
    expect(cloudBase(DECK)).toBeCloseTo(DECK.height - DECK.thickness / 2, 12);
    expect(cloudTop(DECK) - cloudBase(DECK)).toBeCloseTo(DECK.thickness, 12);
  });

  it('si campiona su fette interne, dall\'alto verso il basso', () => {
    // Al **centro** del proprio strato e non ai bordi: sui bordi due fette
    // cadrebbero sulla sommita' e sulla base, e la lastra risulterebbe piu'
    // spessa di quanto e'.
    const gap = DECK.thickness / CLOUD_SLICES;
    for (let i = 0; i < CLOUD_SLICES; i++) {
      const z = cloudSliceHeight(i, DECK);
      expect(z).toBeLessThan(cloudTop(DECK));
      expect(z).toBeGreaterThan(cloudBase(DECK));
      expect(z).toBeCloseTo(cloudTop(DECK) - (i + 0.5) * gap, 12);
      if (i > 0) expect(z).toBeLessThan(cloudSliceHeight(i - 1, DECK));
    }
  });

  it('quello che emerge dalla sommita\' ne esce pulito', () => {
    // E' la meta' che fa leggere alta una quota alta: sopra la lastra non c'e'
    // nuvola davanti, per quanto fitto sia il banco li' attorno.
    const above = cloudTop(DECK);
    for (let x = 0; x < 600; x += 6) {
      expect(cloudDensity(x, 300, above, LOOKING_DOWN, 0, DECK)).toBe(0);
      expect(cloudDensity(x, 300, above + 30, LOOKING_DOWN, 0, DECK)).toBe(0);
    }
  });

  it('salendo lungo il raggio si dirada, e non torna mai a coprire', () => {
    // **E' lo spessore, misurato.** Le fette che restano davanti diminuiscono
    // salendo, quindi la stessa torre entra nel banco a scalini invece che di
    // colpo. Deve valere sullo **stesso raggio**: a XY fermo si cambierebbe
    // raggio a ogni quota, e si confronterebbero due nuvole diverse.
    const spot = densestAlongRow(600);
    let previous = cloudDensity(spot.x, 600, BELOW, LOOKING_DOWN, 0, DECK);
    expect(previous).toBeGreaterThan(0);

    for (let z = BELOW + 2; z <= cloudTop(DECK) + 4; z += 2) {
      const [x, y] = alongRay(spot.x, 600, BELOW, z);
      const density = cloudDensity(x, y, z, LOOKING_DOWN, 0, DECK);
      expect(density).toBeLessThanOrEqual(previous + 1e-12);
      previous = density;
    }
    expect(previous).toBe(0);
  });

  it('attraversare la lastra a meta\' costa meno che attraversarla tutta', () => {
    // Se le fette dessero tutte lo stesso campione la lastra non avrebbe corpo:
    // da qualche parte, salire dentro deve togliere davvero qualcosa.
    let thinned = 0;
    for (let x = 0; x < 6000; x += DECK.cellSize) {
      const full = cloudDensity(x, 480, BELOW, LOOKING_DOWN, 0, DECK);
      const [hx, hy] = alongRay(x, 480, BELOW, DECK.height);
      if (cloudDensity(hx, hy, DECK.height, LOOKING_DOWN, 0, DECK) < full) thinned++;
    }
    expect(thinned).toBeGreaterThan(0);
  });
});

describe('le facce della lastra', () => {
  it('la sommita\' e\' piena, il fianco e\' piu\' scuro', () => {
    expect(cloudShade(1)).toBeCloseTo(1, 12);
    expect(cloudShade(0)).toBeCloseTo(CLOUD_SIDE_SHADE, 12);
    expect(cloudShade(0.5)).toBeGreaterThan(cloudShade(0));
    expect(cloudShade(0.5)).toBeLessThan(cloudShade(1));
    // Fuori intervallo non deve schiarire oltre il pieno ne' annerire.
    expect(cloudShade(2)).toBeCloseTo(1, 12);
    expect(cloudShade(-1)).toBeCloseTo(CLOUD_SIDE_SHADE, 12);
  });

  it('c\'e\' davvero un fianco da vedere, non solo una sommita\'', () => {
    // **E' la ragione per cui la lastra si legge come spessa.** Con la camera
    // obliqua le fette cadono su XY diversi, quindi esistono pixel dove la
    // sommita' del banco non c'e' e una fetta piu' bassa si': quelli guardano il
    // fianco del prisma. Senza, lo spessore sarebbe solo una sagoma piu' larga.
    let side = 0;
    let crown = 0;
    for (let x = 0; x < 6000; x += DECK.cellSize) {
      const hit = cloudTrace(x, 600, BELOW, LOOKING_DOWN, 0, DECK);
      if (hit.density <= 0) continue;
      if (hit.face >= 1) crown++;
      else side++;
    }
    expect(crown).toBeGreaterThan(0);
    expect(side).toBeGreaterThan(0);
  });

  it('dove non c\'e\' nuvola non c\'e\' nemmeno una faccia', () => {
    for (let x = 0; x < 3000; x += DECK.cellSize) {
      const hit = cloudTrace(x, 900, BELOW, LOOKING_DOWN, 0, DECK);
      if (hit.density <= 0) expect(hit.face).toBe(0);
      expect(hit.face).toBeGreaterThanOrEqual(0);
      expect(hit.face).toBeLessThanOrEqual(1);
    }
  });
});

describe('la nuvola e\' fatta di celle', () => {
  it('dentro una cella il valore e\' uno solo', () => {
    // E' cio' che rende netto il bordo di un banco: due punti della stessa cella
    // devono dare lo stesso identico valore, non due valori vicini.
    const inside = cloudCell(600, 600, 0, DECK);
    for (const dx of [0.1, 2, 5.9]) {
      for (const dy of [0.1, 2, 5.9]) {
        expect(cloudCell(600 + dx, 600 + dy, 0, DECK)).toBe(inside);
      }
    }
  });

  it('la cella accanto e\' un\'altra cella', () => {
    // Un banco intero di celle identiche sarebbe una macchia, non una nuvola:
    // su una traversata abbastanza lunga i valori devono cambiare.
    const values = new Set<number>();
    for (let i = 0; i < 60; i++) values.add(cloudCell(i * DECK.cellSize, 300, 0, DECK));
    expect(values.size).toBeGreaterThan(5);
  });

  it('una cella o e\' vuota o porta densita\' piena abbastanza da vedersi', () => {
    for (let i = 0; i < 500; i++) {
      const value = cloudCell(i * 7.3, i * 2.1 - 400, 0, DECK);
      expect(value === 0 || value >= CLOUD_MIN_DENSITY).toBe(true);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('la copertura decide quante celle portano nuvola', () => {
    const count = (coverage: number): number => {
      let cells = 0;
      for (let i = 0; i < 900; i++) {
        if (cloudCell(i * DECK.cellSize, 120, 0, { ...DECK, coverage }) > 0) cells++;
      }
      return cells;
    };

    expect(count(0)).toBe(0);
    expect(count(0.2)).toBeLessThan(count(0.6));
    expect(count(1)).toBe(900);
  });
});

describe('rumore dello strato', () => {
  it('sta in 0..1, che e\' cio\' su cui poggia la soglia di copertura', () => {
    for (let i = 0; i < 400; i++) {
      const value = cloudNoise(i * 0.37 - 60, i * 0.11 + 12);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('e\' deterministico e continuo', () => {
    expect(cloudNoise(3.25, -1.5)).toBe(cloudNoise(3.25, -1.5));
    expect(Math.abs(cloudNoise(3.25, -1.5) - cloudNoise(3.26, -1.5))).toBeLessThan(0.1);
  });
});

describe('attraversamento di un piano', () => {
  it('un punto alla quota del piano lo attraversa in se\' stesso', () => {
    const [x, y] = cloudCrossing(120, 80, DECK.height, LOOKING_DOWN, DECK.height);
    expect(x).toBeCloseTo(120, 12);
    expect(y).toBeCloseTo(80, 12);
  });

  it('risale il raggio verso la camera, non verso il basso', () => {
    const [x, y] = cloudCrossing(120, 80, DECK.height - 40, LOOKING_DOWN, DECK.height);
    expect(x).toBeLessThan(120);
    expect(y).toBeLessThan(80);
  });

  it('regge un raggio radente invece di mandare il campione all\'infinito', () => {
    const grazing: readonly [number, number, number] = [1, 0, 0];
    const [x] = cloudCrossing(0, 0, DECK.height - 100, grazing, DECK.height);
    expect(Number.isFinite(x)).toBe(true);
    expect(Math.abs(x)).toBeLessThanOrEqual(100 / CLOUD_GRAZING_EPSILON);
  });

  it('e\' un piano nel mondo: due quote sullo stesso raggio prendono lo stesso punto', () => {
    // Due frammenti che il raggio attraversa uno dietro l'altro incontrano il
    // piano **nello stesso punto**, quindi la stessa cella. E' cio' che fa stare
    // le nuvole ferme nel mondo invece che dipinte sui tetti.
    const deep = DECK.height - 20;
    const shallow = DECK.height + 5;
    const s = (shallow - deep) / LOOKING_DOWN[2];
    const x = 200;
    const y = 140;

    const [cx, cy] = cloudCrossing(x, y, deep, LOOKING_DOWN, DECK.height);
    const [sx, sy] = cloudCrossing(
      x + LOOKING_DOWN[0] * s,
      y + LOOKING_DOWN[1] * s,
      shallow,
      LOOKING_DOWN,
      DECK.height,
    );
    expect(sx).toBeCloseTo(cx, 9);
    expect(sy).toBeCloseTo(cy, 9);
  });
});

describe('la rigatura', () => {
  it('e\' quella delle viste di ispezione, con lo stesso passo', () => {
    // Non e' riuso opportunistico: due retini diversi per dire «attraverso
    // questo si vede» sarebbero due dialetti della stessa lingua.
    expect(cloudHatch(0, 0)).toBe(0);
    expect(cloudHatch(INSPECT.hatch, 0)).toBe(0);
    expect(cloudHatch(INSPECT.hatch / 2, 0)).toBeCloseTo(0.5, 12);
    // Diagonale: conta la somma delle due coordinate, non una sola.
    expect(cloudHatch(3, 4)).toBe(cloudHatch(4, 3));
  });

  it('nella cella piu\' fitta lascia comunque passare qualche pixel', () => {
    // **Ci si deve poter vedere attraverso sempre.** Con `amount` sotto 1 esiste
    // sempre una frazione di riga che la nuvola non prende, e li' si vede la
    // torre dentro il banco.
    const spot = densestAlongRow(600);
    let covered = 0;
    let open = 0;
    for (let px = 0; px < 240; px++) {
      if (cloudCovers(spot.x, 600, BELOW, LOOKING_DOWN, 0, px, px * 0.5, DECK)) covered++;
      else open++;
    }
    expect(covered).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(0);
  });
});

describe('densita\' della nuvola', () => {
  it('lo strato spento non tocca un solo frammento', () => {
    const off: CloudDeckModel = { ...DECK, amount: 0 };
    for (let z = 0; z < 200; z += 7) {
      const hit = cloudTrace(40, 40, z, LOOKING_DOWN, 3, off);
      expect(hit.density).toBe(0);
      expect(hit.face).toBe(0);
    }
  });

  it('sta sotto il tetto del tema e ci si avvicina', () => {
    // `amount` e' un tetto, non un valore raggiunto: al colmo ci arriverebbe
    // solo una cella con il rumore a uno esatto, e il rumore e' a campana. Cio'
    // che conta e' che il banco piu' fitto sia fitto per davvero — un tetto che
    // nessuna cella avvicina sarebbe una manopola scollegata.
    for (let x = 0; x < 3000; x += 6) {
      const density = cloudDensity(x, x * 0.7, BELOW, LOOKING_DOWN, 0, DECK);
      expect(density).toBeGreaterThanOrEqual(0);
      expect(density).toBeLessThanOrEqual(DECK.amount);
    }
    expect(densestAlongRow(600).density).toBeGreaterThan(DECK.amount * 0.7);
  });

  it('la meta\' del cielo e quella dei frammenti sono la stessa nuvola', () => {
    // Le due meta' si toccano sul filo della sagoma dell'isola: se non dessero
    // la stessa lastra nello stesso punto, li' si vedrebbe una cucitura. E non
    // solo la densita': anche la faccia, o il filo cambierebbe tinta.
    const z = 20;
    const sky = cloudSkyTrace(400, 260, z, LOOKING_DOWN, 0, DECK);
    const fragment = cloudTrace(400, 260, z, LOOKING_DOWN, 0, DECK);

    expect(sky.density).toBeCloseTo(fragment.density, 12);
    expect(sky.face).toBeCloseTo(fragment.face, 12);
    expect(cloudSkyDensity(400, 260, z, LOOKING_DOWN, 0, DECK)).toBeCloseTo(sky.density, 12);
  });

  it('il cielo vede la lastra anche guardandola da sopra', () => {
    // Il fondo procedurale parte dal piano vicino della camera, che sta **sopra**
    // tutto: se il cielo si fermasse al primo controllo di quota — quello che
    // fa uscire pulita una cima — la meta' che disegna il vuoto sarebbe vuota.
    const spot = densestAlongRow(600);
    const [ax, ay] = alongRay(spot.x, 600, BELOW, cloudTop(DECK) + 400);
    const sky = cloudSkyTrace(ax, ay, cloudTop(DECK) + 400, LOOKING_DOWN, 0, DECK);
    expect(sky.density).toBeCloseTo(spot.density, 9);
  });

  it('lascia varchi: sotto la lastra non e\' tutto nuvola', () => {
    let open = 0;
    let thick = 0;
    for (let x = 0; x < 4000; x += 6) {
      const density = cloudDensity(x, 300, BELOW, LOOKING_DOWN, 0, DECK);
      if (density <= 0) open++;
      if (density >= DECK.amount * 0.6) thick++;
    }
    expect(open).toBeGreaterThan(0);
    expect(thick).toBeGreaterThan(0);
  });
});
