import { describe, expect, it } from 'vitest';
import type { SurfaceCell } from '../../game/surfacePick';
import {
  EYE_HEIGHT,
  MAX_PITCH,
  MIN_PITCH,
  SHADOW_ABOVE,
  SHADOW_BELOW,
  SHADOW_REACH,
  emptyBox,
  eyePoint,
  eyeRefusal,
  shadowBoxAround,
  type BoxExtent,
} from './streetEye';

function cell(over: Partial<SurfaceCell> = {}): SurfaceCell {
  return { x: 40, y: 60, z: 26, hitZ: 26, buildable: true, ...over };
}

const DRY = (): number => 0;

describe('dove si posa l’occhio', () => {
  it('senza terra sotto il raggio non c’e’ niente da guardare', () => {
    expect(eyeRefusal(null, DRY)).toBe('noGround');
  });

  it('l’acqua rifiuta, perche’ la heightmap risponde con il fondale', () => {
    // La colonna esiste ed e' terra a tutti gli effetti: senza questa riga
    // l'occhio finirebbe sotto il pelo dell'acqua invece che sopra la battigia.
    expect(eyeRefusal(cell({ hitZ: 12 }), () => 16)).toBe('underwater');
  });

  it('un tetto sopra l’acqua bassa e’ asciutto: conta la quota colpita', () => {
    // E' il molo, ed e' uno dei posti da cui la citta' si guarda meglio.
    // Guardando la sola colonna di terreno lo si rifiuterebbe.
    expect(eyeRefusal(cell({ z: 12, hitZ: 18 }), () => 16)).toBeNull();
  });

  it('l’occhio sta sopra cio’ che ha colpito, al centro della colonna', () => {
    const [x, y, z] = eyePoint(cell({ x: 40, y: 60, hitZ: 26 }));
    expect(x).toBe(40.5);
    expect(y).toBe(60.5);
    expect(z).toBe(26 + EYE_HEIGHT);
  });

  it('su un tetto si sale: e’ hitZ a decidere, non la colonna di terreno', () => {
    // La stessa colonna di terra a 26 con sopra una torre alta trenta: chi
    // guarda vuole trovarsi sul tetto, non ai piedi dell'edificio.
    const [, , z] = eyePoint(cell({ z: 26, hitZ: 56 }));
    expect(z).toBe(56 + EYE_HEIGHT);
  });
});

describe('l’inclinazione', () => {
  it('attraversa lo zero, che e’ il valore vietato all’isometrica', () => {
    // E' l'intera ragione per cui questo e' un secondo controller: la' l'orizzonte
    // e' vietato perche' `1 / sin(pitch)` esplode, qui e' il punto di partenza.
    expect(MIN_PITCH).toBeLessThan(0);
    expect(MAX_PITCH).toBeGreaterThan(0);
  });

  it('si ferma prima dello zenit e del nadir, dove lookAt degenera', () => {
    expect(Math.abs(MIN_PITCH)).toBeLessThan(Math.PI / 2);
    expect(MAX_PITCH).toBeLessThan(Math.PI / 2);
  });
});

describe('la scatola dell’ombra', () => {
  const wide: BoxExtent = {
    minX: -1000, minY: -1000, minZ: 0,
    maxX: 1000, maxY: 1000, maxZ: 400,
  };

  it('si stringe attorno all’occhio quando il visibile e’ un corridoio', () => {
    const box = shadowBoxAround(wide, [100, 200, 30], emptyBox());
    expect(box.minX).toBe(100 - SHADOW_REACH);
    expect(box.maxX).toBe(100 + SHADOW_REACH);
    expect(box.minY).toBe(200 - SHADOW_REACH);
    expect(box.maxY).toBe(200 + SHADOW_REACH);
    expect(box.minZ).toBe(30 - SHADOW_BELOW);
    expect(box.maxZ).toBe(30 + SHADOW_ABOVE);
  });

  it('puo’ solo rimpicciolire: e’ cio’ che protegge la caduta d’ingresso', () => {
    // `visibleBounds` esclude gia' i chunk ancora in aria. Un'intersezione non
    // li puo' far rientrare; un'unione si'.
    const narrow: BoxExtent = {
      minX: 90, minY: 190, minZ: 25, maxX: 110, maxY: 210, maxZ: 40,
    };
    const box = shadowBoxAround(narrow, [100, 200, 30], emptyBox());
    expect(box.minX).toBeGreaterThanOrEqual(narrow.minX);
    expect(box.minY).toBeGreaterThanOrEqual(narrow.minY);
    expect(box.minZ).toBeGreaterThanOrEqual(narrow.minZ);
    expect(box.maxX).toBeLessThanOrEqual(narrow.maxX);
    expect(box.maxY).toBeLessThanOrEqual(narrow.maxY);
    expect(box.maxZ).toBeLessThanOrEqual(narrow.maxZ);
  });

  it('il texel resta piu’ fine di quello isometrico di oggi', () => {
    // La shadow map e' 2048 e il texel vale `max(spanX, spanY) / size`. Su tutta
    // l'isola visibile da terra farebbe un quarto di voxel; qui deve stare sotto
    // il decimo, altrimenti la scatola non sta risolvendo niente.
    const box = shadowBoxAround(wide, [100, 200, 30], emptyBox());
    const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
    expect(span / 2048).toBeLessThan(0.1);
  });
});
