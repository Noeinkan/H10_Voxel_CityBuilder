import { describe, expect, it } from 'vitest';
import {
  FOG_FLAT_EPSILON,
  FOG_LIFT_NEAR,
  FOG_LIFT_SHARPNESS,
  fogAltitudeLift,
  fogAmount,
  fogOpticalDepth,
  fogShape,
  fogVeil,
  skyGradientT,
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

/**
 * Una profondita' da camera ortografica.
 *
 * Non e' un numero a caso: `applyTransform` mette l'occhio a `radius * 3 + 100`
 * dal target, quindi in isometrica **ogni** frammento visibile e' lontano
 * centinaia di unita'. E' il fatto su cui poggia la rampa di FOG_LIFT_NEAR.
 */
const FAR = 800;

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
    expect(fogAltitudeLift(FOG.heightBase, FOG, FAR)).toBeCloseTo(FOG.altitudeLift, 12);
    expect(fogAltitudeLift(0, FOG, FAR)).toBeCloseTo(FOG.altitudeLift, 12);
    expect(fogAltitudeLift(200, FOG, FAR)).toBeLessThan(fogAltitudeLift(60, FOG, FAR));

    // Piu' ripido del profilo di nebbia esattamente di FOG_LIFT_SHARPNESS: se
    // decadesse come la nebbia velerebbe anche i tetti e non separerebbe niente.
    const above = 100;
    expect(fogAltitudeLift(FOG.heightBase + above, FOG, FAR)).toBeCloseTo(
      FOG.altitudeLift * Math.exp(-FOG_LIFT_SHARPNESS * FOG.heightFalloff * above),
      12,
    );
  });

  it('i due contributi si compongono per trasmittanza, mai per somma', () => {
    const amount = fogAmount(500, 30, LOOKING_DOWN, FOG);
    const lift = fogAltitudeLift(30, FOG, 500);
    const veil = fogVeil(500, 30, LOOKING_DOWN, FOG);
    expect(veil).toBeCloseTo(1 - (1 - amount) * (1 - lift), 12);
    expect(veil).toBeGreaterThanOrEqual(Math.max(amount, lift));
    expect(veil).toBeLessThanOrEqual(1);
  });
});

/**
 * Cio' che cambia quando l'occhio scende dentro la citta'.
 *
 * Le formule non cambiano — `viewDirZ` e `depth` erano gia' argomenti e non
 * ipotesi — ma smettono di essere valutate con un vettore per fotogramma. Questi
 * test dicono cosa deve venirne fuori, e soprattutto cosa **non** deve cambiare
 * di sopra.
 */
describe('nebbia con l’occhio dentro la scena', () => {
  /**
   * Il segmento occhio → frammento, nella forma che le formule accettano gia'.
   *
   * Con l'occhio dentro la scena la lunghezza del cammino e' la distanza vera e
   * la componente verticale e' quella del **suo** raggio: e' letteralmente cio'
   * che fa il fragment shader quando `isOrthographic` e' falso.
   */
  function fromEye(
    eye: readonly [number, number, number],
    point: readonly [number, number, number],
  ): { path: number; dirZ: number; height: number } {
    const dx = point[0] - eye[0];
    const dy = point[1] - eye[1];
    const dz = point[2] - eye[2];
    const path = Math.hypot(dx, dy, dz);
    return { path, dirZ: dz / path, height: point[2] };
  }

  const EYE: readonly [number, number, number] = [0, 0, 27];

  it('due punti alla stessa distanza ma a quote diverse prendono veli diversi', () => {
    // E' l'affermazione fisica dell'intera fase: il raggio che sale in cima a una
    // torre attraversa aria rarefatta, quello che corre lungo la strada no.
    // Stessa distanza dall'occhio, quindi a separarli puo' essere solo la quota.
    const along = fromEye(EYE, [300, 0, 27]);
    const up = fromEye(EYE, [0, 0, 327]);
    expect(along.path).toBeCloseTo(up.path, 9);

    const veilAlong = fogAmount(along.path, along.height, along.dirZ, FOG);
    const veilUp = fogAmount(up.path, up.height, up.dirZ, FOG);
    expect(veilAlong).toBeGreaterThan(veilUp);
  });

  it('il raggio che sale e quello che scende fra le stesse quote sono simmetrici', () => {
    // `fogShape` e' simmetrica nei capi, e con l'occhio dentro la scena la cosa
    // smette di essere accademica: guardare in su una torre e guardare in giu'
    // dal suo tetto sono lo stesso segmento percorso al contrario.
    const up = fromEye([0, 0, 30], [0, 0, 230]);
    const down = fromEye([0, 0, 230], [0, 0, 30]);
    expect(fogShape(30, 230, FOG)).toBeCloseTo(fogShape(230, 30, FOG), 12);
    expect(fogOpticalDepth(up.path, up.height, up.dirZ, FOG)).toBeCloseTo(
      fogOpticalDepth(down.path, down.height, down.dirZ, FOG),
      12,
    );
  });

  it('il velo di quota si accende sul cammino, invece di stare addosso all’occhio', () => {
    // Senza la rampa il muro a due voxel dal naso prenderebbe lo stesso decimo di
    // velo dell'orizzonte, e da terra sarebbe tutto lo schermo.
    const close = fogAltitudeLift(28, FOG, 1);
    const arm = fogAltitudeLift(28, FOG, FOG_LIFT_NEAR / 2);
    const far = fogAltitudeLift(28, FOG, FOG_LIFT_NEAR * 4);
    expect(close).toBeLessThan(arm);
    expect(arm).toBeLessThan(far);
    expect(close / far).toBeLessThan(0.05);
  });

  it('di sopra la rampa non esiste: la camera ortografica e’ parcheggiata lontano', () => {
    // E' il contratto che protegge la vista che gia' funziona. In isometrica
    // l'occhio sta a `radius * 3 + 100` dalla scena, quindi nessun frammento
    // visibile e' mai dentro FOG_LIFT_NEAR e il termine vale esattamente uno.
    for (const height of [0, 24, 60, 150, 300]) {
      expect(fogAltitudeLift(height, FOG, FAR)).toBeCloseTo(
        FOG.altitudeLift * Math.exp(
          -FOG_LIFT_SHARPNESS * FOG.heightFalloff * Math.max(0, height - FOG.heightBase),
        ),
        12,
      );
    }
  });
});

describe('gradiente del cielo', () => {
  it('con i raggi paralleli e’ l’altezza di schermo, esattamente come prima', () => {
    // Un cielo "fisico" sotto ortografica darebbe una tinta piatta: tutti i raggi
    // hanno la stessa elevazione. Non e' una scorciatoia, e' l'unica cosa giusta.
    for (const y of [0, 0.25, 0.5, 0.75, 1]) {
      expect(skyGradientT(-0.5, y, false)).toBeCloseTo(y * y * (3 - 2 * y), 12);
    }
  });

  it('quando i raggi convergono segue l’elevazione, e l’orizzonte sta a meta’', () => {
    expect(skyGradientT(0, 0.9, true)).toBeCloseTo(0.5, 12);
    expect(skyGradientT(0.5, 0.1, true)).toBeGreaterThan(0.5);
    expect(skyGradientT(-0.5, 0.9, true)).toBeLessThan(0.5);
  });

  it('resta dentro 0..1 anche guardando dritti in alto o in basso', () => {
    // Il guadagno satura prima dello zenit di proposito, quindi il clamp deve
    // reggere: senza, il cielo andrebbe fuori scala proprio dove si alza la testa.
    expect(skyGradientT(1, 0.5, true)).toBeLessThanOrEqual(1);
    expect(skyGradientT(-1, 0.5, true)).toBeGreaterThanOrEqual(0);
  });
});
