import { describe, expect, it } from 'vitest';
import { LANDFORM, TERRAIN } from './config';
import {
  basinProfile,
  basinWeight,
  capForRadius,
  domeFalloff,
  lakeLevelAt,
  liftSummit,
  moundRise,
  planBasins,
  planLobes,
  planMounds,
  shapeBasins,
  type Basin,
} from './landform';
import { outlineOf, outlineRatio, SHAPE_WARP_LIPSCHITZ } from './outline';
import { shapeFromRegion } from './region';

const SHAPE = shapeFromRegion({ minX: 0, minY: 0, sizeX: 512, sizeY: 512 });
/**
 * Lo stesso rilievo che `HeightField` calcola, e non `maxHeight - oceanFloor`:
 * da quando il tetto assoluto deve contenere anche l'espansione della vetta, i
 * due numeri hanno smesso di coincidere, e qui serve quello vero — e' il fattore
 * con cui una frazione di rilievo diventa una pendenza in voxel per voxel.
 */
const RELIEF = Math.min(
  TERRAIN.maxHeight - TERRAIN.oceanFloor,
  Math.min(SHAPE.radiusX, SHAPE.radiusY) * TERRAIN.maxReliefSlope,
);
const SEEDS = [1337, 7, 42, 99991, 2024, 65535, 314159, 8675309];

/** Pendenza massima di una cupola di raggio `radius` alta `amount` di rilievo. */
function domeSlope(amount: number, radius: number): number {
  return (Math.PI / 2) * amount * RELIEF / radius;
}

describe('landform — carattere della vetta', () => {
  it('sotto il ginocchio non tocca niente, comunque sia il carattere', () => {
    for (const lift of [-0.16, 0, 0.2, 0.36]) {
      for (let e = 0; e <= TERRAIN.summitKnee; e += 0.02) {
        expect(liftSummit(e, lift), `lift ${lift}, e ${e}`).toBeCloseTo(e, 10);
      }
    }
  });

  it('espande verso l’alto, comprime verso il basso, e resta monotona', () => {
    for (const lift of [-0.16, -0.05, 0.2, 0.36]) {
      let previous = -1;
      for (let e = 0; e <= 1; e += 0.01) {
        const value = liftSummit(e, lift);
        expect(value, `lift ${lift}, e ${e}`).toBeGreaterThan(previous);
        previous = value;
        // Il passo del ciclo non cade mai esattamente sul ginocchio, e appena
        // sopra la differenza e' sotto l'errore di arrotondamento: il verso si
        // guarda dove c'e' qualcosa da guardare.
        if (e <= TERRAIN.summitKnee + 0.005) continue;
        // Il verso e' quello che il segno promette: un carattere alpino alza la
        // fascia alta, uno dolce la abbassa. Niente di questo tocca la costa.
        if (lift > 0) expect(value).toBeGreaterThan(e);
        else expect(value).toBeLessThan(e);
      }
    }
  });

  /**
   * Il conto che tiene in piedi il resto: la fascia alta si irripidisce
   * esattamente di `1 + lift`, e nessun'altra. E' quello che permette di dire
   * dove va a finire il margine di Lipschitz senza rimisurare l'isola intera.
   */
  it('il fattore di pendenza vale 1 + lift, e solo sopra il ginocchio', () => {
    const lift = 0.36;
    const step = 1e-4;
    const slopeAt = (e: number): number => (liftSummit(e + step, lift) - liftSummit(e, lift)) / step;
    expect(slopeAt(0.1)).toBeCloseTo(1, 6);
    expect(slopeAt(TERRAIN.summitKnee - 0.05)).toBeCloseTo(1, 6);
    expect(slopeAt(TERRAIN.summitKnee + 0.05)).toBeCloseTo(1 + lift, 6);
    expect(slopeAt(0.95)).toBeCloseTo(1 + lift, 6);
  });
});

describe('landform — cadute', () => {
  it('la cupola vale 1 al centro, 0 dal bordo in poi, e scende sempre', () => {
    expect(domeFalloff(0)).toBe(1);
    expect(domeFalloff(1)).toBe(0);
    expect(domeFalloff(1.5)).toBe(0);

    let previous = 1;
    for (let ratio = 0.05; ratio <= 1; ratio += 0.05) {
      const value = domeFalloff(ratio);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it('il profilo della conca va dal fondo al bordo e non torna indietro', () => {
    expect(basinProfile(0, 10, 16)).toBe(10);
    expect(basinProfile(LANDFORM.basinPlateau, 10, 16)).toBe(10);
    expect(basinProfile(LANDFORM.basinBank, 10, 16)).toBe(16);
    expect(basinProfile(1, 10, 16)).toBe(16);

    let previous = 10;
    for (let ratio = 0; ratio <= 1; ratio += 0.02) {
      const value = basinProfile(ratio, 10, 16);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
  });

  it('il profilo si impone fino al bordo e si spegne sul raccordo', () => {
    expect(basinWeight(0)).toBe(1);
    expect(basinWeight(LANDFORM.basinBank)).toBe(1);
    expect(basinWeight(1)).toBe(0);
    expect(basinWeight((LANDFORM.basinBank + 1) / 2)).toBeGreaterThan(0);
    expect(basinWeight((LANDFORM.basinBank + 1) / 2)).toBeLessThan(1);
  });
});

describe('landform — il budget di pendenza', () => {
  /**
   * E' l'invariante che tiene insieme tutto il modulo: nessun elemento dichiara
   * un'altezza, la ricava dal raggio. Se questo test cade, cade `heightField`.
   */
  it('nessun elemento supera la pendenza che ha dichiarato, su ogni seed', () => {
    for (const seed of SEEDS) {
      for (const lobe of planLobes(seed, SHAPE, RELIEF)) {
        const radius = Math.min(lobe.radiusX, lobe.radiusY);
        expect(domeSlope(lobe.cap, radius)).toBeLessThanOrEqual(LANDFORM.lobeSlope + 1e-9);
      }
      for (const mound of planMounds(seed, SHAPE, RELIEF)) {
        const radius = Math.min(mound.radiusX, mound.radiusY);
        // Il tetto e' quello dichiarato **diviso** il fattore della sagoma: la
        // deformazione moltiplica il gradiente, quindi il fianco vero della
        // cupola deformata torna a valere `moundSlope` esatti.
        expect(domeSlope(mound.amplitude, radius))
          .toBeLessThanOrEqual(LANDFORM.moundSlope / SHAPE_WARP_LIPSCHITZ + 1e-9);
      }
    }
  });

  it('un raggio piu’ piccolo ottiene un tetto piu’ basso, mai piu’ alto', () => {
    expect(capForRadius(40, RELIEF, 0.3)).toBeLessThan(capForRadius(80, RELIEF, 0.3));
    expect(capForRadius(10_000, RELIEF, 0.3)).toBe(1);
  });
});

describe('landform — lobi e rilievi', () => {
  it('sono funzione di (seed, shape): stesso seed, stessa sagoma', () => {
    expect(planLobes(1337, SHAPE, RELIEF)).toEqual(planLobes(1337, SHAPE, RELIEF));
    expect(planMounds(1337, SHAPE, RELIEF)).toEqual(planMounds(1337, SHAPE, RELIEF));
    expect(planLobes(1338, SHAPE, RELIEF)).not.toEqual(planLobes(1337, SHAPE, RELIEF));
  });

  it('la terra di un lobo non arriva al bordo della region', () => {
    for (const seed of SEEDS) {
      for (const lobe of planLobes(seed, SHAPE, RELIEF)) {
        const dx = Math.abs(lobe.centreX - SHAPE.centreX) / SHAPE.radiusX;
        const dy = Math.abs(lobe.centreY - SHAPE.centreY) / SHAPE.radiusY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const radius = Math.max(lobe.radiusX / SHAPE.radiusX, lobe.radiusY / SHAPE.radiusY);
        // Il vincolo e' sulla terra emersa e non sul raggio nominale: oltre
        // meta' raggio la maschera del lobo e' gia' sotto la soglia di
        // emersione, e cio' che sporge da li' in poi e' fondale.
        expect(distance + radius * LANDFORM.lobeEmerged)
          .toBeLessThanOrEqual(LANDFORM.lobeReach + 1e-9);
      }
    }
  });

  it('due cupole accostate fanno una collina sola, non la somma delle due', () => {
    const mounds = [
      { ...outlineOf(0, 0, 40, 40, 0, []), amplitude: 0.2 },
      { ...outlineOf(20, 0, 40, 40, 0, []), amplitude: 0.2 },
    ];
    expect(moundRise(mounds, 10, 0)).toBeLessThanOrEqual(0.2);
    expect(moundRise(mounds, 200, 0)).toBe(0);
  });
});

describe('landform — conche', () => {
  // Senza armoniche e senza allungamento: e' la conca circolare di prima, ed e'
  // quella che rende leggibili le quote qui sotto.
  const basin: Basin = {
    ...outlineOf(100, 100, 60, 60, 0, []),
    floor: 0.4,
    rim: 0.5,
    waterZ: 40,
  };

  it('dentro il fondo l’elevazione e’ quella del fondo, qualunque fosse prima', () => {
    expect(shapeBasins(0.9, [basin], 100, 100)).toBeCloseTo(0.4, 12);
    expect(shapeBasins(0.1, [basin], 100, 100)).toBeCloseTo(0.4, 12);
    // Sul bordo imposto e' quella del bordo, e da li' l'acqua non passa.
    const bank = 100 + 60 * LANDFORM.basinBank;
    expect(shapeBasins(0.2, [basin], bank, 100)).toBeCloseTo(0.5, 12);
  });

  it('fuori dalla conca il terreno resta quello che era', () => {
    expect(shapeBasins(0.9, [basin], 400, 400)).toBe(0.9);
    expect(shapeBasins(0.9, [basin], 161, 100)).toBe(0.9);
  });

  it('il pelo dell’acqua sta dentro la conca, non dentro l’ellisse d’influenza', () => {
    expect(lakeLevelAt([basin], 100, 100)).toBe(40);
    // Sul raccordo il terreno torna quello di prima e puo' ripassare sotto la
    // quota del lago senza essere lago: qui non c'e' acqua.
    const blend = 100 + 60 * (LANDFORM.basinBank + 1) / 2;
    expect(lakeLevelAt([basin], blend, 100)).toBe(0);
    expect(lakeLevelAt([basin], 400, 400)).toBe(0);
  });

  it('un sito piano ospita una conca, un fianco no', () => {
    const flat = planBasins(1337, SHAPE, RELIEF, () => TERRAIN.seaLevel + 24);
    expect(flat.length).toBeGreaterThan(0);
    for (const found of flat) {
      expect(found.rim - found.floor).toBeCloseTo(LANDFORM.basinDrop / RELIEF, 12);
      expect(found.waterZ).toBeGreaterThan(TERRAIN.seaLevel);
    }

    // Un piano inclinato oltre la soglia: la sponda dovrebbe scendere piu' del
    // pendio e il raccordo assorbire un salto che cresce col raggio quanto la
    // fascia che dovrebbe assorbirlo. Non c'e' raggio che chiuda il conto.
    const steep = planBasins(1337, SHAPE, RELIEF, (x) => TERRAIN.seaLevel + 24 + 0.4 * (x - SHAPE.centreX));
    expect(steep).toHaveLength(0);
  });

  it('due conche non si sovrappongono', () => {
    const basins = planBasins(1337, SHAPE, RELIEF, () => TERRAIN.seaLevel + 24);
    for (let i = 0; i < basins.length; i++) {
      for (let j = i + 1; j < basins.length; j++) {
        const dx = basins[j].centreX - basins[i].centreX;
        const dy = basins[j].centreY - basins[i].centreY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // Il criterio e' sui semiassi maggiori, come la regola che lo produce.
        const reach =
          Math.max(basins[i].radiusX, basins[i].radiusY)
          + Math.max(basins[j].radiusX, basins[j].radiusY);
        expect(distance / reach).toBeGreaterThanOrEqual(LANDFORM.basinSpacing - 1e-9);
      }
    }
  });

  /**
   * E' il difetto da cui nasce `outline.ts`: lo specchio e' l'unica superficie
   * dell'isola senza grana ne' terrazzamento, quindi una circonferenza esatta si
   * riconosce da qualunque distanza. Qui si misura il bordo del **lago** — la
   * corona `basinBank`, dove l'acqua finisce — e non l'ellisse d'influenza.
   */
  it('il bordo di una conca non e’ una circonferenza', () => {
    const basins = planBasins(1337, SHAPE, RELIEF, () => TERRAIN.seaLevel + 24);
    expect(basins.length).toBeGreaterThan(0);

    for (const found of basins) {
      let nearest = Infinity;
      let farthest = 0;
      for (let i = 0; i < 180; i++) {
        const angle = (i * Math.PI) / 90;
        // Il raggio del bordo in questa direzione, cercato per bisezione sul
        // raggio normalizzato: e' l'unica lettura che non presuppone la forma.
        let low = 0;
        let high = 4 * Math.max(found.radiusX, found.radiusY);
        for (let step = 0; step < 40; step++) {
          const mid = (low + high) / 2;
          const x = found.centreX + mid * Math.cos(angle);
          const y = found.centreY + mid * Math.sin(angle);
          if (outlineRatio(found, x, y) < LANDFORM.basinBank) low = mid;
          else high = mid;
        }
        nearest = Math.min(nearest, low);
        farthest = Math.max(farthest, low);
      }
      // Un ottavo di scarto fra il raggio piu' lungo e il piu' corto e' il
      // minimo che le sole armoniche garantiscono, allungamento a parte: la
      // media di `w` e' zero, quindi il suo massimo non sta sotto il valore
      // efficace della somma.
      expect(farthest / nearest).toBeGreaterThan(1.15);
    }
  });
});
