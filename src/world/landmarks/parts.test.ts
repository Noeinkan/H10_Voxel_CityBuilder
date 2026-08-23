import { describe, expect, it } from 'vitest';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { SURFACE_KIND } from '../visualBlock';
import { PART, createCanvas, drawPart, type Part } from './parts';

/**
 * Le altre sette primitive le misura gia' il catalogo, disegnandole. Lo scafo ha
 * un test suo perche' e' l'unico la cui maschera **non e' simmetrica allo
 * scambio degli assi**: e' proprio quella asimmetria che `drawHull` deve
 * neutralizzare guardando quale lato e' il maggiore, e senza una misura diretta
 * il difetto si vedrebbe solo come una barca deforme su due versi su quattro.
 */

function hull(w: number, h: number, step: number): Part {
  return {
    kind: PART.hull,
    x: 0,
    y: 0,
    w,
    h,
    z: 0,
    height: 1,
    palette: PALETTE_SLOTS.metalDark,
    surface: SURFACE_KIND.industrial,
    step,
  };
}

/** Larghezza piena di ogni sezione lungo l'asse `x`. */
function widthsAlongX(part: Part): number[] {
  const canvas = createCanvas(part.w, part.h, part.height);
  drawPart(canvas, part);
  const out: number[] = [];
  for (let lx = 0; lx < part.w; lx++) {
    let count = 0;
    for (let ly = 0; ly < part.h; ly++) {
      if (canvas.voxels[lx + canvas.sizeX * ly] !== 0) count++;
    }
    out.push(count);
  }
  return out;
}

function solidCount(part: Part): number {
  const canvas = createCanvas(part.w, part.h, part.height);
  drawPart(canvas, part);
  return canvas.voxels.reduce((total, id) => total + (id === 0 ? 0 : 1), 0);
}

describe('scafo', () => {
  it('rastrema ai due capi e resta piu largo in mezzo', () => {
    const sections = widthsAlongX(hull(6, 3, 1));
    expect(sections).toEqual([1, 3, 3, 3, 3, 1]);
  });

  it('una rastremazione generosa fa una punta, non un buco', () => {
    // `step` oltre la meta' del lato corto chiuderebbe la chiglia se `maxInset`
    // non la trattenesse, e una barca con un buco in mezzo e' due barche.
    const sections = widthsAlongX(hull(7, 3, 4));
    for (const width of sections) expect(width).toBeGreaterThan(0);
    expect(sections[0]).toBe(1);
    expect(sections[3]).toBe(1);
  });

  it('scambiare i due lati non cambia la quantita di scafo', () => {
    // E' l'invariante che `orientPart` pretende: un quarto di giro scambia `w` e
    // `h`, e se la rastremazione seguisse `x` invece dell'asse lungo la barca
    // cambierebbe forma con il verso.
    expect(solidCount(hull(3, 6, 1))).toBe(solidCount(hull(6, 3, 1)));
    expect(solidCount(hull(4, 9, 2))).toBe(solidCount(hull(9, 4, 2)));
  });

  it('non e una scatola: uno scafo pieno starebbe piu largo', () => {
    expect(solidCount(hull(6, 3, 1))).toBeLessThan(6 * 3);
  });
});
