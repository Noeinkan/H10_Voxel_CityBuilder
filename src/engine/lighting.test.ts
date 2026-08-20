import { describe, expect, it } from 'vitest';
import {
  FACE_NORMALS,
  faceLight,
  faceLuminance,
  hexToLinear,
  relativeLuminance,
  sunDirection,
  wrapDiffuse,
  type LightingModel,
} from './lighting';

/** Modello di riferimento, vicino ai temi diurni. */
const model: LightingModel = {
  sun: { azimuth: 36, elevation: 48, color: '#ffffff', intensity: 0.86, wrap: 0.34 },
  skyLight: { color: '#ffffff', intensity: 0.5 },
  bounceLight: { color: '#ffffff', intensity: 0.26 },
};

describe('sunDirection', () => {
  it('e’ un versore', () => {
    for (const [azimuth, elevation] of [
      [0, 0],
      [36, 48],
      [180, 90],
      [-90, 12],
    ]) {
      const [x, y, z] = sunDirection(azimuth, elevation);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
    }
  });

  it('azimuth 0 punta a est, 90 a nord, elevazione 90 allo zenit', () => {
    const east = sunDirection(0, 0);
    expect(east[0]).toBeCloseTo(1, 10);
    expect(east[1]).toBeCloseTo(0, 10);

    const north = sunDirection(90, 0);
    expect(north[0]).toBeCloseTo(0, 10);
    expect(north[1]).toBeCloseTo(1, 10);

    const zenith = sunDirection(123, 90);
    expect(zenith[2]).toBeCloseTo(1, 10);
  });
});

describe('wrapDiffuse', () => {
  it('con wrap 0 degenera in un clamp di N.L', () => {
    expect(wrapDiffuse(1, 0)).toBeCloseTo(1, 10);
    expect(wrapDiffuse(0.5, 0)).toBeCloseTo(0.5, 10);
    expect(wrapDiffuse(-0.5, 0)).toBe(0);
  });

  it('con wrap positivo illumina oltre il terminatore', () => {
    // A meta' strada dietro il terminatore, wrap 1 lascia comunque un quarto
    // di luce: e' cio' che toglie il bordo netto.
    expect(wrapDiffuse(-0.5, 1)).toBeCloseTo(0.25, 10);
    expect(wrapDiffuse(-1, 1)).toBe(0);
  });

  it('resta sempre in [0, 1]', () => {
    for (const ndl of [-1, -0.3, 0, 0.4, 1]) {
      for (const wrap of [0, 0.25, 0.5, 1]) {
        const value = wrapDiffuse(ndl, wrap);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('conversione colore', () => {
  it('hexToLinear rispetta gli estremi', () => {
    expect(hexToLinear('#000000')).toEqual([0, 0, 0]);
    const white = hexToLinear('#ffffff');
    for (const channel of white) expect(channel).toBeCloseTo(1, 10);
  });

  it('il grigio medio sRGB finisce sotto 0.25 in lineare', () => {
    // Se questa salta, la conversione ha perso la curva ed e' diventata lineare:
    // tutti i temi verrebbero fuori slavati.
    const [r] = hexToLinear('#808080');
    expect(r).toBeGreaterThan(0.2);
    expect(r).toBeLessThan(0.25);
  });

  it('la luminanza del bianco lineare e’ 1', () => {
    expect(relativeLuminance([1, 1, 1])).toBeCloseTo(1, 10);
  });
});

describe('faceLight', () => {
  it('la faccia rivolta in alto prende tutto il cielo e nulla dal rimbalzo', () => {
    const up = faceLight(
      { ...model, sun: { ...model.sun, intensity: 0 } },
      [0, 0, 1],
    );
    expect(relativeLuminance(up)).toBeCloseTo(0.5, 6);
  });

  it('la faccia rivolta in basso prende solo il rimbalzo', () => {
    const down = faceLight(
      { ...model, sun: { ...model.sun, intensity: 0 } },
      [0, 0, -1],
    );
    expect(relativeLuminance(down)).toBeCloseTo(0.26, 6);
  });

  it('una faccia in ombra resta illuminata: e’ l’ambiente che la tinge', () => {
    // Faccia opposta al sole, quindi diretta nulla. Se qui uscisse zero, le
    // ombre sarebbero nere invece che del colore del cielo.
    const [sx, sy] = sunDirection(model.sun.azimuth, model.sun.elevation);
    const away: [number, number, number] = [-Math.sign(sx), 0, 0];
    expect(sy).toBeGreaterThan(0);
    expect(relativeLuminance(faceLight(model, away))).toBeGreaterThan(0.3);
  });
});

describe('faceLuminance', () => {
  it('restituisce un valore per ciascuna delle sei facce canoniche', () => {
    expect(faceLuminance(model)).toHaveLength(FACE_NORMALS.length);
  });

  it('con un sole abbastanza alto la faccia superiore e’ la piu’ illuminata', () => {
    const luminance = faceLuminance(model);
    expect(Math.max(...luminance)).toBe(luminance[4]);
  });

  it('un sole troppo basso ribalta il primato sulla parete illuminata', () => {
    // Non e' un difetto da correggere ma il vincolo che i temi devono rispettare:
    // sotto una certa elevazione il diorama smette di leggersi dall'alto. Il
    // test dei temi verifica che nessuno ci finisca dentro.
    const low = faceLuminance({ ...model, sun: { ...model.sun, elevation: 15 } });
    expect(Math.max(...low)).not.toBe(low[4]);
  });
});
