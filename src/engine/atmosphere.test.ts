import { describe, expect, it } from 'vitest';
import {
  FOG_FLAT_EPSILON,
  FOG_LIFT_SHARPNESS,
  fogAltitudeLift,
  fogAmount,
  fogOpticalDepth,
  fogShape,
  fogVeil,
  type FogModel,
} from './atmosphere';

/** Valori dell'ordine di grandezza di un tema reale dopo la ritaratura della 4.7. */
const FOG: FogModel = {
  density: 0.0004,
  heightBase: 24,
  heightFalloff: 0.005,
  altitudeLift: 0.12,
};

/** Sguardo isometrico: scende verso la scena, quindi la componente z e' negativa. */
const LOOKING_DOWN = -0.5;

describe('nebbia', () => {
  it('la forma e’ la media di un esponenziale sul segmento, simmetrica nei capi', () => {
    // Su un segmento fra le quote a e b la media di exp(-k(z-base)) non dipende
    // da quale dei due sia l'ingresso: e' cio' che permette di usare la stessa
    // riga per un raggio che sale e per uno che scende.
    expect(fogShape(30, 120, FOG)).toBeCloseTo(fogShape(120, 30, FOG), 12);
  });

  it('la forma degenera nel valore puntuale quando il raggio non cambia quota', () => {
    const flat = fogShape(60, 60, FOG);
    expect(flat).toBeCloseTo(Math.exp(-FOG.heightFalloff * (60 - FOG.heightBase)), 12);

    // Continuita' attraverso il ramo del limite: appena oltre la soglia si torna
    // al rapporto esatto, e lo scalino fra i due rami deve restare invisibile,
    // altrimenti si vedrebbe una riga dove il raggio passa per l'orizzontale.
    const span = (FOG_FLAT_EPSILON / FOG.heightFalloff) * 1.01;
    expect(Math.abs(fogShape(60, 60 + span, FOG) - flat)).toBeLessThan(1e-4);
  });

  it('a pari quota il frammento lontano riceve piu’ velo', () => {
    const near = fogAmount(200, 40, LOOKING_DOWN, FOG);
    const far = fogAmount(600, 40, LOOKING_DOWN, FOG);
    expect(far).toBeGreaterThan(near);
  });

  it('a pari distanza il frammento alto riceve meno velo', () => {
    // E' il contratto della fase 4.7, e cio' che il modello precedente non sapeva
    // fare: due volumi che si sovrappongono a schermo alla stessa profondita' di
    // vista si separano perche' i loro raggi hanno attraversato arie diverse.
    const street = fogAmount(500, 18, LOOKING_DOWN, FOG);
    const roof = fogAmount(500, 60, LOOKING_DOWN, FOG);
    const spire = fogAmount(500, 150, LOOKING_DOWN, FOG);
    expect(roof).toBeLessThan(street);
    expect(spire).toBeLessThan(roof);
    // E la separazione deve essere leggibile, non solo esistere. Il confronto e'
    // un rapporto e non una differenza: cosi' il contratto non dipende dalla
    // taratura di `density`, che la 4.7 rimette in discussione.
    expect(spire).toBeLessThan(street * 0.7);
  });

  it('un raggio che scende raccoglie meno velo di uno orizzontale', () => {
    // Guardando dall'alto il cammino passa dove l'aria e' rarefatta, quindi lo
    // spessore ottico e' minore di quello di un raggio che restasse alla quota
    // del frammento. Con viewDirZ a zero il modello ricade nel vecchio.
    const descending = fogOpticalDepth(500, 20, LOOKING_DOWN, FOG);
    const horizontal = fogOpticalDepth(500, 20, 0, FOG);
    expect(descending).toBeLessThan(horizontal);
    expect(horizontal).toBeCloseTo(
      FOG.density * 500 * Math.exp(-FOG.heightFalloff * (20 - FOG.heightBase)),
      12,
    );
  });

  it('il velo resta in 0..1 su tutto il dominio che la scena produce', () => {
    for (const depth of [0, 1, 200, 2000]) {
      for (const height of [0, 16, 80, 200]) {
        for (const viewDirZ of [-1, -0.5, 0, 0.5]) {
          const veil = fogVeil(depth, height, viewDirZ, FOG);
          expect(veil, `${depth}/${height}/${viewDirZ}`).toBeGreaterThanOrEqual(0);
          expect(veil, `${depth}/${height}/${viewDirZ}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('densita’ a zero spegne la nebbia ma non il velo di quota', () => {
    const off: FogModel = { ...FOG, density: 0 };
    expect(fogAmount(1000, 20, LOOKING_DOWN, off)).toBe(0);
    expect(fogVeil(1000, 20, LOOKING_DOWN, off)).toBeGreaterThan(0);
    expect(fogVeil(1000, 20, LOOKING_DOWN, { ...off, altitudeLift: 0 })).toBe(0);
  });

  it('il velo di quota e’ pieno sotto la base e decade piu’ in fretta della nebbia', () => {
    expect(fogAltitudeLift(FOG.heightBase, FOG)).toBeCloseTo(FOG.altitudeLift, 12);
    expect(fogAltitudeLift(0, FOG)).toBeCloseTo(FOG.altitudeLift, 12);
    expect(fogAltitudeLift(200, FOG)).toBeLessThan(fogAltitudeLift(60, FOG));

    // Piu' ripido del profilo di nebbia esattamente di FOG_LIFT_SHARPNESS: se
    // decadesse come la nebbia velerebbe anche i tetti e non separerebbe niente.
    const above = 100;
    expect(fogAltitudeLift(FOG.heightBase + above, FOG)).toBeCloseTo(
      FOG.altitudeLift * Math.exp(-FOG_LIFT_SHARPNESS * FOG.heightFalloff * above),
      12,
    );
  });

  it('i due contributi si compongono per trasmittanza, mai per somma', () => {
    const amount = fogAmount(500, 30, LOOKING_DOWN, FOG);
    const lift = fogAltitudeLift(30, FOG);
    const veil = fogVeil(500, 30, LOOKING_DOWN, FOG);
    expect(veil).toBeCloseTo(1 - (1 - amount) * (1 - lift), 12);
    expect(veil).toBeGreaterThanOrEqual(Math.max(amount, lift));
    expect(veil).toBeLessThanOrEqual(1);
  });
});
